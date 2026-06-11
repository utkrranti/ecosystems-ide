/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as http from 'http';
import type { AddressInfo } from 'net';

export interface IEcosystemsOAuthLoopbackResult {
	token: string;
}

const SUCCESS_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Signed in</title>
<style>body{font-family:system-ui,sans-serif;background:#0a0a0a;color:#e8e8e8;padding:2rem;max-width:32rem;margin:auto}
.ok{color:#19c8ff}</style></head><body><h1>Signed in</h1><p class="ok">You can close this tab and return to Altus IDE.</p></body></html>`;

export interface IEcosystemsOAuthLoopbackHandle {
	readonly redirectUri: string;
	readonly result: Promise<IEcosystemsOAuthLoopbackResult>;
	dispose(): void;
}

export function startEcosystemsOAuthLoopback(state: string, timeoutMs = 600_000): Promise<IEcosystemsOAuthLoopbackHandle> {
	return new Promise((resolveOuter, rejectOuter) => {
		let resultResolve!: (value: IEcosystemsOAuthLoopbackResult) => void;
		let resultReject!: (reason: Error) => void;
		const result = new Promise<IEcosystemsOAuthLoopbackResult>((resolve, reject) => {
			resultResolve = resolve;
			resultReject = reject;
		});

		let settled = false;
		let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
		const server = http.createServer((req, res) => {
			const host = req.headers.host ?? '127.0.0.1';
			const reqUrl = new URL(req.url ?? '/', `http://${host}`);
			if (reqUrl.pathname !== '/callback') {
				res.writeHead(404);
				res.end();
				return;
			}

			const returnedState = reqUrl.searchParams.get('state') ?? '';
			const token = reqUrl.searchParams.get('token') ?? '';
			const error = reqUrl.searchParams.get('error') ?? '';

			if (returnedState !== state) {
				res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
				res.end('Invalid OAuth state.');
				fail(new Error('Invalid OAuth state -- try signing in again.'));
				return;
			}

			if (error) {
				res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
				res.end(error);
				fail(new Error(error));
				return;
			}

			if (!token.trim()) {
				res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
				res.end('Missing session token.');
				fail(new Error('Sign-in did not return a session token.'));
				return;
			}

			res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
			res.end(SUCCESS_HTML);
			succeed(token.trim());
		});

		const fail = (err: Error) => {
			if (settled) {
				return;
			}
			settled = true;
			if (timeoutHandle) {
				clearTimeout(timeoutHandle);
			}
			server.close();
			resultReject(err);
		};

		const succeed = (token: string) => {
			if (settled) {
				return;
			}
			settled = true;
			if (timeoutHandle) {
				clearTimeout(timeoutHandle);
			}
			server.close();
			resultResolve({ token });
		};

		server.on('error', err => {
			const error = err instanceof Error ? err : new Error(String(err));
			fail(error);
			rejectOuter(error);
		});

		server.on('listening', () => {
			const address = server.address() as AddressInfo;
			const redirectUri = `http://127.0.0.1:${address.port}/callback`;
			timeoutHandle = setTimeout(() => fail(new Error('Sign-in timed out. Try again.')), timeoutMs);
			resolveOuter({
				redirectUri,
				result,
				dispose: () => {
					if (!settled) {
						fail(new Error('Sign-in cancelled.'));
					} else if (timeoutHandle) {
						clearTimeout(timeoutHandle);
					}
					server.close();
				},
			});
		});

		server.listen(0, '127.0.0.1');
	});
}
