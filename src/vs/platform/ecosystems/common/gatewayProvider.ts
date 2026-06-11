/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { encodeBase64, streamToBuffer, VSBuffer } from '../../../base/common/buffer.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { isCancellationError } from '../../../base/common/errors.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IRequestService } from '../../request/common/request.js';
import { ILogService } from '../../log/common/log.js';
import { PHASE0_GATEWAY_MODELS } from './constants.js';
import { isLocalGatewayBaseUrl } from './localGatewayDevAuth.js';
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

/** User Stop or request abort -- not a gateway outage. */
function requestWasCancelled(token: CancellationToken, err: unknown): boolean {
	return token.isCancellationRequested || isCancellationError(err);
}

export class EcosystemsGatewayProvider implements IEcosystemsGatewayProvider {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IRequestService private readonly requestService: IRequestService,
		@ILogService private readonly logService: ILogService,
	) { }

	async testConnection(auth: GatewayAuthContext): Promise<ConnectionTestResult> {
		const started = Date.now();
		const url = this.joinGatewayPath(auth.gatewayBaseUrl, '/models');
		try {
			const context = await this.requestService.request({
				type: 'GET',
				url,
				headers: this.buildHeaders(auth),
			}, CancellationToken.None);

			if (context.res.statusCode === 401 || context.res.statusCode === 403) {
				return { ok: false, error: { code: 'NOT_AUTHENTICATED', message: 'Sign in to Altus AI to use AI.' } };
			}
			if (context.res.statusCode && context.res.statusCode >= 400) {
				return { ok: false, error: { code: 'PROVIDER', message: `Gateway health check failed (${context.res.statusCode}).` } };
			}
			return { ok: true, latencyMs: Date.now() - started };
		} catch (err) {
			if (requestWasCancelled(CancellationToken.None, err)) {
				return { ok: false };
			}
			this.logService.error('[Altus AI] health check failed', err);
			return { ok: false, error: { code: 'NETWORK', message: this.unreachableMessage(auth.gatewayBaseUrl) } };
		}
	}

	async listModels(auth: GatewayAuthContext, cancellation: CancellationToken = CancellationToken.None): Promise<GatewayModelInfo[]> {
		const url = this.joinGatewayPath(auth.gatewayBaseUrl, '/models');
		try {
			const context = await this.requestService.request({
				type: 'GET',
				url,
				headers: this.buildHeaders(auth),
			}, cancellation);

			if (context.res.statusCode && context.res.statusCode >= 400) {
				// Demoted from warn -> trace: 401s are expected on cold start when the key
				// in .env is stale, and they pollute the boot log on every launch.
				this.logService.trace(`[Altus AI] listModels ${url} returned ${context.res.statusCode}; using defaults`);
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
			this.logService.trace(`[Altus AI] listModels ${url} failed; using defaults`, err);
		}
		return this.defaultModels(auth.provider);
	}

	async *chatStream(auth: GatewayAuthContext, request: ChatRequest, token: CancellationToken): AsyncIterable<ChatChunk> {
		// Local dev gateway exposes a single OpenAI-shaped /ai/chat/completions route for all models.
		if (auth.provider === 'anthropic' && !this.usesLocalDevGateway(auth.gatewayBaseUrl)) {
			yield* this.chatStreamAnthropic(auth, request, token);
			return;
		}
		yield* this.chatStreamOpenAi(auth, request, token);
	}

	private async *chatStreamOpenAi(auth: GatewayAuthContext, request: ChatRequest, token: CancellationToken): AsyncIterable<ChatChunk> {
		const url = this.joinGatewayPath(auth.gatewayBaseUrl, '/chat/completions');
		const hasTools = !!request.tools?.length;
		const isClaude = request.model.toLowerCase().startsWith('claude');
		// Claude + local gateway: never SSE from IDE (empty-stream bug); agent always uses JSON for tools.
		const useStream = !hasTools && !isClaude;
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
			stream: useStream,
		});

		this.logService.info(`[Altus AI] POST ${url} model=${request.model} tools=${hasTools ? request.tools!.length : 0} stream=${useStream}`);

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
			if (requestWasCancelled(token, err)) {
				return;
			}
			this.logService.error('[Altus AI] chat request failed', err);
			yield { type: 'error', error: { code: 'NETWORK', message: this.unreachableMessage(auth.gatewayBaseUrl) } };
			return;
		}

		if (token.isCancellationRequested) {
			return;
		}

		const body = (await streamToBuffer(context.stream)).toString();
		this.logService.info(`[Altus AI] response ${context.res.statusCode ?? 0} bytes=${body.length} from ${url}`);
		const statusError = this.mapStatusError(context.res.statusCode, body);
		if (statusError) {
			yield { type: 'error', error: statusError };
			return;
		}

		if (this.looksLikeSseBody(body)) {
			const sseChunks = [...this.parseSseBody(body)];
			const hadContent = sseChunks.some(c => c.type === 'text' || c.type === 'tool_calls');
			if (!hadContent) {
				this.logService.warn('[Altus AI] empty SSE body from gateway', body.slice(0, 200));
				yield {
					type: 'error',
					error: {
						code: 'PROVIDER',
						message: 'Gateway returned an empty stream. Restart the gateway (.\\scripts\\run-all.ps1) and retry, or pick GPT-4o mini.',
					},
				};
				return;
			}
			for (const chunk of sseChunks) {
				if (token.isCancellationRequested) {
					return;
				}
				yield chunk;
			}
			return;
		}

		yield* this.yieldOpenAiCompletionJson(body);
	}

	private looksLikeSseBody(body: string): boolean {
		const trimmed = body.trimStart();
		// Anthropic SSE uses `event:` lines -- must not treat as OpenAI SSE (that drops tool calls).
		if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
			return false;
		}
		return trimmed.startsWith('data:');
	}

	private extractOpenAiMessageText(message: Record<string, unknown> | undefined): string {
		if (!message) {
			return '';
		}
		const refusal = message['refusal'];
		if (typeof refusal === 'string' && refusal.trim()) {
			return refusal;
		}
		const content = message['content'];
		if (typeof content === 'string') {
			return content;
		}
		if (Array.isArray(content)) {
			const parts: string[] = [];
			for (const part of content) {
				if (!part || typeof part !== 'object') {
					continue;
				}
				const block = part as { type?: string; text?: string };
				if ((block.type === 'text' || block.type === 'output_text') && block.text) {
					parts.push(block.text);
				}
			}
			return parts.join('');
		}
		return '';
	}

	private *yieldOpenAiCompletionJson(body: string): Iterable<ChatChunk> {
		let json: {
			error?: { message?: string };
			/** Gateway may return Anthropic errors before OpenAI shaping */
			type?: string;
			choices?: Array<{
				finish_reason?: string;
				message?: {
					content?: unknown;
					refusal?: string;
					tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
				};
			}>;
		};
		try {
			json = JSON.parse(body);
		} catch (err) {
			this.logService.error('[Altus AI] chat response parse failed', err);
			yield { type: 'error', error: { code: 'PROVIDER', message: 'Unexpected gateway response.' } };
			return;
		}

		const topError = json.error?.message
			?? (json as { message?: string }).message;
		if (topError) {
			yield { type: 'error', error: { code: 'PROVIDER', message: topError } };
			return;
		}

		const choice = json.choices?.[0];
		const message = choice?.message;
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
			const text = this.extractOpenAiMessageText(message as Record<string, unknown>);
			if (text.trim()) {
				yield { type: 'text', text };
			}
			yield { type: 'done' };
			return;
		}

		const text = this.extractOpenAiMessageText(message as Record<string, unknown>);
		if (text.trim()) {
			yield { type: 'text', text };
			yield { type: 'done' };
			return;
		}

		const finish = choice?.finish_reason ?? 'unknown';
		this.logService.warn(`[Altus AI] empty completion (finish_reason=${finish})`, body.slice(0, 400));
		yield {
			type: 'error',
			error: {
				code: 'PROVIDER',
				message: finish === 'content_filter'
					? 'The model declined to respond (content filter). Rephrase your request.'
					: 'The model returned an empty response. Try again, switch models (e.g. GPT-4o mini), or check the gateway console for errors.',
			},
		};
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
					'X-Altus-Client': 'altus-ide',
				},
				data: payload,
			}, token);
		} catch (err) {
			if (requestWasCancelled(token, err)) {
				return;
			}
			this.logService.error('[Altus AI] anthropic request failed', err);
			yield { type: 'error', error: { code: 'NETWORK', message: this.unreachableMessage(auth.gatewayBaseUrl) } };
			return;
		}

		if (token.isCancellationRequested) {
			return;
		}

		const statusError = this.mapStatusError(context.res.statusCode);
		if (statusError) {
			const body = (await streamToBuffer(context.stream)).toString();
			this.logService.error('[Altus AI] anthropic error body', body);
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
				yield { type: 'done' };
				return;
			}
			this.logService.warn('[Altus AI] anthropic direct returned no text or tool calls');
			yield {
				type: 'error',
				error: {
					code: 'PROVIDER',
					message: 'Anthropic returned an empty response. Use the local gateway (http://localhost:8787/v1) or pick another model.',
				},
			};
		} catch (err) {
			this.logService.error('[Altus AI] anthropic parse failed', err, body);
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

	private mapStatusError(statusCode: number | undefined, body?: string) {
		const upstreamDetail = this.extractUpstreamErrorMessage(body);
		if (statusCode === 401 || statusCode === 403) {
			return {
				code: 'NOT_AUTHENTICATED' as const,
				message: upstreamDetail
					? `Gateway auth failed (${statusCode}): ${upstreamDetail}. Retrying sign-in from ide_apis/.env.local...`
					: `Gateway auth failed (${statusCode}). Retrying sign-in from ide_apis/.env.local...`,
			};
		}
		if (statusCode === 402) {
			return { code: 'QUOTA_EXCEEDED' as const, message: upstreamDetail ?? 'AI quota exceeded. Upgrade your Altus.' };
		}
		if (statusCode === 429) {
			return { code: 'RATE_LIMITED' as const, message: upstreamDetail ?? 'Rate limited. Try again shortly.' };
		}
		if (statusCode === 404) {
			return { code: 'PROVIDER' as const, message: upstreamDetail ?? 'Model not available for this API key (404). Check your provider key in ide_apis/.env.local and that the selected model is enabled for that project.' };
		}
		if (statusCode && statusCode >= 400) {
			const suffix = upstreamDetail ? `: ${upstreamDetail}` : '.';
			return { code: 'PROVIDER' as const, message: `Gateway request failed (${statusCode})${suffix}` };
		}
		return undefined;
	}

	private extractUpstreamErrorMessage(body?: string): string | undefined {
		if (!body?.trim()) {
			return undefined;
		}
		try {
			const json = JSON.parse(body) as {
				type?: string;
				error?: string | { type?: string; message?: string };
				message?: string;
			};
			if (typeof json.error === 'string') {
				return json.error;
			}
			if (json.error && typeof json.error === 'object' && json.error.message) {
				return json.error.message;
			}
			if (json.type === 'error' && json.message) {
				return json.message;
			}
			if (json.message) {
				return json.message;
			}
		} catch {
			// plain-text upstream body
			if (body.length <= 500) {
				return body.trim();
			}
		}
		return undefined;
	}

	private usesLocalDevGateway(baseUrl: string): boolean {
		return isLocalGatewayBaseUrl(baseUrl);
	}

	/** Local gateway serves routes under /v1/ai/* while settings often use http://localhost:8787/v1 */
	private joinGatewayPath(baseUrl: string, path: string): string {
		const trimmed = baseUrl.replace(/\/+$/, '');
		const suffix = path.startsWith('/') ? path : `/${path}`;
		if (trimmed.endsWith('/v1') && !trimmed.endsWith('/v1/ai')) {
			return `${trimmed}/ai${suffix}`;
		}
		return `${trimmed}${suffix}`;
	}

	private defaultModels(_provider?: AiProvider): GatewayModelInfo[] {
		return PHASE0_GATEWAY_MODELS.map(m => ({
			id: m.id,
			displayName: m.displayName,
			tier: m.id === 'altus-pro' || m.id === 'altus-deep' ? 'pro' : 'free',
			features: m.id === 'altus-fast' || m.id === 'altus-smart' ? ['chat', 'inline', 'agent'] : ['chat', 'agent'],
		}));
	}

	private buildHeaders(auth: GatewayAuthContext): Record<string, string> {
		// Local dev gateway always authenticates with Bearer DEV_SESSION_TOKEN,
		// regardless of selected model/provider.
		if (this.usesLocalDevGateway(auth.gatewayBaseUrl)) {
			return {
				Authorization: `Bearer ${auth.sessionToken}`,
				'X-Altus-Client': 'altus-ide',
			};
		}
		if (auth.provider === 'anthropic') {
			return {
				'x-api-key': auth.sessionToken,
				'anthropic-version': '2023-06-01',
				'anthropic-dangerous-direct-browser-access': 'true',
				'X-Altus-Client': 'altus-ide',
			};
		}
		return {
			Authorization: `Bearer ${auth.sessionToken}`,
			'X-Altus-Client': 'altus-ide',
		};
	}

	private joinUrl(baseUrl: string, path: string): string {
		const trimmed = baseUrl.replace(/\/+$/, '');
		return `${trimmed}${path.startsWith('/') ? path : `/${path}`}`;
	}

	private unreachableMessage(baseUrl: string): string {
		if (/localhost|127\.0\.0\.1/i.test(baseUrl)) {
			return `Could not reach the Altus AI gateway at ${baseUrl}. Start it with .\\scripts\\run-all.ps1 (Go gateway in ide_apis), then sign in with your dev session token (dev-local-token).`;
		}
		return `Could not reach AI at ${baseUrl}. Sign in to Altus AI, or set altusAI.gateway.baseUrl and ensure the gateway is running.`;
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
				...(m.toolName ? { name: m.toolName } : {}),
				content: m.content,
			};
		}
		if (m.role === 'user' && m.images?.length) {
			const parts: Array<Record<string, unknown>> = [];
			if (m.content) {
				parts.push({ type: 'text', text: m.content });
			}
			for (const img of m.images) {
				const b64 = encodeBase64(VSBuffer.wrap(img.data));
				parts.push({
					type: 'image_url',
					image_url: { url: `data:${img.mimeType};base64,${b64}` },
				});
			}
			return { role: 'user', content: parts };
		}
		return { role: m.role, content: m.content };
	}

	private toAnthropicMessages(messages: import('./ecosystemsAiTypes.js').ChatMessage[]): Array<Record<string, unknown>> {
		const out: Array<Record<string, unknown>> = [];
		for (let i = 0; i < messages.length; i++) {
			const m = messages[i];
			if (m.role === 'system') {
				continue;
			}
			if (m.role === 'tool') {
				continue;
			}
			if (m.role === 'assistant' && m.toolCalls?.length) {
				const content: Array<Record<string, unknown>> = [];
				if (m.content) {
					content.push({ type: 'text', text: m.content });
				}
				const validIds = new Set<string>();
				for (const tc of m.toolCalls) {
					validIds.add(tc.id);
					content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.args ?? {} });
				}
				out.push({ role: 'assistant', content });

				const toolResults: Array<Record<string, unknown>> = [];
				let j = i + 1;
				while (j < messages.length && messages[j].role === 'tool') {
					const t = messages[j];
					if (t.toolCallId && validIds.has(t.toolCallId)) {
						toolResults.push({ type: 'tool_result', tool_use_id: t.toolCallId, content: t.content });
					}
					j++;
				}
				if (toolResults.length) {
					out.push({ role: 'user', content: toolResults });
				}
				i = j - 1;
				continue;
			}
			out.push({ role: m.role, content: m.content });
		}
		return out;
	}
}
