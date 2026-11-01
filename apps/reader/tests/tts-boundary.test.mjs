import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('TTS preload exposes only the allowed main-process commands',async()=>{
 let bridge;const calls=[];
 const ipcRenderer={invoke:async(...args)=>{calls.push(args);return {enabled:false};},on(){},removeListener(){}};
 vm.runInNewContext(fs.readFileSync(new URL('../src/desktop/preload.cjs',import.meta.url),'utf8'),{require:name=>{assert.equal(name,'electron');return {ipcRenderer,contextBridge:{exposeInMainWorld(name,value){assert.equal(name,'desktop');bridge=value;}}};},process:{argv:[]}});
 for(const action of ['settings.get','settings.save','synthesize','preview','cancel','playback','cache.list','cache.preview','cache.delete','cache.pin','providers.discover','credentials.set','credentials.status','credentials.unlock','credentials.forget'])await bridge.invoke('tts.'+action,{test:true});
 assert.equal(calls.length,15);assert.ok(calls.every(c=>c[0]==='reader:invoke'&&c[1].startsWith('tts.')));
 await assert.rejects(bridge.invoke('tts.arbitrary-file-delete'),/Unknown action/);
 await assert.rejects(bridge.invoke('tts.__proto__'),/Unknown action/);
 assert.equal(calls.length,15,'Rejected requests must not cross IPC');
});
test('TTS event subscriptions omit the privileged IPC event and can be removed',()=>{
 let bridge;const listeners=new Map();
 const ipcRenderer={on:(name,fn)=>listeners.set(name,fn),removeListener:(name,fn)=>{assert.equal(listeners.get(name),fn);listeners.delete(name);}};
 vm.runInNewContext(fs.readFileSync(new URL('../src/desktop/preload.cjs',import.meta.url),'utf8'),{require:()=>({ipcRenderer,contextBridge:{exposeInMainWorld:(_name,value)=>{bridge=value;}}}),process:{argv:[]}});
 assert.throws(()=>bridge.onTtsEvent(null),/callback/);
 let received;const unsubscribe=bridge.onTtsEvent((...args)=>{received=args;});
 const value={requestId:'test',purpose:'preview',state:'audio'};
 listeners.get('reader:tts')({sender:'privileged'},value);
 assert.deepEqual(received,[value]);unsubscribe();assert.equal(listeners.size,0);
});
