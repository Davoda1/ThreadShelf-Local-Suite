#!/usr/bin/env node
// Native Linux package smoke test. Requires a display and Playwright.
// Usage: node tests/packaged-smoke.browser.mjs RUNTIME_DIRECTORY REPORT.json
// Synthetic profile only. The inspector accommodates this test host's singleton
// socket restriction; it does not change application files or package defaults.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
const { chromium } = await import(process.env.THREADSHELF_PLAYWRIGHT_MODULE || 'playwright');
const runtime = path.resolve(process.argv[2]);
const reportFile = path.resolve(process.argv[3]);
const appRoot = path.join(runtime, 'resources/app');
const binary = path.join(runtime, 'threadshelf-local-reader');
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'threadshelf-smoke-'));
const { ApplicationService } = await import(pathToFileURL(path.join(appRoot, 'src/core/service.mjs')));
const service = await new ApplicationService({ dataDir: profile }).init();
await service.handle('settings.save', { values: { mode: 'local', theme: 'light', language: 'en', animations: false } });
await service.commitMutation(service.store.prepareUpsert({ collection: 'Synthetic examples', provider: 'openai', sourceFile: 'synthetic-example.json', conversationKey: 'native-smoke', title: 'Synthetic reading example', turns: [{ user: 'How can I keep an archive readable?', turn_index: 0 }, { ai: 'Keep the original source and use **local search**. This synthetic example contains the keyword quartz.\n\n| Check | Status |\n| --- | --- |\n| Archive | Local |', turn_index: 1 }] }));
await service.shutdown();
await fs.writeFile(path.join(profile, 'window.json'), JSON.stringify({ width: 1280, height: 850 }));
const singletonLine = (await fs.readFile(path.join(appRoot, 'src/desktop/main.cjs'), 'utf8')).split('\n').findIndex(line => line.startsWith('if(!app.requestSingleInstanceLock())'));
assert.ok(singletonLine >= 0);
const env = { ...process.env, THREADSHELF_READER_TEST_DATA: profile };
delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS;
const child = spawn(binary, ['--inspect-brk=0', '--remote-debugging-port=0', '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let output = '', exit = null, sequence = 0, socket, browser, patched = false, inspectorError;
const errors = [], requests = [], pending = new Map();
child.stdout.on('data', b => output += b); child.stderr.on('data', b => output += b);
child.on('exit', (code, signal) => exit = { code, signal }); child.on('error', error => inspectorError = error);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const endpoint = async regex => { for (let i = 0; i < 300; i++) { const match = output.match(regex); if (match) return match[1]; if (inspectorError) throw inspectorError; if (exit) throw Error('Native process exited: ' + JSON.stringify(exit) + '\n' + output); await delay(100); } throw Error('Native debugger unavailable\n' + output); };
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
try {
  socket = new WebSocket(await endpoint(/Debugger listening on (ws:\/\/[^\s]+)/));
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', event => { void (async () => {
    const message = JSON.parse(event.data);
    if (message.id) { const p = pending.get(message.id); if (p) { pending.delete(message.id); message.error ? p.reject(Error(JSON.stringify(message.error))) : p.resolve(message.result); } return; }
    if (message.method === 'NodeWorker.attachedToWorker') await send('NodeWorker.sendMessageToWorker', { sessionId: message.params.sessionId, message: JSON.stringify({ id: 1, method: 'Runtime.runIfWaitingForDebugger' }) });
    if (message.method === 'Debugger.paused') {
      if (!patched && message.params.hitBreakpoints?.length) {
        const result = await send('Debugger.evaluateOnCallFrame', { callFrameId: message.params.callFrames[0].callFrameId, expression: "app.requestSingleInstanceLock=()=>true;process.execArgv=process.execArgv.filter(arg=>!arg.startsWith('--inspect-brk'));true", returnByValue: true });
        assert.ok(!result.exceptionDetails); patched = true;
      }
      await send('Debugger.resume');
    }
  })().catch(error => inspectorError = error); });
  await send('Debugger.enable'); await send('NodeWorker.enable', { waitForDebuggerOnStart: false });
  await send('Debugger.setBreakpointByUrl', { urlRegex: '/src/desktop/main\\.cjs$', lineNumber: singletonLine }); await send('Runtime.runIfWaitingForDebugger');
  browser = await chromium.connectOverCDP(await endpoint(/DevTools listening on (ws:\/\/[^\s]+)/));
  const context = browser.contexts()[0], page = context.pages()[0] || await context.waitForEvent('page');
  page.on('pageerror', error => errors.push(error.message)); page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  await page.locator('.conversation-row').first().waitFor({ timeout: 30000 });
  const boot = await page.evaluate(() => window.desktop.invoke('bootstrap', {})); assert.equal(boot.version, '1.0.0');
  const about = await page.evaluate(() => window.desktop.invoke('app.about', {})); assert.equal(about.version, '1.0.0'); assert.equal(about.electron, '44.9.1');
  await page.locator('.conversation-row').first().click(); await page.locator('.message').first().waitFor();
  assert.match(await page.locator('#readerHost').innerText(), /quartz/);
  const results = await page.evaluate(() => window.desktop.invoke('search', { mode: 'local', q: 'quartz', searchMode: 'keyword' })); assert.ok(results.total > 0);
  await page.locator('[data-action="settings"]').click(); await page.locator('#prefTheme').selectOption('dark'); await page.locator('#settingsForm button[type="submit"]').click(); await page.locator('#settingsForm').waitFor({ state: 'detached' });
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  assert.deepEqual(errors, []); assert.deepEqual(requests, []); assert.ok(patched); if (inspectorError) throw inspectorError;
  await fs.writeFile(reportFile, JSON.stringify({ result: 'PASS', applicationVersion: about.version, electron: about.electron, embeddedNode: about.node, nativeLinuxGui: true, checks: ['packaged native launch', 'real archive worker and sandboxed preload', 'synthetic compressed archive read', 'local keyword search', 'persisted dark appearance'], pageErrors: errors, rendererNetworkRequests: requests, accommodations: ['Xvfb display', 'test-only --no-sandbox', 'test-only singleton socket override through inspector', 'debugger worker inheritance adjustment'], packageBytesModified: false, windowsNativeExecution: false }, null, 2) + '\n');
  console.log('Native packaged Reader smoke: PASS');
  await send('Runtime.evaluate', { expression: 'process.mainModule.require("electron").app.quit()' }).catch(() => {});
} finally {
  socket?.close(); child.kill(); await browser?.close().catch(() => {}); await fs.rm(profile, { recursive: true, force: true });
}
