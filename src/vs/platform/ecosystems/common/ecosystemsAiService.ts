/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IEcosystemsSessionService } from './ecosystemsSessionService.js';
import { ChatStreamOptions, IModelRouterService } from './modelRouterService.js';
import { ChatChunk, ChatMessage, ConnectionTestResult, GatewayModelInfo } from './ecosystemsAiTypes.js';

export const IEcosystemsAiService = createDecorator<IEcosystemsAiService>('ecosystemsAiService');

export interface IEcosystemsAiService {
	readonly _serviceBrand: undefined;
	isEnabled(): boolean;
	isAuthenticated(): Promise<boolean>;
	testConnection(): Promise<ConnectionTestResult>;
	getAvailableModels(): Promise<GatewayModelInfo[]>;
	chatStream(messages: ChatMessage[], token: CancellationToken, options?: ChatStreamOptions): AsyncIterable<ChatChunk>;
}

export class EcosystemsAiService implements IEcosystemsAiService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IModelRouterService private readonly modelRouter: IModelRouterService,
		@IEcosystemsSessionService private readonly sessionService: IEcosystemsSessionService,
	) { }

	isEnabled(): boolean {
		return this.modelRouter.isEnabled();
	}

	isAuthenticated(): Promise<boolean> {
		return this.sessionService.isSignedIn();
	}

	testConnection(): Promise<ConnectionTestResult> {
		return this.modelRouter.testConnection();
	}

	getAvailableModels(): Promise<GatewayModelInfo[]> {
		return this.modelRouter.getAvailableModels();
	}

	chatStream(messages: ChatMessage[], token: CancellationToken, options?: ChatStreamOptions): AsyncIterable<ChatChunk> {
		return this.modelRouter.chatStream(messages, token, options);
	}
}
