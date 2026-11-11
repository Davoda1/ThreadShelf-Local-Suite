import { tr } from './locale.js';
/** Desktop-only coordinator: untrusted HTML never enters this renderer's DOM. */
export class HtmlPreviewClient {
  constructor(container) {
    this.container = container;
    this.active = new Map();
    this.external = true;
    this.pending = false;
    this.dead = false;
    this.schedule = () => {
      if (!this.active.size || this.pending || this.dead) return;
      this.pending = true;
      requestAnimationFrame(() => {
        this.pending = false;
        this.update();
        // Compositor scrolling can advance before a scroll event is delivered.
        // Track every active frame; the geometry cache skips unchanged IPC.
        this.schedule();
      });
    };
    // Scroll events arrive before paint. Native placement must follow them now;
    // deferring another frame leaves the separate surface over old content.
    this.onScroll = () => this.update();
    window.addEventListener('resize', this.schedule);
    document.addEventListener('scroll', this.onScroll, true);
    this.observer = new MutationObserver(this.schedule);
    this.observer.observe(document.body, { attributes: true, childList: true, subtree: true, attributeFilter: ['class', 'style', 'hidden', 'open'] });
    this.resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(this.schedule) : null;
    this.resizeObserver?.observe(container);
    this.unsubscribe = window.desktop?.onHtmlPreviewEvent?.(event => {
      const item = this.active.get(event.id);
      if (!item) return;
      if (event.state === 'error') this.close(item.pre, event.message);
      else if (event.state === 'closed') this.close(item.pre);
      else if (event.state === 'ready') { item.node.textContent = ''; item.last = null; this.schedule(); }
    });
  }
  setExternalResources(enabled) {
    const value = enabled !== false;
    if (value !== this.external) { this.external = value; this.closeAll(); }
  }
  geometry(node) {
    // The document retains its complete 16:9 viewport. Only its visible part is
    // placed above the reader, so scrolling never paints over adjacent UI.
    const rect = node.getBoundingClientRect();
    let area = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    for (let ancestor = node.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor), box = ancestor.getBoundingClientRect();
      if (/(?:auto|scroll|hidden|clip)/.test(style.overflowX || style.overflow)) {
        const left = box.left + ancestor.clientLeft;
        area.left = Math.max(area.left, left);
        area.right = Math.min(area.right, left + ancestor.clientWidth);
      }
      if (/(?:auto|scroll|hidden|clip)/.test(style.overflowY || style.overflow)) {
        const top = box.top + ancestor.clientTop;
        area.top = Math.max(area.top, top);
        area.bottom = Math.min(area.bottom, top + ancestor.clientHeight);
      }
    }
    const fullX = Math.round(rect.left), fullY = Math.round(rect.top);
    const width = Math.max(1, Math.round(rect.width)), height = Math.max(1, Math.round(rect.height));
    const left = Math.max(0, fullX, Math.ceil(Math.max(rect.left, area.left)));
    const top = Math.max(0, fullY, Math.ceil(Math.max(rect.top, area.top)));
    const right = Math.min(innerWidth, fullX + width, Math.floor(Math.min(rect.right, area.right)));
    const bottom = Math.min(innerHeight, fullY + height, Math.floor(Math.min(rect.bottom, area.bottom)));
    const intersects = right > left && bottom > top && rect.width > 1 && rect.height > 1;
    const insetX = Math.min(2, (right - left) / 4), insetY = Math.min(2, (bottom - top) / 4);
    const points = [[left + insetX, top + insetY], [right - insetX, top + insetY],
      [left + insetX, bottom - insetY], [right - insetX, bottom - insetY], [(left + right) / 2, (top + bottom) / 2]];
    const visible = intersects && points.every(([x, y]) => {
      const hit = document.elementFromPoint(x, y);
      return hit && (hit === node || node.contains(hit));
    });
    return {
      bounds: intersects ? { x: left, y: top, width: right - left, height: bottom - top } : { x: 0, y: 0, width: 1, height: 1 },
      viewport: { width, height, offsetX: intersects ? left - fullX : 0, offsetY: intersects ? top - fullY : 0 },
      visible,
    };
  }
  async toggle(pre) {
    const existing = [...this.active.values()].find(item => item.pre === pre);
    if (existing) { this.close(pre); return; }
    const code = pre.querySelector('code'), node = pre.querySelector('.code-html-preview'), toggle = pre.querySelector('[data-toggle-html]');
    if (!code || !node || !toggle) return;
    if (!window.desktop?.invoke) { node.hidden = false; node.textContent = tr('HTML previews are available in the desktop application.'); return; }
    const id = 'html-' + crypto.randomUUID(), item = { id, pre, node, code, toggle, opened: false };
    this.active.set(id, item);
    delete node.dataset.previewError;
    node.textContent = '';
    node.hidden = false;
    code.hidden = true;
    toggle.textContent = tr('Code');
    toggle.setAttribute('aria-pressed', 'true');
    this.resizeObserver?.observe(node);
    pre.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    try {
      const geometry = this.geometry(node);
      await window.desktop.invoke('html.preview.open', { id, source: code.dataset.originalCode ?? code.textContent ?? '', language: pre.dataset.htmlFence || '', external: this.external, ...geometry });
      if (!this.active.has(id) || this.dead) { await window.desktop.invoke('html.preview.close', { id }); return; }
      // Opening crosses asynchronous native work. Recompute after it completes;
      // an earlier update must not cache geometry before the view exists.
      item.opened = true;
      item.last = null;
      this.schedule();
    } catch (error) { this.close(pre, String(error?.message || error)); }
  }
  update() {
    for (const item of this.active.values()) {
      if (!item.pre.isConnected) { this.close(item.pre); continue; }
      if (!item.opened) continue;
      const value = this.geometry(item.node), key = JSON.stringify(value);
      if (item.last === key) continue;
      item.last = key;
      void window.desktop.invoke('html.preview.update', { id: item.id, ...value }).then(result => {
        if (result?.ok === false && this.active.get(item.id) === item) this.close(item.pre);
      }).catch(() => this.close(item.pre));
    }
  }
  close(pre, message = '') {
    const item = [...this.active.values()].find(item => item.pre === pre);
    if (!item) return;
    this.active.delete(item.id);
    this.resizeObserver?.unobserve(item.node);
    item.code.hidden = false;
    item.node.hidden = !message;
    item.node.textContent = message;
    item.node.style.height = '';
    if (message) item.node.dataset.previewError = 'true';
    else delete item.node.dataset.previewError;
    item.toggle.textContent = tr('Render');
    item.toggle.setAttribute('aria-pressed', 'false');
    void window.desktop?.invoke('html.preview.close', { id: item.id }).catch(() => {});
  }
  closeAll() {
    for (const item of [...this.active.values()]) this.close(item.pre);
    void window.desktop?.invoke('html.preview.closeAll').catch(() => {});
  }
  destroy() {
    this.dead = true;
    this.closeAll();
    this.observer.disconnect();
    this.resizeObserver?.disconnect();
    window.removeEventListener('resize', this.schedule);
    document.removeEventListener('scroll', this.onScroll, true);
    this.unsubscribe?.();
  }
}
