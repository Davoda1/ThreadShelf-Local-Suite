'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');const http=require('node:http');const crypto=require('node:crypto');const {EventEmitter}=require('node:events');
const {createTtsService,splitSpeech}=require('./index.cjs');const {SettingsStore,normalize,DEFAULTS}=require('./settings.cjs');const {AudioCache,SessionAudioCache,digest}=require('./cache.cjs');const {CredentialStore}=require('./credentials.cjs');const {wav,parseWav,synthesizeRealtime}=require('./providers.cjs');const {requestBuffer,JsonWebSocket}=require('./network.cjs');
async function directory(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'threadshelf-tts-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}
async function service(t,overrides={},options={}){const dir=await directory(t);let calls=0;const app=createTtsService({profileDir:dir,assetsDir:path.join(dir,'assets'),onEvent:options.onEvent,dependencies:{synthesizeCPU:async()=>{calls++;return wav(Buffer.alloc(480,1));},...overrides}});t.after(()=>app.dispose());return {app,dir,calls:()=>calls};}
const request=(id='r1',text='A simple reading.')=>({requestId:id,text,sourceId:'source-A',messageId:'message-A',thinking:false});
test('API recording preference defaults on, is boolean, and persists independently',async t=>{
 assert.equal(DEFAULTS.preferApiCache,true);assert.throws(()=>normalize({preferApiCache:'true'}),/preferApiCache/);
 const dir=await directory(t),store=new SettingsStore(dir);await store.save({preferApiCache:false});assert.equal((await new SettingsStore(dir).get()).preferApiCache,false);
 const old={...DEFAULTS};delete old.preferApiCache;await fs.writeFile(path.join(dir,'tts-settings-v1.json'),JSON.stringify(old));assert.equal((await new SettingsStore(dir).get()).preferApiCache,true);
});
test('pinned speech survives generation setting changes and returns its original recording identity',async t=>{
 let remoteCalls=0;const events=[];const {app,dir,calls}=await service(t,{synthesizeRemote:async()=>{remoteCalls++;return {bytes:wav(Buffer.alloc(480,2)),mime:'audio/wav'};}},{onEvent:event=>events.push(event)});
 await app.invoke('tts.settings.save',{settings:{enabled:true,cacheEnabled:true,preferApiCache:false}});
 const first=await app.invoke('tts.synthesize',request('original','Cafe\u0301\r\nA sentence.'));
 await app.invoke('tts.cache.pin',{key:first.cacheKey,pinned:true});
 const file=path.join(dir,'tts-cache',first.cacheKey+'.audio'),original=await fs.readFile(file);
 await app.invoke('tts.settings.save',{settings:{provider:'selfhosted',voice:'new-voice',model:'new-model',instructions:'Slowly.',readCode:true,readCitations:true}});
 assert.equal((await app.invoke('tts.availability',{messages:[{...request('check','Café\nA sentence.'),id:'same'}]})).items[0].available,true);
 const replay=await app.invoke('tts.synthesize',request('replay','Café\nA sentence.'));
 assert.equal(replay.cached,true);assert.equal(replay.cacheReason,'pinned');assert.equal(replay.cacheKey,first.cacheKey);assert.equal(replay.audioBase64,first.audioBase64);
 assert.deepEqual(replay.recording,{provider:'pocket',model:DEFAULTS.model,voice:'alba'});assert.equal(remoteCalls,0);assert.equal(calls(),1);
 assert(events.some(event=>event.requestId==='replay'&&event.state==='audio'&&event.recording?.voice==='alba'));
 assert.deepEqual(await fs.readFile(file),original);const entry=(await app.invoke('tts.cache.list')).entries.find(entry=>entry.key===first.cacheKey);assert.equal(entry.provider,'pocket');assert.equal(entry.voice,'alba');assert.match(entry.contentKey,/^[a-f0-9]{64}$/);
 const changed=await app.invoke('tts.synthesize',request('changed','Different spoken content.'));assert.equal(changed.cached,false);assert.equal(remoteCalls,1);assert.deepEqual(await fs.readFile(file),original);
});
test('preferred API speech beats exact CPU audio, while disabling preference restores exact reuse',async t=>{
 let remoteCalls=0;const {app,calls}=await service(t,{synthesizeRemote:async()=>{remoteCalls++;return {bytes:wav(Buffer.alloc(480,7)),mime:'audio/wav'};}});
 await app.invoke('tts.settings.save',{settings:{enabled:true,preferApiCache:false,provider:'selfhosted',voice:'api-voice',model:'api-model'}});
 const api=await app.invoke('tts.synthesize',request('api'));await app.invoke('tts.settings.save',{settings:{provider:'pocket'}});
 const cpu=await app.invoke('tts.synthesize',request('cpu'));assert.equal(cpu.cached,false);assert.equal(calls(),1);
 await app.invoke('tts.settings.save',{settings:{preferApiCache:true}});
 const preferred=await app.invoke('tts.synthesize',request('preferred'));assert.equal(preferred.cacheKey,api.cacheKey);assert.equal(preferred.cacheReason,'api');assert.equal(preferred.audioBase64,api.audioBase64);assert.equal(preferred.recording.voice,'api-voice');assert.equal(preferred.stored,false);
 await app.invoke('tts.settings.save',{settings:{provider:'elevenlabs',voice:'different-api-voice',model:'different-api-model'}});const remoteReplay=await app.invoke('tts.synthesize',request('remote-replay'));assert.equal(remoteReplay.cacheKey,api.cacheKey);assert.equal(remoteCalls,1);
 await app.invoke('tts.settings.save',{settings:{provider:'pocket',preferApiCache:false}});assert.equal((await app.invoke('tts.synthesize',request('exact-cpu'))).cacheKey,cpu.cacheKey);
 await app.invoke('tts.settings.save',{settings:{voice:'anna'}});assert.equal((await app.invoke('tts.synthesize',request('new-cpu'))).cached,false);assert.equal(calls(),2);
});
test('pinning refuses same-key replacement even when its original file is corrupt or absent',async t=>{
 const dir=await directory(t),cache=new AudioCache(dir),key=digest('pinned'),original=wav(Buffer.alloc(100,3)),changed=wav(Buffer.alloc(100,8)),meta={sourceId:'source',messageId:'message',provider:'pocket',model:'model',voice:'alba',mime:'audio/wav',complete:true};
 await cache.put(key,original,meta,1024,0);await cache.pin(key,true);
 assert.equal(await cache.put(key,changed,{...meta,voice:'anna'},1024,0),false);assert.deepEqual(await fs.readFile(cache.file(key)),original);
 await fs.writeFile(cache.file(key),Buffer.from('corrupt'));assert.equal(await cache.put(key,changed,meta,1024,0),false);assert.equal((await fs.readFile(cache.file(key))).toString(),'corrupt');
 await fs.unlink(cache.file(key));assert.equal(await cache.put(key,changed,meta,1024,0),false);await assert.rejects(fs.stat(cache.file(key)),{code:'ENOENT'});
 assert.equal(cache.entries.get(key).voice,'alba');await cache.pin(key,false);assert.equal(await cache.put(key,changed,meta,1024,0),true);
});
test('defaults isolate TTS and keep thinking and optional pill controls off',()=>{assert.equal(DEFAULTS.enabled,false);assert.equal(DEFAULTS.includeThinking,false);assert.equal(DEFAULTS.showPillSettings,false);assert.equal(DEFAULTS.showPillSpeed,false);assert.equal(DEFAULTS.cacheEnabled,false);assert.equal(DEFAULTS.voice,'alba');assert.throws(()=>normalize({apiKey:'secret'}),/Unknown/);assert.throws(()=>normalize({schemaVersion:2}),/version/);});
test('switching provider selects its own stored model, voice and endpoint',()=>{let s=normalize({provider:'kokoro'});assert.equal(s.voice,'am_michael');s=normalize({provider:'openai-realtime'},s);assert.equal(s.voice,'marin');assert.equal(s.model,'gpt-realtime-2.1-mini');assert.throws(()=>normalize({endpoint:'wss://attacker.test/realtime'},s),/OpenAI/);assert.throws(()=>normalize({provider:'selfhosted',endpoint:'file:///secret'},s),/HTTP/);});
test('settings persist separately and never modify existing application settings',async t=>{const dir=await directory(t),old=path.join(dir,'settings.json');await fs.writeFile(old,'original-settings');const store=new SettingsStore(dir);await Promise.all([store.save({enabled:true}),store.save({includeThinking:true})]);const reread=await new SettingsStore(dir).get();assert.equal(reread.enabled,true);assert.equal(reread.includeThinking,true);assert.equal(await fs.readFile(old,'utf8'),'original-settings');});
test('malformed settings fail closed and preserve the original file',async t=>{const dir=await directory(t),file=path.join(dir,'tts-settings-v1.json');await fs.writeFile(file,'{broken');const settings=await new SettingsStore(dir).get();assert.equal(settings.enabled,false);assert.match(settings.warning,/safe defaults/);assert.equal(await fs.readFile(file,'utf8'),'{broken');});
test('disabled and thinking guards prevent synthesis',async t=>{const {app,calls}=await service(t);await assert.rejects(app.invoke('tts.synthesize',request()),/disabled/);await app.invoke('tts.settings.save',{settings:{enabled:true}});await assert.rejects(app.invoke('tts.synthesize',{...request(),thinking:true}),/thinking/);assert.equal(calls(),0);await app.invoke('tts.settings.save',{settings:{includeThinking:true}});assert.equal((await app.invoke('tts.synthesize',{...request(),thinking:true})).mime,'audio/wav');});
test('cache off reopens completed session audio without reading or saving persistent audio',async t=>{const {app,dir,calls}=await service(t);await app.invoke('tts.settings.save',{settings:{enabled:true}});const first=await app.invoke('tts.synthesize',request());await app.invoke('tts.cancel',{requestId:'r1'});const reopened=await app.invoke('tts.synthesize',request('r2'));assert.equal(calls(),1);assert.equal(first.complete,true);assert.equal(reopened.complete,true);assert.equal(reopened.cacheSource,'session');assert.equal(reopened.cached,true);assert.equal(reopened.stored,false);assert.equal(reopened.sessionRetained,true);assert.equal(reopened.audioBase64,first.audioBase64);assert.equal(reopened.cacheKey,first.cacheKey);assert.match(reopened.cacheKey,/^[a-f0-9]{64}$/);await assert.rejects(fs.stat(path.join(dir,'tts-cache')),e=>e.code==='ENOENT');const sessions=await fs.readdir(path.join(dir,'tts-session'));assert.deepEqual(sessions,[]);const listed=await app.invoke('tts.cache.list');assert.equal(listed.entries.length,0);assert.equal(listed.session.count,1);assert.equal(listed.session.maxBytes,64*1024**2);});
test('cache hit survives playback rate change but separates voices and source identity',async t=>{const {app,calls}=await service(t);await app.invoke('tts.settings.save',{settings:{enabled:true,cacheEnabled:true}});const first=await app.invoke('tts.synthesize',request());assert.equal(first.stored,true);await app.invoke('tts.settings.save',{settings:{playbackRate:1.5}});assert.equal((await app.invoke('tts.synthesize',request('r2'))).cached,true);assert.equal(calls(),1);await app.invoke('tts.settings.save',{settings:{voice:'anna'}});assert.equal((await app.invoke('tts.synthesize',request('r3'))).cached,false);await app.invoke('tts.synthesize',{...request('r4'),sourceId:'source-B'});assert.equal(calls(),3);});
test('playback remains protected until matching cancellation, pins require explicit inclusion',async t=>{const {app}=await service(t);await app.invoke('tts.settings.save',{settings:{enabled:true,cacheEnabled:true}});const audio=await app.invoke('tts.synthesize',request());let plan=await app.invoke('tts.cache.preview',{filter:{scope:'all'}});assert.equal(plan.count,0);assert.equal(plan.protectedCount,1);await app.invoke('tts.cancel',{requestId:'unrelated'});assert.equal((await app.invoke('tts.cache.preview',{filter:{scope:'all'}})).count,0);await app.invoke('tts.cancel',{requestId:'r1'});await app.invoke('tts.cache.pin',{key:audio.cacheKey,pinned:true});assert.equal((await app.invoke('tts.cache.preview',{filter:{scope:'all'}})).count,0);plan=await app.invoke('tts.cache.preview',{filter:{scope:'all',includePinned:true}});assert.equal(plan.count,1);assert.equal((await app.invoke('tts.cache.delete',{token:plan.token})).count,1);await assert.rejects(app.invoke('tts.cache.delete',{token:plan.token}),/expired/);});
test('pinning after preview protects the clip from stale deletion plans',async t=>{const dir=await directory(t),cache=new AudioCache(dir),bytes=wav(Buffer.alloc(10)),key=digest('a');await cache.put(key,bytes,{sourceId:'s',messageId:'m',provider:'pocket',model:'m',voice:'alba',mime:'audio/wav'},10000,0);const plan=await cache.preview({scope:'all'});await cache.pin(key,true);assert.equal((await cache.remove(plan.token)).protectedCount,1);assert.equal((await cache.list()).entries.length,1);});
test('corrupt and expired entries are replaced and pins remain reusable past expiry',async t=>{const dir=await directory(t),cache=new AudioCache(dir),bytes=wav(Buffer.alloc(10)),key=digest('repair'),meta={sourceId:'s',messageId:'m',provider:'pocket',model:'m',voice:'alba',mime:'audio/wav'};await cache.put(key,bytes,meta,10000,0);await fs.writeFile(cache.file(key),Buffer.alloc(bytes.length));assert.equal(await cache.get(key,0),null);await cache.put(key,bytes,meta,10000,0);assert.deepEqual((await cache.get(key,0)).bytes,bytes);cache.entries.get(key).createdAt='2000-01-01T00:00:00.000Z';assert.equal(await cache.get(key,1),null);await cache.put(key,bytes,meta,10000,1);assert.ok(await cache.get(key,1));await cache.pin(key,true);cache.entries.get(key).createdAt='2000-01-01T00:00:00.000Z';assert.ok(await cache.get(key,1));await cache.put(key,bytes,meta,10000,1);assert.equal(cache.entries.get(key).pinned,true);});
test('full pinned cache does not exceed the cap or evict pinned clips',async t=>{const dir=await directory(t),cache=new AudioCache(dir),bytes=wav(Buffer.alloc(10)),meta={sourceId:'s',messageId:'m',provider:'pocket',model:'m',voice:'alba',mime:'audio/wav'},a=digest('a'),b=digest('b');await cache.put(a,bytes,meta,bytes.length,0);await cache.pin(a,true);assert.equal(await cache.put(b,bytes,meta,bytes.length,0),false);assert.equal((await cache.list()).totalBytes,bytes.length);});
test('cancellation rejects stale generation and cleans session files',async t=>{let entered;const ready=new Promise(resolve=>entered=resolve);const {app,dir}=await service(t,{synthesizeCPU:({signal})=>new Promise((resolve,reject)=>{entered();signal.addEventListener('abort',()=>reject(Object.assign(Error('cancel'),{name:'AbortError'})),{once:true});})});await app.invoke('tts.settings.save',{settings:{enabled:true}});const running=app.invoke('tts.synthesize',request());await ready;await app.invoke('tts.cancel',{requestId:'r1'});await assert.rejects(running,e=>e.name==='AbortError');assert.deepEqual(await fs.readdir(path.join(dir,'tts-session')),[]);});
test('long source is split without dropping text, WAV sections concatenate correctly',async t=>{const text=Array.from({length:140},(_,i)=>`Sentence ${i} is a complete sentence.`).join(' ');const chunks=splitSpeech(text);assert.ok(chunks.length>1);assert.equal(chunks.join(' '),text);assert.ok(chunks.every(v=>v.length<=1800));let sections=[];const {app}=await service(t,{synthesizeCPU:async ({text})=>{sections.push(text);return wav(Buffer.alloc(100));}});await app.invoke('tts.settings.save',{settings:{enabled:true}});const result=await app.invoke('tts.synthesize',request('long',text));assert.equal(parseWav(Buffer.from(result.audioBase64,'base64')).pcm.length,sections.length*100);assert.equal(sections.join(' '),text);});
test('session keys never reach settings or disk and are bound to endpoint',async t=>{const dir=await directory(t),vault=new CredentialStore(dir);const endpoint='http://localhost:8000/v1/audio/speech';await vault.set({provider:'selfhosted',endpoint,apiKey:'private-session-key'});assert.equal(await vault.get('selfhosted',endpoint),'private-session-key');assert.equal(await vault.get('selfhosted','http://localhost:8001/v1/audio/speech'),'');await assert.rejects(fs.stat(vault.file),e=>e.code==='ENOENT');await vault.set({provider:'selfhosted',endpoint,apiKey:''});assert.equal(await vault.get('selfhosted',endpoint),'');});
test('saved keys use authenticated encryption, restart locked, wrong passphrase fails',async t=>{const dir=await directory(t),endpoint='wss://api.openai.com/v1/realtime',vault=new CredentialStore(dir);await vault.set({provider:'openai-realtime',endpoint,apiKey:'private-api-secret',remember:true,passphrase:'long-secret-passphrase'});const raw=await fs.readFile(vault.file,'utf8');assert.ok(!raw.includes('private-api-secret'));assert.ok(!raw.includes('long-secret-passphrase'));const reopened=new CredentialStore(dir);assert.equal((await reopened.status('openai-realtime',endpoint)).locked,true);await assert.rejects(reopened.unlock({provider:'openai-realtime',endpoint,passphrase:'wrong-passphrase'}),/could not be unlocked/);await reopened.unlock({provider:'openai-realtime',endpoint,passphrase:'long-secret-passphrase'});assert.equal(await reopened.get('openai-realtime',endpoint),'private-api-secret');await reopened.set({provider:'openai-realtime',endpoint,apiKey:''});assert.equal((await reopened.status('openai-realtime',endpoint)).saved,true);assert.equal((await reopened.status('openai-realtime',endpoint)).locked,true);await reopened.forget({provider:'openai-realtime',endpoint});assert.equal((await reopened.status('openai-realtime',endpoint)).saved,false);});
async function server(t,fn){const s=http.createServer(fn),sockets=new Set();s.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});await new Promise(resolve=>s.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{for(const socket of sockets)socket.destroy();s.close(resolve);}));return {server:s,url:`http://127.0.0.1:${s.address().port}`};}
test('HTTP redirects are not followed and oversized responses are rejected',async t=>{let leaked=0;const dest=await server(t,(_req,res)=>{leaked++;res.end('data');});const src=await server(t,(req,res)=>{if(req.url==='/redirect'){res.writeHead(302,{Location:dest.url});res.end();}else{res.writeHead(200,{'Content-Length':'999'});res.end('data');}});await assert.rejects(requestBuffer(src.url+'/redirect',{headers:{Authorization:'Bearer private'}}),/Redirects/);assert.equal(leaked,0);await assert.rejects(requestBuffer(src.url,{maxBytes:8}),/size limit/);});
test('HTTP absolute deadline bounds a slow-drip response',async t=>{const src=await server(t,(_req,res)=>{res.writeHead(200);const timer=setInterval(()=>res.write('.'),20);res.on('close',()=>clearInterval(timer));});const start=Date.now();await assert.rejects(requestBuffer(src.url,{timeoutSeconds:.1}),/timed out/);assert.ok(Date.now()-start<1500);});
class FakeSocket extends EventEmitter{
 constructor(_url){super();FakeSocket.current=this;queueMicrotask(()=>this.emit('message',{type:'session.created'}));}
 send(event){if(event.type==='session.update'){assert.equal(event.session.tools.length,0);assert.equal(event.session.tool_choice,'none');assert.equal(event.session.audio.input.turn_detection,null);queueMicrotask(()=>this.emit('message',{type:'session.updated',session:{audio:{output:{format:{type:'audio/pcm',rate:24000}}}}}));}else if(event.type==='conversation.item.create'){this.text=event.item.content[0].text;queueMicrotask(()=>this.emit('message',{type:'conversation.item.added',item:{id:'threadshelf_reading'}}));}else if(event.type==='response.create'){queueMicrotask(()=>{this.emit('message',{type:'response.created',response:{id:'response1'}});const base={response_id:'response1',output_index:0,content_index:0};this.emit('message',{...base,type:'response.output_audio.delta',delta:Buffer.alloc(100).toString('base64')});this.emit('message',{...base,type:'response.output_audio.done'});this.emit('message',{...base,type:'response.output_audio_transcript.done',transcript:FakeSocket.mismatch?'Wrong words.':this.text});this.emit('message',{type:'response.done',response:{id:'response1',status:'completed'}});});}}
 close(){this.closed=true;}
}
test('Realtime sends literal text without mic/tools and validates before returning WAV',async()=>{const settings=normalize({provider:'openai-realtime'});FakeSocket.mismatch=false;const result=await synthesizeRealtime({settings,text:'Read these exact words, 123.',apiKey:'test',SocketClass:FakeSocket});assert.equal(parseWav(result.bytes).rate,24000);assert.equal(FakeSocket.current.closed,true);FakeSocket.mismatch=true;await assert.rejects(synthesizeRealtime({settings,text:'Read these exact words, 123.',apiKey:'test',SocketClass:FakeSocket}),/differs/);FakeSocket.mismatch=false;});
test('WebSocket rejects a forged upgrade handshake',async t=>{const src=await server(t,(_req,res)=>res.end());src.server.on('upgrade',(req,socket)=>{socket.end('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: incorrect\r\n\r\n');});await assert.rejects(new Promise((resolve,reject)=>{const ws=new JsonWebSocket(src.url.replace('http:','ws:'));ws.on('error',reject);ws.on('open',resolve);}),/handshake/);});
test('WebSocket parses fragmented JSON and responds to ping with masked pong',{timeout:3000},async t=>{const src=await server(t,(_req,res)=>res.end());let pong=false;src.server.on('upgrade',(req,socket)=>{const accept=crypto.createHash('sha1').update(req.headers['sec-websocket-key']+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);socket.on('data',data=>{if((data[0]&15)===10&&(data[1]&128))pong=true;});socket.write(Buffer.concat([Buffer.from([0x01,7]),Buffer.from('{"type"'),Buffer.from([0x89,1,65]),Buffer.from([0x80,8]),Buffer.from(':"okay"}')]));});await new Promise((resolve,reject)=>{const ws=new JsonWebSocket(src.url.replace('http:','ws:'));ws.on('error',reject);ws.on('message',message=>{assert.equal(message.type,'okay');setTimeout(()=>{ws.close();resolve();},20);});});assert.equal(pong,true);});
test('IPC rejects unknown actions and oversized/invalid payloads',async t=>{const {app}=await service(t);await assert.rejects(app.invoke('tts.unknown',{}),/Unknown/);await assert.rejects(app.invoke('tts.settings.get',[]),/Invalid/);await assert.rejects(app.invoke('tts.settings.get',{data:'x'.repeat(600000)}),/too large/);});
test('long MP3 provider readings return all clips and cached multipart audio round-trips',async t=>{let calls=0;const sections=[];const {app}=await service(t,{synthesizeRemote:async({text})=>{sections.push(text);calls++;return {mime:'audio/mpeg',bytes:Buffer.from('ID3'+String(calls).padStart(20,'0'))};}});await app.invoke('tts.settings.save',{settings:{enabled:true,cacheEnabled:true,provider:'selfhosted',model:'local-model',voice:'local-voice',responseFormat:'mp3'}});const text=Array.from({length:200},(_,i)=>`This is sentence number ${i}.`).join(' ');const first=await app.invoke('tts.synthesize',request('mp3',text));assert.ok(first.audioClips.length>2);assert.equal(first.audioBase64,undefined);assert.equal(sections.join(' '),text);const count=calls;const second=await app.invoke('tts.synthesize',request('cached',text));assert.equal(second.cached,true);assert.equal(calls,count);assert.deepEqual(second.audioClips,first.audioClips);});
test('cancelling a multipart provider request does not persist a partial reading',async t=>{let calls=0,entered;const ready=new Promise(resolve=>entered=resolve);const {app}=await service(t,{synthesizeRemote:async({signal})=>{calls++;if(calls===1)return {mime:'audio/mpeg',bytes:Buffer.from('ID3'+String(calls).padStart(20,'0'))};entered();return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(Error('cancel'),{name:'AbortError'})),{once:true}));}});await app.invoke('tts.settings.save',{settings:{enabled:true,cacheEnabled:true,provider:'selfhosted',model:'local-model',voice:'local-voice',responseFormat:'mp3'}});const running=app.invoke('tts.synthesize',request('long-mp3','A complete sentence. '.repeat(250)));await ready;await app.invoke('tts.cancel',{requestId:'long-mp3'});await assert.rejects(running,e=>e.name==='AbortError');assert.equal((await app.invoke('tts.cache.list')).entries.length,0);assert.equal(calls,2);});
test('multipart cache decoder rejects oversized counts, truncated clips, unknown MIME and trailing bytes',()=>{const {encodeClips,decodeClips}=require('./clips.cjs');const clips=[{mime:'audio/mpeg',bytes:Buffer.from('ID3a')},{mime:'audio/mpeg',bytes:Buffer.from('ID3b')}],encoded=encodeClips(clips);assert.deepEqual(decodeClips(encoded),clips);assert.throws(()=>decodeClips(encoded.subarray(0,encoded.length-1)),/length/);assert.throws(()=>decodeClips(Buffer.concat([encoded,Buffer.from('x')])),/Unexpected/);const badCount=Buffer.from(encoded);badCount.writeUInt32LE(100000,8);assert.throws(()=>decodeClips(badCount),/count/);const badMime=Buffer.from(encoded);badMime.write('other/xxxx',18);assert.throws(()=>decodeClips(badMime),/type/);});
test('orphan audio and temporary cache files are removable; missing bytes and protected files are reported accurately',async t=>{const dir=await directory(t),cache=new AudioCache(dir),meta={sourceId:'s',messageId:'m',provider:'pocket',model:'m',voice:'alba',mime:'audio/wav'},key=digest('missing'),bytes=wav(Buffer.alloc(10));await cache.put(key,bytes,meta,10000,0);await fs.rm(cache.file(key));const orphan=digest('orphan'),temp=digest('temp');await fs.writeFile(cache.file(orphan),'orphan-audio');await fs.writeFile(path.join(cache.dir,temp+'.audio.0123456789abcdef.tmp'),'temporary');await fs.writeFile(path.join(cache.dir,'unrelated-user-file.txt'),'keep');await fs.symlink(path.join(cache.dir,'unrelated-user-file.txt'),cache.file(digest('symlink')));const listed=await cache.list();assert.equal(listed.entries.length,3);assert.equal(listed.totalBytes,21);assert.equal(listed.entries.find(e=>e.key===key).bytes,0);assert.equal(listed.entries.find(e=>e.key===key).recordedBytes,bytes.length);cache.active.add(orphan);let plan=await cache.preview({scope:'incomplete'});assert.equal(plan.count,2);assert.equal(plan.bytes,9);assert.equal(plan.protectedCount,1);await cache.remove(plan.token);cache.active.clear();plan=await cache.preview({scope:'all'});assert.equal(plan.count,1);assert.equal(plan.bytes,12);assert.equal((await cache.remove(plan.token)).bytes,12);assert.equal(await fs.readFile(path.join(cache.dir,'unrelated-user-file.txt'),'utf8'),'keep');assert.equal((await fs.lstat(cache.file(digest('symlink')))).isSymbolicLink(),true);assert.equal((await cache.list()).entries.length,0);});
test('orphan deletion preview cannot delete a replacement file written after preview',async t=>{const dir=await directory(t),cache=new AudioCache(dir),key=digest('changed-orphan');await fs.mkdir(cache.dir,{recursive:true});await fs.writeFile(cache.file(key),'before');const plan=await cache.preview({scope:'all'});await fs.writeFile(cache.file(key),'after-longer');const result=await cache.remove(plan.token);assert.equal(result.count,0);assert.equal(result.protectedCount,1);assert.equal(await fs.readFile(cache.file(key),'utf8'),'after-longer');});
test('session replay restores cache protection only for the delivered request and key',async t=>{const {app}=await service(t);await app.invoke('tts.settings.save',{settings:{enabled:true,cacheEnabled:true}});const result=await app.invoke('tts.synthesize',request('replay'));await app.invoke('tts.cancel',{requestId:'replay'});assert.equal((await app.invoke('tts.cache.preview',{filter:{scope:'all'}})).count,1);assert.equal((await app.invoke('tts.playback',{requestId:'other',cacheKey:result.cacheKey,active:true})).protected,false);assert.equal((await app.invoke('tts.playback',{requestId:'replay',cacheKey:result.cacheKey,active:true})).protected,true);assert.equal((await app.invoke('tts.cache.preview',{filter:{scope:'all'}})).count,0);await app.invoke('tts.playback',{requestId:'replay',cacheKey:result.cacheKey,active:false});assert.equal((await app.invoke('tts.cache.preview',{filter:{scope:'all'}})).count,1);});
test('late playback leases cannot protect old clips after disabling TTS or changing provider',async t=>{const {app}=await service(t);await app.invoke('tts.settings.save',{settings:{enabled:true,cacheEnabled:true}});const first=await app.invoke('tts.synthesize',request('before-off'));await app.invoke('tts.cancel',{requestId:'before-off'});await app.invoke('tts.settings.save',{settings:{enabled:false}});assert.equal((await app.invoke('tts.playback',{requestId:'before-off',cacheKey:first.cacheKey,active:true})).protected,false);assert.equal((await app.invoke('tts.cache.preview',{filter:{scope:'all'}})).protectedCount,0);await app.invoke('tts.settings.save',{settings:{enabled:true}});const second=await app.invoke('tts.synthesize',request('before-provider'));await app.invoke('tts.cancel',{requestId:'before-provider'});await app.invoke('tts.settings.save',{settings:{provider:'kokoro'}});assert.equal((await app.invoke('tts.playback',{requestId:'before-provider',cacheKey:second.cacheKey,active:true})).protected,false);assert.equal((await app.invoke('tts.cache.preview',{filter:{scope:'all'}})).protectedCount,0);});
test('late thinking playback lease is invalidated when thinking speech is disabled',async t=>{const {app}=await service(t);await app.invoke('tts.settings.save',{settings:{enabled:true,cacheEnabled:true,includeThinking:true}});const result=await app.invoke('tts.synthesize',{...request('thinking-replay'),thinking:true});await app.invoke('tts.cancel',{requestId:'thinking-replay'});await app.invoke('tts.settings.save',{settings:{includeThinking:false}});assert.equal((await app.invoke('tts.playback',{requestId:'thinking-replay',cacheKey:result.cacheKey,active:true})).protected,false);assert.equal((await app.invoke('tts.cache.preview',{filter:{scope:'all'}})).protectedCount,0);});
test('streaming and volume defaults validate without altering synthesis identity',()=>{assert.equal(DEFAULTS.streamingEnabled,true);assert.equal(DEFAULTS.volume,1);assert.equal(DEFAULTS.showPillVolume,false);assert.equal(normalize({volume:0}).volume,0);assert.throws(()=>normalize({volume:1.1}),/volume/);assert.throws(()=>normalize({streamingEnabled:'true'}),/streamingEnabled/);});
test('streaming exposes real audio before generation resolves and preserves complete replay audio',async t=>{let release,first;const barrier=new Promise(resolve=>release=resolve),audioReady=new Promise(resolve=>first=resolve),events=[];const bytes=wav(Buffer.alloc(24000,20));const {app}=await service(t,{synthesizeCPU:async({onAudio,streamingEnabled})=>{assert.equal(streamingEnabled,true);onAudio({bytes,mime:'audio/wav'});await barrier;return wav(Buffer.concat([parseWav(bytes).pcm,parseWav(bytes).pcm]));}},{onEvent:event=>{events.push(event);if(event.state==='audio')first();}});await app.invoke('tts.settings.save',{settings:{enabled:true}});let complete=false;const run=app.invoke('tts.synthesize',request('progressive')).then(value=>{complete=true;return value;});await audioReady;assert.equal(complete,false);const event=events.find(e=>e.state==='audio');assert.equal(event.requestId,'progressive');assert.equal(event.purpose,'conversation');assert.equal(event.clipIndex,0);assert.ok(parseWav(Buffer.from(event.audioBase64,'base64')).pcm.length>0);release();const result=await run;assert.equal(result.streamed,true);assert.equal(result.clipCount,1);assert.ok(result.audioBase64);assert.equal(events.at(-1).state,'ready');});
test('streaming disabled buffers without emitting audio events',async t=>{const events=[];const {app}=await service(t,{synthesizeCPU:async({onAudio,streamingEnabled})=>{assert.equal(streamingEnabled,false);assert.equal(onAudio,undefined);return wav(Buffer.alloc(100));}},{onEvent:e=>events.push(e)});await app.invoke('tts.settings.save',{settings:{enabled:true,streamingEnabled:false}});const result=await app.invoke('tts.synthesize',request());assert.equal(result.streamed,undefined);assert.ok(result.audioBase64);assert.equal(events.filter(e=>e.state==='audio').length,0);});
test('preview uses unsaved draft while master is disabled and cannot read or write persistent audio or settings',async t=>{const seen=[],events=[];const {app,dir}=await service(t,{synthesizeCPU:async args=>{seen.push(args.voice);return wav(Buffer.alloc(100));}},{onEvent:e=>events.push(e)});await app.invoke('tts.settings.save',{settings:{enabled:true,cacheEnabled:true}});await app.invoke('tts.synthesize',request('saved'));await app.invoke('tts.settings.save',{settings:{enabled:false}});const settingsFile=await fs.readFile(path.join(dir,'tts-settings-v1.json'),'utf8'),indexFile=await fs.readFile(path.join(dir,'tts-cache/index-v1.json'),'utf8');const result=await app.invoke('tts.preview',{requestId:'draft-test',text:'A draft-only test.',thinking:true,settings:{enabled:false,cacheEnabled:true,voice:'anna',volume:0.25}});assert.equal(result.cacheKey,null);assert.equal(result.cached,false);assert.equal(result.stored,false);assert.equal(seen.at(-1),'anna');assert.equal(await fs.readFile(path.join(dir,'tts-settings-v1.json'),'utf8'),settingsFile);assert.equal(await fs.readFile(path.join(dir,'tts-cache/index-v1.json'),'utf8'),indexFile);assert.ok(events.filter(e=>e.requestId==='draft-test').every(e=>e.purpose==='preview'));assert.equal((await app.invoke('tts.settings.get')).enabled,false);assert.equal((await app.invoke('tts.settings.get')).voice,'alba');});
test('preview API-key override is transient and never unlocks or saves credentials',async t=>{let seen;const {app,dir}=await service(t,{synthesizeRemote:async args=>{seen=args;return {bytes:wav(Buffer.alloc(100)),mime:'audio/wav'};}});const result=await app.invoke('tts.preview',{requestId:'api-preview',text:'Draft provider test.',apiKey:'transient-preview-key',settings:{provider:'openrouter',model:'example/model',voice:'example-voice',responseFormat:'pcm'}});assert.equal(seen.apiKey,'transient-preview-key');assert.equal(seen.settings.provider,'openrouter');assert.equal(result.cacheKey,null);assert.equal((await app.invoke('tts.credentials.status')).providers.openrouter.available,false);await assert.rejects(fs.stat(path.join(dir,'tts-credentials-v1.json')),e=>e.code==='ENOENT');await assert.rejects(fs.stat(path.join(dir,'tts-settings-v1.json')),e=>e.code==='ENOENT');await assert.rejects(fs.stat(path.join(dir,'tts-cache')),e=>e.code==='ENOENT');});
test('changing saved master settings does not cancel an active draft preview',async t=>{let release,started,signal;const barrier=new Promise(resolve=>release=resolve),ready=new Promise(resolve=>started=resolve);const {app}=await service(t,{synthesizeCPU:async args=>{signal=args.signal;started();await barrier;return wav(Buffer.alloc(100));}});await app.invoke('tts.settings.save',{settings:{enabled:true}});const run=app.invoke('tts.preview',{requestId:'independent-preview',text:'Unsaved preview.',settings:{enabled:false}});await ready;await app.invoke('tts.settings.save',{settings:{enabled:false,provider:'kokoro'}});assert.equal(signal.aborted,false);release();assert.ok((await run).audioBase64);});
test('cancel after first streamed chunk rejects late audio and does not cache partial output',async t=>{let release,ready,onAudio;const barrier=new Promise(resolve=>release=resolve),first=new Promise(resolve=>ready=resolve),events=[];const {app}=await service(t,{synthesizeCPU:async args=>{onAudio=args.onAudio;onAudio({bytes:wav(Buffer.alloc(100)),mime:'audio/wav'});ready();await barrier;return wav(Buffer.alloc(200));}},{onEvent:e=>events.push(e)});await app.invoke('tts.settings.save',{settings:{enabled:true,cacheEnabled:true}});const running=app.invoke('tts.synthesize',request('cancel-stream'));await first;await app.invoke('tts.cancel',{requestId:'cancel-stream'});assert.throws(()=>onAudio({bytes:wav(Buffer.alloc(100)),mime:'audio/wav'}),e=>e.name==='AbortError');release();await assert.rejects(running,e=>e.name==='AbortError');assert.equal(events.filter(e=>e.state==='audio').length,1);assert.equal((await app.invoke('tts.cache.list')).entries.length,0);});
test('completed cache is reused across streaming, volume and playback-rate changes',async t=>{const {app,calls}=await service(t);await app.invoke('tts.settings.save',{settings:{enabled:true,cacheEnabled:true,streamingEnabled:false}});const first=await app.invoke('tts.synthesize',request('buffered'));await app.invoke('tts.settings.save',{settings:{streamingEnabled:true,volume:0.3,playbackRate:1.25,showPillVolume:true}});const result=await app.invoke('tts.synthesize',request('streamed'));assert.equal(result.cached,true);assert.equal(result.streamed,true);assert.equal(result.cacheKey,first.cacheKey);assert.equal(calls(),1);});
test('native HTTP PCM streaming preserves declared sample rate and channels before response completion',async t=>{const {synthesizeRemote}=require('./providers.cjs');let release,first;const barrier=new Promise(resolve=>release=resolve),ready=new Promise(resolve=>first=resolve);const pcm=Buffer.alloc(32000,20);const source=await server(t,async(req,res)=>{req.resume();res.writeHead(200,{'Content-Type':'audio/pcm;rate=16000;channels=2'});res.write(pcm);await barrier;res.end(pcm);});let completed=false;const clips=[];const settings=normalize({provider:'selfhosted',endpoint:source.url+'/v1/audio/speech',model:'local',voice:'voice',responseFormat:'pcm'});const run=synthesizeRemote({settings,text:'Streaming sample.',streamingEnabled:true,onAudio:clip=>{clips.push(clip);first();}}).then(result=>{completed=true;return result;});await ready;assert.equal(completed,false);assert.equal(parseWav(clips[0].bytes).rate,16000);assert.equal(parseWav(clips[0].bytes).channels,2);release();const result=await run;assert.equal(parseWav(result.bytes).pcm.length,64000);assert.equal(clips.length,2);});
test('PCM parser rejects incomplete frames and respects content-type parameters',()=>{const {pcmFormat,createPCMStream}=require('./pcm-stream.cjs');assert.deepEqual(pcmFormat('audio/pcm;rate=48000;channels=2'),{rate:48000,channels:2});assert.throws(()=>pcmFormat('audio/pcm;rate=999999'),/sample rate/);const sink=createPCMStream({onAudio:()=>{},wrapWav:wav});sink.configure('audio/pcm;rate=24000;channels=1','pcm');sink.push(Buffer.from([0]));assert.throws(()=>sink.finish(),/incomplete/);});
test('OpenRouter speech discovery preserves each model-specific voice list',()=>{const {openRouterModels}=require('./providers.cjs');const result=openRouterModels([{id:'tts/a',name:'A',architecture:{output_modalities:['speech']},supported_voices:['voice-a']},{id:'tts/b',name:'B',endpoints:['/api/v1/audio/speech'],supported_voices:[{id:'voice-b',name:'Voice B'}]},{id:'chat/audio',architecture:{output_modalities:['audio']},supported_voices:['wrong-voice']}]);assert.equal(result.length,2);assert.deepEqual(result[0].voices,[{id:'voice-a',name:'voice-a'}]);assert.deepEqual(result[1].voices,[{id:'voice-b',name:'Voice B'}]);});
test('CPU spawn environment forces telemetry off before runtime import',()=>{const {workerEnvironment}=require('./cpu.cjs');const previous=process.env.ORT_DISABLE_TELEMETRY;process.env.ORT_DISABLE_TELEMETRY='0';try{const env=workerEnvironment('/app/assets','/profile/session',2);assert.equal(env.ORT_DISABLE_TELEMETRY,'1');assert.equal(env.HF_HUB_DISABLE_TELEMETRY,'1');assert.equal(env.DO_NOT_TRACK,'1');assert.equal(env.HF_HUB_OFFLINE,'1');}finally{if(previous===undefined)delete process.env.ORT_DISABLE_TELEMETRY;else process.env.ORT_DISABLE_TELEMETRY=previous;}});
test('explicit PCM content type takes precedence over coincidental compressed-audio magic bytes',()=>{const {audioResult}=require('./providers.cjs');const pcm=Buffer.from([255,239,0,0,0,0,0,0]);const result=audioResult(pcm,'audio/pcm;rate=24000;channels=1','pcm');assert.equal(result.mime,'audio/wav');assert.deepEqual(parseWav(result.bytes).pcm,pcm);});
test('a remote stream that fails after audio is not retried or saved as a complete cache entry',async t=>{let requests=0;const src=await server(t,(req,res)=>{requests++;req.resume();res.writeHead(200,{'Content-Type':'audio/pcm;rate=24000;channels=1'});res.write(Buffer.alloc(24000,10));setTimeout(()=>res.destroy(),20);});const events=[];const {app}=await service(t,{}, {onEvent:e=>events.push(e)});await app.invoke('tts.settings.save',{settings:{enabled:true,cacheEnabled:true,provider:'selfhosted',endpoint:src.url+'/v1/audio/speech',model:'local',voice:'voice',responseFormat:'pcm'}});await assert.rejects(app.invoke('tts.synthesize',request('failed-stream')),/ended unexpectedly|connect/);assert.equal(requests,1);assert.equal(events.filter(e=>e.state==='audio').length,1);assert.equal(events.filter(e=>e.state==='ready').length,0);assert.equal((await app.invoke('tts.cache.list')).entries.length,0);});

test('session LRU keeps three completed recordings and refreshes recency on reopen',async t=>{
 const {app,calls}=await service(t);await app.invoke('tts.settings.save',{settings:{enabled:true}});
 const read=(text,id)=>app.invoke('tts.synthesize',request(id,text));
 for(const text of ['A','B','C'])await read(text,text);
 assert.equal((await read('A','reopen-A')).cacheSource,'session');assert.equal(calls(),3);
 await read('D','D');assert.equal((await app.invoke('tts.cache.list')).session.count,3);
 assert.equal((await read('C','reopen-C')).cached,true);assert.equal(calls(),4);
 assert.equal((await read('B','evicted-B')).cached,false);assert.equal(calls(),5);
});

test('session memory is bounded, never accepts partial audio, and clears owned buffers',()=>{
 const cache=new SessionAudioCache({maxBytes:100}),meta={complete:true,mime:'audio/wav',sourceId:'s',messageId:'m',provider:'pocket'},a=digest('a'),b=digest('b');
 const input=Buffer.alloc(60,7);assert.equal(cache.put(a,input,meta),true);const owned=cache.peek(a).bytes;
 input.fill(2);assert.equal(owned[0],7);cache.put(b,Buffer.alloc(60,9),meta);
 assert.equal(cache.peek(a),null);assert.equal(owned.every(v=>v===0),true);assert.equal(cache.summary().totalBytes,60);
 assert.throws(()=>cache.put(a,Buffer.alloc(10),{...meta,complete:false}),/completed/);
 assert.equal(cache.put(a,Buffer.alloc(101),meta),false);const last=cache.peek(b).bytes;cache.clear();assert.equal(cache.summary().count,0);assert.equal(cache.summary().totalBytes,0);assert.equal(last.every(v=>v===0),true);
 assert.equal(new SessionAudioCache().maxBytes,64*1024**2);
});

test('session retention ends on dispose and does not survive application recreation',async t=>{
 const {app,dir,calls}=await service(t);await app.invoke('tts.settings.save',{settings:{enabled:true}});await app.invoke('tts.synthesize',request());await app.dispose();
 let regenerated=0;const next=createTtsService({profileDir:dir,assetsDir:path.join(dir,'assets'),dependencies:{synthesizeCPU:async()=>{regenerated++;return wav(Buffer.alloc(100));}}});t.after(()=>next.dispose());
 assert.equal((await next.invoke('tts.cache.list')).session.count,0);const result=await next.invoke('tts.synthesize',request('after-restart'));assert.equal(result.cached,false);assert.equal(calls(),1);assert.equal(regenerated,1);await assert.rejects(fs.stat(path.join(dir,'tts-cache')),e=>e.code==='ENOENT');
});

test('previews neither reuse nor evict the three completed conversation recordings',async t=>{
 const {app,calls}=await service(t);await app.invoke('tts.settings.save',{settings:{enabled:true}});
 for(const text of ['A','B','C'])await app.invoke('tts.synthesize',request(text,text));
 for(let i=0;i<4;i++){const result=await app.invoke('tts.preview',{requestId:'preview-'+i,text:'A',settings:{enabled:false,cacheEnabled:true}});assert.equal(result.complete,true);assert.equal(result.sessionRetained,false);assert.equal(result.cacheKey,null);assert.equal(result.cacheSource,null);}
 assert.equal(calls(),7);assert.equal((await app.invoke('tts.cache.list')).session.count,3);
 for(const text of ['A','B','C'])assert.equal((await app.invoke('tts.synthesize',request('repeat-'+text,text))).cacheSource,'session');
 assert.equal(calls(),7);
});

test('interrupted streamed speech has explicit incomplete chunks and regenerates only on a new request',async t=>{
 let entered,release,calls=0;const ready=new Promise(r=>entered=r),barrier=new Promise(r=>release=r),events=[];
 const {app}=await service(t,{synthesizeCPU:async({onAudio})=>{calls++;onAudio({bytes:wav(Buffer.alloc(100,4)),mime:'audio/wav'});if(calls===1){entered();await barrier;}return wav(Buffer.alloc(200,4));}},{onEvent:e=>events.push(e)});
 await app.invoke('tts.settings.save',{settings:{enabled:true,cacheEnabled:true}});const running=app.invoke('tts.synthesize',request('partial'));await ready;await app.invoke('tts.cancel',{requestId:'partial'});release();await assert.rejects(running,e=>e.name==='AbortError');
 assert.equal(calls,1);assert.equal(events.filter(e=>e.requestId==='partial'&&e.complete===true).length,0);assert.equal(events.find(e=>e.state==='audio').complete,false);let listing=await app.invoke('tts.cache.list');assert.equal(listing.session.count,0);assert.equal(listing.entries.length,0);
 const complete=await app.invoke('tts.synthesize',request('explicit-regeneration'));assert.equal(calls,2);assert.equal(complete.complete,true);assert.equal(complete.cached,false);listing=await app.invoke('tts.cache.list');assert.equal(listing.session.count,1);assert.equal(listing.entries[0].complete,true);
});

test('explicitly incomplete disk entries are never promoted while legacy completed entries remain readable',async t=>{
 const dir=await directory(t),cache=new AudioCache(dir),bytes=wav(Buffer.alloc(100)),meta={sourceId:'s',messageId:'m',provider:'pocket',voice:'alba',model:'',mime:'audio/wav'},legacy=digest('legacy'),partial=digest('partial');
 await cache.put(legacy,bytes,meta,10000,0);await cache.put(partial,bytes,meta,10000,0);
 const index=JSON.parse(await fs.readFile(cache.indexFile,'utf8'));delete index.entries.find(e=>e.key===legacy).complete;index.entries.find(e=>e.key===partial).complete=false;await fs.writeFile(cache.indexFile,JSON.stringify(index));
 const reloaded=new AudioCache(dir);assert.equal(await reloaded.available(legacy,0),true);assert.equal(await reloaded.available(partial,0),false);assert.deepEqual((await reloaded.get(legacy,0)).bytes,bytes);assert.equal(await reloaded.get(partial,0),null);assert.equal((await reloaded.list()).entries.find(e=>e.key===partial).complete,false);
 assert.equal((await reloaded.preview({scope:'incomplete'})).count,1);await assert.rejects(reloaded.put(partial,bytes,{...meta,complete:false},10000,0),/completed/);
 await reloaded.put(partial,bytes,{...meta,complete:true},10000,0);assert.equal((await reloaded.get(partial,0)).entry.complete,true);
});

test('RAM-only playback leases release on end, restore on replay, and respect settings invalidation',async t=>{
 const {app}=await service(t);await app.invoke('tts.settings.save',{settings:{enabled:true}});const audio=await app.invoke('tts.synthesize',request());
 let plan=await app.invoke('tts.cache.preview',{filter:{scope:'all'}});assert.equal(plan.sessionCount,0);assert.equal(plan.sessionProtectedCount,1);
 await app.invoke('tts.playback',{requestId:'r1',cacheKey:null,active:false});assert.equal((await app.invoke('tts.cache.preview',{filter:{scope:'all'}})).sessionCount,1);
 assert.equal((await app.invoke('tts.playback',{requestId:'r1',active:true})).protected,true);assert.equal((await app.invoke('tts.cache.preview',{filter:{scope:'all'}})).sessionProtectedCount,1);
 await app.invoke('tts.settings.save',{settings:{enabled:false}});assert.equal((await app.invoke('tts.playback',{requestId:'r1',cacheKey:audio.cacheKey,active:true})).protected,false);assert.equal((await app.invoke('tts.cache.preview',{filter:{scope:'all'}})).sessionCount,1);
});

test('reviewed deletion clears matching session recordings without inventing disk files',async t=>{
 const {app,calls}=await service(t);await app.invoke('tts.settings.save',{settings:{enabled:true}});const a=await app.invoke('tts.synthesize',request('A','A'));await app.invoke('tts.synthesize',{...request('B','B'),sourceId:'source-B'});await app.invoke('tts.cancel');
 const plan=await app.invoke('tts.cache.preview',{filter:{scope:'selected',keys:[a.cacheKey]}});assert.equal(plan.count,0);assert.equal(plan.sessionCount,1);assert(plan.sessionBytes>0);const removed=await app.invoke('tts.cache.delete',{token:plan.token});assert.equal(removed.count,0);assert.equal(removed.sessionCount,1);assert.equal((await app.invoke('tts.cache.list')).session.count,1);
 assert.equal((await app.invoke('tts.synthesize',request('A-again','A'))).cached,false);assert.equal(calls(),3);await app.invoke('tts.cancel');
 const all=await app.invoke('tts.cache.preview',{filter:{scope:'all'}});assert.equal((await app.invoke('tts.cache.delete',{token:all.token})).sessionCount,2);assert.equal((await app.invoke('tts.cache.list')).session.count,0);
});

test('session deletion plans contain no audio buffers and cannot delete replaced entries',async t=>{
 const dir=await directory(t),sessionCache=new SessionAudioCache({maxEntries:1,maxBytes:100}),cache=new AudioCache(dir,{sessionCache}),meta={complete:true,sourceId:'s',messageId:'m',provider:'pocket',mime:'audio/wav'},a=digest('a'),b=digest('b');
 sessionCache.put(a,Buffer.alloc(40,3),meta);const original=sessionCache.peek(a),preview=await cache.preview({scope:'all'}),plan=cache.previews.get(preview.token);
 assert.deepEqual(Object.keys(plan.sessionEntries[0]).sort(),['byteLength','key','nonce']);assert.equal(JSON.stringify(plan).includes('"type":"Buffer"'),false);
 sessionCache.put(b,Buffer.alloc(40,8),meta);assert(original.bytes.every(v=>v===0));sessionCache.put(a,Buffer.alloc(40,9),meta);
 const result=await cache.remove(preview.token);assert.equal(result.sessionCount,0);assert.equal(result.sessionProtectedCount,1);assert.equal(sessionCache.peek(a).bytes[0],9);sessionCache.clear();
});

test('pin and active protections also apply to session copies during explicit deletion',async t=>{
 const {app}=await service(t);await app.invoke('tts.settings.save',{settings:{enabled:true,cacheEnabled:true}});const clip=await app.invoke('tts.synthesize',request());await app.invoke('tts.cancel');await app.invoke('tts.cache.pin',{key:clip.cacheKey,pinned:true});
 const blocked=await app.invoke('tts.cache.preview',{filter:{scope:'all'}});assert.equal(blocked.count,0);assert.equal(blocked.sessionCount,0);assert.equal(blocked.sessionProtectedCount,1);
 const plan=await app.invoke('tts.cache.preview',{filter:{scope:'all',includePinned:true}});assert.equal(plan.count,1);assert.equal(plan.sessionCount,1);const cleared=await app.invoke('tts.cache.delete',{token:plan.token});assert.equal(cleared.count,1);assert.equal(cleared.sessionCount,1);
});

test('an in-flight RAM replay owns stable audio if a later request evicts its LRU entry',async t=>{
 const {app,dir}=await service(t);await app.invoke('tts.settings.save',{settings:{enabled:true}});const first=await app.invoke('tts.synthesize',request('initial','Original recording'));const expected=Buffer.from(first.audioBase64,'base64');await app.invoke('tts.settings.save',{settings:{cacheEnabled:true}});
 let entered,release,observed;const ready=new Promise(r=>entered=r),barrier=new Promise(r=>release=r),original=AudioCache.prototype.put;
 t.mock.method(AudioCache.prototype,'put',async function(key,bytes,...rest){if(key===first.cacheKey){observed=bytes;entered();await barrier;assert.deepEqual(bytes,expected);}return original.call(this,key,bytes,...rest);});
 const blocked=app.invoke('tts.synthesize',request('waiting-replay','Original recording')).catch(error=>error);await ready;
 for(const text of ['Replacement A','Replacement B','Replacement C'])await app.invoke('tts.synthesize',request(text,text));
 assert.deepEqual(observed,expected);release();assert.equal((await blocked).name,'AbortError');assert.equal((await app.invoke('tts.cache.list')).session.count,3);
 const disk=new AudioCache(dir);assert.equal(await disk.get(first.cacheKey,0),null);
});

test('session RAM setting has four exact stops and old preference files retain the default',async t=>{
 assert.equal(DEFAULTS.sessionCacheMaxMiB,64);
 for(const value of [32,64,128,256])assert.equal(normalize({sessionCacheMaxMiB:value}).sessionCacheMaxMiB,value);
 for(const value of [0,16,33,63,65,96,255,257,512,32.5,'64',null,true,NaN,Infinity])assert.throws(()=>normalize({sessionCacheMaxMiB:value}),/RAM limit/);
 const dir=await directory(t),file=path.join(dir,'tts-settings-v1.json'),old=normalize({enabled:true});delete old.sessionCacheMaxMiB;const original=JSON.stringify(old);await fs.writeFile(file,original);
 const store=new SettingsStore(dir);assert.equal((await store.get()).sessionCacheMaxMiB,64);assert.equal(await fs.readFile(file,'utf8'),original);
 await assert.rejects(store.save({sessionCacheMaxMiB:96}),/RAM limit/);assert.equal(await fs.readFile(file,'utf8'),original);
 await store.save({sessionCacheMaxMiB:256});assert.equal((await new SettingsStore(dir).get()).sessionCacheMaxMiB,256);
});

test('session resize evicts oldest immediately, enlargement preserves entries, and per-recording bound stays64MiB',()=>{
 const cache=new SessionAudioCache({maxBytes:200}),meta={complete:true,mime:'audio/wav'},a=digest('resize-a'),b=digest('resize-b'),c=digest('resize-c');
 for(const key of [a,b,c])cache.put(key,Buffer.alloc(60,5),meta);cache.get(a);const evicted=cache.peek(b).bytes;
 cache.resize(120);assert.equal(cache.peek(b),null);assert(evicted.every(v=>v===0));assert.equal(cache.summary().count,2);assert.equal(cache.summary().totalBytes,120);
 cache.resize(256*1024**2);assert(cache.peek(a)&&cache.peek(c));assert.equal(cache.maxEntries,3);
 assert.equal(cache.put(b,Buffer.alloc(64*1024**2+1),meta),false);assert.equal(cache.summary().count,2);assert.throws(()=>cache.resize(256*1024**2+1),/limit/);cache.clear();
});

test('saved RAM limit shrinks and enlarges real session retention without changing audio identity',async t=>{
 let calls=0;const events=[];const {app}=await service(t,{synthesizeCPU:async()=>{calls++;return wav(Buffer.alloc(12*1024**2,17));}},{onEvent:e=>events.push(e)});await app.invoke('tts.settings.save',{settings:{enabled:true,streamingEnabled:false}});
 const keys={};for(const text of ['A','B','C'])keys[text]=(await app.invoke('tts.synthesize',request(text,text))).cacheKey;
 assert.equal((await app.invoke('tts.cache.list')).session.count,3);assert.equal((await app.invoke('tts.synthesize',request('touch-A','A'))).cacheKey,keys.A);
 const beforeCap=await availability(app,['A','B','C'].map(text=>availableRef(text,{text})));assert(beforeCap.items.every(e=>e.available));await app.invoke('tts.settings.save',{settings:{sessionCacheMaxMiB:32}});let listing=await app.invoke('tts.cache.list');assert.equal(listing.session.count,2);assert.equal(listing.session.maxBytes,32*1024**2);assert(listing.session.totalBytes<=listing.session.maxBytes);const afterCap=await availability(app,['A','B','C'].map(text=>availableRef(text,{text})));assert.deepEqual(afterCap.items.map(e=>e.available),[true,false,true]);assert(afterCap.revision>beforeCap.revision);assert.equal(events.at(-1).state,'availability-changed');
 assert.equal((await app.invoke('tts.synthesize',request('keep-A','A'))).cached,true);assert.equal(calls,3);
 await app.invoke('tts.settings.save',{settings:{sessionCacheMaxMiB:128}});assert.equal((await app.invoke('tts.cache.list')).session.maxBytes,128*1024**2);assert.equal((await app.invoke('tts.synthesize',request('keep-C','C'))).cacheKey,keys.C);assert.equal(calls,3);
 const regenerated=await app.invoke('tts.synthesize',request('evicted-B','B'));assert.equal(regenerated.cached,false);assert.equal(regenerated.cacheKey,keys.B);assert.equal(calls,4);listing=await app.invoke('tts.cache.list');assert.equal(listing.session.count,3);assert.equal(listing.entries.length,0);
});

test('persisted RAM cap is applied at startup and unsaved preview draft cannot resize it',async t=>{
 const dir=await directory(t);await new SettingsStore(dir).save({sessionCacheMaxMiB:128,enabled:true});
 const app=createTtsService({profileDir:dir,assetsDir:path.join(dir,'assets'),dependencies:{synthesizeCPU:async()=>wav(Buffer.alloc(100))}});t.after(()=>app.dispose());
 assert.equal((await app.invoke('tts.cache.list')).session.maxBytes,128*1024**2);
 await app.invoke('tts.synthesize',request());const before=await app.invoke('tts.cache.list');await app.invoke('tts.preview',{requestId:'unsaved-cap',text:'Preview.',settings:{sessionCacheMaxMiB:32,enabled:false}});
 const after=await app.invoke('tts.cache.list');assert.deepEqual(after.session,before.session);assert.equal((await app.invoke('tts.settings.get')).sessionCacheMaxMiB,128);
});

test('saving a RAM cap does not cancel synthesis or change the completed audio',async t=>{
 let entered,release,signal;const ready=new Promise(r=>entered=r),barrier=new Promise(r=>release=r),bytes=wav(Buffer.alloc(100,7));
 const {app}=await service(t,{synthesizeCPU:async args=>{signal=args.signal;entered();await barrier;return bytes;}});await app.invoke('tts.settings.save',{settings:{enabled:true}});
 const running=app.invoke('tts.synthesize',request('cap-during-generation'));await ready;await app.invoke('tts.settings.save',{settings:{sessionCacheMaxMiB:32}});assert.equal(signal.aborted,false);release();const result=await running;assert.equal(result.complete,true);assert.equal(result.audioBase64,bytes.toString('base64'));assert.equal((await app.invoke('tts.cache.list')).session.maxBytes,32*1024**2);
});

test('shrinking below a replay recording preserves in-flight audio and reports that it is no longer retained',async t=>{
 let calls=0;const {app}=await service(t,{synthesizeCPU:async()=>{calls++;return wav(Buffer.alloc(40*1024**2,23));}});await app.invoke('tts.settings.save',{settings:{enabled:true,streamingEnabled:false}});
 const initial=await app.invoke('tts.synthesize',request('large'));const originalDigest=digest(Buffer.from(initial.audioBase64,'base64'));await app.invoke('tts.settings.save',{settings:{cacheEnabled:true}});
 let entered,release;const ready=new Promise(r=>entered=r),barrier=new Promise(r=>release=r),originalPut=AudioCache.prototype.put;
 t.mock.method(AudioCache.prototype,'put',async function(key,bytes,...rest){entered();await barrier;assert.equal(digest(bytes),originalDigest);return originalPut.call(this,key,bytes,...rest);});
 const replay=app.invoke('tts.synthesize',request('replay-large'));await ready;await app.invoke('tts.settings.save',{settings:{sessionCacheMaxMiB:32}});assert.equal((await app.invoke('tts.cache.list')).session.count,0);release();
 const result=await replay;assert.equal(result.complete,true);assert.equal(result.cached,true);assert.equal(result.sessionRetained,false);assert.equal(result.cacheKey,initial.cacheKey);assert.equal(digest(Buffer.from(result.audioBase64,'base64')),originalDigest);assert.equal(calls,1);assert.equal((await app.invoke('tts.playback',{requestId:'replay-large',cacheKey:result.cacheKey,active:true})).protected,true);
});

const availableRef=(id='visible-A',extra={})=>({id,text:'A simple reading.',sourceId:'source-A',messageId:'message-A',thinking:false,...extra});
const availability=(app,messages=[availableRef()])=>app.invoke('tts.availability',{messages});

test('batched availability is bounded, ordered, metadata-only and shares exact text/source identity',async t=>{
 const {app,calls}=await service(t);await app.invoke('tts.settings.save',{settings:{enabled:true}});
 assert.deepEqual((await availability(app)).items,[{id:'visible-A',available:false}]);
 await app.invoke('tts.synthesize',request('normalized','  Cafe\u0301\r\nA sentence.  '));await app.invoke('tts.cancel');
 const result=await availability(app,[availableRef('same',{text:'Café\nA sentence.'}),availableRef('changed',{text:'Café\nAnother sentence.'}),availableRef('source',{text:'Café\nA sentence.',sourceId:'source-B'}),availableRef('message',{text:'Café\nA sentence.',messageId:'message-B'}),availableRef('empty',{text:' '})]);
 assert.deepEqual(Object.keys(result).sort(),['items','revision']);assert.deepEqual(result.items,[{id:'same',available:true},{id:'changed',available:false},{id:'source',available:false},{id:'message',available:false},{id:'empty',available:false}]);assert.equal(calls(),1);
 assert.deepEqual((await availability(app,[])).items,[]);await assert.rejects(availability(app,[availableRef(),availableRef()]),/Duplicate/);await assert.rejects(availability(app,Array.from({length:65},(_,i)=>availableRef(String(i)))),/64/);await assert.rejects(availability(app,[availableRef('bad',{thinking:'true'})]),/thinking/);
 await assert.rejects(availability(app,Array.from({length:8},(_,i)=>availableRef(String(i),{text:'a'.repeat(70000)}))),/too large/);
});

test('with API preference off availability respects synthesis settings while playback settings preserve reuse',async t=>{
 const {app}=await service(t,{synthesizeRemote:async()=>({mime:'audio/wav',bytes:wav(Buffer.alloc(100))})});
 await app.invoke('tts.settings.save',{settings:{enabled:true,preferApiCache:false,provider:'selfhosted',voice:'voice-a',model:'model-a',endpoint:'http://127.0.0.1:8000/v1/audio/speech'}});await app.invoke('tts.synthesize',request());
 const check=async expected=>assert.equal((await availability(app)).items[0].available,expected);await check(true);
 for(const [field,value,original] of [['voice','voice-b','voice-a'],['model','model-b','model-a'],['endpoint','http://127.0.0.1:8001/v1/audio/speech','http://127.0.0.1:8000/v1/audio/speech'],['instructions','Read calmly.',''],['responseFormat','mp3','wav'],['readCode',true,false],['readCitations',true,false]]){await app.invoke('tts.settings.save',{settings:{[field]:value}});await check(false);await app.invoke('tts.settings.save',{settings:{[field]:original}});await check(true);}
 await app.invoke('tts.settings.save',{settings:{volume:0.2,playbackRate:1.5,streamingEnabled:false,showPillVolume:true}});await check(true);
 await app.invoke('tts.settings.save',{settings:{provider:'pocket'}});await check(false);await app.invoke('tts.settings.save',{settings:{provider:'selfhosted'}});await check(true);
 await app.invoke('tts.settings.save',{settings:{enabled:false}});await check(false);await app.invoke('tts.settings.save',{settings:{enabled:true,includeThinking:false}});assert.equal((await availability(app,[availableRef('thought',{thinking:true})])).items[0].available,false);
 await app.invoke('tts.settings.save',{settings:{includeThinking:true}});assert.equal((await availability(app,[availableRef('thought',{thinking:true})])).items[0].available,true);
});

test('availability never refreshes LRU, and session eviction/deletion invalidates reusable recordings',async t=>{
 const events=[];const {app}=await service(t,{}, {onEvent:e=>events.push(e)});await app.invoke('tts.settings.save',{settings:{enabled:true}});
 for(const text of ['A','B','C'])await app.invoke('tts.synthesize',request(text,text));const refs=['A','B','C'].map(text=>availableRef(text,{text}));const before=await availability(app,refs);assert(before.items.every(e=>e.available));
 await availability(app,[refs[0]]);await app.invoke('tts.synthesize',request('D','D'));const after=await availability(app,refs);assert.equal(after.items[0].available,false);assert.equal(after.items[1].available,true);assert.equal(after.items[2].available,true);assert(after.revision>before.revision);
 await app.invoke('tts.cancel');const plan=await app.invoke('tts.cache.preview',{filter:{scope:'all'}});await app.invoke('tts.cache.delete',{token:plan.token});assert((await availability(app,refs)).items.every(e=>!e.available));
 const revisions=events.filter(e=>e.state==='availability-changed').map(e=>e.revision);assert(revisions.length>=6);assert(revisions.every((value,i)=>!i||value>revisions[i-1]));
});

test('availability finds valid persistent audio after restart without loading RAM or updating cache usage',async t=>{
 const {app,dir}=await service(t);await app.invoke('tts.settings.save',{settings:{enabled:true,cacheEnabled:true}});await app.invoke('tts.synthesize',request());await app.dispose();
 let synthesisCalls=0;const next=createTtsService({profileDir:dir,assetsDir:path.join(dir,'assets'),dependencies:{synthesizeCPU:async()=>{synthesisCalls++;throw Error('Availability must not synthesize.');}}});t.after(()=>next.dispose());
 await next.invoke('tts.settings.get');const indexPath=path.join(dir,'tts-cache/index-v1.json'),before=await fs.readFile(indexPath,'utf8');
 const original=fs.open;let audioOpens=0;t.mock.method(fs,'open',async function(file,...args){if(String(file).endsWith('.audio'))audioOpens++;return original.call(this,file,...args);});
 t.mock.method(AudioCache.prototype,'get',async()=>{throw Error('Availability must not read full audio or update last-used time.');});
 assert.equal((await availability(next)).items[0].available,true);assert.equal((await availability(next)).items[0].available,true);assert.equal(audioOpens,1);assert.equal(synthesisCalls,0);assert.equal((await next.invoke('tts.cache.list')).session.count,0);assert.equal(await fs.readFile(indexPath,'utf8'),before);
 await next.invoke('tts.settings.save',{settings:{cacheEnabled:false}});assert.equal((await availability(next)).items[0].available,false);assert.equal(audioOpens,1);
});

test('disk availability rejects corrupt/missing/incomplete/expired files and memoizes only stable identities',async t=>{
 const dir=await directory(t),cache=new AudioCache(dir),key=digest('availability-integrity'),bytes=wav(Buffer.alloc(100,4)),meta={sourceId:'s',messageId:'m',provider:'pocket',voice:'alba',model:'',mime:'audio/wav',complete:true};
 await cache.put(key,bytes,meta,10000,0);assert.equal(await cache.available(key,0),true);const original=await fs.stat(cache.file(key));
 await new Promise(resolve=>setTimeout(resolve,5));await fs.writeFile(cache.file(key),Buffer.alloc(bytes.length));await fs.utimes(cache.file(key),original.atime,original.mtime);assert.equal(await cache.available(key,0),false);
 await fs.writeFile(cache.file(key),bytes.subarray(0,40));assert.equal(await cache.available(key,0),false);await fs.writeFile(cache.file(key),bytes);assert.equal(await cache.available(key,0),true);cache.entries.get(key).complete=false;assert.equal(await cache.available(key,0),false);cache.entries.get(key).complete=true;cache.entries.get(key).mime='unsupported';assert.equal(await cache.available(key,0),false);cache.entries.get(key).mime='audio/wav';
 cache.entries.get(key).createdAt=new Date(Date.now()-86400000).toISOString();assert.equal(await cache.available(key,1),false);await cache.pin(key,true);assert.equal(await cache.available(key,1),true);
 await fs.rm(cache.file(key));assert.equal(await cache.available(key,0),false);const outside=path.join(dir,'unrelated.wav');await fs.writeFile(outside,bytes);await fs.symlink(outside,cache.file(key));assert.equal(await cache.available(key,0),false);
});

test('partial generation and completed previews never become available for conversation reuse',async t=>{
 let entered,release,calls=0;const ready=new Promise(r=>entered=r),barrier=new Promise(r=>release=r);
 const {app}=await service(t,{synthesizeCPU:async({onAudio})=>{calls++;onAudio?.({bytes:wav(Buffer.alloc(100)),mime:'audio/wav'});if(calls===1){entered();await barrier;}return wav(Buffer.alloc(100));}});
 await app.invoke('tts.settings.save',{settings:{enabled:true}});const run=app.invoke('tts.synthesize',request('partial-availability'));await ready;assert.equal((await availability(app)).items[0].available,false);await app.invoke('tts.cancel');release();await assert.rejects(run,e=>e.name==='AbortError');assert.equal((await availability(app)).items[0].available,false);
 await app.invoke('tts.preview',{requestId:'test-not-retained',text:'A simple reading.',settings:{enabled:true}});assert.equal((await availability(app)).items[0].available,false);assert.equal(calls,2);
});

test('availability snapshot revision lets the UI discard a result made stale by settings changes',async t=>{
 const {app,dir}=await service(t);await app.invoke('tts.settings.save',{settings:{enabled:true,cacheEnabled:true}});await app.invoke('tts.synthesize',request());await app.dispose();
 const events=[],next=createTtsService({profileDir:dir,assetsDir:path.join(dir,'assets'),onEvent:e=>events.push(e)});t.after(()=>next.dispose());let entered,release;const ready=new Promise(r=>entered=r),barrier=new Promise(r=>release=r),original=AudioCache.prototype.available;
 t.mock.method(AudioCache.prototype,'available',async function(...args){entered();await barrier;return original.apply(this,args);});
 const running=availability(next);await ready;await next.invoke('tts.settings.save',{settings:{voice:'anna'}});release();const stale=await running;assert.equal(stale.items[0].available,true);assert(stale.revision<events.at(-1).revision);assert.equal((await availability(next)).items[0].available,false);
});

test('expiry emits a revision event and removes persistent availability without populating RAM',async t=>{
 const {app,dir}=await service(t);await app.invoke('tts.settings.save',{settings:{enabled:true,cacheEnabled:true}});await app.invoke('tts.synthesize',request());await app.dispose();
 const indexPath=path.join(dir,'tts-cache/index-v1.json'),index=JSON.parse(await fs.readFile(indexPath,'utf8'));index.entries[0].createdAt=new Date(Date.now()-86400000+300).toISOString();await fs.writeFile(indexPath,JSON.stringify(index));await new SettingsStore(dir).save({cacheMaxAgeDays:1});
 let expired;const changed=new Promise(resolve=>expired=resolve);const next=createTtsService({profileDir:dir,assetsDir:path.join(dir,'assets'),onEvent:e=>{if(e.state==='availability-changed')expired(e);}});t.after(()=>next.dispose());
 assert.equal((await availability(next)).items[0].available,true);let timeout;const event=await Promise.race([changed,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Expiry event timeout')),2000);})]);clearTimeout(timeout);assert(event.revision>0);assert.equal((await availability(next)).items[0].available,false);assert.equal((await next.invoke('tts.cache.list')).session.count,0);
});

// A rejected response must not retain an unbounded body after its deadline ends.
test('rejected speech responses promptly close unfinished error and redirect bodies', async t=>{
 const serve=async status=>{
  let closed;const responseClosed=new Promise(resolve=>{closed=resolve;});
  const server=http.createServer((_request,response)=>{response.once('close',closed);response.writeHead(status,{'Content-Type':'text/plain',...(status===302?{Location:'http://example.invalid/blocked'}:{})});response.write('Rejected body remains unfinished.');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  return {url:'http://127.0.0.1:'+server.address().port,responseClosed};
 };
 const within=async promise=>{let timer;try{await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Rejected response body was left open.')),2000);})]);}finally{clearTimeout(timer);}};
 for(const status of [302,503]){const {url,responseClosed}=await serve(status);await assert.rejects(requestBuffer(url,{timeoutSeconds:1}),status===302?/Redirects are disabled/:/HTTP 503/);await within(responseClosed);}
 const {url,responseClosed}=await serve(503);const socket=new JsonWebSocket(url.replace('http:','ws:'),{timeoutSeconds:1});
 await new Promise((resolve,reject)=>{socket.once('error',error=>{try{assert.match(error.message,/HTTP 503/);resolve();}catch(failure){reject(failure);}});});
 await within(responseClosed);
});

async function cachedPolicyService(t, recordings, preferences={}, prepare=async()=>{}){
 const {synthesisKey,contentKey}=require('./index.cjs'),dir=await directory(t),cache=new AudioCache(dir),keys=[];
 for(const row of recordings){
  const message={...request(),...row.message},settings=normalize({provider:'selfhosted',model:'api-model',voice:'api-voice',...row.settings}),key=synthesisKey(settings,message);keys.push(key);
  await cache.put(key,wav(Buffer.alloc(100,row.sample??3)),{sourceId:message.sourceId,messageId:message.messageId,contentKey:contentKey(message),provider:settings.provider,model:settings.model,voice:settings.voice,mime:'audio/wav',complete:true},1024*1024,0);
  Object.assign(cache.entries.get(key),row.meta||{});
 }
 await cache.persist();await prepare(cache,keys);
 await new SettingsStore(dir).save({enabled:true,cacheEnabled:true,provider:'pocket',...preferences});
 let calls=0;const events=[],app=createTtsService({profileDir:dir,assetsDir:path.join(dir,'assets'),onEvent:event=>events.push(event),dependencies:{synthesizeCPU:async()=>{calls++;return wav(Buffer.alloc(100,9));},synthesizeRemote:async()=>{calls++;return {bytes:wav(Buffer.alloc(100,9)),mime:'audio/wav'};}}});t.after(()=>app.dispose());
 return {app,dir,keys,events,calls:()=>calls};
}
test('persistent fallback validates recording content and never leaks reuse across source or message identity',async t=>{
 const {app,calls,keys}=await cachedPolicyService(t,[{}]);
 const checked=await availability(app,[availableRef('same'),availableRef('source',{sourceId:'source-B'}),availableRef('message',{messageId:'message-B'}),availableRef('text',{text:'Different speech.'})]);
 assert.deepEqual(checked.items.map(item=>item.available),[true,false,false,false]);assert.equal(calls(),0);
 const reused=await app.invoke('tts.synthesize',request('reuse'));assert.equal(reused.cacheSource,'disk');assert.equal(reused.cacheKey,keys[0]);assert.equal(reused.recording.voice,'api-voice');assert.equal(calls(),0);
 for(const overrides of [{sourceId:'source-B'},{messageId:'message-B'},{text:'Different speech.'}])assert.equal((await app.invoke('tts.synthesize',{...request('separate'),...overrides})).cached,false);
 assert.equal(calls(),3);
});
test('persistent fallback skips expired, corrupt, missing, incomplete and unproven legacy candidates',async t=>{
 const cases=[
  ['expired',{createdAt:'2000-01-01T00:00:00.000Z'},async()=>{}],
  ['corrupt',{},async(cache,keys)=>fs.writeFile(cache.file(keys[0]),Buffer.alloc(144))],
  ['missing',{},async(cache,keys)=>fs.unlink(cache.file(keys[0]))],
  ['incomplete',{complete:false},async()=>{}],
  ['legacy',{contentKey:undefined,voice:'unproven-voice'},async()=>{}]
 ];
 for(const [name,meta,prepare] of cases)await t.test(name,async t=>{
  const {app,calls}=await cachedPolicyService(t,[{meta}],{cacheMaxAgeDays:1},prepare);
  assert.equal((await availability(app)).items[0].available,false);assert.equal(calls(),0);
  const result=await app.invoke('tts.synthesize',request(name));assert.equal(result.cached,false);assert.equal(calls(),1);
 });
});
test('a valid old pinned CPU recording outranks newer API and exact CPU recordings after restart',async t=>{
 const old='2000-01-01T00:00:00.000Z',recent=new Date().toISOString();
 const {app,keys,calls}=await cachedPolicyService(t,[
  {settings:{provider:'pocket',voice:'anna'},meta:{pinned:true,createdAt:old,lastUsedAt:old},sample:2},
  {meta:{createdAt:recent,lastUsedAt:recent},sample:3},
  {settings:{provider:'pocket',voice:'alba'},meta:{createdAt:recent,lastUsedAt:recent},sample:4}
 ],{cacheMaxAgeDays:1});
 assert.equal((await availability(app)).items[0].available,true);
 const result=await app.invoke('tts.synthesize',request());assert.equal(result.cacheReason,'pinned');assert.equal(result.cacheSource,'disk');assert.equal(result.cacheKey,keys[0]);assert.equal(result.recording.voice,'anna');assert.equal(calls(),0);
 await app.invoke('tts.settings.save',{settings:{preferApiCache:false,provider:'elevenlabs'}});
 assert.equal((await app.invoke('tts.synthesize',request('pin-stays'))).cacheKey,keys[0]);assert.equal(calls(),0);
});
test('disabled persistent caching never reads disk candidates, and pin metadata still protects retained session reuse',async t=>{
 const {app,keys,calls}=await cachedPolicyService(t,[{meta:{pinned:true}}],{cacheEnabled:false,preferApiCache:false});
 const originalAvailable=AudioCache.prototype.available,originalGet=AudioCache.prototype.get;
 let diskChecks=0,diskReads=0;
 t.mock.method(AudioCache.prototype,'available',function(...args){diskChecks++;return originalAvailable.apply(this,args);});
 t.mock.method(AudioCache.prototype,'get',function(...args){diskReads++;return originalGet.apply(this,args);});
 assert.equal((await availability(app)).items[0].available,false);assert.equal(diskChecks,0);assert.equal(diskReads,0);
 await app.invoke('tts.settings.save',{settings:{cacheEnabled:true}});assert.equal((await app.invoke('tts.synthesize',request('load-pin'))).cacheKey,keys[0]);assert.equal(calls(),0);
 await app.invoke('tts.settings.save',{settings:{cacheEnabled:false,provider:'elevenlabs'}});diskChecks=0;diskReads=0;
 assert.equal((await availability(app)).items[0].available,true);const replay=await app.invoke('tts.synthesize',request('session-pin'));assert.equal(replay.cacheSource,'session');assert.equal(replay.cacheReason,'pinned');assert.equal(replay.stored,false);assert.equal(diskChecks,0);assert.equal(diskReads,0);assert.equal(calls(),0);
});
test('API candidate ties use access time, creation time and key without availability mutating recency',async t=>{
 const old='2020-01-01T00:00:00.000Z',newer='2021-01-01T00:00:00.000Z';
 for(const criterion of ['access','creation','key'])await t.test(criterion,async t=>{
  const rows=[{settings:{voice:'first'},meta:{lastUsedAt:old,createdAt:old}},{settings:{voice:'second'},meta:{lastUsedAt:criterion==='access'?newer:old,createdAt:criterion==='creation'?newer:old}}];
  const {app,dir,keys,calls}=await cachedPolicyService(t,rows,{cacheMaxAgeDays:0});
  const file=path.join(dir,'tts-cache','index-v1.json'),before=await fs.readFile(file,'utf8');
  assert.equal((await availability(app)).items[0].available,true);assert.equal((await app.invoke('tts.cache.list')).session.count,0);assert.equal(await fs.readFile(file,'utf8'),before);
  const result=await app.invoke('tts.synthesize',request());assert.equal(result.cacheKey,criterion==='key'?[...keys].sort()[0]:keys[1]);assert.equal(calls(),0);
 });
});
test('API preference changes invalidate availability while preserving completed playback and legacy reuse',async t=>{
 const {app,keys,events,calls}=await cachedPolicyService(t,[{meta:{contentKey:undefined}}],{provider:'selfhosted',model:'api-model',voice:'api-voice'});
 const exact=await app.invoke('tts.synthesize',request());assert.equal(exact.cacheKey,keys[0]);assert.equal(exact.cached,true);
 await app.invoke('tts.settings.save',{settings:{provider:'pocket'}});assert.equal((await availability(app)).items[0].available,true);
 await app.invoke('tts.settings.save',{settings:{provider:'selfhosted',model:'api-model',voice:'api-voice'}});
 const replay=await app.invoke('tts.synthesize',request('lease'));const before=(await availability(app)).revision;
 await app.invoke('tts.settings.save',{settings:{preferApiCache:false}});assert.equal(events.at(-1).state,'availability-changed');assert((await availability(app)).revision>before);
 assert.equal((await app.invoke('tts.playback',{requestId:'lease',cacheKey:replay.cacheKey,active:true})).protected,true);const plan=await app.invoke('tts.cache.preview',{filter:{scope:'selected',keys:[replay.cacheKey]}});assert.equal(plan.count,0);assert.equal(plan.protectedCount,1);assert.equal(calls(),0);
});

test('regenerating corrupt pinned audio persists a separate replacement without lending it the original pin',async t=>{
 const original=wav(Buffer.alloc(100,3));
 const {app,dir,keys,calls}=await cachedPolicyService(t,[
  {settings:{provider:'pocket',model:DEFAULTS.model,voice:'alba'},meta:{pinned:true}},
  {sample:5}
 ],{preferApiCache:false},async(cache,keys)=>fs.writeFile(cache.file(keys[0]),Buffer.alloc(original.length)));
 const file=path.join(dir,'tts-cache',keys[0]+'.audio');
 const generated=await app.invoke('tts.synthesize',request('regenerate'));assert.notEqual(generated.cacheKey,keys[0]);assert.equal(generated.cached,false);assert.equal(generated.stored,true);assert.equal((await app.invoke('tts.cache.list')).entries.find(entry=>entry.key===generated.cacheKey).pinned,false);assert.equal(calls(),1);assert.deepEqual(await fs.readFile(file),Buffer.alloc(original.length));
 await app.invoke('tts.settings.save',{settings:{preferApiCache:true}});
 const api=await app.invoke('tts.synthesize',request('prefer-api'));assert.equal(api.cacheKey,keys[1]);assert.equal(api.cacheReason,'api');assert.equal(calls(),1);
 await app.invoke('tts.settings.save',{settings:{preferApiCache:false,cacheEnabled:false}});
 const exact=await app.invoke('tts.synthesize',request('exact-session'));assert.equal(exact.cacheKey,generated.cacheKey);assert.equal(exact.cacheReason,'exact');assert.equal(exact.cacheSource,'session');assert.equal(exact.audioBase64,generated.audioBase64);
 await app.invoke('tts.settings.save',{settings:{provider:'kokoro'}});assert.equal((await availability(app)).items[0].available,false);
 // Restoring the original valid bytes must restore their pinned priority.
 await fs.writeFile(file,original);await app.invoke('tts.settings.save',{settings:{cacheEnabled:true}});
 const restored=await app.invoke('tts.synthesize',request('restored'));assert.equal(restored.cacheReason,'pinned');assert.equal(restored.cacheSource,'disk');assert.equal(restored.audioBase64,original.toString('base64'));assert.equal(calls(),1);
 await app.invoke('tts.settings.save',{settings:{cacheEnabled:false}});
 const pinnedMemory=await app.invoke('tts.synthesize',request('restored-memory'));assert.equal(pinnedMemory.cacheReason,'pinned');assert.equal(pinnedMemory.cacheSource,'session');assert.equal(pinnedMemory.audioBase64,restored.audioBase64);assert.equal(calls(),1);
});

test('full-message identity retains pinned speech across filtering without allowing reuse after a message edit',async t=>{
 const {app,calls}=await service(t),fingerprint={version:1,sha256:digest('Full message with code and a citation')};
 await app.invoke('tts.settings.save',{settings:{enabled:true,cacheEnabled:true,preferApiCache:false,readCode:true,readCitations:true}});
 const original=await app.invoke('tts.synthesize',{...request('full','Prose, code and citation.'),messageFingerprint:fingerprint});await app.invoke('tts.cache.pin',{key:original.cacheKey,pinned:true});
 await app.invoke('tts.settings.save',{settings:{readCode:false,readCitations:false}});
 for(const text of ['Prose.','']){
  assert.equal((await availability(app,[availableRef('filtered',{text,messageFingerprint:fingerprint})])).items[0].available,true);
  const replay=await app.invoke('tts.synthesize',{...request('filtered',text),messageFingerprint:fingerprint});assert.equal(replay.cacheKey,original.cacheKey);assert.equal(replay.cacheReason,'pinned');assert.equal(replay.audioBase64,original.audioBase64);
 }
 assert.equal(calls(),1);
 const changed={version:1,sha256:digest('Edited full message')};
 assert.equal((await availability(app,[availableRef('changed',{text:'Prose.',messageFingerprint:changed}),availableRef('source',{sourceId:'other',text:'Prose.',messageFingerprint:fingerprint}),availableRef('message',{messageId:'other',text:'Prose.',messageFingerprint:fingerprint})])).items.some(item=>item.available),false);
 await assert.rejects(app.invoke('tts.synthesize',{...request('empty',''),messageFingerprint:changed}),/no text/);assert.equal(calls(),1);
 // An unchanged exact synthesis remains reusable when only excluded source text changed.
 await app.invoke('tts.settings.save',{settings:{readCode:true,readCitations:true}});
 const exact=await app.invoke('tts.synthesize',{...request('exact','Prose, code and citation.'),messageFingerprint:changed});assert.equal(exact.cacheKey,original.cacheKey);assert.equal(exact.cacheReason,'exact');assert.equal(calls(),1);
});

test('full-message matching applies to every API provider and preference off restores current filtering',async t=>{
 for(const provider of ['selfhosted','elevenlabs','openrouter','openai-realtime'])await t.test(provider,async t=>{
  let remoteCalls=0;const {app,calls}=await service(t,{synthesizeRemote:async()=>{remoteCalls++;return {bytes:wav(Buffer.alloc(100,2)),mime:'audio/wav'};}}),fingerprint={version:1,sha256:digest('Unchanged source')};
  await app.invoke('tts.settings.save',{settings:{enabled:true,provider,readCode:true}});
  const original=await app.invoke('tts.synthesize',{...request('api','Text and code.'),messageFingerprint:fingerprint});
  await app.invoke('tts.settings.save',{settings:{provider:'pocket',readCode:false}});
  const replay=await app.invoke('tts.synthesize',{...request('filtered','Text.'),messageFingerprint:fingerprint});assert.equal(replay.cacheKey,original.cacheKey);assert.equal(replay.cacheReason,'api');assert.equal(replay.recording.provider,provider);assert.equal(calls(),0);assert.equal(remoteCalls,1);
  await app.invoke('tts.settings.save',{settings:{preferApiCache:false}});
  assert.equal((await availability(app,[availableRef('filtered',{text:'Text.',messageFingerprint:fingerprint})])).items[0].available,false);
  assert.equal((await app.invoke('tts.synthesize',{...request('current','Text.'),messageFingerprint:fingerprint})).cached,false);assert.equal(calls(),1);
 });
});

test('message fingerprints reject malformed requests and never authorize preview reuse',async t=>{
 const {app,calls}=await service(t);await app.invoke('tts.settings.save',{settings:{enabled:true}});
 for(const value of [null,[],{},'hash',{version:2,sha256:digest('source')},{version:1,sha256:'short'},{version:1,sha256:digest('source'),text:'private'}]){
  await assert.rejects(app.invoke('tts.synthesize',{...request(),messageFingerprint:value}),/fingerprint/);
  await assert.rejects(availability(app,[availableRef('bad',{messageFingerprint:value})]),/fingerprint/);
 }
 const fingerprint={version:1,sha256:digest('source')};
 await app.invoke('tts.preview',{...request('preview'),messageFingerprint:fingerprint});
 assert.equal((await availability(app,[availableRef('not-saved',{messageFingerprint:fingerprint})])).items[0].available,false);assert.equal(calls(),1);
 await assert.rejects(app.invoke('tts.preview',{...request('empty',''),messageFingerprint:fingerprint}),/text/);
});

test('legacy API reuse requires a proven synthesis identity and availability does not rewrite its metadata',async t=>{
 const {app,dir,keys,calls}=await cachedPolicyService(t,[{meta:{contentKey:undefined,pinned:true}}],{preferApiCache:false});
 const file=path.join(dir,'tts-cache','index-v1.json'),before=await fs.readFile(file,'utf8');
 assert.equal((await availability(app)).items[0].available,true);assert.equal(await fs.readFile(file,'utf8'),before);
 assert.equal((await availability(app,[availableRef('edited',{text:'Different source text'})])).items[0].available,false);
 const replay=await app.invoke('tts.synthesize',request('legacy'));assert.equal(replay.cacheKey,keys[0]);assert.equal(replay.cacheReason,'pinned');assert.equal(calls(),0);
});

test('pin and deletion changes during file validation cannot leave a stale availability result',async t=>{
 for(const mutation of ['unpin','delete'])await t.test(mutation,async t=>{
  const {app}=await cachedPolicyService(t,[{settings:{provider:'pocket',voice:'anna'},meta:{pinned:true}}],{preferApiCache:false});
  const available=AudioCache.prototype.available;let changed=false;
  t.mock.method(AudioCache.prototype,'available',async function(key,...args){const found=await available.call(this,key,...args);if(found&&!changed){changed=true;if(mutation==='unpin')await this.pin(key,false);else{const plan=await this.preview({scope:'selected',keys:[key],includePinned:true});await this.remove(plan.token);}}return found;});
  assert.equal((await availability(app)).items[0].available,false);assert.equal(changed,true);
 });
});

test('a pin changed while a disk recording is read cannot retain its old playback priority',async t=>{
 const {app,calls}=await cachedPolicyService(t,[{settings:{provider:'pocket',voice:'anna'},meta:{pinned:true}}],{preferApiCache:false});
 const get=AudioCache.prototype.get;let changed=false;
 t.mock.method(AudioCache.prototype,'get',async function(key,...args){const hit=await get.call(this,key,...args);if(hit&&!changed){changed=true;await this.pin(key,false);}return hit;});
 const result=await app.invoke('tts.synthesize',request('unpin-during-read'));assert.equal(changed,true);assert.equal(result.cached,false);assert.equal(calls(),1);
});

test('pinning an invalid original during generation stores new audio separately and preserves original metadata',async t=>{
 const {app,dir}=await service(t);await app.invoke('tts.settings.save',{settings:{enabled:true,cacheEnabled:true}});
 const original=await app.invoke('tts.synthesize',request());await app.dispose();const file=path.join(dir,'tts-cache',original.cacheKey+'.audio'),corrupt=Buffer.alloc(Buffer.from(original.audioBase64,'base64').length,8);await fs.writeFile(file,corrupt);
 let entered,release,calls=0;const ready=new Promise(r=>entered=r),barrier=new Promise(r=>release=r);
 const next=createTtsService({profileDir:dir,assetsDir:path.join(dir,'assets'),dependencies:{synthesizeCPU:async()=>{calls++;entered();await barrier;return wav(Buffer.alloc(100,4));}}});t.after(()=>next.dispose());
 const pending=next.invoke('tts.synthesize',request('generation'));await ready;await next.invoke('tts.cache.pin',{key:original.cacheKey,pinned:true});const before=(await next.invoke('tts.cache.list')).entries.find(entry=>entry.key===original.cacheKey);release();
 const result=await pending;assert.notEqual(result.cacheKey,original.cacheKey);assert.equal(result.stored,true);assert.deepEqual(await fs.readFile(file),corrupt);assert.deepEqual((await next.invoke('tts.cache.list')).entries.find(entry=>entry.key===original.cacheKey),before);assert.equal(calls,1);
 await next.dispose();const restarted=createTtsService({profileDir:dir,assetsDir:path.join(dir,'assets'),dependencies:{synthesizeCPU:async()=>{throw Error('Unexpected regeneration');}}});t.after(()=>restarted.dispose());
 const replay=await restarted.invoke('tts.synthesize',request('replacement'));assert.equal(replay.cached,true);assert.equal(replay.cacheKey,result.cacheKey);assert.equal(replay.audioBase64,result.audioBase64);
 await restarted.invoke('tts.cancel');const plan=await restarted.invoke('tts.cache.preview',{filter:{scope:'selected',keys:[result.cacheKey]}});await restarted.invoke('tts.cache.delete',{token:plan.token});const remaining=(await restarted.invoke('tts.cache.list')).entries;assert.equal(remaining.length,1);assert.equal(remaining[0].key,original.cacheKey);assert.equal(remaining[0].pinned,true);
});

test('a different retained copy at the same key cannot borrow a disk pin',async()=>{
 const {RecordingResolver,synthesisKey,contentKey}=require('./recordings.cjs'),identity=request(),originalSettings=normalize({provider:'pocket',voice:'alba'}),key=synthesisKey(originalSettings,identity),settings=normalize({provider:'kokoro',cacheEnabled:false,preferApiCache:false});
 const memory=new SessionAudioCache(),bytes=wav(Buffer.alloc(100,3));memory.put(key,bytes,{sourceId:identity.sourceId,messageId:identity.messageId,contentKey:contentKey(identity),provider:'pocket',model:originalSettings.model,voice:'alba',mime:'audio/wav',complete:true});
 const cache={entries:new Map([[key,{pinned:true,digest:digest(wav(Buffer.alloc(100,8))),bytes:bytes.length}]]),available:async()=>{throw Error('Unexpected disk read');}};
 assert.equal(await new RecordingResolver().select({settings,identity,cache,sessionCache:memory}),null);
});

test('changing API preference cancels pending generation without cancelling a completed playback lease',async t=>{
 let entered,release;const ready=new Promise(r=>entered=r),barrier=new Promise(r=>release=r);
 const {app}=await service(t,{synthesizeCPU:async()=>{entered();await barrier;return wav(Buffer.alloc(100,2));}});
 await app.invoke('tts.settings.save',{settings:{enabled:true}});const pending=app.invoke('tts.synthesize',request('pending-policy'));await ready;
 await app.invoke('tts.settings.save',{settings:{preferApiCache:false}});release();await assert.rejects(pending,error=>error.name==='AbortError');assert.equal((await availability(app)).items[0].available,false);
 const completed=await app.invoke('tts.synthesize',request('completed-policy'));assert.equal((await app.invoke('tts.playback',{requestId:completed.requestId,cacheKey:completed.cacheKey,active:true})).protected,true);
 await app.invoke('tts.settings.save',{settings:{preferApiCache:true}});
 const plan=await app.invoke('tts.cache.preview',{filter:{scope:'selected',keys:[completed.cacheKey]}});assert.equal(plan.sessionCount,0);assert.equal(plan.sessionProtectedCount,1);
 assert.equal((await app.invoke('tts.playback',{requestId:completed.requestId,cacheKey:completed.cacheKey,active:false})).protected,false);
 const released=await app.invoke('tts.cache.preview',{filter:{scope:'selected',keys:[completed.cacheKey]}});assert.equal(released.sessionCount,1);
});

test('pinning an exact recording during validation reselects its new priority without regenerating audio',async t=>{
 for(const check of ['availability','playback'])await t.test(check,async t=>{
  const {app,keys,calls}=await cachedPolicyService(t,[{settings:{provider:'pocket',voice:'alba'}}],{preferApiCache:false});
  const available=AudioCache.prototype.available;let changed=false;
  t.mock.method(AudioCache.prototype,'available',async function(key,...args){const found=await available.call(this,key,...args);if(found&&!changed){changed=true;await this.pin(key,true);}return found;});
  if(check==='availability')assert.equal((await availability(app)).items[0].available,true);
  const result=await app.invoke('tts.synthesize',request('newly-pinned'));assert.equal(changed,true);assert.equal(result.cached,true);assert.equal(result.cacheReason,'pinned');assert.equal(result.cacheKey,keys[0]);assert.equal(calls(),0);assert.equal((await app.invoke('tts.cache.list')).entries.length,1);
 });
});

test('recording selection bounds retries when pin state repeatedly changes during validation',async()=>{
 const {RecordingResolver,synthesisKey,contentKey}=require('./recordings.cjs'),identity=request(),settings=normalize({provider:'pocket',voice:'alba',cacheEnabled:true,preferApiCache:false}),key=synthesisKey(settings,identity);
 const entry={key,sourceId:identity.sourceId,messageId:identity.messageId,contentKey:contentKey(identity),provider:'pocket',model:settings.model,voice:settings.voice,mime:'audio/wav',complete:true,pinned:false};let probes=0;
 const cache={entries:new Map([[key,entry]]),available:async()=>{probes++;entry.pinned=!entry.pinned;return true;}};
 assert.equal(await new RecordingResolver().select({settings,identity,cache,sessionCache:new SessionAudioCache()}),null);assert.equal(probes,4);
});

async function cpuWorkerFixture(t, {alias = false, wrongResult = false} = {}) {
 const {PassThrough,Writable}=require('node:stream'),vm=require('node:vm');
 const root=await directory(t),assetsDir=path.join(root,'assets'),physicalWork=path.join(root,'physical-session');
 await fs.mkdir(physicalWork,{recursive:true});
 const workDir=alias?path.join(root,'session-alias'):physicalWork;
 if(alias)await fs.symlink(physicalWork,workDir,process.platform==='win32'?'junction':'dir');
 for(const relative of [process.platform==='win32'?'runtime/python/python.exe':'runtime/python/bin/python3','models/pocket/model.safetensors','models/pocket/tokenizer.json','models/pocket/english_2026-10.upstream.yaml','models/pocket/voices/alba.safetensors',`engines/pocket/pocket-tts${process.platform==='win32'?'.exe':''}`]){
  const file=path.join(assetsDir,relative);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,'test asset');
 }
 const audio=wav(Buffer.alloc(480,7));let requestedOutput,canonicalOutput;
 const spawn=()=>{
  const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();let input='';
  child.stdin=new Writable({write(chunk,encoding,callback){input+=chunk;callback();},final(callback){
   void(async()=>{
    const request=JSON.parse(input);requestedOutput=request.output_path;
    canonicalOutput=path.join(await fs.realpath(path.dirname(request.output_path)),path.basename(request.output_path));
    await fs.writeFile(canonicalOutput,audio);
    child.stdout.end(JSON.stringify({type:'result',ok:true,output_path:wrongResult?path.join(path.dirname(canonicalOutput),'unrelated.wav'):canonicalOutput})+'\r\n');
   })().then(()=>{callback();child.emit('close',0);},error=>{callback(error);child.emit('close',1);});
  }});
  return child;
 };
 const module={exports:{}};
 vm.runInNewContext(await fs.readFile(path.join(__dirname,'cpu.cjs'),'utf8'),{module,exports:module.exports,require:name=>name==='node:child_process'?{spawn}:require(name),__dirname,Buffer,process,setTimeout,clearTimeout},{filename:'cpu.cjs'});
 return {synthesize:()=>module.exports.synthesizeCPU({provider:'pocket',voice:'alba',text:'Offline speech test.',assetsDir,workDir}),workDir,audio,paths:()=>({requestedOutput,canonicalOutput})};
}

test('CPU worker completion accepts canonical paths through an aliased session directory',async t=>{
 const fixture=await cpuWorkerFixture(t,{alias:true});
 assert.deepEqual(await fixture.synthesize(),fixture.audio);
 assert.equal(fixture.paths().requestedOutput,fixture.paths().canonicalOutput);
 assert.deepEqual(await fs.readdir(fixture.workDir),[]);
});

test('CPU worker completion still rejects an unrelated output path and cleans its session',async t=>{
 const fixture=await cpuWorkerFixture(t,{wrongResult:true});
 await assert.rejects(fixture.synthesize(),/did not complete its audio output/);
 assert.deepEqual(await fs.readdir(fixture.workDir),[]);
});
