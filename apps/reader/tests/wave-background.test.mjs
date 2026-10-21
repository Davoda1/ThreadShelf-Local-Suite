import test from 'node:test';
import assert from 'node:assert/strict';
import { WaveBackground } from '../src/reader/wave-background.js';

function fixture(t, { hasPane = false, nativeMove = true } = {}) {
  class Video extends EventTarget {
    constructor() { super(); this.dataset = {}; this.classList = { add() {} }; this.paused = true; this.pending = []; this.currentTime = 0; this.parentNode = null; this.isConnected = false; }
    setAttribute(name, value) { this[name] = value; }
    getAttribute(name) { return this[name] ?? null; }
    removeAttribute(name) { delete this[name]; }
    play() { this.paused = false; return new Promise((resolve, reject) => this.pending.push({ resolve, reject })); }
    pause() { this.paused = true; }
    load() { this.unloaded = true; }
    remove() { this.removed = true; if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; this.isConnected = false; }
  }
  const document = Object.assign(new EventTarget(), { hidden: false, baseURI: 'file:///reader/index.html', documentElement: { dataset: { theme: 'dark' } }, createElement: () => new Video() });
  const window = new EventTarget(), media = Object.assign(new EventTarget(), { matches: false });
  const old = Object.fromEntries(['document', 'window', 'matchMedia'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globalThis, { document, window, matchMedia: () => media });
  const classes = new Set();
  const paneClasses = new Set();
  const host = classNames => ({
    classList: { add(name) { classNames.add(name); }, remove(name) { classNames.delete(name); } },
    children: [], isConnected: true, moves: 0,
    get firstChild() { return this.children[0] || null; },
    prepend(video) {
      if (video.parentNode) video.parentNode.children.splice(video.parentNode.children.indexOf(video), 1);
      this.children.unshift(video); this.lastVideo = video; video.parentNode = this; video.isConnected = true;
    },
    ...(nativeMove ? {moveBefore(video) { this.moves++; this.prepend(video); }} : {}),
  });
  const pane = host(paneClasses), container = host(classes);
  container.closest = selector => selector === '.content-pane' && hasPane ? pane : null;
  const waves = new WaveBackground(container);
  t.after(() => { waves.destroy(); for (const [key, descriptor] of Object.entries(old)) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]; });
  const visibility = hidden => { document.hidden = hidden; document.dispatchEvent(new Event('visibilitychange')); };
  return { waves, document, window, media, visibility, classes, pane, paneClasses, container };
}

test('wave preference keeps packaged source selection, motion restrictions and cleanup independent', t => {
  const { waves, document, media } = fixture(t);
  waves.setConversation(true);
  waves.setSettings({ waveVideoBackground: false, animations: true });
  assert.equal(waves.video, null);
  waves.setSettings({ waveVideoBackground: true, animations: true });
  const dark = waves.video;
  assert.match(dark.src, /waves\/quiet-water-v4-1920x1080-24fps\.mp4$/);
  document.documentElement.dataset.theme = 'light'; waves.sync();
  assert.ok(dark.paused && dark.removed && dark.unloaded); assert.equal(dark.src, undefined);
  assert.match(waves.video.src, /waves\/05-day-loop\.mp4$/);
  media.matches = true; media.dispatchEvent(new Event('change')); assert.equal(waves.video, null);
  media.matches = false; media.dispatchEvent(new Event('change')); assert.ok(waves.video);
  waves.setActive(false); assert.equal(waves.video, null);
  waves.setActive(true); assert.ok(waves.video);
  waves.setSettings({ waveVideoBackground: true, animations: false }); assert.equal(waves.video, null);
  waves.destroy(); media.dispatchEvent(new Event('change')); assert.equal(waves.video, null);
});

test('a stale interrupted play cannot remove a video resumed after rapid visibility changes', async t => {
  const { waves, visibility } = fixture(t);
  waves.setConversation(true); waves.setSettings({ waveVideoBackground: true, animations: true });
  const video = waves.video;
  visibility(true); assert.equal(video.paused, true);
  visibility(false); assert.equal(video.paused, false); assert.equal(video.pending.length, 2);
  video.pending[0].reject(new DOMException('Intentional hidden-document pause', 'AbortError'));
  await Promise.resolve();
  assert.equal(waves.video, video); assert.equal(waves.failedTheme, null);
  // A failure of the current attempt must still release the media and fall back.
  video.pending[1].reject(new DOMException('Unsupported media', 'NotSupportedError'));
  await Promise.resolve();
  assert.equal(waves.video, null); assert.equal(waves.failedTheme, 'dark');
  assert.ok(video.paused && video.removed);
});

test('welcome video requires both switches and explicit welcome state; empty/loading readers stay still', t => {
  const { waves, classes } = fixture(t);
  waves.setSettings({ waveVideoBackground: true, waveVideoWelcome: true, holidayVideoWelcome: true });
  waves.setHolidayStatus({ isHoliday: true });
  assert.equal(waves.video, null);
  waves.setWelcome(true);
  assert.equal(waves.video.dataset.waveTheme, 'holiday');
  assert.ok(classes.has('wave-welcome-enabled'));
  waves.setSettings({ waveVideoBackground: false, waveVideoWelcome: true, holidayVideoWelcome: true });
  assert.equal(waves.video, null);
  assert.ok(!classes.has('wave-welcome-enabled'));
  waves.setSettings({ waveVideoBackground: true, waveVideoWelcome: false, holidayVideoWelcome: true });
  assert.equal(waves.video, null);
  waves.setSettings({ waveVideoBackground: true, waveVideoWelcome: true, holidayVideoWelcome: true });
  assert.ok(waves.video);
  waves.setWelcome(false); waves.setConversation(false);
  assert.equal(waves.video, null, 'loading or an empty conversation is not the welcome view');
});

test('holiday replacement is limited to welcome in both themes, and resets immediately for reading', t => {
  const { waves, document, classes } = fixture(t);
  waves.setSettings({ waveVideoBackground: true, waveVideoWelcome: true, holidayVideoWelcome: true });
  waves.setHolidayStatus({ isHoliday: true });
  for (const theme of ['light', 'dark']) {
    document.documentElement.dataset.theme = theme;
    waves.setWelcome(true);
    const fireworks = waves.video;
    assert.match(fireworks.src, /waves\/01-multicolour-loop\.mp4$/);
    assert.equal(fireworks.defaultMuted, true);
    assert.equal(fireworks.loop, true);
    assert.equal(fireworks.getAttribute('aria-hidden'), 'true');
    waves.setConversation(true);
    assert.ok(fireworks.paused && fireworks.removed && fireworks.unloaded);
    assert.equal(waves.video.dataset.waveTheme, theme);
    assert.ok(!classes.has('wave-welcome-enabled'));
    waves.setSettings({ waveVideoBackground: true, waveVideoWelcome: false, holidayVideoWelcome: true });
    assert.equal(waves.video.dataset.waveTheme, theme, 'welcome preference never disables ordinary conversation waves');
    waves.setSettings({ waveVideoBackground: true, waveVideoWelcome: true, holidayVideoWelcome: true });
  }
});

test('unknown holiday status, disabled holiday option and ordinary dates use normal welcome waves', t => {
  const { waves } = fixture(t);
  waves.setSettings({ waveVideoBackground: true, waveVideoWelcome: true, holidayVideoWelcome: true });
  waves.setWelcome(true);
  for (const status of [undefined, null, {}, {isHoliday: false}, {isHoliday: 'true'}]) {
    waves.setHolidayStatus(status);
    assert.equal(waves.video.dataset.waveTheme, 'dark');
  }
  waves.setHolidayStatus({isHoliday: true});
  assert.equal(waves.video.dataset.waveTheme, 'holiday');
  waves.setSettings({ waveVideoBackground: true, waveVideoWelcome: true, holidayVideoWelcome: false });
  assert.equal(waves.video.dataset.waveTheme, 'dark');
});

test('welcome fireworks obey motion, visibility and active-workspace lifetimes', async t => {
  const { waves, media, visibility, window } = fixture(t);
  waves.setSettings({ waveVideoBackground: true, waveVideoWelcome: true, holidayVideoWelcome: true });
  waves.setHolidayStatus({isHoliday:true}); waves.setWelcome(true);
  const original = waves.video;
  visibility(true); assert.equal(original.paused, true);
  visibility(false); assert.equal(original.paused, false);
  original.pending[0].reject(new DOMException('Interrupted', 'AbortError'));
  await Promise.resolve(); assert.equal(waves.video, original);
  media.matches = true; media.dispatchEvent(new Event('change')); assert.equal(waves.video, null);
  media.matches = false; media.dispatchEvent(new Event('change')); assert.ok(waves.video);
  waves.setActive(false); assert.equal(waves.video, null);
  waves.setActive(true); assert.equal(waves.video.dataset.waveTheme, 'holiday');
  waves.setSettings({ waveVideoBackground: true, waveVideoWelcome: true, holidayVideoWelcome: true, animations: false });
  assert.equal(waves.video, null);
  waves.setSettings({ waveVideoBackground: true, waveVideoWelcome: true, holidayVideoWelcome: true, animations: true });
  window.dispatchEvent(new Event('pagehide')); assert.equal(waves.video, null);
  window.dispatchEvent(new Event('pageshow')); assert.equal(waves.video.dataset.waveTheme, 'holiday');
});

test('failed welcome fireworks do not poison normal reading video, and stale errors cannot release its replacement', t => {
  const { waves } = fixture(t);
  waves.setSettings({ waveVideoBackground: true, waveVideoWelcome: true, holidayVideoWelcome: true });
  waves.setHolidayStatus({isHoliday:true}); waves.setWelcome(true);
  const fireworks = waves.video;
  fireworks.dispatchEvent(new Event('error')); assert.equal(waves.video, null);
  waves.setConversation(true);
  const normal = waves.video;
  assert.equal(normal.dataset.waveTheme, 'dark');
  waves.fail(fireworks, 'holiday'); assert.equal(waves.video, normal);
  waves.setWelcome(true); assert.equal(waves.video, null);
  waves.setSettings({waveVideoBackground:true,waveVideoWelcome:true,holidayVideoWelcome:false});
  assert.equal(waves.video.dataset.waveTheme, 'dark');
  waves.setSettings({waveVideoBackground:true,waveVideoWelcome:true,holidayVideoWelcome:true});
  assert.equal(waves.video.dataset.waveTheme, 'holiday', 'explicit preference toggle allows a new attempt');
});

test('embedded preview media revokes each object URL when welcome/read mode switches or closes', t => {
  const {waves, window} = fixture(t);
  const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL;
  const created = [], revoked = [];
  URL.createObjectURL = blob => { assert.equal(blob.type, 'video/mp4'); const id = `blob:test-${created.length}`; created.push(id); return id; };
  URL.revokeObjectURL = url => revoked.push(url);
  t.after(() => { URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; });
  window.__THREADSHELF_WAVES = {dark:'data:video/mp4;base64,AA==',holiday:'data:video/mp4;base64,AQ=='};
  waves.setSettings({waveVideoBackground:true,waveVideoWelcome:true,holidayVideoWelcome:true});
  waves.setHolidayStatus({isHoliday:true}); waves.setWelcome(true);
  assert.equal(waves.video.src, 'blob:test-0');
  waves.setConversation(true);
  assert.equal(waves.video.src, 'blob:test-1');
  assert.deepEqual(revoked, ['blob:test-0']);
  waves.setWelcome(true);
  assert.equal(waves.video.src, 'blob:test-2');
  waves.destroy();
  assert.deepEqual(revoked, created);
});

for (const palette of ['professional', 'platinum-plus']) {
test(`${palette} conversation moves the single existing video behind the header without resetting playback`, t => {
  const {waves, document, pane, paneClasses, container, classes} = fixture(t, {hasPane:true});
  waves.setConversation(true); waves.setSettings({waveVideoBackground:true});
  const video = waves.video, source = video.src;
  video.currentTime = 14.75;
  assert.equal(video.parentNode,container);
  document.documentElement.dataset.uiPalette = palette; waves.setSettings({waveVideoBackground:true});
  assert.equal(waves.video,video); assert.equal(video.src,source); assert.equal(video.currentTime,14.75);
  assert.equal(video.parentNode,pane); assert.equal(pane.moves,1);
  assert.ok(paneClasses.has('wave-thread-background-enabled'));
  assert.ok(classes.has('wave-background-enabled'));
  assert.equal(container.children.length,0); assert.equal(pane.children.length,1);
  document.documentElement.dataset.uiPalette = 'platinum'; waves.setSettings({waveVideoBackground:true});
  assert.equal(waves.video,video); assert.equal(video.src,source); assert.equal(video.currentTime,14.75);
  assert.equal(video.parentNode,container); assert.equal(container.moves,1);
  assert.ok(!paneClasses.has('wave-thread-background-enabled'));
  assert.equal(pane.children.length,0); assert.equal(container.children.length,1);
  assert.equal(video.unloaded,undefined); assert.equal(video.removed,undefined);
});

test(`${palette} keeps normal welcome and holiday video inside Reader; standalone Reader safely retains its host`, t => {
  const {waves,document,pane,paneClasses,container} = fixture(t,{hasPane:true});
  document.documentElement.dataset.uiPalette=palette;
  waves.setSettings({waveVideoBackground:true,waveVideoWelcome:true,holidayVideoWelcome:true});
  waves.setConversation(true); const normal=waves.video; normal.currentTime=7;
  assert.equal(normal.parentNode,pane);
  waves.setWelcome(true);
  assert.equal(waves.video,normal); assert.equal(normal.parentNode,container); assert.equal(normal.currentTime,7);
  assert.ok(!paneClasses.has('wave-thread-background-enabled'));
  waves.setHolidayStatus({isHoliday:true}); assert.equal(waves.video.dataset.waveTheme,'holiday');
  assert.equal(waves.video.parentNode,container); assert.equal(pane.children.length,0);
  waves.setConversation(true); assert.equal(waves.video.dataset.waveTheme,'dark');
  assert.equal(waves.video.parentNode,pane);
  container.closest=()=>null; waves.sync();
  assert.equal(waves.video.parentNode,container); assert.ok(!paneClasses.has('wave-thread-background-enabled'));
});

test(`${palette} host changes tolerate stale play rejection in older browsers and keep real failures observable`, async t => {
  const {waves,document,pane,paneClasses,container}=fixture(t,{hasPane:true,nativeMove:false});
  waves.setConversation(true); waves.setSettings({waveVideoBackground:true});
  const video=waves.video; video.currentTime=9;
  document.documentElement.dataset.uiPalette=palette; waves.setSettings({waveVideoBackground:true});
  assert.equal(waves.video,video); assert.equal(video.parentNode,pane); assert.equal(video.currentTime,9);
  assert.equal(container.children.length,0); assert.equal(pane.children.length,1);
  video.pending[0].reject(new DOMException('Interrupted by DOM move','AbortError'));
  await Promise.resolve(); assert.equal(waves.video,video);
  assert.equal(video.pending.length,2,'Moved playback has a new observed play promise');
  video.pending[1].reject(new DOMException('Media failed','NotSupportedError'));
  await Promise.resolve(); assert.equal(waves.video,null); assert.equal(waves.failedTheme,'dark');
  assert.ok(!paneClasses.has('wave-thread-background-enabled')); assert.equal(pane.children.length,0);
});

test(`${palette} parent marker and media are cleaned up on hidden theme changes, motion, workspace changes and destruction`, t => {
  const {waves,document,pane,paneClasses,container,media,visibility}=fixture(t,{hasPane:true});
  document.documentElement.dataset.uiPalette=palette;
  waves.setConversation(true); waves.setSettings({waveVideoBackground:true});
  visibility(true); const video=waves.video; assert.equal(video.paused,true);
  document.documentElement.dataset.uiPalette='platinum'; waves.setSettings({waveVideoBackground:true});
  assert.equal(video.parentNode,container); assert.ok(!paneClasses.has('wave-thread-background-enabled'));
  assert.equal(video.paused,true);
  document.documentElement.dataset.uiPalette=palette; waves.setSettings({waveVideoBackground:true});
  assert.equal(video.parentNode,pane); assert.equal(video.paused,true);
  visibility(false); assert.equal(waves.video,video); assert.equal(video.paused,false);
  media.matches=true; media.dispatchEvent(new Event('change'));
  assert.equal(waves.video,null); assert.ok(!paneClasses.has('wave-thread-background-enabled'));
  media.matches=false; media.dispatchEvent(new Event('change')); assert.equal(waves.video.parentNode,pane);
  waves.setActive(false); assert.equal(waves.video,null); assert.equal(pane.children.length,0);
  assert.ok(!paneClasses.has('wave-thread-background-enabled'));
  waves.setActive(true); assert.equal(waves.video.parentNode,pane);
  waves.destroy(); assert.equal(waves.video,null); assert.equal(pane.children.length,0);
  assert.ok(!paneClasses.has('wave-thread-background-enabled'));
});

test(`${palette} palette changes reuse one embedded source URL until final release`, t => {
  const {waves,window,document}=fixture(t,{hasPane:true});
  const originalCreate=URL.createObjectURL,originalRevoke=URL.revokeObjectURL;
  const created=[],revoked=[];
  URL.createObjectURL=()=>{const url=`blob:move-${created.length}`;created.push(url);return url;};
  URL.revokeObjectURL=url=>revoked.push(url);
  t.after(()=>{URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke;});
  window.__THREADSHELF_WAVES={dark:'data:video/mp4;base64,AA=='};
  waves.setConversation(true); waves.setSettings({waveVideoBackground:true}); const video=waves.video;
  for(const palette of ['professional','platinum-plus','platinum','platinum-plus','professional','default']){
    document.documentElement.dataset.uiPalette=palette; waves.setSettings({waveVideoBackground:true});
    assert.equal(waves.video,video); assert.equal(video.src,'blob:move-0');
    assert.deepEqual(created,['blob:move-0']); assert.deepEqual(revoked,[]);
  }
  waves.destroy(); assert.deepEqual(revoked,created);
});

}
