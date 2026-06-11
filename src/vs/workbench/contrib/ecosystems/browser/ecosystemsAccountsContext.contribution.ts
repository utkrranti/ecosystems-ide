/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IEcosystemsSessionService } from '../../../../platform/ecosystems/common/ecosystemsSessionService.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { ECOSYSTEMS_AI_SIGNED_IN } from '../common/ecosystemsContext.js';

class EcosystemsAccountsContextContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.ecosystems.accountsContext';

	private readonly signedInContext: IContextKey<boolean>;

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IEcosystemsSessionService private readonly sessionService: IEcosystemsSessionService,
	) {
		super();
		this.signedInContext = ECOSYSTEMS_AI_SIGNED_IN.bindTo(contextKeyService);
		void this.refreshSignedInContext();
		this._register(this.sessionService.onDidChangeSession(() => this.refreshSignedInContext()));
	}

	private async refreshSignedInContext(): Promise<void> {
		this.signedInContext.set(await this.sessionService.isSignedIn());
	}
}

registerWorkbenchContribution2(
	EcosystemsAccountsContextContribution.ID,
	EcosystemsAccountsContextContribution,
	WorkbenchPhase.BlockStartup,
);
