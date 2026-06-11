/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import {
	ECOSYSTEMS_AI_COMMAND_ATTACH_FILES,
	ECOSYSTEMS_AI_COMMAND_ATTACH_TERMINAL,
	ECOSYSTEMS_AI_COMMAND_COPY_ALL_CHAT,
	ECOSYSTEMS_AI_CHAT_VIEW_ID,
} from '../../../../platform/ecosystems/common/constants.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { EcoSystemsChatViewPane } from './ecosystemsChatViewPane.js';
import { ITerminalService } from '../../terminal/browser/terminal.js';
import { TerminalContextKeys } from '../../terminal/common/terminalContextKey.js';
import { createChatAttachment } from './ecosystemsChatAttachments.js';
import { IEcosystemsChatContextService } from './ecosystemsChatContextService.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { basename } from '../../../../base/common/resources.js';

registerAction2(class EcosystemsAiAttachTerminalSelectionAction extends Action2 {
	constructor() {
		super({
			id: ECOSYSTEMS_AI_COMMAND_ATTACH_TERMINAL,
			title: localize2('ecosystemsAiAttachTerminal', 'Add Terminal Selection to Altus AI Chat'),
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const terminalService = accessor.get(ITerminalService);
		const chatContext = accessor.get(IEcosystemsChatContextService);
		const notificationService = accessor.get(INotificationService);
		const instance = terminalService.activeInstance;
		if (!instance?.hasSelection()) {
			notificationService.info(localize('ecosystemsAiNoTerminalSelection', 'Select text in the terminal first.'));
			return;
		}
		const text = instance.selection;
		if (!text?.trim()) {
			return;
		}
		const title = instance.title || localize('ecosystemsAiTerminal', 'Terminal');
		await chatContext.revealChat();
		chatContext.addAttachments([createChatAttachment({
			kind: 'terminal',
			label: localize('ecosystemsAiTerminalSelection', 'Terminal: {0}', title),
			textContent: text,
		})]);
		chatContext.focusComposer();
	}
});

registerAction2(class EcosystemsAiAttachFilesAction extends Action2 {
	constructor() {
		super({
			id: ECOSYSTEMS_AI_COMMAND_ATTACH_FILES,
			title: localize2('ecosystemsAiAttachFiles', 'Attach Files or Folders to Altus AI Chat...'),
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const fileDialogService = accessor.get(IFileDialogService);
		const fileService = accessor.get(IFileService);
		const chatContext = accessor.get(IEcosystemsChatContextService);

		const uris = await fileDialogService.showOpenDialog({
			canSelectFiles: true,
			canSelectFolders: true,
			canSelectMany: true,
			openLabel: localize('ecosystemsAiAttachOpenLabel', 'Attach'),
		});
		if (!uris?.length) {
			return;
		}

		const attachments = [];
		for (const uri of uris) {
			try {
				const stat = await fileService.resolve(uri, { resolveMetadata: true });
				attachments.push(createChatAttachment({
					kind: stat.isDirectory ? 'folder' : 'file',
					label: basename(uri),
					uri,
				}));
			} catch {
				attachments.push(createChatAttachment({
					kind: 'file',
					label: uri.path,
					uri,
				}));
			}
		}

		await chatContext.revealChat();
		chatContext.addAttachments(attachments);
		chatContext.focusComposer();
	}
});

MenuRegistry.appendMenuItem(MenuId.TerminalInstanceContext, {
	group: '9_chat',
	order: 1,
	command: {
		id: ECOSYSTEMS_AI_COMMAND_ATTACH_TERMINAL,
		title: localize('ecosystemsAiAttachTerminalMenu', 'Add Selection to Altus AI Chat'),
	},
	when: TerminalContextKeys.textSelected,
});

registerAction2(class EcosystemsAiCopyAllChatAction extends Action2 {
	constructor() {
		super({
			id: ECOSYSTEMS_AI_COMMAND_COPY_ALL_CHAT,
			title: localize2('ecosystemsAiCopyAllChat', 'Altus AI: Copy All Chat'),
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = accessor.get(IViewsService);
		const clipboardService = accessor.get(IClipboardService);
		const notificationService = accessor.get(INotificationService);
		const view = viewsService.getActiveViewWithId(ECOSYSTEMS_AI_CHAT_VIEW_ID) as EcoSystemsChatViewPane | undefined;
		const text = view?.getChatTranscriptText().trim() ?? '';
		if (!text) {
			notificationService.info(localize('ecosystemsAiCopyAllEmpty', 'No chat messages to copy.'));
			return;
		}
		await clipboardService.writeText(text);
		notificationService.info(localize('ecosystemsAiCopyAllDone', 'Chat copied to clipboard.'));
	}
});
