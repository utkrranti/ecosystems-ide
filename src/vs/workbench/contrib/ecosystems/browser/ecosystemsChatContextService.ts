/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ChatAttachment } from './ecosystemsChatAttachments.js';

export interface IEcosystemsChatHost {
	addAttachments(attachments: readonly ChatAttachment[]): void;
	focusComposer(): void;
	revealChat(): Promise<void>;
}

export interface IEcosystemsChatContextService {
	readonly _serviceBrand: undefined;
	registerHost(host: IEcosystemsChatHost | undefined): void;
	getHost(): IEcosystemsChatHost | undefined;
	addAttachments(attachments: readonly ChatAttachment[]): void;
	focusComposer(): void;
	revealChat(): Promise<void>;
}

export const IEcosystemsChatContextService = createDecorator<IEcosystemsChatContextService>('ecosystemsChatContextService');

export class EcosystemsChatContextService extends Disposable implements IEcosystemsChatContextService {
	declare readonly _serviceBrand: undefined;

	private host: IEcosystemsChatHost | undefined;

	registerHost(host: IEcosystemsChatHost | undefined): void {
		this.host = host;
	}

	getHost(): IEcosystemsChatHost | undefined {
		return this.host;
	}

	addAttachments(attachments: readonly ChatAttachment[]): void {
		this.host?.addAttachments(attachments);
	}

	focusComposer(): void {
		this.host?.focusComposer();
	}

	async revealChat(): Promise<void> {
		await this.host?.revealChat();
	}
}

registerSingleton(IEcosystemsChatContextService, EcosystemsChatContextService, InstantiationType.Delayed);
