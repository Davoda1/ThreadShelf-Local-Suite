/** Explicit public evidence text, resolved from pinned owned capture bodies. */
const caches=new WeakMap();
function cacheFor(ctx){
 let cache=caches.get(ctx);if(cache)return cache;
 cache=new Map();caches.set(ctx,cache);const close=ctx.close.bind(ctx);
 ctx.close=()=>{for(const value of cache.values()){value.exists?.close();value.reader.close();}cache.clear();caches.delete(ctx);close();};return cache;
}
async function readerFor(ctx,cid){
 const owner=ctx.get('SELECT source_key,original_id FROM original_conversations WHERE cid=?',[cid]);if(!owner)return null;
 const stored=ctx.get("SELECT json_extract(json,?) json FROM metadata WHERE key='captureRefs'",['$['+Number(owner.source_key)+']']),ref=stored?.json?JSON.parse(stored.json):null;if(!ref)return null;
 const cache=cacheFor(ctx),key=String(owner.source_key);let value=cache.get(key);
 if(value){cache.delete(key);cache.set(key,value);}else{
  while(cache.size>=4){const first=cache.keys().next().value,old=cache.get(first);old.exists?.close();old.reader.close();cache.delete(first);}
  const reader=ref.reference?await ctx.storage.openReference(ref.reference,{signal:ctx.signal}):await ctx.storage.openSnapshot(ref.sourceId,{signal:ctx.signal});
  if(!reader)return null;value={reader};cache.set(key,value);
 }
 return{...value,entry:value,conversationId:owner.original_id};
}
/** Existence checks do not inflate bodies for history coverage counts. */
export async function bodyAvailable(ctx,{cid,id}){
 const found=await readerFor(ctx,cid);if(!found?.reader.hasBodies)return false;
 if(!found.entry.exists)found.entry.exists=found.reader.database.prepare('SELECT 1 n FROM record_bodies WHERE conversation_id=? AND id=? LIMIT 1');
 return !!found.entry.exists.get(found.conversationId,id);
}
/** Internal history hashing consumes the original body and flags without UI projection. */
export async function rawBodyRecord(ctx,{cid,id,limit}={}){const found=await readerFor(ctx,cid);return found?.reader.bodyRecord?found.reader.bodyRecord(found.conversationId,id,limit===undefined?{}:{limit}):null;}
/** Full text is opt-in for streamed exports; UI previews have UTF-16 bounds. */
export async function hydrateEvidence(ctx,value,{cid=value.conversationId,fullText=false,limit=8000,chartId,evidenceKey}={}){
 const {textUnavailable,...metadata}=value;if(textUnavailable||value.category==='redacted')return{...metadata,text:null,textTruncated:false};
 const found=await readerFor(ctx,cid);if(!found?.reader.bodyRecord)return{...metadata,text:null,textTruncated:false};
 const bound=Math.max(1,Math.min(20000,Math.floor(Number(limit)||8000))),body=await found.reader.bodyRecord(found.conversationId,value.id,fullText?{}:{limit:bound});if(!body)return{...metadata,text:null,textTruncated:false};
 const explorer=!!chartId||/^\d\d-/.test(evidenceKey||''),raw=!explorer&&typeof body.textExcerpt==='string'?body.textExcerpt:body.text;
 if(typeof raw!=='string')return{...metadata,text:null,textTruncated:false};
 const truncated=metadata.textTruncated===true||body.textTruncated===true||body.textExcerpt===true||(!explorer&&typeof body.textExcerpt==='string');
 if(fullText)return{...metadata,text:raw,textTruncated:truncated};
 let text=raw.slice(0,bound);if(text.length&&/[\uD800-\uDBFF]/.test(text.at(-1)))text=text.slice(0,-1);
 return{...metadata,text,textTruncated:truncated||raw.length>text.length};
}
