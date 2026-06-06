/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';

/** Cache TTL for `listModels` responses. Keeps the model picker snappy across reloads. */
const MODELS_CACHE_TTL_MS = 5 * 60 * 1000;
/** Hard timeout for the entire `getAvailableModels` aggregation. */
const MODELS_FETCH_BUDGET_MS = 1500;

interface CachedModels {
	readonly expiresAt: number;
	readonly models: GatewayModelInfo[];
}
import {
	ECOSYSTEMS_AI_CHAT_MAX_TOKENS,
	ECOSYSTEMS_AI_CHAT_MODEL,
	ECOSYSTEMS_AI_CHAT_TEMPERATURE,
	ECOSYSTEMS_AI_ENABLED,
	ECOSYSTEMS_AI_GATEWAY_BASE_URL,
	ECOSYSTEMS_AI_PROVIDER,
} from './ecosystemsConfiguration.js';
import { IEcosystemsGatewayProvider, GatewayAuthContext } from './gatewayProvider.js';
import { IEcosystemsSessionService } from './ecosystemsSessionService.js';
import { IEcosystemsApiKeys } from './ecosystemsApiKeys.js';
import { AiProvider, defaultBaseUrlFor, detectProvider } from './providerRouting.js';
import {
	ChatChunk,
	ChatMessage,
	ChatTool,
	ConnectionTestResult,
	GatewayModelInfo,
} from './ecosystemsAiTypes.js';

export const IModelRouterService = createDecorator<IModelRouterService>('ecosystemsModelRouterService');

export interface ChatStreamOptions {
	model?: string;
	feature?: 'chat' | 'agent';
	tools?: ChatTool[];
}

export interface IModelRouterService {
	readonly _serviceBrand: undefined;
	isEnabled(): boolean;
	testConnection(): Promise<ConnectionTestResult>;
	getAvailableModels(): Promise<GatewayModelInfo[]>;
	chatStream(messages: ChatMessage[], token: CancellationToken, options?: ChatStreamOptions): AsyncIterable<ChatChunk>;
}

export class ModelRouterService implements IModelRouterService {
	declare readonly _serviceBrand: undefined;

	private readonly modelsCache = new Map<string, CachedModels>();
	private inflight: Promise<GatewayModelInfo[]> | undefined;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEcosystemsSessionService private readonly sessionService: IEcosystemsSessionService,
		@IEcosystemsGatewayProvider private readonly gatewayProvider: IEcosystemsGatewayProvider,
		@IEcosystemsApiKeys private readonly apiKeys: IEcosystemsApiKeys,
	) { }

	isEnabled(): boolean {
		return this.configurationService.getValue<boolean>(ECOSYSTEMS_AI_ENABLED) !== false
			&& this.configurationService.getValue<string>(ECOSYSTEMS_AI_PROVIDER) === 'ecosystems';
	}

	async testConnection(): Promise<ConnectionTestResult> {
		const model = this.configurationService.getValue<string>(ECOSYSTEMS_AI_CHAT_MODEL) ?? 'gpt-4o-mini';
		const auth = await this.resolveAuth(model);
		if (!auth) {
			return { ok: false, error: { code: 'NOT_AUTHENTICATED', message: 'Sign in to EcoSystems or set OPENAI_API_KEY / ANTHROPIC_API_KEY in your shell.' } };
		}
		return this.gatewayProvider.testConnection(auth);
	}

	async getAvailableModels(): Promise<GatewayModelInfo[]> {
		// De-dup concurrent callers (e.g. picker open + refresh) into one fetch.
		if (this.inflight) {
			return this.inflight;
		}
		this.inflight = this.doGetAvailableModels().finally(() => { this.inflight = undefined; });
		return this.inflight;
	}

	private async doGetAvailableModels(): Promise<GatewayModelInfo[]> {
		// Aggregate models across every provider for which we have credentials so
		// the user can switch between e.g. OpenAI and Anthropic from one picker.
		const providers: AiProvider[] = ['openai', 'anthropic'];
		const seen = new Set<string>();
		const results: GatewayModelInfo[] = [];

		// Bounded budget: never block the picker for more than MODELS_FETCH_BUDGET_MS.
		const budgetCts = new CancellationTokenSource();
		const budgetTimer = setTimeout(() => budgetCts.cancel(), MODELS_FETCH_BUDGET_MS);

		try {
			const provided = await Promise.all(providers.map(async provider => {
				const envKey = this.apiKeys.getKey(provider);
				if (!envKey) {
					return [] as GatewayModelInfo[];
				}
				const baseUrl = this.resolveBaseUrl(provider);
				const cacheKey = this.cacheKey(provider, baseUrl, envKey);
				const cached = this.modelsCache.get(cacheKey);
				if (cached && cached.expiresAt > Date.now()) {
					return cached.models;
				}
				try {
					const auth: GatewayAuthContext = { sessionToken: envKey, gatewayBaseUrl: baseUrl, provider };
					const models = await this.gatewayProvider.listModels(auth, budgetCts.token);
					this.modelsCache.set(cacheKey, { models, expiresAt: Date.now() + MODELS_CACHE_TTL_MS });
					return models;
				} catch {
					return [] as GatewayModelInfo[];
				}
			}));

			for (const list of provided) {
				for (const m of list) {
					if (!seen.has(m.id)) {
						seen.add(m.id);
						results.push(m);
					}
				}
			}

			if (results.length) {
				return results;
			}

			// No env keys (or all failed) — try session token, else fall back to defaults.
			const model = this.configurationService.getValue<string>(ECOSYSTEMS_AI_CHAT_MODEL) ?? 'gpt-4o-mini';
			const auth = await this.resolveAuth(model);
			if (auth) {
				try {
					const sessionModels = await this.gatewayProvider.listModels(auth, budgetCts.token);
					for (const m of sessionModels) {
						if (!seen.has(m.id)) {
							seen.add(m.id);
							results.push(m);
						}
					}
				} catch {
					// fall through to defaults
				}
			}

			// Always merge in defaults so the picker is never blank, even fully offline.
			const defaultLists = await Promise.all(providers.map(p =>
				this.gatewayProvider.listModels({ sessionToken: '', gatewayBaseUrl: this.resolveBaseUrl(p), provider: p }, budgetCts.token)
					.catch(() => [] as GatewayModelInfo[])
			));
			for (const list of defaultLists) {
				for (const m of list) {
					if (!seen.has(m.id)) {
						seen.add(m.id);
						results.push(m);
					}
				}
			}
			return results;
		} finally {
			clearTimeout(budgetTimer);
			budgetCts.dispose();
		}
	}

	private cacheKey(provider: AiProvider, baseUrl: string, key: string): string {
		// Hash the secret so it never appears in logs/state if cache is dumped.
		let hash = 0;
		for (let i = 0; i < key.length; i++) {
			hash = (hash * 31 + key.charCodeAt(i)) | 0;
		}
		return `${provider}|${baseUrl}|${hash}`;
	}

	async *chatStream(messages: ChatMessage[], token: CancellationToken, options?: ChatStreamOptions): AsyncIterable<ChatChunk> {
		if (!this.isEnabled()) {
			yield { type: 'error', error: { code: 'DISABLED', message: 'EcoSystems AI is disabled in Settings.' } };
			return;
		}

		const model = options?.model
			?? this.configurationService.getValue<string>(ECOSYSTEMS_AI_CHAT_MODEL)
			?? 'gpt-4o-mini';

		const auth = await this.resolveAuth(model);
		if (!auth) {
			yield {
				type: 'error',
				error: {
					code: 'NOT_AUTHENTICATED',
					message: 'No API key found. Set OPENAI_API_KEY or ANTHROPIC_API_KEY in your shell environment, then reload the window. You can also paste a key via "Sign in" → "Use a session token".',
				},
			};
			return;
		}

		const maxTokens = this.configurationService.getValue<number>(ECOSYSTEMS_AI_CHAT_MAX_TOKENS) ?? 4096;
		const temperature = this.configurationService.getValue<number>(ECOSYSTEMS_AI_CHAT_TEMPERATURE) ?? 0.2;

		yield* this.gatewayProvider.chatStream(auth, {
			feature: options?.feature ?? 'chat',
			model,
			messages,
			maxTokens,
			temperature,
			tools: options?.tools,
		}, token);
	}

	private async resolveAuth(modelId: string): Promise<GatewayAuthContext | undefined> {
		const provider: AiProvider = detectProvider(modelId);

		// 1. Prefer a provider-specific API key from the environment.
		const envKey = this.apiKeys.getKey(provider);
		if (envKey) {
			return {
				sessionToken: envKey,
				gatewayBaseUrl: this.resolveBaseUrl(provider),
				provider,
			};
		}

		// 2. Fall back to the user's stored session token (paste-in flow).
		const sessionToken = await this.sessionService.getSessionToken();
		if (sessionToken?.trim()) {
			return {
				sessionToken: sessionToken.trim(),
				gatewayBaseUrl: this.resolveBaseUrl(provider),
				provider,
			};
		}

		return undefined;
	}

	private resolveBaseUrl(provider: AiProvider): string {
		// User override always wins — but ignore the obsolete placeholder value
		// that may still be cached in old settings files.
		const configured = this.configurationService.getValue<string>(ECOSYSTEMS_AI_GATEWAY_BASE_URL);
		const trimmed = configured?.trim();
		if (trimmed && trimmed !== 'https://api.ecosystems.dev/v1') {
			return trimmed;
		}
		return defaultBaseUrlFor(provider);
	}
}
