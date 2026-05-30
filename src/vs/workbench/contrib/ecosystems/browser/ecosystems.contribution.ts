/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { localize2 } from '../../../../../nls.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { registerIcon } from '../../../../../platform/theme/common/iconRegistry.js';
import { ECOSYSTEMS_AI_CHAT_VIEW_ID, ECOSYSTEMS_AI_VIEWLET_ID } from '../../../../../platform/ecosystems/common/constants.js';
import { ViewPaneContainer } from '../../../../browser/parts/views/viewPaneContainer.js';
import { Extensions as ViewExtensions, IViewContainersRegistry, IViewsRegistry, ViewContainerLocation } from '../../../../common/views.js';
import { EcoSystemsChatViewPane } from './ecosystemsChatViewPane.js';

const ecosystemsAiViewIcon = registerIcon('ecosystems-ai-view-icon', Codicon.sparkle, localize2('ecosystemsAiViewIcon', 'EcoSystems AI view icon.'));

const viewContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
	id: ECOSYSTEMS_AI_VIEWLET_ID,
	title: localize2('ecosystemsAi', 'EcoSystems AI'),
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [ECOSYSTEMS_AI_VIEWLET_ID, { mergeViewWithContainerWhenSingleView: true }]),
	icon: ecosystemsAiViewIcon,
	order: 7,
}, ViewContainerLocation.Sidebar);

Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([{
	id: ECOSYSTEMS_AI_CHAT_VIEW_ID,
	name: localize2('ecosystemsAiChat', 'Chat'),
	ctorDescriptor: new SyncDescriptor(EcoSystemsChatViewPane),
	canToggleVisibility: true,
	canMoveView: true,
	containerIcon: ecosystemsAiViewIcon,
	order: 1,
}], viewContainer);
