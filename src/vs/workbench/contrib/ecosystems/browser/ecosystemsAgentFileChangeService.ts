/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { LcsDiff, type ISequence } from '../../../../base/common/diff/diff.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';

export interface AgentFileLineDecoration {
	/** 1-based line number in the modified file */
	readonly line: number;
	readonly kind: 'added' | 'modified';
}

export interface AgentFileChangeRecord {
	readonly id: string;
	readonly uri: URI;
	readonly relativePath: string;
	readonly linesAdded: number;
	readonly linesRemoved: number;
	readonly isNewFile: boolean;
	readonly beforeContent: string | undefined;
	readonly decorations: readonly AgentFileLineDecoration[];
}

export interface IEcosystemsAgentFileChangeService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	/** Changes from the current agent turn (cleared when a new turn starts). */
	getChanges(): readonly AgentFileChangeRecord[];
	getChange(uri: URI): AgentFileChangeRecord | undefined;
	clearTurn(): void;
	/** Accept all agent edits for this turn (files stay as written; clears diff tracking). */
	keepAllChanges(): void;
	recordWrite(uri: URI, relativePath: string, beforeContent: string | undefined, afterContent: string): AgentFileChangeRecord;
}

export const IEcosystemsAgentFileChangeService = createDecorator<IEcosystemsAgentFileChangeService>('ecosystemsAgentFileChangeService');

class LineArraySequence implements ISequence {
	constructor(private readonly lines: readonly string[]) { }
	getElements(): string[] {
		return this.lines as string[];
	}
	getStrictElement(index: number): string {
		return this.lines[index];
	}
}

export function computeLineDiffStats(before: string, after: string): {
	linesAdded: number;
	linesRemoved: number;
	decorations: AgentFileLineDecoration[];
} {
	const oldLines = before.split(/\r?\n/);
	const newLines = after.split(/\r?\n/);
	const diff = new LcsDiff(new LineArraySequence(oldLines), new LineArraySequence(newLines)).ComputeDiff(false);

	let linesAdded = 0;
	let linesRemoved = 0;
	const decorations: AgentFileLineDecoration[] = [];

	for (const change of diff.changes) {
		linesRemoved += change.originalLength;
		linesAdded += change.modifiedLength;
		if (change.modifiedLength === 0) {
			continue;
		}
		const isPureInsert = change.originalLength === 0;
		for (let i = 0; i < change.modifiedLength; i++) {
			decorations.push({
				line: change.modifiedStart + i + 1,
				kind: isPureInsert ? 'added' : 'modified',
			});
		}
	}

	return { linesAdded, linesRemoved, decorations };
}

let nextChangeId = 1;

export class EcosystemsAgentFileChangeService extends Disposable implements IEcosystemsAgentFileChangeService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private readonly changes = new Map<string, AgentFileChangeRecord>();
	private readonly byUri = new Map<string, AgentFileChangeRecord>();

	getChanges(): readonly AgentFileChangeRecord[] {
		return [...this.changes.values()];
	}

	getChange(uri: URI): AgentFileChangeRecord | undefined {
		return this.byUri.get(uri.toString());
	}

	clearTurn(): void {
		if (this.changes.size === 0) {
			return;
		}
		this.changes.clear();
		this.byUri.clear();
		this._onDidChange.fire();
	}

	keepAllChanges(): void {
		this.clearTurn();
	}

	recordWrite(uri: URI, relativePath: string, beforeContent: string | undefined, afterContent: string): AgentFileChangeRecord {
		const isNewFile = beforeContent === undefined;
		let linesAdded: number;
		let linesRemoved: number;
		let decorations: AgentFileLineDecoration[];

		if (isNewFile) {
			const lineCount = afterContent.length === 0 ? 0 : afterContent.split(/\r?\n/).length;
			linesAdded = lineCount;
			linesRemoved = 0;
			decorations = Array.from({ length: lineCount }, (_, i) => ({ line: i + 1, kind: 'added' as const }));
		} else {
			const stats = computeLineDiffStats(beforeContent, afterContent);
			linesAdded = stats.linesAdded;
			linesRemoved = stats.linesRemoved;
			decorations = stats.decorations;
		}

		const record: AgentFileChangeRecord = {
			id: String(nextChangeId++),
			uri,
			relativePath,
			linesAdded,
			linesRemoved,
			isNewFile,
			beforeContent,
			decorations,
		};

		this.changes.set(record.id, record);
		this.byUri.set(uri.toString(), record);
		this._onDidChange.fire();
		return record;
	}
}

registerSingleton(IEcosystemsAgentFileChangeService, EcosystemsAgentFileChangeService, InstantiationType.Delayed);
