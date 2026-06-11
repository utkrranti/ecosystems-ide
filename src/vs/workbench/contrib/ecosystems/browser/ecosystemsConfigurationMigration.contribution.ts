/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions, IConfigurationMigrationRegistry } from '../../../common/configuration.js';

const LEGACY_SETTINGS_KEYS = [
	'ecosystems.ai.enabled',
	'ecosystems.ai.provider',
	'ecosystems.ai.gateway.baseUrl',
	'ecosystems.ai.chat.model',
	'ecosystems.ai.chat.maxTokens',
	'ecosystems.ai.chat.temperature',
	'ecosystems.ai.chat.newSessionDaily',
	'ecosystems.ai.chat.compact.enabled',
	'ecosystems.ai.chat.compact.background',
	'ecosystems.ai.chat.compact.thresholdPercent',
	'ecosystems.ai.chat.compact.model',
	'ecosystems.ai.chat.compact.afterMessages',
	'ecosystems.ai.chat.compact.keepRecent',
	'ecosystems.ai.chat.contextBudgetChars',
	'ecosystems.ai.chat.checkpoints.enabled',
	'ecosystems.ai.inline.model',
	'ecosystems.ai.inline.enabled',
	'ecosystems.ai.stackPlaybooks.enabled',
	'ecosystems.ai.stackPlaybooks.remoteUrl',
	'ecosystems.ai.stackPlaybooks.localPath',
] as const;

Registry.as<IConfigurationMigrationRegistry>(Extensions.ConfigurationMigration)
	.registerConfigurationMigrations(
		LEGACY_SETTINGS_KEYS.map(legacyKey => ({
			key: legacyKey,
			migrateFn: (value) => {
				const newKey = legacyKey.replace(/^ecosystems\.ai\./, 'altusAI.');
				return [
					[legacyKey, { value: undefined }],
					[newKey, { value }],
				];
			},
		})),
	);
