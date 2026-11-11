import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const alternative = false;
const clientFile = new URL('../src/reader/html-preview-client.js', import.meta.url);
const clean = value => JSON.parse(JSON.stringify(value));
function setup() {
  const calls = [], frames = [], observed = new Set(), listeners = new Map();
  let releaseOpen, eventListener;
  const blockedOpen = new Promise(resolve => { releaseOpen = resolve; });
  const invoke = (action, args) => {
    calls.push({ action, args: clean(args ?? {}) });
    return action === 'html.preview.open' ? blockedOpen : Promise.resolve({ ok: true });
  };
  const bridge = { invoke, htmlPreview: invoke, onHtmlPreviewEvent(fn) { eventListener = fn; return () => {}; } };
  const context = {
    console, innerWidth: 1800, innerHeight: 1100,
    crypto: { randomUUID: () => 'synthetic-preview' },
    window: { desktop: bridge, alternative: bridge, addEventListener() {}, removeEventListener() {} },
    document: { body: {}, addEventListener(type, fn) { listeners.set(type, fn); }, removeEventListener(type, fn) { if (listeners.get(type) === fn) listeners.delete(type); }, elementFromPoint() { return context.hit; } },
    requestAnimationFrame(fn) { frames.push(fn); },
    getComputedStyle: node => node.computed ?? { overflowX: 'visible', overflowY: 'visible' },
    MutationObserver: class { observe() {} disconnect() {} },
    ResizeObserver: class { observe(node) { observed.add(node); } unobserve(node) { observed.delete(node); } disconnect() { observed.clear(); } },
    tr: value => value,
  };
  vm.createContext(context);
  let source = fs.readFileSync(clientFile, 'utf8');
  source = source.replace(/^import[^\n]+\n/, '').replace('export class HtmlPreviewClient', 'class HtmlPreviewClient');
  if (alternative) source += '\n globalThis.Client = window.TSAHtmlPreviewClient;';
  else source += '\n globalThis.Client = HtmlPreviewClient;';
  vm.runInContext(source, context);
  const codeParent = { hidden: false };
  const original = '<!doctype html>\n<html><body>Source & <literal></body></html>';
  const code = { hidden: false, dataset: { originalCode: original }, textContent: '1 numbered display only', parentElement: codeParent };
  const toggle = { textContent: 'Render', setAttribute(name, value) { this[name] = value; } };
  const pre = { isConnected: true, dataset: { htmlFence: 'html' }, parentElement: null,
    computed: { overflowX: 'hidden', overflowY: 'hidden' }, clientLeft: 1, clientTop: 1, clientWidth: 1700, clientHeight: 1000,
    getBoundingClientRect() { return { left: 20, top: 50, right: 1722, bottom: 1052, width: 1702, height: 1002 }; },
    scrollIntoView() {}, querySelector(selector) { return selector === 'code' ? code : selector === '[data-toggle-html]' ? toggle : node; } };
  const node = { hidden: true, style: {}, dataset: {}, textContent: '', parentElement: pre, rect: { left: 40, top: 100, width: 1600, height: 900 },
    getBoundingClientRect() { const r = this.rect, height = parseFloat(this.style.height) || r.height; return { ...r, height, right: r.left + r.width, bottom: r.top + height }; },
    contains(hit) { return hit === this; } };
  context.hit = node;
  const client = new context.Client(pre);
  const flush = () => { for (const frame of frames.splice(0)) frame(); };
  return { context, client, node, pre, code, codeParent, toggle, calls, frames, observed, listeners, original, flush, releaseOpen,
    event: value => eventListener(value) };
}

test('native geometry retains the full layout surface without a small fixed-height limit', () => {
  const s = setup();
  const value = clean(s.client.geometry(s.node));
  assert.equal(value.viewport.width, 1600);
  assert.equal(value.viewport.height, 900);
  assert.ok(value.viewport.height > 320);
});

test('full viewport is retained while scrolling clips only visible content', () => {
  const s = setup();
  s.context.innerHeight = 600;
  s.node.rect = { left: 40, top: -200, width: 1600, height: 900 };
  s.pre.clientHeight = 500;
  const value = clean(s.client.geometry(s.node));
  assert.equal(value.visible, true);
  assert.deepEqual(value.bounds, { x: 40, y: 51, width: 1600, height: 500 });
  assert.deepEqual(value.viewport, { width: 1600, height: 900, offsetX: 0, offsetY: 251 });
  assert.equal(value.bounds.y + value.bounds.height, 551);
});

test('horizontal clipping accounts for ancestor borders and scrollbars', () => {
  const s = setup();
  s.pre.clientLeft = 2; s.pre.clientWidth = 500;
  s.node.rect = { left: -30, top: 100, width: 1600, height: 900 };
  const value = clean(s.client.geometry(s.node));
  assert.equal(value.visible, true);
  assert.equal(value.bounds.x, 22); assert.equal(value.bounds.width, 500);
  assert.equal(value.viewport.width, 1600); assert.equal(value.viewport.offsetX, 52);
});

test('modal occlusion and entirely off-screen previews hide native surfaces', () => {
  const s = setup();
  s.context.hit = {};
  assert.equal(s.client.geometry(s.node).visible, false);
  s.context.hit = s.node;
  s.node.rect.top = 2000;
  const value = clean(s.client.geometry(s.node));
  assert.equal(value.visible, false);
  assert.deepEqual(value.bounds, { x: 0, y: 0, width: 1, height: 1 });
});

test('opening recomputes layout after native work instead of caching a lost early update', async () => {
  const s = setup();
  const pending = s.client.toggle(s.pre);
  assert.equal(s.calls.length, 1);
  assert.equal(s.calls[0].args.source, s.original);
  const old = s.calls[0].args.bounds.y;
  s.node.rect.top += 150;
  s.client.update();
  assert.equal(s.calls.length, 1, 'there is no native view to update yet');
  s.releaseOpen({ id: 'html-synthetic-preview' });
  await pending; s.flush();
  const update = s.calls.find(call => call.action === 'html.preview.update');
  assert.ok(update); assert.equal(update.args.bounds.y, old + 150);
  assert.equal(s.code.hidden, true);
  assert.equal(s.node.textContent, '');
});

test('switching back restores original code and removes preview observation', async () => {
  const s = setup(); s.releaseOpen({});
  await s.client.toggle(s.pre); s.flush();
  assert.equal(s.observed.has(s.node), true);
  await s.client.toggle(s.pre);
  assert.equal(s.client.active.size, 0);
  assert.equal(s.code.hidden, false); assert.equal(s.codeParent.hidden, false);
  assert.equal(s.code.dataset.originalCode, s.original);
  assert.equal(s.node.hidden, true); assert.equal(s.toggle.textContent, 'Render');
  assert.equal(s.observed.has(s.node), false);
});

test('scroll events update native placement immediately without waiting for another frame', async () => {
  const s = setup(); s.releaseOpen({}); await s.client.toggle(s.pre); s.flush();
  const before = s.calls.length;
  const queued = s.frames.length;
  s.node.rect.top += 25; s.listeners.get('scroll')();
  assert.equal(s.calls.length, before + 1); assert.equal(s.frames.length, queued);
  assert.equal(s.calls.at(-1).action, 'html.preview.update'); assert.equal(s.calls.at(-1).args.bounds.y, 125);
  s.client.destroy(); assert.equal(s.listeners.has('scroll'), false);
});

test('one active frame follows compositor movement, skips unchanged IPC, and stops on close', async () => {
  const s = setup(); assert.equal(s.frames.length, 0); s.releaseOpen({});
  await s.client.toggle(s.pre); s.flush();
  assert.equal(s.frames.length, 1); const before = s.calls.length;
  s.client.schedule(); s.client.schedule(); assert.equal(s.frames.length, 1);
  s.flush(); assert.equal(s.calls.length, before); assert.equal(s.frames.length, 1);
  s.node.rect.top += 30; s.flush();
  assert.equal(s.calls.length, before + 1); assert.equal(s.calls.at(-1).args.bounds.y, 130);
  s.client.close(s.pre); s.flush(); assert.equal(s.frames.length, 0);
  await s.client.toggle(s.pre); assert.equal(s.frames.length, 1);
  s.client.destroy(); s.flush(); assert.equal(s.frames.length, 0);
});

test('closing during native opening cannot recreate a visible preview', async () => {
  const s = setup(); const pending = s.client.toggle(s.pre);
  s.client.close(s.pre); s.releaseOpen({}); await pending; s.flush();
  assert.equal(s.client.active.size, 0);
  assert.equal(s.calls.filter(call => call.action === 'html.preview.update').length, 0);
  assert.equal(s.node.hidden, true);
  assert.equal(s.calls.at(-1).action, 'html.preview.close');
});

test('native load errors preserve source and show a compact message', async () => {
  const s = setup(); s.releaseOpen({}); await s.client.toggle(s.pre);
  s.event({ id: 'html-synthetic-preview', state: 'error', message: 'Preview unavailable.' });
  assert.equal(s.client.active.size, 0); assert.equal(s.code.hidden, false);
  assert.equal(s.code.dataset.originalCode, s.original);
  assert.equal(s.node.dataset.previewError, 'true'); assert.equal(s.node.style.height, '');
  assert.equal(s.node.textContent, 'Preview unavailable.');
  s.client.destroy(); assert.equal(s.observed.size, 0);
});
