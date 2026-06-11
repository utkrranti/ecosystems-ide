/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/ecosystemsUpdateTitlebar.css';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { addDisposableListener } from '../../../../base/browser/dom.js';
import { localize } from '../../../../nls.js';
import { IUpdateService, State, StateType } from '../../../../platform/update/common/update.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { isWeb } from '../../../../base/common/platform.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';

type PillMode = 'hidden' | 'available' | 'checking' | 'downloading' | 'updating' | 'ready';

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const INITIAL_CHECK_DELAY_MS = 60 * 1000;

class EcosystemsUpdateTitlebarContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.ecosystems.updateTitlebar';

	private pillElement: HTMLElement | undefined;
	private pillVisible = false;
	private remoteUpdateAvailable = false;
	private readonly checkScheduler = this._register(new RunOnceScheduler(() => this.checkForRemoteUpdate(), CHECK_INTERVAL_MS));

	constructor(
		@IUpdateService private readonly updateService: IUpdateService,
		@IProductService private readonly productService: IProductService,
	) {
		super();

		if (isWeb || !this.productService.updateUrl || !this.productService.commit) {
			return;
		}

		this._register(updateService.onStateChange(state => this.onUpdateStateChange(state)));

		this._register(this.checkScheduler);
		this.scheduleInitialCheck();
		this.onUpdateStateChange(updateService.state);
	}

	private scheduleInitialCheck(): void {
		mainWindow.setTimeout(() => {
			void this.checkForRemoteUpdate();
		}, INITIAL_CHECK_DELAY_MS);
	}

	private async checkForRemoteUpdate(): Promise<void> {
		if (this.updateService.state.type !== StateType.Idle && this.updateService.state.type !== StateType.Uninitialized) {
			this.checkScheduler.schedule();
			return;
		}

		const isLatest = await this.updateService.isLatestVersion();
		this.remoteUpdateAvailable = isLatest === false;
		this.renderPill(this.modeFromState(this.updateService.state));

		this.checkScheduler.schedule();
	}

	private onUpdateStateChange(state: State): void {
		if (state.type === StateType.Idle) {
			void this.checkForRemoteUpdate();
			return;
		}

		if (state.type === StateType.Uninitialized || state.type === StateType.Disabled) {
			this.remoteUpdateAvailable = false;
		}

		this.renderPill(this.modeFromState(state));
	}

	private modeFromState(state: State): PillMode {
		switch (state.type) {
			case StateType.CheckingForUpdates:
				return 'checking';
			case StateType.Downloading:
			case StateType.AvailableForDownload:
				return 'downloading';
			case StateType.Downloaded:
			case StateType.Updating:
				return 'updating';
			case StateType.Ready:
				return 'ready';
			case StateType.Disabled:
			case StateType.Uninitialized:
				return 'hidden';
			case StateType.Idle:
				return this.remoteUpdateAvailable ? 'available' : 'hidden';
		}
	}

	private renderPill(mode: PillMode): void {
		if (mode === 'hidden') {
			this.hidePill();
			return;
		}

		const host = this.ensurePillHost();
		if (!host) {
			return;
		}

		const pill = this.ensurePillElement(host);
		pill.classList.toggle('is-busy', mode === 'checking' || mode === 'downloading' || mode === 'updating');
		pill.classList.toggle('is-ready', mode === 'ready');
		pill.classList.toggle('is-clickable', mode === 'available' || mode === 'ready');
		pill.textContent = this.labelForMode(mode);
		pill.title = this.tooltipForMode(mode);
		pill.setAttribute('aria-label', pill.title);
		this.pillVisible = true;
	}

	private labelForMode(mode: PillMode): string {
		switch (mode) {
			case 'available':
				return localize('altusUpdateAvailable', "Update available");
			case 'checking':
				return localize('altusUpdateChecking', "Checking for updates...");
			case 'downloading':
				return localize('altusUpdateDownloading', "Downloading update...");
			case 'updating':
				return localize('altusUpdateInstalling', "Installing update...");
			case 'ready':
				return localize('altusUpdateRestart', "Restart to update");
			default:
				return '';
		}
	}

	private tooltipForMode(mode: PillMode): string {
		switch (mode) {
			case 'available':
				return localize('altusUpdateAvailableTooltip', "Click to download and install the latest Altus IDE update in the background.");
			case 'ready':
				return localize('altusUpdateRestartTooltip', "Click to restart Altus IDE and finish installing the update.");
			case 'checking':
			case 'downloading':
			case 'updating':
				return localize('altusUpdateBusyTooltip', "An update is being prepared. You can keep working.");
			default:
				return '';
		}
	}

	private ensurePillHost(): HTMLElement | undefined {
		const right = mainWindow.document.querySelector<HTMLElement>('.monaco-workbench .part.titlebar > .titlebar-container > .titlebar-right');
		return right ?? undefined;
	}

	private ensurePillElement(host: HTMLElement): HTMLElement {
		if (this.pillElement?.isConnected) {
			return this.pillElement;
		}

		const pill = mainWindow.document.createElement('button');
		pill.type = 'button';
		pill.className = 'altus-update-pill';
		this._register(addDisposableListener(pill, 'click', e => {
			e.preventDefault();
			e.stopPropagation();
			void this.onPillClick();
		}));

		const toolbar = host.querySelector('.action-toolbar-container');
		if (toolbar) {
			host.insertBefore(pill, toolbar);
		} else {
			host.prepend(pill);
		}

		this.pillElement = pill;
		return pill;
	}

	private async onPillClick(): Promise<void> {
		const state = this.updateService.state;
		if (state.type === StateType.Ready) {
			await this.updateService.quitAndInstall();
			return;
		}

		if (state.type === StateType.Idle && this.remoteUpdateAvailable) {
			await this.updateService.checkForUpdates(true);
		}
	}

	private hidePill(): void {
		if (!this.pillVisible && !this.pillElement?.isConnected) {
			return;
		}
		this.pillElement?.remove();
		this.pillElement = undefined;
		this.pillVisible = false;
	}
}

registerWorkbenchContribution2(
	EcosystemsUpdateTitlebarContribution.ID,
	EcosystemsUpdateTitlebarContribution,
	WorkbenchPhase.AfterRestored,
);
