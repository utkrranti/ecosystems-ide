/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, type IDisposable } from '../../../../base/common/lifecycle.js';
import { isWindows } from '../../../../base/common/platform.js';
import type { ITerminalInstance } from '../../terminal/browser/terminal.js';

/** cmd.exe after Ctrl+C on npm.cmd -- blocks the shell until Y/N is answered. */
export const BATCH_TERMINATE_RE = /terminate\s+batch\s+job|\(Y\s*\/\s*N\)\s*\?/i;

export function stripTerminalAnsi(s: string): string {
	return s
		.replace(/\x1B\[[0-9;?]*[A-Za-z]/g, '')
		.replace(/\x1B\][^\x07\x1B]*(\x07|\x1B\\)/g, '')
		.replace(/\x1B[PX^_][^\x1B]*\x1B\\/g, '');
}

export function isStuckOnBatchPrompt(buffer: string): boolean {
	if (!buffer) {
		return false;
	}
	return BATCH_TERMINATE_RE.test(buffer.slice(-8192));
}

export async function dismissBatchTerminatePrompt(
	instance: ITerminalInstance,
	getBuffer: () => string,
): Promise<boolean> {
	if (!isStuckOnBatchPrompt(getBuffer())) {
		return false;
	}
	try {
		await instance.focusWhenReady();
	} catch {
		// continue -- sendText often still works
	}
	for (let attempt = 0; attempt < 12; attempt++) {
		try {
			await instance.sendText(attempt % 2 === 0 ? 'Y' : 'y', true);
		} catch {
			// ignore
		}
		await new Promise(r => setTimeout(r, 80 + attempt * 40));
		if (!isStuckOnBatchPrompt(getBuffer())) {
			return true;
		}
	}
	return !isStuckOnBatchPrompt(getBuffer());
}

/**
 * Watch every integrated terminal (user tabs and agent tabs) and auto-answer
 * Windows "Terminate batch job (Y/N)?" so npm/vite shells do not hang.
 */
export function attachBatchTerminateAutoDismiss(instance: ITerminalInstance): IDisposable {
	if (!isWindows) {
		return Disposable.None;
	}

	let rolling = '';
	let dismissing = false;
	let debounce: ReturnType<typeof setTimeout> | undefined;

	const scheduleDismiss = () => {
		if (dismissing) {
			return;
		}
		if (debounce !== undefined) {
			clearTimeout(debounce);
		}
		debounce = setTimeout(() => {
			debounce = undefined;
			if (!isStuckOnBatchPrompt(rolling)) {
				return;
			}
			dismissing = true;
			void dismissBatchTerminatePrompt(instance, () => rolling).finally(() => {
				dismissing = false;
			});
		}, 60);
	};

	const store = new DisposableStore();
	store.add(instance.onWillData((data) => {
		const clean = stripTerminalAnsi(data);
		if (!clean) {
			return;
		}
		rolling += clean;
		if (rolling.length > 16_384) {
			rolling = rolling.slice(-16_384);
		}
		if (isStuckOnBatchPrompt(rolling)) {
			scheduleDismiss();
		}
	}));
	store.add({ dispose: () => { if (debounce !== undefined) { clearTimeout(debounce); } } });
	return store;
}
