/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { IEcosystemsSessionService } from '../../../../platform/ecosystems/common/ecosystemsSessionService.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { INativeWorkbenchEnvironmentService } from '../../../services/environment/electron-sandbox/environmentService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { syncDevSessionTokenFromGatewayEnv } from '../../../../platform/ecosystems/common/localGatewayDevAuth.js';

/**
 * Local dev bootstrap: read `ide_apis/.env.local` for DEV_SESSION_TOKEN.
 * Provider API keys stay on the gateway -- the IDE never calls api.openai.com from the renderer.
 */
class EcosystemsGatewayDevContribution extends Disposable {

	static readonly ID = 'workbench.contrib.ecosystems.gatewayDev';

	constructor(
		@IEcosystemsSessionService private readonly sessionService: IEcosystemsSessionService,
		@ILogService private readonly logService: ILogService,
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@INativeWorkbenchEnvironmentService private readonly environmentService: INativeWorkbenchEnvironmentService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
		void this.bootstrapLocalGateway();
	}

	private async bootstrapLocalGateway(): Promise<void> {
		const ok = await syncDevSessionTokenFromGatewayEnv({
			fileService: this.fileService,
			workspaceContextService: this.workspaceContextService,
			sessionService: this.sessionService,
			configurationService: this.configurationService,
			logService: this.logService,
			appRoot: this.environmentService.appRoot,
			force: true,
			useDefaultIfMissing: true,
		});

		if (!ok) {
			this.logService.info(
				'[Altus AI] No ide_apis/.env.local found. Copy ide_apis/.env.example to .env.local and run .\\scripts\\run-all.ps1'
			);
		}
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(EcosystemsGatewayDevContribution, LifecyclePhase.Restored);
