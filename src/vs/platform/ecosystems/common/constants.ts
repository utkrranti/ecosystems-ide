/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export const ECOSYSTEMS_AI_VIEWLET_ID = 'workbench.view.ecosystems.ai.aux2';
export const ECOSYSTEMS_AI_CHAT_VIEW_ID = 'ecosystems.ai.chat.v2';

export const ECOSYSTEMS_SESSION_TOKEN_KEY = 'ai.ecosystems.sessionToken';

export const ECOSYSTEMS_CONFIGURATION_NAMESPACE = 'ecosystems.ai';

/**
 * Empty by default — when not set, the model router auto-picks a provider-specific
 * base URL (OpenAI, Anthropic, …) from the selected model id. Users only need to
 * configure this when pointing at a custom / self-hosted gateway.
 */
export const DEFAULT_GATEWAY_BASE_URL = '';
export const DEFAULT_CHAT_MODEL = 'gpt-4o-mini';
export const DEFAULT_INLINE_MODEL = 'gpt-4o-mini';

export const ECOSYSTEMS_AI_COMMAND_SIGN_IN = 'ecosystems.ai.signIn';
export const ECOSYSTEMS_AI_COMMAND_SIGN_OUT = 'ecosystems.ai.signOut';

export const PHASE0_GATEWAY_MODELS: readonly { id: string; displayName: string }[] = [
	{ id: 'gpt-4o-mini', displayName: 'GPT-4o mini' },
	{ id: 'gpt-4o', displayName: 'GPT-4o' },
];
