/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface StackPlaybookDetect {
	readonly files?: readonly string[];
	readonly packageDeps?: readonly string[];
}

export interface StackPlaybookDevServer {
	readonly command: string;
	readonly background?: boolean;
}

export interface StackPlaybook {
	readonly id: string;
	readonly name: string;
	readonly aliases?: readonly string[];
	readonly detect?: StackPlaybookDetect;
	readonly scaffoldCommand: string;
	readonly postScaffold?: readonly string[];
	readonly devServer?: StackPlaybookDevServer;
	readonly forbiddenWhenExists?: readonly string[];
	readonly folderStructure?: string;
	readonly pitfalls?: readonly string[];
}

export interface StackPlaybooksFile {
	readonly version: number;
	readonly updated?: string;
	readonly stacks: readonly StackPlaybook[];
}
