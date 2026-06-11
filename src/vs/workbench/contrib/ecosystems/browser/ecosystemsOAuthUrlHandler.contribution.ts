/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IURLHandler, IURLService, IOpenURLOptions } from '../../../../platform/url/common/url.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { IEcosystemsAuthService } from './ecosystemsAuthService.js';

class EcosystemsOAuthUrlHandlerContribution extends Disposable implements IWorkbenchContribution, IURLHandler {

	static readonly ID = 'workbench.contrib.ecosystems.oauthUrlHandler';

	constructor(
		@IURLService urlService: IURLService,
		@IEcosystemsAuthService private readonly authService: IEcosystemsAuthService,
	) {
		super();
		this._register(urlService.registerHandler(this));
	}

	handleURL(uri: URI, _options?: IOpenURLOptions): Promise<boolean> {
		return Promise.resolve(this.authService.completeOAuthFromUri(uri));
	}
}

registerWorkbenchContribution2(
	EcosystemsOAuthUrlHandlerContribution.ID,
	EcosystemsOAuthUrlHandlerContribution,
	WorkbenchPhase.BlockStartup,
);
