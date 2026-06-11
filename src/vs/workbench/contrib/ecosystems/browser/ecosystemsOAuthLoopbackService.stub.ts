/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IEcosystemsOAuthLoopbackService, IEcosystemsOAuthLoopbackSession } from '../common/ecosystemsOAuthLoopbackService.js';

class EcosystemsOAuthLoopbackServiceStub implements IEcosystemsOAuthLoopbackService {
	declare readonly _serviceBrand: undefined;
	readonly isAvailable = false;

	async startSession(_state: string): Promise<IEcosystemsOAuthLoopbackSession> {
		throw new Error('OAuth loopback is not available in this environment.');
	}
}

registerSingleton(IEcosystemsOAuthLoopbackService, EcosystemsOAuthLoopbackServiceStub, InstantiationType.Delayed);
