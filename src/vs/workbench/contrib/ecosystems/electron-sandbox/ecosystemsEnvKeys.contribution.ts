/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { IShellEnvironmentService } from '../../../services/environment/electron-sandbox/shellEnvironmentService.js';
import { IEcosystemsApiKeys } from '../../../../platform/ecosystems/common/ecosystemsApiKeys.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { INativeWorkbenchEnvironmentService } from '../../../services/environment/electron-sandbox/environmentService.js';
import { URI } from '../../../../base/common/uri.js';
import { joinPath } from '../../../../base/common/resources.js';
import { VSBuffer } from '../../../../base/common/buffer.js';

/** Minimal `.env` parser — supports `KEY=value`, quoted values, `#` comments, blank lines, `export KEY=…`. */
function parseDotenv(text: string): Record<string, string> {
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

/**
 * Seeds the EcoSystems API key store from the user's shell environment on startup so
 * `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` set in `.bashrc`, `.zshrc`, system env, etc. are
 * automatically picked up by the AI chat without requiring an explicit sign-in.
 */
class EcosystemsEnvKeysContribution extends Disposable {

	static readonly ID = 'workbench.contrib.ecosystems.envKeys';

	constructor(
		@IShellEnvironmentService shellEnvironmentService: IShellEnvironmentService,
		@IEcosystemsApiKeys apiKeys: IEcosystemsApiKeys,
		@ILogService logService: ILogService,
		@IFileService fileService: IFileService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
		@INativeWorkbenchEnvironmentService environmentService: INativeWorkbenchEnvironmentService,
	) {
		super();

		const apply = (env: Record<string, string | undefined>, source: string): { openai: boolean; anthropic: boolean } => {
			const openai = env['OPENAI_API_KEY'] ?? env['ECOSYSTEMS_OPENAI_API_KEY'];
			const anthropic = env['ANTHROPIC_API_KEY'] ?? env['ECOSYSTEMS_ANTHROPIC_API_KEY'];
			if (openai) {
				apiKeys.setKey('openai', openai);
				logService.info(`[EcoSystems AI] picked up OPENAI_API_KEY from ${source}`);
			}
			if (anthropic) {
				apiKeys.setKey('anthropic', anthropic);
				logService.info(`[EcoSystems AI] picked up ANTHROPIC_API_KEY from ${source}`);
			}
			return { openai: !!openai, anthropic: !!anthropic };
		};

		const tryReadDotenv = async (uri: URI): Promise<Record<string, string> | undefined> => {
			try {
				const exists = await fileService.exists(uri);
				if (!exists) {
					return undefined;
				}
				const content = await fileService.readFile(uri);
				return parseDotenv(content.value.toString());
			} catch {
				return undefined;
			}
		};

		(async () => {
			const found = { openai: false, anthropic: false };

			// 1. Shell environment (system env, .bashrc, .zshrc, `setx` on Windows)
			try {
				const shellEnv = await shellEnvironmentService.getShellEnv();
				const r = apply(shellEnv, 'shell environment');
				found.openai ||= r.openai;
				found.anthropic ||= r.anthropic;
			} catch (err) {
				logService.warn('[EcoSystems AI] failed to read shell environment for API keys', err);
			}

			// 2. .env / .env.local in each workspace folder (workspace overrides shell).
			//    Also scan a few well-known subdirectories where the keys typically live.
			const dotenvNames = ['.env.local', '.env'];
			const subdirs = ['', 'services/gateway', 'services', '.ecosystems'];
			const roots: { uri: URI; label: string }[] = [];
			for (const folder of workspaceContextService.getWorkspace().folders) {
				roots.push({ uri: folder.uri, label: folder.name });
			}
			// Always also scan the IDE source root (so launching with no folder still finds the repo's .env.local)
			if (environmentService.appRoot) {
				const appRootUri = URI.file(environmentService.appRoot);
				if (!roots.some(r => r.uri.toString() === appRootUri.toString())) {
					roots.push({ uri: appRootUri, label: 'IDE source' });
				}
			}
			for (const root of roots) {
				for (const sub of subdirs) {
					for (const name of dotenvNames) {
						const uri = sub ? joinPath(root.uri, ...sub.split('/'), name) : joinPath(root.uri, name);
						const env = await tryReadDotenv(uri);
						if (env) {
							const label = sub ? `${sub}/${name}` : name;
							const r = apply(env, `${label} in ${root.label}`);
							found.openai ||= r.openai;
							found.anthropic ||= r.anthropic;
						}
					}
				}
			}

			// 3. ~/.ecosystems/.env as a user-global fallback
			if (environmentService.userHome) {
				const userEnv = await tryReadDotenv(joinPath(environmentService.userHome, '.ecosystems', '.env'));
				if (userEnv) {
					const r = apply(userEnv, '~/.ecosystems/.env');
					found.openai ||= r.openai;
					found.anthropic ||= r.anthropic;
				}
			}

			if (!found.openai) {
				logService.info('[EcoSystems AI] OPENAI_API_KEY not found in shell environment or .env files');
			}
			if (!found.anthropic) {
				logService.info('[EcoSystems AI] ANTHROPIC_API_KEY not found in shell environment or .env files');
			}
			if (!found.openai && !found.anthropic) {
				logService.warn(
					'[EcoSystems AI] No provider API keys detected. Add OPENAI_API_KEY / ANTHROPIC_API_KEY ' +
					'to a .env or .env.local file in the workspace root, set them via `setx` (Windows) / shell rc, ' +
					'or run the command "EcoSystems AI: Set API Key…".'
				);
			}

			// Suppress unused-import warning for VSBuffer if linter is strict
			void VSBuffer;
		})();
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(EcosystemsEnvKeysContribution, LifecyclePhase.Eventually);
