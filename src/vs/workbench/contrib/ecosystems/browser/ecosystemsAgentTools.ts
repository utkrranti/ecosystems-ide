/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { DisposableStore, type IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { dirname, joinPath } from '../../../../base/common/resources.js';
import { ChatTool, ChatToolCall } from '../../../../platform/ecosystems/common/ecosystemsAiTypes.js';
import { AgentFileChangeRecord, IEcosystemsAgentFileChangeService } from './ecosystemsAgentFileChangeService.js';
import { IEcosystemsAgentActivityService } from './ecosystemsAgentActivityService.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService, IWorkspaceFolder } from '../../../../platform/workspace/common/workspace.js';
import { ITerminalService } from '../../terminal/browser/terminal.js';
import { GeneralShellType, PosixShellType, WindowsShellType, type TerminalShellType } from '../../../../platform/terminal/common/terminal.js';
import { isWindows } from '../../../../base/common/platform.js';
import {
	dismissBatchTerminatePrompt,
	isStuckOnBatchPrompt,
	stripTerminalAnsi,
} from './ecosystemsTerminalBatchDismiss.js';

export interface ToolExecutionResult {
	ok: boolean;
	summary: string;
	/** Human-readable string sent back to the model as the tool's output. */
	output: string;
	/** If the tool spawned a terminal, the id of that terminal instance (for revealing in UI). */
	terminalInstanceId?: number;
	/** Shell command when `run_in_terminal` was used. */
	terminalCommand?: string;
	/** True when the tool was aborted by the user via the stop button. */
	cancelled?: boolean;
	/** Set when `write_file` modified a workspace file (for chat diff UI). */
	fileChange?: AgentFileChangeRecord;
}

export const AGENT_TOOLS: ChatTool[] = [
	{
		name: 'copy_file',
		description: 'Copy a file within the workspace (required for mp3, images, and other binaries). Use when the user attached a file at the project root -- copy from that path into public/, src/assets/, etc., then reference the destination in code. Both from and to are required.',
		parameters: {
			type: 'object',
			properties: {
				from: { type: 'string', description: 'Required. Workspace-relative source, e.g. "notification.mp3" at project root.' },
				to: { type: 'string', description: 'Required. Destination, e.g. "public/sounds/notification.mp3".' },
				overwrite: { type: 'boolean', description: 'Overwrite if exists (default true).' },
			},
			required: ['from', 'to'],
		},
	},
	{
		name: 'write_file',
		description: 'Create or overwrite a UTF-8 text file. Requires both path and content. Pasted binaries (mp3, images, etc.) are already saved under `.ecosystems-attachments/` -- reference or copy that path; do not recreate binaries with write_file. Do NOT hand-write a full new project tree when an official scaffold CLI exists -- use run_in_terminal first.',
		parameters: {
			type: 'object',
			properties: {
				path: { type: 'string', description: 'Required. Workspace-relative file path. Multi-root: prefix with workspace folder name, e.g. "ide_test_apis/app/main.py".' },
				content: { type: 'string', description: 'Required. Full UTF-8 text content (source, HTML, JSON). Not for raw binary -- use staged attachment paths instead.' },
			},
			required: ['path', 'content'],
		},
	},
	{
		name: 'read_file',
		description: 'Read a UTF-8 text file from the current workspace. Returns the file contents (truncated to 64 KB).',
		parameters: {
			type: 'object',
			properties: {
				path: { type: 'string', description: 'Workspace-relative file path. Multi-root: use "FolderName/relative/path".' },
			},
			required: ['path'],
		},
	},
	{
		name: 'list_directory',
		description: 'List children of a directory in the workspace. Pass depth>1 to recurse. Multi-root workspaces: use "." to list every root folder, or prefix with a folder name (e.g. "ide_test_apis").',
		parameters: {
			type: 'object',
			properties: {
				path: { type: 'string', description: 'Directory path. Use "." for all workspace roots (multi-root) or one folder. Use "FolderName" or "FolderName/subdir".' },
				depth: { type: 'number', description: 'Recursion depth (1 = immediate children, default 1, max 3).' },
			},
			required: ['path'],
		},
	},
	{
		name: 'delete_file',
		description: 'Delete a file or directory (recursively) in the current workspace.',
		parameters: {
			type: 'object',
			properties: {
				path: { type: 'string', description: 'Workspace-relative path to delete.' },
			},
			required: ['path'],
		},
	},
	{
		name: 'read_terminal_output',
		description: 'Read the latest output from an Altus terminal (including dev servers still running). Use after `run_in_terminal` with isBackground=true, or when the user reports runtime/build errors, to see Vite/npm errors that appeared after the server started.',
		parameters: {
			type: 'object',
			properties: {
				maxLines: { type: 'number', description: 'How many trailing lines to return (default 120, max 500).' },
				terminalInstanceId: { type: 'number', description: 'Optional terminal id from a prior run_in_terminal result.' },
			},
		},
	},
	{
		name: 'run_in_terminal',
		description: 'Run a shell command in the integrated terminal. On Windows the default shell is PowerShell -- do NOT use bash `&&` (use `;` or separate tool calls). **Never re-run `npm run dev` if a dev server is already running** -- use write_file for CSS/JS (Vite HMR) and read_terminal_output to inspect errors. Only start the dev server once per session. Output is in `--- terminal output ---`.',
		parameters: {
			type: 'object',
			properties: {
				command: { type: 'string', description: 'The shell command line to execute.' },
				cwd: { type: 'string', description: 'Optional working directory: workspace-relative path, or a workspace folder name in multi-root workspaces (e.g. "ide_test_apis").' },
				explanation: { type: 'string', description: 'A short reason for running the command, shown to the user.' },
				isBackground: { type: 'boolean', description: 'True for long-running servers (npm run dev, node server.js). The tool returns once a readiness marker is detected or timeoutMs elapses, leaving the process running.' },
				timeoutMs: { type: 'number', description: 'Maximum milliseconds to wait. Default 30000 for normal commands, 20000 for background. Capped at 120000.' },
			},
			required: ['command'],
		},
	},
];

/**
 * Failures in captured terminal text -- used even when PowerShell reports exit 0
 * (e.g. try/catch with Write-Output in catch leaves $? true).
 */
const TERMINAL_ERROR_RE = new RegExp(
	[
		// Build / bundler
		'Pre-transform error', 'Failed to load PostCSS', 'PostCSS config', '@tailwindcss/postcss',
		'tailwindcss directly as a PostCSS plugin', '\\[plugin:vite:css\\]', 'error during build',
		'??? \\[ERROR\\]', 'Module not found', 'Cannot find module', 'module is not defined in ES module',
		// Package managers / runtimes
		'npm ERR!', 'pnpm ERR!', 'yarn ERR', 'ELIFECYCLE', 'Command failed',
		'Traceback \\(most recent call last\\)', 'Fatal error', 'FATAL:', 'AssertionError',
		// Network / HTTP checks (Invoke-WebRequest, curl, etc.)
		'Unable to connect to the remote server', 'Unable to connect', 'Connection refused',
		'ECONNREFUSED', 'EADDRNOTAVAIL', 'ETIMEDOUT', 'Connection timed out',
		'HttpRequestException', 'WebException', 'Could not connect', 'No connection could be made',
		// PowerShell / shell
		'ReferenceError:', 'SyntaxError:', 'ParserError:', 'CommandNotFoundException',
		'is not recognized as the name of a cmdlet', 'is not recognized as an internal or external command',
		'is not a valid statement separator', 'InvalidEndOfLine', 'Access is denied',
		// Explicit agent / script failure lines
		'^\\s*ERR:\\s', 'ERROR:', '\\[ERROR\\]', 'FAILED', 'FAILURE',
		'EADDRINUSE', 'ENOENT',
	].join('|'),
	'im',
);

/** Dev server actually ready (not just "VITE v" banner). */
const BACKGROUND_READY_RE = /(ready in \d+\s*ms|Local:\s*https?:\/\/|???\s*Local:|http:\/\/localhost:\d+|http:\/\/127\.0\.0\.1:\d+)/i;

/** Keep capturing after "ready" so Vite CSS/PostCSS errors are included. */
const BACKGROUND_POST_READY_SOAK_MS = 12_000;

const TERMINAL_BUFFER_MAX = 128 * 1024;

function normalizeTerminalSessionOutput(raw: string, sentinel?: string): string {
	const normalized = raw
		.split('\n')
		.map(seg => {
			const idx = seg.lastIndexOf('\r');
			return idx >= 0 ? seg.slice(idx + 1) : seg;
		})
		.join('\n');
	return normalized
		.split('\n')
		.filter(l => !sentinel || !l.includes(sentinel))
		.join('\n')
		.trim();
}

function terminalOutputHasErrors(text: string): boolean {
	return TERMINAL_ERROR_RE.test(text);
}

function isDevServerCommand(command: string): boolean {
	return /\b(npm|pnpm|yarn)\s+run\s+(dev|start|serve)\b/i.test(command)
		|| /\b(npx\s+)?vite(\s|$)/i.test(command)
		|| /\bnext\s+dev\b/i.test(command);
}

function isDevServerLikelyRunning(buffer: string): boolean {
	const tail = buffer.slice(-12_000);
	return BACKGROUND_READY_RE.test(tail) && !isStuckOnBatchPrompt(buffer.slice(-3000));
}

async function tryDismissBatchTerminate(
	instance: import('../../terminal/browser/terminal.js').ITerminalInstance,
	getBuffer: () => string,
): Promise<boolean> {
	return dismissBatchTerminatePrompt(instance, getBuffer);
}

async function interruptTerminalGracefully(
	instance: import('../../terminal/browser/terminal.js').ITerminalInstance,
	getBuffer: () => string,
	killProcess: boolean,
): Promise<void> {
	const buf = getBuffer();
	// Stuck on Y/N only -- never Ctrl+C a healthy dev server.
	if (isStuckOnBatchPrompt(buf)) {
		await tryDismissBatchTerminate(instance, getBuffer);
		if (!killProcess || isDevServerLikelyRunning(buf)) {
			return;
		}
	}
	if (!killProcess) {
		return;
	}
	try {
		await instance.sendText('\x03', false);
	} catch {
		// ignore
	}
	// npm.cmd often shows Y/N immediately -- answer before polling.
	await new Promise(r => setTimeout(r, 80));
	await tryDismissBatchTerminate(instance, getBuffer);
	for (let i = 0; i < 20; i++) {
		await new Promise(r => setTimeout(r, 100));
		if (!isStuckOnBatchPrompt(getBuffer())) {
			break;
		}
		await tryDismissBatchTerminate(instance, getBuffer);
	}
}

function dismissBatchTerminatePromptIfPresent(
	instance: import('../../terminal/browser/terminal.js').ITerminalInstance,
	getBuffer: () => string,
): void {
	if (isStuckOnBatchPrompt(getBuffer())) {
		void tryDismissBatchTerminate(instance, getBuffer);
	}
}

export class EcosystemsAgentTools {
	/**
	 * A single, reused integrated terminal for agent foreground commands.
	 * Background commands (servers) always get their own terminal so the long-lived
	 * process doesn't block subsequent foreground commands.
	 */
	private foregroundTerminal: import('../../terminal/browser/terminal.js').ITerminalInstance | undefined;
	/** Background terminals keyed by the original command string so re-running
	 *  `npm run dev` reuses the same terminal instead of spawning a new one. */
	private readonly backgroundTerminals = new Map<string, import('../../terminal/browser/terminal.js').ITerminalInstance>();
	/** Rolling PTY capture for agent terminals (survives after run_in_terminal returns). */
	private readonly terminalBuffers = new Map<number, { buffer: string; capture?: IDisposable }>();
	/** Dev server left running in a background Agent terminal (Vite HMR -- do not restart for CSS edits). */
	private activeDevServerInstanceId: number | undefined;

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@ITerminalService private readonly terminalService: ITerminalService,
		@IEcosystemsAgentFileChangeService private readonly fileChanges: IEcosystemsAgentFileChangeService,
		@IEcosystemsAgentActivityService private readonly activity: IEcosystemsAgentActivityService,
	) { }

	async execute(call: ChatToolCall, token: CancellationToken = CancellationToken.None): Promise<ToolExecutionResult> {
		try {
			switch (call.name) {
				case 'write_file': return await this.writeFile(call.args);
				case 'copy_file': return await this.copyFile(call.args);
				case 'read_file': return await this.readFile(call.args);
				case 'list_directory': return await this.listDirectory(call.args);
				case 'delete_file': return await this.deleteFile(call.args);
				case 'run_in_terminal': return await this.runInTerminal(call.args, token);
				case 'read_terminal_output': return await this.readTerminalOutput(call.args);
				default:
					return { ok: false, summary: `Unknown tool: ${call.name}`, output: `Error: unknown tool "${call.name}".` };
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return { ok: false, summary: `${call.name} failed`, output: `Error: ${message}` };
		}
	}

	private getWorkspaceFolders(): readonly IWorkspaceFolder[] {
		return this.workspaceService.getWorkspace().folders;
	}

	private workspaceFolderNames(): string {
		return this.getWorkspaceFolders().map(f => f.name).join(', ');
	}

	private findWorkspaceFolderByName(name: string): IWorkspaceFolder | undefined {
		const norm = name.toLowerCase();
		return this.getWorkspaceFolders().find(f => f.name === name || f.name.toLowerCase() === norm);
	}

	private normalizeRelativePath(rel: string): string {
		return (rel ?? '').replace(/^[/\\]+/, '').trim();
	}

	private resolvePath(rel: string): URI {
		const folders = this.getWorkspaceFolders();
		if (folders.length === 0) {
			throw new Error('No workspace folder open. Open a folder (File -> Open Folder...) before running agent tools.');
		}
		const clean = this.normalizeRelativePath(rel);
		if (!clean || clean === '.' || clean === './') {
			if (folders.length === 1) {
				return folders[0].uri;
			}
			throw new Error(`Multi-root workspace (${this.workspaceFolderNames()}): use list_directory with path "." to see all roots, or prefix paths with a folder name.`);
		}
		if (clean.includes('..')) {
			throw new Error(`Refusing to access path outside the workspace: ${rel}`);
		}
		const segments = clean.split(/[\\/]/).filter(Boolean);
		if (folders.length > 1) {
			const folder = this.findWorkspaceFolderByName(segments[0]);
			if (folder) {
				const rest = segments.slice(1);
				return rest.length ? joinPath(folder.uri, ...rest) : folder.uri;
			}
		}
		return joinPath(folders[0].uri, ...segments);
	}

	private async writeFile(args: Record<string, unknown>): Promise<ToolExecutionResult> {
		const path = String(args.path ?? '');
		const content = String(args.content ?? '');
		if (!path) {
			return {
				ok: false,
				summary: 'write_file missing path',
				output: 'Error: "path" is required. For .mp3/images use copy_file(from, to) -- see <attached_context> Workspace path. Never call write_file without path.',
			};
		}
		const uri = this.resolvePath(path);
		let beforeContent: string | undefined;
		try {
			if (await this.fileService.exists(uri)) {
				beforeContent = (await this.fileService.readFile(uri)).value.toString();
			}
		} catch {
			beforeContent = undefined;
		}
		await this.fileService.createFile(uri, VSBuffer.fromString(content), { overwrite: true });
		const fileChange = this.fileChanges.recordWrite(uri, path, beforeContent, content);
		return {
			ok: true,
			summary: `Wrote ${path} (+${fileChange.linesAdded} -${fileChange.linesRemoved})`,
			output: `OK. Wrote ${path} (+${fileChange.linesAdded} -${fileChange.linesRemoved} lines).`,
			fileChange,
		};
	}

	private async copyFile(args: Record<string, unknown>): Promise<ToolExecutionResult> {
		const from = String(args.from ?? args.source ?? '').trim();
		const to = String(args.to ?? args.dest ?? args.destination ?? '').trim();
		if (!from) {
			return { ok: false, summary: 'copy_file missing from', output: 'Error: "from" is required (workspace-relative source path).' };
		}
		if (!to) {
			return { ok: false, summary: 'copy_file missing to', output: 'Error: "to" is required (workspace-relative destination path, e.g. public/sounds/file.mp3).' };
		}
		const sourceUri = this.resolvePath(from);
		const targetUri = this.resolvePath(to);
		if (!(await this.fileService.exists(sourceUri))) {
			return { ok: false, summary: 'copy_file source missing', output: `Error: source not found: ${from}` };
		}
		await this.fileService.createFolder(dirname(targetUri)).catch(() => undefined);
		const overwrite = args.overwrite !== false;
		await this.fileService.copy(sourceUri, targetUri, overwrite);
		return {
			ok: true,
			summary: `Copied ${from} -> ${to}`,
			output: `OK. Copied ${from} to ${to}. Reference "${to}" in app code (import, src=, or new Audio()).`,
		};
	}

	private async readFile(args: Record<string, unknown>): Promise<ToolExecutionResult> {
		const path = String(args.path ?? '');
		if (!path) {
			return { ok: false, summary: 'read_file missing path', output: 'Error: "path" is required.' };
		}
		const uri = this.resolvePath(path);
		const content = await this.fileService.readFile(uri);
		const text = content.value.toString();
		const truncated = text.length > 64 * 1024 ? text.slice(0, 64 * 1024) + '\n...[truncated]' : text;
		return { ok: true, summary: `Read ${path}`, output: truncated };
	}

	private async listDirectory(args: Record<string, unknown>): Promise<ToolExecutionResult> {
		const path = String(args.path ?? '.');
		const rawDepth = Number(args.depth ?? 1);
		const depth = Math.max(1, Math.min(3, Number.isFinite(rawDepth) ? Math.floor(rawDepth) : 1));
		const clean = this.normalizeRelativePath(path);
		const folders = this.getWorkspaceFolders();
		const lines: string[] = [];

		if (folders.length > 1 && (!clean || clean === '.')) {
			lines.push(`Workspace roots (${folders.length}): ${this.workspaceFolderNames()}`);
			for (const folder of folders) {
				lines.push(`# ${folder.name}/`);
				const before = lines.length;
				await this.collectTree(folder.uri, '  ', depth, lines);
				if (lines.length === before) {
					lines.push('  (empty)');
				}
			}
			return {
				ok: true,
				summary: `Listed all workspace roots (${folders.length} folders, ${lines.length} lines, depth ${depth})`,
				output: lines.join('\n'),
			};
		}

		const uri = this.resolvePath(path);
		await this.collectTree(uri, '', depth, lines);
		return {
			ok: true,
			summary: `Listed ${path || '.'} (${lines.length} entries${depth > 1 ? `, depth ${depth}` : ''})`,
			output: lines.join('\n') || '(empty)',
		};
	}

	private async collectTree(uri: URI, prefix: string, depth: number, out: string[]): Promise<void> {
		const stat = await this.fileService.resolve(uri);
		const children = (stat.children ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
		for (const child of children) {
			if (child.name === 'node_modules' || child.name === '.git') {
				continue;
			}
			const line = `${prefix}${child.isDirectory ? 'd' : 'f'} ${child.name}`;
			out.push(line);
			if (child.isDirectory && depth > 1 && out.length < 400) {
				await this.collectTree(child.resource, prefix + '  ', depth - 1, out);
			}
		}
	}

	private async deleteFile(args: Record<string, unknown>): Promise<ToolExecutionResult> {
		const path = String(args.path ?? '');
		if (!path) {
			return { ok: false, summary: 'delete_file missing path', output: 'Error: "path" is required.' };
		}
		const uri = this.resolvePath(path);
		await this.fileService.del(uri, { recursive: true, useTrash: false });
		return { ok: true, summary: `Deleted ${path}`, output: `OK. Deleted ${path}.` };
	}

	private async runInTerminal(args: Record<string, unknown>, token: CancellationToken): Promise<ToolExecutionResult> {
		const command = String(args.command ?? '').trim();
		if (!command) {
			return { ok: false, summary: 'run_in_terminal missing command', output: 'Error: "command" is required.' };
		}
		const isBackground = Boolean(args.isBackground);
		// Heuristic: package installs and builds take much longer than a generic command.
		const isHeavy = /\b(npm|pnpm|yarn|bun)\s+(i|install|ci|add|create|exec|run\s+build)\b/i.test(command)
			|| /\bnpx\s+create-/i.test(command)
			|| /\bpip\s+install\b/i.test(command)
			|| /\bcargo\s+(build|install|run)\b/i.test(command);
		const rawTimeout = Number(args.timeoutMs);
		// Background dev servers (vite/next/etc.) can take several minutes on a
		// cold workspace. Keep watching by default for up to 10 minutes.
		const defaultMs = isBackground ? 600_000 : (isHeavy ? 600_000 : 60_000);
		const timeoutMs = Math.min(600_000, Math.max(2_000,
			Number.isFinite(rawTimeout) && rawTimeout > 0 ? Math.floor(rawTimeout) : defaultMs
		));

		const folders = this.getWorkspaceFolders();
		const cwdArg = String(args.cwd ?? args.workingDirectory ?? '').trim();
		let cwd: URI | undefined;
		if (cwdArg) {
			cwd = this.resolvePath(cwdArg);
		} else if (folders.length > 0) {
			cwd = folders[0].uri;
		}

		// Reuse terminals aggressively to avoid spawning a new tab per call:
		//  • Foreground: one shared "Altus" terminal.
		//  • Background: keyed by the command string so re-running `npm run dev`
		//    lands in the SAME terminal as last time (the previous instance is
		//    cancelled with Ctrl+C first).
		let instance: import('../../terminal/browser/terminal.js').ITerminalInstance;
		if (isBackground) {
			// One background tab for all dev-server commands (avoid restart on repeated npm run dev).
			const key = isDevServerCommand(command) ? '__ecosystems_dev_server__' : command;
			const existing = this.backgroundTerminals.get(key);
			if (existing && !existing.isDisposed) {
				instance = existing;
				this.attachTerminalBuffer(instance);
				const getBuf = () => this.terminalBuffers.get(instance.instanceId)?.buffer ?? '';
				await tryDismissBatchTerminate(instance, getBuf);

				// Do NOT stop a running Vite/Next dev server when the agent calls npm run dev again.
				if (isDevServerCommand(command) && isDevServerLikelyRunning(getBuf())) {
					const latest = normalizeTerminalSessionOutput(getBuf());
					const cap = 32 * 1024;
					const tail = latest.length > cap ? '...\n' + latest.slice(-cap) : latest;
					return {
						ok: true,
						summary: 'Dev server already running (not restarted)',
						output: 'Dev server is already running in the Agent terminal. Do not stop it -- Vite hot-reloads CSS/JS when you use write_file. Use read_terminal_output if you need fresh logs.\n\n--- terminal output (latest) ---\n' + (tail || '(no output yet)'),
						terminalInstanceId: instance.instanceId,
						terminalCommand: command,
					};
				}

				await interruptTerminalGracefully(instance, getBuf, true);
			} else {
				instance = await this.terminalService.createTerminal({
					config: { name: `Altus · ${command.slice(0, 40)}`, cwd },
				});
				this.backgroundTerminals.set(key, instance);
			}
		} else if (this.foregroundTerminal && !this.foregroundTerminal.isDisposed) {
			instance = this.foregroundTerminal;
		} else {
			instance = await this.terminalService.createTerminal({
				config: { name: 'Altus', cwd },
			});
			this.foregroundTerminal = instance;
		}
		await this.terminalService.setActiveInstance(instance);
		this.activity.registerTerminalStart(instance.instanceId, command);
		this.attachTerminalBuffer(instance);
		const bufEntry = this.terminalBuffers.get(instance.instanceId)!;
		const bufferStart = bufEntry.buffer.length;

		try { await this.terminalService.revealActiveTerminal(true); } catch { /* ignore */ }
		try { await Promise.race([instance.processReady, new Promise(r => setTimeout(r, 5000))]); } catch { /* ignore */ }

		const store = new DisposableStore();
		const MAX_BYTES = 32 * 1024;

		// Build the actual command line with a sentinel marker so we can detect completion
		// of a single command inside a long-lived shell (where onExit only fires when the
		// shell itself dies). For background processes we don't append a sentinel -- they
		// never finish, and we detect readiness via stdout markers instead.
		const sentinel = `__ECOAGENT_${Math.random().toString(36).slice(2, 10).toUpperCase()}__`;
		// Require at least one digit -- the echoed command line contains
		// `..._EXIT_$__eco` before the variable expands, which would false-match `(-?\d*)`.
		const sentinelRe = new RegExp(`(?:^|\\n)${sentinel}_EXIT_(-?\\d+)(?:\\s|$)`);
		const shell = instance.shellType;
		const adaptedCommand = wrapNpmForWindows(adaptCommandForShell(command, shell), shell);
		const wrapped = isBackground ? adaptedCommand : buildWrappedCommand(adaptedCommand, sentinel, shell);

		const result = await new Promise<{ exitCode?: number; reason: 'exit' | 'ready' | 'timeout' | 'error' | 'cancelled' }>((resolve) => {
			let settled = false;
			let postReadyTimer: ReturnType<typeof setTimeout> | undefined;
			const DETECT_MAX = 16 * 1024;
			const sessionSlice = () => bufEntry.buffer.slice(bufferStart);
			const finish = (r: { exitCode?: number; reason: 'exit' | 'ready' | 'timeout' | 'error' | 'cancelled' }) => {
				if (settled) { return; }
				settled = true;
				if (postReadyTimer) {
					clearTimeout(postReadyTimer);
				}
				resolve(r);
			};

			const scheduleBackgroundReady = () => {
				if (postReadyTimer) {
					return;
				}
				postReadyTimer = setTimeout(() => {
					const text = sessionSlice();
					if (terminalOutputHasErrors(text)) {
						finish({ exitCode: 1, reason: 'error' });
					} else {
						finish({ reason: 'ready' });
					}
				}, BACKGROUND_POST_READY_SOAK_MS);
			};

			const checkSession = () => {
				const detectBuf = sessionSlice();
				const tail = detectBuf.length > DETECT_MAX ? detectBuf.slice(-DETECT_MAX) : detectBuf;

				dismissBatchTerminatePromptIfPresent(instance, () => bufEntry.buffer);

				if (terminalOutputHasErrors(tail)) {
					finish({ exitCode: 1, reason: 'error' });
					return;
				}

				if (!isBackground) {
					const m = sentinelRe.exec(tail);
					if (m) {
						const code = Number(m[1]);
						if (code === 0 && terminalOutputHasErrors(tail)) {
							finish({ exitCode: 1, reason: 'error' });
						} else {
							finish({ exitCode: code, reason: 'exit' });
						}
						return;
					}
					if (/ParserError:|is not a valid statement separator|InvalidEndOfLine/i.test(tail)) {
						finish({ exitCode: 1, reason: 'exit' });
						return;
					}
				} else if (BACKGROUND_READY_RE.test(tail)) {
					scheduleBackgroundReady();
				}
			};

			store.add(instance.onWillData(() => {
				checkSession();
			}));

			store.add(instance.onLineData(() => {
				checkSession();
			}));
			// onExit only fires if the shell itself dies; treat that as command exit too.
			store.add(instance.onExit((code) => {
				const exitCode = typeof code === 'number' ? code : (code && typeof code === 'object' && 'message' in code ? -1 : 0);
				finish({ exitCode, reason: 'exit' });
			}));

			// User clicked Stop: send Ctrl+C and resolve so the agent loop unblocks.
			// We deliberately leave the terminal open so the user can inspect output.
			if (token.isCancellationRequested) {
				void interruptTerminalGracefully(instance, () => bufEntry.buffer, true).then(() => finish({ reason: 'cancelled' }));
			} else {
				store.add(token.onCancellationRequested(() => {
					void interruptTerminalGracefully(instance, () => bufEntry.buffer, true).then(() => finish({ reason: 'cancelled' }));
				}));
			}

			const timer = setTimeout(() => finish({ reason: 'timeout' }), timeoutMs);
			store.add({ dispose: () => clearTimeout(timer) });

			instance.sendText(wrapped, true);
		});

		store.dispose();

		const sessionText = bufEntry.buffer.slice(bufferStart);
		const output = normalizeTerminalSessionOutput(sessionText, isBackground ? undefined : sentinel);
		const truncated = output.length > MAX_BYTES ? '...[earlier output truncated]\n' + output.slice(-MAX_BYTES) : output;
		const hasErrors = terminalOutputHasErrors(truncated);
		const falseSuccessExit = result.reason === 'exit' && result.exitCode === 0 && hasErrors;
		const headline = (() => {
			switch (result.reason) {
				case 'exit':
					if (falseSuccessExit) {
						return `Command reported exit 0 but terminal output shows failure -- trust the output below, not the exit code.`;
					}
					return result.exitCode === 0
						? `Command exited 0 (success).`
						: `Command exited with code ${result.exitCode}.`;
				case 'ready': return hasErrors
					? `Dev server started but the terminal shows errors (see output). Fix before continuing.`
					: `Background process is running (waited ${BACKGROUND_POST_READY_SOAK_MS / 1000}s after ready). Call read_terminal_output again if the user reports issues.`;
				case 'error': return `Terminal output shows errors (build/runtime failure).`;
				case 'timeout': return isBackground
					? `Background process still running after ${timeoutMs}ms. Output so far below -- use read_terminal_output for updates.`
					: `Command timed out after ${timeoutMs}ms.`;
				case 'cancelled': return `Cancelled by user (Ctrl+C sent to terminal). The command may be incomplete -- use list_directory/read_file before re-running scaffolds.`;
				default: return `Command finished.`;
			}
		})();
		const ok = !hasErrors && (
			result.reason === 'ready'
			|| (result.reason === 'exit' && result.exitCode === 0)
			|| (result.reason === 'timeout' && isBackground)
		);
		this.activity.completeTerminalRun(instance.instanceId, ok);
		if (ok && isBackground && isDevServerCommand(command)) {
			this.activeDevServerInstanceId = instance.instanceId;
		}
		const shellLabel = describeShellType(shell);
		const adaptNote = adaptedCommand !== command
			? `Note: command was adapted for ${shellLabel} (\`&&\` chains run via cmd.exe on Windows PowerShell).\n`
			: '';
		return {
			ok,
			cancelled: result.reason === 'cancelled',
			summary: `${ok ? '' : (result.reason === 'cancelled' ? '??? ' : '⚠ ')}${command.length > 60 ? command.slice(0, 60) + '...' : command}`,
			output: `${headline}\nShell: ${shellLabel}\n${adaptNote}\n--- terminal output ---\n${truncated || '(no output captured)'}`,
			terminalInstanceId: instance.instanceId,
			terminalCommand: command,
		};
	}

	/**
	 * Build a compact snapshot of the workspace tree for inclusion in the system prompt.
	 * Skips node_modules/.git, caps lines, and clamps depth.
	 */
	/** Shown in the agent system prompt so the model uses correct shell syntax. */
	getTerminalGuidance(): string {
		return getAgentTerminalGuidance();
	}

	private attachTerminalBuffer(instance: import('../../terminal/browser/terminal.js').ITerminalInstance): void {
		const id = instance.instanceId;
		if (this.terminalBuffers.has(id)) {
			return;
		}
		const entry: { buffer: string; capture?: IDisposable; lastBatchDismissMs: number } = { buffer: '', lastBatchDismissMs: 0 };
		this.terminalBuffers.set(id, entry);
		entry.capture = instance.onWillData((data) => {
			const clean = stripTerminalAnsi(data);
			if (!clean) {
				return;
			}
			entry.buffer += clean;
			if (entry.buffer.length > TERMINAL_BUFFER_MAX) {
				entry.buffer = entry.buffer.slice(-TERMINAL_BUFFER_MAX);
			}
			if (isStuckOnBatchPrompt(entry.buffer) && Date.now() - entry.lastBatchDismissMs > 400) {
				entry.lastBatchDismissMs = Date.now();
				void tryDismissBatchTerminate(instance, () => entry.buffer);
			}
		});
		instance.onDisposed(() => {
			entry.capture?.dispose();
			this.terminalBuffers.delete(id);
		});
	}

	private async readTerminalOutput(args: Record<string, unknown>): Promise<ToolExecutionResult> {
		const maxLines = Math.min(500, Math.max(10, Number.isFinite(Number(args.maxLines)) ? Math.floor(Number(args.maxLines)) : 120));
		const instances: import('../../terminal/browser/terminal.js').ITerminalInstance[] = [];
		if (this.activeDevServerInstanceId !== undefined) {
			const dev = this.terminalService.getInstanceFromId(this.activeDevServerInstanceId);
			if (dev && !dev.isDisposed) {
				instances.push(dev);
			}
		}
		if (this.foregroundTerminal && !this.foregroundTerminal.isDisposed) {
			instances.push(this.foregroundTerminal);
		}
		for (const t of this.backgroundTerminals.values()) {
			if (!t.isDisposed) {
				instances.push(t);
			}
		}
		if (instances.length === 0) {
			return {
				ok: false,
				summary: 'No agent terminal',
				output: 'No Altus terminal is open. Run a command with run_in_terminal first.',
			};
		}
		let instance = instances[instances.length - 1];
		const wantedId = Number(args.terminalInstanceId);
		if (Number.isFinite(wantedId)) {
			instance = instances.find(i => i.instanceId === wantedId) ?? instance;
		}
		this.attachTerminalBuffer(instance);
		await tryDismissBatchTerminate(instance, () => this.terminalBuffers.get(instance.instanceId)?.buffer ?? '');
		const raw = this.terminalBuffers.get(instance.instanceId)?.buffer ?? '';
		const normalized = normalizeTerminalSessionOutput(raw);
		const lines = normalized.split('\n');
		const tail = lines.slice(-maxLines).join('\n');
		const hasErrors = terminalOutputHasErrors(normalized);
		return {
			ok: !hasErrors,
			summary: hasErrors ? 'Terminal shows errors' : `Read terminal (${Math.min(maxLines, lines.length)} lines)`,
			output: `${hasErrors ? 'Errors detected in terminal output.\n' : ''}--- terminal output (latest) ---\n${tail || '(empty -- wait a moment and try again)'}`,
			terminalInstanceId: instance.instanceId,
		};
	}

	async snapshotWorkspaceTree(maxEntries = 200, depth = 3): Promise<string> {
		const folders = this.getWorkspaceFolders();
		if (folders.length === 0) {
			return '(no workspace folder open)';
		}
		const lines: string[] = [];
		if (folders.length > 1) {
			lines.push(`Multi-root workspace -- folder names: ${this.workspaceFolderNames()}`);
			lines.push('Prefix tool paths with a folder name, e.g. ide_test_apis/app/main.py');
		}
		const treeDepth = Math.max(1, Math.min(4, depth));
		try {
			for (const folder of folders) {
				lines.push(`${folder.name}/`);
				await this.collectTree(folder.uri, '  ', treeDepth, lines);
			}
		} catch {
			return '(failed to read workspace)';
		}
		if (lines.length > maxEntries) {
			return lines.slice(0, maxEntries).join('\n') + `\n... (${lines.length - maxEntries} more entries truncated)`;
		}
		return lines.join('\n');
	}
}

export function getAgentTerminalGuidance(): string {
	const readNote = 'After `run_in_terminal` with isBackground=true (dev server), always call `read_terminal_output` before claiming the app works -- Vite/PostCSS errors often appear seconds after "ready".';
	if (!isWindows) {
		return `**Integrated terminal:** bash-compatible -- \`&&\` and \`;\` work for chaining. ${readNote}`;
	}
	return '**Integrated terminal:** Windows PowerShell. Do NOT use bash `&&` -- use `;` or separate `run_in_terminal` calls. ' +
		'Never restart `npm run dev` while the server is running -- edit files for HMR. The IDE auto-answers "Terminate batch job (Y/N)?". ' +
		'Always read the full `--- terminal output ---` block -- do not trust "exit 0" if the output shows ERR:, exceptions, or connection failures. ' + readNote;
}

/** Run npm/pnpm/yarn via cmd.exe on PowerShell so Ctrl+C + batch cleanup behave predictably. */
export function wrapNpmForWindows(command: string, shell: TerminalShellType | undefined): string {
	if (!isWindows || /^\s*cmd\s+\/c\s/i.test(command)) {
		return command;
	}
	switch (shell) {
		case PosixShellType.Bash:
		case PosixShellType.Zsh:
		case PosixShellType.Sh:
		case PosixShellType.Ksh:
		case WindowsShellType.GitBash:
		case WindowsShellType.Wsl:
			return command;
		default:
			if (/^\s*(npm|pnpm|yarn|npx)\s/i.test(command)) {
				return `cmd /c "${command.replace(/"/g, '""')}"`;
			}
			return command;
	}
}

/** Bash-style `&&` is invalid in Windows PowerShell 5.x; route those chains through cmd.exe. */
export function adaptCommandForShell(command: string, shell: TerminalShellType | undefined): string {
	const trimmed = command.trim();
	if (!trimmed.includes('&&')) {
		return trimmed;
	}
	switch (shell) {
		case PosixShellType.Bash:
		case PosixShellType.Zsh:
		case PosixShellType.Sh:
		case PosixShellType.Ksh:
		case WindowsShellType.GitBash:
		case WindowsShellType.Wsl:
		case WindowsShellType.CommandPrompt:
			return trimmed;
		default:
			if (isWindows) {
				const escaped = trimmed.replace(/"/g, '""');
				return `cmd /c "${escaped}"`;
			}
			return trimmed;
	}
}

function describeShellType(shell: TerminalShellType | undefined): string {
	switch (shell) {
		case WindowsShellType.CommandPrompt: return 'Command Prompt (cmd.exe)';
		case WindowsShellType.GitBash: return 'Git Bash';
		case WindowsShellType.Wsl: return 'WSL';
		case PosixShellType.Bash: return 'bash';
		case PosixShellType.Zsh: return 'zsh';
		case PosixShellType.Sh: return 'sh';
		case PosixShellType.Ksh: return 'ksh';
		case GeneralShellType.PowerShell: return 'PowerShell';
		default:
			return isWindows ? 'PowerShell (detected)' : 'POSIX shell';
	}
}

/** Wrap a command so we can detect exit code via a unique sentinel line in captured output. */
function buildWrappedCommand(command: string, sentinel: string, shell: TerminalShellType | undefined): string {
	const marker = `${sentinel}_EXIT_`;
	// PowerShell: prefer $LASTEXITCODE after native exes. $? alone is wrong when the
	// script uses try/catch and Write-Output in catch (still "success"). We also scan
	// captured output for ERR:/Unable to connect/etc. and override exit 0 there.
	const pwshSnippet = `${command}; $__eco = if ($null -ne $LASTEXITCODE) { $LASTEXITCODE } elseif (-not $?) { 1 } else { 0 }; Write-Output "${marker}$__eco"`;
	switch (shell) {
		case WindowsShellType.CommandPrompt:
			return `${command} & echo ${marker}%ERRORLEVEL%`;
		case PosixShellType.Bash:
		case PosixShellType.Zsh:
		case PosixShellType.Sh:
		case PosixShellType.Ksh:
		case WindowsShellType.GitBash:
		case WindowsShellType.Wsl:
			return `${command}; ec=$?; printf '%s\\n' "${marker}$ec"`;
		case GeneralShellType.PowerShell:
			return pwshSnippet;
		default:
			if (isWindows) {
				return pwshSnippet;
			}
			return `${command}; ec=$?; printf '%s\\n' "${marker}$ec"`;
	}
}
