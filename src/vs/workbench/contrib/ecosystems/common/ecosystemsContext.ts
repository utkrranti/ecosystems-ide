/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';

export const ECOSYSTEMS_AI_SIGNED_IN_KEY = 'ecosystemsAiSignedIn';
export const ECOSYSTEMS_AI_SIGNED_IN = new RawContextKey<boolean>(ECOSYSTEMS_AI_SIGNED_IN_KEY, false);
