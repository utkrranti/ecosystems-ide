/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ISecretStorageService } from '../../secrets/common/secrets.js';
import { ECOSYSTEMS_SESSION_TOKEN_KEY } from './constants.js';

export const IEcosystemsSessionService = createDecorator<IEcosystemsSessionService>('ecosystemsSessionService');

export interface IEcosystemsSessionService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeSession: Event<void>;
	isSignedIn(): Promise<boolean>;
	getSessionToken(): Promise<string | undefined>;
	setSessionToken(token: string): Promise<void>;
	clearSession(): Promise<void>;
}

export class EcosystemsSessionService extends Disposable implements IEcosystemsSessionService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeSession = this._register(new Emitter<void>());
	readonly onDidChangeSession = this._onDidChangeSession.event;

	constructor(
		@ISecretStorageService private readonly secretStorageService: ISecretStorageService,
	) {
		super();
		this._register(this.secretStorageService.onDidChangeSecret(key => {
			if (key === ECOSYSTEMS_SESSION_TOKEN_KEY) {
				this._onDidChangeSession.fire();
			}
		}));
	}

	async isSignedIn(): Promise<boolean> {
		const token = await this.getSessionToken();
		return !!token?.trim();
	}

	getSessionToken(): Promise<string | undefined> {
		return this.secretStorageService.get(ECOSYSTEMS_SESSION_TOKEN_KEY);
	}

	async setSessionToken(token: string): Promise<void> {
		await this.secretStorageService.set(ECOSYSTEMS_SESSION_TOKEN_KEY, token.trim());
		this._onDidChangeSession.fire();
	}

	async clearSession(): Promise<void> {
		await this.secretStorageService.delete(ECOSYSTEMS_SESSION_TOKEN_KEY);
		this._onDidChangeSession.fire();
	}
}
