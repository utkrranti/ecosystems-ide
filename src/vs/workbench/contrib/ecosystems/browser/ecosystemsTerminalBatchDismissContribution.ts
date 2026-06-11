/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, type IDisposable } from '../../../../base/common/lifecycle.js';
import { isWindows } from '../../../../base/common/platform.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { ITerminalService, type ITerminalInstance } from '../../terminal/browser/terminal.js';
import { attachBatchTerminateAutoDismiss } from './ecosystemsTerminalBatchDismiss.js';

export class EcosystemsTerminalBatchDismissContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.ecosystemsTerminalBatchDismiss';

	private readonly instanceDisposables = new Map<number, IDisposable>();

	constructor(
		@ITerminalService private readonly terminalService: ITerminalService,
	) {
		super();
		if (!isWindows) {
			return;
		}
		for (const instance of this.terminalService.instances) {
			this.watchInstance(instance);
		}
		this._register(this.terminalService.onDidCreateInstance(instance => this.watchInstance(instance)));
		this._register(this.terminalService.onDidDisposeInstance(instance => this.unwatchInstance(instance)));
	}

	private watchInstance(instance: ITerminalInstance): void {
		if (this.instanceDisposables.has(instance.instanceId)) {
			return;
		}
		this.instanceDisposables.set(instance.instanceId, attachBatchTerminateAutoDismiss(instance));
		instance.onDisposed(() => this.unwatchInstance(instance));
	}

	private unwatchInstance(instance: ITerminalInstance): void {
		const d = this.instanceDisposables.get(instance.instanceId);
		if (d) {
			this.instanceDisposables.delete(instance.instanceId);
			d.dispose();
		}
	}
}

registerWorkbenchContribution2(
	EcosystemsTerminalBatchDismissContribution.ID,
	EcosystemsTerminalBatchDismissContribution,
	WorkbenchPhase.AfterRestored,
);
