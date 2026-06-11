/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';
import { GatewayModelInfo } from './ecosystemsAiTypes.js';

export const INTELLIGENCE_MODE_IDS = [
	'altus-fast',
	'altus-smart',
	'altus-pro',
	'altus-deep',
] as const;

export type IntelligenceModeId = (typeof INTELLIGENCE_MODE_IDS)[number];

export const DEFAULT_INTELLIGENCE_MODE: IntelligenceModeId = 'altus-smart';

export const INTELLIGENCE_MODE_SETTING_ENUM = [...INTELLIGENCE_MODE_IDS];

export const INTELLIGENCE_MODE_SETTING_LABELS = [
	'Fast Mode',
	'Smart Mode',
	'Pro Mode',
	'Deep Mode',
] as const;

export const INTELLIGENCE_MODE_DEFAULTS: GatewayModelInfo[] = [
	{ id: 'altus-fast', displayName: 'Fast Mode', tier: 'free', features: ['chat', 'inline', 'agent'] },
	{ id: 'altus-smart', displayName: 'Smart Mode', tier: 'free', features: ['chat', 'inline', 'agent'] },
	{ id: 'altus-pro', displayName: 'Pro Mode', tier: 'pro', features: ['chat', 'agent'] },
	{ id: 'altus-deep', displayName: 'Deep Mode', tier: 'pro', features: ['chat', 'agent'] },
];

const LEGACY_MODEL_TO_MODE: Record<string, IntelligenceModeId> = {
	'gpt-4o-mini': 'altus-fast',
	'claude-haiku-4-5-20251001': 'altus-smart',
	'claude-haiku-4-5': 'altus-smart',
	'gpt-4o': 'altus-pro',
	'claude-sonnet-4-6': 'altus-pro',
	'claude-opus-4-8': 'altus-deep',
};

export function isIntelligenceModeId(modelId: string): modelId is IntelligenceModeId {
	return (INTELLIGENCE_MODE_IDS as readonly string[]).includes(modelId);
}

export function coerceToIntelligenceModeId(modelId: string): string {
	if (isIntelligenceModeId(modelId)) {
		return modelId;
	}
	return LEGACY_MODEL_TO_MODE[modelId] ?? modelId;
}

export function pickIntelligenceModels(all: readonly GatewayModelInfo[]): GatewayModelInfo[] {
	const modes = INTELLIGENCE_MODE_IDS
		.map(id => all.find(m => m.id === id))
		.filter((m): m is GatewayModelInfo => !!m);
	if (modes.length) {
		return modes;
	}
	return all.filter(m => m.id.startsWith('altus-'));
}

/** Short guidance shown under each mode in the intelligence picker. */
export function intelligenceModeHint(modelId: string): string {
	const id = coerceToIntelligenceModeId(modelId);
	switch (id) {
		case 'altus-fast':
			return localize(
				'ecosystemsAiIntelligenceHintFast',
				'Use this when you need quick answers, lookups, or small edits.',
			);
		case 'altus-smart':
			return localize(
				'ecosystemsAiIntelligenceHintSmart',
				'Use this when you want balanced help for everyday coding and agent work.',
			);
		case 'altus-pro':
			return localize(
				'ecosystemsAiIntelligenceHintPro',
				'Use this when a task needs stronger reasoning or tricky debugging.',
			);
		case 'altus-deep':
			return localize(
				'ecosystemsAiIntelligenceHintDeep',
				'Use this when you are facing the hardest problems or large refactors.',
			);
		default:
			return '';
	}
}

export function resolveIntelligenceModel(
	modelId: string,
	models: readonly GatewayModelInfo[],
): GatewayModelInfo {
	const coerced = coerceToIntelligenceModeId(modelId);
	const match = models.find(m => m.id === coerced);
	if (match) {
		return match;
	}
	return models.find(m => m.id === DEFAULT_INTELLIGENCE_MODE)
		?? INTELLIGENCE_MODE_DEFAULTS.find(m => m.id === DEFAULT_INTELLIGENCE_MODE)
		?? INTELLIGENCE_MODE_DEFAULTS[1];
}
