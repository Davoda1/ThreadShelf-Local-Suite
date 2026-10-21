import test from 'node:test';
import assert from 'node:assert/strict';
import { ProfessionalThreadOverlay } from '../src/ui/professional-thread-overlay.js';

function fixture(run, palette = 'professional') {
  const old = Object.fromEntries(['ResizeObserver', 'MutationObserver', 'requestAnimationFrame', 'cancelAnimationFrame'].map(key => [key, globalThis[key]]));
  const frames = new Map(), observers = [];
  let nextFrame = 0;
  class Observer {
    constructor(callback) { this.callback = callback; this.nodes = []; this.disconnected = false; observers.push(this); }
    observe(node) { this.nodes.push(node); }
    disconnect() { this.disconnected = true; }
  }
  globalThis.ResizeObserver = globalThis.MutationObserver = Observer;
  globalThis.requestAnimationFrame = callback => { frames.set(++nextFrame, callback); return nextFrame; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  const classes = new Set(), styles = new Map(), values = [], hiddenGuards = [];
  const root = { dataset: { uiPalette: palette } };
  const node = (height, hidden = false) => ({ hidden, height, childElementCount: 1, getBoundingClientRect() { return { height: this.hidden ? 0 : this.height }; } });
  const header = node(148.5), banner = node(72, true), search = node(46, true);
  const pane = {
    hidden: false, isConnected: true, ownerDocument: { documentElement: root },
    querySelector: selector => ({ '#threadHeader': header, '#operationBanner': banner, '#readerSearch': search })[selector],
    classList: { toggle: (name, on) => on ? classes.add(name) : classes.delete(name), remove: name => classes.delete(name) },
    style: { setProperty: (name, value) => styles.set(name, value), removeProperty: name => styles.delete(name) },
  };
  const position = { setViewportInset: (value, options = {}) => { values.push(value); hiddenGuards.push(Boolean(options.preserveHiddenAnchor)); } };
  const controller = new ProfessionalThreadOverlay({ pane, position });
  const flush = () => { for (const [id, callback] of [...frames]) { frames.delete(id); callback(); } };
  try { run({ controller, pane, root, header, banner, search, classes, styles, values, hiddenGuards, observers, frames, flush }); }
  finally {
    controller.destroy();
    for (const [key, value] of Object.entries(old)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
}

for (const palette of ['professional', 'platinum-plus']) {
test(`${palette} overlay measures actual chrome and removes its inset for another palette`, () => fixture(({ controller, root, classes, styles, values, hiddenGuards, observers }) => {
  assert.equal(classes.has('professional-thread-overlay'), true);
  assert.equal(styles.get('--professional-thread-overlay-height'), '148.5px');
  assert.equal(values.at(-1), 148.5);
  assert.equal(hiddenGuards.at(-1), true);
  root.dataset.uiPalette = 'platinum';
  observers[1].callback();
  assert.equal(classes.has('professional-thread-overlay'), false);
  assert.equal(styles.has('--professional-thread-overlay-height'), false);
  assert.equal(values.at(-1), 0);
  assert.equal(hiddenGuards.at(-1), false);
  root.dataset.uiPalette = palette;
  controller.sync();
  assert.equal(values.at(-1), 148.5);
}, palette));

test(`${palette} overlay follows search, operation and responsive chrome heights`, () => fixture(({ controller, header, banner, search, values, styles, observers, flush }) => {
  search.hidden = false;
  observers[1].callback();
  assert.equal(values.at(-1), 194.5);
  banner.hidden = false;
  controller.sync();
  assert.equal(values.at(-1), 266.5);
  header.height = 181.75;
  observers[0].callback();
  flush();
  assert.equal(values.at(-1), 299.75);
  assert.equal(styles.get('--professional-thread-overlay-height'), '299.75px');
  search.hidden = banner.hidden = true;
  controller.sync();
  assert.equal(values.at(-1), 181.75);
}, palette));

test(`${palette} overlay clears for Activity and welcome, then restores when a thread returns`, () => fixture(({ controller, pane, header, classes, styles, values, hiddenGuards }) => {
  pane.hidden = true;
  controller.sync();
  assert.equal(values.at(-1), 0);
  assert.equal(hiddenGuards.at(-1), true, 'Professional retains its hidden-pane anchor guard in Activity');
  assert.equal(styles.has('--professional-thread-overlay-height'), false);
  pane.hidden = false;
  controller.sync();
  assert.equal(values.at(-1), 148.5);
  header.hidden = true;
  controller.sync();
  assert.equal(classes.has('professional-thread-overlay'), false);
  assert.equal(values.at(-1), 0);
  header.hidden = false;
  header.childElementCount = 0;
  controller.sync();
  assert.equal(classes.has('professional-thread-overlay'), false, 'An empty loading header does not create overlay space');
  header.childElementCount = 1;
  controller.sync();
  assert.equal(values.at(-1), 148.5);
}, palette));

test(`${palette} overlay disconnects observers and rejects queued work after shell replacement`, () => fixture(({ controller, classes, styles, values, hiddenGuards, observers, frames, flush }) => {
  observers[0].callback();
  assert.equal(frames.size, 1);
  controller.destroy();
  assert.equal(frames.size, 0);
  assert.ok(observers.every(observer => observer.disconnected));
  assert.equal(classes.has('professional-thread-overlay'), false);
  assert.equal(styles.has('--professional-thread-overlay-height'), false);
  assert.equal(values.at(-1), 0);
  assert.equal(hiddenGuards.at(-1), false, 'Retired controller releases its hidden-pane guard');
  const count = values.length;
  for (const observer of observers) observer.callback();
  flush();
  assert.equal(values.length, count, 'Retired callbacks cannot reapply an inset');
}, palette));

}
