/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { AiProvider } from './providerRouting.js';

export const IEcosystemsApiKeys = createDecorator<IEcosystemsApiKeys>('ecosystemsApiKeys');

export interface IEcosystemsApiKeys {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	getKey(provider: AiProvider): string | undefined;
	setKey(provider: AiProvider, key: string | undefined): void;
}

/**
 * Default implementation: holds an in-memory map of provider → key.
 * Platform-specific implementations (e.g. electron-sandbox) populate it from
 * shell environment variables on startup.
 */
export class EcosystemsApiKeys extends Disposable implements IEcosystemsApiKeys {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private readonly keys = new Map<AiProvider, string>();

	getKey(provider: AiProvider): string | undefined {
		return this.keys.get(provider);
	}

	setKey(provider: AiProvider, key: string | undefined): void {
		const trimmed = key?.trim();
		const previous = this.keys.get(provider);
		if (trimmed) {
			this.keys.set(provider, trimmed);
		} else {
			this.keys.delete(provider);
		}
		if (previous !== trimmed) {
			this._onDidChange.fire();
		}
	}
}
