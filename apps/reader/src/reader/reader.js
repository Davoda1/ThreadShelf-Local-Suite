import { WaveBackground } from './wave-background.js';
import { turnToMessage, isHiddenThoughtsMessage } from './messages.js';
export { turnToMessage } from './messages.js';
import { highlighter as hljs } from './highlight.js';
import { ConversationRenderer } from './renderer.js';
import { ReadingPosition } from './reading-position.js';
import { createRichContextResolver } from './rich-context.js';
import { setRendererLocale, tr } from './locale.js';
import './reader.css';
import './rich-layout.css';
import './rich-charts.css';

let assetsReady;
function loadScript(name) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const embedded = window.__READER_ASSETS?.[name];
    script.src = typeof embedded === 'string' && embedded.startsWith('data:text/javascript;base64,') ? embedded : new URL(name, document.baseURI).href;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Bundled renderer asset could not load: ${name}`));
    document.head.append(script);
  });
}
function loadAssets() {
  if (!assetsReady) assetsReady = (async () => {
    window.hljs = hljs;
    window.MathJax = {
      options: { enableMenu: false }, startup: { typeset: false, ready() {
        const Menu = window.MathJax._.ui.menu.Menu.Menu;
        window.MathJax.config.options.MenuClass = class extends Menu { mergeUserSettings() {} saveUserSettings() {} };
        window.MathJax.startup.defaultReady();
      } }, svg: { fontCache: 'local' },
    };
    await Promise.all([loadScript('mathjax-tex-svg.js'), loadScript('mermaid.min.js')]);
    await window.MathJax?.startup?.promise;
  })();
  return assetsReady;
}

export class ReaderView {
  constructor({ container, onPosition = () => {}, onBookmark = () => {}, onExternal = () => {}, resolveImage = null, t, settings = {}, holidayStatus = null }) {
    Object.assign(this, { container, onPosition, onBookmark, onExternal, resolveImage, t });
    this.abort = new AbortController();
    this.currentMessages = []; this.navigatorItems = []; this.navigatorPinned = false;
    this.navigatorFrame = 0; this.activeNavigatorTurn = null; this.navigatorOpen = false;
    this.navigatorTargets = []; this.navigatorRailItems = []; this.navigatorSuppressFocusOpen = false;
    this.navigatorDismissed = false; this.navigatorCloseTimer = null; this.currentQuery = ''; this.generation = 0;
    this.bookmarks = []; this.savedPositions = new Map();
    container.classList.add('reader-view');
    container.innerHTML = `<div id="conversationContent" class="conversation-content" tabindex="-1"></div>
      <nav id="conversationNavigator" class="conversation-navigator" hidden>
        <button id="navigatorTrigger" class="navigator-trigger" type="button" aria-controls="navigatorPanel" aria-expanded="false">
          <span id="navigatorRailMarks" class="navigator-rail-marks" aria-hidden="true" tabindex="-1"></span></button>
        <div id="navigatorPanel" class="navigator-panel" aria-hidden="true" inert>
          <div class="navigator-heading"></div><div id="navigatorEntries" class="navigator-entries" tabindex="-1"></div>
        </div>
      </nav><div class="reader-announcement" role="status" aria-live="polite"></div>`;
    this.content = this.byId('conversationContent');
    this.renderer = new ConversationRenderer(this.content);
    this.waveBackground = new WaveBackground(container);
    this.waveBackground.setHolidayStatus(holidayStatus);
    this.position = new ReadingPosition(this.content, {
      remember: () => {}, position: identity => this.savedPositions.get(identity[0]),
      savePosition: (identity, value) => {
        this.savedPositions.set(identity[0], value);
        return this.onPosition({ ...value }, identity[0]);
      },
    }, this.renderer, message => this.announce(tr(message)));
    this.initializeNavigator();
    this.listen(container, 'click', event => {
      const link = event.target.closest('a[href]');
      if (link) {
        event.preventDefault(); const href = link.getAttribute('href');
        if (/^(https?:\/\/|mailto:)/i.test(href)) void this.onExternal(href);
      }
    });
    this.listen(container, 'keydown', event => {
      if (event.key === 'Escape' && this.navigatorOpen) {
        event.stopPropagation(); this.navigatorPinned = false; this.navigatorDismissed = true; this.setNavigatorOpen(false);
      }
    });
    this.listen(matchMedia('(prefers-color-scheme: dark)'), 'change', () => {
      if (!this.settings.theme || this.settings.theme === 'system') requestAnimationFrame(() => this.setSettings({}));
    });
    this.setSettings(settings);
  }
  listen(target, name, fn, options = {}) { target.addEventListener(name, fn, {...options, signal: this.abort.signal}); }
  byId(id) { return this.container.querySelector(`#${id}`); }
  announce(text) { const node = this.container.querySelector('.reader-announcement'); if (node) node.textContent = text; }
  async show(thread, { key, query = '', position, targetTurn, bookmarks = [], imageContext = {} } = {}) {
    const generation = ++this.generation;
    this.position.detach(); this.resetNavigator();
    this.waveBackground.setWelcome(false);
    this.waveBackground.setConversation(false);
    this.thread = thread; this.key = key || thread.id || '';
    this.imageContext = Object.freeze({...imageContext});
    const richContextFor = createRichContextResolver(thread);
    this.currentMessages = (thread.turns || []).map((turn, index) => ({...turnToMessage(turn, index), richContext: richContextFor(turn)}));
    const visibleMessages = this.currentMessages.filter(message => !isHiddenThoughtsMessage(message));
    this.bookmarks = bookmarks;
    this.currentQuery = query.trim();
    if (position) this.savedPositions.set(this.key, position);
    await loadAssets();
    if (generation !== this.generation) return;
    this.renderer.beginConversation(this.key);
    this.renderer.setImageResolver(this.resolveImage, this.imageContext);
    this.renderer.setSearchQuery(this.currentQuery);
    this.renderer.renderMessages(this.currentMessages);
    this.waveBackground.setConversation(visibleMessages.length > 0);
    this.addBookmarks(); this.buildNavigator();
    const targeted = targetTurn !== undefined && targetTurn !== null;
    this.position.attach([this.key], { explicit: targeted });
    this.refreshSearchMarks();
    if (targeted) {
      const target = typeof targetTurn === 'object' ? targetTurn : {turnIndex: targetTurn};
      this.scrollToTurn(target.turnIndex, true, target.role === 'ai' ? 'assistant' : target.role);
    } else if (this.currentQuery && this.currentSearchMarks.length && !position) this.jumpSearch();
    return { messages: visibleMessages.length, prompts: visibleMessages.filter(m => m.role === 'user').length };
  }
  setImageResolver(resolveImage) {
    this.resolveImage = typeof resolveImage === 'function' ? resolveImage : null;
    this.renderer.setImageResolver(this.resolveImage, this.imageContext || {});
  }
  setSettings(settings) {
    if (this.abort.signal.aborted) return;
    const old = this.settings || {};
    const previousVisualTheme = this.visualTheme;
    this.visualTheme = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    this.settings = { ...old, ...settings };
    setRendererLocale(this.settings.language, this.t);
    this.container.classList.toggle('reader-no-animation', this.settings.animations === false);
    this.container.classList.toggle('reader-high-contrast', !!this.settings.highContrast);
    this.container.style.setProperty('--font-size-multiplier', ({small:.875,normal:1,large:1.15,xl:1.3})[this.settings.fontSize] || 1);
    this.renderer.animationsEnabled = this.settings.animations !== false;
    this.renderer.setPromptExpandStyle(this.settings.promptExpandStyle);
    this.renderer.setRemoteImages(this.settings.remoteImages);
    this.waveBackground.setSettings(this.settings);
    this.renderer.setCompactMessagesEnabled(this.settings.compact !== false, {animate: false});
    this.byId('conversationNavigator').setAttribute('aria-label', tr('Conversation navigation'));
    this.byId('navigatorTrigger').setAttribute('aria-label', tr('Conversation navigator'));
    this.byId('navigatorTrigger').title = tr('Conversation navigator');
    this.byId('navigatorPanel').setAttribute('aria-label', tr('Prompts and responses'));
    this.container.querySelector('.navigator-heading').textContent = tr('Conversation outline');
    if (this.currentMessages.length && old.language !== this.settings.language) {
      this.renderer.renderMessages(this.currentMessages); this.addBookmarks(); this.buildNavigator(); this.refreshSearchMarks(); this.position.refreshNodes();
    } else if (this.currentMessages.length && (old.theme !== this.settings.theme || old.highContrast !== this.settings.highContrast || previousVisualTheme !== this.visualTheme)) this.renderer.rerenderMermaidDiagrams();
  }
  setActive(active) { this.waveBackground.setActive(active); }
  setWelcome(available) { this.waveBackground.setWelcome(available); }
  setHolidayStatus(status) { this.waveBackground.setHolidayStatus(status); }
  clear() {
    if (this.abort.signal.aborted) return;
    ++this.generation;
    // Detach flushes the current turn anchor before its nodes are removed.
    this.position.detach();
    this.resetNavigator();
    this.waveBackground.setWelcome(false);
    this.waveBackground.setConversation(false);
    this.thread = null; this.key = ''; this.imageContext = Object.freeze({}); this.currentMessages = []; this.bookmarks = [];
    this.currentQuery = ''; this.currentSearchMarks = []; this.currentSearchIndex = -1;
    this.renderer.beginConversation('');
    this.renderer.setSearchQuery('');
    // This also invalidates pending diagrams/math and disposes chart UI.
    this.renderer.renderMessages([]);
    this.content.replaceChildren();
    this.content.scrollTop = 0;
    this.announce('');
  }
  getPosition() { this.position.flush(); return this.position.capture(); }
  resume(value) { return this.position.restore(value || this.savedPositions.get(this.key)); }
  start() { this.position.beginning(); this.position.dirty = true; this.position.flush(); }
  scrollToTurn(turnIndex, focus = false, expectedRole) {
    const element = [...this.content.querySelectorAll('.message[data-turn-index]')].find(node =>
      Number(node.dataset.turnIndex) === Number(turnIndex) && (!expectedRole || node.dataset.role === expectedRole));
    if (!element) { this.announce(tr('That turn is no longer available.')); return false; }
    this.renderer.revealElement(element.querySelector('.message-content'));
    this.position.navigate(element, { focus, behavior: this.motion() });
    this.scheduleNavigatorTracking(); return true;
  }
  motion() { return this.settings.animations === false || matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'; }
  refreshSearchMarks() { this.currentSearchMarks = [...this.content.querySelectorAll('.highlight')]; this.currentSearchIndex = this.currentSearchMarks.length ? 0 : -1; }
  find(query, direction = 1) {
    const next = String(query || '').trim();
    if (next !== this.currentQuery) {
      this.currentQuery = next; this.renderer.setSearchQuery(next); this.renderer.renderMessages(this.currentMessages);
      this.addBookmarks(); this.syncNavigatorTargets(); this.refreshSearchMarks(); this.position.refreshNodes();
    } else if (this.currentSearchMarks?.length) {
      this.currentSearchIndex = (this.currentSearchIndex + direction + this.currentSearchMarks.length) % this.currentSearchMarks.length;
    }
    this.jumpSearch();
    return { current: this.currentSearchIndex + 1, total: this.currentSearchMarks?.length || 0 };
  }
  jumpSearch() {
    for (const mark of this.currentSearchMarks || []) mark.classList.remove('current');
    const current = this.currentSearchMarks?.[this.currentSearchIndex];
    if (!current) return;
    current.classList.add('current'); this.renderer.revealElement(current);
    this.position.navigate(current, {behavior: this.motion()});
  }
  setBookmarks(bookmarks = []) { this.bookmarks = bookmarks; this.addBookmarks(); }
  addBookmarks() {
    for (const node of this.content.querySelectorAll('.message[data-turn-index]')) {
      node.querySelector('.bookmark-message')?.remove();
      const button = document.createElement('button'); button.type = 'button'; button.className = 'bookmark-message';
      const bookmark = { turnIndex: Number(node.dataset.turnIndex), role: node.dataset.role, title: this.thread?.title || '', text: (node.sourceText || '').slice(0, 150) };
      let marked = this.bookmarks.some(b => (!b.key || b.key === this.key) && b.turnIndex === bookmark.turnIndex && (b.role === bookmark.role || b.role === 'ai' && bookmark.role === 'assistant'));
      const update = () => {button.textContent = tr(marked ? 'Bookmarked' : 'Bookmark'); button.setAttribute('aria-pressed', String(marked)); button.title = tr(marked ? 'Remove bookmark' : 'Bookmark this message');};
      update();
      button.addEventListener('click', async () => {
        button.disabled = true;
        try { await this.onBookmark({...bookmark, key: this.key, remove: marked}); marked = !marked;
          this.bookmarks = this.bookmarks.filter(b => b.turnIndex !== bookmark.turnIndex || b.role !== bookmark.role);
          if (marked) this.bookmarks.push({...bookmark, key:this.key}); update();
        } catch (error) { this.announce(tr('Reading data could not be saved.')); } finally {button.disabled = false;}
      });
      node.querySelector('.message-header').append(button);
    }
  }
  destroy() {
    this.generation++; this.waveBackground.destroy(); this.position.destroy(); this.renderer.destroy(); this.abort.abort();
    this.navigatorMessageObserver?.disconnect(); this.navigatorResizeObserver?.disconnect();
    clearTimeout(this.navigatorCloseTimer); cancelAnimationFrame(this.navigatorFrame);
    this.navigatorFrame = 0; this.navigatorTargets = []; this.container.replaceChildren();
  }
  initializeNavigator() {
    const nav = this.byId('conversationNavigator');
    const trigger = this.byId('navigatorTrigger');
    const panel = this.byId('navigatorPanel');
    const content = this.byId('conversationContent');
    const cancelClose = () => {
      clearTimeout(this.navigatorCloseTimer);
      this.navigatorCloseTimer = null;
    };
    const scheduleClose = () => {
      cancelClose();
      this.navigatorCloseTimer = setTimeout(() => {
        if (!this.navigatorPinned && !nav.contains(document.activeElement)
          && !trigger.matches(':hover') && !panel.matches(':hover')) this.setNavigatorOpen(false);
      }, 100);
    };
    trigger.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse') event.preventDefault();
    });
    trigger.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab' || event.shiftKey || !this.navigatorOpen) return;
      const firstEntry = this.container.querySelector('#navigatorEntries .navigator-entry');
      if (!firstEntry) return;
      event.preventDefault();
      firstEntry.focus({ preventScroll: true });
      this.revealNavigatorItem(firstEntry, this.byId('navigatorEntries'));
    });
    trigger.addEventListener('click', () => {
      cancelClose();
      this.navigatorPinned = !this.navigatorPinned;
      this.navigatorDismissed = !this.navigatorPinned;
      this.setNavigatorOpen(this.navigatorPinned);
    });
    trigger.addEventListener('pointerenter', (event) => {
      cancelClose();
      if (event.pointerType !== 'touch' && !this.navigatorDismissed) this.setNavigatorOpen(true);
    });
    panel.addEventListener('pointerenter', cancelClose);
    trigger.addEventListener('pointerleave', () => {
      this.navigatorDismissed = false;
      scheduleClose();
    });
    panel.addEventListener('pointerleave', scheduleClose);
    nav.addEventListener('focusin', (event) => {
      if (!this.navigatorSuppressFocusOpen && !this.navigatorDismissed) this.setNavigatorOpen(true);
      if (this.navigatorOpen && event.target.classList?.contains('navigator-entry')) {
        this.revealNavigatorItem(event.target, this.byId('navigatorEntries'));
      }
    });
    nav.addEventListener('focusout', (event) => {
      // During Tab, activeElement may briefly be BODY. relatedTarget already
      // identifies the next entry, so never hide it during an internal move.
      if (event.relatedTarget && nav.contains(event.relatedTarget)) return;
      requestAnimationFrame(() => {
        if (nav.contains(document.activeElement)) return;
        this.navigatorDismissed = false;
        if (!this.navigatorPinned && !trigger.matches(':hover') && !panel.matches(':hover')) {
          this.setNavigatorOpen(false);
        }
      });
    });
    this.listen(document, 'pointerdown', (event) => {
      if (this.navigatorPinned && !nav.contains(event.target)) {
        this.navigatorPinned = false;
        this.navigatorDismissed = true;
        this.setNavigatorOpen(false);
      }
    });
    content.addEventListener('scroll', () => this.scheduleNavigatorTracking(), { passive: true });
    this.byId('navigatorEntries').addEventListener('scroll', () => this.updateNavigatorFades(), { passive: true });
    this.byId('navigatorRailMarks').addEventListener('scroll', () => this.updateNavigatorFades(), { passive: true });
    this.listen(window, 'resize', () => this.scheduleNavigatorTracking(), { passive: true });
    this.navigatorResizeObserver = new ResizeObserver(() => this.scheduleNavigatorTracking());
    this.navigatorResizeObserver.observe(content);
    // The scroll container keeps its own size when messages expand or finish
    // rendering. Observe the messages themselves so location tracking follows
    // Compact, Mermaid, MathJax, and font changes without requiring a scroll.
    this.navigatorMessageObserver = new ResizeObserver(() => this.scheduleNavigatorTracking());
  }

  setNavigatorOpen(open) {
    const nav = this.byId('conversationNavigator');
    if (nav.hidden) return;
    if (this.navigatorOpen === open) return;
    if (!open && this.byId('navigatorPanel').contains(document.activeElement)) {
      this.navigatorSuppressFocusOpen = true;
      this.byId('navigatorTrigger').focus({ preventScroll: true });
      this.navigatorSuppressFocusOpen = false;
    }
    this.navigatorOpen = open;
    nav.classList.toggle('open', open);
    this.byId('navigatorTrigger').setAttribute('aria-expanded', String(open));
    const panel = this.byId('navigatorPanel');
    panel.inert = !open;
    panel.setAttribute('aria-hidden', String(!open));
    if (open) {
      this.scrollActiveNavigatorEntry();
      requestAnimationFrame(() => this.updateNavigatorFades());
    }
  }

  resetNavigator() {
    clearTimeout(this.navigatorCloseTimer);
    cancelAnimationFrame(this.navigatorFrame);
    this.navigatorFrame = 0;
    this.navigatorMessageObserver?.disconnect();
    this.navigatorTargets = [];
    this.navigatorRailItems = [];
    this.navigatorPinned = false;
    this.navigatorDismissed = false;
    this.navigatorItems = [];
    this.activeNavigatorTurn = null;
    this.navigatorOpen = false;
    const nav = this.byId('conversationNavigator');
    nav.hidden = true;
    nav.classList.remove('open');
    this.byId('navigatorTrigger').setAttribute('aria-expanded', 'false');
    const panel = this.byId('navigatorPanel');
    panel.inert = true;
    panel.setAttribute('aria-hidden', 'true');
    this.byId('navigatorEntries').replaceChildren();
    this.byId('navigatorRailMarks').replaceChildren();
  }

  buildNavigator() {
    this.resetNavigator();
    // An outline is useful only when there is another user prompt to navigate to.
    // Assistant and reasoning turns do not increase the conversation's prompt count.
    if (this.currentMessages.filter((message) => message.role === 'user' && String(message.content ?? '').trim()).length < 2) return;
    let prompt = 0;
    let response = 0;
    const list = this.byId('navigatorEntries');
    const fragment = document.createDocumentFragment();
    const railFragment = document.createDocumentFragment();
    for (const message of this.currentMessages) {
      if (isHiddenThoughtsMessage(message)) continue;
      if ((message.role !== 'user' && message.role !== 'assistant') || !String(message.content ?? '').trim()) continue;
      if (message.role === 'user') {
        prompt++; response = 0;
      } else {
        response++;
      }
      if (message.role === 'user' || !this.navigatorRailItems.length) {
        const mark = document.createElement('span');
        mark.className = 'navigator-rail-mark';
        this.navigatorRailItems.push(mark);
        railFragment.append(mark);
      }
      const label = message.role === 'user' ? `${tr('Prompt')} ${prompt}`
        : prompt ? `${tr('Response')} ${prompt}${response > 1 ? `.${response}` : ''}`
          : `${tr('Opening response')} ${response}`;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `navigator-entry ${message.role}`;
      button.dataset.turnIndex = String(message.turn_index);
      button.dataset.role = message.role;
      button.dataset.railIndex = String(this.navigatorRailItems.length - 1);
      const title = document.createElement('strong');
      title.textContent = label;
      const snippet = document.createElement('span');
      snippet.className = 'navigator-snippet';
      const raw = String(message.content ?? '').replace(/<[^>]*>/g, ' ').replace(/[`*_#\[\]()>|]/g, ' ').replace(/\s+/g, ' ').trim();
      snippet.textContent = raw.length > 120 ? `${raw.slice(0, 117)}…` : raw || tr('(Empty message)');
      button.append(title, snippet);
      button.setAttribute('aria-label', `${label}: ${snippet.textContent}`);
      button.addEventListener('click', () => {
        this.scrollToTurn(message.turn_index, true, message.role);
        this.navigatorPinned = false;
        this.navigatorDismissed = true;
        this.setNavigatorOpen(false);
      });
      this.navigatorItems.push(button);
      fragment.append(button);
    }
    list.append(fragment);
    this.byId('navigatorRailMarks').append(railFragment);
    if (this.navigatorItems.length < 2) {
      this.resetNavigator();
      return;
    }
    this.byId('conversationNavigator').hidden = false;
    this.syncNavigatorTargets();
    this.scheduleNavigatorTracking();
  }

  syncNavigatorTargets() {
    this.navigatorMessageObserver?.disconnect();
    const messages = this.container.querySelectorAll('#conversationContent .message[data-turn-index]');
    const byTurn = new Map([...messages].map((message) => [`${message.dataset.turnIndex}:${message.dataset.role}`, message]));
    this.navigatorTargets = this.navigatorItems
      .map((item) => ({ item, message: byTurn.get(`${item.dataset.turnIndex}:${item.dataset.role}`) }))
      .filter(({ message }) => Boolean(message));
    // Reasoning has no outline row, but expanding it moves the outline targets.
    for (const message of messages) this.navigatorMessageObserver?.observe(message);
  }

  scheduleNavigatorTracking() {
    // ResizeObserver and media callbacks already queued before destroy can still
    // arrive after the shell replaced this reader. They must not touch retired DOM.
    if (this.abort.signal.aborted || this.navigatorFrame) return;
    this.navigatorFrame = requestAnimationFrame(() => {
      this.navigatorFrame = 0;
      if (this.abort.signal.aborted || this.navigatorTargets.length < 2) return;
      const content = this.byId('conversationContent');
      if (!content?.isConnected) return;
      const inset = this.position.viewportInset;
      const threshold = content.getBoundingClientRect().top + inset + Math.min(120, Math.max(0, content.clientHeight - inset) / 3);
      let nearest = this.navigatorTargets[0].item;
      for (const { item, message } of this.navigatorTargets) {
        if (message.getBoundingClientRect().top <= threshold) nearest = item;
        else break;
      }
      if (nearest !== this.activeNavigatorTurn) {
        this.activeNavigatorTurn?.classList.remove('active');
        this.activeNavigatorTurn?.removeAttribute('aria-current');
        this.activeNavigatorTurn = nearest;
        nearest.classList.add('active');
        nearest.setAttribute('aria-current', 'location');
      }
      const activeRailIndex = Number(nearest.dataset.railIndex);
      this.navigatorRailItems.forEach((mark, index) => mark.classList.toggle('active', index === activeRailIndex));
      const rail = this.byId('navigatorRailMarks');
      const mark = this.navigatorRailItems[activeRailIndex];
      if (mark) this.revealNavigatorItem(mark, rail, true);
      this.updateNavigatorFades();
    });
  }

  scrollActiveNavigatorEntry() {
    const list = this.byId('navigatorEntries');
    const item = this.activeNavigatorTurn;
    if (!item) return;
    this.revealNavigatorItem(item, list, true);
  }

  revealNavigatorItem(item, list, center = false) {
    const itemRect = item.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    const top = itemRect.top - listRect.top + list.scrollTop;
    const bottom = top + itemRect.height;
    const margin = Math.min(4, list.clientHeight / 8);
    if (top < list.scrollTop + margin || bottom > list.scrollTop + list.clientHeight - margin) {
      list.scrollTop = center
        ? top - (list.clientHeight - itemRect.height) / 2
        : top < list.scrollTop + margin ? top - margin : bottom - list.clientHeight + margin;
    }
  }

  updateNavigatorFades() {
    for (const id of ['navigatorEntries', 'navigatorRailMarks']) {
      const list = this.byId(id);
      list.classList.toggle('can-scroll-up', list.scrollTop > 2);
      list.classList.toggle('can-scroll-down', list.scrollTop + list.clientHeight < list.scrollHeight - 2);
    }
  }

}
