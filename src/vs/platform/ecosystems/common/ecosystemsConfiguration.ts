/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
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
import {
	INTELLIGENCE_MODE_SETTING_ENUM,
	INTELLIGENCE_MODE_SETTING_LABELS,
} from './intelligenceModes.js';

export const ECOSYSTEMS_AI_ENABLED = `${ECOSYSTEMS_CONFIGURATION_NAMESPACE}.enabled`;
export const ECOSYSTEMS_AI_PROVIDER = `${ECOSYSTEMS_CONFIGURATION_NAMESPACE}.provider`;
export const ECOSYSTEMS_AI_GATEWAY_BASE_URL = `${ECOSYSTEMS_CONFIGURATION_NAMESPACE}.gateway.baseUrl`;
export const ECOSYSTEMS_AI_CHAT_MODEL = `${ECOSYSTEMS_CONFIGURATION_NAMESPACE}.chat.model`;
export const ECOSYSTEMS_AI_INLINE_MODEL = `${ECOSYSTEMS_CONFIGURATION_NAMESPACE}.inline.model`;
export const ECOSYSTEMS_AI_INLINE_ENABLED = `${ECOSYSTEMS_CONFIGURATION_NAMESPACE}.inline.enabled`;
export const ECOSYSTEMS_AI_CHAT_MAX_TOKENS = `${ECOSYSTEMS_CONFIGURATION_NAMESPACE}.chat.maxTokens`;
export const ECOSYSTEMS_AI_CHAT_TEMPERATURE = `${ECOSYSTEMS_CONFIGURATION_NAMESPACE}.chat.temperature`;
export const ECOSYSTEMS_AI_CHAT_NEW_SESSION_DAILY = `${ECOSYSTEMS_CONFIGURATION_NAMESPACE}.chat.newSessionDaily`;
export const ECOSYSTEMS_AI_CHAT_COMPACT_ENABLED = `${ECOSYSTEMS_CONFIGURATION_NAMESPACE}.chat.compact.enabled`;
export const ECOSYSTEMS_AI_CHAT_COMPACT_AFTER_MESSAGES = `${ECOSYSTEMS_CONFIGURATION_NAMESPACE}.chat.compact.afterMessages`;
export const ECOSYSTEMS_AI_CHAT_COMPACT_KEEP_RECENT = `${ECOSYSTEMS_CONFIGURATION_NAMESPACE}.chat.compact.keepRecent`;
export const ECOSYSTEMS_AI_CHAT_CHECKPOINTS_ENABLED = `${ECOSYSTEMS_CONFIGURATION_NAMESPACE}.chat.checkpoints.enabled`;
export const ECOSYSTEMS_AI_CHAT_COMPACT_BACKGROUND = `${ECOSYSTEMS_CONFIGURATION_NAMESPACE}.chat.compact.background`;
export const ECOSYSTEMS_AI_CHAT_COMPACT_THRESHOLD_PERCENT = `${ECOSYSTEMS_CONFIGURATION_NAMESPACE}.chat.compact.thresholdPercent`;
export const ECOSYSTEMS_AI_CHAT_COMPACT_MODEL = `${ECOSYSTEMS_CONFIGURATION_NAMESPACE}.chat.compact.model`;
export const ECOSYSTEMS_AI_CHAT_CONTEXT_BUDGET_CHARS = `${ECOSYSTEMS_CONFIGURATION_NAMESPACE}.chat.contextBudgetChars`;
export const ECOSYSTEMS_AI_STACK_PLAYBOOKS_ENABLED = `${ECOSYSTEMS_CONFIGURATION_NAMESPACE}.stackPlaybooks.enabled`;
export const ECOSYSTEMS_AI_STACK_PLAYBOOKS_REMOTE_URL = `${ECOSYSTEMS_CONFIGURATION_NAMESPACE}.stackPlaybooks.remoteUrl`;
export const ECOSYSTEMS_AI_STACK_PLAYBOOKS_LOCAL_URI = `${ECOSYSTEMS_CONFIGURATION_NAMESPACE}.stackPlaybooks.localPath`;

export function registerEcosystemsAiConfiguration(): void {
	const configurationRegistry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
	configurationRegistry.registerConfiguration({
		id: 'altusAi',
		title: localize('ecosystemsAiConfigurationTitle', 'Altus AI'),
		type: 'object',
		scope: ConfigurationScope.APPLICATION,
		properties: {
			[ECOSYSTEMS_AI_ENABLED]: {
				type: 'boolean',
				default: true,
				description: localize('ecosystemsAiEnabled', 'Enable Altus AI features. When off, no data is sent to the Altus AI Gateway.'),
			},
			[ECOSYSTEMS_AI_PROVIDER]: {
				type: 'string',
				enum: ['ecosystems', 'none'],
				enumItemLabels: [
					localize('ecosystemsAiProviderAltusEcosystem', 'Altus AI Ecosystem'),
					localize('ecosystemsAiProviderNone', 'None'),
				],
				default: 'ecosystems',
				description: localize('ecosystemsAiProvider', 'AI provider. Use Altus AI Gateway (sign in required).'),
			},
			[ECOSYSTEMS_AI_GATEWAY_BASE_URL]: {
				type: 'string',
				default: DEFAULT_GATEWAY_BASE_URL,
				description: localize('ecosystemsAiGatewayBaseUrl', 'Altus AI Gateway base URL (local dev: http://localhost:8787/v1). Sign in with your session token; API keys live on the gateway server.'),
			},
			[ECOSYSTEMS_AI_CHAT_MODEL]: {
				type: 'string',
				enum: INTELLIGENCE_MODE_SETTING_ENUM,
				enumItemLabels: [...INTELLIGENCE_MODE_SETTING_LABELS],
				default: DEFAULT_CHAT_MODEL,
				description: localize('ecosystemsAiChatModel', 'Intelligence mode used for chat (Fast, Smart, Pro, or Deep).'),
			},
			[ECOSYSTEMS_AI_INLINE_MODEL]: {
				type: 'string',
				enum: INTELLIGENCE_MODE_SETTING_ENUM,
				enumItemLabels: [...INTELLIGENCE_MODE_SETTING_LABELS],
				default: DEFAULT_INLINE_MODEL,
				description: localize('ecosystemsAiInlineModel', 'Intelligence mode used for inline completion (Fast Mode recommended).'),
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
			[ECOSYSTEMS_AI_CHAT_NEW_SESSION_DAILY]: {
				type: 'boolean',
				default: true,
				description: localize(
					'ecosystemsAiChatNewSessionDaily',
					'Start a new chat session automatically when the calendar day changes. Previous sessions stay available in history.',
				),
			},
			[ECOSYSTEMS_AI_CHAT_COMPACT_ENABLED]: {
				type: 'boolean',
				default: true,
				description: localize(
					'ecosystemsAiChatCompactEnabled',
					'Automatically compact long conversations (summarize older turns, keep recent messages).',
				),
			},
			[ECOSYSTEMS_AI_CHAT_COMPACT_BACKGROUND]: {
				type: 'boolean',
				default: true,
				description: localize(
					'ecosystemsAiChatCompactBackground',
					'Compact in the background after each turn (Copilot-style). When off, compaction runs before send and may pause the chat.',
				),
			},
			[ECOSYSTEMS_AI_CHAT_COMPACT_THRESHOLD_PERCENT]: {
				type: 'number',
				default: 72,
				minimum: 40,
				maximum: 95,
				description: localize(
					'ecosystemsAiChatCompactThreshold',
					'Start background compaction when estimated context usage reaches this percent of the budget.',
				),
			},
			[ECOSYSTEMS_AI_CHAT_COMPACT_MODEL]: {
				type: 'string',
				enum: INTELLIGENCE_MODE_SETTING_ENUM,
				enumItemLabels: [...INTELLIGENCE_MODE_SETTING_LABELS],
				default: 'altus-fast',
				description: localize(
					'ecosystemsAiChatCompactModel',
					'Intelligence mode used only for conversation compaction summaries (Fast Mode recommended).',
				),
			},
			[ECOSYSTEMS_AI_CHAT_CONTEXT_BUDGET_CHARS]: {
				type: 'number',
				default: 96000,
				minimum: 32000,
				maximum: 500000,
				description: localize(
					'ecosystemsAiChatContextBudget',
					'Estimated character budget for chat context (used for the context meter and proactive compaction).',
				),
			},
			[ECOSYSTEMS_AI_CHAT_COMPACT_AFTER_MESSAGES]: {
				type: 'number',
				default: 24,
				minimum: 12,
				maximum: 200,
				description: localize('ecosystemsAiChatCompactAfter', 'Compact when a session has at least this many messages.'),
			},
			[ECOSYSTEMS_AI_CHAT_COMPACT_KEEP_RECENT]: {
				type: 'number',
				default: 10,
				minimum: 4,
				maximum: 80,
				description: localize('ecosystemsAiChatCompactKeepRecent', 'How many recent messages to keep in full after compaction.'),
			},
			[ECOSYSTEMS_AI_CHAT_CHECKPOINTS_ENABLED]: {
				type: 'boolean',
				default: true,
				description: localize(
					'ecosystemsAiChatCheckpointsEnabled',
					'Allow saving and restoring conversation checkpoints within a chat session.',
				),
			},
			[ECOSYSTEMS_AI_STACK_PLAYBOOKS_ENABLED]: {
				type: 'boolean',
				default: true,
				description: localize(
					'ecosystemsAiStackPlaybooksEnabled',
					'Inject standard per-stack scaffold commands and folder practices into Agent mode system prompts.',
				),
			},
			[ECOSYSTEMS_AI_STACK_PLAYBOOKS_REMOTE_URL]: {
				type: 'string',
				default: '',
				description: localize(
					'ecosystemsAiStackPlaybooksRemoteUrl',
					'Optional HTTPS URL to a stack-playbooks.json file (same schema as bundled). Fetched on startup and cached locally; merged over bundled playbooks by stack id.',
				),
			},
			[ECOSYSTEMS_AI_STACK_PLAYBOOKS_LOCAL_URI]: {
				type: 'string',
				default: '',
				description: localize(
					'ecosystemsAiStackPlaybooksLocalPath',
					'Optional path to a local stack-playbooks.json (absolute path or file URI). Merged over bundled playbooks by stack id.',
				),
			},
		},
	});
}
