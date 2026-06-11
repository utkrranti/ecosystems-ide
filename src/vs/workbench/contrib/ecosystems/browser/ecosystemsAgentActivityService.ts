/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';

export interface AgentTerminalRun {
	readonly id: string;
	readonly command: string;
	terminalInstanceId?: number;
	pending: boolean;
	ok?: boolean;
}

export interface IEcosystemsAgentActivityService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	readonly onTerminalStarted: Event<{ instanceId: number; command: string }>;
	getTerminalRuns(): readonly AgentTerminalRun[];
	clearTurn(): void;
	registerTerminalStart(instanceId: number, command: string): AgentTerminalRun;
	completeTerminalRun(instanceId: number, ok: boolean): void;
}

export const IEcosystemsAgentActivityService = createDecorator<IEcosystemsAgentActivityService>('ecosystemsAgentActivityService');

let nextTerminalId = 1;

export class EcosystemsAgentActivityService extends Disposable implements IEcosystemsAgentActivityService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private readonly _onTerminalStarted = this._register(new Emitter<{ instanceId: number; command: string }>());
	readonly onTerminalStarted = this._onTerminalStarted.event;

	private readonly runs = new Map<number, AgentTerminalRun>();
	private readonly runsById = new Map<string, AgentTerminalRun>();

	getTerminalRuns(): readonly AgentTerminalRun[] {
		return [...this.runsById.values()];
	}

	clearTurn(): void {
		if (this.runs.size === 0) {
			return;
		}
		this.runs.clear();
		this.runsById.clear();
		this._onDidChange.fire();
	}

	registerTerminalStart(instanceId: number, command: string): AgentTerminalRun {
		const existing = this.runs.get(instanceId);
		if (existing) {
			existing.pending = true;
			this._onDidChange.fire();
			return existing;
		}
		const run: AgentTerminalRun = {
			id: String(nextTerminalId++),
			command,
			terminalInstanceId: instanceId,
			pending: true,
		};
		this.runs.set(instanceId, run);
		this.runsById.set(run.id, run);
		this._onTerminalStarted.fire({ instanceId, command });
		this._onDidChange.fire();
		return run;
	}

	completeTerminalRun(instanceId: number, ok: boolean): void {
		const run = this.runs.get(instanceId);
		if (!run) {
			return;
		}
		run.pending = false;
		run.ok = ok;
		this._onDidChange.fire();
	}
}

registerSingleton(IEcosystemsAgentActivityService, EcosystemsAgentActivityService, InstantiationType.Delayed);
