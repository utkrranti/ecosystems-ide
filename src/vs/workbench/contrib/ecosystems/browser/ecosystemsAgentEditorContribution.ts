/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/ecosystemsAgentDiff.css';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { EditorContributionInstantiation, registerEditorContribution } from '../../../../editor/browser/editorExtensions.js';
import { IModelDeltaDecoration } from '../../../../editor/common/model.js';
import { ModelDecorationOptions } from '../../../../editor/common/model/textModel.js';
import { IEditorContribution } from '../../../../editor/common/editorCommon.js';
import { IEcosystemsAgentFileChangeService } from './ecosystemsAgentFileChangeService.js';

const addedLineDecoration = ModelDecorationOptions.register({
	description: 'ecosystems-agent-line-added',
	isWholeLine: true,
	className: 'ecosystems-agent-line-added',
});

const modifiedLineDecoration = ModelDecorationOptions.register({
	description: 'ecosystems-agent-line-modified',
	isWholeLine: true,
	className: 'ecosystems-agent-line-modified',
});

export class EcosystemsAgentEditorContribution extends Disposable implements IEditorContribution {
	static readonly ID = 'editor.contrib.ecosystemsAgentDiff';

	private decorationIds: string[] = [];

	constructor(
		editor: ICodeEditor,
		@IEcosystemsAgentFileChangeService private readonly fileChanges: IEcosystemsAgentFileChangeService,
	) {
		super();
		this._register(fileChanges.onDidChange(() => this.applyDecorations(editor)));
		this._register(editor.onDidChangeModel(() => this.applyDecorations(editor)));
		this._register(editor.onDidChangeModelContent(() => this.applyDecorations(editor)));
		this.applyDecorations(editor);
	}

	private applyDecorations(editor: ICodeEditor): void {
		const model = editor.getModel();
		if (!model) {
			this.decorationIds = editor.deltaDecorations(this.decorationIds, []);
			return;
		}

		const change = this.fileChanges.getChange(model.uri);
		if (!change?.decorations.length) {
			this.decorationIds = editor.deltaDecorations(this.decorationIds, []);
			return;
		}

		const decorations: IModelDeltaDecoration[] = change.decorations.map(d => ({
			range: {
				startLineNumber: d.line,
				startColumn: 1,
				endLineNumber: d.line,
				endColumn: model.getLineMaxColumn(d.line),
			},
			options: d.kind === 'added' ? addedLineDecoration : modifiedLineDecoration,
		}));

		this.decorationIds = editor.deltaDecorations(this.decorationIds, decorations);
	}
}

registerEditorContribution(
	EcosystemsAgentEditorContribution.ID,
	EcosystemsAgentEditorContribution,
	EditorContributionInstantiation.AfterFirstRender,
);
