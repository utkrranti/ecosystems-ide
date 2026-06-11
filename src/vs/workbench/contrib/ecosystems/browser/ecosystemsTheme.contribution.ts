/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/ecosystemsWorkbench.css';
import { localize } from '../../../../nls.js';
import { registerColor } from '../../../../platform/theme/common/colorRegistry.js';
import { ECOSYSTEMS_BLACK, ECOSYSTEMS_ACCENT_1 } from './ecosystemsTheme.js';

registerColor('welcomePage.background', {
	dark: ECOSYSTEMS_BLACK,
	light: '#ffffff',
	hcDark: ECOSYSTEMS_BLACK,
	hcLight: '#ffffff',
}, localize('ecosystemsWelcomePageBackground', 'Altus IDE welcome page background.'));

registerColor('welcomePage.progress.foreground', {
	dark: ECOSYSTEMS_ACCENT_1,
	light: ECOSYSTEMS_ACCENT_1,
	hcDark: ECOSYSTEMS_ACCENT_1,
	hcLight: ECOSYSTEMS_ACCENT_1,
}, localize('ecosystemsWelcomePageProgress', 'Altus IDE welcome page progress bar.'));
