/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { dirname, joinPath } from '../../../base/common/resources.js';
import { IFileService } from '../../files/common/files.js';
import { IWorkspaceContextService } from '../../workspace/common/workspace.js';
import { IConfigurationService, ConfigurationTarget } from '../../configuration/common/configuration.js';
import { ILogService } from '../../log/common/log.js';
import { DEFAULT_GATEWAY_BASE_URL } from './constants.js';
import { ECOSYSTEMS_AI_GATEWAY_BASE_URL } from './ecosystemsConfiguration.js';
import { IEcosystemsSessionService } from './ecosystemsSessionService.js';

/** Must match `ide_apis` default when `.env.local` is absent. */
export const DEFAULT_DEV_SESSION_TOKEN = 'dev-local-token';

export function parseGatewayDotenv(text: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith('#')) {
			continue;
		}
		const withoutExport = line.startsWith('export ') ? line.slice('export '.length).trim() : line;
		const eq = withoutExport.indexOf('=');
		if (eq <= 0) {
			continue;
		}
		const key = withoutExport.slice(0, eq).trim();
		let value = withoutExport.slice(eq + 1).trim();
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
			value = value.slice(1, -1);
		}
		out[key] = value;
	}
	return out;
}

export async function collectGatewayEnvLocalUris(
	fileService: IFileService,
	workspaceContextService: IWorkspaceContextService,
	appRoot?: string,
): Promise<URI[]> {
	const seen = new Set<string>();
	const uris: URI[] = [];
	const add = (uri: URI) => {
		const key = uri.toString();
		if (!seen.has(key)) {
			seen.add(key);
			uris.push(uri);
		}
	};

	// Prefer IDE install root (works when workspace is IDE-Test or another folder).
	if (appRoot) {
		let dir = URI.file(appRoot);
		for (let depth = 0; depth < 10; depth++) {
			add(joinPath(dir, 'ide_apis', '.env.local'));
			const parent = dirname(dir);
			if (parent.toString() !== dir.toString()) {
				add(joinPath(parent, 'ide_apis', '.env.local'));
			}
			if (parent.toString() === dir.toString()) {
				break;
			}
			dir = parent;
		}
	}

	for (const folder of workspaceContextService.getWorkspace().folders) {
		let dir = folder.uri;
		for (let depth = 0; depth < 8; depth++) {
			add(joinPath(dir, 'ide_apis', '.env.local'));
			const parent = dirname(dir);
			if (parent.toString() !== dir.toString()) {
				add(joinPath(parent, 'ide_apis', '.env.local'));
			}
			if (parent.toString() === dir.toString()) {
				break;
			}
			dir = parent;
		}
	}

	return uris;
}

export interface SyncDevSessionTokenOptions {
	fileService: IFileService;
	workspaceContextService: IWorkspaceContextService;
	sessionService: IEcosystemsSessionService;
	configurationService: IConfigurationService;
	logService?: ILogService;
	appRoot?: string;
	/** Re-apply token from .env.local even when a token is already stored (use after 401). */
	force?: boolean;
	/** When no .env.local is found, use DEFAULT_DEV_SESSION_TOKEN (local gateway default). */
	useDefaultIfMissing?: boolean;
}

/**
 * Load DEV_SESSION_TOKEN from ide_apis/.env.local and sign in.
 * @returns true if a dev token was found and written to secret storage
 */
export async function loadDevSessionTokenFromEnvFile(
	fileService: IFileService,
	workspaceContextService: IWorkspaceContextService,
	appRoot?: string,
): Promise<string | undefined> {
	const candidates = await collectGatewayEnvLocalUris(fileService, workspaceContextService, appRoot);
	for (const uri of candidates) {
		try {
			if (!(await fileService.exists(uri))) {
				continue;
			}
			const content = await fileService.readFile(uri);
			const gatewayEnv = parseGatewayDotenv(content.value.toString());
			const devToken = gatewayEnv['DEV_SESSION_TOKEN']?.trim();
			if (devToken) {
				return devToken;
			}
		} catch {
			// try next candidate
		}
	}
	return undefined;
}

export async function syncDevSessionTokenFromGatewayEnv(options: SyncDevSessionTokenOptions): Promise<boolean> {
	const { fileService, workspaceContextService, sessionService, configurationService, logService, appRoot, useDefaultIfMissing, force } = options;

	let devToken = await loadDevSessionTokenFromEnvFile(fileService, workspaceContextService, appRoot);
	if (!devToken && useDefaultIfMissing) {
		devToken = DEFAULT_DEV_SESSION_TOKEN;
		logService?.info('[Altus AI] using default DEV_SESSION_TOKEN for local gateway (no ide_apis/.env.local found)');
	}
	if (!devToken) {
		return false;
	}

	const gatewayUrl = DEFAULT_GATEWAY_BASE_URL.trim() || 'http://localhost:8787/v1';
	const currentUrl = configurationService.getValue<string>(ECOSYSTEMS_AI_GATEWAY_BASE_URL)?.trim();
	if (!currentUrl || currentUrl === 'https://api.ecosystems.dev/v1' || currentUrl.includes('api.openai.com')) {
		await configurationService.updateValue(ECOSYSTEMS_AI_GATEWAY_BASE_URL, gatewayUrl, ConfigurationTarget.USER);
	}

	const existing = await sessionService.getSessionToken();
	if (!force && existing?.trim() === devToken) {
		return true;
	}

	if (existing?.trim() && existing.trim() !== devToken) {
		logService?.info('[Altus AI] replacing stale session token with DEV_SESSION_TOKEN from ide_apis/.env.local');
	} else if (force) {
		logService?.info('[Altus AI] applying DEV_SESSION_TOKEN for local gateway');
	}
	await sessionService.setSessionToken(devToken);
	logService?.info('[Altus AI] signed in for local gateway (DEV_SESSION_TOKEN)');
	return true;
}

export function isLocalGatewayBaseUrl(baseUrl: string): boolean {
	return /localhost|127\.0\.0\.1/i.test(baseUrl);
}
