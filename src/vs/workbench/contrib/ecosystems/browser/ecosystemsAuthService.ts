/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { asTextOrError, IRequestService } from '../../../../platform/request/common/request.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { ECOSYSTEMS_AI_GATEWAY_BASE_URL } from '../../../../platform/ecosystems/common/ecosystemsConfiguration.js';
import {
	buildEcosystemsOAuthCallbackUri,
	isEcosystemsOAuthCallbackUri,
	joinGatewayAuthPath,
} from '../../../../platform/ecosystems/common/ecosystemsGatewayUrl.js';
import { IEcosystemsSessionService } from '../../../../platform/ecosystems/common/ecosystemsSessionService.js';
import { IAuthenticationService } from '../../../services/authentication/common/authentication.js';
import { IEcosystemsOAuthLoopbackService } from '../common/ecosystemsOAuthLoopbackService.js';
import './ecosystemsOAuthLoopbackService.stub.js';

export type EcosystemsAuthProvider = 'github' | 'microsoft' | 'token';
export type EcosystemsBrowserOAuthProvider = 'github' | 'microsoft';

export interface EcosystemsSignInResult {
	accountLabel: string;
}

export interface IEcosystemsAuthService {
	readonly _serviceBrand: undefined;
	signIn(provider: EcosystemsAuthProvider, manualToken?: string): Promise<EcosystemsSignInResult | undefined>;
	completeOAuthFromUri(uri: URI): boolean;
}

export const IEcosystemsAuthService = createDecorator<IEcosystemsAuthService>('ecosystemsAuthService');

interface IPendingBrowserOAuth {
	readonly resolve: (token: string) => void;
	readonly reject: (err: Error) => void;
	readonly store: DisposableStore;
}

interface IExchangeResponse {
	session_token?: string;
	account?: { label?: string };
	error?: string;
}

const VS_CODE_AUTH_PROVIDER: Record<'github' | 'microsoft', string> = {
	github: 'github',
	microsoft: 'microsoft',
};

export class EcosystemsAuthService extends Disposable implements IEcosystemsAuthService {

	declare readonly _serviceBrand: undefined;

	private readonly pendingBrowserOAuth = new Map<string, IPendingBrowserOAuth>();

	constructor(
		@IEcosystemsSessionService private readonly sessionService: IEcosystemsSessionService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IRequestService private readonly requestService: IRequestService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IProductService private readonly productService: IProductService,
		@ILogService private readonly logService: ILogService,
		@IEcosystemsOAuthLoopbackService private readonly loopbackService: IEcosystemsOAuthLoopbackService,
	) {
		super();
	}

	async signIn(provider: EcosystemsAuthProvider, manualToken?: string): Promise<EcosystemsSignInResult | undefined> {
		if (provider === 'token') {
			const token = manualToken?.trim();
			if (!token) {
				return undefined;
			}
			await this.sessionService.setSessionToken(token);
			return { accountLabel: localize('ecosystemsAiSignInTokenLabel', 'local session token') };
		}

		const vsCodeProviderId = VS_CODE_AUTH_PROVIDER[provider];
		const providerIds = await this.authenticationService.getProviderIds();
		if (providerIds.includes(vsCodeProviderId)) {
			try {
				const scopes = provider === 'github'
					? ['read:user', 'user:email']
					: ['openid', 'profile', 'email', 'offline_access'];
				const session = await this.authenticationService.createSession(vsCodeProviderId, scopes);
				const exchanged = await this.exchangeProviderToken(provider, session.accessToken);
				await this.sessionService.setSessionToken(exchanged.session_token);
				const label = exchanged.account?.label ?? session.account.label;
				return { accountLabel: `${provider} (${label})` };
			} catch (err) {
				this.logService.warn(`[Altus AI] ${provider} extension sign-in failed; using browser OAuth`, err);
			}
		}

		const token = await this.signInViaBrowserOAuth(provider);
		await this.sessionService.setSessionToken(token);
		const displayName = provider === 'github'
			? localize('ecosystemsAiSignInGithubLabel', 'GitHub')
			: localize('ecosystemsAiSignInMicrosoftLabel', 'Microsoft');
		return { accountLabel: displayName };
	}

	completeOAuthFromUri(uri: URI): boolean {
		if (!isEcosystemsOAuthCallbackUri(uri, this.productService.urlProtocol)) {
			return false;
		}

		const params = new URLSearchParams(uri.query);
		const state = params.get('state') ?? '';
		const token = params.get('token') ?? '';
		const error = params.get('error') ?? '';

		const pending = this.pendingBrowserOAuth.get(state);
		if (!pending) {
			this.logService.warn('[Altus AI] OAuth callback with unknown or expired state');
			return true;
		}

		this.pendingBrowserOAuth.delete(state);
		pending.store.dispose();

		if (error) {
			pending.reject(new Error(error));
			return true;
		}
		if (!token.trim()) {
			pending.reject(new Error(localize('ecosystemsAiOAuthMissingToken', 'Sign-in did not return a session token.')));
			return true;
		}

		pending.resolve(token.trim());
		return true;
	}

	private resolveGatewayBaseUrl(): string {
		return this.configurationService.getValue<string>(ECOSYSTEMS_AI_GATEWAY_BASE_URL)?.trim()
			|| 'http://localhost:8787/v1';
	}

	private async exchangeProviderToken(provider: 'github' | 'microsoft', accessToken: string): Promise<{ session_token: string; account?: { label?: string } }> {
		const url = joinGatewayAuthPath(this.resolveGatewayBaseUrl(), '/exchange');
		const context = await this.requestService.request({
			type: 'POST',
			url,
			headers: { 'Content-Type': 'application/json' },
			data: JSON.stringify({ provider, access_token: accessToken }),
		}, CancellationToken.None);

		const body = await asTextOrError(context);
		let parsed: IExchangeResponse = {};
		try {
			parsed = body ? JSON.parse(body) : {};
		} catch {
			// fall through
		}

		if (context.res.statusCode && context.res.statusCode >= 400) {
			throw new Error(parsed.error ?? localize('ecosystemsAiAuthExchangeFailed', 'Could not exchange sign-in with the gateway ({0}).', String(context.res.statusCode)));
		}

		const sessionToken = parsed.session_token?.trim();
		if (!sessionToken) {
			throw new Error(parsed.error ?? localize('ecosystemsAiAuthExchangeNoToken', 'Gateway did not return a session token.'));
		}

		return { session_token: sessionToken, account: parsed.account };
	}

	private async signInViaBrowserOAuth(provider: EcosystemsBrowserOAuthProvider): Promise<string> {
		const state = generateUuid();

		if (this.loopbackService.isAvailable) {
			const loopback = await this.loopbackService.startSession(state);
			try {
				const startUrl = joinGatewayAuthPath(
					this.resolveGatewayBaseUrl(),
					`/oauth/${provider}/start?state=${encodeURIComponent(state)}&redirect_uri=${encodeURIComponent(loopback.redirectUri)}`,
				);
				await this.openerService.open(URI.parse(startUrl), { openExternal: true });
				return await loopback.waitForToken();
			} finally {
				loopback.dispose();
			}
		}

		const redirectUri = buildEcosystemsOAuthCallbackUri(this.productService.urlProtocol);
		const startUrl = joinGatewayAuthPath(
			this.resolveGatewayBaseUrl(),
			`/oauth/${provider}/start?state=${encodeURIComponent(state)}&redirect_uri=${encodeURIComponent(redirectUri)}`,
		);

		return new Promise((resolve, reject) => {
			const store = new DisposableStore();
			const timeoutHandle = setTimeout(() => {
				this.pendingBrowserOAuth.delete(state);
				reject(new Error(localize('ecosystemsAiBrowserSignInTimeout', 'Sign-in timed out. Try again.')));
			}, 600_000);
			store.add({ dispose: () => clearTimeout(timeoutHandle) });

			this.pendingBrowserOAuth.set(state, {
				resolve: (token) => {
					store.dispose();
					resolve(token);
				},
				reject: (err) => {
					store.dispose();
					reject(err);
				},
				store,
			});

			void this.openerService.open(URI.parse(startUrl), { openExternal: true }).catch(err => {
				this.pendingBrowserOAuth.delete(state);
				store.dispose();
				reject(err instanceof Error ? err : new Error(String(err)));
			});
		});
	}
}

registerSingleton(IEcosystemsAuthService, EcosystemsAuthService, InstantiationType.Delayed);
