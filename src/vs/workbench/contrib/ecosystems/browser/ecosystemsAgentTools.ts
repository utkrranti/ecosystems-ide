/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { joinPath } from '../../../../base/common/resources.js';
import { ChatTool, ChatToolCall } from '../../../../platform/ecosystems/common/ecosystemsAiTypes.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ITerminalService } from '../../terminal/browser/terminal.js';
import { GeneralShellType, PosixShellType, WindowsShellType, type TerminalShellType } from '../../../../platform/terminal/common/terminal.js';
import { isWindows } from '../../../../base/common/platform.js';

export interface ToolExecutionResult {
	ok: boolean;
	summary: string;
	/** Human-readable string sent back to the model as the tool's output. */
	output: string;
	/** If the tool spawned a terminal, the id of that terminal instance (for revealing in UI). */
	terminalInstanceId?: number;
	/** True when the tool was aborted by the user via the stop button. */
	cancelled?: boolean;
}

export const AGENT_TOOLS: ChatTool[] = [
	{
		name: 'write_file',
		description: 'Create or overwrite a file in the current workspace with the given UTF-8 text content. Use forward slashes; paths are resolved relative to the workspace root.',
		parameters: {
			type: 'object',
			properties: {
				path: { type: 'string', description: 'Workspace-relative file path, e.g. "src/index.html".' },
				content: { type: 'string', description: 'Full UTF-8 text content to write.' },
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
				path: { type: 'string', description: 'Workspace-relative file path.' },
			},
			required: ['path'],
		},
	},
	{
		name: 'list_directory',
		description: 'List children of a directory in the current workspace. Pass depth>1 to recurse.',
		parameters: {
			type: 'object',
			properties: {
				path: { type: 'string', description: 'Workspace-relative directory path. Use "." or "" for the workspace root.' },
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
		name: 'run_in_terminal',
		description: 'Run a shell command in the integrated terminal of the workspace (e.g. `npm install`, `npx create-next-app .`, `npm run dev`). Output IS captured and returned. For long-running servers (dev/start), pass isBackground=true and the tool returns as soon as the server prints a "ready"/"listening"/"localhost" line (or after timeoutMs).',
		parameters: {
			type: 'object',
			properties: {
				command: { type: 'string', description: 'The shell command line to execute.' },
				explanation: { type: 'string', description: 'A short reason for running the command, shown to the user.' },
				isBackground: { type: 'boolean', description: 'True for long-running servers (npm run dev, node server.js). The tool returns once a readiness marker is detected or timeoutMs elapses, leaving the process running.' },
				timeoutMs: { type: 'number', description: 'Maximum milliseconds to wait. Default 30000 for normal commands, 20000 for background. Capped at 120000.' },
			},
			required: ['command'],
		},
	},
];

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

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@ITerminalService private readonly terminalService: ITerminalService,
	) { }

	async execute(call: ChatToolCall, token: CancellationToken = CancellationToken.None): Promise<ToolExecutionResult> {
		try {
			switch (call.name) {
				case 'write_file': return await this.writeFile(call.args);
				case 'read_file': return await this.readFile(call.args);
				case 'list_directory': return await this.listDirectory(call.args);
				case 'delete_file': return await this.deleteFile(call.args);
				case 'run_in_terminal': return await this.runInTerminal(call.args, token);
				default:
					return { ok: false, summary: `Unknown tool: ${call.name}`, output: `Error: unknown tool "${call.name}".` };
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return { ok: false, summary: `${call.name} failed`, output: `Error: ${message}` };
		}
	}

	private resolvePath(rel: string): URI {
		const folders = this.workspaceService.getWorkspace().folders;
		if (folders.length === 0) {
			throw new Error('No workspace folder open. Open a folder (File → Open Folder…) before running agent tools.');
		}
		const root = folders[0].uri;
		const clean = (rel ?? '').replace(/^[/\\]+/, '').trim();
		if (!clean || clean === '.' || clean === './') {
			return root;
		}
		if (clean.includes('..')) {
			throw new Error(`Refusing to access path outside the workspace: ${rel}`);
		}
		return joinPath(root, ...clean.split(/[\\/]/));
	}

	private async writeFile(args: Record<string, unknown>): Promise<ToolExecutionResult> {
		const path = String(args.path ?? '');
		const content = String(args.content ?? '');
		if (!path) {
			return { ok: false, summary: 'write_file missing path', output: 'Error: "path" is required.' };
		}
		const uri = this.resolvePath(path);
		await this.fileService.createFile(uri, VSBuffer.fromString(content), { overwrite: true });
		return {
			ok: true,
			summary: `Wrote ${path} (${content.length} bytes)`,
			output: `OK. Wrote ${content.length} bytes to ${path}.`,
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
		const truncated = text.length > 64 * 1024 ? text.slice(0, 64 * 1024) + '\n…[truncated]' : text;
		return { ok: true, summary: `Read ${path}`, output: truncated };
	}

	private async listDirectory(args: Record<string, unknown>): Promise<ToolExecutionResult> {
		const path = String(args.path ?? '.');
		const rawDepth = Number(args.depth ?? 1);
		const depth = Math.max(1, Math.min(3, Number.isFinite(rawDepth) ? Math.floor(rawDepth) : 1));
		const uri = this.resolvePath(path);
		const lines: string[] = [];
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
		const defaultMs = isBackground ? 600_000 : (isHeavy ? 240_000 : 60_000);
		const timeoutMs = Math.min(600_000, Math.max(2_000,
			Number.isFinite(rawTimeout) && rawTimeout > 0 ? Math.floor(rawTimeout) : defaultMs
		));

		const folders = this.workspaceService.getWorkspace().folders;
		const cwd = folders.length > 0 ? folders[0].uri : undefined;

		// Reuse terminals aggressively to avoid spawning a new tab per call:
		//  • Foreground: one shared "EcoSystems Agent" terminal.
		//  • Background: keyed by the command string so re-running `npm run dev`
		//    lands in the SAME terminal as last time (the previous instance is
		//    cancelled with Ctrl+C first).
		let instance: import('../../terminal/browser/terminal.js').ITerminalInstance;
		if (isBackground) {
			const key = command;
			const existing = this.backgroundTerminals.get(key);
			if (existing && !existing.isDisposed) {
				instance = existing;
				// Send Ctrl+C to stop whatever is currently running in that tab so
				// our new invocation gets a clean prompt.
				try { instance.sendText('\x03', false); } catch { /* ignore */ }
				// Tiny pause so the prompt redraws before we send the new command.
				await new Promise(r => setTimeout(r, 200));
			} else {
				instance = await this.terminalService.createTerminal({
					config: { name: `EcoSystems Agent · ${command.slice(0, 40)}`, cwd },
				});
				this.backgroundTerminals.set(key, instance);
			}
		} else if (this.foregroundTerminal && !this.foregroundTerminal.isDisposed) {
			instance = this.foregroundTerminal;
		} else {
			instance = await this.terminalService.createTerminal({
				config: { name: 'EcoSystems Agent', cwd },
			});
			this.foregroundTerminal = instance;
		}
		await this.terminalService.setActiveInstance(instance);
		// IMPORTANT: onData / onLineData only fire while an xterm front-end is attached
		// (see TerminalInstance._writeProcessData — `this.xterm?.raw.write(...)`).
		// If the terminal panel is hidden, xterm is detached and our capture sees
		// nothing, so the sentinel never arrives and every command times out with
		// "(no output captured)". Reveal the panel before sending input.
		try { await this.terminalService.revealActiveTerminal(true); } catch { /* ignore */ }
		// Wait for the shell to actually be ready before sending input — otherwise the
		// first keystrokes can be swallowed by the still-initialising PTY.
		try { await Promise.race([instance.processReady, new Promise(r => setTimeout(r, 5000))]); } catch { /* ignore */ }

		const store = new DisposableStore();
		// Capture raw chunks via onData so we collect output from commands that paint
		// progress with ANSI cursor moves and CR (no newline) — e.g. `npm install`.
		// onLineData alone would never fire for those until they finish.
		const chunks: string[] = [];
		const MAX_BYTES = 32 * 1024;
		let collected = 0;
		const stripAnsi = (s: string) => s
			.replace(/\x1B\[[0-9;?]*[A-Za-z]/g, '')   // CSI
			.replace(/\x1B\][^\x07\x1B]*(\x07|\x1B\\)/g, '') // OSC
			.replace(/\x1B[PX^_][^\x1B]*\x1B\\/g, ''); // DCS/PM/APC/SOS

		const readyRe = /(ready in \d|ready\b|listening on|listening at|listening:|compiled successfully|compiled in |webpack compiled|local:\s*https?:\/\/|on your network:|started server on|server running|server started|dev server running|app running at|http:\/\/localhost|http:\/\/127\.0\.0\.1|→\s*Local:|VITE v|Next\.js)/i;

		// Build the actual command line with a sentinel marker so we can detect completion
		// of a single command inside a long-lived shell (where onExit only fires when the
		// shell itself dies). For background processes we don't append a sentinel — they
		// never finish, and we detect readiness via stdout markers instead.
		const sentinel = `__ECOAGENT_${Math.random().toString(36).slice(2, 10).toUpperCase()}__`;
		// Accept an optional missing digit so we still resolve even if the shell
		// produced an empty exit-code expansion (defensive — the wrapper should
		// always supply one).
		const sentinelRe = new RegExp(`${sentinel}_EXIT_(-?\\d*)`);
		const shell = instance.shellType;
		const wrapped = isBackground ? command : buildWrappedCommand(command, sentinel, shell);

		const result = await new Promise<{ exitCode?: number; reason: 'exit' | 'ready' | 'timeout' | 'error' | 'cancelled' }>((resolve) => {
			let settled = false;
			const finish = (r: { exitCode?: number; reason: 'exit' | 'ready' | 'timeout' | 'error' | 'cancelled' }) => {
				if (settled) { return; }
				settled = true;
				resolve(r);
			};

			// Raw chunk capture — fires continuously, including for progress spinners.
			store.add(instance.onData((data) => {
				const clean = stripAnsi(data);
				if (!clean) { return; }
				collected += clean.length;
				chunks.push(clean);
				if (collected > MAX_BYTES * 2) {
					// Keep only the last MAX_BYTES*2 worth so memory stays bounded.
					let total = 0;
					for (let i = chunks.length - 1; i >= 0; i--) {
						total += chunks[i].length;
						if (total > MAX_BYTES * 2) {
							chunks.splice(0, i + 1);
							collected = total;
							break;
						}
					}
				}
			}));

			// Line-level detection for sentinel and readiness markers.
			store.add(instance.onLineData((rawLine) => {
				const line = stripAnsi(rawLine);
				if (!isBackground) {
					const m = sentinelRe.exec(line);
					if (m) {
						finish({ exitCode: Number(m[1]) || 0, reason: 'exit' });
						return;
					}
				}
				if (isBackground && readyRe.test(line)) {
					finish({ reason: 'ready' });
				}
			}));
			// onExit only fires if the shell itself dies; treat that as command exit too.
			store.add(instance.onExit((code) => {
				const exitCode = typeof code === 'number' ? code : (code && typeof code === 'object' && 'message' in code ? -1 : 0);
				finish({ exitCode, reason: 'exit' });
			}));

			// User clicked Stop: send Ctrl+C and resolve so the agent loop unblocks.
			// We deliberately leave the terminal open so the user can inspect output.
			if (token.isCancellationRequested) {
				finish({ reason: 'cancelled' });
			} else {
				store.add(token.onCancellationRequested(() => {
					try { instance.sendText('\x03', false); } catch { /* ignore */ }
					finish({ reason: 'cancelled' });
				}));
			}

			const timer = setTimeout(() => finish({ reason: 'timeout' }), timeoutMs);
			store.add({ dispose: () => clearTimeout(timer) });

			instance.sendText(wrapped, true);
		});

		store.dispose();

		// Collapse spinner output: keep only the last "frame" between consecutive CRs.
		const raw = chunks.join('');
		const normalized = raw
			.split('\n')
			.map(seg => {
				const idx = seg.lastIndexOf('\r');
				return idx >= 0 ? seg.slice(idx + 1) : seg;
			})
			.join('\n');
		// Drop any line containing the sentinel marker (the echoed wrapped command).
		const output = normalized
			.split('\n')
			.filter(l => !l.includes(sentinel))
			.join('\n')
			.trim();
		const truncated = output.length > MAX_BYTES ? '…[earlier output truncated]\n' + output.slice(-MAX_BYTES) : output;
		const headline = (() => {
			switch (result.reason) {
				case 'exit': return result.exitCode === 0
					? `Command exited 0 (success).`
					: `Command exited with code ${result.exitCode}.`;
				case 'ready': return `Background process is running (readiness marker detected). The terminal stays open.`;
				case 'timeout': return isBackground
					? `Background process still running after ${timeoutMs}ms (no readiness marker yet). The terminal stays open; output so far below.`
					: `Command timed out after ${timeoutMs}ms.`;
				case 'cancelled': return `Cancelled by user (Ctrl+C sent to terminal).`;
				default: return `Command finished.`;
			}
		})();
		const ok = result.reason === 'ready'
			|| (result.reason === 'exit' && result.exitCode === 0)
			|| (result.reason === 'timeout' && isBackground);
		return {
			ok,
			cancelled: result.reason === 'cancelled',
			summary: `${ok ? '' : (result.reason === 'cancelled' ? '⊘ ' : '⚠ ')}${command.length > 60 ? command.slice(0, 60) + '…' : command}`,
			output: `${headline}\n\n--- terminal output ---\n${truncated || '(no output captured)'}`,
			terminalInstanceId: instance.instanceId,
		};
	}

	/**
	 * Build a compact snapshot of the workspace tree for inclusion in the system prompt.
	 * Skips node_modules/.git, caps lines, and clamps depth.
	 */
	async snapshotWorkspaceTree(maxEntries = 200, depth = 3): Promise<string> {
		const folders = this.workspaceService.getWorkspace().folders;
		if (folders.length === 0) {
			return '(no workspace folder open)';
		}
		const root = folders[0];
		const lines: string[] = [`${root.name}/`];
		try {
			await this.collectTree(root.uri, '  ', Math.max(1, Math.min(4, depth)), lines);
		} catch {
			return '(failed to read workspace)';
		}
		if (lines.length > maxEntries) {
			return lines.slice(0, maxEntries).join('\n') + `\n… (${lines.length - maxEntries} more entries truncated)`;
		}
		return lines.join('\n');
	}
}

/** Wrap a command so we can detect exit code via a unique sentinel line in captured output. */
function buildWrappedCommand(command: string, sentinel: string, shell: TerminalShellType | undefined): string {
	const marker = `${sentinel}_EXIT_`;
	// PowerShell quirk: $LASTEXITCODE is only set by *external* programs. For cmdlets
	// (echo, Test-Path, Write-Host, etc.) it stays $null, which would produce a
	// digit-less sentinel line that our regex can't match. Fall back to $? in that
	// case so every command emits a real exit code.
	const pwshSnippet = `${command}; $__eco = if ($LASTEXITCODE -ne $null) { $LASTEXITCODE } elseif ($?) { 0 } else { 1 }; Write-Host "${marker}$__eco"`;
	switch (shell) {
		case WindowsShellType.CommandPrompt:
			return `${command} & echo ${marker}%ERRORLEVEL%`;
		case PosixShellType.Bash:
		case PosixShellType.Zsh:
		case PosixShellType.Sh:
		case PosixShellType.Ksh:
		case WindowsShellType.GitBash:
		case WindowsShellType.Wsl:
			return `${command}; ec=$?; echo "${marker}$ec"`;
		case GeneralShellType.PowerShell:
			return pwshSnippet;
		default:
			if (isWindows) {
				return pwshSnippet;
			}
			return `${command}; ec=$?; echo "${marker}$ec"`;
	}
}
