/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { IServerChannel } from '../../../base/parts/ipc/common/ipc.js';
import { startEcosystemsOAuthLoopback, type IEcosystemsOAuthLoopbackHandle } from './ecosystemsOAuthLoopback.js';

export class EcosystemsOAuthLoopbackChannel implements IServerChannel {

	private readonly sessions = new Map<string, IEcosystemsOAuthLoopbackHandle>();

	listen<T>(_ctx: unknown, _event: string): Event<T> {
		throw new Error('No events');
	}

	async call<T>(_ctx: unknown, command: string, arg?: any): Promise<T> {
		switch (command) {
			case 'startSession':
				return this.startSession(String((arg as string[] | undefined)?.[0] ?? '')) as Promise<T>;
			case 'waitForToken':
				return this.waitForToken(String((arg as string[] | undefined)?.[0] ?? '')) as Promise<T>;
			case 'cancelSession':
				return Promise.resolve(this.cancelSession(String((arg as string[] | undefined)?.[0] ?? ''))) as Promise<T>;
		}
		throw new Error(`Call not found: ${command}`);
	}

	private async startSession(state: string): Promise<{ redirectUri: string }> {
		if (!state) {
			throw new Error('OAuth state is required.');
		}
		this.cancelSession(state);
		const handle = await startEcosystemsOAuthLoopback(state);
		this.sessions.set(state, handle);
		return { redirectUri: handle.redirectUri };
	}

	private async waitForToken(state: string): Promise<{ token: string }> {
		const handle = this.sessions.get(state);
		if (!handle) {
			throw new Error('OAuth session not found -- try signing in again.');
		}
		try {
			const result = await handle.result;
			return { token: result.token };
		} finally {
			this.cancelSession(state);
		}
	}

	private cancelSession(state: string): void {
		const handle = this.sessions.get(state);
		if (handle) {
			handle.dispose();
			this.sessions.delete(state);
		}
	}
}
