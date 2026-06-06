/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';
import { registerEcosystemsAiConfiguration } from './ecosystemsConfiguration.js';
import { EcosystemsAiService, IEcosystemsAiService } from './ecosystemsAiService.js';
import { EcosystemsGatewayProvider, IEcosystemsGatewayProvider } from './gatewayProvider.js';
import { EcosystemsSessionService, IEcosystemsSessionService } from './ecosystemsSessionService.js';
import { EcosystemsApiKeys, IEcosystemsApiKeys } from './ecosystemsApiKeys.js';
import { IModelRouterService, ModelRouterService } from './modelRouterService.js';

registerEcosystemsAiConfiguration();

registerSingleton(IEcosystemsApiKeys, EcosystemsApiKeys, InstantiationType.Delayed);
registerSingleton(IEcosystemsSessionService, EcosystemsSessionService, InstantiationType.Delayed);
registerSingleton(IEcosystemsGatewayProvider, EcosystemsGatewayProvider, InstantiationType.Delayed);
registerSingleton(IModelRouterService, ModelRouterService, InstantiationType.Delayed);
registerSingleton(IEcosystemsAiService, EcosystemsAiService, InstantiationType.Delayed);
