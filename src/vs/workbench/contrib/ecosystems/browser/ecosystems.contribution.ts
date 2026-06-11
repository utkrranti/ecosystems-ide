/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import {
	ECOSYSTEMS_AI_CHAT_VIEW_ID,
	ECOSYSTEMS_AI_COMMAND_SIGN_IN,
	ECOSYSTEMS_AI_COMMAND_SIGN_OUT,
	ECOSYSTEMS_AI_COMMAND_NEW_CHAT_SESSION,
	ECOSYSTEMS_AI_COMMAND_OPEN_CHAT_SESSION,
	ECOSYSTEMS_AI_COMMAND_TOGGLE_SESSIONS_LIST,
	ECOSYSTEMS_AI_COMMAND_COMPACT_CONVERSATION,
	ECOSYSTEMS_AI_COMMAND_CREATE_CHECKPOINT,
	ECOSYSTEMS_AI_COMMAND_RESTORE_CHECKPOINT,
	ECOSYSTEMS_AI_COMMAND_REFRESH_STACK_PLAYBOOKS,
	ECOSYSTEMS_AI_VIEWLET_ID,
} from '../../../../platform/ecosystems/common/constants.js';
import { IEcosystemsStackPlaybookService } from './ecosystemsStackPlaybookService.js';
import { IEcosystemsChatSessionService } from './ecosystemsChatSessionService.js';
import { IEcosystemsSessionService } from '../../../../platform/ecosystems/common/ecosystemsSessionService.js';
import { IEcosystemsAiService } from '../../../../platform/ecosystems/common/ecosystemsAiService.js';
import { IEcosystemsApiKeys } from '../../../../platform/ecosystems/common/ecosystemsApiKeys.js';
import { AiProvider } from '../../../../platform/ecosystems/common/providerRouting.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IEcosystemsAuthService } from './ecosystemsAuthService.js';
import './ecosystemsOAuthUrlHandler.contribution.js';
import './ecosystemsAccountsContext.contribution.js';
import { ECOSYSTEMS_AI_SIGNED_IN_KEY } from '../common/ecosystemsContext.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { Extensions as ViewExtensions, IViewContainersRegistry, IViewsRegistry, ViewContainerLocation } from '../../../common/views.js';
import { EcoSystemsChatViewPane } from './ecosystemsChatViewPane.js';
import './ecosystemsAgentFileChangeService.js';
import './ecosystemsAgentActivityService.js';
import './ecosystemsAgentEditorContribution.js';
import './ecosystemsChatContextService.js';
import './ecosystemsChatActions.contribution.js';
import './ecosystemsTerminalBatchDismissContribution.js';
import './ecosystemsTheme.contribution.js';
import './ecosystemsThemeBootstrap.js';
import './ecosystemsConfigurationMigration.contribution.js';
import './ecosystemsUpdateDefaults.contribution.js';

const ecosystemsAiViewIcon = registerIcon('ecosystems-ai-view-icon', Codicon.sparkle, localize('ecosystemsAiViewIcon', 'Altus AI view icon.'));

// Note: not registered as `isDefault: true` so the chat view is not constructed
// during workbench restore unless the user explicitly opens the AuxBar to it.
// This shaves model-list HTTP requests off cold start.
const viewContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
	id: ECOSYSTEMS_AI_VIEWLET_ID,
	title: localize2('ecosystemsAi', 'Altus AI'),
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [ECOSYSTEMS_AI_VIEWLET_ID, { mergeViewWithContainerWhenSingleView: true }]),
	icon: ecosystemsAiViewIcon,
	order: 7,
}, ViewContainerLocation.AuxiliaryBar);

Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([{
	id: ECOSYSTEMS_AI_CHAT_VIEW_ID,
	name: localize2('ecosystemsAiChat', 'Chat'),
	ctorDescriptor: new SyncDescriptor(EcoSystemsChatViewPane),
	canToggleVisibility: true,
	canMoveView: true,
	containerIcon: ecosystemsAiViewIcon,
	order: 1,
}], viewContainer);

registerAction2(class EcosystemsAiSignInAction extends Action2 {
	constructor() {
		super({
			id: ECOSYSTEMS_AI_COMMAND_SIGN_IN,
			title: localize2('ecosystemsAiSignIn', 'Sign in to Altus AI...'),
			f1: true,
			menu: [
				{ id: MenuId.CommandPalette },
				{
					id: MenuId.AccountsContext,
					group: '1_ecosystems',
					order: 1,
					when: ContextKeyExpr.equals(ECOSYSTEMS_AI_SIGNED_IN_KEY, false),
				},
			],
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const authService = accessor.get(IEcosystemsAuthService);
		const aiService = accessor.get(IEcosystemsAiService);
		const notificationService = accessor.get(INotificationService);

		type ProviderPick = IQuickPickItem & { providerId: 'github' | 'microsoft' | 'token' };

		const picks: ProviderPick[] = [
			{ providerId: 'github', label: '$(github) GitHub', description: localize('ecosystemsAiSignInWithGithub', 'Sign in with GitHub') },
			{ providerId: 'microsoft', label: '$(person) Microsoft', description: localize('ecosystemsAiSignInWithMicrosoft', 'Sign in with Microsoft') },
			{ providerId: 'token', label: '$(key) ' + localize('ecosystemsAiSignInWithToken', 'Use a session token'), description: localize('ecosystemsAiSignInWithTokenDesc', 'Paste an Altus AI session token') },
		];

		const choice = await quickInputService.pick(picks, {
			placeHolder: localize('ecosystemsAiSignInPicker', 'Choose how to sign in to Altus AI'),
			ignoreFocusLost: true,
		});

		if (!choice) {
			return;
		}

		let manualToken: string | undefined;
		if (choice.providerId === 'token') {
			manualToken = await quickInputService.input({
				prompt: localize('ecosystemsAiSessionTokenPrompt', 'Enter your Altus AI session token'),
				placeHolder: localize('ecosystemsAiSessionTokenPlaceholder', 'Session token from Altus AI account'),
				password: true,
				ignoreFocusLost: true,
			});
			if (!manualToken?.trim()) {
				return;
			}
		}

		let result;
		try {
			result = await authService.signIn(choice.providerId, manualToken);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			notificationService.prompt(
				Severity.Error,
				localize('ecosystemsAiAuthFailed', 'Sign-in via {0} failed: {1}', choice.providerId, message),
				[{
					label: localize('ecosystemsAiAuthUseToken', 'Use session token'),
					run: async () => {
						const token = await quickInputService.input({
							prompt: localize('ecosystemsAiSessionTokenPrompt', 'Enter your Altus AI session token'),
							placeHolder: localize('ecosystemsAiSessionTokenPlaceholder', 'Session token from Altus AI account'),
							password: true,
							ignoreFocusLost: true,
						});
						if (!token?.trim()) {
							return;
						}
						try {
							const tokenResult = await authService.signIn('token', token);
							if (tokenResult) {
								notificationService.info(localize('ecosystemsAiSignInSuccess', 'Signed in to Altus AI as {0}.', tokenResult.accountLabel));
							}
						} catch (tokenErr) {
							const tokenMessage = tokenErr instanceof Error ? tokenErr.message : String(tokenErr);
							notificationService.error(localize('ecosystemsAiAuthFailed', 'Sign-in via {0} failed: {1}', 'token', tokenMessage));
						}
					},
				}],
			);
			return;
		}

		if (!result) {
			return;
		}

		notificationService.info(localize('ecosystemsAiSignInSuccess', 'Signed in to Altus AI as {0}.', result.accountLabel));
		// Probe the gateway in the background; a missing gateway during local dev should not
		// surface as an error toast on every sign-in.
		void aiService.testConnection().then(result => {
			if (!result.ok) {
				notificationService.info(localize('ecosystemsAiGatewayUnreachable', 'Signed in. Gateway is unreachable in this environment ({0}); chat will retry on first request.', result.error?.message ?? 'unknown'));
			}
		});
	}
});

registerAction2(class EcosystemsAiSignOutAction extends Action2 {
	constructor() {
		super({
			id: ECOSYSTEMS_AI_COMMAND_SIGN_OUT,
			title: localize2('ecosystemsAiSignOut', 'Sign out of Altus AI...'),
			f1: true,
			menu: [
				{ id: MenuId.CommandPalette },
				{
					id: MenuId.AccountsContext,
					group: '1_ecosystems',
					order: 2,
					when: ContextKeyExpr.equals(ECOSYSTEMS_AI_SIGNED_IN_KEY, true),
				},
			],
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const sessionService = accessor.get(IEcosystemsSessionService);
		const notificationService = accessor.get(INotificationService);
		await sessionService.clearSession();
		notificationService.info(localize('ecosystemsAiSignOutSuccess', 'Signed out of Altus AI.'));
	}
});

registerAction2(class EcosystemsAiSetApiKeyAction extends Action2 {
	constructor() {
		super({
			id: 'ecosystems.ai.setApiKey',
			title: localize2('ecosystemsAiSetApiKey', 'Altus AI: Set API Key...'),
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const notificationService = accessor.get(INotificationService);
		const apiKeys = accessor.get(IEcosystemsApiKeys);

		interface ProviderPick extends IQuickPickItem { provider: AiProvider }
		const choice = await quickInputService.pick<ProviderPick>(
			[
				{ provider: 'openai', label: localize('ecosystemsAiKeyOpenAI', 'OpenAI'), description: 'GPT-4o, o1, o3 ...' },
				{ provider: 'anthropic', label: localize('ecosystemsAiKeyAnthropic', 'Anthropic'), description: 'Claude Opus / Sonnet ...' },
			],
			{ placeHolder: localize('ecosystemsAiKeyPickProvider', 'Choose a provider to set the API key for') }
		);
		if (!choice) {
			return;
		}

		const key = await quickInputService.input({
			prompt: localize('ecosystemsAiKeyPrompt', 'Paste your {0} API key', choice.label),
			password: true,
			ignoreFocusLost: true,
		});
		if (!key) {
			return;
		}

		apiKeys.setKey(choice.provider, key.trim());
		notificationService.info(localize('ecosystemsAiKeySaved', '{0} API key saved for this session.', choice.label));
	}
});

async function openEcoSystemsChatView(accessor: ServicesAccessor): Promise<EcoSystemsChatViewPane | undefined> {
	const viewsService = accessor.get(IViewsService);
	await viewsService.openView(ECOSYSTEMS_AI_CHAT_VIEW_ID, true);
	return viewsService.getActiveViewWithId(ECOSYSTEMS_AI_CHAT_VIEW_ID) as EcoSystemsChatViewPane | undefined;
}

registerAction2(class EcosystemsAiToggleSessionsListToolbarAction extends Action2 {
	constructor() {
		super({
			id: ECOSYSTEMS_AI_COMMAND_TOGGLE_SESSIONS_LIST,
			title: localize2('ecosystemsAiToggleSessionsList', 'Chat Sessions'),
			icon: Codicon.history,
			menu: [{
				id: MenuId.ViewTitle,
				when: ContextKeyExpr.equals('view', ECOSYSTEMS_AI_CHAT_VIEW_ID),
				group: 'navigation',
				order: 5,
			}],
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const view = await openEcoSystemsChatView(accessor);
		view?.toggleSessionsList();
	}
});

registerAction2(class EcosystemsAiCompactToolbarAction extends Action2 {
	constructor() {
		super({
			id: ECOSYSTEMS_AI_COMMAND_COMPACT_CONVERSATION,
			title: localize2('ecosystemsAiCompactConversation', 'Compact Conversation'),
			icon: Codicon.fold,
			menu: [{
				id: MenuId.ViewTitle,
				when: ContextKeyExpr.equals('view', ECOSYSTEMS_AI_CHAT_VIEW_ID),
				group: 'navigation',
				order: 6,
			}],
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const view = await openEcoSystemsChatView(accessor);
		await view?.compactConversation();
	}
});

registerAction2(class EcosystemsAiCheckpointToolbarAction extends Action2 {
	constructor() {
		super({
			id: ECOSYSTEMS_AI_COMMAND_CREATE_CHECKPOINT,
			title: localize2('ecosystemsAiCreateCheckpoint', 'Save Checkpoint'),
			icon: Codicon.bookmark,
			menu: [{
				id: MenuId.ViewTitle,
				when: ContextKeyExpr.equals('view', ECOSYSTEMS_AI_CHAT_VIEW_ID),
				group: 'navigation',
				order: 7,
			}],
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const view = await openEcoSystemsChatView(accessor);
		await view?.createCheckpoint();
	}
});

registerAction2(class EcosystemsAiRestoreCheckpointToolbarAction extends Action2 {
	constructor() {
		super({
			id: ECOSYSTEMS_AI_COMMAND_RESTORE_CHECKPOINT,
			title: localize2('ecosystemsAiRestoreCheckpoint', 'Restore Checkpoint'),
			icon: Codicon.discard,
			menu: [{
				id: MenuId.ViewTitle,
				when: ContextKeyExpr.equals('view', ECOSYSTEMS_AI_CHAT_VIEW_ID),
				group: 'navigation',
				order: 8,
			}],
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const view = await openEcoSystemsChatView(accessor);
		await view?.restoreCheckpoint();
	}
});

registerAction2(class EcosystemsAiRefreshStackPlaybooksAction extends Action2 {
	constructor() {
		super({
			id: ECOSYSTEMS_AI_COMMAND_REFRESH_STACK_PLAYBOOKS,
			title: localize2('ecosystemsAiRefreshStackPlaybooks', 'Altus AI: Refresh Stack Playbooks'),
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const playbooks = accessor.get(IEcosystemsStackPlaybookService);
		const notifications = accessor.get(INotificationService);
		await playbooks.refresh();
		notifications.info(localize('ecosystemsAiRefreshStackPlaybooksDone', 'Stack playbooks reloaded ({0} stacks).', playbooks.getPlaybooks().length));
	}
});

registerAction2(class EcosystemsAiNewChatToolbarAction extends Action2 {
	constructor() {
		super({
			id: 'ecosystems.ai.chat.toolbar.newSession',
			title: localize2('ecosystemsAiNewSession', 'New Chat Session'),
			icon: Codicon.add,
			menu: [{
				id: MenuId.ViewTitle,
				when: ContextKeyExpr.equals('view', ECOSYSTEMS_AI_CHAT_VIEW_ID),
				group: 'navigation',
				order: 10,
			}],
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(ICommandService).executeCommand(ECOSYSTEMS_AI_COMMAND_NEW_CHAT_SESSION);
	}
});

registerAction2(class EcosystemsAiNewChatSessionAction extends Action2 {
	constructor() {
		super({
			id: ECOSYSTEMS_AI_COMMAND_NEW_CHAT_SESSION,
			title: localize2('ecosystemsAiNewChatSession', 'Altus AI: New Chat Session'),
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		await openEcoSystemsChatView(accessor);
		const chatSessions = accessor.get(IEcosystemsChatSessionService);
		await chatSessions.createSession();
	}
});

registerAction2(class EcosystemsAiOpenChatSessionAction extends Action2 {
	constructor() {
		super({
			id: ECOSYSTEMS_AI_COMMAND_OPEN_CHAT_SESSION,
			title: localize2('ecosystemsAiOpenChatSession', 'Altus AI: Open Chat Session...'),
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		await openEcoSystemsChatView(accessor);
		const quickInputService = accessor.get(IQuickInputService);
		const chatSessions = accessor.get(IEcosystemsChatSessionService);
		await chatSessions.initialize();

		interface SessionPick extends IQuickPickItem { sessionId: string }
		const sessions = chatSessions.listSessions();
		if (sessions.length === 0) {
			await chatSessions.createSession();
			return;
		}

		const picks: SessionPick[] = sessions.map(s => ({
			sessionId: s.id,
			label: s.title,
			description: new Date(s.updatedAt).toLocaleString(),
			detail: localize('ecosystemsAiSessionMessageCount', '{0} messages', s.messageCount),
		}));

		const choice = await quickInputService.pick(picks, {
			placeHolder: localize('ecosystemsAiOpenSessionPicker', 'Open a chat session'),
			ignoreFocusLost: true,
		});
		if (!choice) {
			return;
		}
		await chatSessions.switchSession(choice.sessionId);
	}
});
