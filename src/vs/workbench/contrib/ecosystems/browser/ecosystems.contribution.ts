/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import {
	ECOSYSTEMS_AI_CHAT_VIEW_ID,
	ECOSYSTEMS_AI_COMMAND_SIGN_IN,
	ECOSYSTEMS_AI_COMMAND_SIGN_OUT,
	ECOSYSTEMS_AI_VIEWLET_ID,
} from '../../../../platform/ecosystems/common/constants.js';
import { IEcosystemsSessionService } from '../../../../platform/ecosystems/common/ecosystemsSessionService.js';
import { IEcosystemsAiService } from '../../../../platform/ecosystems/common/ecosystemsAiService.js';
import { IEcosystemsApiKeys } from '../../../../platform/ecosystems/common/ecosystemsApiKeys.js';
import { AiProvider } from '../../../../platform/ecosystems/common/providerRouting.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IAuthenticationService } from '../../../services/authentication/common/authentication.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { URI } from '../../../../base/common/uri.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { Extensions as ViewExtensions, IViewContainersRegistry, IViewsRegistry, ViewContainerLocation } from '../../../common/views.js';
import { EcoSystemsChatViewPane } from './ecosystemsChatViewPane.js';

const ecosystemsAiViewIcon = registerIcon('ecosystems-ai-view-icon', Codicon.sparkle, localize('ecosystemsAiViewIcon', 'EcoSystems AI view icon.'));

// Note: not registered as `isDefault: true` so the chat view is not constructed
// during workbench restore unless the user explicitly opens the AuxBar to it.
// This shaves model-list HTTP requests off cold start.
const viewContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
	id: ECOSYSTEMS_AI_VIEWLET_ID,
	title: localize2('ecosystemsAi', 'EcoSystems AI'),
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
			title: localize2('ecosystemsAiSignIn', 'EcoSystems AI: Sign In'),
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const sessionService = accessor.get(IEcosystemsSessionService);
		const aiService = accessor.get(IEcosystemsAiService);
		const notificationService = accessor.get(INotificationService);
		const authenticationService = accessor.get(IAuthenticationService);
		const openerService = accessor.get(IOpenerService);

		type ProviderPick = IQuickPickItem & { providerId: 'github' | 'microsoft' | 'google' | 'token' };

		const picks: ProviderPick[] = [
			{ providerId: 'github', label: '$(github) GitHub', description: localize('ecosystemsAiSignInWithGithub', 'Sign in with GitHub') },
			{ providerId: 'microsoft', label: '$(person) Microsoft', description: localize('ecosystemsAiSignInWithMicrosoft', 'Sign in with Microsoft') },
			{ providerId: 'google', label: '$(globe) Google', description: localize('ecosystemsAiSignInWithGoogle', 'Sign in with Google') },
			{ providerId: 'token', label: '$(key) ' + localize('ecosystemsAiSignInWithToken', 'Use a session token'), description: localize('ecosystemsAiSignInWithTokenDesc', 'Paste an EcoSystems session token') },
		];

		const choice = await quickInputService.pick(picks, {
			placeHolder: localize('ecosystemsAiSignInPicker', 'Choose how to sign in to EcoSystems'),
			ignoreFocusLost: true,
		});

		if (!choice) {
			return;
		}

		let token: string | undefined;
		let providerLabel: string = choice.label;

		if (choice.providerId === 'token') {
			token = await quickInputService.input({
				prompt: localize('ecosystemsAiSessionTokenPrompt', 'Enter your EcoSystems session token'),
				placeHolder: localize('ecosystemsAiSessionTokenPlaceholder', 'Session token from EcoSystems account'),
				password: true,
				ignoreFocusLost: true,
			});
		} else if (choice.providerId === 'google') {
			// No built-in Google authentication provider in VS Code core. Direct the user
			// to a hosted EcoSystems sign-in page that returns a session token they can paste.
			const proceed = await quickInputService.pick(
				[
					{ label: localize('ecosystemsAiOpenGoogle', 'Open EcoSystems Google sign-in in browser') },
					{ label: localize('ecosystemsAiCancel', 'Cancel') },
				],
				{ placeHolder: localize('ecosystemsAiGoogleNotice', 'Google sign-in opens in your browser; paste the returned token next.') }
			);
			if (!proceed || proceed.label === localize('ecosystemsAiCancel', 'Cancel')) {
				return;
			}
			await openerService.open(URI.parse('https://accounts.ecosystems.dev/oauth/google'));
			token = await quickInputService.input({
				prompt: localize('ecosystemsAiPasteGoogleToken', 'Paste the session token from the EcoSystems sign-in page'),
				password: true,
				ignoreFocusLost: true,
			});
		} else {
			try {
				const scopes = choice.providerId === 'github'
					? ['read:user', 'user:email']
					: ['openid', 'profile', 'email', 'offline_access'];
				const session = await authenticationService.createSession(choice.providerId, scopes);
				token = session.accessToken;
				providerLabel = `${choice.providerId} (${session.account.label})`;
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				notificationService.error(localize('ecosystemsAiAuthFailed', 'Sign-in via {0} failed: {1}', choice.providerId, message));
				return;
			}
		}

		if (!token?.trim()) {
			return;
		}

		await sessionService.setSessionToken(token.trim());
		notificationService.info(localize('ecosystemsAiSignInSuccess', 'Signed in to EcoSystems AI as {0}.', providerLabel));
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
			title: localize2('ecosystemsAiSignOut', 'EcoSystems AI: Sign Out'),
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const sessionService = accessor.get(IEcosystemsSessionService);
		const notificationService = accessor.get(INotificationService);
		await sessionService.clearSession();
		notificationService.info(localize('ecosystemsAiSignOutSuccess', 'Signed out of EcoSystems AI.'));
	}
});

registerAction2(class EcosystemsAiSetApiKeyAction extends Action2 {
	constructor() {
		super({
			id: 'ecosystems.ai.setApiKey',
			title: localize2('ecosystemsAiSetApiKey', 'EcoSystems AI: Set API Key…'),
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
				{ provider: 'openai', label: localize('ecosystemsAiKeyOpenAI', 'OpenAI'), description: 'GPT-4o, o1, o3 …' },
				{ provider: 'anthropic', label: localize('ecosystemsAiKeyAnthropic', 'Anthropic'), description: 'Claude Opus / Sonnet …' },
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
