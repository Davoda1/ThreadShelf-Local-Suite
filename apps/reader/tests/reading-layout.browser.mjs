#!/usr/bin/env node
// Real-browser tests for reflow versus user scrolling; synthetic content only.
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const playwright = await import(process.env.THREADSHELF_PLAYWRIGHT_MODULE || 'playwright');
const executablePath = process.env.THREADSHELF_BROWSER_EXECUTABLE;
let browser;
if (executablePath) {
  browser = await playwright.chromium.launch({ executablePath, headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    env: { ...process.env, ...(process.env.THREADSHELF_BROWSER_LIBRARY_PATH ? { LD_LIBRARY_PATH: [process.env.THREADSHELF_BROWSER_LIBRARY_PATH, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':') } : {}) } });
} else if (process.env.READER_ELECTRON) {
  // Exercise the same Chromium engine as the shipped desktop when a separate
  // browser is unavailable. Geometry and all original assertions stay identical.
  const temporary = await mkdtemp(path.join(os.tmpdir(),'tslr-reading-layout-'));
  await writeFile(path.join(temporary,'main.cjs'), "const {app,BrowserWindow}=require('electron');app.on('window-all-closed',()=>{});app.whenReady().then(()=>new BrowserWindow({width:1440,height:900,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}}).loadURL('about:blank'));");
  const env={...process.env}; delete env.ELECTRON_RUN_AS_NODE;
  const application=await playwright._electron.launch({executablePath:process.env.READER_ELECTRON,args:['--no-sandbox','--disable-gpu',path.join(temporary,'main.cjs')],env});
  let first=true;
  browser={
    async newPage(options){
      let page;
      if(first){page=await application.firstWindow();first=false;}
      else {const waiting=application.waitForEvent('window');await application.evaluate(({BrowserWindow})=>{new BrowserWindow({width:1440,height:900,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}}).loadURL('about:blank');});page=await waiting;}
      await page.setViewportSize(options.viewport);await page.emulateMedia({reducedMotion:options.reducedMotion});return page;
    },
    async close(){await application.close();await rm(temporary,{recursive:true,force:true});}
  };
} else throw new Error('Set THREADSHELF_BROWSER_EXECUTABLE to Chromium or READER_ELECTRON to the bundled Electron runtime');
const componentRoot=process.env.READER_COMPONENT_ROOT||process.env.READER_APP_ROOT;
const sourcePath=componentRoot?path.join(path.resolve(componentRoot),'src/reader/reading-position.js'):new URL('../src/reader/reading-position.js', import.meta.url);
const source = await readFile(sourcePath, 'utf8');
const results = [];
const requestedCase = process.argv.find((argument) => argument.startsWith('--case='))?.slice(7);
async function settle(page) { await page.waitForTimeout(100); }
async function visible(page) {
  return page.evaluate(() => {
    const container = document.getElementById('conversationContent');
    const line = container.getBoundingClientRect().top + (window.reading?.viewportInset || 0) + 16;
    const node = [...container.querySelectorAll('.message')].find((message) => message.getBoundingClientRect().bottom > line)
      || container.lastElementChild;
    const rect = node.getBoundingClientRect();
    return { turnIndex: Number(node.dataset.turnIndex), role: node.classList.contains('user') ? 'user' : 'assistant', offset: (line - rect.top) / rect.height };
  });
}
function sameAnchor(actual, expected, message) {
  assert.equal(actual.turnIndex, expected.turnIndex, message);
  assert.equal(actual.role, expected.role, message);
  assert.ok(Math.abs(actual.offset - expected.offset) < .005, `${message}: ${JSON.stringify({ actual, expected })}`);
}
async function scrollToTurn(page, ordinal = 29, offset = .37) {
  await page.evaluate(({ ordinal, offset }) => {
    const container = document.getElementById('conversationContent');
    const node = container.children[ordinal];
    const rect = node.getBoundingClientRect();
    container.scrollTo({ top: container.scrollTop + rect.top - container.getBoundingClientRect().top + rect.height * offset - (window.reading?.viewportInset || 0) - 16, behavior: 'instant' });
  }, { ordinal, offset });
  await page.waitForTimeout(500); // Production persistence debounce is 400 ms.
  return visible(page);
}
async function width(page, value) {
  await page.evaluate((value) => { document.getElementById('conversationContent').style.width = value; }, value);
  await settle(page);
}
async function test(name, run) {
  if (requestedCase && requestedCase !== name) return;
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.setContent(`<style>body{margin:0}#conversationContent{box-sizing:border-box;width:800px;height:600px;overflow:auto;overflow-anchor:none}.message{box-sizing:border-box;margin:0 0 15px;padding:16px;font:16px/1.5 Arial}</style><main id="conversationContent" tabindex="0"></main>`);
    await page.addScriptTag({ content: source.replace('export class ReadingPosition', 'window.ReadingPosition = class ReadingPosition') });
    await page.evaluate(() => {
      const container = document.getElementById('conversationContent');
      window.renderFixture = (repeat = 35) => {
        container.innerHTML = Array.from({ length: 48 }, (_, index) => `<article class="message ${index % 2 ? 'assistant' : 'user'}" data-turn-index="${10 + index * 13}">${'Synthetic source text expands and contracts as the reading column width changes. '.repeat(repeat)}</article>`).join('');
      };
      renderFixture();
      window.saved = new Map();
      window.writes = [];
      window.store = {
        remember() {},
        position(identity) { return saved.get(JSON.stringify(identity)) || null; },
        savePosition(identity, anchor) {
          const record = JSON.parse(JSON.stringify({ identity, ...anchor }));
          saved.set(JSON.stringify(identity), record);
          writes.push(record);
        },
      };
      window.reading = new ReadingPosition(container, store, { revealElement() {} }, () => {});
      reading.attach(['fixture', '/source.json', 'first']);
    });
    await settle(page);
    await run(page);
    assert.deepEqual(errors, [], 'No browser JavaScript errors');
    results.push({ name, status: 'PASS' });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, status: 'FAIL', error: error.stack });
    console.error(`FAIL ${name}: ${error.stack}`);
  } finally { await page.close(); }
}
try {
  await test('layout-narrowing-widening-keeps-source-anchor', async (page) => {
    const expected = await scrollToTurn(page);
    const writes = await page.evaluate(() => window.writes.length);
    for (const value of ['480px', '1000px', '800px', '420px', '1100px']) {
      await width(page, value);
      sameAnchor(await visible(page), expected, `Width ${value} preserves anchor`);
    }
    assert.equal(await page.evaluate(() => window.writes.length), writes, 'Layout does not create artificial reading progress');
  });
  await test('viewport-width-and-height-resize-keep-source-anchor', async (page) => {
    await width(page, 'calc(100vw - 360px)');
    const expected = await scrollToTurn(page, 32, .24);
    for (const viewport of [{ width: 900, height: 720 }, { width: 1440, height: 900 }, { width: 1100, height: 1000 }]) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => { document.getElementById('conversationContent').style.height = 'calc(100vh - 180px)'; });
      await settle(page);
      sameAnchor(await visible(page), expected, 'Viewport resize preserves anchor');
    }
  });
  await test('real-wheel-and-keyboard-after-reflow-save-new-position', async (page) => {
    await width(page, '480px');
    await scrollToTurn(page, 22, .2);
    await width(page, '1000px');
    const before = await page.locator('#conversationContent').evaluate((node) => node.scrollTop);
    await page.mouse.move(300, 250);
    await page.mouse.wheel(0, 440);
    await page.waitForTimeout(520);
    const after = await page.locator('#conversationContent').evaluate((node) => node.scrollTop);
    assert.ok(after > before + 300, 'Real wheel movement is not undone by anchor restoration');
    sameAnchor(await page.evaluate(() => writes.at(-1)), await visible(page), 'Wheel saves actual visible position');
    await page.locator('#conversationContent').focus();
    await page.keyboard.press('PageDown');
    await page.waitForTimeout(750);
    assert.ok(await page.locator('#conversationContent').evaluate((node) => node.scrollTop) > after + 250, 'Keyboard scroll is accepted');
    sameAnchor(await page.evaluate(() => writes.at(-1)), await visible(page), 'Keyboard saves actual visible position');
  });
  await test('end-boundary-clamp-keeps-truthful-anchor', async (page) => {
    await page.locator('#conversationContent').evaluate((node) => { node.scrollTop = node.scrollHeight; });
    await page.waitForTimeout(500);
    await width(page, '1200px');
    sameAnchor(await page.evaluate(() => reading.anchor), await visible(page), 'Unavoidable end clamp captures actual viewport');
    await page.mouse.move(300, 250);
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(520);
    sameAnchor(await page.evaluate(() => writes.at(-1)), await visible(page), 'Next real movement saves current source anchor');
    await page.locator('#conversationContent').evaluate((node) => { node.scrollTop = 0; });
    await page.waitForTimeout(500);
    await width(page, '500px');
    assert.equal(await page.locator('#conversationContent').evaluate((node) => node.scrollTop), 0, 'Beginning remains at beginning');
  });
  await test('cleared-position-not-recreated-by-layout', async (page) => {
    await scrollToTurn(page, 33, .4);
    await page.evaluate(() => { reading.forget(); saved.clear(); writes.length = 0; });
    await width(page, '420px');
    await width(page, '1200px');
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => saved.size), 0, 'Layout does not recreate a deliberately cleared position');
    assert.equal(await page.evaluate(() => writes.length), 0, 'No delayed stale write after forget');
    await page.mouse.move(300, 250);
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(520);
    assert.equal(await page.evaluate(() => saved.size), 1, 'Real reading resumes persistence');
    sameAnchor(await page.evaluate(() => writes.at(-1)), await visible(page), 'New progress is current rather than pre-layout');
  });
  await test('search-style-dom-replacement-and-late-content-growth', async (page) => {
    const expected = await scrollToTurn(page, 31, .3);
    await page.evaluate(() => { renderFixture(12); reading.refreshNodes(); });
    await settle(page);
    sameAnchor(await visible(page), expected, 'Replacement with temporary shorter content');
    await page.evaluate(() => { renderFixture(35); reading.refreshNodes(); });
    await settle(page);
    sameAnchor(await visible(page), expected, 'Late content expansion');
  });
  await test('explicit-navigation-wins-over-old-anchor', async (page) => {
    await scrollToTurn(page, 31, .3);
    await page.evaluate(() => {
      reading.navigate(document.getElementById('conversationContent').children[8], { focus: true, behavior: 'instant' });
      document.getElementById('conversationContent').style.width = '480px';
    });
    await page.waitForTimeout(750);
    const actual = await visible(page);
    assert.equal(actual.turnIndex, 114, 'Explicit destination is retained');
    sameAnchor(await page.evaluate(() => writes.at(-1)), actual, 'Saved position follows explicit navigation');
  });
  await test('read-from-start-keeps-saved-position-for-resume', async (page) => {
    const expected = await scrollToTurn(page, 22, .3);
    const writesBefore = await page.evaluate(() => writes.length);
    await page.evaluate(() => reading.beginning());
    await page.waitForTimeout(550);
    assert.equal(await page.locator('#conversationContent').evaluate((node) => node.scrollTop), 0, 'Read from start reaches top');
    assert.equal(await page.evaluate(() => writes.length), writesBefore, 'Read from start does not replace or delete the saved server anchor');
    sameAnchor(await page.evaluate(() => saved.get(JSON.stringify(['fixture', '/source.json', 'first']))), expected, 'Saved position remains intact');
    assert.equal(await page.evaluate(() => reading.restore()), true);
    await settle(page);
    sameAnchor(await visible(page), expected, 'Resume returns to the retained saved position');
  });
  await test('explicit-resume-keeps-stored-offset-without-flushing-over-it', async (page) => {
    const expected = await scrollToTurn(page, 22, .3);
    await page.evaluate(() => {
      window.resumeEntry = JSON.parse(JSON.stringify(saved.get(JSON.stringify(['fixture', '/source.json', 'first']))));
      window.writeCount = writes.length;
      const container = document.getElementById('conversationContent');
      const target = container.children[31];
      container.scrollTo({ top: container.scrollTop + target.getBoundingClientRect().top - container.getBoundingClientRect().top, behavior: 'instant' });
    });
    await page.waitForTimeout(70); // Resume must cancel progress before its 400 ms autosave.
    assert.equal(await page.evaluate(() => reading.restore(resumeEntry)), true);
    await page.waitForTimeout(600);
    sameAnchor(await visible(page), expected, 'Explicit resume restores the exact source offset');
    assert.equal(await page.evaluate(() => writes.length === writeCount), true, 'Resume does not overwrite the requested stored anchor');
  });
  await test('detach-flushes-current-progress-without-cross-thread-write', async (page) => {
    await scrollToTurn(page, 22, .3);
    await width(page, '1100px');
    const expected = await visible(page);
    await page.evaluate(() => {
      reading.detach();
      renderFixture();
      reading.attach(['fixture', '/different.json', 'second']);
    });
    await page.waitForTimeout(600);
    const old = await page.evaluate(() => saved.get(JSON.stringify(['fixture', '/source.json', 'first'])));
    sameAnchor(old, expected, 'Old thread retains its source anchor');
    assert.equal(await page.evaluate(() => saved.has(JSON.stringify(['fixture', '/different.json', 'second']))), false, 'No old timer writes into new thread');
    assert.equal(await page.locator('#conversationContent').evaluate((node) => node.scrollTop), 0, 'New thread starts at beginning');
  });
  await test('overlay-height-and-workspace-visibility-preserve-visible-source-anchor', async (page) => {
    const expected = await scrollToTurn(page, 25, .32);
    const writes = await page.evaluate(() => window.writes.length);
    for (const height of [120, 186, 240, 0, 150]) {
      await page.evaluate(height => {
        const content = document.getElementById('conversationContent');
        content.style.paddingTop = `${height}px`;
        content.style.scrollPaddingTop = `${height}px`;
        reading.setViewportInset(height);
      }, height);
      await settle(page);
      sameAnchor(await visible(page), expected, `Overlay ${height}px keeps the unobscured source anchor`);
    }
    await page.evaluate(() => {
      const content = document.getElementById('conversationContent');
      content.style.display = 'none';
      reading.setViewportInset(0, { preserveHiddenAnchor: true });
    });
    await settle(page);
    sameAnchor(await page.evaluate(() => reading.anchor), expected, 'A hidden workspace retains its last source anchor');
    await page.evaluate(() => {
      const content = document.getElementById('conversationContent');
      content.style.display = '';
      reading.setViewportInset(150);
    });
    await settle(page);
    sameAnchor(await visible(page), expected, 'Returning from another workspace restores the unobscured source anchor');
    assert.equal(await page.evaluate(() => window.writes.length), writes, 'Chrome and workspace changes do not fabricate reading progress');
  });
  await test('overlay-read-start-and-resume-keep-first-card-and-saved-anchor-visible', async (page) => {
    await page.evaluate(() => {
      const content = document.getElementById('conversationContent');
      content.style.paddingTop = '180px';
      content.style.scrollPaddingTop = '180px';
      reading.setViewportInset(180);
    });
    const expected = await scrollToTurn(page, 22, .3);
    const writesBefore = await page.evaluate(() => writes.length);
    await page.evaluate(() => reading.beginning());
    await page.waitForTimeout(550);
    const initial = await page.evaluate(() => {
      const content = document.getElementById('conversationContent');
      return { scroll: content.scrollTop, first: content.firstElementChild.getBoundingClientRect().top,
        clear: content.getBoundingClientRect().top + reading.viewportInset };
    });
    assert.equal(initial.scroll, 0);
    assert.ok(initial.first >= initial.clear, 'The first card starts below the overlaid header');
    assert.equal(await page.evaluate(() => writes.length), writesBefore, 'Read-start retains the saved anchor');
    assert.equal(await page.evaluate(() => reading.restore()), true);
    await settle(page);
    sameAnchor(await visible(page), expected, 'Resume restores the same source point below the header');
  });
  await test('overlay-search-and-bookmark-navigation-center-in-unobscured-area', async (page) => {
    await page.evaluate(() => {
      const content = document.getElementById('conversationContent');
      content.style.paddingTop = '160px';
      content.style.scrollPaddingTop = '160px';
      reading.setViewportInset(160);
      const target = document.createElement('span');
      target.id = 'navigationTarget';
      target.textContent = 'Visible navigation target';
      content.children[15].append(target);
      reading.navigate(target, { focus: true, behavior: 'instant' });
      // The in-page search bar appears during the navigation settle period.
      content.style.paddingTop = '210px';
      content.style.scrollPaddingTop = '210px';
      reading.setViewportInset(210);
    });
    await page.waitForTimeout(750);
    const placement = await page.evaluate(() => {
      const content = document.getElementById('conversationContent').getBoundingClientRect();
      const target = document.getElementById('navigationTarget').getBoundingClientRect();
      return { top: target.top, bottom: target.bottom, center: (target.top + target.bottom) / 2,
        clear: content.top + reading.viewportInset, end: content.bottom,
        expectedCenter: (content.top + reading.viewportInset + content.bottom) / 2,
        focused: document.activeElement.id };
    });
    assert.ok(placement.top >= placement.clear && placement.bottom <= placement.end, 'Navigation target is not covered by chrome');
    assert.ok(Math.abs(placement.center - placement.expectedCenter) < 3, 'Native scroll-padding centers the target below chrome');
    assert.equal(placement.focused, 'navigationTarget');
    sameAnchor(await page.evaluate(() => writes.at(-1)), await visible(page), 'Navigation saves the unobscured source anchor');
  });
  await test('non-overlay-navigation-retains-existing-settle-and-hidden-layout-behavior', async (page) => {
    const result = await page.evaluate(() => {
      const content = document.getElementById('conversationContent');
      const target = document.createElement('span');
      target.textContent = 'A navigation target without overlaid chrome';
      content.children[15].append(target);
      reading.navigate(target, { behavior: 'instant' });
      const scrollBefore = content.scrollTop;
      // Settling must not add a new centering scroll for other palettes.
      target.style.position = 'relative';
      target.style.top = '200px';
      reading.finishNavigation();
      const scrollAfter = content.scrollTop;
      content.style.display = 'none';
      reading.applyAnchor();
      const defaultHiddenHeight = reading.geometry[1];
      content.style.display = '';
      reading.applyAnchor();
      const visibleHeight = reading.geometry[1];
      reading.setViewportInset(0, { preserveHiddenAnchor: true });
      content.style.display = 'none';
      reading.applyAnchor();
      const guardedHiddenHeight = reading.geometry[1];
      reading.setViewportInset(0);
      reading.applyAnchor();
      return { scrollBefore, scrollAfter, defaultHiddenHeight, visibleHeight,
        guardedHiddenHeight, releasedHiddenHeight: reading.geometry[1],
        inset: reading.viewportInset, guard: reading.preserveHiddenAnchor };
    });
    assert.ok(result.scrollBefore > 1000);
    assert.equal(result.scrollAfter, result.scrollBefore, 'Zero inset keeps existing navigation settle behavior');
    assert.equal(result.defaultHiddenHeight, 0, 'Default reader keeps its existing hidden-layout measurement');
    assert.equal(result.guardedHiddenHeight, result.visibleHeight, 'Only the opted-in controller preserves hidden geometry');
    assert.equal(result.releasedHiddenHeight, 0, 'Clearing the controller flag restores existing hidden-layout behavior');
    assert.equal(result.inset, 0);
    assert.equal(result.guard, false);
  });
  await test('smooth-navigation-settling-before-first-frame-still-reaches-search-target', async (page) => {
    await page.evaluate(() => {
      const content = document.getElementById('conversationContent');
      content.style.paddingTop = '180px';
      content.style.scrollPaddingTop = '180px';
      reading.setViewportInset(180);
      const target = document.createElement('span');
      target.id = 'delayedSearchTarget';
      target.textContent = 'Search result after a heavy message rerender';
      content.children[15].append(target);
      reading.navigate(target, { behavior: 'smooth' });
      // A busy renderer can reach the settle deadline before the compositor
      // has delivered the first smooth-scroll frame. Finalize in this same
      // task to reproduce that ordering deterministically in a real browser.
      reading.finishNavigation();
      content.style.width = '760px';
      content.style.paddingTop = '230px';
      content.style.scrollPaddingTop = '230px';
      reading.setViewportInset(230);
    });
    await page.waitForTimeout(750);
    const actual = await page.evaluate(() => {
      const content = document.getElementById('conversationContent');
      const viewport = content.getBoundingClientRect();
      const target = document.getElementById('delayedSearchTarget').getBoundingClientRect();
      return { scroll: content.scrollTop, top: target.top, bottom: target.bottom,
        clear: viewport.top + reading.viewportInset, end: viewport.bottom,
        atBeginning: reading.atBeginning };
    });
    assert.ok(actual.scroll > 1000, `The requested navigation is not reset to the beginning: ${JSON.stringify(actual)}`);
    assert.ok(actual.top >= actual.clear && actual.bottom <= actual.end, `The requested result remains visible after chrome reflow: ${JSON.stringify(actual)}`);
    assert.equal(actual.atBeginning, false);
    sameAnchor(await page.evaluate(() => writes.at(-1)), await visible(page), 'Only the reached destination is persisted');
  });
} finally { await browser.close(); }
console.log(JSON.stringify({ suite: 'reading-position-layout', appRoot:process.env.READER_APP_ROOT||null, componentRoot:componentRoot||null, results }, null, 2));
if (!results.length || results.some((result) => result.status === 'FAIL')) process.exitCode = 1;
