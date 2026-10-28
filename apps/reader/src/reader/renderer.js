import { PROMPT_EXPAND_STYLES } from '../core/reader-appearance.mjs';
import { isHiddenThoughtsMessage } from './messages.js';
import { formatJsonResponse } from './json-response.js';
import { mountChartInteractions, dismissChartInteractions } from './rich-chart-interactions.js';
import { highlighter, normalizeCodeLanguage, getCodeLanguageLabel } from './highlight.js';
export { normalizeCodeLanguage } from './highlight.js';
import { tr } from './locale.js';
import { marked } from 'marked';
import { prepareRichMarkdown } from './rich-parser.js';
import { renderRichHtml } from './rich-renderer.js';
import { wrapMarkdownImage, mountMarkdownImages, unlinkMarkdownImages, destroyMarkdownImages } from './markdown-images.js';
import { buildMermaidRepairCandidates } from './mermaid-repair.js';
import {
  clearPendingMath,
  discardMathRecords,
  protectMathInMarkdown,
  restoreMathPlaceholders,
  renderMathPlaceholders,
} from './math.js';

const LONG_PROMPT_LINE_LIMIT = 15;
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

function createMessageCollapseChevron() {
  const icon = document.createElementNS(SVG_NAMESPACE, 'svg');
  icon.classList.add('message-collapse-chevron');
  icon.setAttribute('viewBox', '0 0 12 12');
  icon.setAttribute('aria-hidden', 'true');
  icon.setAttribute('focusable', 'false');

  const path = document.createElementNS(SVG_NAMESPACE, 'path');
  path.setAttribute('d', 'M2.75 4.25 6 7.5l3.25-3.25');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.5');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  icon.appendChild(path);
  return icon;
}

marked.setOptions({
  breaks: true,
  gfm: true,
});

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function extractLanguageFromClassName(className = '') {
  const match = String(className).match(/(?:^|\s)(?:language|lang)-([^\s]+)/i);
  return match ? match[1] : '';
}

function createMarkedRenderer() {
  const renderer = new marked.Renderer();
  const defaultLink = renderer.link.bind(renderer);

  renderer.code = function code(token) {
    const text = typeof token === 'string' ? token : token?.text || '';
    const lang = typeof token === 'object' ? token?.lang || '' : '';
    const language = normalizeCodeLanguage(lang);
    return `<pre class="language-${language}" data-language="${escapeHtml(getCodeLanguageLabel(language, lang))}"><code class="language-${language}" data-language="${language}">${escapeHtml(text)}</code></pre>\n`;
  };

  renderer.link = function link(token) {
    const html = defaultLink(token);
    return html.replace(/^<a /, '<a target="_blank" rel="noopener noreferrer" ');
  };

  // Raw HTML from archived messages is displayed literally rather than injected.
  // Math placeholders are restored from opaque text after sanitization.
  renderer.html = function html(token) {
    const raw = typeof token === 'string' ? token : token?.raw || token?.text || '';
    return escapeHtml(raw);
  };

  return renderer;
}

const markedRenderer = createMarkedRenderer();

function markCodeBlockLanguage(block, language) {
  const pre = block.closest('pre');
  const className = `language-${language}`;

  block.className = Array.from(block.classList)
    .filter((name) => !/^(?:language|lang)-/i.test(name) && name !== 'hljs')
    .join(' ');
  block.classList.add(className);
  block.dataset.language = language;

  if (pre) {
    pre.classList.remove(...Array.from(pre.classList).filter((name) => /^(?:language|lang)-/i.test(name)));
    pre.classList.add(className);
    if (!pre.dataset.language) pre.dataset.language = getCodeLanguageLabel(language);
  }
}

function highlightCodeBlock(block) {
  const hljs = highlighter;
  // data-language is already canonical. Reinterpreting it as a fence alias would
  // turn the canonical Shell Session grammar into the generic shell/Bash alias.
  const language = block.dataset.language && hljs.getLanguage(block.dataset.language)
    ? block.dataset.language : normalizeCodeLanguage(extractLanguageFromClassName(block.className));
  const rawCode = block.textContent || '';
  block.dataset.originalCode = rawCode;

  markCodeBlockLanguage(block, language);

  // Mermaid fences are rendered as diagrams after the sanitized Markdown is
  // inserted into the document. Preserve their source verbatim here.
  if (language === 'mermaid') return;

  if (hljs && typeof hljs.highlightElement === 'function') {
    try {
      delete block.dataset.highlighted;
      block.removeAttribute('data-highlighted');
      hljs.highlightElement(block);
      block.dataset.highlighted = 'true';
      return;
    } catch (error) {
      console.warn(`Syntax highlighting failed for ${language}; using plain text.`, error);
    }
  }

  block.textContent = rawCode;
  block.classList.add('hljs');
  block.dataset.highlighted = 'true';
}

function sanitizeRenderedHtml(html) {
  const template = document.createElement('template');
  template.innerHTML = html;

  const allowedTags = new Set([
    'P', 'BR', 'HR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'BLOCKQUOTE', 'UL', 'OL', 'LI', 'STRONG', 'B', 'EM', 'I', 'DEL', 'S',
    'CODE', 'PRE', 'A', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TH', 'TD',
    'SPAN', 'DIV', 'SUP', 'SUB', 'KBD', 'IMG',
  ]);
  const globalAttrs = new Set(['class', 'title']);
  const perTagAttrs = {
    A: new Set(['href', 'target', 'rel']),
    IMG: new Set(['src', 'alt']),
    PRE: new Set(['data-language']),
    CODE: new Set(['data-language', 'data-highlighted', 'data-original-code']),
    SPAN: new Set(['data-chatgpt-math-id']),
    DIV: new Set(['data-chatgpt-math-id']),
    TH: new Set(['align', 'colspan', 'rowspan']),
    TD: new Set(['align', 'colspan', 'rowspan']),
    OL: new Set(['start']),
  };

  for (const element of [...template.content.querySelectorAll('*')]) {
    if (!allowedTags.has(element.tagName)) {
      element.replaceWith(document.createTextNode(element.textContent || ''));
      continue;
    }

    for (const attr of [...element.attributes]) {
      const name = attr.name.toLowerCase();
      const allowed = globalAttrs.has(name) || perTagAttrs[element.tagName]?.has(name);
      if (!allowed || name.startsWith('on') || name === 'style') {
        element.removeAttribute(attr.name);
      }
    }

    if (element.tagName === 'A') {
      const href = element.getAttribute('href') || '';
      const safe = /^(?:https?:\/\/|mailto:|#)/i.test(href);
      if (!safe) element.removeAttribute('href');
      element.setAttribute('target', '_blank');
      element.setAttribute('rel', 'noopener noreferrer');
    }
    if (element.tagName === 'IMG') {
      // IMG is produced only by Markdown; raw archived HTML remains literal.
      const marker = document.createTextNode('');
      element.replaceWith(marker);
      marker.replaceWith(wrapMarkdownImage(element, tr));
    }
  }

  unlinkMarkdownImages(template.content);
  template.content.querySelectorAll('pre code').forEach((block) => highlightCodeBlock(block));
  return template.innerHTML;
}

function addCodeBlockControls(container) {
  container.querySelectorAll('pre').forEach((pre) => {
    if (pre.classList.contains('has-code-controls')) return;
    const code = Array.from(pre.children).find((child) => child.tagName?.toLowerCase() === 'code') || pre.querySelector('code');
    if (!code) return;

    const languageLabel = pre.dataset.language || getCodeLanguageLabel(
      normalizeCodeLanguage(code.dataset.language || extractLanguageFromClassName(code.className)),
    );

    const titlebar = document.createElement('span');
    titlebar.className = 'code-block-titlebar';

    const label = document.createElement('span');
    label.className = 'code-block-language';
    label.textContent = languageLabel;

    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.className = 'code-copy-button';
    copyButton.textContent = tr('Copy');
    copyButton.setAttribute('aria-label', tr('Copy code block to clipboard'));

    titlebar.append(label, copyButton);
    pre.insertBefore(titlebar, pre.firstChild);
    pre.classList.add('has-code-controls');
  });
}

function upgradeMermaidBlocks(container) {
  const blocks = [];

  container.querySelectorAll('pre.language-mermaid').forEach((pre) => {
    const code = pre.querySelector('code');
    if (!code) return;

    const figure = document.createElement('figure');
    figure.className = 'mermaid-block';
    figure.dataset.mermaidState = 'pending';
    figure.mermaidSource = code.textContent || '';
    figure.mermaidRepairSource = '';
    figure.mermaidRenderSource = figure.mermaidSource;
    figure.mermaidDisplayMode = 'original';
    figure.mermaidOriginalError = null;

    const titlebar = document.createElement('figcaption');
    titlebar.className = 'code-block-titlebar mermaid-titlebar';

    const label = document.createElement('span');
    label.className = 'code-block-language';
    label.textContent = 'Mermaid';

    const rightControls = document.createElement('span');
    rightControls.className = 'mermaid-titlebar-right';

    const versionToggle = document.createElement('button');
    versionToggle.type = 'button';
    versionToggle.className = 'code-copy-button mermaid-copy-button mermaid-version-toggle';
    versionToggle.dataset.toggleMermaidVersion = '1';
    versionToggle.textContent = tr('Repaired');
    versionToggle.hidden = true;
    versionToggle.setAttribute('aria-pressed', 'true');
    versionToggle.setAttribute('aria-label', tr('Showing repaired Mermaid; click to show original'));
    versionToggle.title = tr('Showing repaired version; click to show original');

    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.className = 'code-copy-button mermaid-copy-button';
    copyButton.dataset.copyMermaid = '1';
    copyButton.dataset.defaultLabel = tr('Copy');
    copyButton.textContent = tr('Copy');
    copyButton.setAttribute('aria-label', tr('Copy displayed Mermaid source to clipboard'));

    const diagram = document.createElement('div');
    diagram.className = 'mermaid-diagram';
    diagram.setAttribute('aria-busy', 'true');
    diagram.setAttribute('aria-label', tr('Mermaid diagram'));

    const loading = document.createElement('span');
    loading.className = 'mermaid-loading';
    loading.textContent = tr('Rendering diagram…');

    rightControls.append(versionToggle, copyButton);
    titlebar.append(label, rightControls);
    diagram.appendChild(loading);
    figure.append(titlebar, diagram);
    pre.replaceWith(figure);
    blocks.push(figure);
  });

  return blocks;
}

function effectiveMermaidTheme() {
  if (document.documentElement.classList.contains('high-contrast') || document.documentElement.dataset.contrast === 'high') return 'dark';
  const explicit = document.documentElement.dataset.theme;
  if (explicit === 'dark' || explicit === 'light') return explicit;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function configureMermaid() {
  const mermaid = window.mermaid;
  if (!mermaid || typeof mermaid.initialize !== 'function' || typeof mermaid.render !== 'function') {
    return null;
  }

  const theme = effectiveMermaidTheme() === 'dark' ? 'dark' : 'default';
  const classic = { theme, look: 'classic' };
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    suppressErrorRendering: true,
    theme,
    // Mermaid 12 changes diagram defaults; preserve the suite's classic layout.
    look: 'classic',
    layout: 'dagre',
    htmlLabels: false,
    flowchart: { ...classic, htmlLabels: false, wrappingWidth: 200, minNodeWidth: 0 },
    sequence: classic,
    class: classic,
    state: { ...classic, layout: 'dagre', wrappingWidth: 200, minNodeWidth: 0 },
    er: classic,
    requirement: classic,
    swimlane: classic,
    venn: classic,
    secure: [
      'secure',
      'securityLevel',
      'startOnLoad',
      'suppressErrorRendering',
      'theme',
      'themeVariables',
      'fontFamily',
      'htmlLabels',
      'maxTextSize',
      'maxEdges',
    ],
  });
  return mermaid;
}

function mermaidErrorMessage(error) {
  const text = error instanceof Error ? error.message : String(error || 'Unknown Mermaid error');
  return text.replace(/\s+/g, ' ').trim().slice(0, 500);
}

function currentMermaidSource(block) {
  if (block?.mermaidDisplayMode === 'repaired' && block.mermaidRepairSource) {
    return block.mermaidRepairSource;
  }
  return block?.mermaidSource || '';
}

function updateMermaidVersionToggle(block, visible = Boolean(block?.mermaidRepairSource)) {
  const button = block?.querySelector('[data-toggle-mermaid-version]');
  if (!button) return;

  button.hidden = !visible;
  if (!visible) return;

  const repaired = block.mermaidDisplayMode === 'repaired';
  button.textContent = repaired ? tr('Repaired') : tr('Original');
  button.setAttribute('aria-pressed', String(repaired));
  button.setAttribute(
    'aria-label',
    repaired
      ? tr('Showing repaired Mermaid; click to show original')
      : tr('Showing original Mermaid; click to show repaired'),
  );
  button.title = repaired
    ? tr('Showing repaired version; click to show original')
    : tr('Showing original version; click to show repaired');
}

function showMermaidSvg(block, svg, mode) {
  const diagram = block.querySelector('.mermaid-diagram');
  if (!diagram) return;
  diagram.innerHTML = svg;
  diagram.removeAttribute('aria-busy');
  block.mermaidDisplayMode = mode;
  block.mermaidRenderSource = mode === 'repaired'
    ? block.mermaidRepairSource || block.mermaidSource || ''
    : block.mermaidSource || '';
  block.dataset.mermaidState = mode === 'repaired' ? 'repaired' : 'rendered';
  updateMermaidVersionToggle(block, Boolean(block.mermaidRepairSource));
}

function showMermaidError(block, error, source = block?.mermaidSource || '', { repairAvailable = false } = {}) {
  const diagram = block.querySelector('.mermaid-diagram');
  if (!diagram) return;

  const message = document.createElement('p');
  message.className = 'mermaid-error-message';
  message.textContent = `${tr('Could not render this Mermaid diagram')}: ${mermaidErrorMessage(error)}`;

  const sourceElement = document.createElement('pre');
  sourceElement.className = 'mermaid-error-source';
  sourceElement.dataset.language = tr('Mermaid source');

  const code = document.createElement('code');
  code.className = 'language-mermaid';
  code.textContent = source;

  sourceElement.appendChild(code);
  diagram.replaceChildren(message, sourceElement);
  diagram.removeAttribute('aria-busy');
  block.dataset.mermaidState = repairAvailable ? 'original-error' : 'error';
  block.mermaidDisplayMode = 'original';
  block.mermaidRenderSource = block.mermaidSource || '';
  updateMermaidVersionToggle(block, repairAvailable);
}

function copyTextFallback(text) {
  const previousFocus = document.activeElement;
  const selection = document.getSelection();
  const previousRanges = selection ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange()) : [];
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-9999px';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    if (!document.execCommand('copy')) throw new Error('Copy command rejected');
  } finally {
    textarea.remove();
    previousFocus?.focus?.({ preventScroll: true });
    if (selection && previousRanges.length) {
      selection.removeAllRanges();
      previousRanges.forEach(range => selection.addRange(range));
    }
  }
}

async function copyTextToClipboard(text) {
  // Desktop writes run in the trusted main process, with no browser clipboard permission or read access.
  if (window.desktop?.capabilities?.clipboardWrite === true) {
    await window.desktop.invoke('clipboard.write', { text });
    return;
  }
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Offline previews may deny the async API while still allowing a user-initiated copy command.
    }
  }
  copyTextFallback(text);
}

function showCopyButtonStatus(button, statusText) {
  window.clearTimeout(button.copyStatusTimer);
  button.textContent = statusText;
  button.copyStatusTimer = window.setTimeout(() => {
    button.textContent = button.dataset.defaultLabel || tr('Copy');
  }, 1400);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightTextInHtml(html, query) {
  if (!query?.trim()) return html;
  const template = document.createElement('template');
  template.innerHTML = html;
  const regex = new RegExp(`(${escapeRegExp(query.trim())})`, 'gi');

  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      regex.lastIndex = 0;
      if (!regex.test(node.textContent || '')) return;
      regex.lastIndex = 0;
      const fragment = document.createDocumentFragment();
      let last = 0;
      for (const match of (node.textContent || '').matchAll(regex)) {
        const index = match.index ?? 0;
        if (index > last) fragment.append(document.createTextNode(node.textContent.slice(last, index)));
        const mark = document.createElement('mark');
        mark.className = 'highlight';
        mark.textContent = match[0];
        fragment.append(mark);
        last = index + match[0].length;
      }
      if (last < node.textContent.length) fragment.append(document.createTextNode(node.textContent.slice(last)));
      node.replaceWith(fragment);
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (['SCRIPT', 'STYLE', 'MJX-CONTAINER', 'svg', 'SVG'].includes(node.tagName)) return;
    if (node.classList?.contains('chatgpt-math-placeholder')) return;
    [...node.childNodes].forEach(walk);
  };

  [...template.content.childNodes].forEach(walk);
  return template.innerHTML;
}

export class ConversationRenderer {
  constructor(container) {
    this.contentContainer = container;
    this.disposeChartInteractions = mountChartInteractions(container);
    this.currentQuery = '';
    this.conversationKey = '';
    this.imageRenderPending = false;
    this.compactMessagesEnabled = true;
    this.messageExpansionState = new Map();
    this.messageContentSequence = 0;
    this.renderGeneration = 0;
    this.mermaidSequence = 0;
    this.mermaidQueue = Promise.resolve();
    this.messageResizeObserver = typeof window.ResizeObserver === 'function'
      ? new window.ResizeObserver((entries) => {
          for (const entry of entries) {
            const message = entry.target.closest('.message[data-collapse-kind]');
            if (message?.isConnected) {
              const animating = message.classList.contains('is-collapse-animating');
              const viewport = message.querySelector('.message-content-viewport');
              // Math, diagrams, fonts, or a window resize can change the natural
              // height during a toggle. Retarget from its current rendered height
              // instead of snapping to the newly measured content at completion.
              const measuredHeight = Math.max(1, Math.ceil(entry.target.scrollHeight));
              const previousHeight = Number.parseFloat(viewport?.style.getPropertyValue('--message-expanded-height'));
              if (!animating || measuredHeight !== previousHeight) {
                this.refreshCollapsibleMessage(message, { animate: animating });
              }
            }
          }
        })
      : null;
    this.clickHandler = (event) => this.handleCopy(event);
    this.contentContainer.addEventListener('click', this.clickHandler);
  }

  destroy() {
    destroyMarkdownImages(this.contentContainer);
    this.disposeChartInteractions();
    this.renderGeneration++;
    this.messageResizeObserver?.disconnect();
    this.contentContainer.removeEventListener('click', this.clickHandler);
    this.contentContainer.querySelectorAll('.message').forEach(message => this.cancelMessageCollapseAnimation(message));
  }

  beginConversation(key) {
    const nextKey = String(key || '');
    if (nextKey === this.conversationKey) return;
    destroyMarkdownImages(this.contentContainer);
    this.imageRenderPending = true;
    this.conversationKey = nextKey;
    this.messageExpansionState.clear();
  }

  setCompactMessagesEnabled(enabled, { animate = true } = {}) {
    this.compactMessagesEnabled = Boolean(enabled);
    this.contentContainer.classList.toggle('compact-messages-disabled', !this.compactMessagesEnabled);
    this.refreshCollapsibleMessages({ animate });
  }

  setPromptExpandStyle(value) {
    const style = PROMPT_EXPAND_STYLES.includes(value) ? value : 'outlined-right';
    this.promptExpandStyle = style;
    this.contentContainer.dataset.promptExpandStyle = style;
    // Move the existing native button: keep focus, listeners, expansion state and
    // its aria-controls relationship intact when changing the presentation.
    for (const button of this.contentContainer.querySelectorAll('.prompt-expand-bar')) {
      const message = button.closest('.message');
      const target = style === 'header-action' ? message.querySelector('.message-header') : message;
      if (button.parentElement !== target) target.append(button);
    }
  }

  setRemoteImages(value) {
    this.remoteImagesMode = value === 'click' ? 'click' : 'auto';
    if (!this.imageRenderPending) mountMarkdownImages(this.contentContainer, { mode: this.remoteImagesMode, resolveImage: this.imageResolver, context: this.imageContext });
    this.refreshCollapsibleMessages({ animate: false });
  }

  setImageResolver(resolveImage, context = {}) {
    const previousContext = this.imageContext || {};
    const contextChanged = [...new Set([...Object.keys(previousContext), ...Object.keys(context)])]
      .some(key => previousContext[key] !== context[key]);
    this.imageResolver = typeof resolveImage === 'function' ? resolveImage : undefined;
    this.imageContext = Object.freeze({ ...context });
    // A new source identity belongs to the next render. Never resolve the old
    // conversation's URLs under the new conversation's cache authorization.
    if (contextChanged) { destroyMarkdownImages(this.contentContainer); this.imageRenderPending = true; }
    if (this.imageRenderPending) return;
    mountMarkdownImages(this.contentContainer, { mode: this.remoteImagesMode, resolveImage: this.imageResolver, context: this.imageContext });
    this.refreshCollapsibleMessages({ animate: false });
  }

  setSearchQuery(query) {
    this.currentQuery = query || '';
  }

  renderMessages(messages) {
    destroyMarkdownImages(this.contentContainer);
    this.imageRenderPending = false;
    dismissChartInteractions(this.contentContainer);
    const generation = ++this.renderGeneration;
    this.messageResizeObserver?.disconnect();
    this.contentContainer.querySelectorAll('.message').forEach(message => this.cancelMessageCollapseAnimation(message));
    if (!messages?.length) {
      this.contentContainer.innerHTML = `<div class="no-conversation">${tr('No messages found')}</div>`;
      return;
    }

    clearPendingMath();
    const fragment = document.createDocumentFragment();
    for (const message of messages) {
      if (isHiddenThoughtsMessage(message)) continue;
      if (!message.content?.trim()) continue;
      fragment.appendChild(this.createMessageElement(message));
    }

    this.contentContainer.replaceChildren(fragment);
    const mermaidBlocks = upgradeMermaidBlocks(this.contentContainer);
    addCodeBlockControls(this.contentContainer);
    this.refreshCollapsibleMessages({ animate: false });
    this.contentContainer.querySelectorAll('.message[data-collapse-kind] .message-content').forEach((content) => {
      this.messageResizeObserver?.observe(content);
    });
    void renderMathPlaceholders(this.contentContainer).then(() => {
      if (generation === this.renderGeneration) this.refreshCollapsibleMessages({ animate: false });
    });
    this.queueMermaidRender(mermaidBlocks, generation);
  }

  queueMermaidRender(blocks, generation) {
    if (!blocks.length) return;
    this.mermaidQueue = this.mermaidQueue
      .catch(() => {})
      .then(() => this.renderMermaidBlocks(blocks, generation))
      .then(() => {
        if (generation === this.renderGeneration) this.refreshCollapsibleMessages({ animate: false });
      });
  }

  refreshCollapsibleMessages(options = {}) {
    this.contentContainer.querySelectorAll('.message[data-collapse-kind]').forEach((message) => {
      this.refreshCollapsibleMessage(message, options);
    });
  }

  refreshCollapsibleMessage(message, { animate = false } = {}) {
    if (!animate && message.classList.contains('is-collapse-animating')) return;
    const viewport = message.querySelector('.message-content-viewport');
    const content = viewport?.querySelector('.message-content');
    if (!viewport || !content) return;

    const expandedHeight = Math.max(1, Math.ceil(content.scrollHeight));
    viewport.style.setProperty('--message-expanded-height', `${expandedHeight}px`);

    const lineHeight = Number.parseFloat(window.getComputedStyle(content).lineHeight) || 25.6;
    const collapsedPromptHeight = Math.ceil(lineHeight * LONG_PROMPT_LINE_LIMIT);
    viewport.style.setProperty('--prompt-line-height', `${lineHeight}px`);
    viewport.style.setProperty('--prompt-fade-height', `${lineHeight * 2}px`);
    viewport.style.setProperty('--prompt-collapse-height', `${collapsedPromptHeight}px`);

    const kind = message.dataset.collapseKind;
    const isLongPrompt = kind === 'prompt' && expandedHeight > collapsedPromptHeight + 2;
    message.classList.toggle('is-long-prompt', isLongPrompt);

    const key = message.dataset.messageId || '';
    if (!this.messageExpansionState.has(key)) this.messageExpansionState.set(key, false);
    const requestedExpanded = this.messageExpansionState.get(key) === true;
    this.applyMessageCollapseState(message, requestedExpanded, { animate });
  }

  applyMessageCollapseState(message, requestedExpanded, { animate = true } = {}) {
    const kind = message.dataset.collapseKind;
    const canCollapse = this.compactMessagesEnabled
      && (kind === 'reasoning' || (kind === 'prompt' && message.classList.contains('is-long-prompt')));
    const expanded = !canCollapse || requestedExpanded;
    const viewport = message.querySelector('.message-content-viewport');
    const content = viewport?.querySelector('.message-content');
    if (!viewport || !content) return;
    const targetHeight = expanded
      ? Math.max(1, Math.ceil(content.scrollHeight))
      : kind === 'reasoning'
        ? 0
        : Number.parseFloat(viewport.style.getPropertyValue('--prompt-collapse-height')) || 0;
    const changeState = () => {
      message.classList.toggle('is-prompt-collapsed', kind === 'prompt' && canCollapse && !expanded);
      message.classList.toggle('is-reasoning-collapsed', kind === 'reasoning' && canCollapse && !expanded);
      message.classList.toggle('is-message-expanded', canCollapse && expanded);

      const promptToggle = message.querySelector('.prompt-expand-bar');
      if (promptToggle) {
        promptToggle.hidden = !this.compactMessagesEnabled || !message.classList.contains('is-long-prompt');
        promptToggle.setAttribute('aria-expanded', String(expanded));
        const label = promptToggle.querySelector('.message-expand-label');
        if (label) label.textContent = expanded ? tr('Collapse prompt') : tr('Show full prompt');
      }

      const reasoningToggle = message.querySelector('.reasoning-collapse-toggle');
      if (reasoningToggle) {
        reasoningToggle.disabled = !this.compactMessagesEnabled;
        reasoningToggle.setAttribute('aria-disabled', String(!this.compactMessagesEnabled));
        reasoningToggle.setAttribute('aria-expanded', String(expanded));
        reasoningToggle.title = this.compactMessagesEnabled
          ? expanded ? tr('Collapse reasoning') : tr('Expand reasoning')
          : tr('Compact messages are disabled');
      }
    };

    if (animate && this.animationsEnabled !== false && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const currentHeight = Math.max(0, viewport.getBoundingClientRect().height);
      const currentOpacity = window.getComputedStyle(viewport).opacity;
      this.cancelMessageCollapseAnimation(message);
      message.classList.remove('collapse-transition-suppressed');
      message.classList.add('is-collapse-animating');
      // Commit the measured starting height without animating this assignment.
      // A quick reversal therefore continues from the visible intermediate frame.
      viewport.style.transition = 'none';
      viewport.style.maxHeight = `${currentHeight}px`;
      viewport.style.opacity = currentOpacity;
      viewport.getBoundingClientRect();
      viewport.style.transition = '';
      changeState();
      viewport.style.opacity = '';
      viewport.style.maxHeight = `${targetHeight}px`;
      const finish = () => {
        this.cancelMessageCollapseAnimation(message);
        message.classList.remove('is-collapse-animating');
        if (message.isConnected) this.refreshCollapsibleMessage(message, { animate: false });
      };
      message.collapseTransitionEndHandler = (event) => {
        if (event.target === viewport && event.propertyName === 'max-height') finish();
      };
      viewport.addEventListener('transitionend', message.collapseTransitionEndHandler);
      // No transitionend is emitted when both heights are equal or a preference
      // disables motion midway. Derive the fallback from the actual CSS timing.
      const duration = window.getComputedStyle(viewport).transitionDuration.split(',')[0].trim();
      const milliseconds = Number.parseFloat(duration) * (duration.endsWith('ms') ? 1 : 1000) || 0;
      message.collapseAnimationTimer = window.setTimeout(finish, milliseconds + 80);
      return;
    }

    this.cancelMessageCollapseAnimation(message);
    message.classList.remove('is-collapse-animating');
    message.classList.add('collapse-transition-suppressed');
    changeState();
    viewport.style.transition = '';
    viewport.style.opacity = '';
    viewport.style.maxHeight = `${targetHeight}px`;
    message.collapseSuppressionFrame = window.requestAnimationFrame(() => {
      message.collapseSuppressionFrame = window.requestAnimationFrame(() => {
        message.collapseSuppressionFrame = null;
        message.classList.remove('collapse-transition-suppressed');
      });
    });
  }

  cancelMessageCollapseAnimation(message) {
    window.clearTimeout(message.collapseAnimationTimer);
    window.cancelAnimationFrame(message.collapseSuppressionFrame);
    message.collapseAnimationTimer = null;
    message.collapseSuppressionFrame = null;
    if (message.collapseTransitionEndHandler) {
      message.querySelector('.message-content-viewport')?.removeEventListener('transitionend', message.collapseTransitionEndHandler);
      message.collapseTransitionEndHandler = null;
    }
  }

  toggleMessageCollapse(message) {
    if (!this.compactMessagesEnabled || !message) return;
    const kind = message.dataset.collapseKind;
    if (kind === 'prompt' && !message.classList.contains('is-long-prompt')) return;
    if (kind !== 'prompt' && kind !== 'reasoning') return;

    const key = message.dataset.messageId || '';
    const expanded = this.messageExpansionState.get(key) === true;
    this.messageExpansionState.set(key, !expanded);
    this.applyMessageCollapseState(message, !expanded, { animate: true });
  }

  revealElement(element) {
    // Exact chart values stay keyboard-accessible in a contained details table.
    // Search must reveal a matched saved value even when its table was closed.
    let detail = element?.closest?.('details');
    while (detail && detail.closest('.rich-chart, .rich-source')) { detail.open = true; detail = detail.parentElement?.closest('details'); }
    if (!this.compactMessagesEnabled) return;
    const message = element?.closest?.('.message[data-collapse-kind]');
    if (!message || (!message.classList.contains('is-prompt-collapsed') && !message.classList.contains('is-reasoning-collapsed'))) return;
    const key = message.dataset.messageId || '';
    this.messageExpansionState.set(key, true);
    this.applyMessageCollapseState(message, true, { animate: true });
  }

  rerenderMermaidDiagrams() {
    const blocks = [...this.contentContainer.querySelectorAll('.mermaid-block')];
    if (!blocks.length) return;

    const generation = ++this.renderGeneration;
    for (const block of blocks) {
      const diagram = block.querySelector('.mermaid-diagram');
      block.dataset.mermaidState = 'pending';
      diagram?.setAttribute('aria-busy', 'true');
    }
    this.queueMermaidRender(blocks, generation);
  }

  async renderMermaidBlocks(blocks, generation) {
    if (generation !== this.renderGeneration) return;
    const mermaid = configureMermaid();
    if (!mermaid) {
      blocks.forEach((block) => {
        block.mermaidRepairSource = '';
        block.mermaidOriginalError = 'The bundled Mermaid renderer did not load.';
        showMermaidError(block, block.mermaidOriginalError);
      });
      return;
    }

    for (const block of blocks) {
      if (generation !== this.renderGeneration || !block.isConnected) return;
      const diagram = block.querySelector('.mermaid-diagram');
      if (!diagram) continue;

      // Respect an explicit Original selection across theme/high-contrast rerenders.
      if (block.mermaidRepairSource && block.mermaidDisplayMode === 'original') {
        showMermaidError(
          block,
          block.mermaidOriginalError || 'The original Mermaid source did not render.',
          block.mermaidSource || '',
          { repairAvailable: true },
        );
        continue;
      }

      // A previously proven repair can be rerendered directly for a theme change.
      if (block.mermaidRepairSource && block.mermaidDisplayMode === 'repaired') {
        const id = `threadshelf-mermaid-repaired-${generation}-${++this.mermaidSequence}`;
        try {
          const { svg } = await mermaid.render(id, block.mermaidRepairSource);
          if (generation !== this.renderGeneration || !block.isConnected) continue;
          showMermaidSvg(block, svg, 'repaired');
        } catch (error) {
          if (generation !== this.renderGeneration || !block.isConnected) continue;
          console.warn('Previously repaired Mermaid failed during rerender; showing original.', error);
          block.mermaidDisplayMode = 'original';
          showMermaidError(
            block,
            block.mermaidOriginalError || error,
            block.mermaidSource || '',
            { repairAvailable: true },
          );
        }
        continue;
      }

      const originalSource = block.mermaidSource || '';
      const originalId = `threadshelf-mermaid-${generation}-${++this.mermaidSequence}`;
      try {
        const { svg } = await mermaid.render(originalId, originalSource);
        if (generation !== this.renderGeneration || !block.isConnected) continue;
        block.mermaidRepairSource = '';
        block.mermaidOriginalError = null;
        showMermaidSvg(block, svg, 'original');
        updateMermaidVersionToggle(block, false);
        continue;
      } catch (originalError) {
        if (generation !== this.renderGeneration || !block.isConnected) continue;
        block.mermaidOriginalError = originalError;

        const candidates = buildMermaidRepairCandidates(originalSource);
        let repaired = false;
        for (const candidate of candidates) {
          const repairId = `threadshelf-mermaid-auto-repair-${generation}-${++this.mermaidSequence}`;
          try {
            const { svg } = await mermaid.render(repairId, candidate);
            if (generation !== this.renderGeneration || !block.isConnected) return;
            block.mermaidRepairSource = candidate;
            block.mermaidDisplayMode = 'repaired';
            showMermaidSvg(block, svg, 'repaired');
            repaired = true;
            break;
          } catch (repairError) {
            console.debug('Mermaid repair candidate did not render.', repairError);
          }
        }

        if (!repaired) {
          console.warn('Mermaid rendering failed; no deterministic repair succeeded.', originalError);
          block.mermaidRepairSource = '';
          showMermaidError(block, originalError, originalSource, { repairAvailable: false });
        }
      }
    }
  }

  async toggleMermaidVersion(block) {
    if (!block?.mermaidRepairSource) return;

    if (block.mermaidDisplayMode === 'repaired') {
      block.mermaidDisplayMode = 'original';
      showMermaidError(
        block,
        block.mermaidOriginalError || 'The original Mermaid source did not render.',
        block.mermaidSource || '',
        { repairAvailable: true },
      );
      return;
    }

    const mermaid = configureMermaid();
    if (!mermaid) return;
    const diagram = block.querySelector('.mermaid-diagram');
    if (!diagram) return;

    diagram.setAttribute('aria-busy', 'true');
    const id = `threadshelf-mermaid-toggle-repair-${++this.mermaidSequence}`;
    try {
      const { svg } = await mermaid.render(id, block.mermaidRepairSource);
      if (!block.isConnected) return;
      block.mermaidDisplayMode = 'repaired';
      showMermaidSvg(block, svg, 'repaired');
    } catch (error) {
      if (!block.isConnected) return;
      console.warn('Stored Mermaid repair failed to rerender.', error);
      block.mermaidDisplayMode = 'original';
      showMermaidError(
        block,
        block.mermaidOriginalError || error,
        block.mermaidSource || '',
        { repairAvailable: true },
      );
    }
  }

  createMessageElement(message) {
    const messageDiv = document.createElement('article');
    messageDiv.className = `message ${message.role}`;
    messageDiv.dataset.messageId = message.message_id;
    messageDiv.dataset.role = message.role;
    messageDiv.sourceText = typeof message.content === 'string' ? message.content : String(message.content ?? '');
    if (Number.isInteger(message.turn_index)) messageDiv.dataset.turnIndex = String(message.turn_index);

    const collapseKind = message.role === 'user' ? 'prompt' : message.role === 'thinking' ? 'reasoning' : '';
    if (collapseKind) messageDiv.dataset.collapseKind = collapseKind;

    const contentId = `threadshelf-message-content-${++this.messageContentSequence}`;

    const headerDiv = document.createElement('div');
    headerDiv.className = 'message-header';

    const roleSpan = document.createElement('span');
    roleSpan.className = 'message-role';
    roleSpan.textContent = tr(({ assistant: 'Assistant', user: 'User', thinking: 'Reasoning', system: 'System', tool: 'Tool' })[message.role] || message.role);
    if (collapseKind === 'reasoning') {
      const reasoningToggle = document.createElement('button');
      reasoningToggle.type = 'button';
      reasoningToggle.className = 'reasoning-collapse-toggle';
      reasoningToggle.dataset.toggleMessageCollapse = '1';
      reasoningToggle.setAttribute('aria-controls', contentId);

      const chevron = createMessageCollapseChevron();
      reasoningToggle.append(chevron, roleSpan);
      headerDiv.appendChild(reasoningToggle);
    } else {
      headerDiv.appendChild(roleSpan);
    }

    if (message.model) {
      const modelSpan = document.createElement('span');
      modelSpan.className = 'message-model';
      modelSpan.textContent = message.model;
      headerDiv.appendChild(modelSpan);
    }

    const timeSpan = document.createElement('span');
    timeSpan.className = 'message-time';
    if (message.created_at) {
      const date = new Date(message.created_at);
      if (!Number.isNaN(date.getTime())) timeSpan.textContent = date.toLocaleString();
    }
    headerDiv.appendChild(timeSpan);

    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.className = 'message-copy-button';
    copyButton.dataset.copyMessage = '1';
    copyButton.dataset.defaultLabel = tr('Copy message');
    copyButton.textContent = tr('Copy message');
    headerDiv.appendChild(copyButton);

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    let content = this.processMessageContent(message.content, message.richContext || {}, message.role);
    if (this.currentQuery) content = highlightTextInHtml(content, this.currentQuery);
    contentDiv.innerHTML = content;
    mountMarkdownImages(contentDiv, { mode: this.remoteImagesMode, resolveImage: this.imageResolver,
      context: { ...this.imageContext, messageId: message.message_id || message.id || null } });

    const contentViewport = document.createElement('div');
    contentViewport.className = 'message-content-viewport';
    contentViewport.id = contentId;
    contentViewport.appendChild(contentDiv);
    messageDiv.append(headerDiv, contentViewport);

    if (collapseKind === 'prompt') {
      const promptToggle = document.createElement('button');
      promptToggle.type = 'button';
      promptToggle.className = 'prompt-expand-bar';
      promptToggle.dataset.toggleMessageCollapse = '1';
      promptToggle.setAttribute('aria-controls', contentId);

      const label = document.createElement('span');
      label.className = 'message-expand-label';
      label.textContent = tr('Show full prompt');

      const chevron = createMessageCollapseChevron();
      promptToggle.append(label, chevron);
      (this.promptExpandStyle === 'header-action' ? headerDiv : messageDiv).appendChild(promptToggle);
    }
    return messageDiv;
  }

  processMessageContent(content, context = {}, role = '') {
    const jsonCode = formatJsonResponse(content, role);
    // Use the established escaped code markup, syntax highlighting and copy
    // controls. JSON strings must not be interpreted as rich components or TeX.
    if (jsonCode !== null) return sanitizeRenderedHtml(markedRenderer.code({ text: jsonCode, lang: 'json' }));
    const plainMarkdown = (text) => {
      const protectedMath = protectMathInMarkdown(text);
      try {
        const html = marked.parse(protectedMath.content, { renderer: markedRenderer });
        return restoreMathPlaceholders(sanitizeRenderedHtml(html), protectedMath.ids);
      } catch (error) {
        discardMathRecords(protectedMath.ids);
        throw error;
      }
    };
    try {
      // Rich attribute literals remain untouched by Markdown or TeX; only actual
      // prose children enter the established Markdown/math/sanitizer pipeline.
      const rich = prepareRichMarkdown(content);
      if (rich.literalOnly) return `<pre class="rich-original-source">${escapeHtml(content)}</pre>`;
      return renderRichHtml(plainMarkdown(rich.content), rich.records, {
        renderMarkdown: plainMarkdown, t: tr, context,
      });
    } catch (error) {
      console.warn('Rich rendering failed; showing safe original Markdown.', error);
      try { return plainMarkdown(content); }
      catch { return escapeHtml(content).replace(/\n/g, '<br>'); }
    }
  }

  async handleCopy(event) {
    const messageToggle = event.target.closest('[data-toggle-message-collapse]');
    if (messageToggle && this.contentContainer.contains(messageToggle)) {
      event.preventDefault();
      this.toggleMessageCollapse(messageToggle.closest('.message'));
      return;
    }

    const versionToggle = event.target.closest('[data-toggle-mermaid-version]');
    if (versionToggle && this.contentContainer.contains(versionToggle)) {
      event.preventDefault();
      await this.toggleMermaidVersion(versionToggle.closest('.mermaid-block'));
      return;
    }

    const codeButton = event.target.closest('.code-copy-button');
    if (codeButton && this.contentContainer.contains(codeButton)) {
      event.preventDefault();
      const mermaidBlock = codeButton.closest('.mermaid-block');
      const code = codeButton.closest('pre')?.querySelector('code');
      const text = mermaidBlock ? currentMermaidSource(mermaidBlock) : code?.dataset.originalCode ?? code?.textContent ?? '';
      try {
        await copyTextToClipboard(text);
        codeButton.dataset.defaultLabel = tr('Copy');
        showCopyButtonStatus(codeButton, text ? tr('Copied') : tr('Empty'));
      } catch (error) {
        console.warn('Code copy failed:', error);
        showCopyButtonStatus(codeButton, tr('Failed'));
      }
      return;
    }

    const messageButton = event.target.closest('[data-copy-message]');
    if (!messageButton || !this.contentContainer.contains(messageButton)) return;
    const message = messageButton.closest('.message');
    const text = message?.sourceText ?? ''; // Original text and Markdown, without Reader controls.
    try {
      await copyTextToClipboard(text);
      showCopyButtonStatus(messageButton, text ? tr('Copied') : tr('Empty'));
    } catch (error) {
      console.warn('Message copy failed:', error);
      showCopyButtonStatus(messageButton, tr('Failed'));
    }
  }
}
