'use strict';
const {randomBytes}=require('node:crypto');

const CHUNK_CHARS=1024*1024;
const MAX_PAYLOAD_CHARS=536870000;
const TRANSFER_MARKER='analytics-json-transfer-v1';
const transferError=(code,message)=>Object.assign(new Error(message),{code});

/** Retain immutable serialized snapshots, never one oversized Electron message. */
function createTransferStore({chunkChars=CHUNK_CHARS,ttlMs=5*60*1000,maxTransfers=2,maxChars=768*1024*1024,maxPayloadChars=MAX_PAYLOAD_CHARS,now=Date.now}={}){
 if(!Number.isSafeInteger(chunkChars)||chunkChars<2||chunkChars>CHUNK_CHARS||!Number.isSafeInteger(maxTransfers)||maxTransfers<1||!Number.isSafeInteger(maxChars)||maxChars<chunkChars||!Number.isSafeInteger(maxPayloadChars)||maxPayloadChars<chunkChars||maxPayloadChars>MAX_PAYLOAD_CHARS||!Number.isFinite(ttlMs)||ttlMs<=0)throw new TypeError('Invalid transfer limits.');
 const entries=new Map();let characters=0;
 const remove=id=>{const entry=entries.get(id);if(!entry)return false;characters-=entry.text.length;entries.delete(id);return true;};
 const sweep=()=>{const time=now();for(const[id,entry]of entries)if(entry.expiresAt<=time)remove(id);};
 const validId=id=>typeof id==='string'&&/^[a-f0-9]{32}$/.test(id);
 return Object.freeze({
  encode(text,{revision=null,isData=false}={}){
   if(typeof text!=='string')throw new TypeError('Expected serialized JSON.');sweep();
   if(text.length>maxPayloadChars||text.length>maxChars)throw transferError('TRANSFER_TOO_LARGE','The serialized analytical snapshot exceeds its transfer limit.');
   if(text.length<=chunkChars)return text;
   while(entries.size>=maxTransfers||characters+text.length>maxChars){const metadata=[...entries].find(([,entry])=>!entry.isData);remove(metadata?.[0]||entries.keys().next().value);}
   const offsets=[0];for(let offset=0;offset<text.length;){let end=Math.min(offset+chunkChars,text.length);if(end<text.length&&text.charCodeAt(end-1)>=0xd800&&text.charCodeAt(end-1)<=0xdbff&&text.charCodeAt(end)>=0xdc00&&text.charCodeAt(end)<=0xdfff)end--;offsets.push(end);offset=end;}
   const id=randomBytes(16).toString('hex'),descriptor=Object.freeze({__analyticsTransfer:TRANSFER_MARKER,id,count:offsets.length-1,length:text.length,chunkChars,revision:Number.isFinite(revision)?revision:null,isData:!!isData});
   entries.set(id,{text,offsets,next:0,isData:descriptor.isData,expiresAt:now()+ttlMs});characters+=text.length;return descriptor;
  },
  read(value){
   if(!value||typeof value!=='object'||!validId(value.id)||!Number.isSafeInteger(value.index)||value.index<0)throw transferError('TRANSFER_REQUEST_INVALID','Invalid analytical transfer request.');
   sweep();const entry=entries.get(value.id);if(!entry)throw transferError('TRANSFER_UNAVAILABLE','The analytical transfer expired or was released.');
   if(value.index!==entry.next||value.index>=entry.offsets.length-1)throw transferError('TRANSFER_ORDER_INVALID','Analytical transfer chunks must be read in order.');
   const chunk=entry.text.slice(entry.offsets[value.index],entry.offsets[value.index+1]);entry.next++;entry.expiresAt=now()+ttlMs;return chunk;
  },
  release(value){if(!value||typeof value!=='object'||!validId(value.id))throw transferError('TRANSFER_REQUEST_INVALID','Invalid analytical transfer identity.');return{released:remove(value.id)};},
  sweep,
  clear(){entries.clear();characters=0;},
  stats(){sweep();return{transfers:entries.size,characters};}
 });
}
module.exports={createTransferStore,CHUNK_CHARS,MAX_PAYLOAD_CHARS,TRANSFER_MARKER};
