/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import './media/ecosystemsChat.css';
import { CancellationTokenSource, CancellationToken } from '../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { basename, posix } from '../../../../base/common/path.js';
import * as dom from '../../../../base/browser/dom.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ITerminalService } from '../../terminal/browser/terminal.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ISearchService, QueryType, IFileQuery } from '../../../services/search/common/search.js';
import { ECOSYSTEMS_AI_CHAT_VIEW_ID, ECOSYSTEMS_AI_COMMAND_SIGN_IN } from '../../../../platform/ecosystems/common/constants.js';
import { IEcosystemsAiService } from '../../../../platform/ecosystems/common/ecosystemsAiService.js';
import { IEcosystemsSessionService } from '../../../../platform/ecosystems/common/ecosystemsSessionService.js';
import { ChatMessage, ChatToolCall, GatewayModelInfo } from '../../../../platform/ecosystems/common/ecosystemsAiTypes.js';
import { AGENT_TOOLS, EcosystemsAgentTools } from './ecosystemsAgentTools.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { Action, IAction, Separator } from '../../../../base/common/actions.js';
import { IViewPaneOptions, ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IViewDescriptorService } from '../../../common/views.js';

interface AttachedFile {
	readonly uri: URI;
	readonly label: string; // workspace-relative path
}

type ChatMode = 'ask' | 'agent';

const DEFAULT_MODELS: GatewayModelInfo[] = [
	{ id: 'claude-opus-4.7', displayName: 'Claude Opus 4.7', tier: 'pro', features: ['chat', 'agent'] },
	{ id: 'claude-sonnet-4', displayName: 'Claude Sonnet 4', tier: 'pro', features: ['chat', 'agent'] },
	{ id: 'gpt-4o', displayName: 'GPT-4o', tier: 'pro', features: ['chat', 'agent'] },
	{ id: 'gpt-4o-mini', displayName: 'GPT-4o mini', tier: 'free', features: ['chat'] },
];

export class EcoSystemsChatViewPane extends ViewPane {

	static readonly ID = ECOSYSTEMS_AI_CHAT_VIEW_ID;

	private bodyContainer: HTMLElement | undefined;
	private messagesEl: HTMLElement | undefined;
	private inputEl: HTMLTextAreaElement | undefined;
	private sendButton: HTMLButtonElement | undefined;
	private modeButtonLabel: HTMLElement | undefined;
	private modelButtonLabel: HTMLElement | undefined;
	private statusEl: HTMLElement | undefined;
	private attachmentsEl: HTMLElement | undefined;
	private mentionPopupEl: HTMLElement | undefined;
	private mentionItems: AttachedFile[] = [];
	private mentionActiveIndex = 0;
	private mentionTokenStart = -1;
	private mentionSearchCts: CancellationTokenSource | undefined;
	private readonly attachedFiles: AttachedFile[] = [];

	private readonly chatHistory: ChatMessage[] = [];
	private activeRequest: CancellationTokenSource | undefined;
	private mode: ChatMode = 'agent';
	private model: GatewayModelInfo = DEFAULT_MODELS[0];
	private models: GatewayModelInfo[] = DEFAULT_MODELS;
	private isStreaming = false;

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IHoverService hoverService: IHoverService,
		@IEcosystemsAiService private readonly aiService: IEcosystemsAiService,
		@IEcosystemsSessionService private readonly sessionService: IEcosystemsSessionService,
		@ICommandService private readonly commandService: ICommandService,
		@ISearchService private readonly searchService: ISearchService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IFileService private readonly fileService: IFileService,
		@ITerminalService private readonly terminalService: ITerminalService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);
		this.agentTools = instantiationService.createInstance(EcosystemsAgentTools);
	}

	private readonly agentTools: EcosystemsAgentTools;
	private lastSignedIn: boolean | undefined;
	private modelsLoaded = false;

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		container.classList.add('ecosystems-ai-chat');
		this.bodyContainer = dom.append(container, dom.$('.ecosystems-ai-body'));

		this._register(this.sessionService.onDidChangeSession(() => this.refreshUi()));
		this.refreshUi();
	}

	private async refreshUi(): Promise<void> {
		if (!this.bodyContainer) {
			return;
		}

		const signedIn = await this.sessionService.isSignedIn();
		// Skip re-render when the sign-in state has not actually changed. Secret-storage
		// writes from the env-keys contribution otherwise cause a duplicate render +
		// duplicate model-list fetch right after launch.
		if (this.lastSignedIn === signedIn && this.messagesEl) {
			return;
		}
		this.lastSignedIn = signedIn;

		dom.clearNode(this.bodyContainer);
		this.messagesEl = undefined;
		this.inputEl = undefined;
		this.sendButton = undefined;
		this.statusEl = undefined;

		if (!signedIn) {
			this.renderSignedOut(this.bodyContainer);
			return;
		}

		this.renderChat(this.bodyContainer);
		// Don't fetch models on first paint — render with DEFAULT_MODELS and lazily
		// load when the user first opens the model picker. Saves ~1-2s of HTTP at boot.
	}

	private renderSignedOut(container: HTMLElement): void {
		const panel = dom.append(container, dom.$('.ecosystems-ai-signed-out'));

		const icon = dom.append(panel, dom.$('.hero-icon.codicon.codicon-sparkle'));
		icon.setAttribute('aria-hidden', 'true');

		const title = dom.append(panel, dom.$('.hero-title'));
		title.textContent = localize('ecosystemsAiSignInTitle', 'Sign in to EcoSystems');

		const detail = dom.append(panel, dom.$('.hero-detail'));
		detail.textContent = localize(
			'ecosystemsAiSignInDetail',
			'AI is included with your EcoSystems plan. Sign in to use chat and inline completion — no API keys required.'
		);

		const button = dom.append(panel, dom.$('button.hero-button')) as HTMLButtonElement;
		button.textContent = localize('ecosystemsAiSignInButton', 'Sign in');
		button.onclick = () => this.commandService.executeCommand(ECOSYSTEMS_AI_COMMAND_SIGN_IN);
	}

	private renderChat(container: HTMLElement): void {
		this.messagesEl = dom.append(container, dom.$('.ecosystems-ai-messages'));

		this.appendAssistantMessage(localize(
			'ecosystemsAiChatReady',
			'Hi! I\'m EcoSystems AI. Ask a question about your code, or switch to Agent mode to make changes.'
		));

		const composer = dom.append(container, dom.$('.ecosystems-ai-composer'));

		// Attachments row (chips for @-tagged files). Hidden when empty.
		this.attachmentsEl = dom.append(composer, dom.$('.composer-attachments'));
		this.renderAttachments();

		this.inputEl = dom.append(composer, dom.$('textarea')) as HTMLTextAreaElement;
		this.inputEl.placeholder = localize('ecosystemsAiInputPlaceholder', 'Ask EcoSystems AI…  (type @ to attach files)');
		this.inputEl.rows = 2;
		this.inputEl.onkeydown = e => {
			// Mention popup keyboard handling takes precedence.
			if (this.mentionPopupEl && this.mentionItems.length) {
				if (e.key === 'ArrowDown') {
					e.preventDefault();
					this.moveMentionSelection(1);
					return;
				}
				if (e.key === 'ArrowUp') {
					e.preventDefault();
					this.moveMentionSelection(-1);
					return;
				}
				if (e.key === 'Enter' || e.key === 'Tab') {
					e.preventDefault();
					this.commitMention(this.mentionItems[this.mentionActiveIndex]);
					return;
				}
				if (e.key === 'Escape') {
					e.preventDefault();
					this.closeMentionPopup();
					return;
				}
			}
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				this.sendMessage();
			}
		};
		this.inputEl.oninput = () => this.handleInputForMention();

		// Mention popup overlay (positioned absolutely above the composer).
		this.mentionPopupEl = dom.append(composer, dom.$('.composer-mention-popup'));
		this.mentionPopupEl.style.display = 'none';

		const toolbar = dom.append(composer, dom.$('.composer-toolbar'));

		// Attach (opens @-mention picker programmatically)
		const attachBtn = this.makeButton(toolbar, 'codicon-add', localize('ecosystemsAiAttach', 'Attach files'), true);
		attachBtn.classList.add('icon-only');
		attachBtn.onclick = () => this.openMentionPickerFromButton();

		// Mode dropdown (Ask / Agent)
		const modeBtn = this.makeButton(toolbar, 'codicon-hubot', this.modeLabel());
		this.modeButtonLabel = modeBtn.querySelector('.label') as HTMLElement;
		const modeChev = dom.append(modeBtn, dom.$('span.codicon.codicon-chevron-down.chev'));
		modeChev.setAttribute('aria-hidden', 'true');
		modeBtn.onclick = () => this.pickMode(modeBtn);

		// Model dropdown
		const modelBtn = this.makeButton(toolbar, 'codicon-circuit-board', this.model.displayName);
		this.modelButtonLabel = modelBtn.querySelector('.label') as HTMLElement;
		const modelChev = dom.append(modelBtn, dom.$('span.codicon.codicon-chevron-down.chev'));
		modelChev.setAttribute('aria-hidden', 'true');
		modelBtn.onclick = () => this.pickModel(modelBtn);

		// Settings (placeholder)
		const settingsBtn = this.makeButton(toolbar, 'codicon-settings-gear', localize('ecosystemsAiSettings', 'Chat settings'), true);
		settingsBtn.classList.add('icon-only');
		settingsBtn.onclick = () => this.commandService.executeCommand('workbench.action.openSettings', 'ecosystems.ai');

		dom.append(toolbar, dom.$('.spacer'));

		// Send / Stop (morphs while streaming)
		this.sendButton = dom.append(toolbar, dom.$('button.composer-btn.send.icon-only')) as HTMLButtonElement;
		this.sendButton.title = localize('ecosystemsAiSend', 'Send');
		this.sendButton.setAttribute('aria-label', localize('ecosystemsAiSend', 'Send'));
		const sendIcon = dom.append(this.sendButton, dom.$('span.codicon.codicon-arrow-up'));
		sendIcon.setAttribute('aria-hidden', 'true');
		this.sendButton.onclick = () => {
			if (this.isStreaming) {
				this.activeRequest?.cancel();
			} else {
				this.sendMessage();
			}
		};

		// Status bar
		this.statusEl = dom.append(container, dom.$('.ecosystems-ai-statusbar'));
		this.renderStatus();
	}

	private makeButton(parent: HTMLElement, iconClass: string, label: string, iconOnly = false): HTMLButtonElement {
		const btn = dom.append(parent, dom.$('button.composer-btn')) as HTMLButtonElement;
		btn.type = 'button';
		const icon = dom.append(btn, dom.$(`span.codicon.${iconClass}`));
		icon.setAttribute('aria-hidden', 'true');
		if (iconOnly) {
			btn.title = label;
			btn.setAttribute('aria-label', label);
		} else {
			const labelEl = dom.append(btn, dom.$('span.label'));
			labelEl.textContent = label;
		}
		return btn;
	}

	private modeLabel(): string {
		return this.mode === 'agent'
			? localize('ecosystemsAiModeAgent', 'Agent')
			: localize('ecosystemsAiModeAsk', 'Ask');
	}

	private pickMode(anchor: HTMLElement): void {
		const modes: { id: ChatMode; label: string }[] = [
			{ id: 'agent', label: localize('ecosystemsAiModeAgent', 'Agent') },
			{ id: 'ask', label: localize('ecosystemsAiModeAsk', 'Ask') },
		];
		const actions = modes.map(m => {
			const action = new Action(`ecosystems.ai.mode.${m.id}`, m.label, undefined, true, async () => {
				this.mode = m.id;
				if (this.modeButtonLabel) {
					this.modeButtonLabel.textContent = this.modeLabel();
				}
				this.renderStatus();
			});
			action.checked = this.mode === m.id;
			return action;
		});
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => actions,
			onHide: () => actions.forEach(a => a.dispose()),
		});
	}

	private async pickModel(anchor: HTMLElement, showAll: boolean = false): Promise<void> {
		// Always refresh the list right before showing it so newly-loaded API
		// keys (e.g. from .env.local) are reflected without restarting.
		await this.loadModels();
		const popular = showAll ? this.models : this.filterPopularModels(this.models);
		const actions: IAction[] = popular.map(m => {
			const label = m.tier ? `${m.displayName}  (${m.tier})` : m.displayName;
			const action = new Action(`ecosystems.ai.model.${m.id}`, label, undefined, true, async () => {
				this.model = m;
				if (this.modelButtonLabel) {
					this.modelButtonLabel.textContent = this.model.displayName;
				}
			});
			action.checked = this.model.id === m.id;
			return action;
		});
		if (!showAll && popular.length < this.models.length) {
			actions.push(new Separator());
			actions.push(new Action(
				'ecosystems.ai.model.showAll',
				localize('ecosystemsAiShowAllModels', 'Show all models…'),
				undefined,
				true,
				async () => this.pickModel(anchor, true),
			));
		}
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => actions,
			onHide: () => actions.forEach(a => { if (a instanceof Action) { a.dispose(); } }),
		});
	}

	private filterPopularModels(all: readonly GatewayModelInfo[]): GatewayModelInfo[] {
		// Curated short list of widely-used, current-generation models.
		// Match by id prefix so we tolerate dated suffixes like `-20240620`.
		const popularPrefixes = [
			// Anthropic
			'claude-opus-4', 'claude-sonnet-4', 'claude-3-7-sonnet', 'claude-3-5-sonnet', 'claude-3-5-haiku',
			// OpenAI
			'gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o1', 'o3-mini',
		];
		const seen = new Set<string>();
		const result: GatewayModelInfo[] = [];
		for (const prefix of popularPrefixes) {
			// Prefer exact id, else first match starting with the prefix.
			const exact = all.find(m => m.id === prefix);
			const match = exact ?? all.find(m => m.id.startsWith(prefix) && !seen.has(m.id));
			if (match && !seen.has(match.id)) {
				seen.add(match.id);
				result.push(match);
			}
		}
		// Always include the currently-selected model so it remains visible.
		if (!seen.has(this.model.id)) {
			const current = all.find(m => m.id === this.model.id);
			if (current) {
				result.unshift(current);
			}
		}
		return result.length ? result : all.slice(0, 6);
	}

	private async loadModels(): Promise<void> {
		if (this.modelsLoaded) {
			return;
		}
		this.modelsLoaded = true;
		try {
			const fetched = await this.aiService.getAvailableModels();
			if (fetched && fetched.length) {
				this.models = fetched;
				if (!fetched.find(m => m.id === this.model.id)) {
					this.model = fetched[0];
					if (this.modelButtonLabel) {
						this.modelButtonLabel.textContent = this.model.displayName;
					}
				}
			}
		} catch {
			// Keep defaults — gateway might be unreachable in dev.
			this.modelsLoaded = false; // allow retry on next picker open
		}
	}

	private renderStatus(): void {
		if (!this.statusEl) {
			return;
		}
		dom.clearNode(this.statusEl);

		const env = dom.append(this.statusEl, dom.$('span'));
		const envIcon = dom.append(env, dom.$('span.codicon.codicon-vm'));
		envIcon.setAttribute('aria-hidden', 'true');
		dom.append(env, document.createTextNode(localize('ecosystemsAiStatusLocal', 'Local')));

		const approvals = dom.append(this.statusEl, dom.$('span'));
		const apIcon = dom.append(approvals, dom.$('span.codicon.codicon-shield'));
		apIcon.setAttribute('aria-hidden', 'true');
		dom.append(approvals, document.createTextNode(
			this.mode === 'agent'
				? localize('ecosystemsAiStatusAgentApprovals', 'Default approvals')
				: localize('ecosystemsAiStatusAsk', 'Read-only')
		));

		const spacer = dom.append(this.statusEl, dom.$('span.spacer'));
		spacer.style.flex = '1';

		if (this.isStreaming) {
			const typing = dom.append(this.statusEl, dom.$('span'));
			dom.append(typing, dom.$('span.typing-dot'));
			dom.append(typing, dom.$('span.typing-dot'));
			dom.append(typing, dom.$('span.typing-dot'));
		}
	}

	private appendUserMessage(content: string, historyIndex: number): HTMLElement {
		const row = dom.append(this.messagesEl!, dom.$('.msg.user'));
		row.classList.add('msg-enter');
		row.dataset.historyIndex = String(historyIndex);
		const avatar = dom.append(row, dom.$('.avatar.codicon.codicon-account'));
		avatar.setAttribute('aria-hidden', 'true');
		const bubble = dom.append(row, dom.$('.bubble'));
		bubble.textContent = content;

		const editBtn = dom.append(row, dom.$('button.msg-edit-btn')) as HTMLButtonElement;
		editBtn.type = 'button';
		editBtn.title = localize('ecosystemsAiEdit', 'Edit and resend');
		editBtn.setAttribute('aria-label', editBtn.title);
		const editIcon = dom.append(editBtn, dom.$('span.codicon.codicon-edit'));
		editIcon.setAttribute('aria-hidden', 'true');
		editBtn.onclick = () => this.beginEditUserMessage(row, bubble, historyIndex, content);

		this.scrollToBottom();
		return bubble;
	}

	private appendAssistantMessage(content: string, opts: { loading?: boolean } = {}): HTMLElement {
		const row = dom.append(this.messagesEl!, dom.$('.msg.assistant'));
		row.classList.add('msg-enter');
		const avatar = dom.append(row, dom.$('.avatar.codicon.codicon-sparkle'));
		avatar.setAttribute('aria-hidden', 'true');
		const bubble = dom.append(row, dom.$('.bubble'));
		if (opts.loading) {
			bubble.classList.add('bubble-loading');
			const shimmer = dom.append(bubble, dom.$('.shimmer'));
			dom.append(shimmer, dom.$('.shimmer-bar'));
			dom.append(shimmer, dom.$('.shimmer-bar.short'));
			dom.append(shimmer, dom.$('.shimmer-bar.medium'));
		} else {
			bubble.textContent = content;
		}
		this.scrollToBottom();
		return bubble;
	}

	private beginEditUserMessage(row: HTMLElement, bubble: HTMLElement, historyIndex: number, currentContent: string): void {
		// Cancel any in-flight request so we don't race the edited resend.
		this.activeRequest?.cancel();

		dom.clearNode(bubble);
		bubble.classList.add('bubble-editing');

		const editor = dom.append(bubble, dom.$('.msg-editor'));
		const textarea = dom.append(editor, dom.$('textarea.msg-editor-textarea')) as HTMLTextAreaElement;
		textarea.value = currentContent;
		textarea.rows = Math.min(10, Math.max(2, currentContent.split('\n').length));

		const actions = dom.append(editor, dom.$('.msg-editor-actions'));
		const hint = dom.append(actions, dom.$('span.msg-editor-hint'));
		hint.textContent = localize('ecosystemsAiEditHint', 'Enter to send · Esc to cancel');
		const cancelBtn = dom.append(actions, dom.$('button.msg-editor-btn')) as HTMLButtonElement;
		cancelBtn.type = 'button';
		cancelBtn.textContent = localize('ecosystemsAiCancel', 'Cancel');
		const saveBtn = dom.append(actions, dom.$('button.msg-editor-btn.primary')) as HTMLButtonElement;
		saveBtn.type = 'button';
		saveBtn.textContent = localize('ecosystemsAiSaveResend', 'Send');

		textarea.focus();
		textarea.setSelectionRange(textarea.value.length, textarea.value.length);

		const restore = () => {
			dom.clearNode(bubble);
			bubble.classList.remove('bubble-editing');
			bubble.textContent = currentContent;
		};

		const commit = () => {
			const newText = textarea.value.trim();
			if (!newText) {
				restore();
				return;
			}
			// Truncate history at the edited turn and remove DOM from this row onward.
			this.chatHistory.length = historyIndex;
			this.removeMessagesFrom(row);
			void this.submit(newText);
		};

		cancelBtn.onclick = () => restore();
		saveBtn.onclick = () => commit();
		textarea.onkeydown = e => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				commit();
			} else if (e.key === 'Escape') {
				e.preventDefault();
				restore();
			}
		};
	}

	private removeMessagesFrom(row: HTMLElement): void {
		let current: Element | null = row;
		while (current) {
			const next: Element | null = current.nextElementSibling;
			if (current.classList.contains('msg')) {
				current.remove();
			}
			current = next;
		}
	}

	private scrollToBottom(): void {
		if (this.messagesEl) {
			this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
		}
	}

	// ---------------- @-mention file picker ----------------

	private renderAttachments(): void {
		if (!this.attachmentsEl) {
			return;
		}
		dom.clearNode(this.attachmentsEl);
		if (this.attachedFiles.length === 0) {
			this.attachmentsEl.style.display = 'none';
			return;
		}
		this.attachmentsEl.style.display = '';
		for (const file of this.attachedFiles) {
			const chip = dom.append(this.attachmentsEl, dom.$('.attachment-chip'));
			const icon = dom.append(chip, dom.$('span.codicon.codicon-file'));
			icon.setAttribute('aria-hidden', 'true');
			const label = dom.append(chip, dom.$('span.attachment-label'));
			label.textContent = file.label;
			label.title = file.label;
			const remove = dom.append(chip, dom.$('button.attachment-remove')) as HTMLButtonElement;
			remove.type = 'button';
			remove.title = localize('ecosystemsAiRemoveAttachment', 'Remove');
			const removeIcon = dom.append(remove, dom.$('span.codicon.codicon-close'));
			removeIcon.setAttribute('aria-hidden', 'true');
			remove.onclick = () => {
				const idx = this.attachedFiles.indexOf(file);
				if (idx >= 0) {
					this.attachedFiles.splice(idx, 1);
					this.renderAttachments();
				}
			};
		}
	}

	private handleInputForMention(): void {
		if (!this.inputEl) {
			return;
		}
		const value = this.inputEl.value;
		const caret = this.inputEl.selectionStart ?? value.length;

		// Walk backwards from caret to find an @-token. A valid token is
		// preceded by start-of-string or whitespace, and contains no
		// whitespace itself.
		let start = -1;
		for (let i = caret - 1; i >= 0; i--) {
			const ch = value[i];
			if (ch === '@') {
				if (i === 0 || /\s/.test(value[i - 1])) {
					start = i;
				}
				break;
			}
			if (/\s/.test(ch)) {
				break;
			}
		}
		if (start < 0) {
			this.closeMentionPopup();
			return;
		}
		this.mentionTokenStart = start;
		const query = value.slice(start + 1, caret);
		void this.searchAndShowMentions(query);
	}

	private async searchAndShowMentions(query: string): Promise<void> {
		this.mentionSearchCts?.cancel();
		this.mentionSearchCts = new CancellationTokenSource();
		const token = this.mentionSearchCts.token;

		const folders = this.workspaceContextService.getWorkspace().folders;
		if (folders.length === 0) {
			this.showMentionItems([]);
			return;
		}
		const fileQuery: IFileQuery = {
			type: QueryType.File,
			folderQueries: folders.map(f => ({ folder: f.uri })),
			filePattern: query || undefined,
			sortByScore: true,
			maxResults: 12,
			cacheKey: 'ecosystems-ai-mention',
		};
		try {
			const complete = await this.searchService.fileSearch(fileQuery, token);
			if (token.isCancellationRequested) {
				return;
			}
			const items: AttachedFile[] = complete.results.slice(0, 12).map(r => ({
				uri: r.resource,
				label: this.toWorkspaceRelativeLabel(r.resource),
			}));
			this.showMentionItems(items);
		} catch {
			// Search may fail before the service is fully ready; ignore.
		}
	}

	private toWorkspaceRelativeLabel(uri: URI): string {
		const folder = this.workspaceContextService.getWorkspaceFolder(uri);
		if (folder) {
			const rel = posix.relative(folder.uri.path, uri.path);
			return rel || basename(uri.path);
		}
		return uri.path;
	}

	private showMentionItems(items: AttachedFile[]): void {
		this.mentionItems = items;
		this.mentionActiveIndex = 0;
		if (!this.mentionPopupEl) {
			return;
		}
		dom.clearNode(this.mentionPopupEl);

		if (items.length === 0) {
			this.mentionPopupEl.style.display = 'none';
			return;
		}
		this.mentionPopupEl.style.display = '';

		const header = dom.append(this.mentionPopupEl, dom.$('.mention-header'));
		header.textContent = localize('ecosystemsAiMentionHeader', 'Attach a file');

		for (let i = 0; i < items.length; i++) {
			const item = items[i];
			const row = dom.append(this.mentionPopupEl, dom.$('.mention-item'));
			if (i === this.mentionActiveIndex) {
				row.classList.add('active');
			}
			const icon = dom.append(row, dom.$('span.codicon.codicon-file'));
			icon.setAttribute('aria-hidden', 'true');
			const name = dom.append(row, dom.$('span.mention-name'));
			name.textContent = basename(item.uri.path);
			const path = dom.append(row, dom.$('span.mention-path'));
			path.textContent = item.label;
			row.onmouseenter = () => {
				this.mentionActiveIndex = i;
				this.refreshMentionHighlight();
			};
			row.onmousedown = e => {
				e.preventDefault(); // keep focus in textarea
				this.commitMention(item);
			};
		}
	}

	private refreshMentionHighlight(): void {
		if (!this.mentionPopupEl) {
			return;
		}
		const rows = this.mentionPopupEl.querySelectorAll('.mention-item');
		rows.forEach((row, i) => {
			row.classList.toggle('active', i === this.mentionActiveIndex);
		});
	}

	private moveMentionSelection(delta: number): void {
		if (this.mentionItems.length === 0) {
			return;
		}
		const n = this.mentionItems.length;
		this.mentionActiveIndex = (this.mentionActiveIndex + delta + n) % n;
		this.refreshMentionHighlight();
		const active = this.mentionPopupEl?.querySelector('.mention-item.active');
		(active as HTMLElement | null)?.scrollIntoView({ block: 'nearest' });
	}

	private commitMention(item: AttachedFile): void {
		if (!this.inputEl || this.mentionTokenStart < 0) {
			return;
		}
		// Avoid duplicates.
		if (!this.attachedFiles.find(f => f.uri.toString() === item.uri.toString())) {
			this.attachedFiles.push(item);
			this.renderAttachments();
		}
		const value = this.inputEl.value;
		const caret = this.inputEl.selectionStart ?? value.length;
		const before = value.slice(0, this.mentionTokenStart);
		const after = value.slice(caret);
		this.inputEl.value = before + after;
		const newCaret = before.length;
		this.inputEl.setSelectionRange(newCaret, newCaret);
		this.inputEl.focus();
		this.closeMentionPopup();
	}

	private closeMentionPopup(): void {
		this.mentionItems = [];
		this.mentionTokenStart = -1;
		this.mentionSearchCts?.cancel();
		if (this.mentionPopupEl) {
			this.mentionPopupEl.style.display = 'none';
			dom.clearNode(this.mentionPopupEl);
		}
	}

	private openMentionPickerFromButton(): void {
		if (!this.inputEl) {
			return;
		}
		// Insert "@" at the caret and trigger the popup.
		const value = this.inputEl.value;
		const caret = this.inputEl.selectionStart ?? value.length;
		const needsSpace = caret > 0 && !/\s/.test(value[caret - 1]);
		const prefix = needsSpace ? ' @' : '@';
		this.inputEl.value = value.slice(0, caret) + prefix + value.slice(caret);
		const newCaret = caret + prefix.length;
		this.inputEl.setSelectionRange(newCaret, newCaret);
		this.inputEl.focus();
		this.handleInputForMention();
	}

	private async buildAttachmentsPreamble(token: CancellationToken, files: readonly AttachedFile[] = this.attachedFiles): Promise<string> {
		if (files.length === 0) {
			return '';
		}
		const maxBytesPerFile = 32 * 1024;
		const parts: string[] = ['<attached_files>'];
		for (const file of files) {
			if (token.isCancellationRequested) {
				break;
			}
			try {
				const stream = await this.fileService.readFile(file.uri);
				const buf = stream.value.buffer;
				const limit = Math.min(buf.byteLength, maxBytesPerFile);
				const truncated = buf.byteLength > maxBytesPerFile;
				const text = new TextDecoder('utf-8', { fatal: false }).decode(buf.subarray(0, limit));
				const lang = languageFromPath(file.label);
				parts.push(`\n## ${file.label}${truncated ? ` (first ${maxBytesPerFile} bytes)` : ''}\n\n\`\`\`${lang}\n${text}\n\`\`\``);
			} catch (e) {
				parts.push(`\n## ${file.label}\n\n(failed to read: ${e instanceof Error ? e.message : String(e)})`);
			}
		}
		parts.push('\n</attached_files>\n\n');
		return parts.join('');
	}

	// ---------------- /mention ----------------

	private async sendMessage(): Promise<void> {
		if (!this.inputEl || this.isStreaming) {
			return;
		}
		const text = this.inputEl.value.trim();
		if (!text) {
			return;
		}
		this.inputEl.value = '';
		await this.submit(text);
	}

	private async submit(text: string): Promise<void> {
		if (!this.sendButton || this.isStreaming) {
			return;
		}

		// Snapshot attachments at send time so subsequent edits don't mutate
		// what's already been sent. Clear the chips so the user starts fresh.
		const sentAttachments = this.attachedFiles.slice();
		this.attachedFiles.length = 0;
		this.renderAttachments();

		this.activeRequest?.cancel();
		this.activeRequest = new CancellationTokenSource();
		const store = new DisposableStore();

		// Build wire content with attachment preamble, but show the user the
		// plain prompt in the bubble (the chips already conveyed the files).
		const preamble = await this.buildAttachmentsPreamble(this.activeRequest.token, sentAttachments);
		const wireContent = preamble + text;
		this.chatHistory.push({ role: 'user', content: wireContent });
		const bubble = this.appendUserMessage(text, this.chatHistory.length - 1);
		if (sentAttachments.length) {
			const ctxRow = dom.append(bubble, dom.$('.bubble-attachments'));
			for (const f of sentAttachments) {
				const chip = dom.append(ctxRow, dom.$('span.bubble-attachment'));
				const ic = dom.append(chip, dom.$('span.codicon.codicon-file'));
				ic.setAttribute('aria-hidden', 'true');
				dom.append(chip, document.createTextNode(' ' + f.label));
			}
		}

		this.isStreaming = true;
		this.updateSendButtonState();
		this.renderStatus();

		try {
			if (this.mode === 'agent') {
				await this.runAgentTurn();
			} else {
				await this.runChatTurn();
			}
		} finally {
			this.isStreaming = false;
			this.updateSendButtonState();
			this.renderStatus();
			store.dispose();
		}
	}


	private updateSendButtonState(): void {
		if (!this.sendButton) {
			return;
		}
		const icon = this.sendButton.querySelector('.codicon') as HTMLElement | null;
		if (this.isStreaming) {
			this.sendButton.classList.add('stop');
			this.sendButton.title = localize('ecosystemsAiStop', 'Stop');
			this.sendButton.setAttribute('aria-label', this.sendButton.title);
			if (icon) {
				icon.className = 'codicon codicon-stop-circle';
			}
		} else {
			this.sendButton.classList.remove('stop');
			this.sendButton.title = localize('ecosystemsAiSend', 'Send');
			this.sendButton.setAttribute('aria-label', this.sendButton.title);
			if (icon) {
				icon.className = 'codicon codicon-arrow-up';
			}
		}
	}

	private async runChatTurn(): Promise<void> {
		const bubble = this.appendAssistantMessage('', { loading: true });
		let assistantText = '';
		let firstChunk = true;
		try {
			for await (const chunk of this.aiService.chatStream(this.chatHistory, this.activeRequest!.token, { model: this.model.id, feature: 'chat' })) {
				if (chunk.type === 'text' && chunk.text) {
					if (firstChunk) {
						firstChunk = false;
						bubble.classList.remove('bubble-loading');
						dom.clearNode(bubble);
					}
					assistantText += chunk.text;
					bubble.textContent = assistantText;
					this.scrollToBottom();
				} else if (chunk.type === 'error' && chunk.error) {
					bubble.classList.remove('bubble-loading');
					dom.clearNode(bubble);
					bubble.textContent = chunk.error.message;
					return;
				} else if (chunk.type === 'done') {
					break;
				}
			}
			if (assistantText) {
				this.chatHistory.push({ role: 'assistant', content: assistantText });
			} else {
				bubble.classList.remove('bubble-loading');
				dom.clearNode(bubble);
				bubble.textContent = localize('ecosystemsAiNoResponse', '(No response)');
			}
		} catch {
			bubble.classList.remove('bubble-loading');
			dom.clearNode(bubble);
			bubble.textContent = this.activeRequest?.token.isCancellationRequested
				? localize('ecosystemsAiCancelled', 'Stopped.')
				: localize('ecosystemsAiChatFailed', 'Request failed.');
		}
	}

	private async runAgentTurn(): Promise<void> {
		let workspaceSnapshot = '';
		try {
			workspaceSnapshot = await this.agentTools.snapshotWorkspaceTree(180, 3);
		} catch {
			workspaceSnapshot = '(workspace tree unavailable)';
		}
		const systemPrompt: ChatMessage = {
			role: 'system',
			content:
				'You are EcoSystems Agent, an AI coding assistant embedded in the user\'s IDE.\n\n' +
				'IMPORTANT RULES:\n' +
				'• When the user asks you to create, modify, delete, read, or list files — CALL THE PROVIDED TOOLS. Never just print instructions or code blocks and ask the user to save them.\n' +
				'• To scaffold a project (Next.js, React, Express, etc.) write every required file with `write_file` (package.json, tsconfig.json, source files, etc.). You may additionally use `run_in_terminal` for `npm install` / `npm run dev`, but do not rely on `npx create-*` — write the files yourself so the user can see them being created.\n' +
				'• Use `delete_file` to remove files the user no longer wants. Always confirm in your summary which files were created, modified, or deleted.\n' +
				'• Resolve paths relative to the workspace root using forward slashes. Do not invent paths — consult the workspace tree below first and use `list_directory` if you need a deeper view.\n' +
				'• `run_in_terminal` now CAPTURES output and returns it to you. Read the captured output carefully before claiming success. If you see `error`, non-zero exit, `EADDRINUSE`, `ENOENT`, or any failure, REPORT IT HONESTLY and try to fix it (e.g. install missing deps, free the port, correct the command) — do not pretend the command succeeded.\n' +
				'• For long-running servers (npm run dev, npm start, node server.js) ALWAYS pass `isBackground: true`. The tool returns once it detects a readiness marker (ready/listening/localhost). Quote the actual URL or readiness line from the captured output in your reply so the user knows it is genuinely running.\n' +
				'• After all tool calls complete, give a short plain-English summary of what changed and any next steps for the user (e.g. "run npm install").\n\n' +
				'Current workspace tree (truncated, node_modules/.git excluded):\n' +
				'```\n' + workspaceSnapshot + '\n```',
		};
		const messages: ChatMessage[] = [systemPrompt, ...this.chatHistory];

		const maxSteps = 16;
		let lastBubble: HTMLElement | undefined;

		for (let step = 0; step < maxSteps; step++) {
			let assistantText = '';
			let toolCalls: ChatToolCall[] | undefined;
			let errored = false;
			let firstChunk = true;

			const thinkingRow = this.appendThinkingRow(step === 0 ? 'Planning next moves' : 'Reviewing results, planning next moves');
			lastBubble = this.appendAssistantMessage('', { loading: true });

			const clearLoading = () => {
				if (firstChunk && lastBubble) {
					firstChunk = false;
					lastBubble.classList.remove('bubble-loading');
					dom.clearNode(lastBubble);
				}
			};

			try {
				for await (const chunk of this.aiService.chatStream(messages, this.activeRequest!.token, { model: this.model.id, feature: 'agent', tools: AGENT_TOOLS })) {
					if (chunk.type === 'text' && chunk.text) {
						clearLoading();
						assistantText += chunk.text;
						lastBubble!.textContent = assistantText;
						this.scrollToBottom();
					} else if (chunk.type === 'tool_calls' && chunk.toolCalls?.length) {
						toolCalls = chunk.toolCalls;
					} else if (chunk.type === 'error' && chunk.error) {
						clearLoading();
						lastBubble!.textContent = chunk.error.message;
						errored = true;
						break;
					} else if (chunk.type === 'done') {
						break;
					}
				}
			} catch {
				clearLoading();
				if (lastBubble) {
					lastBubble.textContent = localize('ecosystemsAiChatFailed', 'Request failed.');
				}
				return;
			}

			if (errored) {
				return;
			}

			// User clicked Stop while the stream was still flowing.
			if (this.activeRequest?.token.isCancellationRequested) {
				if (lastBubble && !assistantText) {
					lastBubble.textContent = localize('ecosystemsAiCancelled', 'Stopped.');
				}
				thinkingRow?.remove();
				return;
			}

			thinkingRow?.remove();

			// Record the assistant turn (text + any tool calls) into both wire history and the persisted UI history.
			const assistantMsg: ChatMessage = { role: 'assistant', content: assistantText, toolCalls };
			messages.push(assistantMsg);
			this.chatHistory.push(assistantMsg);

			if (!toolCalls?.length) {
				if (!assistantText && lastBubble) {
					lastBubble.textContent = localize('ecosystemsAiNoResponse', '(No response)');
				}
				return;
			}

			// Render & execute each tool call, then feed results back to the model.
			if (!assistantText && lastBubble) {
				lastBubble.parentElement?.remove();
			}

			let aborted = false;
			for (const call of toolCalls) {
				if (this.activeRequest?.token.isCancellationRequested) {
					this.appendToolMessage(`${call.name} skipped (stopped)`, 'done').classList.add('ecosystems-ai-tool-error');
					aborted = true;
					continue;
				}
				const toolBubble = this.appendToolMessage(`${call.name}(${this.summariseArgs(call.args)})`, 'pending');
				const result = await this.agentTools.execute(call, this.activeRequest?.token ?? CancellationToken.None);
				toolBubble.textContent = `${result.ok ? '✓' : (result.cancelled ? '⊘' : '✗')} ${result.summary}`;
				toolBubble.classList.toggle('ecosystems-ai-tool-error', !result.ok && !result.cancelled);
				if (result.terminalInstanceId !== undefined) {
					this.attachOpenTerminalButton(toolBubble, result.terminalInstanceId);
				}

				const toolMsg: ChatMessage = {
					role: 'tool',
					content: result.output,
					toolCallId: call.id,
					toolName: call.name,
				};
				messages.push(toolMsg);
				this.chatHistory.push(toolMsg);
			}

			if (aborted || this.activeRequest?.token.isCancellationRequested) {
				this.appendAssistantMessage(localize('ecosystemsAiAgentStoppedByUser', 'Stopped by you.'));
				return;
			}

			// Loop again so the model can react to the tool results.
		}

		this.appendAssistantMessage(localize('ecosystemsAiAgentStopped', 'Agent stopped after {0} steps to avoid an infinite loop.', maxSteps));
	}

	private summariseArgs(args: Record<string, unknown>): string {
		const pairs: string[] = [];
		for (const [k, v] of Object.entries(args)) {
			if (k === 'content' && typeof v === 'string') {
				pairs.push(`${k}=<${v.length} bytes>`);
			} else if (typeof v === 'string') {
				pairs.push(`${k}=${JSON.stringify(v.length > 60 ? v.slice(0, 57) + '…' : v)}`);
			} else {
				pairs.push(`${k}=${JSON.stringify(v)}`);
			}
		}
		return pairs.join(', ');
	}

	private appendToolMessage(text: string, _state: 'pending' | 'done'): HTMLElement {
		if (!this.messagesEl) {
			throw new Error('messagesEl missing');
		}
		const row = dom.append(this.messagesEl, dom.$('.msg.tool'));
		const avatar = dom.append(row, dom.$('.avatar.codicon.codicon-tools'));
		avatar.setAttribute('aria-hidden', 'true');
		const bubble = dom.append(row, dom.$('.bubble.tool'));
		bubble.textContent = text;
		this.scrollToBottom();
		return bubble;
	}

	private appendThinkingRow(label: string): HTMLElement {
		if (!this.messagesEl) {
			throw new Error('messagesEl missing');
		}
		const row = dom.append(this.messagesEl, dom.$('.msg.thinking'));
		const avatar = dom.append(row, dom.$('.avatar.codicon.codicon-loading.codicon-modifier-spin'));
		avatar.setAttribute('aria-hidden', 'true');
		const bubble = dom.append(row, dom.$('.bubble.thinking'));
		const text = dom.append(bubble, dom.$('span.thinking-label'));
		text.textContent = label;
		dom.append(bubble, dom.$('span.thinking-dots')).textContent = '\u2022\u2022\u2022';
		this.scrollToBottom();
		return row;
	}

	private attachOpenTerminalButton(bubble: HTMLElement, terminalInstanceId: number): void {
		const btn = dom.append(bubble, dom.$('button.tool-open-terminal')) as HTMLButtonElement;
		btn.type = 'button';
		btn.title = localize('ecosystemsAiOpenTerminal', 'Open terminal');
		const icon = dom.append(btn, dom.$('span.codicon.codicon-terminal'));
		icon.setAttribute('aria-hidden', 'true');
		const label = dom.append(btn, dom.$('span.label'));
		label.textContent = localize('ecosystemsAiOpenTerminalLabel', 'Open terminal');
		btn.onclick = async (e) => {
			e.preventDefault();
			e.stopPropagation();
			try {
				const instance = this.terminalService.getInstanceFromId(terminalInstanceId);
				if (instance) {
					await this.terminalService.setActiveInstance(instance);
					await this.terminalService.revealActiveTerminal(false);
				} else {
					await this.commandService.executeCommand('workbench.action.terminal.focus');
				}
			} catch {
				await this.commandService.executeCommand('workbench.action.terminal.focus');
			}
		};
	}

	override dispose(): void {
		this.activeRequest?.cancel();
		this.mentionSearchCts?.cancel();
		super.dispose();
	}
}

const LANG_BY_EXT: Record<string, string> = {
	ts: 'ts', tsx: 'tsx', js: 'js', jsx: 'jsx', mjs: 'js', cjs: 'js',
	py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin',
	c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp', cc: 'cpp', cs: 'csharp',
	php: 'php', swift: 'swift', m: 'objc', mm: 'objc',
	json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml', xml: 'xml',
	html: 'html', htm: 'html', css: 'css', scss: 'scss', less: 'less',
	md: 'md', sh: 'bash', bash: 'bash', zsh: 'bash', ps1: 'powershell',
	sql: 'sql', dockerfile: 'dockerfile',
};

function languageFromPath(path: string): string {
	const name = path.toLowerCase();
	if (name.endsWith('/dockerfile') || name === 'dockerfile') {
		return 'dockerfile';
	}
	const dot = name.lastIndexOf('.');
	if (dot < 0) {
		return '';
	}
	return LANG_BY_EXT[name.slice(dot + 1)] ?? '';
}
