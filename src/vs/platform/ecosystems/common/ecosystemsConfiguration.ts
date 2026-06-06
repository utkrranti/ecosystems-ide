/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';
import { ConfigurationScope, Extensions, IConfigurationRegistry } from '../../configuration/common/configurationRegistry.js';
import { Registry } from '../../registry/common/platform.js';
import {
	DEFAULT_CHAT_MODEL,
	DEFAULT_GATEWAY_BASE_URL,
	DEFAULT_INLINE_MODEL,
	ECOSYSTEMS_CONFIGURATION_NAMESPACE,
} from './constants.js';

export const ECOSYSTEMS_AI_ENABLED = `${ECOSYSTEMS_CONFIGURATION_NAMESPACE}.enabled`;
export const ECOSYSTEMS_AI_PROVIDER = `${ECOSYSTEMS_CONFIGURATION_NAMESPACE}.provider`;
export const ECOSYSTEMS_AI_GATEWAY_BASE_URL = `${ECOSYSTEMS_CONFIGURATION_NAMESPACE}.gateway.baseUrl`;
export const ECOSYSTEMS_AI_CHAT_MODEL = `${ECOSYSTEMS_CONFIGURATION_NAMESPACE}.chat.model`;
export const ECOSYSTEMS_AI_INLINE_MODEL = `${ECOSYSTEMS_CONFIGURATION_NAMESPACE}.inline.model`;
export const ECOSYSTEMS_AI_INLINE_ENABLED = `${ECOSYSTEMS_CONFIGURATION_NAMESPACE}.inline.enabled`;
export const ECOSYSTEMS_AI_CHAT_MAX_TOKENS = `${ECOSYSTEMS_CONFIGURATION_NAMESPACE}.chat.maxTokens`;
export const ECOSYSTEMS_AI_CHAT_TEMPERATURE = `${ECOSYSTEMS_CONFIGURATION_NAMESPACE}.chat.temperature`;

export function registerEcosystemsAiConfiguration(): void {
	const configurationRegistry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
	configurationRegistry.registerConfiguration({
		id: 'ecosystemsAi',
		title: localize('ecosystemsAiConfigurationTitle', 'EcoSystems AI'),
		type: 'object',
		scope: ConfigurationScope.APPLICATION,
		properties: {
			[ECOSYSTEMS_AI_ENABLED]: {
				type: 'boolean',
				default: true,
				description: localize('ecosystemsAiEnabled', 'Enable EcoSystems AI features. When off, no data is sent to the EcoSystems AI Gateway.'),
			},
			[ECOSYSTEMS_AI_PROVIDER]: {
				type: 'string',
				enum: ['ecosystems', 'none'],
				default: 'ecosystems',
				description: localize('ecosystemsAiProvider', 'AI provider. Use EcoSystems AI Gateway (sign in required).'),
			},
			[ECOSYSTEMS_AI_GATEWAY_BASE_URL]: {
				type: 'string',
				default: DEFAULT_GATEWAY_BASE_URL,
				description: localize('ecosystemsAiGatewayBaseUrl', 'EcoSystems AI Gateway base URL. Override for local development (e.g. http://localhost:8080/v1).'),
			},
			[ECOSYSTEMS_AI_CHAT_MODEL]: {
				type: 'string',
				default: DEFAULT_CHAT_MODEL,
				description: localize('ecosystemsAiChatModel', 'Model used for chat.'),
			},
			[ECOSYSTEMS_AI_INLINE_MODEL]: {
				type: 'string',
				default: DEFAULT_INLINE_MODEL,
				description: localize('ecosystemsAiInlineModel', 'Model used for inline completion.'),
			},
			[ECOSYSTEMS_AI_INLINE_ENABLED]: {
				type: 'boolean',
				default: true,
				description: localize('ecosystemsAiInlineEnabled', 'Enable inline AI completions.'),
			},
			[ECOSYSTEMS_AI_CHAT_MAX_TOKENS]: {
				type: 'number',
				default: 4096,
				minimum: 256,
				maximum: 128000,
				description: localize('ecosystemsAiChatMaxTokens', 'Maximum tokens for chat responses.'),
			},
			[ECOSYSTEMS_AI_CHAT_TEMPERATURE]: {
				type: 'number',
				default: 0.2,
				minimum: 0,
				maximum: 2,
				description: localize('ecosystemsAiChatTemperature', 'Sampling temperature for chat.'),
			},
		},
	});
}
