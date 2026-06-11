/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const token = 'dev-local-token';
const tools = [{
	type: 'function',
	function: {
		name: 'list_directory',
		description: 'List directory',
		parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
	},
}];

async function test(model) {
	const r = await fetch('http://localhost:8787/v1/ai/chat/completions', {
		method: 'POST',
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model,
			messages: [{ role: 'user', content: 'apply dark theme - list project root' }],
			max_tokens: 2048,
			stream: false,
			tools,
			tool_choice: 'auto',
		}),
	});
	const body = await r.text();
	console.log(`\n${model}: HTTP ${r.status}`);
	console.log('  tool_calls:', body.includes('tool_calls'));
	console.log('  error:', body.includes('"error"'));
	console.log('  preview:', body.slice(0, 320));
}

for (const model of ['claude-opus-4-8', 'claude-sonnet-4-6', 'gpt-4o-mini']) {
	await test(model);
}
