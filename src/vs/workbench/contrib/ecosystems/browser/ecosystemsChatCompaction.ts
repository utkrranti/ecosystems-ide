/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { localize } from '../../../../nls.js';
import { ChatMessage } from '../../../../platform/ecosystems/common/ecosystemsAiTypes.js';
import { trimOrphanToolMessages } from './ecosystemsChatToolHistory.js';
import { IEcosystemsAiService } from '../../../../platform/ecosystems/common/ecosystemsAiService.js';
export const COMPACTED_SYSTEM_MARKER = '## Compacted earlier conversation';

/** Rough context budget for the wire payload (chars ??????? tokens??--4). */
export const DEFAULT_CONTEXT_BUDGET_CHARS = 96_000;

export interface ChatCompactionState {
	summary: string;
	compactedThroughIndex: number;
	compactedAt: number;
}

export interface ContextUsageEstimate {
	readonly estimatedChars: number;
	readonly budgetChars: number;
	readonly percent: number;
	readonly messageCount: number;
}

const SUMMARY_MAX_CHARS = 12_000;

const COMPACTION_MODEL_IDS = ['altus-fast', 'gpt-4o-mini', 'claude-haiku-4-5-20251001', 'claude-haiku-4-5'];

export function countPersistableMessages(messages: readonly ChatMessage[]): number {
	return messages.filter(m => m.role === 'user' || m.role === 'assistant' || m.role === 'tool').length;
}

export function estimateHistoryChars(messages: readonly ChatMessage[]): number {
	let n = 0;
	for (const m of messages) {
		n += (m.content?.length ?? 0) + (m.toolCalls?.length ?? 0) * 80;
	}
	return n;
}

export function estimateContextUsage(
	messages: readonly ChatMessage[],
	compaction: ChatCompactionState | undefined,
	keepRecent: number,
	budgetChars: number,
	extraChars = 8000,
): ContextUsageEstimate {
	const wire = buildWireHistory(messages, compaction, keepRecent);
	const estimatedChars = estimateHistoryChars(wire) + extraChars;
	const budget = Math.max(16_000, budgetChars);
	const percent = Math.min(100, Math.round((estimatedChars / budget) * 100));
	return {
		estimatedChars,
		budgetChars: budget,
		percent,
		messageCount: countPersistableMessages(messages),
	};
}

export function pickCompactionModel(configured: string | undefined, chatModelId: string): string {
	const id = configured?.trim();
	if (id) {
		return id;
	}
	for (const preferred of COMPACTION_MODEL_IDS) {
		if (chatModelId.startsWith(preferred) || chatModelId === preferred) {
			return chatModelId;
		}
	}
	return 'altus-fast';
}

export function parseCompactSlashCommand(text: string): { kind: 'compact'; instructions: string } | { kind: 'message'; text: string } {
	const trimmed = text.trim();
	const match = /^\/compact(?:\s+([\s\S]*))?$/i.exec(trimmed);
	if (match) {
		return { kind: 'compact', instructions: (match[1] ?? '').trim() };
	}
	return { kind: 'message', text };
}

export function shouldScheduleBackgroundCompaction(
	messages: readonly ChatMessage[],
	compaction: ChatCompactionState | undefined,
	usage: ContextUsageEstimate,
	compactAfterMessages: number,
	thresholdPercent: number,
): boolean {
	if (usage.messageCount < compactAfterMessages && usage.percent < thresholdPercent) {
		return false;
	}
	if (usage.percent >= thresholdPercent) {
		return true;
	}
	return shouldAutoCompact(messages, compaction, compactAfterMessages);
}

export function shouldAutoCompact(
	messages: readonly ChatMessage[],
	compaction: ChatCompactionState | undefined,
	compactAfterMessages: number,
): boolean {
	const n = countPersistableMessages(messages);
	if (n < compactAfterMessages) {
		return false;
	}
	if (!compaction) {
		return true;
	}
	const newSince = n - compaction.compactedThroughIndex;
	return newSince >= Math.max(8, Math.floor(compactAfterMessages / 2));
}

export function isCompactionStaleForCriticalSend(
	messages: readonly ChatMessage[],
	compaction: ChatCompactionState | undefined,
	usage: ContextUsageEstimate,
	compactAfterMessages: number,
): boolean {
	if (usage.percent < 90) {
		return false;
	}
	return shouldAutoCompact(messages, compaction, compactAfterMessages);
}

export function buildWireHistory(
	messages: readonly ChatMessage[],
	compaction: ChatCompactionState | undefined,
	keepRecent: number,
): ChatMessage[] {
	const persistable = messages
		.filter(m => m.role === 'user' || m.role === 'assistant' || m.role === 'tool')
		.map(m => ({ ...m }));

	if (!compaction?.summary?.trim() || compaction.compactedThroughIndex <= 0) {
		return persistable;
	}

	const split = Math.min(compaction.compactedThroughIndex, Math.max(0, persistable.length - 1));
	const recent = persistable.slice(split);
	const cap = Math.max(2, keepRecent);
	const tail = recent.length > cap ? recent.slice(-cap) : recent;
	trimOrphanToolMessages(tail);

	const preamble: ChatMessage = {
		role: 'system',
		content: `${COMPACTED_SYSTEM_MARKER}\n\n`
			+ compaction.summary.trim()
			+ '\n\n## Recent messages\nContinue from the messages below. Do not ask the user to repeat work already captured above.',
	};

	return [preamble, ...tail];
}

function formatMessagesForSummary(messages: readonly ChatMessage[]): string {
	const lines: string[] = [];
	for (const m of messages) {
		if (m.role === 'user') {
			const text = (m.displayContent ?? m.content).replace(/<attached_[\s\S]*?<\/attached_\w+>\s*/g, '').trim();
			lines.push(`User: ${text.slice(0, 4000)}`);
		} else if (m.role === 'assistant') {
			const tools = m.toolCalls?.map(t => t.name).join(', ');
			const body = m.content?.trim() || (tools ? `(tool calls: ${tools})` : '');
			if (body) {
				lines.push(`Assistant: ${body.slice(0, 4000)}`);
			}
		} else if (m.role === 'tool') {
			lines.push(`Tool ${m.toolName ?? 'result'}: ${m.content.slice(0, 1500)}`);
		}
	}
	return lines.join('\n\n');
}

export async function summarizeForCompaction(
	aiService: IEcosystemsAiService,
	model: string,
	toSummarize: readonly ChatMessage[],
	token: CancellationToken,
	customInstructions?: string,
): Promise<string | undefined> {
	const transcript = formatMessagesForSummary(toSummarize);
	if (!transcript.trim()) {
		return undefined;
	}

	const extra = customInstructions?.trim()
		? `\n\nAdditional instructions for this summary:\n${customInstructions.trim()}`
		: '';

	const prompt: ChatMessage[] = [
		{
			role: 'system',
			content: 'You compress chat transcripts for an IDE coding assistant. '
				+ 'Output a dense markdown summary: goals, decisions, files/paths touched, commands run, errors, and what remains undone. '
				+ 'No filler. Max ~2000 words.',
		},
		{
			role: 'user',
			content: `Summarize this conversation for continuation:\n\n${transcript.slice(0, 100_000)}${extra}`,
		},
	];

	let text = '';
	for await (const chunk of aiService.chatStream(prompt, token, { model, feature: 'chat' })) {
		if (token.isCancellationRequested) {
			return undefined;
		}
		if (chunk.type === 'text' && chunk.text) {
			text += chunk.text;
		} else if (chunk.type === 'error') {
			return undefined;
		} else if (chunk.type === 'done') {
			break;
		}
	}
	const summary = text.trim();
	if (!summary) {
		return undefined;
	}
	return summary.length > SUMMARY_MAX_CHARS
		? `${summary.slice(0, SUMMARY_MAX_CHARS)}\n?????¦[summary truncated]`
		: summary;
}

export async function runCompaction(
	aiService: IEcosystemsAiService,
	model: string,
	messages: readonly ChatMessage[],
	keepRecent: number,
	token: CancellationToken,
	customInstructions?: string,
): Promise<ChatCompactionState | undefined> {
	const persistable = messages.filter(m => m.role === 'user' || m.role === 'assistant' || m.role === 'tool');
	const keep = Math.max(4, keepRecent);
	if (persistable.length <= keep + 2) {
		return undefined;
	}
	const split = persistable.length - keep;
	const toSummarize = persistable.slice(0, split);
	const summary = await summarizeForCompaction(aiService, model, toSummarize, token, customInstructions);
	if (!summary) {
		return undefined;
	}
	return {
		summary,
		compactedThroughIndex: split,
		compactedAt: Date.now(),
	};
}

export function compactionBannerLabel(state: ChatCompactionState, totalMessages: number): string {
	const hidden = Math.min(state.compactedThroughIndex, totalMessages);
	return localize(
		'ecosystemsAiCompactionBanner',
		'{0} earlier messages compacted into context summary ??· {1}',
		hidden,
		new Date(state.compactedAt).toLocaleString(),
	);
}

export function contextUsageLabel(usage: ContextUsageEstimate): string {
	return localize('ecosystemsAiContextUsage', 'Context {0}%', usage.percent);
}
