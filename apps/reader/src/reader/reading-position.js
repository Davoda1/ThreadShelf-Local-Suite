// Keep a viewport anchor inside an original turn, independent of absolute pixels.
export class ReadingPosition {
  constructor(container, store, renderer, announce) {
    Object.assign(this, { container, store, renderer, announce });
    this.abort = new AbortController();
    this.nodes = [];
    this.anchor = null;
    this.identity = null;
    this.dirty = false;
    this.frame = 0;
    this.expectedScroll = null;
    this.geometry = null;
    this.atBeginning = true;
    this.navigationTarget = null;
    this.viewportInset = 0;
    this.preserveHiddenAnchor = false;
    this.observer = new ResizeObserver(() => this.scheduleLayout());
    container.addEventListener('scroll', () => this.onScroll(), { passive: true, signal: this.abort.signal });
    for (const name of ['wheel', 'touchmove', 'pointerdown']) {
      container.addEventListener(name, () => this.interrupt(), { passive: true, signal: this.abort.signal });
    }
    container.addEventListener('keydown', (event) => {
      if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) this.interrupt();
    }, {signal: this.abort.signal});
    window.addEventListener('pagehide', () => this.flush(), {signal: this.abort.signal});
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.flush(); }, {signal: this.abort.signal});
  }

  destroy() { this.detach(); this.abort.abort(); }

  detach() {
    this.flush();
    clearTimeout(this.timer);
    clearTimeout(this.settleTimer);
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.observer.disconnect();
    this.nodes = [];
    this.identity = null;
    this.anchor = null;
    this.expectedScroll = null;
    this.geometry = null;
    this.atBeginning = true;
    this.navigationTarget = null;
    this.navigating = false;
    this.dirty = false;
  }

  attach(identity, { explicit = false } = {}) {
    this.identity = identity;
    this.observeWrite(() => this.store.remember(identity));
    const saved = explicit ? null : this.store.position(identity);
    this.refreshNodes(false);
    this.anchor = saved ? { ...saved } : null;
    this.atBeginning = !saved;
    if (this.anchor) {
      let node = this.find(this.anchor);
      if (!node && this.nodes.length) {
        node = this.nodes.reduce((best, next) => Math.abs(Number(next.dataset.turnIndex) - saved.turnIndex)
          < Math.abs(Number(best.dataset.turnIndex) - saved.turnIndex) ? next : best);
        this.anchor = { turnIndex: Number(node.dataset.turnIndex), role: this.role(node), offset: 0, expanded: false };
        this.announce('Saved turn is no longer available. Resumed at the nearest available turn.');
      } else if (node) this.announce('Resumed your saved reading position.');
      if (node && this.anchor.expanded) this.renderer.revealElement(node.querySelector('.message-content'));
      this.applyAnchor();
    } else {
      this.setScroll(0);
      this.anchor = this.capture();
    }
    this.scheduleLayout();
  }

  restore(saved = this.identity && this.store.position(this.identity)) {
    if (!saved || !this.identity || !this.nodes.length) return false;
    if (saved.identity && JSON.stringify(saved.identity) !== JSON.stringify(this.identity)) return false;
    this.forget();
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.anchor = { ...saved };
    this.atBeginning = false;
    let node = this.find(this.anchor);
    if (!node) {
      node = this.nodes.reduce((best, next) => Math.abs(Number(next.dataset.turnIndex) - saved.turnIndex)
        < Math.abs(Number(best.dataset.turnIndex) - saved.turnIndex) ? next : best);
      this.anchor = { turnIndex: Number(node.dataset.turnIndex), role: this.role(node), offset: 0, expanded: false };
      this.announce('Saved turn is no longer available. Resumed at the nearest available turn.');
    } else this.announce('Returned to the saved reading position.');
    if (this.anchor.expanded) this.renderer.revealElement(node.querySelector('.message-content'));
    this.applyAnchor();
    this.scheduleLayout();
    return true;
  }

  observeWrite(write) {
    // Autosaves are asynchronous server writes. Never announce durable success
    // here, and consume failures so a background save cannot reject unhandled.
    const failed = () => this.announce(this.store.notice || 'Reading data could not be saved.');
    try {
      Promise.resolve(write()).then((result) => { if (result === false && !this.store.saving) failed(); }, failed);
    } catch { failed(); }
  }

  role(node) { return node.dataset.role || (node.classList.contains('user') ? 'user' : node.classList.contains('thinking') ? 'thinking' : 'assistant'); }
  find(anchor) { return this.nodes.find((node) => Number(node.dataset.turnIndex) === anchor?.turnIndex && this.role(node) === anchor?.role); }
  refreshNodes(preserve = true) {
    this.observer.disconnect();
    this.nodes = [...this.container.querySelectorAll('.message[data-turn-index]')];
    this.observer.observe(this.container);
    this.nodes.forEach((node) => this.observer.observe(node));
    if (preserve) this.scheduleLayout();
  }

  capture() {
    if (!this.nodes.length) return null;
    const line = this.container.getBoundingClientRect().top + this.viewportInset + 16;
    const node = this.nodes.find((item) => item.getBoundingClientRect().bottom > line) || this.nodes.at(-1);
    const rect = node.getBoundingClientRect();
    return { turnIndex: Number(node.dataset.turnIndex), role: this.role(node),
      offset: Math.max(-1, Math.min(1, (line - rect.top) / Math.max(1, rect.height))),
      expanded: node.classList.contains('is-message-expanded') };
  }

  setScroll(top) {
    this.container.scrollTo({ top, behavior: 'instant' });
    this.expectedScroll = this.container.scrollTop;
  }
  setViewportInset(top, { preserveHiddenAnchor = false } = {}) {
    this.preserveHiddenAnchor = Boolean(preserveHiddenAnchor);
    const value = Number(top);
    const inset = Number.isFinite(value) ? Math.max(0, value) : 0;
    if (inset === this.viewportInset) return;
    this.viewportInset = inset;
    // The source-turn anchor belongs to the unobscured reading area. Moving
    // chrome or previewing another palette is a layout change, never progress.
    this.applyAnchor();
    if (this.container.clientHeight > 0) this.scheduleLayout();
  }
  measureGeometry() {
    return [this.container.clientWidth, this.container.clientHeight, this.container.scrollHeight, this.viewportInset];
  }
  geometryChanged(geometry) {
    return this.geometry && geometry.some((value, index) => value !== this.geometry[index]);
  }
  applyAnchor() {
    // The overlay controller opts in while Professional is selected, including
    // Activity while its pane is hidden. Other palettes keep their existing
    // layout behavior. Resume this anchor when real geometry exists again.
    if (this.preserveHiddenAnchor && this.container.clientHeight <= 0) return;
    const geometry = this.measureGeometry();
    this.realignNavigation(geometry);
    this.geometry = geometry;
    const node = this.find(this.anchor);
    if (!node || this.navigating) return;
    if (this.atBeginning) {
      this.setScroll(0);
      this.anchor = this.capture();
      return;
    }
    const rect = node.getBoundingClientRect();
    const top = this.container.scrollTop + rect.top - this.container.getBoundingClientRect().top
      + rect.height * this.anchor.offset - this.viewportInset - 16;
    if (Math.abs(top - this.container.scrollTop) > 0.75) this.setScroll(top);
    // At either boundary the old viewport offset may be impossible to retain.
    // Keep the in-memory anchor truthful without creating a new saved position.
    const maximum = Math.max(0, this.container.scrollHeight - this.container.clientHeight);
    if (top < -0.75 || top > maximum + 0.75) {
      this.anchor = this.capture();
      this.atBeginning = this.container.scrollTop < 0.75;
    }
  }
  scheduleLayout() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.applyAnchor(); });
  }
  interrupt() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    clearTimeout(this.settleTimer);
    // Reflow may clamp scrollTop before the pending ResizeObserver callback.
    // Restore that layout change before accepting the next real user movement.
    if (!this.navigating && this.anchor && this.geometryChanged(this.measureGeometry())) this.applyAnchor();
    this.navigating = false;
    this.navigationTarget = null;
    this.expectedScroll = null;
    this.anchor = this.capture();
    this.atBeginning = this.container.scrollTop < 0.75;
    this.geometry = this.measureGeometry();
  }
  onScroll() {
    if (!this.identity) return;
    const geometry = this.measureGeometry();
    this.realignNavigation(geometry);
    if (!this.navigating && this.anchor && this.geometryChanged(geometry)) {
      // A native resize/clamp scroll is delivered before ResizeObserver. It is
      // not user progress and must not overwrite the pre-reflow source anchor.
      this.applyAnchor();
      return;
    }
    this.geometry = geometry;
    if (this.expectedScroll !== null && Math.abs(this.container.scrollTop - this.expectedScroll) < 1) return;
    this.expectedScroll = null;
    if (this.navigating) {
      clearTimeout(this.settleTimer);
      this.settleTimer = setTimeout(() => this.finishNavigation(), 140);
      return;
    }
    this.anchor = this.capture();
    this.atBeginning = this.container.scrollTop < 0.75;
    this.dirty = Boolean(this.anchor);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 400);
  }
  flush() {
    clearTimeout(this.timer);
    if (this.navigating) this.finishNavigation();
    if (this.dirty && this.identity && this.anchor) {
      const node = this.find(this.anchor);
      if (node) this.anchor.expanded = node.classList.contains('is-message-expanded');
      const identity = [...this.identity];
      const anchor = { ...this.anchor };
      this.observeWrite(() => this.store.savePosition(identity, anchor));
    }
    this.dirty = false;
  }
  navigate(element, { focus = false, behavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' } = {}) {
    this.interrupt();
    this.navigating = true;
    this.navigationTarget = element;
    this.atBeginning = false;
    this.anchor = null;
    if (focus) { element.tabIndex = -1; element.focus({ preventScroll: true }); }
    element.scrollIntoView({ behavior, block: 'center' });
    this.settleTimer = setTimeout(() => this.finishNavigation(), 160);
  }
  realignNavigation(geometry) {
    if (this.navigating && this.navigationTarget?.isConnected && this.geometryChanged(geometry)) {
      // A dock or late-rendered block may move an explicit target mid-jump.
      // Real user input clears navigationTarget in interrupt().
      this.navigationTarget.scrollIntoView({ behavior: 'instant', block: 'center' });
    }
  }
  finishNavigation() {
    clearTimeout(this.settleTimer);
    if (!this.navigating) return;
    // With overlaid chrome, a heavy Find rerender can reach the settle deadline before Chromium has
    // painted its first smooth-scroll frame. Complete the requested target
    // before capturing progress; otherwise a zero scrollTop becomes a false
    // "at beginning" anchor and the next chrome reflow cancels the jump.
    // Real wheel/pointer/keyboard input calls interrupt(), which clears this
    // target and prevents a completed navigation from overriding user intent.
    if (this.viewportInset > 0 && this.navigationTarget?.isConnected) {
      this.navigationTarget.scrollIntoView({ behavior: 'instant', block: 'center' });
      this.expectedScroll = this.container.scrollTop;
    }
    this.navigating = false;
    this.navigationTarget = null;
    this.anchor = this.capture();
    this.atBeginning = this.container.scrollTop < 0.75;
    this.geometry = this.measureGeometry();
    this.dirty = Boolean(this.anchor);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 400);
  }
  forget() {
    clearTimeout(this.timer);
    clearTimeout(this.settleTimer);
    this.navigating = false;
    this.navigationTarget = null;
    this.dirty = false;
  }
  beginning() {
    this.forget();
    this.setScroll(0);
    this.atBeginning = true;
    this.anchor = this.capture();
    this.scheduleLayout();
  }
}
