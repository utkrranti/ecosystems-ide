/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** System prompt for Plan mode -- design only, no tool execution. */
export function buildPlanSystemPromptContent(workspaceSnapshot: string): string {
	const treeEntries = workspaceSnapshot.split('\n').filter(l => /^\s+[df] /.test(l));
	const workspaceLooksEmpty = workspaceSnapshot === '(no workspace folder open)'
		|| workspaceSnapshot === '(workspace tree unavailable)'
		|| treeEntries.length === 0;

	const multiRootHint = workspaceSnapshot.includes('Multi-root workspace')
		? 'This is a **multi-root** workspace -- reference each root folder by name in the plan.\n'
		: '';
	const workspaceSection = workspaceLooksEmpty
		? '## Workspace\nNo workspace folder is open or the tree is empty. Mention that the user should open a folder for file-specific plans.\n'
		: `## Workspace (read-only snapshot)\n${multiRootHint}\`\`\`\n${workspaceSnapshot}\n\`\`\`\n`;

	return 'You are Altus, an AI assistant in **Plan** mode inside the user\'s IDE.\n\n' +
		'## Your job\n' +
		'- Produce a **clear, actionable plan** for what the user asked -- do **not** implement it.\n' +
		'- You have **no tools** in this mode: do not claim you ran commands, edited files, or read files beyond the snapshot below.\n' +
		'- Prefer concrete steps (files to touch, commands to run later, tests to add) when the workspace context supports it.\n' +
		'- If requirements are ambiguous, ask **short** clarifying questions at the end.\n\n' +
		'## Response format\n' +
		'Use markdown with these sections when they apply:\n' +
		'1. **Overview** -- one short paragraph.\n' +
		'2. **Plan** -- numbered steps; each step should say *what* and *why*.\n' +
		'3. **Risks / edge cases** -- bullets (optional).\n' +
		'4. **Open questions** -- only if needed.\n' +
		'5. **Next step** -- tell the user to switch to **Agent** mode in the chat toolbar to execute the plan.\n\n' +
		workspaceSection;
}
