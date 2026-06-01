/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { streamToBuffer } from '../../../base/common/buffer.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IRequestService } from '../../request/common/request.js';
import { ILogService } from '../../log/common/log.js';
import { PHASE0_GATEWAY_MODELS } from './constants.js';
import { AiProvider, supportsTemperature } from './providerRouting.js';
import {
	ChatChunk,
	ChatRequest,
	ConnectionTestResult,
	GatewayModelInfo,
} from './ecosystemsAiTypes.js';

export interface GatewayAuthContext {
	sessionToken: string;
	gatewayBaseUrl: string;
	provider?: AiProvider;
}

export const IEcosystemsGatewayProvider = createDecorator<IEcosystemsGatewayProvider>('ecosystemsGatewayProvider');

export interface IEcosystemsGatewayProvider {
	readonly _serviceBrand: undefined;
	testConnection(auth: GatewayAuthContext): Promise<ConnectionTestResult>;
	listModels(auth: GatewayAuthContext, cancellation?: CancellationToken): Promise<GatewayModelInfo[]>;
	chatStream(auth: GatewayAuthContext, request: ChatRequest, token: CancellationToken): AsyncIterable<ChatChunk>;
}

export class EcosystemsGatewayProvider implements IEcosystemsGatewayProvider {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IRequestService private readonly requestService: IRequestService,
		@ILogService private readonly logService: ILogService,
	) { }

	async testConnection(auth: GatewayAuthContext): Promise<ConnectionTestResult> {
		const started = Date.now();
		const url = this.joinUrl(auth.gatewayBaseUrl, '/models');
		try {
			const context = await this.requestService.request({
				type: 'GET',
				url,
				headers: this.buildHeaders(auth),
			}, CancellationToken.None);

			if (context.res.statusCode === 401 || context.res.statusCode === 403) {
				return { ok: false, error: { code: 'NOT_AUTHENTICATED', message: 'Sign in to EcoSystems to use AI.' } };
			}
			if (context.res.statusCode && context.res.statusCode >= 400) {
				return { ok: false, error: { code: 'PROVIDER', message: `Gateway health check failed (${context.res.statusCode}).` } };
			}
			return { ok: true, latencyMs: Date.now() - started };
		} catch (err) {
			this.logService.error('[EcoSystems AI] health check failed', err);
			return { ok: false, error: { code: 'NETWORK', message: this.unreachableMessage(auth.gatewayBaseUrl) } };
		}
	}

	async listModels(auth: GatewayAuthContext, cancellation: CancellationToken = CancellationToken.None): Promise<GatewayModelInfo[]> {
		const url = this.joinUrl(auth.gatewayBaseUrl, '/models');
		try {
			const context = await this.requestService.request({
				type: 'GET',
				url,
				headers: this.buildHeaders(auth),
			}, cancellation);

			if (context.res.statusCode && context.res.statusCode >= 400) {
				// Demoted from warn → trace: 401s are expected on cold start when the key
				// in .env is stale, and they pollute the boot log on every launch.
				this.logService.trace(`[EcoSystems AI] listModels ${url} returned ${context.res.statusCode}; using defaults`);
				return this.defaultModels(auth.provider);
			}

			const body = (await streamToBuffer(context.stream)).toString();
			const parsed = JSON.parse(body) as { models?: GatewayModelInfo[]; data?: Array<{ id: string }> };
			if (Array.isArray(parsed.models) && parsed.models.length > 0) {
				return parsed.models;
			}
			// OpenAI-compatible: { object: 'list', data: [{ id, ... }, ...] }
			// Anthropic /v1/models also returns { data: [{ id, display_name, ... }] }
			if (Array.isArray(parsed.data) && parsed.data.length > 0) {
				return parsed.data.map(m => ({
					id: m.id,
					displayName: (m as { display_name?: string }).display_name ?? m.id,
					tier: 'free',
					features: ['chat', 'inline'],
				}));
			}
		} catch (err) {
			this.logService.trace(`[EcoSystems AI] listModels ${url} failed; using defaults`, err);
		}
		return this.defaultModels(auth.provider);
	}

	async *chatStream(auth: GatewayAuthContext, request: ChatRequest, token: CancellationToken): AsyncIterable<ChatChunk> {
		if (auth.provider === 'anthropic') {
			yield* this.chatStreamAnthropic(auth, request, token);
			return;
		}
		yield* this.chatStreamOpenAi(auth, request, token);
	}

	private async *chatStreamOpenAi(auth: GatewayAuthContext, request: ChatRequest, token: CancellationToken): AsyncIterable<ChatChunk> {
		const url = this.joinUrl(auth.gatewayBaseUrl, '/chat/completions');
		const hasTools = !!request.tools?.length;
		const payload = JSON.stringify({
			model: request.model,
			messages: request.messages.map(m => this.toOpenAiMessage(m)),
			max_tokens: request.maxTokens,
			...(supportsTemperature('openai', request.model) ? { temperature: request.temperature } : {}),
			...(hasTools ? {
				tools: request.tools!.map(t => ({
					type: 'function',
					function: { name: t.name, description: t.description, parameters: t.parameters },
				})),
				tool_choice: 'auto',
			} : {}),
			// Tool-calling responses must be parsed atomically — disable SSE when tools are in play.
			stream: !hasTools,
		});

		let context;
		try {
			context = await this.requestService.request({
				type: 'POST',
				url,
				headers: {
					...this.buildHeaders(auth),
					'Content-Type': 'application/json',
				},
				data: payload,
			}, token);
		} catch (err) {
			this.logService.error('[EcoSystems AI] chat request failed', err);
			yield { type: 'error', error: { code: 'NETWORK', message: this.unreachableMessage(auth.gatewayBaseUrl) } };
			return;
		}

		const statusError = this.mapStatusError(context.res.statusCode);
		if (statusError) {
			yield { type: 'error', error: statusError };
			return;
		}

		const body = (await streamToBuffer(context.stream)).toString();
		if (body.includes('data:')) {
			for (const chunk of this.parseSseBody(body)) {
				if (token.isCancellationRequested) {
					return;
				}
				yield chunk;
			}
			return;
		}

		try {
			const json = JSON.parse(body) as {
				choices?: {
					message?: {
						content?: string;
						tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
					};
				}[];
			};
			const message = json.choices?.[0]?.message;
			const toolCalls = message?.tool_calls;
			if (toolCalls?.length) {
				yield {
					type: 'tool_calls',
					toolCalls: toolCalls.map(tc => ({
						id: tc.id,
						name: tc.function.name,
						args: this.safeParseJson(tc.function.arguments),
					})),
				};
				yield { type: 'done' };
				return;
			}
			const text = message?.content;
			if (text) {
				yield { type: 'text', text };
			}
			yield { type: 'done' };
		} catch (err) {
			this.logService.error('[EcoSystems AI] chat response parse failed', err);
			yield { type: 'error', error: { code: 'PROVIDER', message: 'Unexpected gateway response.' } };
		}
	}

	private async *chatStreamAnthropic(auth: GatewayAuthContext, request: ChatRequest, token: CancellationToken): AsyncIterable<ChatChunk> {
		const url = this.joinUrl(auth.gatewayBaseUrl, '/messages');
		const systemMessages = request.messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
		const messages = this.toAnthropicMessages(request.messages);
		const hasTools = !!request.tools?.length;
		const payload = JSON.stringify({
			model: request.model,
			messages,
			system: systemMessages || undefined,
			max_tokens: request.maxTokens,
			...(supportsTemperature('anthropic', request.model) ? { temperature: request.temperature } : {}),
			...(hasTools ? {
				tools: request.tools!.map(t => ({
					name: t.name,
					description: t.description,
					input_schema: t.parameters,
				})),
			} : {}),
			stream: false,
		});

		let context;
		try {
			context = await this.requestService.request({
				type: 'POST',
				url,
				headers: {
					'x-api-key': auth.sessionToken,
					'anthropic-version': '2023-06-01',
					'anthropic-dangerous-direct-browser-access': 'true',
					'Content-Type': 'application/json',
					'X-EcoSystems-Client': 'ecosystems-ide',
				},
				data: payload,
			}, token);
		} catch (err) {
			this.logService.error('[EcoSystems AI] anthropic request failed', err);
			yield { type: 'error', error: { code: 'NETWORK', message: this.unreachableMessage(auth.gatewayBaseUrl) } };
			return;
		}

		const statusError = this.mapStatusError(context.res.statusCode);
		if (statusError) {
			const body = (await streamToBuffer(context.stream)).toString();
			this.logService.error('[EcoSystems AI] anthropic error body', body);
			yield { type: 'error', error: statusError };
			return;
		}

		const body = (await streamToBuffer(context.stream)).toString();
		try {
			const json = JSON.parse(body) as {
				content?: Array<
					| { type: 'text'; text: string }
					| { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
				>;
			};
			const toolUses = json.content?.filter((b): b is { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } => b.type === 'tool_use') ?? [];
			if (toolUses.length) {
				yield {
					type: 'tool_calls',
					toolCalls: toolUses.map(t => ({ id: t.id, name: t.name, args: t.input ?? {} })),
				};
				yield { type: 'done' };
				return;
			}
			const text = json.content?.filter((b): b is { type: 'text'; text: string } => b.type === 'text').map(b => b.text ?? '').join('');
			if (text) {
				yield { type: 'text', text };
			}
			yield { type: 'done' };
		} catch (err) {
			this.logService.error('[EcoSystems AI] anthropic parse failed', err, body);
			yield { type: 'error', error: { code: 'PROVIDER', message: 'Unexpected Anthropic response.' } };
		}
	}

	private *parseSseBody(body: string): Iterable<ChatChunk> {
		for (const line of body.split('\n')) {
			const trimmed = line.trim();
			if (!trimmed.startsWith('data:')) {
				continue;
			}
			const data = trimmed.slice(5).trim();
			if (data === '[DONE]') {
				yield { type: 'done' };
				return;
			}
			try {
				const json = JSON.parse(data) as { choices?: { delta?: { content?: string } }[] };
				const text = json.choices?.[0]?.delta?.content;
				if (text) {
					yield { type: 'text', text };
				}
			} catch {
				// ignore malformed SSE chunks
			}
		}
		yield { type: 'done' };
	}

	private mapStatusError(statusCode: number | undefined) {
		if (statusCode === 401 || statusCode === 403) {
			return { code: 'NOT_AUTHENTICATED' as const, message: 'Sign in to EcoSystems to use AI.' };
		}
		if (statusCode === 402) {
			return { code: 'QUOTA_EXCEEDED' as const, message: 'AI quota exceeded. Upgrade your EcoSystems plan.' };
		}
		if (statusCode === 429) {
			return { code: 'RATE_LIMITED' as const, message: 'Rate limited. Try again shortly.' };
		}
		if (statusCode && statusCode >= 400) {
			return { code: 'PROVIDER' as const, message: `Gateway request failed (${statusCode}).` };
		}
		return undefined;
	}

	private defaultModels(provider?: AiProvider): GatewayModelInfo[] {
		if (provider === 'anthropic') {
			return [
				{ id: 'claude-opus-4-5', displayName: 'Claude Opus 4.5', tier: 'free', features: ['chat', 'inline'] },
				{ id: 'claude-sonnet-4-5', displayName: 'Claude Sonnet 4.5', tier: 'free', features: ['chat', 'inline'] },
				{ id: 'claude-3-5-haiku-latest', displayName: 'Claude 3.5 Haiku', tier: 'free', features: ['chat', 'inline'] },
			];
		}
		return PHASE0_GATEWAY_MODELS.map(m => ({
			id: m.id,
			displayName: m.displayName,
			tier: 'free',
			features: ['chat', 'inline'],
		}));
	}

	private buildHeaders(auth: GatewayAuthContext): Record<string, string> {
		if (auth.provider === 'anthropic') {
			return {
				'x-api-key': auth.sessionToken,
				'anthropic-version': '2023-06-01',
				'anthropic-dangerous-direct-browser-access': 'true',
				'X-EcoSystems-Client': 'ecosystems-ide',
			};
		}
		return {
			Authorization: `Bearer ${auth.sessionToken}`,
			'X-EcoSystems-Client': 'ecosystems-ide',
		};
	}

	private joinUrl(baseUrl: string, path: string): string {
		const trimmed = baseUrl.replace(/\/+$/, '');
		return `${trimmed}${path.startsWith('/') ? path : `/${path}`}`;
	}

	private unreachableMessage(baseUrl: string): string {
		return `Could not reach AI provider at ${baseUrl}. Set OPENAI_API_KEY or ANTHROPIC_API_KEY in your shell, or configure 'ecosystems.ai.gatewayBaseUrl' and sign in with a token.`;
	}

	private safeParseJson(raw: string | undefined): Record<string, unknown> {
		if (!raw) {
			return {};
		}
		try {
			const parsed = JSON.parse(raw);
			return (parsed && typeof parsed === 'object') ? parsed as Record<string, unknown> : {};
		} catch {
			return {};
		}
	}

	private toOpenAiMessage(m: import('./ecosystemsAiTypes.js').ChatMessage): Record<string, unknown> {
		if (m.role === 'assistant' && m.toolCalls?.length) {
			return {
				role: 'assistant',
				content: m.content || null,
				tool_calls: m.toolCalls.map(tc => ({
					id: tc.id,
					type: 'function',
					function: { name: tc.name, arguments: JSON.stringify(tc.args ?? {}) },
				})),
			};
		}
		if (m.role === 'tool') {
			return {
				role: 'tool',
				tool_call_id: m.toolCallId,
				content: m.content,
			};
		}
		return { role: m.role, content: m.content };
	}

	private toAnthropicMessages(messages: import('./ecosystemsAiTypes.js').ChatMessage[]): Array<Record<string, unknown>> {
		// Anthropic only accepts user/assistant. tool results become user messages with
		// a tool_result content block; assistant tool calls become content blocks too.
		const out: Array<Record<string, unknown>> = [];
		for (const m of messages) {
			if (m.role === 'system') {
				continue;
			}
			if (m.role === 'assistant' && m.toolCalls?.length) {
				const content: Array<Record<string, unknown>> = [];
				if (m.content) {
					content.push({ type: 'text', text: m.content });
				}
				for (const tc of m.toolCalls) {
					content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.args ?? {} });
				}
				out.push({ role: 'assistant', content });
				continue;
			}
			if (m.role === 'tool') {
				out.push({
					role: 'user',
					content: [{ type: 'tool_result', tool_use_id: m.toolCallId, content: m.content }],
				});
				continue;
			}
			out.push({ role: m.role, content: m.content });
		}
		return out;
	}
}
