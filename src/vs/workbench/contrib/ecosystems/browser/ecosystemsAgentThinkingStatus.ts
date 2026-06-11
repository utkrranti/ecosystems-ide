/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../base/browser/window.js';
import { localize } from '../../../../nls.js';

const THINKING_ROTATE_MS = 2800;

export interface AgentThinkingContext {
	readonly step: number;
	readonly lastToolNames?: readonly string[];
}

function shuffleFromRandomStart(messages: readonly string[]): string[] {
	if (messages.length <= 1) {
		return [...messages];
	}
	const start = Math.floor(Math.random() * messages.length);
	return [...messages.slice(start), ...messages.slice(0, start)];
}

function firstStepMessages(): string[] {
	return [
		localize('ecosystemsAiThinkingReadWorkspace', 'Reading your project layout...'),
		localize('ecosystemsAiThinkingUnderstand', 'Understanding what you need...'),
		localize('ecosystemsAiThinkingPlan', 'Planning the best approach...'),
		localize('ecosystemsAiThinkingContext', 'Gathering workspace context...'),
		localize('ecosystemsAiThinkingExplore', 'Exploring relevant files...'),
	];
}

function followUpMessages(): string[] {
	return [
		localize('ecosystemsAiThinkingReviewOutput', 'Reviewing tool output...'),
		localize('ecosystemsAiThinkingNextStep', 'Deciding the next step...'),
		localize('ecosystemsAiThinkingVerify', 'Verifying what changed...'),
		localize('ecosystemsAiThinkingSummarize', 'Summarizing progress so far...'),
		localize('ecosystemsAiThinkingContinue', 'Continuing the task...'),
	];
}

function terminalFollowUpMessages(): string[] {
	return [
		localize('ecosystemsAiThinkingReadTerminal', 'Reading terminal output...'),
		localize('ecosystemsAiThinkingCheckExit', 'Checking if the command succeeded...'),
		localize('ecosystemsAiThinkingNextCommand', 'Planning the next command...'),
		...followUpMessages(),
	];
}

function fileFollowUpMessages(): string[] {
	return [
		localize('ecosystemsAiThinkingReadFiles', 'Reviewing file changes...'),
		localize('ecosystemsAiThinkingCheckDiff', 'Checking edits against your request...'),
		localize('ecosystemsAiThinkingMoreEdits', 'Seeing if more edits are needed...'),
		...followUpMessages(),
	];
}

export function getAgentThinkingMessages(context: AgentThinkingContext): string[] {
	if (context.step === 0) {
		return shuffleFromRandomStart(firstStepMessages());
	}
	const names = context.lastToolNames ?? [];
	if (names.includes('run_in_terminal')) {
		return shuffleFromRandomStart(terminalFollowUpMessages());
	}
	if (names.some(n => n === 'write_file' || n === 'read_file' || n === 'copy_file')) {
		return shuffleFromRandomStart(fileFollowUpMessages());
	}
	return shuffleFromRandomStart(followUpMessages());
}

export function getAskThinkingMessages(): string[] {
	return shuffleFromRandomStart([
		localize('ecosystemsAiThinkingCompose', 'Composing a reply...'),
		localize('ecosystemsAiThinkingReason', 'Thinking through your question...'),
		localize('ecosystemsAiThinkingDraft', 'Drafting an answer...'),
		localize('ecosystemsAiThinkingSearch', 'Connecting ideas from your message...'),
	]);
}

export function getPlanThinkingMessages(): string[] {
	return shuffleFromRandomStart([
		localize('ecosystemsAiThinkingOutline', 'Outlining an approach...'),
		localize('ecosystemsAiThinkingSteps', 'Breaking the work into steps...'),
		localize('ecosystemsAiThinkingTradeoffs', 'Weighing trade-offs...'),
		localize('ecosystemsAiThinkingScope', 'Scoping what to change...'),
		localize('ecosystemsAiThinkingPlanDraft', 'Drafting your plan...'),
	]);
}

export function startThinkingLabelRotation(labelEl: HTMLElement, messages: readonly string[]): () => void {
	if (messages.length === 0) {
		return () => { };
	}
	labelEl.textContent = messages[0];
	if (messages.length === 1) {
		return () => { };
	}
	let index = 0;
	const timer = mainWindow.setInterval(() => {
		index = (index + 1) % messages.length;
		labelEl.textContent = messages[index];
	}, THINKING_ROTATE_MS);
	return () => mainWindow.clearInterval(timer);
}
