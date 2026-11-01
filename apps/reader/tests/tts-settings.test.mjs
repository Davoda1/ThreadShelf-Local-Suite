import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Exercise the controller's real status and deletion handlers without a renderer.
const source = fs.readFileSync(new URL('../src/ui/tts.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
const Controller = vm.runInNewContext(source + '\nTtsController;');

test('cache deletion keeps the empty settings status out of the Playback layout', async () => {
  const status = {textContent:'A previous operation completed.',className:'fine tts-settings-feedback'};
  const calls = [];
  const controller = new Controller({invoke:async (action,args)=>{calls.push([action,args]);},getContext:()=>({})});
  controller.formRoot = {isConnected:true,querySelector:selector=>selector==='#ttsSettingsStatus'?status:null};
  controller.draft = {};
  controller.captureProvider = () => {};
  controller.loadCache = async () => {};
  controller.deleteToken = 'reviewed-deletion';
  await controller.settingsAction({dataset:{ttsAction:'cache-delete'},disabled:false});
  assert.equal(calls[0][0], 'tts.cache.delete');
  assert.equal(calls[0][1].token, 'reviewed-deletion');
  assert.equal(status.textContent, '');
  assert.ok(status.className.split(' ').includes('tts-settings-feedback'));
  assert.equal(controller.deleteToken, null);
  controller.formStatus('A provider error', true);
  assert.ok(status.className.includes('inline-error'));
  assert.ok(status.className.includes('tts-settings-feedback'));
  controller.formStatus('');
  assert.equal(status.className, 'tts-settings-feedback fine');
});

test('cached playback metadata describes the recorded voice, not the selected provider', () => {
  const controller = new Controller({invoke:async()=>{},getContext:()=>({})});
  const session = {requestId:'current',purpose:'conversation',receiving:true,cancelled:false,recording:{provider:'pocket',voice:'alba',model:'pocket'}};
  controller.active = session;
  let rendered;
  controller.syncPill = () => { rendered = {...session.recording}; };
  controller.receiveTtsEvent({requestId:'old',purpose:'conversation',state:'ready',recording:{provider:'openrouter',voice:'stale',model:'stale'}});
  assert.equal(session.recording.voice, 'alba');
  controller.receiveTtsEvent({requestId:'current',purpose:'conversation',state:'ready',recording:{provider:'elevenlabs',voice:'saved-voice',model:'saved-model'},cacheReason:'pinned'});
  assert.deepEqual(rendered, {provider:'elevenlabs',voice:'saved-voice',model:'saved-model'});
});
