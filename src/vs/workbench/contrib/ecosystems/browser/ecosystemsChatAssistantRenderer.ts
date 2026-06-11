/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { MarkdownRenderer } from '../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';

const MARKDOWN_DEBOUNCE_MS = 280;

/**
 * Renders assistant chat bubbles with markdown formatting and a streaming typewriter fade-in.
 */
export class EcosystemsChatAssistantRenderer extends Disposable {
	private readonly markdownRenderer: MarkdownRenderer;
	private readonly bubbleDisposables = new Map<HTMLElement, IDisposable>();
	private readonly markdownTimers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this.markdownRenderer = this._register(instantiationService.createInstance(MarkdownRenderer, {}));
	}

	override dispose(): void {
		for (const timer of this.markdownTimers.values()) {
			clearTimeout(timer);
		}
		this.markdownTimers.clear();
		this.clearAllBubbles();
		super.dispose();
	}

	/** Clears loading shimmer and prepares a streaming body. */
	prepareStreaming(bubble: HTMLElement): void {
		this.cancelMarkdownDebounce(bubble);
		this.clearBubbleDisposable(bubble);
		bubble.classList.remove('bubble-loading');
		bubble.classList.add('bubble-streaming');
		bubble.dataset.streaming = '1';
		bubble.dataset.renderedLength = '0';
		dom.clearNode(bubble);
		dom.append(bubble, dom.$('.bubble-stream-body'));
	}

	/** Appends new streamed text with per-token fade-in; debounces markdown preview. */
	updateStreaming(bubble: HTMLElement, fullText: string): void {
		if (!fullText) {
			return;
		}
		let body = bubble.querySelector('.bubble-stream-body') as HTMLElement | null;
		if (!body) {
			if (bubble.querySelector('.bubble-markdown')) {
				this.scheduleMarkdownPreview(bubble, fullText);
				return;
			}
			this.prepareStreaming(bubble);
			body = bubble.querySelector('.bubble-stream-body') as HTMLElement;
		}
		const prevLen = Number(bubble.dataset.renderedLength ?? '0');
		if (fullText.length <= prevLen) {
			this.scheduleMarkdownPreview(bubble, fullText);
			return;
		}
		const delta = fullText.slice(prevLen);
		const tokens = delta.match(/\S+\s*|\s+/g) ?? [delta];
		for (const token of tokens) {
			const span = dom.append(body, document.createElement('span'));
			span.className = 'ecosystems-stream-token';
			span.textContent = token;
		}
		bubble.dataset.renderedLength = String(fullText.length);
		this.scheduleMarkdownPreview(bubble, fullText);
	}

	/** Final formatted markdown (end of stream or history reload). */
	renderMarkdown(bubble: HTMLElement, text: string, animate = true, stillStreaming = false): void {
		this.cancelMarkdownDebounce(bubble);
		this.clearBubbleDisposable(bubble);
		bubble.classList.remove('bubble-loading');
		if (!stillStreaming) {
			bubble.classList.remove('bubble-streaming');
			delete bubble.dataset.streaming;
			delete bubble.dataset.renderedLength;
		}
		dom.clearNode(bubble);
		if (!text.trim()) {
			return;
		}
		const md = new MarkdownString(text, { isTrusted: false, supportHtml: false });
		const result = this.markdownRenderer.render(md);
		result.element.classList.add('bubble-markdown');
		if (animate) {
			result.element.classList.add('bubble-markdown-in');
		}
		bubble.appendChild(result.element);
		this.bubbleDisposables.set(bubble, result);
	}

	/** Plain text for errors / system lines (no markdown). */
	renderPlain(bubble: HTMLElement, text: string): void {
		this.cancelMarkdownDebounce(bubble);
		this.clearBubbleDisposable(bubble);
		bubble.classList.remove('bubble-streaming', 'bubble-loading');
		delete bubble.dataset.streaming;
		delete bubble.dataset.renderedLength;
		dom.clearNode(bubble);
		bubble.textContent = text;
	}

	private scheduleMarkdownPreview(bubble: HTMLElement, text: string): void {
		this.cancelMarkdownDebounce(bubble);
		const timer = setTimeout(() => {
			this.markdownTimers.delete(bubble);
			if (!bubble.isConnected || bubble.dataset.streaming !== '1') {
				return;
			}
			this.renderMarkdown(bubble, text, true, true);
			bubble.classList.add('bubble-streaming');
		}, MARKDOWN_DEBOUNCE_MS);
		this.markdownTimers.set(bubble, timer);
	}

	private cancelMarkdownDebounce(bubble: HTMLElement): void {
		const timer = this.markdownTimers.get(bubble);
		if (timer) {
			clearTimeout(timer);
			this.markdownTimers.delete(bubble);
		}
	}

	private clearBubbleDisposable(bubble: HTMLElement): void {
		const d = this.bubbleDisposables.get(bubble);
		if (d) {
			d.dispose();
			this.bubbleDisposables.delete(bubble);
		}
	}

	private clearAllBubbles(): void {
		for (const d of this.bubbleDisposables.values()) {
			d.dispose();
		}
		this.bubbleDisposables.clear();
	}
}
