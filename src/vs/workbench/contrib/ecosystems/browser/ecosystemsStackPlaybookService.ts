/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { parse } from '../../../../base/common/json.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { FileAccess } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { streamToBuffer, VSBuffer } from '../../../../base/common/buffer.js';
import { dirname } from '../../../../base/common/resources.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import {
	ECOSYSTEMS_AI_STACK_PLAYBOOKS_ENABLED,
	ECOSYSTEMS_AI_STACK_PLAYBOOKS_LOCAL_URI,
	ECOSYSTEMS_AI_STACK_PLAYBOOKS_REMOTE_URL,
} from '../../../../platform/ecosystems/common/ecosystemsConfiguration.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IRequestService } from '../../../../platform/request/common/request.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { StackPlaybook, StackPlaybooksFile } from '../common/stackPlaybookTypes.js';

export interface AgentPlaybookPromptOptions {
	readonly workspaceLooksEmpty: boolean;
}

export interface IEcosystemsStackPlaybookService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	initialize(): Promise<void>;
	refresh(): Promise<void>;
	getPlaybooks(): readonly StackPlaybook[];
	buildAgentPlaybooksSection(options: AgentPlaybookPromptOptions): string;
}

export const IEcosystemsStackPlaybookService = createDecorator<IEcosystemsStackPlaybookService>('ecosystemsStackPlaybookService');

const BUNDLED_PLAYBOOKS_URI = FileAccess.asFileUri('vs/workbench/contrib/ecosystems/common/stack-playbooks.json');

function isPlaybooksFile(value: unknown): value is StackPlaybooksFile {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const o = value as StackPlaybooksFile;
	return Array.isArray(o.stacks) && o.stacks.every(s => s && typeof s.id === 'string' && typeof s.scaffoldCommand === 'string');
}

function mergePlaybooks(base: readonly StackPlaybook[], override: readonly StackPlaybook[]): StackPlaybook[] {
	const byId = new Map<string, StackPlaybook>();
	for (const s of base) {
		byId.set(s.id, s);
	}
	for (const s of override) {
		byId.set(s.id, { ...byId.get(s.id), ...s });
	}
	return [...byId.values()];
}

export class EcosystemsStackPlaybookService extends Disposable implements IEcosystemsStackPlaybookService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private stacks: StackPlaybook[] = [];
	private initPromise: Promise<void> | undefined;

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IRequestService private readonly requestService: IRequestService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ECOSYSTEMS_AI_STACK_PLAYBOOKS_LOCAL_URI)
				|| e.affectsConfiguration(ECOSYSTEMS_AI_STACK_PLAYBOOKS_REMOTE_URL)
				|| e.affectsConfiguration(ECOSYSTEMS_AI_STACK_PLAYBOOKS_ENABLED)) {
				this.initPromise = undefined;
				void this.refresh();
			}
		}));
	}

	async initialize(): Promise<void> {
		if (!this.initPromise) {
			this.initPromise = this.loadAll();
		}
		await this.initPromise;
	}

	async refresh(): Promise<void> {
		this.initPromise = this.loadAll();
		await this.initPromise;
		this._onDidChange.fire();
	}

	getPlaybooks(): readonly StackPlaybook[] {
		return this.stacks;
	}

	buildAgentPlaybooksSection(options: AgentPlaybookPromptOptions): string {
		if (!this.isEnabled()) {
			return '';
		}
		if (!this.stacks.length) {
			return '## Stack playbooks\n(No playbooks loaded -- check Altus stack playbook settings.)\n\n';
		}

		const lines: string[] = [
			'## Standard stack playbooks (Altus AI)',
			'Follow these **official scaffold commands** for the stack the user requested. Do not hand-write full project trees when a playbook exists.',
			'Playbooks are loaded from the IDE (bundled + optional local/remote overrides).',
			'',
			'### Stack-first rule',
			'The user message defines the stack. Never default to Node/npm unless they asked for JavaScript/TypeScript.',
			'If unclear, ask one short question; if the workspace is empty and intent is obvious, use the matching playbook below.',
			'',
			'| Stack | Scaffold (empty workspace, run at project root, often `.`) | After scaffold | Dev server |',
			'| --- | --- | --- | --- |',
		];

		for (const s of this.stacks) {
			const after = s.postScaffold?.length ? s.postScaffold.join(' -> ') : '--';
			const dev = s.devServer?.command ?? '--';
			lines.push(`| ${s.name} | \`${s.scaffoldCommand}\` | ${after} | \`${dev}\` |`);
		}

		lines.push('', '### Per-stack notes');
		for (const s of this.stacks) {
			lines.push(`**${s.name}** (\`${s.id}\`)`);
			if (s.folderStructure) {
				lines.push(`- Structure: ${s.folderStructure}`);
			}
			if (s.forbiddenWhenExists?.length) {
				lines.push(`- Do **not** re-run when project exists: ${s.forbiddenWhenExists.map(f => `\`${f}\``).join(', ')}`);
			}
			for (const p of s.pitfalls ?? []) {
				lines.push(`- ${p}`);
			}
			lines.push('');
		}

		if (options.workspaceLooksEmpty) {
			lines.push(
				'**Workspace looks empty** -- pick the playbook for the requested stack, run scaffold via `run_in_terminal`, then `list_directory` before `write_file`.',
				'',
			);
		} else {
			lines.push(
				'**Workspace has files** -- detect stack from tree/package files; do **not** re-run scaffold CLIs. Use `list_directory` / `read_file`, then edit.',
				'',
			);
		}

		return lines.join('\n');
	}

	private isEnabled(): boolean {
		return this.configurationService.getValue<boolean>(ECOSYSTEMS_AI_STACK_PLAYBOOKS_ENABLED) !== false;
	}

	private async loadAll(): Promise<void> {
		if (!this.isEnabled()) {
			this.stacks = [];
			return;
		}

		let merged: StackPlaybook[] = [];
		try {
			const bundled = await this.readPlaybooksFile(BUNDLED_PLAYBOOKS_URI);
			if (bundled) {
				merged = [...bundled.stacks];
				this.logService.trace(`[Altus] loaded ${merged.length} bundled stack playbooks (v${bundled.version})`);
			}
		} catch (err) {
			this.logService.error('[Altus] failed to load bundled stack playbooks', err);
		}

		const localUri = this.resolveLocalPlaybooksUri();
		if (localUri) {
			try {
				const local = await this.readPlaybooksFile(localUri);
				if (local?.stacks.length) {
					merged = mergePlaybooks(merged, local.stacks);
					this.logService.info(`[Altus] merged stack playbooks from ${localUri.toString()}`);
				}
			} catch (err) {
				this.logService.warn('[Altus] stack playbooks local file failed', err);
			}
		}

		const remote = await this.fetchRemotePlaybooks();
		if (remote?.stacks.length) {
			merged = mergePlaybooks(merged, remote.stacks);
			this.logService.info(`[Altus] merged ${remote.stacks.length} remote stack playbooks`);
		}

		this.stacks = merged;
	}

	private async readPlaybooksFile(uri: URI): Promise<StackPlaybooksFile | undefined> {
		if (!(await this.fileService.exists(uri))) {
			return undefined;
		}
		const raw = (await this.fileService.readFile(uri)).value.toString();
		const parsed = parse(raw);
		if (!isPlaybooksFile(parsed)) {
			this.logService.warn('[Altus] invalid stack playbooks file', uri.toString());
			return undefined;
		}
		return parsed;
	}

	private resolveLocalPlaybooksUri(): URI | undefined {
		const configured = this.configurationService.getValue<string>(ECOSYSTEMS_AI_STACK_PLAYBOOKS_LOCAL_URI)?.trim();
		if (!configured) {
			return undefined;
		}
		if (/^https?:\/\//i.test(configured)) {
			return undefined;
		}
		try {
			return configured.includes('://') ? URI.parse(configured) : URI.file(configured);
		} catch {
			return undefined;
		}
	}

	private async fetchRemotePlaybooks(): Promise<StackPlaybooksFile | undefined> {
		const url = this.configurationService.getValue<string>(ECOSYSTEMS_AI_STACK_PLAYBOOKS_REMOTE_URL)?.trim();
		if (!url) {
			return undefined;
		}
		try {
			const context = await this.requestService.request({ type: 'GET', url, timeout: 15_000 }, CancellationToken.None);
			if (context.res.statusCode && context.res.statusCode >= 400) {
				this.logService.warn(`[Altus] stack playbooks remote HTTP ${context.res.statusCode}`);
				return await this.readCachedRemotePlaybooks();
			}
			const body = (await streamToBuffer(context.stream)).toString();
			const parsed = parse(body);
			if (!isPlaybooksFile(parsed)) {
				return await this.readCachedRemotePlaybooks();
			}
			await this.writeCachedRemotePlaybooks(body);
			return parsed;
		} catch (err) {
			this.logService.warn('[Altus] stack playbooks remote fetch failed', err);
			return await this.readCachedRemotePlaybooks();
		}
	}

	private getRemoteCacheUri(): URI {
		return URI.joinPath(this.environmentService.userRoamingDataHome, 'ecosystems', 'stack-playbooks.remote.json');
	}

	private async readCachedRemotePlaybooks(): Promise<StackPlaybooksFile | undefined> {
		return this.readPlaybooksFile(this.getRemoteCacheUri());
	}

	private async writeCachedRemotePlaybooks(body: string): Promise<void> {
		const uri = this.getRemoteCacheUri();
		await this.fileService.createFolder(dirname(uri));
		await this.fileService.writeFile(uri, VSBuffer.fromString(body));
	}
}

registerSingleton(IEcosystemsStackPlaybookService, EcosystemsStackPlaybookService, InstantiationType.Delayed);
