/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type AiFeature = 'inline' | 'chat' | 'agent';

export type AiErrorCode =
	| 'NOT_CONFIGURED'
	| 'NOT_AUTHENTICATED'
	| 'DISABLED'
	| 'QUOTA_EXCEEDED'
	| 'RATE_LIMITED'
	| 'NETWORK'
	| 'PROVIDER';

export interface AiError {
	code: AiErrorCode;
	message: string;
}

export interface ChatToolCall {
	id: string;
	name: string;
	args: Record<string, unknown>;
}

export interface ChatMessageImage {
	mimeType: string;
	data: Uint8Array;
}

export interface ChatMessage {
	role: 'system' | 'user' | 'assistant' | 'tool';
	content: string;
	/** user-only: plain text shown in the UI (wire `content` may include attachment preamble) */
	displayContent?: string;
	/** user-only: images sent as vision content parts (OpenAI-compatible) */
	images?: ChatMessageImage[];
	/** assistant-only: tool calls the model wants to invoke */
	toolCalls?: ChatToolCall[];
	/** tool-only: id of the call this is a response to */
	toolCallId?: string;
	/** tool-only: name of the tool that was called */
	toolName?: string;
}

export interface ChatTool {
	name: string;
	description: string;
	/** JSON-schema describing the tool's input parameters. */
	parameters: Record<string, unknown>;
}

export interface ChatChunk {
	type: 'text' | 'done' | 'error' | 'tool_calls';
	text?: string;
	toolCalls?: ChatToolCall[];
	error?: AiError;
}

export interface GatewayModelInfo {
	id: string;
	displayName: string;
	tier: 'free' | 'pro' | 'team';
	features: AiFeature[];
}

export interface ConnectionTestResult {
	ok: boolean;
	latencyMs?: number;
	error?: AiError;
}

export interface ChatRequest {
	feature: 'chat' | 'agent';
	model: string;
	messages: ChatMessage[];
	maxTokens: number;
	temperature: number;
	/** Optional tool definitions. When provided, the model may emit `tool_calls` chunks. */
	tools?: ChatTool[];
}
