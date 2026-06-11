/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ChatMessage } from '../../../../platform/ecosystems/common/ecosystemsAiTypes.js';
import {
	ECOSYSTEMS_AI_CHAT_NEW_SESSION_DAILY,
} from '../../../../platform/ecosystems/common/ecosystemsConfiguration.js';
import type { ChatCompactionState } from './ecosystemsChatCompaction.js';

export interface ChatSessionMeta {
	readonly id: string;
	title: string;
	readonly createdAt: number;
	updatedAt: number;
	readonly dayKey: string;
	messageCount: number;
}

interface SessionsIndexFile {
	version: number;
	activeSessionId: string;
	sessions: ChatSessionMeta[];
}

export type ChatSessionMode = 'ask' | 'agent' | 'plan';

export interface ChatCheckpoint {
	readonly id: string;
	label: string;
	readonly createdAt: number;
	messages: ChatMessage[];
	mode?: ChatSessionMode;
	compaction?: ChatCompactionState;
}

interface SessionFile {
	messages: ChatMessage[];
	mode?: ChatSessionMode;
	compaction?: ChatCompactionState;
	checkpoints?: ChatCheckpoint[];
}

export interface IEcosystemsChatSessionService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	initialize(): Promise<void>;
	getActiveSessionId(): string | undefined;
	getActiveSessionMeta(): ChatSessionMeta | undefined;
	listSessions(): readonly ChatSessionMeta[];
	getActiveMessages(): readonly ChatMessage[];
	getActiveMode(): ChatSessionMode | undefined;
	saveActiveMessages(messages: readonly ChatMessage[], mode?: ChatSessionMode): void;
	getActiveCompaction(): ChatCompactionState | undefined;
	setActiveCompaction(compaction: ChatCompactionState | undefined): void;
	listCheckpoints(): readonly ChatCheckpoint[];
	createCheckpoint(label?: string): Promise<ChatCheckpoint>;
	restoreCheckpoint(checkpointId: string): Promise<readonly ChatMessage[]>;
	createSession(title?: string): Promise<ChatSessionMeta>;
	switchSession(sessionId: string): Promise<readonly ChatMessage[]>;
	deleteSession(sessionId: string): Promise<void>;
}

export const IEcosystemsChatSessionService = createDecorator<IEcosystemsChatSessionService>('ecosystemsChatSessionService');

const INDEX_FILE = 'index.json';
const MAX_MESSAGES = 300;
const MAX_TOOL_OUTPUT_CHARS = 8000;
const MAX_CHECKPOINTS = 20;

export function formatDayKey(timestamp: number = Date.now()): string {
	const d = new Date(timestamp);
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

const SESSION_TITLE_MAX_LEN = 56;

/** Placeholder titles assigned at session creation (replaced after first user message). */
export function isAutoSessionTitle(title: string, dayKey?: string): boolean {
	const t = title.trim();
	if (!t) {
		return true;
	}
	if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
		return true;
	}
	if (t === 'Today' || t === localize('ecosystemsAiSessionToday', 'Today')) {
		return true;
	}
	if (t === localize('ecosystemsAiNewChat', 'New chat')) {
		return true;
	}
	if (dayKey && t === formatSessionTitleFromDayKey(dayKey)) {
		return true;
	}
	return false;
}

export function formatSessionTitleFromDayKey(dayKey: string): string {
	const today = formatDayKey();
	if (dayKey === today) {
		return localize('ecosystemsAiNewChat', 'New chat');
	}
	const parts = dayKey.split('-').map(Number);
	if (parts.length !== 3 || parts.some(Number.isNaN)) {
		return dayKey;
	}
	const [y, m, d] = parts;
	const date = new Date(y, m - 1, d);
	const now = new Date();
	const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
	if (date.getFullYear() !== now.getFullYear()) {
		opts.year = 'numeric';
	}
	return date.toLocaleDateString(undefined, opts);
}

function stripUserMessageForTitle(content: string): string {
	const m = content.match(/<\/attached_(?:files|context)>\s*([\s\S]*)$/);
	return (m ? m[1] : content).replace(/\s+/g, ' ').trim();
}

/** First user message, shortened -- used as the persisted session title. */
export function deriveSessionTitleFromMessages(messages: readonly ChatMessage[]): string | undefined {
	for (const msg of messages) {
		if (msg.role !== 'user') {
			continue;
		}
		const raw = (msg.displayContent?.trim() || (typeof msg.content === 'string' ? msg.content : '')).trim();
		const text = stripUserMessageForTitle(raw);
		if (!text) {
			continue;
		}
		return text.length > SESSION_TITLE_MAX_LEN
			? `${text.slice(0, SESSION_TITLE_MAX_LEN - 1)}...`
			: text;
	}
	return undefined;
}

function defaultSessionTitle(dayKey: string): string {
	return formatSessionTitleFromDayKey(dayKey);
}

export class EcosystemsChatSessionService extends Disposable implements IEcosystemsChatSessionService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private sessionsRoot: URI | undefined;
	private index: SessionsIndexFile | undefined;
	private activeMessages: ChatMessage[] = [];
	private activeMode: ChatSessionMode | undefined;
	private activeCompaction: ChatCompactionState | undefined;
	private activeCheckpoints: ChatCheckpoint[] = [];
	private saveTimer: ReturnType<typeof setTimeout> | undefined;

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
	}

	async initialize(): Promise<void> {
		if (this.index) {
			return;
		}
		this.sessionsRoot = joinPath(this.userDataProfilesService.defaultProfile.globalStorageHome, 'ecosystems-ai', 'chat-sessions');
		await this.fileService.createFolder(this.sessionsRoot);
		this.index = await this.readIndex();
		await this.migrateSessionTitles();
		await this.pruneEmptySessions();

		const newSessionDaily = this.configurationService.getValue<boolean>(ECOSYSTEMS_AI_CHAT_NEW_SESSION_DAILY) !== false;
		const today = formatDayKey();
		const active = this.getActiveSessionMeta();

		if (!active) {
			await this.createSession();
			return;
		}

		if (newSessionDaily && active.dayKey !== today) {
			await this.createSession();
			return;
		}

		await this.loadSessionMessages(active.id);
	}

	getActiveSessionId(): string | undefined {
		return this.index?.activeSessionId;
	}

	getActiveSessionMeta(): ChatSessionMeta | undefined {
		const id = this.index?.activeSessionId;
		if (!id || !this.index) {
			return undefined;
		}
		return this.index.sessions.find(s => s.id === id);
	}

	listSessions(): readonly ChatSessionMeta[] {
		if (!this.index) {
			return [];
		}
		return [...this.index.sessions]
			.filter(s => s.messageCount > 0)
			.sort((a, b) => b.updatedAt - a.updatedAt);
	}

	getActiveMessages(): readonly ChatMessage[] {
		return this.activeMessages;
	}

	getActiveMode(): ChatSessionMode | undefined {
		return this.activeMode;
	}

	getActiveCompaction(): ChatCompactionState | undefined {
		return this.activeCompaction;
	}

	setActiveCompaction(compaction: ChatCompactionState | undefined): void {
		this.activeCompaction = compaction;
		this.scheduleSave();
	}

	listCheckpoints(): readonly ChatCheckpoint[] {
		return this.activeCheckpoints;
	}

	async createCheckpoint(label?: string): Promise<ChatCheckpoint> {
		await this.ensureIndex();
		const now = Date.now();
		const checkpoint: ChatCheckpoint = {
			id: generateUuid(),
			label: label?.trim() || localize('ecosystemsAiCheckpointDefault', 'Checkpoint {0}', this.activeCheckpoints.length + 1),
			createdAt: now,
			messages: this.activeMessages.map(m => this.sanitizeForStorage(m)),
			mode: this.activeMode,
			compaction: this.activeCompaction ? { ...this.activeCompaction } : undefined,
		};
		this.activeCheckpoints.unshift(checkpoint);
		if (this.activeCheckpoints.length > MAX_CHECKPOINTS) {
			this.activeCheckpoints.length = MAX_CHECKPOINTS;
		}
		await this.flushToDisk();
		this._onDidChange.fire();
		return checkpoint;
	}

	async restoreCheckpoint(checkpointId: string): Promise<readonly ChatMessage[]> {
		await this.ensureIndex();
		const cp = this.activeCheckpoints.find(c => c.id === checkpointId);
		if (!cp) {
			return this.activeMessages;
		}
		this.activeMessages = cp.messages.map(m => ({ ...m }));
		this.activeMode = cp.mode;
		this.activeCompaction = cp.compaction ? { ...cp.compaction } : undefined;
		const meta = this.getActiveSessionMeta();
		if (meta) {
			meta.messageCount = this.activeMessages.length;
			meta.updatedAt = Date.now();
		}
		await this.flushToDisk();
		this._onDidChange.fire();
		return this.activeMessages;
	}

	saveActiveMessages(messages: readonly ChatMessage[], mode?: ChatSessionMode): void {
		if (mode !== undefined) {
			this.activeMode = mode;
		}
		const persistable = messages
			.filter(m => m.role === 'user' || m.role === 'assistant' || m.role === 'tool')
			.slice(-MAX_MESSAGES)
			.map(m => this.sanitizeForStorage(m));

		this.activeMessages = persistable.map(m => ({ ...m }));

		const meta = this.getActiveSessionMeta();
		if (meta) {
			meta.messageCount = this.activeMessages.length;
			meta.updatedAt = Date.now();
			if (isAutoSessionTitle(meta.title, meta.dayKey)) {
				const derived = deriveSessionTitleFromMessages(this.activeMessages);
				if (derived) {
					meta.title = derived;
				}
			}
		}

		if (this.activeMessages.length > 0) {
			void this.pruneEmptySessions();
		}

		if (this.saveTimer) {
			clearTimeout(this.saveTimer);
		}
		this.saveTimer = setTimeout(() => {
			this.saveTimer = undefined;
			void this.flushToDisk();
		}, 400);
	}

	async createSession(title?: string): Promise<ChatSessionMeta> {
		await this.ensureIndex();
		const now = Date.now();
		const dayKey = formatDayKey(now);
		const meta: ChatSessionMeta = {
			id: generateUuid(),
			title: title?.trim() || defaultSessionTitle(dayKey),
			createdAt: now,
			updatedAt: now,
			dayKey,
			messageCount: 0,
		};
		this.index!.sessions.unshift(meta);
		this.index!.activeSessionId = meta.id;
		this.activeMessages = [];
		this.activeMode = undefined;
		this.activeCompaction = undefined;
		this.activeCheckpoints = [];
		await this.writeSessionFile(meta.id, { messages: [] });
		await this.pruneEmptySessions();
		await this.writeIndex();
		this._onDidChange.fire();
		return meta;
	}

	async switchSession(sessionId: string): Promise<readonly ChatMessage[]> {
		await this.ensureIndex();
		const meta = this.index!.sessions.find(s => s.id === sessionId);
		if (!meta) {
			return this.activeMessages;
		}
		this.index!.activeSessionId = sessionId;
		await this.loadSessionMessages(sessionId);
		meta.updatedAt = Date.now();
		await this.writeIndex();
		this._onDidChange.fire();
		return this.activeMessages;
	}

	async deleteSession(sessionId: string): Promise<void> {
		await this.ensureIndex();
		const idx = this.index!.sessions.findIndex(s => s.id === sessionId);
		if (idx < 0) {
			return;
		}
		this.index!.sessions.splice(idx, 1);
		try {
			await this.fileService.del(joinPath(this.sessionsRoot!, `${sessionId}.json`));
		} catch {
			// ignore
		}
		if (this.index!.activeSessionId === sessionId) {
			if (this.index!.sessions.length > 0) {
				await this.switchSession(this.index!.sessions[0].id);
			} else {
				await this.createSession();
			}
		} else {
			await this.writeIndex();
			this._onDidChange.fire();
		}
	}

	private async ensureIndex(): Promise<void> {
		if (!this.index) {
			await this.initialize();
		}
	}

	/** Drop abandoned empty sessions from history (keep the active draft). */
	private async pruneEmptySessions(): Promise<void> {
		if (!this.index || !this.sessionsRoot) {
			return;
		}
		const activeId = this.index.activeSessionId;
		const removeIds: string[] = [];
		this.index.sessions = this.index.sessions.filter(s => {
			if (s.messageCount === 0 && s.id !== activeId) {
				removeIds.push(s.id);
				return false;
			}
			return true;
		});
		for (const id of removeIds) {
			try {
				await this.fileService.del(joinPath(this.sessionsRoot, `${id}.json`));
			} catch {
				// ignore missing files
			}
		}
		if (removeIds.length > 0) {
			await this.writeIndex();
			this._onDidChange.fire();
		}
	}

	/** Backfill titles for sessions still named "Today" / day keys / "New chat". */
	private async migrateSessionTitles(): Promise<void> {
		if (!this.index || !this.sessionsRoot) {
			return;
		}
		let changed = false;
		for (const meta of this.index.sessions) {
			if (!isAutoSessionTitle(meta.title, meta.dayKey)) {
				continue;
			}
			const file = await this.readSessionFile(meta.id);
			const derived = file?.messages?.length
				? deriveSessionTitleFromMessages(file.messages)
				: undefined;
			const next = derived ?? formatSessionTitleFromDayKey(meta.dayKey);
			if (next !== meta.title) {
				meta.title = next;
				changed = true;
			}
		}
		if (changed) {
			await this.writeIndex();
			this._onDidChange.fire();
		}
	}

	private async loadSessionMessages(sessionId: string): Promise<void> {
		const file = await this.readSessionFile(sessionId);
		this.activeMessages = file?.messages ?? [];
		this.activeMode = file?.mode;
		this.activeCompaction = file?.compaction;
		this.activeCheckpoints = file?.checkpoints ?? [];
	}

	private scheduleSave(): void {
		if (this.saveTimer) {
			clearTimeout(this.saveTimer);
		}
		this.saveTimer = setTimeout(() => {
			this.saveTimer = undefined;
			void this.flushToDisk();
		}, 400);
	}

	private sanitizeForStorage(message: ChatMessage): ChatMessage {
		const { images: _images, ...rest } = message;
		let out: ChatMessage = { ...rest };
		if (out.role === 'tool' && out.content.length > MAX_TOOL_OUTPUT_CHARS) {
			out = {
				...out,
				content: out.content.slice(0, MAX_TOOL_OUTPUT_CHARS) + '\n...[truncated for session storage]',
			};
		}
		return out;
	}

	private async flushToDisk(): Promise<void> {
		if (!this.index || !this.sessionsRoot) {
			return;
		}
		const id = this.index.activeSessionId;
		if (!id) {
			return;
		}
		await this.writeSessionFile(id, {
			messages: this.activeMessages,
			mode: this.activeMode,
			compaction: this.activeCompaction,
			checkpoints: this.activeCheckpoints,
		});
		await this.writeIndex();
	}

	private async readIndex(): Promise<SessionsIndexFile> {
		const uri = joinPath(this.sessionsRoot!, INDEX_FILE);
		try {
			const raw = (await this.fileService.readFile(uri)).value.toString();
			const parsed = JSON.parse(raw) as SessionsIndexFile;
			if (parsed?.version === 1 && Array.isArray(parsed.sessions)) {
				return parsed;
			}
		} catch {
			// fresh index
		}
		return { version: 1, activeSessionId: '', sessions: [] };
	}

	private async writeIndex(): Promise<void> {
		if (!this.sessionsRoot || !this.index) {
			return;
		}
		await this.fileService.writeFile(
			joinPath(this.sessionsRoot, INDEX_FILE),
			VSBuffer.fromString(JSON.stringify(this.index, null, 2)),
		);
	}

	private async readSessionFile(sessionId: string): Promise<SessionFile | undefined> {
		try {
			const raw = (await this.fileService.readFile(joinPath(this.sessionsRoot!, `${sessionId}.json`))).value.toString();
			return JSON.parse(raw) as SessionFile;
		} catch {
			return undefined;
		}
	}

	private async writeSessionFile(sessionId: string, data: SessionFile): Promise<void> {
		await this.fileService.writeFile(
			joinPath(this.sessionsRoot!, `${sessionId}.json`),
			VSBuffer.fromString(JSON.stringify(data, null, 2)),
		);
	}

	override dispose(): void {
		if (this.saveTimer) {
			clearTimeout(this.saveTimer);
			void this.flushToDisk();
		}
		super.dispose();
	}
}

registerSingleton(IEcosystemsChatSessionService, EcosystemsChatSessionService, InstantiationType.Delayed);
