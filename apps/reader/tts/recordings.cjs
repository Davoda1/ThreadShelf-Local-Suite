'use strict';
const {digest}=require('./cache.cjs');
const {PROFILE_DEFAULTS}=require('./settings.cjs');
const LOCAL=new Set(['pocket','kokoro']);
const API=new Set(['selfhosted','elevenlabs','openrouter','openai-realtime']);
const HASH=/^[a-f0-9]{64}$/;
const AUDIO_TYPES=new Set(['audio/wav','audio/mpeg','audio/ogg','audio/mp4','application/vnd.threadshelf.tts-clips-v1']);

function messageFingerprint(value){
 if(value===undefined)return undefined;
 if(!value||typeof value!=='object'||Array.isArray(value)||value.version!==1||typeof value.sha256!=='string'||!/^[a-fA-F0-9]{64}$/.test(value.sha256)||Object.keys(value).some(key=>!['version','sha256'].includes(key)))throw Error('Invalid message fingerprint.');
 return {version:1,sha256:value.sha256.toLowerCase()};
}
function validFingerprint(value){try{return messageFingerprint(value);}catch{return undefined;}}
function contentKey({sourceId,messageId,text}){return digest(JSON.stringify({schema:1,normalizer:1,sourceId,messageId,text}));}
function synthesisKey(settings,{sourceId,messageId,text}){return digest(JSON.stringify({schema:2,normalizer:1,sectioning:1,sourceId,messageId,text,provider:settings.provider,model:settings.model,voice:settings.voice,endpoint:settings.endpoint,instructions:settings.instructions,format:settings.responseFormat,readCode:settings.readCode,readCitations:settings.readCitations,engine:LOCAL.has(settings.provider)?require('./cpu.cjs').ENGINE_REVISIONS[settings.provider]:'adapter-v1'}));}
const originalKey=entry=>HASH.test(entry.synthesisKey||'')?entry.synthesisKey:entry.key;

class RecordingResolver{
 constructor(){this.legacyProofs=new Map();}
 legacyMatches(entry,settings,identity,exactKey,budget){
  const key=originalKey(entry);if(key===exactKey)return true;
  if(!HASH.test(key)||typeof entry.model!=='string'||typeof entry.voice!=='string'||!PROFILE_DEFAULTS[entry.provider])return false;
  const profile=settings.providerProfiles[entry.provider]||PROFILE_DEFAULTS[entry.provider];
  const proofKey=digest(JSON.stringify([key,contentKey(identity),profile.endpoint,profile.instructions]));
  if(this.legacyProofs.has(proofKey))return this.legacyProofs.get(proofKey);
  if(budget.remaining--<=0)return false;
  const endpoints=[...new Set([profile.endpoint,PROFILE_DEFAULTS[entry.provider].endpoint])],instructions=[...new Set([profile.instructions,''])];
  const formats=LOCAL.has(entry.provider)||entry.provider==='openai-realtime'?['wav']:['wav','pcm','mp3'];
  let matched=false;
  outer:for(const endpoint of endpoints)for(const instruction of instructions)for(const responseFormat of formats)for(const readCode of [false,true])for(const readCitations of [false,true]){
   if(synthesisKey({provider:entry.provider,model:entry.model,voice:entry.voice,endpoint,instructions:instruction,responseFormat,readCode,readCitations},identity)===key){matched=true;break outer;}
  }
  this.legacyProofs.set(proofKey,matched);while(this.legacyProofs.size>1024)this.legacyProofs.delete(this.legacyProofs.keys().next().value);
  return matched;
 }
 sameMessage(entry,settings,identity,exactKey,budget){
  if(entry.sourceId!==identity.sourceId||entry.messageId!==identity.messageId)return false;
  const storedFull=validFingerprint(entry.messageFingerprint),requestedFull=identity.messageFingerprint;
  if(storedFull&&requestedFull)return storedFull.sha256===requestedFull.sha256;
  const spoken=HASH.test(entry.contentKey||'')?entry.contentKey:entry.contentFingerprint;
  if(HASH.test(spoken||''))return spoken===contentKey(identity);
  return this.legacyMatches(entry,settings,identity,exactKey,budget);
 }
 async select({settings,identity,cache,sessionCache,consume=false},attempt=0){
  const exactKey=synthesisKey(settings,identity),keys=new Set(sessionCache.entries.keys()),budget={remaining:64};
  if(settings.cacheEnabled)for(const key of cache.entries.keys())keys.add(key);
  const rank=(key,source,entry)=>{
   if(entry?.complete!==true||entry.sourceId!==identity.sourceId||entry.messageId!==identity.messageId||!AUDIO_TYPES.has(entry.mime))return Infinity;
   if(source==='session'&&(!Buffer.isBuffer(entry.bytes)||entry.bytes.length!==entry.byteLength))return Infinity;
   const pin=cache.entries.get(key);
   // A retained copy may use a disk pin only when it contains the pinned bytes.
   const pinned=!!pin?.pinned&&(source==='disk'||entry.digest===pin.digest&&entry.byteLength===pin.bytes);
   if((pinned||settings.preferApiCache&&API.has(entry.provider))&&this.sameMessage(entry,settings,identity,exactKey,budget))return pinned?0:1;
   return originalKey(entry)===exactKey?2:Infinity;
  };
  const candidates=[];
  for(const key of keys)for(const [source,entry]of [['session',sessionCache.peek(key)],['disk',settings.cacheEnabled?cache.entries.get(key):null]]){
   const priority=rank(key,source,entry);if(Number.isFinite(priority))candidates.push({key,source,entry,rank:priority,lastUsed:Date.parse(entry.lastUsedAt)||0,created:Date.parse(entry.createdAt)||0});
  }
  candidates.sort((a,b)=>a.rank-b.rank||b.lastUsed-a.lastUsed||b.created-a.created||a.key.localeCompare(b.key)||(a.rank===0?(a.source==='disk'?-1:1):(a.source==='session'?-1:1)));
  const current=candidate=>{
   const entry=candidate.source==='session'?sessionCache.peek(candidate.key):cache.entries.get(candidate.key);
   return entry===candidate.entry&&rank(candidate.key,candidate.source,entry)===candidate.rank;
  };
  const retry=()=>this.select({settings,identity,cache,sessionCache,consume},attempt+1);
  for(const candidate of candidates){
   const reason=['pinned','api','exact'][candidate.rank];
   if(candidate.source==='session'){
    if(!current(candidate)){if(attempt<3)return retry();continue;}
    if(!consume)return {key:candidate.key,reason};
    const entry=sessionCache.get(candidate.key);
    return {key:candidate.key,reason,cacheSource:'session',bytes:Buffer.from(entry.bytes),mime:entry.mime,meta:{...entry,bytes:undefined}};
   }
   if(await cache.available(candidate.key,settings.cacheMaxAgeDays)){
    // Pinning and reviewed deletion may finish while file validation is pending.
    // Re-rank a changed selection before falling back to another recording.
    if(!current(candidate)){if(attempt<3)return retry();continue;}
    if(!consume)return {key:candidate.key,reason};
    const hit=await cache.get(candidate.key,settings.cacheMaxAgeDays);
    if(!hit)continue;
    if(!current(candidate)||hit.entry.digest!==candidate.entry.digest||hit.bytes.length!==candidate.entry.bytes){if(attempt<3)return retry();continue;}
    return {key:candidate.key,reason,cacheSource:'disk',bytes:hit.bytes,mime:hit.mime,meta:hit.entry};
   }
  }
  return null;
 }
 clear(){this.legacyProofs.clear();}
}
module.exports={RecordingResolver,messageFingerprint,contentKey,synthesisKey,originalKey};
