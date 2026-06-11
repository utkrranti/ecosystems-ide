/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChatMessage } from '../../../../platform/ecosystems/common/ecosystemsAiTypes.js';

export const CANCELLED_TOOL_OUTPUT =
	'Tool execution was cancelled or skipped by the user. Do not repeat the same command unless the user asks. ' +
	'Use list_directory or read_file to inspect the workspace -- the project may already exist or be partially set up.';

/**
 * OpenAI/Anthropic require every assistant tool_call to be followed by a tool message.
 * Inserts synthetic responses for any missing ids (e.g. user clicked Stop mid-agent-loop).
 */
/** Remove tool messages with no matching assistant tool_use (e.g. compacted-away assistant). */
export function trimOrphanToolMessages(messages: ChatMessage[]): boolean {
	let changed = false;
	while (messages.length > 0 && messages[0].role === 'tool') {
		messages.shift();
		changed = true;
	}
	const result: ChatMessage[] = [];
	for (let i = 0; i < messages.length; i++) {
		const msg = messages[i];
		if (msg.role === 'assistant' && msg.toolCalls?.length) {
			result.push(msg);
			const validIds = new Set(msg.toolCalls.map(c => c.id));
			let j = i + 1;
			while (j < messages.length && messages[j].role === 'tool') {
				const toolMsg = messages[j];
				if (toolMsg.toolCallId && validIds.has(toolMsg.toolCallId)) {
					result.push(toolMsg);
				} else {
					changed = true;
				}
				j++;
			}
			i = j - 1;
			continue;
		}
		if (msg.role === 'tool') {
			changed = true;
			continue;
		}
		result.push(msg);
	}
	if (changed || result.length !== messages.length) {
		messages.length = 0;
		messages.push(...result);
	}
	return changed;
}

export function repairChatToolHistory(messages: ChatMessage[]): boolean {
	let changed = trimOrphanToolMessages(messages);
	let i = 0;
	while (i < messages.length) {
		const msg = messages[i];
		if (msg.role !== 'assistant' || !msg.toolCalls?.length) {
			i++;
			continue;
		}

		const responded = new Set<string>();
		let j = i + 1;
		while (j < messages.length && messages[j].role === 'tool') {
			const id = messages[j].toolCallId;
			if (id) {
				responded.add(id);
			}
			j++;
		}

		const missing = msg.toolCalls.filter(call => !responded.has(call.id));
		if (missing.length) {
			const inserts: ChatMessage[] = missing.map(call => ({
				role: 'tool',
				content: CANCELLED_TOOL_OUTPUT,
				toolCallId: call.id,
				toolName: call.name,
			}));
			messages.splice(j, 0, ...inserts);
			changed = true;
			i = j + inserts.length;
		} else {
			i = j;
		}
	}
	return changed;
}
