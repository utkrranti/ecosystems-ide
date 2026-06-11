/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const ECOSYSTEMS_AI_VIEWLET_ID = 'workbench.view.ecosystems.ai.aux2';
export const ECOSYSTEMS_AI_CHAT_VIEW_ID = 'ecosystems.ai.chat.v2';

export const ECOSYSTEMS_SESSION_TOKEN_KEY = 'ai.ecosystems.sessionToken';

/** Settings keys use `altusAI.*` so the Settings UI shows "Altus AI" (not "Ecosystems"). */
export const ECOSYSTEMS_CONFIGURATION_NAMESPACE = 'altusAI';

/**
 * Local dev gateway. Override in user settings for production (e.g. https://api.ecosystems.dev/v1).
 */
export const DEFAULT_GATEWAY_BASE_URL = 'http://localhost:8787/v1';
export const DEFAULT_CHAT_MODEL = 'altus-smart';
export const DEFAULT_INLINE_MODEL = 'altus-fast';

export const ECOSYSTEMS_AI_COMMAND_SIGN_IN = 'ecosystems.ai.signIn';
export const ECOSYSTEMS_AI_COMMAND_SIGN_OUT = 'ecosystems.ai.signOut';
export const ECOSYSTEMS_AI_COMMAND_NEW_CHAT_SESSION = 'ecosystems.ai.chat.newSession';
export const ECOSYSTEMS_AI_COMMAND_OPEN_CHAT_SESSION = 'ecosystems.ai.chat.openSession';
export const ECOSYSTEMS_AI_COMMAND_TOGGLE_SESSIONS_LIST = 'ecosystems.ai.chat.toggleSessionsList';
export const ECOSYSTEMS_AI_COMMAND_ATTACH_TERMINAL = 'ecosystems.ai.chat.attachTerminalSelection';
export const ECOSYSTEMS_AI_COMMAND_ATTACH_FILES = 'ecosystems.ai.chat.attachFiles';
export const ECOSYSTEMS_AI_COMMAND_COMPACT_CONVERSATION = 'ecosystems.ai.chat.compactConversation';
export const ECOSYSTEMS_AI_COMMAND_CREATE_CHECKPOINT = 'ecosystems.ai.chat.createCheckpoint';
export const ECOSYSTEMS_AI_COMMAND_RESTORE_CHECKPOINT = 'ecosystems.ai.chat.restoreCheckpoint';
export const ECOSYSTEMS_AI_COMMAND_REFRESH_STACK_PLAYBOOKS = 'ecosystems.ai.stackPlaybooks.refresh';
export const ECOSYSTEMS_AI_COMMAND_COPY_ALL_CHAT = 'ecosystems.ai.chat.copyAll';

export const PHASE0_GATEWAY_MODELS: readonly { id: string; displayName: string }[] = [
	{ id: 'altus-fast', displayName: 'Fast Mode' },
	{ id: 'altus-smart', displayName: 'Smart Mode' },
	{ id: 'altus-pro', displayName: 'Pro Mode' },
	{ id: 'altus-deep', displayName: 'Deep Mode' },
];
