/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { basename, posix } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ChatMessage } from '../../../../platform/ecosystems/common/ecosystemsAiTypes.js';
import { dirname, joinPath } from '../../../../base/common/resources.js';

export type ChatAttachmentKind = 'file' | 'folder' | 'image' | 'terminal';

export interface ChatAttachment {
	readonly id: string;
	readonly kind: ChatAttachmentKind;
	readonly label: string;
	readonly uri?: URI;
	readonly imageData?: Uint8Array;
	readonly imageMime?: string;
	readonly textContent?: string;
	/** Pasted or dropped file bytes before staging into the workspace. */
	readonly binaryData?: Uint8Array;
	readonly mimeType?: string;
	/** Workspace-relative path after staging (e.g. `.ecosystems-attachments/sound.mp3`). */
	readonly stagedRelativePath?: string;
}

export interface ChatAttachmentPreamble {
	readonly preamble: string;
	readonly images: Array<{ mimeType: string; data: Uint8Array }>;
}

/** Where pasted/dropped binaries are saved so the agent can reference a real path. */
export const CHAT_ATTACHMENTS_STAGING_DIR = '.ecosystems-attachments';

const MAX_BYTES_PER_FILE = 32 * 1024;
const MAX_STAGED_BINARY_BYTES = 20 * 1024 * 1024;
const MAX_FOLDER_ENTRIES = 200;
const MAX_FOLDER_DEPTH = 4;
const MAX_TERMINAL_CHARS = 64 * 1024;

const BINARY_EXTENSIONS = new Set([
	'mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'webm', 'mp4', 'mov', 'avi',
	'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'svg', 'pdf',
	'zip', 'gz', 'tar', '7z', 'rar', 'wasm', 'exe', 'dll', 'woff', 'woff2',
]);

export function createChatAttachment(partial: Omit<ChatAttachment, 'id'> & { id?: string }): ChatAttachment {
	const { id, ...rest } = partial;
	return { id: id ?? generateUuid(), ...rest };
}

export function cloneChatAttachment(a: ChatAttachment): ChatAttachment {
	return {
		...a,
		uri: a.uri,
		imageData: a.imageData ? new Uint8Array(a.imageData) : undefined,
		binaryData: a.binaryData ? new Uint8Array(a.binaryData) : undefined,
	};
}

export function attachmentKey(a: ChatAttachment): string {
	if (a.kind === 'image') {
		return `image:${a.id}`;
	}
	if (a.kind === 'terminal') {
		return `terminal:${a.id}`;
	}
	if (a.stagedRelativePath) {
		return `staged:${a.stagedRelativePath}`;
	}
	if (a.uri) {
		return `${a.kind}:${a.uri.toString()}`;
	}
	return `${a.kind}:${a.id}`;
}

export function isTextualAttachmentKind(kind: ChatAttachmentKind): boolean {
	return kind === 'file' || kind === 'folder' || kind === 'terminal';
}

export function isBinaryFilePath(filePath: string): boolean {
	const name = filePath.toLowerCase();
	const dot = name.lastIndexOf('.');
	if (dot < 0) {
		return false;
	}
	return BINARY_EXTENSIONS.has(name.slice(dot + 1));
}

function sanitizeFilename(name: string): string {
	const base = basename(name).replace(/[<>:"|?*\x00-\x1f]/g, '_').trim();
	return (base || 'attachment').slice(0, 180);
}

async function uniqueStagingRelativePath(
	fileService: IFileService,
	workspaceRoot: URI,
	filename: string,
): Promise<string> {
	const clean = sanitizeFilename(filename);
	const dirUri = joinPath(workspaceRoot, CHAT_ATTACHMENTS_STAGING_DIR);
	const dot = clean.lastIndexOf('.');
	const stem = dot > 0 ? clean.slice(0, dot) : clean;
	const ext = dot > 0 ? clean.slice(dot) : '';

	let rel = `${CHAT_ATTACHMENTS_STAGING_DIR}/${clean}`;
	let n = 1;
	while (await fileService.exists(joinPath(workspaceRoot, ...rel.split('/')))) {
		rel = `${CHAT_ATTACHMENTS_STAGING_DIR}/${stem}-${n}${ext}`;
		n++;
	}
	await fileService.createFolder(dirUri).catch(() => undefined);
	return rel;
}

/**
 * Saves pasted/dropped binaries into the workspace so the agent gets a real path.
 */
export async function stageAttachmentsToWorkspace(
	fileService: IFileService,
	workspaceRoot: URI | undefined,
	attachments: readonly ChatAttachment[],
	token: CancellationToken,
): Promise<ChatAttachment[]> {
	if (!workspaceRoot) {
		return [...attachments];
	}

	const out: ChatAttachment[] = [];
	for (const att of attachments) {
		if (token.isCancellationRequested) {
			break;
		}
		if (att.kind === 'file' && att.binaryData?.byteLength) {
			const bytes = att.binaryData.byteLength > MAX_STAGED_BINARY_BYTES
				? att.binaryData.subarray(0, MAX_STAGED_BINARY_BYTES)
				: att.binaryData;
			const rel = await uniqueStagingRelativePath(fileService, workspaceRoot, att.label);
			const uri = joinPath(workspaceRoot, ...rel.split('/'));
			await fileService.writeFile(uri, VSBuffer.wrap(bytes));
			out.push({
				...att,
				uri,
				stagedRelativePath: rel,
				binaryData: undefined,
			});
			continue;
		}
		out.push(att);
	}
	return out;
}

const ASSET_FOLDER_CANDIDATES = [
	'public/sounds',
	'public/assets/sounds',
	'public/assets',
	'public',
	'src/assets/sounds',
	'src/assets',
	'assets/sounds',
	'assets',
	'static/sounds',
	'static',
];

function isUnderAssetFolder(relativePath: string): boolean {
	const p = relativePath.replace(/\\/g, '/').toLowerCase();
	return /(^|\/)(public|assets|static|src\/assets)(\/|$)/.test(p) && !p.startsWith('.ecosystems-attachments');
}

async function resolveAssetDestinationDir(
	fileService: IFileService,
	workspaceRoot: URI,
): Promise<string> {
	for (const candidate of ASSET_FOLDER_CANDIDATES) {
		if (await fileService.exists(joinPath(workspaceRoot, ...candidate.split('/')))) {
			return candidate;
		}
	}
	if (await fileService.exists(joinPath(workspaceRoot, 'package.json'))) {
		const publicUri = joinPath(workspaceRoot, 'public');
		await fileService.createFolder(publicUri).catch(() => undefined);
		const soundsUri = joinPath(publicUri, 'sounds');
		await fileService.createFolder(soundsUri).catch(() => undefined);
		return 'public/sounds';
	}
	const assetsUri = joinPath(workspaceRoot, 'assets');
	await fileService.createFolder(assetsUri).catch(() => undefined);
	return 'assets';
}

/**
 * Copies root-level (or staging) binaries into public/assets so the agent can wire them in code.
 */
export async function autoPlaceBinaryAttachments(
	fileService: IFileService,
	workspaceRoot: URI | undefined,
	attachments: readonly ChatAttachment[],
	token: CancellationToken,
): Promise<ChatAttachment[]> {
	if (!workspaceRoot) {
		return [...attachments];
	}

	const out: ChatAttachment[] = [];
	for (const att of attachments) {
		if (token.isCancellationRequested) {
			break;
		}
		if (att.kind !== 'file') {
			out.push(att);
			continue;
		}

		const sourceRel = att.stagedRelativePath
			?? (att.uri
				? posix.relative(workspaceRoot.path, att.uri.path).replace(/\\/g, '/')
				: undefined);

		if (!sourceRel || !isBinaryFilePath(att.label)) {
			out.push(att);
			continue;
		}

		if (isUnderAssetFolder(sourceRel)) {
			out.push({ ...att, stagedRelativePath: sourceRel });
			continue;
		}

		const sourceUri = att.uri ?? joinPath(workspaceRoot, ...sourceRel.split('/'));
		if (!(await fileService.exists(sourceUri))) {
			out.push(att);
			continue;
		}

		const destDir = await resolveAssetDestinationDir(fileService, workspaceRoot);
		const fileName = basename(sourceRel) || att.label;
		const destRel = `${destDir}/${fileName}`.replace(/\/+/g, '/');
		const destUri = joinPath(workspaceRoot, ...destRel.split('/'));

		try {
			await fileService.createFolder(dirname(destUri)).catch(() => undefined);
			await fileService.copy(sourceUri, destUri, true);
			out.push({
				...att,
				uri: destUri,
				stagedRelativePath: destRel,
				label: fileName,
			});
		} catch {
			out.push(att);
		}
	}
	return out;
}

export async function buildAttachmentsPreamble(
	fileService: IFileService,
	token: CancellationToken,
	attachments: readonly ChatAttachment[],
	workspaceRoot?: URI,
): Promise<ChatAttachmentPreamble> {
	if (attachments.length === 0) {
		return { preamble: '', images: [] };
	}

	const images: Array<{ mimeType: string; data: Uint8Array }> = [];
	const parts: string[] = ['<attached_context>'];

	for (const att of attachments) {
		if (token.isCancellationRequested) {
			break;
		}
		switch (att.kind) {
			case 'image':
				if (att.imageData && att.imageMime) {
					images.push({ mimeType: att.imageMime, data: att.imageData });
					parts.push(`\n## ${att.label} (image/${att.imageMime}, ${att.imageData.byteLength} bytes)`);
					parts.push('\n(Screenshot attached -- model receives image data when vision is supported.)');
				}
				break;
			case 'terminal':
				if (att.textContent) {
					const text = att.textContent.length > MAX_TERMINAL_CHARS
						? att.textContent.slice(0, MAX_TERMINAL_CHARS) + '\n...(truncated)'
						: att.textContent;
					parts.push(`\n## ${att.label}\n\n\`\`\`\n${text}\n\`\`\``);
				}
				break;
			case 'folder':
				if (att.uri) {
					parts.push(`\n## ${att.label}/ (folder)`);
					const listing = await listFolderTree(fileService, att.uri, token);
					parts.push(`\n\`\`\`\n${listing}\n\`\`\``);
				}
				break;
			case 'file': {
				const workspacePath = att.stagedRelativePath
					?? (workspaceRoot && att.uri
						? posix.relative(workspaceRoot.path, att.uri.path).replace(/\\/g, '/')
						: undefined);

				if (att.binaryData?.byteLength && !workspacePath) {
					parts.push(`\n## ${att.label}\n\n(Open a workspace folder so this attachment can be saved for the agent.)`);
					break;
				}

				if (workspacePath && (att.stagedRelativePath || isBinaryFilePath(att.label))) {
					const inAssets = isUnderAssetFolder(workspacePath);
					appendBinaryFileAttachmentHint(parts, att.label, workspacePath, { inAssets });
					break;
				}

				if (att.uri) {
					try {
						const stream = await fileService.readFile(att.uri);
						const buf = stream.value.buffer;
						if (isBinaryFilePath(att.label) || looksLikeBinary(buf)) {
							const rel = workspacePath ?? att.label;
							appendBinaryFileAttachmentHint(parts, att.label, rel, { inAssets: isUnderAssetFolder(rel) });
							break;
						}
						const limit = Math.min(buf.byteLength, MAX_BYTES_PER_FILE);
						const truncated = buf.byteLength > MAX_BYTES_PER_FILE;
						const text = new TextDecoder('utf-8', { fatal: false }).decode(buf.subarray(0, limit));
						const lang = languageFromPath(att.label);
						parts.push(`\n## ${att.label}${truncated ? ` (first ${MAX_BYTES_PER_FILE} bytes)` : ''}\n\n\`\`\`${lang}\n${text}\n\`\`\``);
					} catch (e) {
						parts.push(`\n## ${att.label}\n\n(failed to read: ${e instanceof Error ? e.message : String(e)})`);
					}
				}
				break;
			}
		}
	}

	parts.push('\n</attached_context>\n\n');
	return { preamble: parts.join(''), images };
}

function appendBinaryFileAttachmentHint(
	parts: string[],
	label: string,
	workspacePath: string,
	options?: { inAssets?: boolean },
): void {
	parts.push(`\n## ${label} (binary/media)`);
	parts.push(`\nWorkspace path: \`${workspacePath}\``);
	if (options?.inAssets) {
		parts.push(
			'\nThis file is in the project assets folder (auto-copied from the project root when you sent the message).',
			'\nUpdate app code to use this exact path for sounds/images. Do **NOT** use `write_file` for this binary.',
		);
	} else {
		parts.push(
			'\nUse `copy_file` with both `from` and `to` if you still need to move it, then reference the destination in code.',
			'\nDo **NOT** use `write_file` without `path` or with binary content.',
		);
	}
}

/** Paths from the latest user message (for tool-call repair). */
export function extractBinaryPathsFromWireContent(wireContent: string): { source?: string; placed?: string } {
	const placed = wireContent.match(/Workspace path: `([^`]+)`/);
	const source = wireContent.match(/Source workspace path: `([^`]+)`/);
	return {
		placed: placed?.[1],
		source: source?.[1] ?? placed?.[1],
	};
}

function looksLikeBinary(buf: Uint8Array): boolean {
	const sample = Math.min(buf.byteLength, 512);
	for (let i = 0; i < sample; i++) {
		if (buf[i] === 0) {
			return true;
		}
	}
	return false;
}

async function listFolderTree(fileService: IFileService, root: URI, token: CancellationToken): Promise<string> {
	const lines: string[] = [];
	let count = 0;

	async function walk(uri: URI, prefix: string, depth: number): Promise<void> {
		if (token.isCancellationRequested || count >= MAX_FOLDER_ENTRIES || depth > MAX_FOLDER_DEPTH) {
			return;
		}
		let stat;
		try {
			stat = await fileService.resolve(uri, { resolveMetadata: true });
		} catch {
			lines.push(`${prefix}(unreadable)`);
			return;
		}
		if (!stat.children) {
			return;
		}
		const children = stat.children
			.filter(c => !c.name.startsWith('.'))
			.sort((a, b) => {
				const ad = a.isDirectory ? 0 : 1;
				const bd = b.isDirectory ? 0 : 1;
				if (ad !== bd) {
					return ad - bd;
				}
				return a.name.localeCompare(b.name);
			});
		for (const child of children) {
			if (token.isCancellationRequested || count >= MAX_FOLDER_ENTRIES) {
				return;
			}
			count++;
			const rel = child.name + (child.isDirectory ? '/' : '');
			lines.push(`${prefix}${rel}`);
			if (child.isDirectory && depth < MAX_FOLDER_DEPTH) {
				await walk(child.resource, prefix + '  ', depth + 1);
			}
		}
	}

	await walk(root, '', 0);
	if (count >= MAX_FOLDER_ENTRIES) {
		lines.push('...(listing truncated)');
	}
	return lines.join('\n') || '(empty folder)';
}

const LANG_BY_EXT: Record<string, string> = {
	ts: 'ts', tsx: 'tsx', js: 'js', jsx: 'jsx', mjs: 'js', cjs: 'js',
	py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin',
	c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp', cc: 'cpp', cs: 'csharp',
	php: 'php', swift: 'swift', m: 'objc', mm: 'objc',
	json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml', xml: 'xml',
	html: 'html', htm: 'html', css: 'css', scss: 'scss', less: 'less',
	md: 'md', sh: 'bash', bash: 'bash', zsh: 'bash', ps1: 'powershell',
	sql: 'sql', dockerfile: 'dockerfile',
};

function languageFromPath(path: string): string {
	const name = path.toLowerCase();
	if (name.endsWith('/dockerfile') || name === 'dockerfile') {
		return 'dockerfile';
	}
	const dot = name.lastIndexOf('.');
	if (dot < 0) {
		return '';
	}
	return LANG_BY_EXT[name.slice(dot + 1)] ?? '';
}

/** User message with optional vision images for the gateway. */
export function createUserChatMessage(displayText: string, wireText: string, images: ChatAttachmentPreamble['images']): ChatMessage {
	return {
		role: 'user',
		content: wireText,
		displayContent: displayText,
		...(images.length ? { images } : {}),
	};
}

export function toWorkspaceRelativeLabel(uri: URI, workspaceFolderUri: URI | undefined, fallbackPath: string): string {
	if (workspaceFolderUri) {
		const rel = posix.relative(workspaceFolderUri.path, uri.path);
		return rel || basename(uri.path);
	}
	return fallbackPath;
}
