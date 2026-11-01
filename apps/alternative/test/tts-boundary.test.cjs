'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
test('TTS preload restricts requests to its explicit command set',async()=>{
 let bridge;const calls=[];
 const ipcRenderer={sendSync:()=> 'dark',invoke:async(...args)=>{calls.push(args);return {ok:true,value:{enabled:false}};}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../preload.cjs'),'utf8'),{require:name=>{assert.equal(name,'electron');return {ipcRenderer,contextBridge:{exposeInMainWorld(name,value){assert.equal(name,'alternative');bridge=value;}}};}});
 for(const action of ['settings.get','settings.save','synthesize','preview','cancel','playback','availability','cache.list','cache.preview','cache.delete','cache.pin','providers.discover','credentials.set','credentials.status','credentials.unlock','credentials.forget'])await bridge.tts('tts.'+action,{test:true});
 assert.equal(calls.length,16);assert.ok(calls.every(c=>c[0]==='alternative:tts'&&c[1].startsWith('tts.')));
 await assert.rejects(bridge.tts('tts.arbitrary-file-delete'),/Unknown Text-to-Speech action/);
 await assert.rejects(bridge.tts('tts.__proto__'),/Unknown Text-to-Speech action/);
 assert.equal(calls.length,16,'Rejected requests must not cross IPC');
});
test('TTS event subscriptions omit the privileged IPC event and can be removed',()=>{
 let bridge;const listeners=new Map();
 const ipcRenderer={sendSync:()=> 'dark',on:(name,fn)=>listeners.set(name,fn),removeListener:(name,fn)=>{assert.equal(listeners.get(name),fn);listeners.delete(name);}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../preload.cjs'),'utf8'),{require:()=>({ipcRenderer,contextBridge:{exposeInMainWorld:(_name,value)=>{bridge=value;}}})});
 assert.throws(()=>bridge.onTtsEvent(null),/callback/);
 let received;const unsubscribe=bridge.onTtsEvent((...args)=>{received=args;});
 const value={requestId:'test',purpose:'preview',state:'audio'};
 listeners.get('alternative:tts-event')({sender:'privileged'},value);
 assert.deepEqual(received,[value]);unsubscribe();assert.equal(listeners.size,0);
});
