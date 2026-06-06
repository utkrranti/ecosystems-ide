/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export type AiProvider = 'openai' | 'anthropic' | 'gateway';

export function detectProvider(modelId: string): AiProvider {
	const id = modelId.toLowerCase();
	if (id.startsWith('claude') || id.includes('anthropic')) {
		return 'anthropic';
	}
	if (id.startsWith('gpt') || id.startsWith('o1') || id.startsWith('o3') || id.startsWith('o4') || id.startsWith('text-') || id.startsWith('chatgpt')) {
		return 'openai';
	}
	return 'gateway';
}

export function defaultBaseUrlFor(provider: AiProvider): string {
	switch (provider) {
		case 'openai': return 'https://api.openai.com/v1';
		case 'anthropic': return 'https://api.anthropic.com/v1';
		case 'gateway': return 'https://api.ecosystems.dev/v1';
	}
}

/**
 * Returns false for models that reject a `temperature` parameter (Anthropic
 * Claude 4.x reasoning models and OpenAI o-series reasoning models). The
 * payload must omit the field entirely for these.
 */
export function supportsTemperature(provider: AiProvider, modelId: string): boolean {
	const id = modelId.toLowerCase();
	if (provider === 'anthropic') {
		// Claude Opus 4+, Sonnet 4+, and Haiku 4+ deprecated temperature.
		return !/^claude-(opus|sonnet|haiku)-[4-9]/.test(id);
	}
	if (provider === 'openai') {
		// o1, o3, o4 reasoning families do not accept temperature.
		return !/^o[1-9]/.test(id);
	}
	return true;
}
