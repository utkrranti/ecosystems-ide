/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ThemeSettings } from '../../../services/themes/common/workbenchThemeService.js';
import { ECOSYSTEMS_DEFAULT_COLOR_THEME_ID, ECOSYSTEMS_LEGACY_COLOR_THEME_IDS } from './ecosystemsTheme.js';

/**
 * Ensures existing profiles use the EcoSystems default theme instead of legacy VS dark themes.
 */
class EcosystemsThemeBootstrapContribution implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.ecosystems.themeBootstrap';

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		void this.applyDefaultThemeIfNeeded();
	}

	private async applyDefaultThemeIfNeeded(): Promise<void> {
		const current = this.configurationService.getValue<string>(ThemeSettings.COLOR_THEME);
		if (current === ECOSYSTEMS_DEFAULT_COLOR_THEME_ID) {
			return;
		}
		if (current && !(ECOSYSTEMS_LEGACY_COLOR_THEME_IDS as readonly string[]).includes(current)) {
			return;
		}

		await this.configurationService.updateValue(
			ThemeSettings.COLOR_THEME,
			ECOSYSTEMS_DEFAULT_COLOR_THEME_ID,
			ConfigurationTarget.USER,
		);
	}
}

registerWorkbenchContribution2(
	EcosystemsThemeBootstrapContribution.ID,
	EcosystemsThemeBootstrapContribution,
	WorkbenchPhase.AfterRestored,
);
