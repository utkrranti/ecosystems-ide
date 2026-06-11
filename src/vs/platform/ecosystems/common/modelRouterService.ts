/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import { dirname } from '../../../base/common/path.js';
import { FileAccess } from '../../../base/common/network.js';
import { IFileService } from '../../files/common/files.js';
import { IWorkspaceContextService } from '../../workspace/common/workspace.js';
import { ILogService } from '../../log/common/log.js';
import { DEFAULT_DEV_SESSION_TOKEN, isLocalGatewayBaseUrl, syncDevSessionTokenFromGatewayEnv } from './localGatewayDevAuth.js';

/** Hard timeout for the entire `getAvailableModels` aggregation. */
const MODELS_FETCH_BUDGET_MS = 1500;

import {
	ECOSYSTEMS_AI_CHAT_MAX_TOKENS,
	ECOSYSTEMS_AI_CHAT_MODEL,
	ECOSYSTEMS_AI_CHAT_TEMPERATURE,
	ECOSYSTEMS_AI_ENABLED,
	ECOSYSTEMS_AI_GATEWAY_BASE_URL,
	ECOSYSTEMS_AI_PROVIDER,
} from './ecosystemsConfiguration.js';
import { DEFAULT_CHAT_MODEL, DEFAULT_GATEWAY_BASE_URL } from './constants.js';
import { IEcosystemsGatewayProvider, GatewayAuthContext } from './gatewayProvider.js';
import { IEcosystemsSessionService } from './ecosystemsSessionService.js';
import { AiProvider, detectProvider } from './providerRouting.js';
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

	private inflight: Promise<GatewayModelInfo[]> | undefined;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEcosystemsSessionService private readonly sessionService: IEcosystemsSessionService,
		@IEcosystemsGatewayProvider private readonly gatewayProvider: IEcosystemsGatewayProvider,
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@ILogService private readonly logService: ILogService,
		@INativeEnvironmentService private readonly environmentService: INativeEnvironmentService,
	) { }

	isEnabled(): boolean {
		return this.configurationService.getValue<boolean>(ECOSYSTEMS_AI_ENABLED) !== false
			&& this.configurationService.getValue<string>(ECOSYSTEMS_AI_PROVIDER) === 'ecosystems';
	}

	async testConnection(): Promise<ConnectionTestResult> {
		const model = this.configurationService.getValue<string>(ECOSYSTEMS_AI_CHAT_MODEL) ?? DEFAULT_CHAT_MODEL;
		const auth = await this.resolveAuth(model);
		if (!auth) {
			return { ok: false, error: { code: 'NOT_AUTHENTICATED', message: 'Sign in to Altus AI (dev: DEV_SESSION_TOKEN from ide_apis/.env.local).' } };
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
		const seen = new Set<string>();
		const results: GatewayModelInfo[] = [];

		const budgetCts = new CancellationTokenSource();
		const budgetTimer = setTimeout(() => budgetCts.cancel(), MODELS_FETCH_BUDGET_MS);

		try {
			const model = this.configurationService.getValue<string>(ECOSYSTEMS_AI_CHAT_MODEL) ?? DEFAULT_CHAT_MODEL;
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

			if (results.length) {
				return results;
			}

			// Offline / gateway down: show built-in defaults so the picker is never empty.
			for (const m of await this.gatewayProvider.listModels(
				{ sessionToken: '', gatewayBaseUrl: this.resolveGatewayBaseUrl(), provider: 'openai' },
				budgetCts.token,
			).catch(() => [])) {
				if (!seen.has(m.id)) {
					seen.add(m.id);
					results.push(m);
				}
			}
			return results;
		} finally {
			clearTimeout(budgetTimer);
			budgetCts.dispose();
		}
	}

	async *chatStream(messages: ChatMessage[], token: CancellationToken, options?: ChatStreamOptions): AsyncIterable<ChatChunk> {
		if (!this.isEnabled()) {
			yield { type: 'error', error: { code: 'DISABLED', message: 'Altus AI is disabled in Settings.' } };
			return;
		}

		const model = options?.model
			?? this.configurationService.getValue<string>(ECOSYSTEMS_AI_CHAT_MODEL)
			?? DEFAULT_CHAT_MODEL;

		const maxTokens = this.configurationService.getValue<number>(ECOSYSTEMS_AI_CHAT_MAX_TOKENS) ?? 4096;
		const temperature = this.configurationService.getValue<number>(ECOSYSTEMS_AI_CHAT_TEMPERATURE) ?? 0.2;
		const request = {
			feature: options?.feature ?? 'chat' as const,
			model,
			messages,
			maxTokens,
			temperature,
			tools: options?.tools,
		};

		if (isLocalGatewayBaseUrl(this.resolveGatewayBaseUrl())) {
			const ready = await this.waitForLocalGatewayReady(20_000);
			if (!ready) {
				const baseUrl = this.resolveGatewayBaseUrl();
				yield {
					type: 'error',
					error: {
						code: 'NETWORK',
						message: `Local AI gateway at ${baseUrl} is not reachable. Keep the Go gateway window open or run .\\scripts\\run-all.ps1.`,
					},
				};
				return;
			}
		}

		for (let attempt = 0; attempt < 3; attempt++) {
			if (token.isCancellationRequested) {
				return;
			}
			const auth = await this.resolveAuth(model, attempt > 0);
			if (!auth) {
				yield {
					type: 'error',
					error: {
						code: 'NOT_AUTHENTICATED',
						message: 'Not signed in. Run .\\scripts\\run-all.ps1 (starts gateway + IDE) or sign in with DEV_SESSION_TOKEN from ide_apis/.env.local.',
					},
				};
				return;
			}

			if (isLocalGatewayBaseUrl(auth.gatewayBaseUrl) && attempt > 0) {
				const probe = await this.gatewayProvider.testConnection(auth);
				if (!probe.ok && probe.error?.code === 'NOT_AUTHENTICATED') {
					await this.ensureLocalGatewaySessionToken(true);
					continue;
				}
			}

			let retryAfterAuth = false;
			for await (const chunk of this.gatewayProvider.chatStream(auth, request, token)) {
				if (token.isCancellationRequested) {
					return;
				}
				if (
					chunk.type === 'error'
					&& chunk.error?.code === 'NOT_AUTHENTICATED'
					&& isLocalGatewayBaseUrl(auth.gatewayBaseUrl)
					&& attempt < 2
				) {
					const refreshed = await this.ensureLocalGatewaySessionToken(true);
					if (refreshed) {
						retryAfterAuth = true;
						break;
					}
				}
				if (chunk.type === 'error' && chunk.error?.code === 'NOT_AUTHENTICATED' && attempt >= 2) {
					const health = await this.gatewayProvider.testConnection(auth);
					const hint = health.error?.code === 'NETWORK'
						? 'Gateway is not reachable. Run .\\scripts\\run-all.ps1 to start it.'
						: `Token must match DEV_SESSION_TOKEN in ide_apis/.env.local (default: ${DEFAULT_DEV_SESSION_TOKEN}). Clear Altus AI sign-in and restart the IDE.`;
					yield {
						type: 'error',
						error: {
							code: 'NOT_AUTHENTICATED',
							message: `Local gateway auth failed after auto-retry. ${hint}`,
						},
					};
					return;
				}
				yield chunk;
				if (chunk.type === 'error') {
					return;
				}
			}

			if (!retryAfterAuth) {
				return;
			}
		}
	}

	private async ensureLocalGatewaySessionToken(force: boolean): Promise<boolean> {
		const gatewayBaseUrl = this.resolveGatewayBaseUrl();
		if (!isLocalGatewayBaseUrl(gatewayBaseUrl)) {
			return false;
		}
		const synced = await syncDevSessionTokenFromGatewayEnv({
			fileService: this.fileService,
			workspaceContextService: this.workspaceContextService,
			sessionService: this.sessionService,
			configurationService: this.configurationService,
			logService: this.logService,
			appRoot: this.resolveAppRoot(),
			force: true,
			useDefaultIfMissing: true,
		});
		if (synced) {
			return true;
		}
		const existing = await this.sessionService.getSessionToken();
		if (!force && existing?.trim() === DEFAULT_DEV_SESSION_TOKEN) {
			return true;
		}
		await this.sessionService.setSessionToken(DEFAULT_DEV_SESSION_TOKEN);
		this.logService.info('[Altus AI] applied default DEV_SESSION_TOKEN for local gateway');
		return true;
	}

	/** After run-all.ps1 the gateway may need a moment; avoid instant "Failed to fetch". */
	private async waitForLocalGatewayReady(maxMs: number): Promise<boolean> {
		const deadline = Date.now() + maxMs;
		while (Date.now() < deadline) {
			const auth = await this.resolveAuth(DEFAULT_CHAT_MODEL);
			if (!auth) {
				await new Promise(r => setTimeout(r, 400));
				continue;
			}
			const probe = await this.gatewayProvider.testConnection(auth);
			if (probe.ok) {
				return true;
			}
			await new Promise(r => setTimeout(r, 500));
		}
		return false;
	}

	private resolveAppRoot(): string | undefined {
		if (this.environmentService.appRoot) {
			return this.environmentService.appRoot;
		}
		try {
			return dirname(FileAccess.asFileUri('').fsPath);
		} catch {
			return undefined;
		}
	}

	private async resolveAuth(_modelId: string, _afterAuthFailure = false): Promise<GatewayAuthContext | undefined> {
		const gatewayBaseUrl = this.resolveGatewayBaseUrl();
		if (isLocalGatewayBaseUrl(gatewayBaseUrl)) {
			// .env.local is source of truth -- overwrites stale GitHub/OAuth tokens saved earlier.
			await this.ensureLocalGatewaySessionToken(true);
		}

		const provider: AiProvider = detectProvider(_modelId);
		const sessionToken = await this.sessionService.getSessionToken();
		if (!sessionToken?.trim()) {
			return undefined;
		}
		return {
			sessionToken: sessionToken.trim(),
			gatewayBaseUrl,
			provider,
		};
	}

	/** IDE always talks to the EcoSystems gateway (never api.openai.com from the renderer). */
	private resolveGatewayBaseUrl(): string {
		const configured = this.configurationService.getValue<string>(ECOSYSTEMS_AI_GATEWAY_BASE_URL);
		const trimmed = configured?.trim();
		if (trimmed && trimmed !== 'https://api.ecosystems.dev/v1' && !trimmed.includes('api.openai.com') && !trimmed.includes('api.anthropic.com')) {
			return trimmed;
		}
		return DEFAULT_GATEWAY_BASE_URL.trim() || 'http://localhost:8787/v1';
	}
}
