/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);

configurationRegistry.registerConfiguration({
	id: 'altusUpdate',
	order: 16,
	title: localize('altusUpdateConfigurationTitle', "Altus IDE Update"),
	type: 'object',
	properties: {
		'update.showToastNotifications': {
			type: 'boolean',
			default: false,
			scope: ConfigurationScope.APPLICATION,
			description: localize('updateShowToastNotifications', "Show toast notifications and activity-bar badges for updates. When disabled, updates are surfaced only in the title bar pill."),
		},
	},
});

configurationRegistry.registerDefaultConfigurations([{
	overrides: {
		'update.mode': 'manual',
		'update.showToastNotifications': false,
		'update.enableWindowsBackgroundUpdates': true,
	},
}]);
