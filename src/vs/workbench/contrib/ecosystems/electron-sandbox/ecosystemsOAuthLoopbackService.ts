/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { ECOSYSTEMS_OAUTH_LOOPBACK_CHANNEL, EcosystemsOAuthLoopbackChannelClient } from '../../../../platform/ecosystems/common/ecosystemsOAuthLoopbackIpc.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IEcosystemsOAuthLoopbackService, IEcosystemsOAuthLoopbackSession } from '../common/ecosystemsOAuthLoopbackService.js';

class EcosystemsOAuthLoopbackSession implements IEcosystemsOAuthLoopbackSession {

	constructor(
		private readonly client: EcosystemsOAuthLoopbackChannelClient,
		private readonly state: string,
		public readonly redirectUri: string,
	) { }

	waitForToken(): Promise<string> {
		return this.client.waitForToken(this.state).then(r => r.token);
	}

	dispose(): void {
		void this.client.cancelSession(this.state);
	}
}

class EcosystemsOAuthLoopbackService extends Disposable implements IEcosystemsOAuthLoopbackService {

	declare readonly _serviceBrand: undefined;
	readonly isAvailable = true;

	private readonly client: EcosystemsOAuthLoopbackChannelClient;

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService,
	) {
		super();
		this.client = this._register(new EcosystemsOAuthLoopbackChannelClient(mainProcessService.getChannel(ECOSYSTEMS_OAUTH_LOOPBACK_CHANNEL)));
	}

	async startSession(state: string): Promise<IEcosystemsOAuthLoopbackSession> {
		const { redirectUri } = await this.client.startSession(state);
		return new EcosystemsOAuthLoopbackSession(this.client, state, redirectUri);
	}
}

registerSingleton(IEcosystemsOAuthLoopbackService, EcosystemsOAuthLoopbackService, InstantiationType.Eager);
