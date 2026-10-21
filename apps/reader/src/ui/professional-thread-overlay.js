// Professional's fixed reading chrome overlays the existing conversation
// scrollport. No wrapper, extra scroll container or persisted setting is added.
export class ProfessionalThreadOverlay {
  constructor({ pane, position, onLayout = () => {} }) {
    this.pane = pane;
    this.position = position;
    this.onLayout = onLayout;
    this.root = pane.ownerDocument.documentElement;
    this.header = pane.querySelector('#threadHeader');
    this.chrome = ['#operationBanner', '#threadHeader', '#readerSearch']
      .map(selector => pane.querySelector(selector)).filter(Boolean);
    this.frame = 0;
    this.height = 0;
    this.active = false;
    this.destroyed = false;
    this.resizeObserver = new ResizeObserver(() => this.schedule());
    for (const node of this.chrome) this.resizeObserver.observe(node);
    this.mutationObserver = new MutationObserver(() => this.sync());
    this.mutationObserver.observe(this.root, { attributes: true, attributeFilter: ['data-ui-palette'] });
    for (const node of [pane, ...this.chrome]) {
      this.mutationObserver.observe(node, { attributes: true, attributeFilter: ['hidden'] });
    }
    this.sync();
  }

  schedule() {
    if (this.destroyed || this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.sync(); });
  }

  sync() {
    if (this.destroyed) return;
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    const professional = ['professional', 'platinum-plus'].includes(this.root.dataset.uiPalette);
    const active = professional
      && this.pane.isConnected && !this.pane.hidden
      && this.header && !this.header.hidden && this.header.childElementCount > 0;
    const height = active ? this.chrome.reduce((sum, node) =>
      sum + (node.hidden ? 0 : node.getBoundingClientRect().height), 0) : 0;
    const changed = this.active !== Boolean(active) || Math.abs(this.height - height) > .01;
    this.active = Boolean(active);
    this.height = height;
    this.pane.classList.toggle('professional-thread-overlay', this.active);
    if (this.active) this.pane.style.setProperty('--professional-thread-overlay-height', `${height}px`);
    else this.pane.style.removeProperty('--professional-thread-overlay-height');
    // Apply CSS first so the anchor is restored against the newly visible
    // viewport, including a search bar or operation banner appearing/disappearing.
    this.position.setViewportInset(height, { preserveHiddenAnchor: professional });
    if (changed) this.onLayout();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.mutationObserver.disconnect();
    this.pane.classList.remove('professional-thread-overlay');
    this.pane.style.removeProperty('--professional-thread-overlay-height');
    this.position.setViewportInset(0);
  }
}
