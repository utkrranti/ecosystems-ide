/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Built-in color theme id (extensions/ecosystems-theme). */
export const ECOSYSTEMS_DEFAULT_COLOR_THEME_ID = 'Altus Dark';

/** VS / legacy themes we migrate away from on first launch. */
export const ECOSYSTEMS_LEGACY_COLOR_THEME_IDS = [
	'Default Dark Modern',
	'Default Dark+',
	'Visual Studio Dark',
] as const;

/** Brand palette (matches Altus AI chat send button). */
export const ECOSYSTEMS_ACCENT_1 = '#7c5cff';
export const ECOSYSTEMS_ACCENT_2 = '#19c8ff';
export const ECOSYSTEMS_ACCENT_GRAD = `linear-gradient(135deg, ${ECOSYSTEMS_ACCENT_1} 0%, ${ECOSYSTEMS_ACCENT_2} 100%)`;

/** Pure black workbench surfaces (replaces default dark grey). */
export const ECOSYSTEMS_BLACK = '#000000';
export const ECOSYSTEMS_BLACK_ELEVATED = '#0a0a0a';

