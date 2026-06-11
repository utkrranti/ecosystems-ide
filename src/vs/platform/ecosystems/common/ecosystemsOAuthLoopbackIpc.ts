/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { IChannel } from '../../../base/parts/ipc/common/ipc.js';

export const ECOSYSTEMS_OAUTH_LOOPBACK_CHANNEL = 'ecosystemsOAuthLoopback';

export class EcosystemsOAuthLoopbackChannelClient extends Disposable {

	constructor(private readonly channel: IChannel) {
		super();
	}

	async startSession(state: string): Promise<{ redirectUri: string }> {
		return this.channel.call('startSession', [state]) as Promise<{ redirectUri: string }>;
	}

	waitForToken(state: string): Promise<{ token: string }> {
		return this.channel.call('waitForToken', [state]) as Promise<{ token: string }>;
	}

	cancelSession(state: string): Promise<void> {
		return this.channel.call('cancelSession', [state]) as Promise<void>;
	}
}
