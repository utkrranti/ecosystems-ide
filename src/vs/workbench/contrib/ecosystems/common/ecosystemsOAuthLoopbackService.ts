/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export interface IEcosystemsOAuthLoopbackSession {
	readonly redirectUri: string;
	waitForToken(): Promise<string>;
	dispose(): void;
}

export interface IEcosystemsOAuthLoopbackService {
	readonly _serviceBrand: undefined;
	readonly isAvailable: boolean;
	startSession(state: string): Promise<IEcosystemsOAuthLoopbackSession>;
}

export const IEcosystemsOAuthLoopbackService = createDecorator<IEcosystemsOAuthLoopbackService>('ecosystemsOAuthLoopbackService');
