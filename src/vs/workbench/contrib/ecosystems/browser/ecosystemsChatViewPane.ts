/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/ecosystemsChat.css';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationTokenSource, CancellationToken } from '../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { URI } from '../../../../base/common/uri.js';
import { basename, posix } from '../../../../base/common/path.js';
import { dirname as resourceDirname } from '../../../../base/common/resources.js';
import * as dom from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
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
import {
	ECOSYSTEMS_AI_CHAT_VIEW_ID,
	ECOSYSTEMS_AI_COMMAND_ATTACH_FILES,
	ECOSYSTEMS_AI_COMMAND_ATTACH_TERMINAL,
	ECOSYSTEMS_AI_COMMAND_SIGN_IN,
} from '../../../../platform/ecosystems/common/constants.js';
import {
	ECOSYSTEMS_AI_CHAT_COMPACT_AFTER_MESSAGES,
	ECOSYSTEMS_AI_CHAT_COMPACT_BACKGROUND,
	ECOSYSTEMS_AI_CHAT_COMPACT_ENABLED,
	ECOSYSTEMS_AI_CHAT_COMPACT_KEEP_RECENT,
	ECOSYSTEMS_AI_CHAT_COMPACT_MODEL,
	ECOSYSTEMS_AI_CHAT_COMPACT_THRESHOLD_PERCENT,
	ECOSYSTEMS_AI_CHAT_CHECKPOINTS_ENABLED,
	ECOSYSTEMS_AI_CHAT_CONTEXT_BUDGET_CHARS,
} from '../../../../platform/ecosystems/common/ecosystemsConfiguration.js';
import {
	buildWireHistory,
	COMPACTED_SYSTEM_MARKER,
	compactionBannerLabel,
	contextUsageLabel,
	countPersistableMessages,
	DEFAULT_CONTEXT_BUDGET_CHARS,
	estimateContextUsage,
	isCompactionStaleForCriticalSend,
	parseCompactSlashCommand,
	pickCompactionModel,
	runCompaction,
	shouldScheduleBackgroundCompaction,
} from './ecosystemsChatCompaction.js';
import {
	attachmentKey,
	autoPlaceBinaryAttachments,
	buildAttachmentsPreamble,
	ChatAttachment,
	cloneChatAttachment,
	createChatAttachment,
	extractBinaryPathsFromWireContent,
	isBinaryFilePath,
	stageAttachmentsToWorkspace,
	createUserChatMessage,
} from './ecosystemsChatAttachments.js';
import { IEcosystemsChatContextService } from './ecosystemsChatContextService.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { ChatSessionMode, IEcosystemsChatSessionService } from './ecosystemsChatSessionService.js';
import { buildPlanSystemPromptContent } from './ecosystemsPlanMode.js';
import { IEcosystemsAiService } from '../../../../platform/ecosystems/common/ecosystemsAiService.js';
import { IEcosystemsSessionService } from '../../../../platform/ecosystems/common/ecosystemsSessionService.js';
import { ChatMessage, ChatToolCall, GatewayModelInfo } from '../../../../platform/ecosystems/common/ecosystemsAiTypes.js';
import {
	INTELLIGENCE_MODE_DEFAULTS,
	intelligenceModeHint,
	pickIntelligenceModels,
	resolveIntelligenceModel,
} from '../../../../platform/ecosystems/common/intelligenceModes.js';
import { AGENT_TOOLS, EcosystemsAgentTools } from './ecosystemsAgentTools.js';
import { CANCELLED_TOOL_OUTPUT, repairChatToolHistory } from './ecosystemsChatToolHistory.js';
import { EcosystemsChatAssistantRenderer } from './ecosystemsChatAssistantRenderer.js';
import { getAgentThinkingMessages, getAskThinkingMessages, getPlanThinkingMessages, startThinkingLabelRotation } from './ecosystemsAgentThinkingStatus.js';
import { AgentFileChangeRecord, IEcosystemsAgentFileChangeService } from './ecosystemsAgentFileChangeService.js';
import { AgentTerminalRun, IEcosystemsAgentActivityService } from './ecosystemsAgentActivityService.js';
import { IEcosystemsStackPlaybookService } from './ecosystemsStackPlaybookService.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { Schemas } from '../../../../base/common/network.js';
import { Action, IAction } from '../../../../base/common/actions.js';
import { IViewPaneOptions, ViewPane, ViewPaneShowActions } from '../../../browser/parts/views/viewPane.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { IViewDescriptorService } from '../../../common/views.js';

interface QueuedMessage {
	readonly id: string;
	text: string;
	readonly attachments: ChatAttachment[];
}

type ChatMode = ChatSessionMode;

const DEFAULT_MODELS: GatewayModelInfo[] = INTELLIGENCE_MODE_DEFAULTS;

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
	private modelPickerPopupEl: HTMLElement | undefined;
	private modelPickerDismiss: { dispose(): void } | undefined;
	private mentionItems: ChatAttachment[] = [];
	private mentionActiveIndex = 0;
	private mentionTokenStart = -1;
	private mentionSearchCts: CancellationTokenSource | undefined;
	private readonly attachments: ChatAttachment[] = [];
	private readonly attachmentObjectUrls = new Map<string, string>();
	private agentActivityPanelEl: HTMLElement | undefined;
	private agentFilesSectionEl: HTMLElement | undefined;
	private agentFilesListEl: HTMLElement | undefined;
	private agentFilesCountEl: HTMLElement | undefined;
	private agentFilesKeepBtn: HTMLButtonElement | undefined;
	private agentFilesUndoBtn: HTMLButtonElement | undefined;
	private agentFilesReviewBtn: HTMLButtonElement | undefined;
	private agentTerminalsSectionEl: HTMLElement | undefined;
	private agentTerminalsListEl: HTMLElement | undefined;
	private agentTerminalsCountEl: HTMLElement | undefined;
	private agentFilesPanelCollapsed = false;
	private agentTerminalsPanelCollapsed = false;
	private readonly pendingWritePaths = new Set<string>();
	private chatQueuePanelEl: HTMLElement | undefined;
	private chatQueueListEl: HTMLElement | undefined;
	private chatQueueCountEl: HTMLElement | undefined;
	private chatQueueChevronEl: HTMLElement | undefined;
	private chatQueueCollapsed = false;
	private readonly messageQueue: QueuedMessage[] = [];
	private processingQueue = false;
	private skipQueueDrain = false;
	/** Last binary attachment path from the most recent user message (for tool repair). */
	private lastAttachedBinaryPath: string | undefined;

	private readonly chatHistory: ChatMessage[] = [];
	private sessionsMainSplitEl: HTMLElement | undefined;
	private sessionsPanelEl: HTMLElement | undefined;
	private sessionsSashEl: HTMLElement | undefined;
	private sessionsListEl: HTMLElement | undefined;
	private sessionsShowToggleBtn: HTMLButtonElement | undefined;
	private chatSessionBarEl: HTMLElement | undefined;
	private chatSessionTitleEl: HTMLElement | undefined;
	private chatSessionBackLabelEl: HTMLElement | undefined;
	private compactionBannerEl: HTMLElement | undefined;
	private compactionRunning = false;
	private backgroundCompactionCts: CancellationTokenSource | undefined;
	private backgroundCompactionPromise: Promise<void> | undefined;
	private sessionsPanelHeightPx = EcoSystemsChatViewPane.SESSIONS_PANEL_DEFAULT_PX;
	private sessionsPanelManualShow = false;
	private sessionsReady = false;
	private static readonly SESSIONS_PANEL_MIN_PX = 72;
	private static readonly SESSIONS_PANEL_MAX_PX = 420;
	private static readonly SESSIONS_PANEL_DEFAULT_PX = 160;
	private activeRequest: CancellationTokenSource | undefined;
	private mode: ChatMode = 'agent';
	private model: GatewayModelInfo = DEFAULT_MODELS[1]; // Smart Mode
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
		@IEcosystemsAgentFileChangeService private readonly fileChangeService: IEcosystemsAgentFileChangeService,
		@IEcosystemsAgentActivityService private readonly activityService: IEcosystemsAgentActivityService,
		@IEditorService private readonly editorService: IEditorService,
		@IModelService private readonly modelService: IModelService,
		@IEcosystemsChatSessionService private readonly chatSessionService: IEcosystemsChatSessionService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IViewsService private readonly viewsService: IViewsService,
		@IEcosystemsChatContextService private readonly chatContextService: IEcosystemsChatContextService,
		@IEcosystemsStackPlaybookService private readonly stackPlaybookService: IEcosystemsStackPlaybookService,
		@IClipboardService private readonly clipboardService: IClipboardService,
	) {
		super({
			...options,
			titleMenuId: MenuId.ViewTitle,
			showActions: ViewPaneShowActions.Always,
		}, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);
		this.agentTools = instantiationService.createInstance(EcosystemsAgentTools);
		this.assistantRenderer = this._register(instantiationService.createInstance(EcosystemsChatAssistantRenderer));
		this._register(this.fileChangeService.onDidChange(() => this.refreshAgentActivityPanel()));
		this._register(this.activityService.onDidChange(() => this.refreshAgentActivityPanel()));
		this._register(this.chatSessionService.onDidChange(() => {
			this.refreshSessionsList();
			if (this.messagesEl && this.sessionsReady) {
				void this.reloadActiveSession();
			}
		}));
	}

	private readonly agentTools: EcosystemsAgentTools;
	private assistantRenderer: EcosystemsChatAssistantRenderer | undefined;
	private lastSignedIn: boolean | undefined;
	private modelsLoaded = false;
	private chatCopyHandlersRegistered = false;

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		container.classList.add('ecosystems-ai-chat');
		this.bodyContainer = dom.append(container, dom.$('.ecosystems-ai-body'));
		this.registerChatCopyHandlers();

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
		if (this.lastSignedIn === signedIn && this.messagesEl?.isConnected) {
			return;
		}
		this.lastSignedIn = signedIn;

		dom.clearNode(this.bodyContainer);
		this.sessionsMainSplitEl = undefined;
		this.sessionsPanelEl = undefined;
		this.sessionsSashEl = undefined;
		this.sessionsListEl = undefined;
		this.chatSessionBarEl = undefined;
		this.chatSessionTitleEl = undefined;
		this.chatSessionBackLabelEl = undefined;
		this.messagesEl = undefined;
		this.inputEl = undefined;
		this.sendButton = undefined;
		this.statusEl = undefined;

		if (!signedIn) {
			this.renderSignedOut(this.bodyContainer);
			return;
		}

		this.renderChat(this.bodyContainer);
		// Don't fetch models on first paint -- render with DEFAULT_MODELS and lazily
		// load when the user first opens the model picker. Saves ~1-2s of HTTP at boot.
	}

	private renderSignedOut(container: HTMLElement): void {
		const panel = dom.append(container, dom.$('.ecosystems-ai-signed-out'));

		const icon = dom.append(panel, dom.$('.hero-icon.codicon.codicon-sparkle'));
		icon.setAttribute('aria-hidden', 'true');

		const title = dom.append(panel, dom.$('.hero-title'));
		title.textContent = localize('ecosystemsAiSignInTitle', 'Sign in to Altus AI');

		const detail = dom.append(panel, dom.$('.hero-detail'));
		detail.textContent = localize(
			'ecosystemsAiSignInDetail',
			'AI is included with your Altus AI plan. Sign in to use chat and inline completion -- no API keys required.'
		);

		const button = dom.append(panel, dom.$('button.hero-button')) as HTMLButtonElement;
		button.textContent = localize('ecosystemsAiSignInButton', 'Sign in');
		button.onclick = () => this.commandService.executeCommand(ECOSYSTEMS_AI_COMMAND_SIGN_IN);
	}

	private renderChat(container: HTMLElement): void {
		this.sessionsMainSplitEl = dom.append(container, dom.$('.ecosystems-ai-main-split'));
		this.renderSessionsPanel(this.sessionsMainSplitEl);
		this.sessionsSashEl = dom.append(this.sessionsMainSplitEl, dom.$('.ecosystems-ai-sessions-sash'));
		this.sessionsSashEl.setAttribute('role', 'separator');
		this.sessionsSashEl.setAttribute('aria-orientation', 'horizontal');
		this.sessionsSashEl.title = localize('ecosystemsAiSessionsResize', 'Resize chat sessions list');
		this.setupSessionsPanelResize();

		const chatMain = dom.append(this.sessionsMainSplitEl, dom.$('.ecosystems-ai-chat-main'));
		this.renderChatSessionBar(chatMain);
		this.messagesEl = dom.append(chatMain, dom.$('.ecosystems-ai-messages'));
		this.updateSessionsPanelVisibility();
		void this.bootstrapSessionHistory();

		this.agentActivityPanelEl = dom.append(chatMain, dom.$('.agent-activity-panel'));
		this.agentActivityPanelEl.style.display = 'none';

		this.agentFilesSectionEl = dom.append(this.agentActivityPanelEl, dom.$('.agent-files-section'));
		const filesHeader = dom.append(this.agentFilesSectionEl, dom.$('.agent-files-header'));
		const filesToggleBtn = dom.append(filesHeader, dom.$('button.agent-files-toggle')) as HTMLButtonElement;
		filesToggleBtn.type = 'button';
		dom.append(filesToggleBtn, dom.$('span.codicon.codicon-chevron-down'));
		this.agentFilesCountEl = dom.append(filesToggleBtn, dom.$('span.agent-files-count'));
		filesToggleBtn.onclick = () => {
			this.agentFilesPanelCollapsed = !this.agentFilesPanelCollapsed;
			this.refreshAgentActivityPanel();
		};
		const actions = dom.append(filesHeader, dom.$('.agent-files-actions'));
		this.agentFilesKeepBtn = dom.append(actions, dom.$('button.agent-files-action.keep')) as HTMLButtonElement;
		this.agentFilesKeepBtn.type = 'button';
		this.agentFilesKeepBtn.textContent = localize('ecosystemsAiKeepChanges', 'Keep');
		this.agentFilesKeepBtn.title = localize('ecosystemsAiKeepChangesTitle', 'Accept all agent file changes');
		this.agentFilesKeepBtn.onclick = (e) => {
			e.preventDefault();
			this.keepAllFileChanges();
		};

		this.agentFilesUndoBtn = dom.append(actions, dom.$('button.agent-files-action.undo')) as HTMLButtonElement;
		this.agentFilesUndoBtn.type = 'button';
		this.agentFilesUndoBtn.textContent = localize('ecosystemsAiUndoChanges', 'Undo');
		this.agentFilesUndoBtn.title = localize('ecosystemsAiUndoChangesTitle', 'Revert all agent file changes from this turn');
		this.agentFilesUndoBtn.onclick = (e) => {
			e.preventDefault();
			void this.undoAllFileChanges();
		};

		this.agentFilesReviewBtn = dom.append(actions, dom.$('button.agent-files-action.review')) as HTMLButtonElement;
		this.agentFilesReviewBtn.type = 'button';
		this.agentFilesReviewBtn.textContent = localize('ecosystemsAiReviewChanges', 'Review');
		this.agentFilesReviewBtn.title = localize('ecosystemsAiReviewChangesTitle', 'Open diffs for all changed files');
		this.agentFilesReviewBtn.onclick = (e) => {
			e.preventDefault();
			void this.reviewAllFileChanges();
		};

		this.agentFilesListEl = dom.append(this.agentFilesSectionEl, dom.$('.agent-files-list'));

		this.agentTerminalsSectionEl = dom.append(this.agentActivityPanelEl, dom.$('.agent-terminals-section'));
		const terminalsHeader = dom.append(this.agentTerminalsSectionEl, dom.$('.agent-terminals-header'));
		const terminalsToggleBtn = dom.append(terminalsHeader, dom.$('button.agent-terminals-toggle')) as HTMLButtonElement;
		terminalsToggleBtn.type = 'button';
		dom.append(terminalsToggleBtn, dom.$('span.codicon.codicon-chevron-down'));
		this.agentTerminalsCountEl = dom.append(terminalsToggleBtn, dom.$('span.agent-terminals-count'));
		terminalsToggleBtn.onclick = () => {
			this.agentTerminalsPanelCollapsed = !this.agentTerminalsPanelCollapsed;
			this.refreshAgentActivityPanel();
		};
		const terminalsActions = dom.append(terminalsHeader, dom.$('.agent-terminals-actions'));
		const terminalsCloseBtn = dom.append(terminalsActions, dom.$('button.agent-terminals-close')) as HTMLButtonElement;
		terminalsCloseBtn.type = 'button';
		terminalsCloseBtn.title = localize('ecosystemsAiCloseCommands', 'Close commands panel');
		terminalsCloseBtn.setAttribute('aria-label', terminalsCloseBtn.title);
		dom.append(terminalsCloseBtn, dom.$('span.codicon.codicon-close'));
		terminalsCloseBtn.onclick = (e) => {
			e.preventDefault();
			this.dismissAgentCommandsPanel();
		};
		this.agentTerminalsListEl = dom.append(this.agentTerminalsSectionEl, dom.$('.agent-terminals-list'));

		this.renderChatQueuePanel(chatMain);

		const composer = dom.append(chatMain, dom.$('.ecosystems-ai-composer'));

		// Attachments row (chips for @-tagged files). Hidden when empty.
		this.attachmentsEl = dom.append(composer, dom.$('.composer-attachments'));
		this.renderAttachments();

		this.inputEl = dom.append(composer, dom.$('textarea')) as HTMLTextAreaElement;
		this.inputEl.placeholder = localize('ecosystemsAiInputPlaceholder', 'Ask Altus...  (@ files, /compact, paste images)');
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
		this.inputEl.addEventListener('paste', e => this.handleComposerPaste(e));
		composer.addEventListener('dragover', e => {
			e.preventDefault();
			e.stopPropagation();
		});
		composer.addEventListener('drop', e => {
			e.preventDefault();
			e.stopPropagation();
			void this.handleComposerDrop(e);
		});

		// Mention popup overlay (positioned absolutely above the composer).
		this.mentionPopupEl = dom.append(composer, dom.$('.composer-mention-popup'));
		this.mentionPopupEl.style.display = 'none';

		this.modelPickerPopupEl = dom.append(composer, dom.$('.composer-model-popup'));
		this.modelPickerPopupEl.style.display = 'none';

		const toolbar = dom.append(composer, dom.$('.composer-toolbar'));

		// Attach (opens @-mention picker programmatically)
		const attachBtn = this.makeButton(toolbar, 'codicon-add', localize('ecosystemsAiAttach', 'Attach files'), true);
		attachBtn.classList.add('icon-only');
		attachBtn.onclick = () => void this.showAttachMenu(attachBtn);

		this.sessionsShowToggleBtn = this.makeButton(toolbar, 'codicon-history', localize('ecosystemsAiChatSessionsLabel', 'Chat sessions'), true);
		this.sessionsShowToggleBtn.classList.add('icon-only', 'sessions-toggle');
		this.sessionsShowToggleBtn.onclick = () => this.toggleSessionsPanel();

		this.registerChatHost();

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
		settingsBtn.onclick = () => this.commandService.executeCommand('workbench.action.openSettings', 'altusAI');

		dom.append(toolbar, dom.$('.spacer'));

		// Send / Stop (morphs while streaming)
		this.sendButton = dom.append(toolbar, dom.$('button.composer-btn.send.icon-only')) as HTMLButtonElement;
		this.sendButton.title = localize('ecosystemsAiSend', 'Send');
		this.sendButton.setAttribute('aria-label', localize('ecosystemsAiSend', 'Send'));
		const sendIcon = dom.append(this.sendButton, dom.$('span.codicon.codicon-arrow-up'));
		sendIcon.setAttribute('aria-hidden', 'true');
		this.sendButton.onclick = () => {
			if (this.isStreaming) {
				this.stopActiveChat();
			} else {
				this.sendMessage();
			}
		};

		// Status bar
		this.statusEl = dom.append(container, dom.$('.ecosystems-ai-statusbar'));
		this.renderStatus();
	}

	private renderChatSessionBar(chatMain: HTMLElement): void {
		this.chatSessionBarEl = dom.append(chatMain, dom.$('.ecosystems-ai-chat-session-bar'));

		const backBtn = dom.append(this.chatSessionBarEl, dom.$('button.chat-session-back')) as HTMLButtonElement;
		backBtn.type = 'button';
		backBtn.title = localize('ecosystemsAiBackToSessions', 'Back to chat sessions');
		backBtn.setAttribute('aria-label', backBtn.title);
		dom.append(backBtn, dom.$('span.codicon.codicon-chevron-left')).setAttribute('aria-hidden', 'true');
		this.chatSessionBackLabelEl = dom.append(backBtn, dom.$('span.chat-session-back-label'));
		this.chatSessionBackLabelEl.textContent = localize('ecosystemsAiSessionsTitle', 'Chat sessions');
		backBtn.onclick = () => this.toggleSessionsList();

		this.chatSessionTitleEl = dom.append(this.chatSessionBarEl, dom.$('span.chat-session-active-title'));

		const newBtn = dom.append(this.chatSessionBarEl, dom.$('button.chat-session-new')) as HTMLButtonElement;
		newBtn.type = 'button';
		newBtn.title = localize('ecosystemsAiNewSession', 'New chat session');
		newBtn.setAttribute('aria-label', newBtn.title);
		dom.append(newBtn, dom.$('span.codicon.codicon-add')).setAttribute('aria-hidden', 'true');
		newBtn.onclick = () => void this.startNewSession();
	}

	private showSessionsList(): void {
		this.sessionsPanelManualShow = true;
		this.updateSessionsPanelVisibility();
	}

	private hideSessionsList(): void {
		this.sessionsPanelManualShow = false;
		this.updateSessionsPanelVisibility();
	}

	/** Called from view title toolbar command. */
	public toggleSessionsList(): void {
		if (this.sessionsMainSplitEl?.classList.contains('sessions-hidden')) {
			this.showSessionsList();
		} else {
			this.hideSessionsList();
		}
	}

	private renderSessionsPanel(container: HTMLElement): void {
		this.sessionsPanelEl = dom.append(container, dom.$('.ecosystems-ai-sessions-panel'));
		const header = dom.append(this.sessionsPanelEl, dom.$('.sessions-panel-header'));
		const title = dom.append(header, dom.$('span.sessions-panel-title'));
		title.textContent = localize('ecosystemsAiSessionsTitle', 'Chat sessions');

		const newBtn = dom.append(header, dom.$('button.session-new')) as HTMLButtonElement;
		newBtn.type = 'button';
		newBtn.title = localize('ecosystemsAiNewSession', 'New chat session');
		newBtn.setAttribute('aria-label', newBtn.title);
		const addIcon = dom.append(newBtn, dom.$('span.codicon.codicon-add'));
		addIcon.setAttribute('aria-hidden', 'true');
		newBtn.onclick = () => void this.startNewSession();

		this.sessionsListEl = dom.append(this.sessionsPanelEl, dom.$('.sessions-list'));
		this.applySessionsPanelHeight();
		this.refreshSessionsList();
	}

	/** Event delegation on stable body container (survives chat re-renders). */
	private registerChatCopyHandlers(): void {
		if (!this.bodyContainer || this.chatCopyHandlersRegistered) {
			return;
		}
		this.chatCopyHandlersRegistered = true;

		this._register(dom.addDisposableListener(this.bodyContainer, 'contextmenu', (e: MouseEvent) => {
			const target = e.target as HTMLElement | undefined;
			if (!target || !this.bodyContainer?.contains(target)) {
				return;
			}
			// Let the composer textarea use the normal editor/context menu (paste, etc.).
			if (target.closest('.ecosystems-ai-composer textarea')) {
				return;
			}
			if (target.closest('.composer-toolbar, .composer-btn, .sessions-list, .session-list-item, .chat-session-bar button')) {
				return;
			}
			const inCopyableRegion = target.closest(
				'.ecosystems-ai-messages, .msg, .chat-queue-panel, .agent-activity-panel, .msg.compaction-banner',
			);
			if (!inCopyableRegion) {
				return;
			}

			const win = dom.getWindow(this.bodyContainer);
			const selection = win.getSelection()?.toString().trim() ?? '';
			const bubble = target.closest('.msg .bubble, .chat-queue-text, .bubble.compaction, .bubble.tool') as HTMLElement | null;
			const messageText = bubble?.textContent?.trim() ?? '';
			const transcript = this.getChatTranscriptText();

			const actions: IAction[] = [];
			if (selection) {
				actions.push(new Action(
					'ecosystems.ai.chat.copySelection',
					localize('ecosystemsAiCopySelection', 'Copy'),
					undefined,
					true,
					() => this.clipboardService.writeText(selection),
				));
			}
			if (messageText && messageText !== selection) {
				actions.push(new Action(
					'ecosystems.ai.chat.copyMessage',
					localize('ecosystemsAiCopyMessage', 'Copy message'),
					undefined,
					true,
					() => this.clipboardService.writeText(messageText),
				));
			}
			if (transcript) {
				actions.push(new Action(
					'ecosystems.ai.chat.copyAll',
					localize('ecosystemsAiCopyAllChat', 'Copy all chat'),
					undefined,
					true,
					() => this.clipboardService.writeText(transcript),
				));
			}
			if (!actions.length) {
				return;
			}

			e.preventDefault();
			e.stopPropagation();
			this.contextMenuService.showContextMenu({
				getAnchor: () => ({ x: e.clientX, y: e.clientY }),
				getActions: () => actions,
				onHide: () => actions.forEach(a => { if (a instanceof Action) { a.dispose(); } }),
			});
		}));
	}

	/** Plain-text export of visible chat rows (for Copy All). */
	getChatTranscriptText(): string {
		const root = this.messagesEl ?? this.bodyContainer?.querySelector('.ecosystems-ai-messages');
		if (!root) {
			return '';
		}
		const parts: string[] = [];
		for (const row of root.querySelectorAll('.msg.user, .msg.assistant, .msg.tool, .msg.thinking')) {
			const bubble = row.querySelector('.bubble');
			const text = bubble?.textContent?.trim();
			if (text) {
				parts.push(text);
			}
		}
		return parts.join('\n\n');
	}

	private setupSessionsPanelResize(): void {
		if (!this.sessionsSashEl) {
			return;
		}
		this.sessionsSashEl.onmousedown = (e: MouseEvent) => {
			if (this.sessionsMainSplitEl?.classList.contains('sessions-hidden')) {
				return;
			}
			e.preventDefault();
			const startY = e.clientY;
			const startH = this.sessionsPanelHeightPx;
			const onMove = (ev: MouseEvent) => {
				const delta = ev.clientY - startY;
				this.sessionsPanelHeightPx = Math.min(
					EcoSystemsChatViewPane.SESSIONS_PANEL_MAX_PX,
					Math.max(EcoSystemsChatViewPane.SESSIONS_PANEL_MIN_PX, startH + delta),
				);
				this.applySessionsPanelHeight();
			};
			const onUp = () => {
				mainWindow.removeEventListener('mousemove', onMove);
				mainWindow.removeEventListener('mouseup', onUp);
				mainWindow.document.body.style.cursor = '';
				mainWindow.document.body.style.userSelect = '';
			};
			mainWindow.document.body.style.cursor = 'row-resize';
			mainWindow.document.body.style.userSelect = 'none';
			mainWindow.addEventListener('mousemove', onMove);
			mainWindow.addEventListener('mouseup', onUp);
		};
	}

	private applySessionsPanelHeight(): void {
		if (this.sessionsPanelEl) {
			this.sessionsPanelEl.style.height = `${this.sessionsPanelHeightPx}px`;
		}
	}

	private shouldAutoHideSessionsPanel(): boolean {
		return this.chatHistory.length > 0;
	}

	private updateSessionsPanelVisibility(): void {
		if (!this.sessionsMainSplitEl) {
			return;
		}
		const listHidden = this.shouldAutoHideSessionsPanel() && !this.sessionsPanelManualShow;
		this.sessionsMainSplitEl.classList.toggle('sessions-hidden', listHidden);

		if (this.chatSessionBarEl) {
			this.chatSessionBarEl.style.display = 'flex';
		}
		if (this.chatSessionBackLabelEl) {
			this.chatSessionBackLabelEl.textContent = listHidden
				? localize('ecosystemsAiSessionsTitle', 'Chat sessions')
				: localize('ecosystemsAiHideSessionList', 'Hide list');
		}
		if (this.chatSessionTitleEl) {
			const meta = this.chatSessionService.getActiveSessionMeta();
			this.chatSessionTitleEl.textContent = meta?.title ?? localize('ecosystemsAiNewChat', 'New chat');
			this.chatSessionTitleEl.title = this.chatSessionTitleEl.textContent;
		}

		if (this.sessionsShowToggleBtn) {
			this.sessionsShowToggleBtn.classList.toggle('active', !listHidden);
			this.sessionsShowToggleBtn.title = listHidden
				? localize('ecosystemsAiShowSessions', 'Show chat sessions')
				: localize('ecosystemsAiHideSessions', 'Hide chat sessions');
		}
	}

	private toggleSessionsPanel(): void {
		this.toggleSessionsList();
	}

	private refreshSessionsList(): void {
		if (!this.sessionsListEl) {
			return;
		}
		dom.clearNode(this.sessionsListEl);

		if (!this.sessionsReady) {
			const loading = dom.append(this.sessionsListEl, dom.$('.sessions-list-empty'));
			loading.textContent = localize('ecosystemsAiSessionLoading', 'Loading...');
			this.updateSessionsPanelVisibility();
			return;
		}

		const sessions = this.chatSessionService.listSessions();
		const activeId = this.chatSessionService.getActiveSessionId();

		if (sessions.length === 0) {
			const empty = dom.append(this.sessionsListEl, dom.$('.sessions-list-empty'));
			empty.textContent = localize('ecosystemsAiNoSessions', 'No sessions yet. Start a new chat.');
			this.updateSessionsPanelVisibility();
			return;
		}

		for (const session of sessions) {
			const row = dom.append(this.sessionsListEl, dom.$('button.session-list-item')) as HTMLButtonElement;
			row.type = 'button';
			if (session.id === activeId) {
				row.classList.add('active');
				row.setAttribute('aria-current', 'true');
			}

			const main = dom.append(row, dom.$('.session-list-main'));
			const name = dom.append(main, dom.$('span.session-list-title'));
			name.textContent = session.title;

			const meta = dom.append(main, dom.$('span.session-list-meta'));
			const countLabel = session.messageCount === 1
				? localize('ecosystemsAiSessionOneMessage', '1 message')
				: localize('ecosystemsAiSessionNMessages', '{0} messages', session.messageCount);
			meta.textContent = `${this.formatSessionDate(session.updatedAt)} · ${countLabel}`;

			if (session.id === activeId) {
				dom.append(row, dom.$('span.codicon.codicon-check.session-list-check')).setAttribute('aria-hidden', 'true');
			}

			row.onclick = () => {
				if (session.id !== this.chatSessionService.getActiveSessionId()) {
					this.sessionsPanelManualShow = false;
					void this.chatSessionService.switchSession(session.id);
				} else if (session.messageCount > 0) {
					this.hideSessionsList();
				}
			};
		}
		this.updateSessionsPanelVisibility();
	}

	private formatSessionDate(timestamp: number): string {
		const d = new Date(timestamp);
		const today = new Date();
		const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
		const startOfYesterday = startOfToday - 86400000;
		if (timestamp >= startOfToday) {
			return localize('ecosystemsAiSessionToday', 'Today');
		}
		if (timestamp >= startOfYesterday) {
			return localize('ecosystemsAiSessionYesterday', 'Yesterday');
		}
		return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	private async bootstrapSessionHistory(): Promise<void> {
		await this.chatSessionService.initialize();
		this.sessionsReady = true;
		this.chatHistory.length = 0;
		this.chatHistory.push(...this.chatSessionService.getActiveMessages());
		if (repairChatToolHistory(this.chatHistory)) {
			this.persistChat();
		}
		this.applyModeFromSession();
		this.refreshSessionsList();
		this.rebuildMessagesFromHistory();
		this.updateSessionsPanelVisibility();
	}

	private async reloadActiveSession(): Promise<void> {
		this.stopActiveChat();
		this.cancelBackgroundCompaction();
		this.messageQueue.length = 0;
		this.refreshChatQueuePanel();
		this.chatHistory.length = 0;
		this.chatHistory.push(...this.chatSessionService.getActiveMessages());
		if (repairChatToolHistory(this.chatHistory)) {
			this.persistChat();
		}
		if (this.messagesEl) {
			dom.clearNode(this.messagesEl);
			this.rebuildMessagesFromHistory();
			this.messagesEl.scrollTop = 0;
		}
		this.applyModeFromSession();
		this.refreshSessionsList();
		this.sessionsPanelManualShow = this.chatHistory.length === 0;
		this.updateSessionsPanelVisibility();
	}

	private async startNewSession(): Promise<void> {
		this.stopActiveChat();
		this.sessionsPanelManualShow = true;
		await this.chatSessionService.createSession();
	}

	private getCompactKeepRecent(): number {
		const n = this.configurationService.getValue<number>(ECOSYSTEMS_AI_CHAT_COMPACT_KEEP_RECENT);
		return Number.isFinite(n) && n >= 4 ? Math.floor(n) : 10;
	}

	private getContextBudgetChars(): number {
		const n = this.configurationService.getValue<number>(ECOSYSTEMS_AI_CHAT_CONTEXT_BUDGET_CHARS);
		return Number.isFinite(n) && n >= 32_000 ? Math.floor(n) : DEFAULT_CONTEXT_BUDGET_CHARS;
	}

	private getCompactThresholdPercent(): number {
		const n = this.configurationService.getValue<number>(ECOSYSTEMS_AI_CHAT_COMPACT_THRESHOLD_PERCENT);
		return Number.isFinite(n) ? Math.min(95, Math.max(40, Math.floor(n))) : 72;
	}

	private isBackgroundCompactionEnabled(): boolean {
		return this.configurationService.getValue<boolean>(ECOSYSTEMS_AI_CHAT_COMPACT_BACKGROUND) !== false;
	}

	private getContextUsage() {
		return estimateContextUsage(
			this.chatHistory,
			this.chatSessionService.getActiveCompaction(),
			this.getCompactKeepRecent(),
			this.getContextBudgetChars(),
		);
	}

	private getWireMessages(): ChatMessage[] {
		return buildWireHistory(
			this.chatHistory,
			this.chatSessionService.getActiveCompaction(),
			this.getCompactKeepRecent(),
		);
	}

	private renderCompactionBanner(): void {
		if (!this.messagesEl) {
			return;
		}
		this.compactionBannerEl?.remove();
		this.compactionBannerEl = undefined;
		const state = this.chatSessionService.getActiveCompaction();
		if (!state) {
			return;
		}
		const row = dom.append(this.messagesEl, dom.$('.msg.compaction-banner'));
		this.compactionBannerEl = row;
		this.messagesEl.insertBefore(row, this.messagesEl.firstChild);
		const icon = dom.append(row, dom.$('span.codicon.codicon-fold'));
		icon.setAttribute('aria-hidden', 'true');
		const bubble = dom.append(row, dom.$('.bubble.compaction'));
		bubble.textContent = compactionBannerLabel(state, countPersistableMessages(this.chatHistory));
	}

	private scheduleBackgroundCompaction(customInstructions?: string, notifyOnComplete = false, force = false): void {
		if (this.configurationService.getValue<boolean>(ECOSYSTEMS_AI_CHAT_COMPACT_ENABLED) === false) {
			return;
		}
		if (!this.isBackgroundCompactionEnabled()) {
			return;
		}
		const after = this.configurationService.getValue<number>(ECOSYSTEMS_AI_CHAT_COMPACT_AFTER_MESSAGES) ?? 24;
		const usage = this.getContextUsage();
		if (!force && !shouldScheduleBackgroundCompaction(
			this.chatHistory,
			this.chatSessionService.getActiveCompaction(),
			usage,
			after,
			this.getCompactThresholdPercent(),
		) && !customInstructions) {
			return;
		}

		this.backgroundCompactionCts?.cancel();
		const cts = new CancellationTokenSource();
		this.backgroundCompactionCts = cts;
		this.compactionRunning = true;
		this.renderStatus();

		const compactModel = pickCompactionModel(
			this.configurationService.getValue<string>(ECOSYSTEMS_AI_CHAT_COMPACT_MODEL),
			this.model.id,
		);
		const keep = this.getCompactKeepRecent();
		const messagesSnapshot = this.chatHistory.map(m => ({ ...m }));
		const sessionId = this.chatSessionService.getActiveSessionId();

		this.backgroundCompactionPromise = (async () => {
			try {
				const state = await runCompaction(
					this.aiService,
					compactModel,
					messagesSnapshot,
					keep,
					cts.token,
					customInstructions,
				);
				if (!state || cts.token.isCancellationRequested) {
					return;
				}
				if (sessionId && this.chatSessionService.getActiveSessionId() !== sessionId) {
					return;
				}
				this.chatSessionService.setActiveCompaction(state);
				this.renderCompactionBanner();
				if (notifyOnComplete) {
					this.appendAssistantMessage(localize(
						'ecosystemsAiCompactedDone',
						'Compacted {0} earlier messages into a summary. Recent messages are unchanged in the chat.',
						state.compactedThroughIndex,
					));
				}
				this.persistChat();
			} finally {
				if (this.backgroundCompactionCts === cts) {
					this.compactionRunning = false;
					this.backgroundCompactionCts = undefined;
					this.renderStatus();
				}
			}
		})();

		void this.backgroundCompactionPromise.finally(() => {
			if (this.backgroundCompactionPromise) {
				this.backgroundCompactionPromise = undefined;
			}
		});
	}

	private async waitForCriticalCompaction(maxMs = 8000): Promise<void> {
		if (!this.backgroundCompactionPromise) {
			return;
		}
		const after = this.configurationService.getValue<number>(ECOSYSTEMS_AI_CHAT_COMPACT_AFTER_MESSAGES) ?? 24;
		if (!isCompactionStaleForCriticalSend(
			this.chatHistory,
			this.chatSessionService.getActiveCompaction(),
			this.getContextUsage(),
			after,
		)) {
			return;
		}
		await Promise.race([
			this.backgroundCompactionPromise,
			new Promise<void>(r => setTimeout(r, maxMs)),
		]);
	}

	private async runForegroundCompaction(token: CancellationToken, customInstructions?: string, notify = true): Promise<void> {
		const keep = this.getCompactKeepRecent();
		const compactModel = pickCompactionModel(
			this.configurationService.getValue<string>(ECOSYSTEMS_AI_CHAT_COMPACT_MODEL),
			this.model.id,
		);
		this.compactionRunning = true;
		this.renderStatus();
		try {
			const state = await runCompaction(
				this.aiService,
				compactModel,
				this.chatHistory,
				keep,
				token,
				customInstructions,
			);
			if (!state || token.isCancellationRequested) {
				return;
			}
			this.chatSessionService.setActiveCompaction(state);
			this.renderCompactionBanner();
			if (notify) {
				this.appendAssistantMessage(localize(
					'ecosystemsAiCompactedDone',
					'Compacted {0} earlier messages into a summary. Recent messages are unchanged in the chat.',
					state.compactedThroughIndex,
				));
			}
			this.persistChat();
		} finally {
			this.compactionRunning = false;
			this.renderStatus();
		}
	}

	/** Manual compaction (/compact or toolbar). */
	async compactConversation(customInstructions?: string): Promise<void> {
		if (this.isStreaming) {
			return;
		}
		if (this.isBackgroundCompactionEnabled()) {
			this.scheduleBackgroundCompaction(customInstructions, true, true);
			if (this.backgroundCompactionPromise) {
				await this.backgroundCompactionPromise;
			}
			return;
		}
		const cts = new CancellationTokenSource();
		try {
			await this.runForegroundCompaction(cts.token, customInstructions, true);
		} finally {
			cts.dispose();
		}
	}

	private cancelBackgroundCompaction(): void {
		this.backgroundCompactionCts?.cancel();
		this.backgroundCompactionCts = undefined;
		this.backgroundCompactionPromise = undefined;
		this.compactionRunning = false;
	}

	async createCheckpoint(label?: string): Promise<void> {
		if (this.configurationService.getValue<boolean>(ECOSYSTEMS_AI_CHAT_CHECKPOINTS_ENABLED) === false) {
			return;
		}
		await this.chatSessionService.createCheckpoint(label);
		this.appendAssistantMessage(localize('ecosystemsAiCheckpointSaved', 'Checkpoint saved. Use Restore checkpoint to roll back.'));
	}

	async restoreCheckpoint(): Promise<void> {
		if (this.configurationService.getValue<boolean>(ECOSYSTEMS_AI_CHAT_CHECKPOINTS_ENABLED) === false) {
			return;
		}
		const checkpoints = this.chatSessionService.listCheckpoints();
		if (!checkpoints.length) {
			this.appendAssistantMessage(localize('ecosystemsAiNoCheckpoints', 'No checkpoints in this session. Create one from the toolbar.'));
			return;
		}
		interface CpPick extends IQuickPickItem { id: string }
		const picks: CpPick[] = checkpoints.map(c => ({
			id: c.id,
			label: c.label,
			description: new Date(c.createdAt).toLocaleString(),
			detail: localize('ecosystemsAiCheckpointDetail', '{0} messages', c.messages.length),
		}));
		const choice = await this.quickInputService.pick(picks, {
			placeHolder: localize('ecosystemsAiRestoreCheckpointPicker', 'Restore checkpoint'),
			ignoreFocusLost: true,
		});
		if (!choice) {
			return;
		}
		this.stopActiveChat();
		await this.chatSessionService.restoreCheckpoint(choice.id);
		await this.reloadActiveSession();
	}

	private rebuildMessagesFromHistory(): void {
		if (!this.messagesEl) {
			return;
		}
		dom.clearNode(this.messagesEl);
		this.compactionBannerEl = undefined;
		this.renderCompactionBanner();
		let historyIndex = 0;
		for (const msg of this.chatHistory) {
			if (msg.role === 'user') {
				this.appendUserMessage(this.userDisplayText(msg), historyIndex);
				historyIndex++;
			} else if (msg.role === 'assistant') {
				if (msg.content) {
					this.appendAssistantMessage(msg.content);
				}
				if (msg.toolCalls?.length) {
					for (const call of msg.toolCalls) {
						this.appendToolMessage(`${call.name}(${this.summariseArgs(call.args)})`, 'done');
					}
				}
				historyIndex++;
			} else if (msg.role === 'tool') {
				const name = msg.toolName ?? 'tool';
				const preview = msg.content.split('\n')[0].slice(0, 100);
				this.appendToolMessage(`✓ ${name}: ${preview}`, 'done');
				historyIndex++;
			}
		}
		this.renderStatus();
	}

	private userDisplayText(msg: ChatMessage): string {
		if (msg.displayContent) {
			return msg.displayContent;
		}
		const m = msg.content.match(/<\/attached_(?:files|context)>\s*([\s\S]*)$/);
		return m ? m[1].trim() : msg.content;
	}

	private persistChat(): void {
		this.chatSessionService.saveActiveMessages(this.chatHistory, this.mode);
		this.refreshSessionsList();
		if (this.chatHistory.length > 0 && !this.sessionsPanelManualShow) {
			this.updateSessionsPanelVisibility();
		}
	}

	private renderChatQueuePanel(container: HTMLElement): void {
		this.chatQueuePanelEl = dom.append(container, dom.$('.chat-queue-panel'));
		this.chatQueuePanelEl.style.display = 'none';

		const header = dom.append(this.chatQueuePanelEl, dom.$('.chat-queue-header'));
		const toggleBtn = dom.append(header, dom.$('button.chat-queue-toggle')) as HTMLButtonElement;
		toggleBtn.type = 'button';
		this.chatQueueChevronEl = dom.append(toggleBtn, dom.$('span.codicon.codicon-chevron-down'));
		this.chatQueueChevronEl.setAttribute('aria-hidden', 'true');
		this.chatQueueCountEl = dom.append(toggleBtn, dom.$('span.chat-queue-count'));
		toggleBtn.onclick = () => {
			this.chatQueueCollapsed = !this.chatQueueCollapsed;
			this.refreshChatQueuePanel();
		};

		this.chatQueueListEl = dom.append(this.chatQueuePanelEl, dom.$('.chat-queue-list'));
	}

	private refreshChatQueuePanel(): void {
		if (!this.chatQueuePanelEl || !this.chatQueueListEl || !this.chatQueueCountEl || !this.chatQueueChevronEl) {
			return;
		}

		const count = this.messageQueue.length;
		if (count === 0) {
			this.chatQueuePanelEl.style.display = 'none';
			return;
		}

		this.chatQueuePanelEl.style.display = '';
		this.chatQueueCountEl.textContent = localize('ecosystemsAiQueueCount', '{0} Queued', count);
		this.chatQueueChevronEl.className = this.chatQueueCollapsed
			? 'codicon codicon-chevron-right'
			: 'codicon codicon-chevron-down';
		this.chatQueueListEl.style.display = this.chatQueueCollapsed ? 'none' : '';

		dom.clearNode(this.chatQueueListEl);
		for (const item of this.messageQueue) {
			this.renderChatQueueItem(this.chatQueueListEl, item);
		}
	}

	private renderChatQueueItem(parent: HTMLElement, item: QueuedMessage): void {
		const row = dom.append(parent, dom.$('.chat-queue-item'));
		dom.append(row, dom.$('span.codicon.codicon-circle-outline.chat-queue-dot')).setAttribute('aria-hidden', 'true');

		const body = dom.append(row, dom.$('.chat-queue-body'));
		const textEl = dom.append(body, dom.$('span.chat-queue-text'));
		textEl.textContent = item.text;
		if (item.attachments.length) {
			const att = dom.append(body, dom.$('span.chat-queue-attachments'));
			att.textContent = localize('ecosystemsAiQueueAttachments', '+ {0} file(s)', item.attachments.length);
		}

		const actions = dom.append(row, dom.$('.chat-queue-actions'));

		const editBtn = dom.append(actions, dom.$('button.chat-queue-action')) as HTMLButtonElement;
		editBtn.type = 'button';
		editBtn.title = localize('ecosystemsAiQueueEdit', 'Edit');
		editBtn.setAttribute('aria-label', editBtn.title);
		dom.append(editBtn, dom.$('span.codicon.codicon-edit')).setAttribute('aria-hidden', 'true');
		editBtn.onclick = e => {
			e.stopPropagation();
			this.beginEditQueueItem(item.id, row, body);
		};

		const sendBtn = dom.append(actions, dom.$('button.chat-queue-action')) as HTMLButtonElement;
		sendBtn.type = 'button';
		sendBtn.title = localize('ecosystemsAiQueueForceSend', 'Send now');
		sendBtn.setAttribute('aria-label', sendBtn.title);
		dom.append(sendBtn, dom.$('span.codicon.codicon-arrow-up')).setAttribute('aria-hidden', 'true');
		sendBtn.onclick = e => {
			e.stopPropagation();
			void this.forceSendQueueItem(item.id);
		};

		const deleteBtn = dom.append(actions, dom.$('button.chat-queue-action')) as HTMLButtonElement;
		deleteBtn.type = 'button';
		deleteBtn.title = localize('ecosystemsAiQueueDelete', 'Remove from queue');
		deleteBtn.setAttribute('aria-label', deleteBtn.title);
		dom.append(deleteBtn, dom.$('span.codicon.codicon-trash')).setAttribute('aria-hidden', 'true');
		deleteBtn.onclick = e => {
			e.stopPropagation();
			this.deleteQueueItem(item.id);
		};
	}

	private beginEditQueueItem(id: string, row: HTMLElement, body: HTMLElement): void {
		const item = this.messageQueue.find(q => q.id === id);
		if (!item) {
			return;
		}

		row.classList.add('chat-queue-item-editing');
		dom.clearNode(body);

		const editor = dom.append(body, dom.$('textarea.chat-queue-editor')) as HTMLTextAreaElement;
		editor.value = item.text;
		editor.rows = Math.min(6, Math.max(2, item.text.split('\n').length));
		editor.focus();

		const actionRow = dom.append(body, dom.$('.chat-queue-editor-actions'));
		const cancelBtn = dom.append(actionRow, dom.$('button.chat-queue-editor-btn')) as HTMLButtonElement;
		cancelBtn.type = 'button';
		cancelBtn.textContent = localize('ecosystemsAiCancel', 'Cancel');
		const saveBtn = dom.append(actionRow, dom.$('button.chat-queue-editor-btn.primary')) as HTMLButtonElement;
		saveBtn.type = 'button';
		saveBtn.textContent = localize('ecosystemsAiSave', 'Save');

		const restore = () => {
			row.classList.remove('chat-queue-item-editing');
			this.refreshChatQueuePanel();
		};

		const commit = () => {
			const next = editor.value.trim();
			if (!next) {
				this.deleteQueueItem(id);
				return;
			}
			item.text = next;
			restore();
		};

		cancelBtn.onclick = () => restore();
		saveBtn.onclick = () => commit();
		editor.onkeydown = e => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				commit();
			} else if (e.key === 'Escape') {
				e.preventDefault();
				restore();
			}
		};
	}

	private enqueueMessage(text: string): void {
		this.messageQueue.push({
			id: generateUuid(),
			text,
			attachments: this.attachments.map(cloneChatAttachment),
		});
		this.attachments.length = 0;
		this.renderAttachments();
		this.refreshChatQueuePanel();
	}

	private deleteQueueItem(id: string): void {
		const idx = this.messageQueue.findIndex(q => q.id === id);
		if (idx >= 0) {
			this.messageQueue.splice(idx, 1);
			this.refreshChatQueuePanel();
		}
	}

	private async forceSendQueueItem(id: string): Promise<void> {
		const idx = this.messageQueue.findIndex(q => q.id === id);
		if (idx < 0) {
			return;
		}
		const item = this.messageQueue.splice(idx, 1)[0];
		this.refreshChatQueuePanel();

		if (this.isStreaming) {
			this.skipQueueDrain = true;
			this.activeRequest?.cancel();
			this.removeAllThinkingRows();
			const deadline = Date.now() + 30000;
			while (this.isStreaming && Date.now() < deadline) {
				await new Promise<void>(resolve => setTimeout(resolve, 50));
			}
			this.skipQueueDrain = false;
		}

		await this.submit(item.text, item.attachments);
	}

	private async drainMessageQueue(): Promise<void> {
		if (this.processingQueue || this.isStreaming || this.messageQueue.length === 0) {
			return;
		}
		this.processingQueue = true;
		try {
			while (!this.isStreaming && this.messageQueue.length > 0) {
				const next = this.messageQueue.shift()!;
				this.refreshChatQueuePanel();
				await this.submit(next.text, next.attachments);
			}
		} finally {
			this.processingQueue = false;
			this.refreshChatQueuePanel();
		}
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
		switch (this.mode) {
			case 'agent':
				return localize('ecosystemsAiModeAgent', 'Agent');
			case 'plan':
				return localize('ecosystemsAiModePlan', 'Plan');
			default:
				return localize('ecosystemsAiModeAsk', 'Ask');
		}
	}

	private applyModeFromSession(): void {
		const stored = this.chatSessionService.getActiveMode();
		if (stored) {
			this.mode = stored;
			if (this.modeButtonLabel) {
				this.modeButtonLabel.textContent = this.modeLabel();
			}
			this.renderStatus();
		}
	}

	private pickMode(anchor: HTMLElement): void {
		const modes: { id: ChatMode; label: string }[] = [
			{ id: 'agent', label: localize('ecosystemsAiModeAgent', 'Agent') },
			{ id: 'plan', label: localize('ecosystemsAiModePlan', 'Plan') },
			{ id: 'ask', label: localize('ecosystemsAiModeAsk', 'Ask') },
		];
		const actions = modes.map(m => {
			const action = new Action(`ecosystems.ai.mode.${m.id}`, m.label, undefined, true, async () => {
				this.mode = m.id;
				if (this.modeButtonLabel) {
					this.modeButtonLabel.textContent = this.modeLabel();
				}
				this.renderStatus();
				this.persistChat();
			});
			action.checked = this.mode === m.id;
			return action;
		});
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => actions,
			onHide: () => actions.forEach(a => { if (a instanceof Action) { a.dispose(); } }),
		});
	}

	private async pickModel(anchor: HTMLElement): Promise<void> {
		if (this.modelPickerPopupEl?.style.display !== 'none') {
			this.closeModelPicker();
			return;
		}
		// Always refresh the list right before showing it so newly-loaded API
		// keys (e.g. from .env.local) are reflected without restarting.
		await this.loadModels();
		this.showModelPicker(anchor, pickIntelligenceModels(this.models));
	}

	private showModelPicker(anchor: HTMLElement, modes: GatewayModelInfo[]): void {
		if (!this.modelPickerPopupEl) {
			return;
		}
		this.closeModelPicker();
		dom.clearNode(this.modelPickerPopupEl);
		this.modelPickerPopupEl.style.display = '';

		for (const m of modes) {
			const row = dom.append(this.modelPickerPopupEl, dom.$('.model-picker-item'));
			if (this.model.id === m.id) {
				row.classList.add('selected');
				const check = dom.append(row, dom.$('span.codicon.codicon-check'));
				check.setAttribute('aria-hidden', 'true');
			}
			const body = dom.append(row, dom.$('.model-picker-body'));
			const name = dom.append(body, dom.$('.model-picker-name'));
			name.textContent = m.displayName;
			const hint = dom.append(body, dom.$('.model-picker-hint'));
			hint.textContent = intelligenceModeHint(m.id);
			row.onclick = (e) => {
				e.stopPropagation();
				this.model = m;
				if (this.modelButtonLabel) {
					this.modelButtonLabel.textContent = this.model.displayName;
				}
				this.closeModelPicker();
			};
		}

		const composer = anchor.closest('.ecosystems-ai-composer') as HTMLElement | null;
		if (composer) {
			const anchorRect = anchor.getBoundingClientRect();
			const composerRect = composer.getBoundingClientRect();
			this.modelPickerPopupEl.style.left = `${Math.max(0, anchorRect.left - composerRect.left)}px`;
			this.modelPickerPopupEl.style.bottom = `${composerRect.bottom - anchorRect.top + 6}px`;
		}

		const targetWindow = dom.getWindow(anchor);
		const onDocMouseDown = (e: MouseEvent) => {
			const target = e.target as Node | null;
			if (target && !this.modelPickerPopupEl?.contains(target) && !anchor.contains(target)) {
				this.closeModelPicker();
			}
		};
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				this.closeModelPicker();
			}
		};
		setTimeout(() => {
			targetWindow.document.addEventListener('mousedown', onDocMouseDown, true);
			targetWindow.document.addEventListener('keydown', onKeyDown, true);
		}, 0);
		this.modelPickerDismiss = {
			dispose: () => {
				targetWindow.document.removeEventListener('mousedown', onDocMouseDown, true);
				targetWindow.document.removeEventListener('keydown', onKeyDown, true);
			},
		};
	}

	private closeModelPicker(): void {
		this.modelPickerDismiss?.dispose();
		this.modelPickerDismiss = undefined;
		if (this.modelPickerPopupEl) {
			this.modelPickerPopupEl.style.display = 'none';
			dom.clearNode(this.modelPickerPopupEl);
		}
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
				this.model = resolveIntelligenceModel(this.model.id, fetched);
				if (this.modelButtonLabel) {
					this.modelButtonLabel.textContent = this.model.displayName;
				}
			}
		} catch {
			// Keep defaults -- gateway might be unreachable in dev.
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
		const statusText = this.mode === 'agent'
			? localize('ecosystemsAiStatusAgentApprovals', 'Default approvals')
			: this.mode === 'plan'
				? localize('ecosystemsAiStatusPlan', 'Plan only')
				: localize('ecosystemsAiStatusAsk', 'Read-only');
		dom.append(approvals, document.createTextNode(statusText));

		if (this.configurationService.getValue<boolean>(ECOSYSTEMS_AI_CHAT_COMPACT_ENABLED) !== false) {
			const usage = this.getContextUsage();
			const meter = dom.append(this.statusEl, dom.$('span.context-meter'));
			meter.title = localize(
				'ecosystemsAiContextMeterTitle',
				'~{0} of ~{1} estimated context characters',
				usage.estimatedChars.toLocaleString(),
				usage.budgetChars.toLocaleString(),
			);
			const bar = dom.append(meter, dom.$('span.context-meter-bar'));
			const fill = dom.append(bar, dom.$('span.context-meter-fill'));
			fill.style.width = `${usage.percent}%`;
			if (usage.percent >= 85) {
				fill.classList.add('high');
			}
			if (this.compactionRunning) {
				fill.classList.add('compacting');
			}
			dom.append(meter, document.createTextNode(contextUsageLabel(usage)));
		}

		if (this.compactionRunning) {
			const compacting = dom.append(this.statusEl, dom.$('span.context-compacting'));
			const loadIcon = dom.append(compacting, dom.$('span.codicon.codicon-loading'));
			loadIcon.setAttribute('aria-hidden', 'true');
			dom.append(compacting, document.createTextNode(localize('ecosystemsAiCompactingStatus', 'Compacting...')));
		}

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
		const bubble = dom.append(row, dom.$('.bubble.bubble-prose'));
		if (opts.loading) {
			bubble.classList.add('bubble-loading');
			const shimmer = dom.append(bubble, dom.$('.shimmer'));
			dom.append(shimmer, dom.$('.shimmer-bar'));
			dom.append(shimmer, dom.$('.shimmer-bar.short'));
			dom.append(shimmer, dom.$('.shimmer-bar.medium'));
		} else if (content.trim() && this.assistantRenderer) {
			this.assistantRenderer.renderMarkdown(bubble, content, false);
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
			this.persistChat();
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

	// ---------------- chat context (attachments, paste, @) ----------------

	private registerChatHost(): void {
		if (!this.inputEl) {
			return;
		}
		this.chatContextService.registerHost({
			addAttachments: items => this.pushAttachments(items),
			focusComposer: () => this.inputEl?.focus(),
			revealChat: async () => {
				await this.viewsService.openView(ECOSYSTEMS_AI_CHAT_VIEW_ID, true);
			},
		});
	}

	private pushAttachments(items: readonly ChatAttachment[]): void {
		for (const item of items) {
			const key = attachmentKey(item);
			if (!this.attachments.some(a => attachmentKey(a) === key)) {
				this.attachments.push(item);
			}
		}
		this.renderAttachments();
	}

	private removeAttachment(att: ChatAttachment): void {
		const idx = this.attachments.indexOf(att);
		if (idx >= 0) {
			this.attachments.splice(idx, 1);
			const url = this.attachmentObjectUrls.get(att.id);
			if (url) {
				URL.revokeObjectURL(url);
				this.attachmentObjectUrls.delete(att.id);
			}
			this.renderAttachments();
		}
	}

	private attachmentIconClass(kind: ChatAttachment['kind']): string {
		switch (kind) {
			case 'folder': return 'codicon-folder';
			case 'image': return 'codicon-file-media';
			case 'terminal': return 'codicon-terminal';
			default: return 'codicon-file';
		}
	}

	private renderAttachments(): void {
		if (!this.attachmentsEl) {
			return;
		}
		dom.clearNode(this.attachmentsEl);
		if (this.attachments.length === 0) {
			this.attachmentsEl.style.display = 'none';
			return;
		}
		this.attachmentsEl.style.display = '';
		for (const att of this.attachments) {
			const chip = dom.append(this.attachmentsEl, dom.$('.attachment-chip'));
			if (att.kind === 'image' && att.imageData && att.imageMime) {
				chip.classList.add('attachment-chip-image');
				let url = this.attachmentObjectUrls.get(att.id);
				if (!url) {
					url = URL.createObjectURL(new Blob([att.imageData], { type: att.imageMime }));
					this.attachmentObjectUrls.set(att.id, url);
				}
				const thumb = dom.append(chip, dom.$('.attachment-thumb')) as HTMLElement;
				thumb.style.backgroundImage = `url("${url}")`;
			} else {
				const icon = dom.append(chip, dom.$('span.codicon'));
				icon.className = `codicon ${this.attachmentIconClass(att.kind)}`;
				icon.setAttribute('aria-hidden', 'true');
			}
			const label = dom.append(chip, dom.$('span.attachment-label'));
			label.textContent = att.label;
			label.title = att.label;
			const remove = dom.append(chip, dom.$('button.attachment-remove')) as HTMLButtonElement;
			remove.type = 'button';
			remove.title = localize('ecosystemsAiRemoveAttachment', 'Remove');
			const removeIcon = dom.append(remove, dom.$('span.codicon.codicon-close'));
			removeIcon.setAttribute('aria-hidden', 'true');
			remove.onclick = () => this.removeAttachment(att);
		}
	}

	private async showAttachMenu(_anchor: HTMLElement): Promise<void> {
		const hasTerminalSelection = !!this.terminalService.activeInstance?.hasSelection();
		interface AttachPick extends IQuickPickItem { action: 'mention' | 'dialog' | 'terminal' }
		const picks: AttachPick[] = [
			{
				action: 'mention',
				label: localize('ecosystemsAiAttachMention', 'Attach with @...'),
				description: localize('ecosystemsAiAttachMentionDesc', 'Search workspace files and folders'),
			},
			{
				action: 'dialog',
				label: localize('ecosystemsAiAttachDialog', 'Choose files or folders...'),
			},
		];
		if (hasTerminalSelection) {
			picks.push({
				action: 'terminal',
				label: localize('ecosystemsAiAttachTerminal', 'Attach terminal selection'),
			});
		}
		const choice = await this.quickInputService.pick(picks, {
			placeHolder: localize('ecosystemsAiAttachPlaceholder', 'Add context to your message'),
		});
		if (!choice) {
			return;
		}
		if (choice.action === 'mention') {
			this.openMentionPickerFromButton();
		} else if (choice.action === 'dialog') {
			await this.commandService.executeCommand(ECOSYSTEMS_AI_COMMAND_ATTACH_FILES);
		} else {
			await this.commandService.executeCommand(ECOSYSTEMS_AI_COMMAND_ATTACH_TERMINAL);
		}
	}

	private handleComposerPaste(e: ClipboardEvent): void {
		const clipboard = e.clipboardData;
		if (!clipboard) {
			return;
		}
		const files: File[] = [];
		if (clipboard.files?.length) {
			for (let i = 0; i < clipboard.files.length; i++) {
				files.push(clipboard.files[i]);
			}
		}
		if (files.length > 0) {
			e.preventDefault();
			void this.addPastedFiles(files);
			return;
		}
		const imageItems: DataTransferItem[] = [];
		const items = clipboard.items;
		for (let i = 0; i < items.length; i++) {
			const item = items[i];
			if (item.type.startsWith('image/')) {
				imageItems.push(item);
			}
		}
		if (imageItems.length === 0) {
			return;
		}
		e.preventDefault();
		void this.addPastedImages(imageItems);
	}

	private async addPastedFiles(files: readonly File[]): Promise<void> {
		const newAttachments: ChatAttachment[] = [];
		let imageIndex = this.attachments.filter(a => a.kind === 'image').length + 1;
		for (const file of files) {
			const buf = new Uint8Array(await file.arrayBuffer());
			const mime = file.type || 'application/octet-stream';
			const name = file.name?.trim() || localize('ecosystemsAiPastedFile', 'Pasted file');
			if (mime.startsWith('image/')) {
				const baseName = localize('ecosystemsAiPastedImage', 'Pasted image');
				const label = imageIndex === 1 ? baseName : `${baseName} ${imageIndex}`;
				imageIndex++;
				newAttachments.push(createChatAttachment({
					kind: 'image',
					label,
					imageData: buf,
					imageMime: mime,
				}));
			} else {
				newAttachments.push(createChatAttachment({
					kind: 'file',
					label: name,
					binaryData: buf,
					mimeType: mime,
				}));
			}
		}
		if (newAttachments.length) {
			this.pushAttachments(newAttachments);
		}
	}

	private async addPastedImages(items: readonly DataTransferItem[]): Promise<void> {
		const files: File[] = [];
		for (const item of items) {
			const file = item.getAsFile();
			if (file) {
				files.push(file);
			}
		}
		if (files.length) {
			await this.addPastedFiles(files);
		}
	}

	private async handleComposerDrop(e: DragEvent): Promise<void> {
		const files = e.dataTransfer?.files;
		if (!files?.length) {
			return;
		}
		const newAttachments: ChatAttachment[] = [];
		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			const path = (file as File & { path?: string }).path;
			if (!path) {
				const buf = new Uint8Array(await file.arrayBuffer());
				newAttachments.push(createChatAttachment({
					kind: 'file',
					label: file.name?.trim() || localize('ecosystemsAiDroppedFile', 'Dropped file'),
					binaryData: buf,
					mimeType: file.type || 'application/octet-stream',
				}));
				continue;
			}
			const uri = URI.file(path);
			try {
				const stat = await this.fileService.resolve(uri, { resolveMetadata: true });
				newAttachments.push(createChatAttachment({
					kind: stat.isDirectory ? 'folder' : 'file',
					label: this.toWorkspaceRelativeLabel(uri),
					uri,
				}));
			} catch {
				newAttachments.push(createChatAttachment({
					kind: 'file',
					label: basename(path),
					uri,
				}));
			}
		}
		if (newAttachments.length) {
			this.pushAttachments(newAttachments);
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

		const workspaceFolders = this.workspaceContextService.getWorkspace().folders;
		if (workspaceFolders.length === 0) {
			this.showMentionItems([]);
			return;
		}

		const items: ChatAttachment[] = [];
		const seen = new Set<string>();

		const addItem = (att: ChatAttachment) => {
			const key = attachmentKey(att);
			if (!seen.has(key)) {
				seen.add(key);
				items.push(att);
			}
		};

		if (!query) {
			for (const folder of workspaceFolders) {
				addItem(createChatAttachment({
					kind: 'folder',
					label: folder.name,
					uri: folder.uri,
				}));
			}
		} else {
			await this.addFolderMentionCandidates(query, workspaceFolders, addItem, token);
		}

		const fileQuery: IFileQuery = {
			type: QueryType.File,
			folderQueries: workspaceFolders.map(f => ({ folder: f.uri })),
			filePattern: query || '*',
			sortByScore: true,
			maxResults: 25,
			cacheKey: 'ecosystems-ai-mention',
		};
		try {
			const complete = await this.searchService.fileSearch(fileQuery, token);
			if (token.isCancellationRequested) {
				return;
			}
			const qLower = query.toLowerCase();
			for (const r of complete.results) {
				if (items.length >= 25) {
					break;
				}
				addItem(createChatAttachment({
					kind: 'file',
					uri: r.resource,
					label: this.toWorkspaceRelativeLabel(r.resource),
				}));
				if (query) {
					let dir = resourceDirname(r.resource);
					const root = this.workspaceContextService.getWorkspaceFolder(r.resource);
					for (let depth = 0; depth < 5 && root && dir.path.length >= root.uri.path.length; depth++) {
						const name = basename(dir.path);
						if (name && name.toLowerCase().includes(qLower)) {
							addItem(createChatAttachment({
								kind: 'folder',
								uri: dir,
								label: this.toWorkspaceRelativeLabel(dir),
							}));
						}
						if (dir.path === root.uri.path) {
							break;
						}
						dir = resourceDirname(dir);
					}
				}
			}
			this.showMentionItems(items.slice(0, 25));
		} catch {
			if (!token.isCancellationRequested && items.length) {
				this.showMentionItems(items.slice(0, 25));
			}
		}
	}

	private async addFolderMentionCandidates(
		query: string,
		workspaceFolders: readonly { name: string; uri: URI }[],
		addItem: (att: ChatAttachment) => void,
		token: CancellationToken,
	): Promise<void> {
		const segments = query.split(/[/\\]/).filter(Boolean);
		for (const folder of workspaceFolders) {
			if (token.isCancellationRequested) {
				return;
			}
			let target = folder.uri;
			for (const seg of segments) {
				target = URI.joinPath(target, seg);
			}
			try {
				const stat = await this.fileService.resolve(target, { resolveMetadata: true });
				if (stat.isDirectory) {
					addItem(createChatAttachment({
						kind: 'folder',
						label: this.toWorkspaceRelativeLabel(target),
						uri: target,
					}));
				}
			} catch {
				// not a valid folder path
			}
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

	private showMentionItems(items: ChatAttachment[]): void {
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
		header.textContent = localize('ecosystemsAiMentionHeader', 'Files and folders');

		for (let i = 0; i < items.length; i++) {
			const item = items[i];
			const row = dom.append(this.mentionPopupEl, dom.$('.mention-item'));
			if (i === this.mentionActiveIndex) {
				row.classList.add('active');
			}
			const icon = dom.append(row, dom.$('span.codicon'));
			icon.className = `codicon ${this.attachmentIconClass(item.kind)}`;
			icon.setAttribute('aria-hidden', 'true');
			const name = dom.append(row, dom.$('span.mention-name'));
			name.textContent = item.uri ? basename(item.uri.path) : item.label;
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

	private commitMention(item: ChatAttachment): void {
		if (!this.inputEl || this.mentionTokenStart < 0) {
			return;
		}
		this.pushAttachments([item]);
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

	// ---------------- /mention ----------------

	private async sendMessage(): Promise<void> {
		if (!this.inputEl) {
			return;
		}
		const text = this.inputEl.value.trim();
		if (!text) {
			return;
		}
		this.inputEl.value = '';
		const parsed = parseCompactSlashCommand(text);
		if (parsed.kind === 'compact') {
			await this.compactConversation(parsed.instructions || undefined);
			return;
		}
		if (this.isStreaming) {
			this.enqueueMessage(parsed.text);
			return;
		}
		await this.submit(parsed.text);
	}

	private async submit(text: string, queuedAttachments?: readonly ChatAttachment[]): Promise<void> {
		if (!this.sendButton || this.isStreaming) {
			return;
		}

		// Make sure the selected model id is one the gateway actually knows
		// about -- otherwise a stale default (or previously-picked model that
		// no longer exists) will produce a 404 from the provider.
		await this.loadModels();

		// Snapshot attachments at send time so subsequent edits don't mutate
		// what's already been sent. Clear the chips so the user starts fresh.
		const sentAttachments = queuedAttachments ?? this.attachments.map(cloneChatAttachment);
		if (!queuedAttachments) {
			this.attachments.length = 0;
			this.renderAttachments();
		}

		this.activeRequest?.cancel();
		this.activeRequest = new CancellationTokenSource();
		const store = new DisposableStore();

		// Build wire content with attachment preamble, but show the user the
		// plain prompt in the bubble (the chips already conveyed the files).
		const workspaceRoot = this.workspaceContextService.getWorkspace().folders[0]?.uri;
		const stagedAttachments = await stageAttachmentsToWorkspace(
			this.fileService,
			workspaceRoot,
			sentAttachments,
			this.activeRequest.token,
		);
		const placedAttachments = await autoPlaceBinaryAttachments(
			this.fileService,
			workspaceRoot,
			stagedAttachments,
			this.activeRequest.token,
		);
		this.lastAttachedBinaryPath = undefined;
		for (const att of placedAttachments) {
			if (att.kind === 'file' && att.stagedRelativePath && isBinaryFilePath(att.label)) {
				this.lastAttachedBinaryPath = att.stagedRelativePath;
				break;
			}
		}
		const { preamble, images } = await buildAttachmentsPreamble(
			this.fileService,
			this.activeRequest.token,
			placedAttachments,
			workspaceRoot,
		);
		const wireContent = preamble + text;
		this.chatHistory.push(createUserChatMessage(text, wireContent, images));
		this.persistChat();
		const bubble = this.appendUserMessage(text, this.chatHistory.length - 1);
		if (sentAttachments.length) {
			const ctxRow = dom.append(bubble, dom.$('.bubble-attachments'));
			for (const f of sentAttachments) {
				const chip = dom.append(ctxRow, dom.$('span.bubble-attachment'));
				const ic = dom.append(chip, dom.$('span.codicon'));
				ic.className = `codicon ${this.attachmentIconClass(f.kind)}`;
				ic.setAttribute('aria-hidden', 'true');
				dom.append(chip, document.createTextNode(' ' + f.label));
			}
		}

		this.isStreaming = true;
		this.updateSendButtonState();
		this.renderStatus();

		try {
			await this.waitForCriticalCompaction();
			if (this.isChatCancelled()) {
				return;
			}
			if (this.mode === 'agent') {
				await this.runAgentTurn();
			} else if (this.mode === 'plan') {
				await this.runPlanTurn();
			} else {
				await this.runChatTurn();
			}
		} finally {
			this.isStreaming = false;
			this.updateSendButtonState();
			this.persistChat();
			this.scheduleBackgroundCompaction();
			this.renderStatus();
			store.dispose();
			if (!this.skipQueueDrain) {
				void this.drainMessageQueue();
			}
		}
	}


	private isChatCancelled(): boolean {
		return !!this.activeRequest?.token.isCancellationRequested;
	}

	private removeAllThinkingRows(): void {
		if (!this.messagesEl) {
			return;
		}
		for (const row of [...this.messagesEl.querySelectorAll('.msg.thinking')]) {
			row.remove();
		}
	}

	/** Remove empty assistant placeholders left after Stop. */
	private removeEmptyLoadingAssistantRows(): void {
		if (!this.messagesEl) {
			return;
		}
		for (const row of [...this.messagesEl.querySelectorAll('.msg.assistant')]) {
			const bubble = row.querySelector('.bubble.bubble-loading');
			if (bubble && !bubble.textContent?.trim()) {
				row.remove();
			}
		}
	}

	/** Stop button: cancel in-flight work and reset chat UI immediately. */
	private stopActiveChat(): void {
		this.activeRequest?.cancel();
		this.messageQueue.length = 0;
		this.refreshChatQueuePanel();
		this.removeAllThinkingRows();
		this.removeEmptyLoadingAssistantRows();
		if (this.isStreaming) {
			this.isStreaming = false;
			this.updateSendButtonState();
			this.renderStatus();
		}
	}

	private finalizeAgentStoppedByUser(): void {
		if (repairChatToolHistory(this.chatHistory)) {
			this.persistChat();
		}
		this.appendAssistantMessage(localize('ecosystemsAiAgentStoppedByUser', 'Stopped by you.'));
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

	private async runPlanTurn(): Promise<void> {
		let workspaceSnapshot = '';
		try {
			workspaceSnapshot = await this.agentTools.snapshotWorkspaceTree(180, 3);
		} catch {
			workspaceSnapshot = '(workspace tree unavailable)';
		}
		const systemPrompt: ChatMessage = {
			role: 'system',
			content: buildPlanSystemPromptContent(workspaceSnapshot),
		};
		const wire = this.getWireMessages();
		const compacted = wire.find(m => m.role === 'system' && m.content.includes(COMPACTED_SYSTEM_MARKER));
		const tail = wire.filter(m => m.role === 'user' || m.role === 'assistant').map(m => ({ ...m }));
		const messages: ChatMessage[] = compacted
			? [systemPrompt, { ...compacted }, ...tail]
			: [systemPrompt, ...tail];

		const thinking = this.appendThinkingRow(getPlanThinkingMessages());
		const bubble = this.appendAssistantMessage('', { loading: true });
		let assistantText = '';
		let firstChunk = true;
		let thinkingDisposed = false;
		const disposeThinking = () => {
			if (!thinkingDisposed) {
				thinkingDisposed = true;
				thinking.dispose();
			}
		};
		try {
			for await (const chunk of this.aiService.chatStream(messages, this.activeRequest!.token, { model: this.model.id, feature: 'chat' })) {
				if (this.isChatCancelled()) {
					break;
				}
				if (chunk.type === 'text' && chunk.text) {
					if (firstChunk) {
						firstChunk = false;
						disposeThinking();
						this.assistantRenderer?.prepareStreaming(bubble);
					}
					assistantText += chunk.text;
					this.assistantRenderer?.updateStreaming(bubble, assistantText);
					this.scrollToBottom();
				} else if (chunk.type === 'error' && chunk.error) {
					if (!this.isChatCancelled()) {
						this.assistantRenderer?.renderPlain(bubble, chunk.error.message);
					}
					return;
				} else if (chunk.type === 'done') {
					break;
				}
			}
			if (this.isChatCancelled()) {
				if (!assistantText.trim()) {
					this.assistantRenderer?.renderPlain(bubble, localize('ecosystemsAiCancelled', 'Stopped.'));
				}
				return;
			}
			if (assistantText.trim()) {
				this.assistantRenderer?.renderMarkdown(bubble, assistantText, true);
				this.chatHistory.push({ role: 'assistant', content: assistantText });
				this.persistChat();
			} else {
				this.assistantRenderer?.renderPlain(bubble, localize(
					'ecosystemsAiEmptyModelReply',
					'The model returned nothing (no text, no tool calls). Restart the gateway (.\\scripts\\run-all.ps1), try again, or switch to GPT-4o mini.',
				));
			}
		} catch {
			this.assistantRenderer?.renderPlain(bubble, this.isChatCancelled()
				? localize('ecosystemsAiCancelled', 'Stopped.')
				: localize('ecosystemsAiChatFailed', 'Request failed.'));
		} finally {
			disposeThinking();
			if (this.isChatCancelled()) {
				this.removeEmptyLoadingAssistantRows();
			}
		}
	}

	private async runChatTurn(): Promise<void> {
		const thinking = this.appendThinkingRow(getAskThinkingMessages());
		const bubble = this.appendAssistantMessage('', { loading: true });
		let assistantText = '';
		let firstChunk = true;
		let thinkingDisposed = false;
		const disposeThinking = () => {
			if (!thinkingDisposed) {
				thinkingDisposed = true;
				thinking.dispose();
			}
		};
		try {
			for await (const chunk of this.aiService.chatStream(this.getWireMessages(), this.activeRequest!.token, { model: this.model.id, feature: 'chat' })) {
				if (this.isChatCancelled()) {
					break;
				}
				if (chunk.type === 'text' && chunk.text) {
					if (firstChunk) {
						firstChunk = false;
						disposeThinking();
						this.assistantRenderer?.prepareStreaming(bubble);
					}
					assistantText += chunk.text;
					this.assistantRenderer?.updateStreaming(bubble, assistantText);
					this.scrollToBottom();
				} else if (chunk.type === 'error' && chunk.error) {
					if (!this.isChatCancelled()) {
						this.assistantRenderer?.renderPlain(bubble, chunk.error.message);
					}
					return;
				} else if (chunk.type === 'done') {
					break;
				}
			}
			if (this.isChatCancelled()) {
				if (!assistantText.trim()) {
					this.assistantRenderer?.renderPlain(bubble, localize('ecosystemsAiCancelled', 'Stopped.'));
				}
				return;
			}
			if (assistantText.trim()) {
				this.assistantRenderer?.renderMarkdown(bubble, assistantText, true);
				this.chatHistory.push({ role: 'assistant', content: assistantText });
				this.persistChat();
			} else {
				this.assistantRenderer?.renderPlain(bubble, localize(
					'ecosystemsAiEmptyModelReply',
					'The model returned nothing (no text, no tool calls). Restart the gateway (.\\scripts\\run-all.ps1), try again, or switch to GPT-4o mini.',
				));
			}
		} catch {
			this.assistantRenderer?.renderPlain(bubble, this.isChatCancelled()
				? localize('ecosystemsAiCancelled', 'Stopped.')
				: localize('ecosystemsAiChatFailed', 'Request failed.'));
		} finally {
			disposeThinking();
			if (this.isChatCancelled()) {
				this.removeEmptyLoadingAssistantRows();
			}
		}
	}

	private async runAgentTurn(): Promise<void> {
		this.fileChangeService.clearTurn();
		this.activityService.clearTurn();
		this.pendingWritePaths.clear();
		this.refreshAgentActivityPanel();
		await this.stackPlaybookService.initialize();
		let workspaceSnapshot = '';
		try {
			workspaceSnapshot = await this.agentTools.snapshotWorkspaceTree(180, 3);
		} catch {
			workspaceSnapshot = '(workspace tree unavailable)';
		}
		const systemPrompt: ChatMessage = {
			role: 'system',
			content: this.buildAgentSystemPromptContent(workspaceSnapshot),
		};
		if (repairChatToolHistory(this.chatHistory)) {
			this.persistChat();
		}

		const messages: ChatMessage[] = [systemPrompt, ...this.getWireMessages()
			.filter(m => m.role !== 'assistant' || !!m.toolCalls?.length || !!m.content?.trim())
			.map(m => ({ ...m }))];

		const maxSteps = 16;
		let lastBubble: HTMLElement | undefined;
		let lastToolNames: string[] | undefined;

		for (let step = 0; step < maxSteps; step++) {
			if (this.isChatCancelled()) {
				this.finalizeAgentStoppedByUser();
				return;
			}

			if (step > 0) {
				try {
					const snap = await this.agentTools.snapshotWorkspaceTree(180, 3);
					messages[0] = { role: 'system', content: this.buildAgentSystemPromptContent(snap) };
				} catch {
					// keep previous system prompt
				}
				if (this.isChatCancelled()) {
					this.finalizeAgentStoppedByUser();
					return;
				}
			}
			let assistantText = '';
			let toolCalls: ChatToolCall[] | undefined;
			let errored = false;
			let firstChunk = true;

			const thinking = this.appendThinkingRow(getAgentThinkingMessages({ step, lastToolNames }));
			let thinkingDisposed = false;
			const disposeThinking = () => {
				if (!thinkingDisposed) {
					thinkingDisposed = true;
					thinking.dispose();
				}
			};

			try {
				lastBubble = this.appendAssistantMessage('', { loading: true });

				const clearLoading = () => {
					if (firstChunk && lastBubble) {
						firstChunk = false;
						this.assistantRenderer?.prepareStreaming(lastBubble);
					}
				};

				try {
					for await (const chunk of this.aiService.chatStream(messages, this.activeRequest!.token, { model: this.model.id, feature: 'agent', tools: AGENT_TOOLS })) {
						if (this.isChatCancelled()) {
							break;
						}
						if (chunk.type === 'text' && chunk.text) {
							clearLoading();
							assistantText += chunk.text;
							this.assistantRenderer?.updateStreaming(lastBubble!, assistantText);
							this.scrollToBottom();
						} else if (chunk.type === 'tool_calls' && chunk.toolCalls?.length) {
							clearLoading();
							toolCalls = chunk.toolCalls;
						} else if (chunk.type === 'error' && chunk.error) {
							clearLoading();
							if (!this.isChatCancelled()) {
								this.assistantRenderer?.renderPlain(lastBubble!, chunk.error.message);
							}
							errored = true;
							break;
						} else if (chunk.type === 'done') {
							break;
						}
					}
				} catch {
					clearLoading();
					if (lastBubble) {
						this.assistantRenderer?.renderPlain(lastBubble, this.isChatCancelled()
							? localize('ecosystemsAiCancelled', 'Stopped.')
							: localize('ecosystemsAiChatFailed', 'Request failed.'));
					}
					if (this.isChatCancelled()) {
						this.finalizeAgentStoppedByUser();
					}
					return;
				}

				if (assistantText.trim() && lastBubble) {
					this.assistantRenderer?.renderMarkdown(lastBubble, assistantText, true);
				}

				if (errored) {
					return;
				}

				if (this.isChatCancelled()) {
					if (lastBubble && !assistantText.trim()) {
						this.assistantRenderer?.renderPlain(lastBubble, localize('ecosystemsAiCancelled', 'Stopped.'));
					}
					this.finalizeAgentStoppedByUser();
					return;
				}

				if (!toolCalls?.length && !assistantText.trim()) {
					if (lastBubble) {
						const modeHint = this.mode === 'agent'
							? localize('ecosystemsAiEmptyAgentHint', ' Use Agent mode (not Ask), pick Claude Sonnet 4.6, and start a new chat if tool history is broken.')
							: localize('ecosystemsAiEmptyAskHint', ' Ask mode needs a gateway restart for Claude (streaming fix). Try Agent mode or GPT-4o mini.');
						this.assistantRenderer?.renderPlain(lastBubble, localize(
							'ecosystemsAiEmptyModelReplyDetailed',
							'The model returned nothing (no text, no tool calls). If the gateway window shows no new [gateway] chat line when you send, the IDE is not reaching localhost:8787 -- run .\\scripts\\run-all.ps1 and sign in with dev-local-token. Otherwise restart the gateway and try again.{0}',
							modeHint,
						));
					}
					return;
				}

				// Record the assistant turn (text + any tool calls) into both wire history and the persisted UI history.
				const assistantMsg: ChatMessage = { role: 'assistant', content: assistantText, toolCalls };
				messages.push(assistantMsg);
				this.chatHistory.push(assistantMsg);
				this.persistChat();

				if (!toolCalls?.length) {
					return;
				}

				lastToolNames = toolCalls.map(c => c.name);

				// Render & execute each tool call, then feed results back to the model.
				if (!assistantText && lastBubble) {
					lastBubble.parentElement?.remove();
				}

				let aborted = false;
				for (const call of toolCalls) {
					if (this.isChatCancelled()) {
						this.appendToolMessage(`${call.name} skipped (stopped)`, 'done').classList.add('ecosystems-ai-tool-error');
						const skippedMsg: ChatMessage = {
							role: 'tool',
							content: CANCELLED_TOOL_OUTPUT,
							toolCallId: call.id,
							toolName: call.name,
						};
						messages.push(skippedMsg);
						this.chatHistory.push(skippedMsg);
						aborted = true;
						continue;
					}
					const repairedCall = this.repairAgentToolCall(call, messages);
					const isWriteFile = repairedCall.name === 'write_file' && typeof repairedCall.args.path === 'string';
					const writePath = isWriteFile ? String(repairedCall.args.path) : undefined;
					if (writePath) {
						this.pendingWritePaths.add(writePath);
						this.refreshAgentActivityPanel();
					}
					const isTerminal = repairedCall.name === 'run_in_terminal';
					const terminalCommand = isTerminal && typeof repairedCall.args.command === 'string' ? String(repairedCall.args.command) : undefined;
					const toolBubble = isWriteFile
						? undefined
						: this.appendToolMessage(
							isTerminal && terminalCommand
								? terminalCommand
								: `${repairedCall.name}(${this.summariseArgs(repairedCall.args)})`,
							'pending',
						);
					const result = await this.agentTools.execute(repairedCall, this.activeRequest?.token ?? CancellationToken.None);
					if (this.isChatCancelled()) {
						aborted = true;
						break;
					}
					if (writePath) {
						this.pendingWritePaths.delete(writePath);
						this.refreshAgentActivityPanel();
					}
					if (toolBubble) {
						const prefix = result.ok ? '✓' : (result.cancelled ? '???' : '??--');
						const label = isTerminal && result.terminalCommand
							? result.terminalCommand
							: result.summary;
						toolBubble.textContent = `${prefix} ${label}`;
						toolBubble.classList.toggle('ecosystems-ai-tool-error', !result.ok && !result.cancelled);
						if (result.terminalInstanceId !== undefined) {
							this.attachOpenTerminalButton(toolBubble, result.terminalInstanceId);
						} else if (isTerminal) {
							this.attachOpenTerminalButton(toolBubble, undefined);
						}
					}
					if (isTerminal) {
						this.refreshAgentActivityPanel();
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
				this.persistChat();

				if (aborted || this.isChatCancelled()) {
					repairChatToolHistory(messages);
					this.finalizeAgentStoppedByUser();
					return;
				}

				// Loop again so the model can react to the tool results.
			} finally {
				disposeThinking();
			}
		}

		this.appendAssistantMessage(localize('ecosystemsAiAgentStopped', 'Agent stopped after {0} steps to avoid an infinite loop.', maxSteps));
	}

	private repairAgentToolCall(call: ChatToolCall, messages: ChatMessage[]): ChatToolCall {
		if (call.name !== 'write_file') {
			return call;
		}
		const path = String(call.args.path ?? '').trim();
		if (path) {
			return call;
		}

		const lastUser = [...messages].reverse().find(m => m.role === 'user');
		const wire = typeof lastUser?.content === 'string' ? lastUser.content : '';
		const { placed, source } = extractBinaryPathsFromWireContent(wire);
		const from = source ?? this.lastAttachedBinaryPath;
		const fileName = from ? basename(from) : undefined;
		const to = placed ?? (fileName ? `public/sounds/${fileName}` : undefined);

		if (from && to && from !== to) {
			return {
				...call,
				name: 'copy_file',
				args: { from, to, overwrite: true },
			};
		}
		return call;
	}

	private buildAgentSystemPromptContent(workspaceSnapshot: string): string {
		const treeEntries = workspaceSnapshot.split('\n').filter(l => /^\s+[df] /.test(l));
		const workspaceLooksEmpty = workspaceSnapshot === '(no workspace folder open)'
			|| workspaceSnapshot === '(workspace tree unavailable)'
			|| treeEntries.length === 0;

		const playbooks = this.stackPlaybookService.buildAgentPlaybooksSection({ workspaceLooksEmpty });

		return 'You are Altus, an AI coding assistant embedded in the user\'s IDE.\n\n' +
			this.agentTools.getTerminalGuidance() + '\n\n' +
			playbooks +
			'## Tool choice\n\n' +
			'### 1. `run_in_terminal` -- shell commands (match the integrated terminal syntax above)\n' +
			'Use for installs, official project generators (see stack playbooks), builds, tests, migrations, git, docker, and dev servers.\n' +
			'**After every terminal tool call, read the full `--- terminal output ---` block** -- do not assume success from the command name alone.\n' +
			'After `isBackground=true` (dev server), call `read_terminal_output` to catch Vite/PostCSS errors.\n\n' +
			'**After scaffold:** run post-scaffold steps from the playbook table, then build/test once; start dev server with `isBackground: true` when the playbook lists one.\n\n' +
			'### 2. `write_file` -- targeted text edits only\n' +
			'• Edit **existing** source, configs, or a **single** new text file the user named\n' +
			'• Small tweaks after a CLI scaffold (e.g. one route, README, env example)\n' +
			'• **User-attached files** (root or elsewhere): see `<attached_context>` for the exact `from` path. Use **`copy_file`** to place binaries in the right folder (`public/`, `src/assets/`, `static/`, etc.), then wire the **destination** path in code. Never use `write_file` for mp3/images or without `path`.\n' +
			'Do **NOT** recreate a full framework project tree by hand when an official generator exists for that stack.\n\n' +
			'### 3. `copy_file` -- move binaries/assets within the project\n' +
			'• Required: `from` (source) and `to` (destination), both workspace-relative\n' +
			'• Example: `copy_file` from `dragon.mp3` to `public/sounds/notification.mp3`\n\n' +
			'### 4. `read_file` / `list_directory` -- inspect before/after scaffold\n\n' +
			'### 5. `delete_file` -- remove unwanted paths\n\n' +
			'## Execution rules\n' +
			'• **Vite/Next dev server already running:** use `write_file` only for CSS/JS/UI tweaks -- **never** run `npm run dev` again (HMR applies changes). Use `read_terminal_output` to see errors.\n' +
			'• Always CALL tools; never tell the user to paste commands unless a tool failed.\n' +
			'• Read the full `--- terminal output ---` before claiming success -- ignore exit 0 if output shows ERR:, connection failures, or tracebacks.\n' +
			'• Report errors honestly (ENOENT, EADDRINUSE, non-zero exit, failed health checks).\n' +
			'• Start the dev server once with `isBackground: true`; quote the localhost URL from output.\n' +
			'• Paths: workspace-relative, forward slashes. **Multi-root:** prefix with the workspace folder name from the tree (e.g. `ide_test_apis/...`); `list_directory` with path `.` lists every root.\n' +
			'• Terminal: in multi-root workspaces pass `cwd` to `run_in_terminal` (folder name or subpath) so commands run in the right project.\n' +
			'• Use the tree below; `list_directory` if unsure.\n' +
			'• Summarize what you did (commands run, files changed) when finished.\n\n' +
			'Current workspace tree (truncated, node_modules/.git excluded):\n' +
			'```\n' + workspaceSnapshot + '\n```';
	}

	private summariseArgs(args: Record<string, unknown>): string {
		const pairs: string[] = [];
		for (const [k, v] of Object.entries(args)) {
			if (k === 'content' && typeof v === 'string') {
				pairs.push(`${k}=<${v.length} bytes>`);
			} else if (typeof v === 'string') {
				pairs.push(`${k}=${JSON.stringify(v.length > 60 ? v.slice(0, 57) + '...' : v)}`);
			} else {
				pairs.push(`${k}=${JSON.stringify(v)}`);
			}
		}
		return pairs.join(', ');
	}

	private refreshAgentActivityPanel(): void {
		if (!this.agentActivityPanelEl || !this.agentFilesSectionEl || !this.agentFilesListEl || !this.agentFilesCountEl
			|| !this.agentTerminalsSectionEl || !this.agentTerminalsListEl || !this.agentTerminalsCountEl) {
			return;
		}

		const changes = this.fileChangeService.getChanges();
		const fileCount = changes.length + this.pendingWritePaths.size;
		const terminalRuns = this.activityService.getTerminalRuns();
		const terminalCount = terminalRuns.length;

		if (fileCount === 0 && terminalCount === 0) {
			this.agentActivityPanelEl.style.display = 'none';
			return;
		}

		this.agentActivityPanelEl.style.display = 'block';

		// Files section
		if (fileCount === 0) {
			this.agentFilesSectionEl.style.display = 'none';
		} else {
			this.agentFilesSectionEl.style.display = 'block';
			this.agentFilesCountEl.textContent = fileCount === 1
				? localize('ecosystemsAiOneFile', '1 File')
				: localize('ecosystemsAiNFiles', '{0} Files', String(fileCount));
			const filesToggleIcon = this.agentFilesSectionEl.querySelector('.agent-files-toggle .codicon') as HTMLElement | null;
			if (filesToggleIcon) {
				filesToggleIcon.className = `codicon codicon-chevron-${this.agentFilesPanelCollapsed ? 'right' : 'down'}`;
			}
			this.agentFilesListEl.style.display = this.agentFilesPanelCollapsed ? 'none' : 'block';
			dom.clearNode(this.agentFilesListEl);
			for (const path of this.pendingWritePaths) {
				if (changes.some(c => c.relativePath === path)) {
					continue;
				}
				this.appendAgentFileRow(this.agentFilesListEl, path, undefined, true);
			}
			for (const change of changes) {
				this.appendAgentFileRow(this.agentFilesListEl, change.relativePath, change, false);
			}
		}

		const canActOnChanges = changes.length > 0;
		if (this.agentFilesKeepBtn) {
			this.agentFilesKeepBtn.disabled = !canActOnChanges;
		}
		if (this.agentFilesUndoBtn) {
			this.agentFilesUndoBtn.disabled = !canActOnChanges;
		}
		if (this.agentFilesReviewBtn) {
			this.agentFilesReviewBtn.disabled = !canActOnChanges;
		}

		// Terminals section
		if (terminalCount === 0) {
			this.agentTerminalsSectionEl.style.display = 'none';
		} else {
			this.agentTerminalsSectionEl.style.display = 'block';
			this.agentTerminalsCountEl.textContent = terminalCount === 1
				? localize('ecosystemsAiOneCommand', '1 Command')
				: localize('ecosystemsAiNCommands', '{0} Commands', String(terminalCount));
			const termToggleIcon = this.agentTerminalsSectionEl.querySelector('.agent-terminals-toggle .codicon') as HTMLElement | null;
			if (termToggleIcon) {
				termToggleIcon.className = `codicon codicon-chevron-${this.agentTerminalsPanelCollapsed ? 'right' : 'down'}`;
			}
			this.agentTerminalsListEl.style.display = this.agentTerminalsPanelCollapsed ? 'none' : 'block';
			dom.clearNode(this.agentTerminalsListEl);
			for (const run of terminalRuns) {
				this.appendAgentTerminalRow(this.agentTerminalsListEl, run);
			}
		}
	}

	private appendAgentFileRow(
		parent: HTMLElement,
		relativePath: string,
		change: AgentFileChangeRecord | undefined,
		pending: boolean,
	): void {
		const row = dom.append(parent, dom.$('button.agent-file-row')) as HTMLButtonElement;
		row.type = 'button';
		const badge = dom.append(row, dom.$('span.agent-file-lang'));
		badge.textContent = this.fileLanguageBadge(relativePath);
		const name = dom.append(row, dom.$('span.agent-file-name'));
		name.textContent = basename(relativePath);
		const stats = dom.append(row, dom.$('span.agent-file-stats'));
		if (pending) {
			stats.textContent = '...';
		} else if (change) {
			if (change.linesAdded > 0) {
				const add = dom.append(stats, dom.$('span.agent-file-change-add'));
				add.textContent = `+${change.linesAdded}`;
			}
			if (change.linesRemoved > 0) {
				const del = dom.append(stats, dom.$('span.agent-file-change-del'));
				del.textContent = `-${change.linesRemoved}`;
			}
			if (change.linesAdded === 0 && change.linesRemoved === 0) {
				stats.textContent = '0';
			}
			row.onclick = (e) => {
				e.preventDefault();
				void this.openFileChange(change);
			};
		}
	}

	private fileLanguageBadge(relativePath: string): string {
		const ext = relativePath.split('.').pop()?.toLowerCase() ?? '';
		const map: Record<string, string> = {
			ts: 'TS', tsx: 'TS', js: 'JS', jsx: 'JS', py: 'PY', java: 'JV',
			go: 'GO', rs: 'RS', cs: 'C#', cpp: 'C++', c: 'C', html: 'HTML',
			css: 'CSS', json: 'JSON', md: 'MD', yml: 'YML', yaml: 'YML',
		};
		return (map[ext] ?? ext.toUpperCase().slice(0, 3)) || 'FILE';
	}

	private dismissAgentCommandsPanel(): void {
		this.activityService.clearTurn();
		this.agentTerminalsPanelCollapsed = false;
		this.refreshAgentActivityPanel();
	}

	private keepAllFileChanges(): void {
		this.fileChangeService.keepAllChanges();
		this.refreshAgentActivityPanel();
	}

	private async undoAllFileChanges(): Promise<void> {
		const changes = [...this.fileChangeService.getChanges()];
		if (changes.length === 0) {
			return;
		}
		for (const change of changes) {
			try {
				if (change.isNewFile) {
					if (await this.fileService.exists(change.uri)) {
						await this.fileService.del(change.uri, { useTrash: true });
					}
					const model = this.modelService.getModel(change.uri);
					if (model && !model.isDisposed()) {
						this.modelService.destroyModel(change.uri);
					}
				} else if (change.beforeContent !== undefined) {
					await this.fileService.writeFile(change.uri, VSBuffer.fromString(change.beforeContent));
					const model = this.modelService.getModel(change.uri);
					if (model && !model.isDisposed()) {
						model.setValue(change.beforeContent);
					}
				}
			} catch {
				// continue reverting other files
			}
		}
		this.fileChangeService.clearTurn();
		this.refreshAgentActivityPanel();
	}

	private async reviewAllFileChanges(): Promise<void> {
		const changes = this.fileChangeService.getChanges();
		if (changes.length === 0) {
			return;
		}
		for (const change of changes) {
			await this.openFileChange(change);
		}
	}

	private async openFileChange(change: AgentFileChangeRecord): Promise<void> {
		try {
			if (!change.isNewFile && change.beforeContent !== undefined) {
				const originalUri = URI.from({
					scheme: Schemas.inMemory,
					path: `/ecosystems-agent/${change.id}/original/${change.relativePath.replace(/\\/g, '/')}`,
				});
				if (!this.modelService.getModel(originalUri)) {
					this.modelService.createModel(change.beforeContent, null, originalUri, false);
				}
				await this.editorService.openEditor({
					original: { resource: originalUri },
					modified: { resource: change.uri },
				});
			} else {
				await this.editorService.openEditor({ resource: change.uri });
			}
		} catch {
			await this.editorService.openEditor({ resource: change.uri });
		}
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

	private appendThinkingRow(messages: readonly string[]): { row: HTMLElement; dispose: () => void } {
		if (!this.messagesEl) {
			throw new Error('messagesEl missing');
		}
		const row = dom.append(this.messagesEl, dom.$('.msg.thinking'));
		const avatar = dom.append(row, dom.$('.avatar.codicon.codicon-loading.codicon-modifier-spin'));
		avatar.setAttribute('aria-hidden', 'true');
		const bubble = dom.append(row, dom.$('.bubble.thinking'));
		const labelEl = dom.append(bubble, dom.$('span.thinking-label'));
		dom.append(bubble, dom.$('span.thinking-dots')).textContent = '\u2022\u2022\u2022';
		const stopRotation = startThinkingLabelRotation(labelEl, messages);
		this.scrollToBottom();
		return {
			row,
			dispose: () => {
				stopRotation();
				row.remove();
			},
		};
	}

	private appendAgentTerminalRow(parent: HTMLElement, run: AgentTerminalRun): void {
		const row = dom.append(parent, dom.$('button.agent-terminal-row')) as HTMLButtonElement;
		row.type = 'button';
		dom.append(row, dom.$('span.codicon.codicon-terminal'));
		const cmd = dom.append(row, dom.$('span.agent-terminal-command'));
		cmd.textContent = run.command;
		const status = dom.append(row, dom.$('span.agent-terminal-status'));
		if (run.pending) {
			status.textContent = localize('ecosystemsAiTerminalRunning', 'Running...');
		} else if (run.ok === false) {
			status.textContent = localize('ecosystemsAiTerminalFailed', 'Failed');
			status.classList.add('failed');
		}
		const open = dom.append(row, dom.$('span.agent-terminal-open'));
		open.textContent = localize('ecosystemsAiOpenTerminalOpenLabel', 'Open');
		row.onclick = (e) => {
			e.preventDefault();
			void this.focusAgentTerminal(run.terminalInstanceId);
		};
	}

	private async focusAgentTerminal(terminalInstanceId: number | undefined): Promise<void> {
		try {
			if (terminalInstanceId !== undefined) {
				const instance = this.terminalService.getInstanceFromId(terminalInstanceId);
				if (instance) {
					await this.terminalService.setActiveInstance(instance);
					await this.terminalService.revealActiveTerminal(true);
					return;
				}
			}
			for (const instance of this.terminalService.instances) {
				const title = instance.title || '';
				if (title.includes('Altus')) {
					await this.terminalService.setActiveInstance(instance);
					await this.terminalService.revealActiveTerminal(true);
					return;
				}
			}
			await this.commandService.executeCommand('workbench.action.terminal.focus');
		} catch {
			await this.commandService.executeCommand('workbench.action.terminal.focus');
		}
	}

	private attachOpenTerminalButton(bubble: HTMLElement, terminalInstanceId: number | undefined): void {
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
			await this.focusAgentTerminal(terminalInstanceId);
		};
	}

	override dispose(): void {
		this.activeRequest?.cancel();
		this.cancelBackgroundCompaction();
		this.mentionSearchCts?.cancel();
		this.chatContextService.registerHost(undefined);
		for (const url of this.attachmentObjectUrls.values()) {
			URL.revokeObjectURL(url);
		}
		this.attachmentObjectUrls.clear();
		super.dispose();
	}
}
