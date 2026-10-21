/** Independent analytical adapters. MIT, davoda1.
 * Parsing is deterministic and side-effect free. Collections never select a provider.
 * All evidence remains inert data; this module does not perform I/O or execute HTML.
 */
import { createHash } from 'node:crypto';
import { findTranscripts, splitTranscript, conversationDate } from './parsers/meta.mjs';

export const ADAPTER_VERSION = '2.0.0';
export const ANALYTICAL_SCHEMA_VERSION = 2;
export const SUPPORTED_ADAPTER_VERSIONS = Object.freeze(['1.0.0', '2.0.0']);
export const SUPPORTED_ANALYTICAL_SCHEMA_VERSIONS = Object.freeze([1, 2]);
const arr = value => Array.isArray(value) ? value : [];
const obj = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const str = value => typeof value === 'string' ? value : value == null ? '' : String(value);
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value, (_, v) => typeof v === 'bigint' ? String(v) : v)).digest('hex');
const stableHash = value => {
  const digest=createHash('sha256');
  const write=v=>{if(Array.isArray(v)){digest.update('[');v.forEach((child,i)=>{if(i)digest.update(',');write(child);});digest.update(']');}else if(obj(v)){digest.update('{');Object.keys(v).filter(k=>v[k]!==undefined).sort().forEach((k,i)=>{if(i)digest.update(',');digest.update(JSON.stringify(k)+':');write(v[k]);});digest.update('}');}else digest.update(JSON.stringify(typeof v==='bigint'?str(v):v??null));};
  write(value);return digest.digest('hex');
};
const nativeId = value => value == null || value === '' ? null : str(value);
const pointer = value => str(value).replaceAll('~', '~0').replaceAll('/', '~1');
const role = value => /^(user|human)$/i.test(str(value)) ? 'user' : /^(assistant|model|ai)$/i.test(str(value)) ? 'response' : /^(thinking|reasoning|analysis)$/i.test(str(value)) ? 'thinking' : /^(system|developer)$/i.test(str(value)) ? 'system' : /^(tool|function)$/i.test(str(value)) ? 'tool_output' : 'other';
const aliases = new Map([['chatgpt','openai'],['claude','anthropic'],['veniceai','venice'],['meta-ai','meta'],['lmstudio','lm-studio'],['google','google-ai-studio'],['xai','grok']]);
const platform = value => aliases.get(str(value).toLowerCase()) || str(value).toLowerCase() || 'unknown';

/** Strict source timestamp parsing. Epoch zero is valid; date-only values stay day precision.
 * Offset-less source datetimes are interpreted as UTC and explicitly marked assumed.
 * Conversation dates never populate message timestamps.
 */
export function normalizeTimestamp(value, field = 'unknown') {
  const mongoDate=obj(value)&&'$date'in value;
  if (mongoDate) value = obj(value.$date) ? value.$date.$numberLong : value.$date;
  if (value == null || value === '' || typeof value === 'boolean') return { timestamp: null, datePrecision: 'unknown', timeProvenance: 'unavailable', timeZoneAssumption: null };
  let timestamp, datePrecision, assumption = null;
  if (typeof value === 'bigint' || typeof value === 'number' || typeof value === 'string' && /^[+-]?\d+(?:\.\d+)?$/.test(value.trim())) {
    const n = Number(value);
    const explicitMs = mongoDate || /(?:_ms|timestamp_ms|millisecond|\$numberLong|\/createdAt$)/i.test(field);
    const seconds = !explicitMs && Math.abs(n) < 10_000_000_000;
    timestamp = seconds ? n * 1000 : n;
    datePrecision = seconds && Number.isInteger(n) ? 'second' : 'millisecond';
  } else if (typeof value === 'string') {
    const text = value.trim();
    if (!/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(text)) return { timestamp: null, datePrecision: 'unknown', timeProvenance: field, timeZoneAssumption: null, invalidTimestamp: true };
    const day = new Date(text.slice(0, 10) + 'T00:00:00Z');
    if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== text.slice(0, 10)) return { timestamp: null, datePrecision: 'unknown', timeProvenance: field, timeZoneAssumption: null, invalidTimestamp: true };
    const clock=/[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(text);if(clock&&(Number(clock[1])>23||Number(clock[2])>59||Number(clock[3]??0)>59))return { timestamp:null,datePrecision:'unknown',timeProvenance:field,timeZoneAssumption:null,invalidTimestamp:true };
    const fractionalDigits=/\.(\d+)/.exec(text)?.[1].length??0;
    datePrecision = text.length === 10 ? 'day' : fractionalDigits>6?'nanosecond':fractionalDigits>3?'microsecond':fractionalDigits?'millisecond' : /:\d{2}:\d{2}/.test(text) ? 'second' : 'minute';
    const offset = text.length > 10 && /(?:Z|[+-]\d{2}:?\d{2})$/.test(text);
    assumption = text.length > 10 && !offset ? 'UTC assumed: source supplied no offset' : text.length === 10 ? 'calendar date; no time of day' : null;
    timestamp = Date.parse(text.length === 10 ? text + 'T00:00:00Z' : offset ? text : text.replace(' ', 'T') + 'Z');
  }
  if (!Number.isFinite(timestamp) || timestamp < -62135596800000 || timestamp > 253402300799999) return { timestamp: null, datePrecision: 'unknown', timeProvenance: field, timeZoneAssumption: null, invalidTimestamp: true };
  return { timestamp: Math.trunc(timestamp), datePrecision, timeProvenance: field, timeZoneAssumption: assumption, timestampOriginal:typeof value==='bigint'?str(value):value, ...(datePrecision==='day'?{dateValue:typeof value==='string'?value.trim().slice(0,10):new Date(timestamp).toISOString().slice(0,10)}:{}) };
}
function timeOf(value, base, diagnostics, names = ['createdAtUnixTimestamp','created_at_unix_timestamp','timestamp_ms','create_time','created_at','createdAt','timestamp','time','date','create_time_iso']) {
  for (const name of names) {
    if (value?.[name] == null || value[name] === '') continue;
    const result = normalizeTimestamp(value[name], `${base}/${name}`);
    if (result.invalidTimestamp) diagnostics.push({ code: 'invalid-date', path: `${base}/${name}`, severity: 'warning', message: 'Invalid recorded date retained as undated.' });
    if (result.timestamp !== null) return result;
  }
  return normalizeTimestamp(null);
}
function modelOf(message, conversation, base) {
  for (const [item, prefix, fields] of [[message, base, ['modelName','model','model_slug','modelId','model_id']], [message?.metadata, `${base}/metadata`, ['model_slug','model']], [message?.senderInfo, `${base}/senderInfo`, ['senderName']]]) {
    for (const key of fields) if (typeof item?.[key] === 'string' && item[key].trim()) return { model: item[key], modelProvenance: `${prefix}/${key}` };
  }
  for (const [item, prefix, fields] of [[conversation, '/conversation', ['default_model_slug','model','modelId']], [conversation?.runSettings,'/conversation/runSettings',['model']], [conversation?.lastUsedModel,'/conversation/lastUsedModel',['identifier']]]) {
    for (const key of fields) if (typeof item?.[key] === 'string' && item[key].trim()) return { model: item[key], modelProvenance: `${prefix}/${key}`, modelInherited: true };
  }
  return { model: 'unknown', modelProvenance: 'unavailable' };
}
function recordedUsage(message, path) {
  const entry = [[message?.usage,`${path}/usage`],[message?.token_usage,`${path}/token_usage`],[message?.generationInfo?.usage,`${path}/generationInfo/usage`],[message?.stats?.usage,`${path}/stats/usage`]].find(([v])=>obj(v));
  const value = entry?.[0];
  if (!obj(value)) return undefined;
  const fields = Object.fromEntries(Object.entries(value).filter(([key,v]) => /^(?:prompt_tokens|completion_tokens|total_tokens|input_tokens|output_tokens|cached_tokens|cache_read_input_tokens|cache_creation_input_tokens|reasoning_tokens)$/.test(key) && Number.isFinite(v) && v >= 0));
  const details = value.completion_tokens_details ?? value.output_tokens_details;
  if (Number.isFinite(details?.reasoning_tokens) && details.reasoning_tokens >= 0) fields.reasoning_tokens = details.reasoning_tokens;
  if (Number.isFinite(value.prompt_tokens_details?.cached_tokens) && value.prompt_tokens_details.cached_tokens >= 0) fields.cached_tokens = value.prompt_tokens_details.cached_tokens;
  const names={prompt_tokens:'inputTokens',input_tokens:'inputTokens',completion_tokens:'outputTokens',output_tokens:'outputTokens',total_tokens:'totalTokens',cached_tokens:'cachedTokens',cache_read_input_tokens:'cachedTokens',cache_creation_input_tokens:'cacheCreationTokens',reasoning_tokens:'reasoningTokens'};
  const normalized=Object.fromEntries(Object.entries(fields).map(([key,value])=>[names[key],value]));
  // A familiar field name or caller-supplied verified flag is not a schema audit.
  // Preserve the old surviving fields, but new engines must inspect semantics.
  return Object.keys(fields).length ? { ...normalized, originalFields:fields, unit: 'tokens', scope: 'request', verified:false, semantics:'unverified-consumer-export', scopeVerified:false, availabilityReason:'Token counters are recorded; request semantics are not established by this export alone.', reliability: 'recorded', provenance: entry[1], requestId:nativeId(message?.request_id??message?.requestId??message?.completionId), tokenizer:typeof message?.tokenizer==='string'?message.tokenizer:null, fields:Object.entries(fields).map(([name,value])=>({name:names[name],originalName:name,value,unit:'tokens',scope:'unverified',verified:false,provenance:`${entry[1]}/${name}`})) } : undefined;
}
function attachments(value, path) {
  const items = arr(value?.attachments ?? value?.metadata?.attachments ?? value?.files);
  const root=Array.isArray(value?.attachments)?'attachments':Array.isArray(value?.metadata?.attachments)?'metadata/attachments':'files';
  return items.map((a,index) => ({ id: nativeId(a?.id ?? a?.file_id ?? a?.asset_pointer), name: str(a?.name ?? a?.filename), type: str(a?.mime_type ?? a?.mimeType ?? a?.content_type ?? a?.type) || 'unknown', sizeBytes: Number.isFinite(a?.size_bytes ?? a?.size) && (a?.size_bytes ?? a?.size) >= 0 ? a?.size_bytes ?? a?.size : null, width: Number.isFinite(a?.width) ? a.width : null, height: Number.isFinite(a?.height) ? a.height : null, sourcePath: `${path}/${root}/${index}`, available: 'metadata only', fileTokenSize: Number.isFinite(a?.file_token_size)&&a.file_token_size>=0?a.file_token_size:null, hash:typeof a?.sha256==='string'&&/^[a-f\d]{64}$/i.test(a.sha256)?{algorithm:'sha256',value:a.sha256}:null, pages:Number.isSafeInteger(a?.pages??a?.page_count)&&(a.pages??a.page_count)>=0?a.pages??a.page_count:null, duration: Number.isFinite(a?.duration_ms)&&a.duration_ms>=0?{value:a.duration_ms,unit:'milliseconds',scope:'media',provenance:`${path}/${root}/${index}/duration_ms`}:null }));
}
function references(value, path) {
  const items = arr(value?.references ?? value?.sources ?? value?.citations ?? value?.metadata?.content_references);
  return items.map((a,index) => typeof a === 'string' ? { url: a, channel:'structured-reference', sourcePath: `${path}/references/${index}` } : { url: str(a?.url ?? a?.href ?? a?.source_url), title: str(a?.title ?? a?.name), type: str(a?.type ?? a?.reference_type), id: nativeId(a?.id), citationId:nativeId(a?.citation_id??a?.ref_id), sourceSpan:Number.isSafeInteger(a?.start_idx)&&Number.isSafeInteger(a?.end_idx)&&a.start_idx>=0&&a.end_idx>=a.start_idx?{start:a.start_idx,end:a.end_idx,unit:'source supplied index; encoding unverified'}:null, channel:'structured-reference', sourcePath: `${path}/references/${index}` });
}
function plain(value, depth = 0) {
  if (depth > 48 || value == null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(v => plain(v, depth + 1)).filter(Boolean).join('\n\n');
  if (obj(value)) {
    for (const key of ['text','thinking','thinking_trace','transcript','content','message','output']) if (typeof value[key] === 'string') return value[key];
    for (const key of ['parts','content','summary']) if (Array.isArray(value[key])) return plain(value[key], depth + 1);
  }
  return '';
}
function inert(value) { try { return JSON.stringify(value, (_, v) => typeof v === 'bigint' ? String(v) : v); } catch { return '[Unsupported source structure]'; } }
function permittedSettings(value, path) {
  if(!obj(value))return undefined;
  const fields=Object.fromEntries(['temperature','topP','top_p','topK','top_k','maxTokens','max_tokens','maxOutputTokens','seed','frequencyPenalty','frequency_penalty','presencePenalty','presence_penalty','stop','model','modelId','model_id'].filter(k=>typeof value[k]==='string'||typeof value[k]==='number'||typeof value[k]==='boolean'||Array.isArray(value[k])&&value[k].every(v=>typeof v==='string')).map(k=>[k,value[k]]));
  return Object.keys(fields).length?{fields,provenance:path,semantics:'recorded generation parameters; no universal equivalence assumed'}:undefined;
}
function backupMetadata(value){
  if(!obj(value))return undefined;
  const manifest=Object.fromEntries(['backupVersion','encrypted','chunkCount','databaseVersion','createdAt'].filter(key=>['string','number','boolean'].includes(typeof value.manifest?.[key])).map(key=>[key,value.manifest[key]]));
  const members=arr(value.mediaMembers).length?value.mediaMembers:arr(value.mediaArchivePaths).map(name=>({name}));
  return {kind:'venice-v4-dexie',manifest,mediaMembers:members.slice(0,100000).filter(item=>typeof item?.name==='string'&&item.name.length<=32768&&!/(?:^|\/)(?:settings|preferences|bookmarks|reading(?:-v2)?|activity|vectors|cookies|credentials|accounts?|profiles?|sessions?|logs?|crash|cache)(?:[.\/]|$)/i.test(item.name)).map(item=>({name:item.name,sizeBytes:Number.isSafeInteger(item.sizeBytes)&&item.sizeBytes>=0?item.sizeBytes:null,compressedSizeBytes:Number.isSafeInteger(item.compressedSizeBytes)&&item.compressedSizeBytes>=0?item.compressedSizeBytes:null,kind:'archive member; no conversation association established',bytesOpened:false})),mediaBytesEmbedded:false,association:'container inventory; not conversation attachment observations'};
}
function recapDuration(label) {
  const matched=/^\s*thought for\s+(.+?)\s*[.!]?\s*$/i.exec(label);if(!matched)return null;
  const token=/(\d+(?:\.\d+)?)\s*(milliseconds?|minutes?|seconds?|hours?|secs?|mins?|ms|s|m|h)/gi;
  const values=[...matched[1].matchAll(token)];if(!values.length||matched[1].replace(token,'').trim())return null;
  let milliseconds=0;for(const v of values){const unit=v[2].toLowerCase(),factor=/^(milliseconds?|ms)$/.test(unit)?1:/^(minutes?|mins?|m)$/.test(unit)?60000:/^(hours?|h)$/.test(unit)?3600000:1000;milliseconds+=Number(v[1])*factor;}
  return Number.isFinite(milliseconds)?milliseconds:null;
}
function validateTree(value, limits = {}) {
  const stack = [[value,0]], visited = new Set(); let count = 0;
  while (stack.length) {
    const [item,depth] = stack.pop(); if (!obj(item) && !Array.isArray(item)) continue;
    if (visited.has(item)) throw new Error('Input contains a cycle or aliased non-JSON object.'); visited.add(item);
    if (++count > (limits.nodes ?? 4_000_000) || depth > (limits.depth ?? 256)) throw new Error('Input exceeds analytical JSON complexity limits.');
    for (const child of Object.values(item)) if (child && typeof child === 'object') stack.push([child,depth+1]);
  }
}
function makeConversation(raw, provider, format, context, originalId, account = '') {
  const id = nativeId(originalId ?? raw.id ?? raw.uuid ?? raw.conversation_id ?? raw.conversationId ?? raw.conversationKey ?? raw.key);
  const contentHash = hash(raw), sourceId = context.sourceId;
  const scoped = hash([sourceId,provider,account,id ?? contentHash]).slice(0,32);
  const c = { id: `${provider}:${scoped}`, sourceId, originalId: id, accountScope: account ? hash(account).slice(0,24) : 'unspecified', title: str(raw.title ?? raw.name ?? raw.metadata?.title ?? context.title) || 'Untitled conversation', provider, format, adapterVersion: ADAPTER_VERSION, schemaVersion: ANALYTICAL_SCHEMA_VERSION, collectionIds: [...new Set(arr(context.collectionIds).length ? context.collectionIds : [context.collectionId])], records: [], branches: { selectedPathKnown: false, selectedNodes: [], alternativeNodes: [], branchPoints: 0, cycles: 0, missingParents: 0 }, versions: [], diagnostics: [], coverage: context.coverage ?? 'original', rawHash: contentHash, sourceFile: context.sourceFile ?? '', rawPath: context.rawPath ?? '', identityProvenance: id ? 'recorded identifier scoped by source/platform/account' : 'source content SHA-256; no recorded conversation identifier' };
  const created = timeOf(raw, c.rawPath, c.diagnostics), updated = timeOf(raw,c.rawPath,c.diagnostics,['updatedAtUnixTimestamp','updated_at_unix_timestamp','update_time','updated_at','updatedAt']);
  c.createdAt = created.timestamp; c.createdDate = created; c.updatedAt = updated.timestamp; c.updatedDate = updated;
  c.sourceLocation={file:c.sourceFile,jsonPointer:c.rawPath};
  const settings=permittedSettings(raw.runSettings,'/conversation/runSettings')??permittedSettings(raw.perChatPredictionConfig,'/conversation/perChatPredictionConfig');if(settings)c.generationSettings=settings;
  return c;
}
function record(c, message, category, text, rawPath, extra = {}) {
  const sourceObjectId = nativeId(extra.originalObjectId ?? message?.id ?? message?.uuid ?? message?._id ?? extra.sourceIndex);
  const objectId = extra.objectId ?? `${c.id}:object:${hash(sourceObjectId ?? rawPath).slice(0,24)}`;
  const messagePath = extra.messagePath ?? /^(.*?\/(?:message|messages\/\d+(?:\/versions\/\d+)?|turns\/\d+|responses\/\d+\/response|chunks\/\d+|imagenTurns\/\d+))(?:\/|$)/.exec(rawPath)?.[1] ?? rawPath.replace(/\/[^/]+$/, '');
  const r = { id: `${c.id}:segment:${hash([objectId,rawPath,category]).slice(0,24)}`, segmentId: `${c.id}:segment:${hash([objectId,rawPath,category]).slice(0,24)}`, objectId, originalObjectId: sourceObjectId, logicalId: extra.logicalId === null ? null : extra.logicalId ?? objectId, category, text: typeof text === 'string' ? text : '', model: 'unknown', modelProvenance: 'unavailable', timestamp: null, datePrecision: 'unknown', timeProvenance: 'unavailable', timeZoneAssumption: null, sourceRole: str(message?.author?.role ?? message?.role ?? message?.sender), selected: true, observed: category !== 'redacted', rawPath, coverage: c.coverage, reliability: c.coverage === 'normalized' ? 'derived' : 'recorded', ...timeOf(message,messagePath,c.diagnostics), ...modelOf(message,c._raw,messagePath), ...extra };
  r.sourceLocation={file:c.sourceFile,jsonPointer:`${c.rawPath}${rawPath}`};
  r.originalOrder=extra.originalOrder??extra.sourceIndex??c.records.length;
  r.segmentOrder=c.records.length;
  if(category==='thinking'&&!r.reasoningRepresentation){r.reasoningRepresentation='trace';r.originalTraceAvailable=r.observed!==false;}
  const status=Object.fromEntries(['status','finish_reason','stop_reason','streamingStatus'].filter(k=>typeof message?.[k]==='string').map(k=>[k,message[k]]));if(Object.keys(status).length)r.finishMetadata={fields:status,provenance:messagePath};
  const settings=permittedSettings(message?.textSettings,`${messagePath}/textSettings`)??permittedSettings(message?.generationConfig,`${messagePath}/generationConfig`);if(settings&&!c.records.some(v=>v.objectId===objectId&&v.generationSettings))r.generationSettings=settings;
  if(typeof message?.modelName==='string')r.originalModelLabel=message.modelName;
  if(typeof message?.modelId==='string')r.originalModelId=message.modelId;
  if(typeof message?.modelDeveloper==='string'||typeof message?.model_developer==='string')r.modelDeveloper=message.modelDeveloper??message.model_developer;
  const foundAttachments = attachments(message,rawPath), foundRefs = references(message,rawPath);
  if (foundAttachments.length && !r.attachments) r.attachments = foundAttachments;
  if (foundRefs.length && !r.references) r.references = foundRefs;
  const usage = recordedUsage(message,rawPath); if (usage && !r.usage && !c.records.some(v => v.objectId === objectId && v.usage)) r.usage = usage;
  if(!c.records.some(v=>v.objectId===objectId&&v.timingMetadata)){
    const timingMetadata=Object.fromEntries(['executionTime','totalInferenceTime','timeToFirstToken','generationTime'].filter(k=>typeof message?.[k]==='number'||typeof message?.[k]==='string').map(k=>[k,{value:message[k],provenance:`${messagePath}/${k}`,unit:'not supplied/verified',scope:'uninterpreted exported timing'}]));
    if(Object.keys(timingMetadata).length)r.timingMetadata=timingMetadata;
  }
  if (Number.isFinite(message?.duration_ms) && message.duration_ms >= 0 && !c.records.some(v => v.objectId === objectId && v.duration)) { r.durationMs=message.duration_ms;r.duration = { value: message.duration_ms, unit: 'milliseconds', scope: 'execution', provenance: `${messagePath}/duration_ms`, reliability: 'recorded' }; }
  c.records.push(r); return r;
}
function contentSegments(c, message, value, category, path, extra = {}) {
  if (typeof value === 'string') { record(c,message,category,value,path,extra); return; }
  if (Array.isArray(value)) { if (!value.length) record(c,message,'other','',path,{...extra,emptyObject:true}); else value.forEach((v,i) => contentSegments(c,message,v,category,`${path}/${i}`,extra)); return; }
  if (!obj(value)) { record(c,message,'other','',path,{...extra,emptyObject:true}); return; }
  const type = str(value.type ?? value.content_type).toLowerCase();
  if(type==='tool_call' && obj(value.toolCall)) {
    const call=value.toolCall,callId=nativeId(call.id),event={id:`${c.id}:event:${hash([extra.objectId,path,'call']).slice(0,24)}`,type:'tool_call',name:str(call.name),callId,status:str(call.status)};
    record(c,message,'tool_call',plain(call.input)||inert(call.input),`${path}/toolCall/input`,{...extra,event,sourceContentType:type});
    if(call.output!=null)record(c,message,'tool_output',plain(call.output)||inert(call.output),`${path}/toolCall/output`,{...extra,event:{...event,id:`${event.id}:output`,type:'tool_output'},sourceContentType:type});
    return;
  }
  if (/redacted/.test(type)) { record(c,message,'redacted','',path,{...extra,observed:false,redaction:true,sourceContentType:type}); return; }
  if (/tool_result|function_call_output|functionoutput|serverfunctioncalloutput/.test(type)) {
    const callId = nativeId(value.tool_use_id ?? value.call_id ?? value.callId); record(c,message,'tool_output',plain(value.content ?? value.output ?? value),path,{...extra,event:{id:`${c.id}:event:${hash([extra.objectId,path]).slice(0,24)}`,type:'tool_output',name:str(value.name),callId,status:str(value.status)},sourceContentType:type}); return;
  }
  if (/tool_use|function_call|serverfunctioncall/.test(type)) {
    const callId = nativeId(value.id ?? value.call_id ?? value.callId); record(c,message,'tool_call',plain(value.arguments ?? value.input) || inert(value.arguments ?? value.input),path,{...extra,event:{id:`${c.id}:event:${hash([extra.objectId,path]).slice(0,24)}`,type:'tool_call',name:str(value.name),callId,status:str(value.status)},sourceContentType:type}); return;
  }
  const classified = /reasoning_recap|recap/.test(type) ? 'recap' : /thinking|reasoning|thoughts/.test(type) ? 'thinking' : /commentary/.test(type) ? 'commentary' : category;
  if(classified==='recap' && !Number.isFinite(message?.duration_ms)){
    const label=plain(value),duration=recapDuration(label);
    if(duration!==null)extra={...extra,durationMs:duration,duration:{value:duration,unit:'milliseconds',originalLabel:label,scope:'recap',provenance:path,reliability:'derived from recorded numerical recap'}};
  }
  if (/image|audio|video|file|asset/.test(type) && !/text|transcript/.test(type)) {
    record(c,message,'other','',path,{...extra,sourceContentType:type,attachments:[{id:nativeId(value.asset_pointer ?? value.image_url?.url ?? value.file_id ?? value.id),type:type || 'unknown',sizeBytes:Number.isFinite(value.size_bytes)&&value.size_bytes>=0 ? value.size_bytes : null,width:Number.isFinite(value.width)?value.width:null,height:Number.isFinite(value.height)?value.height:null,available:'metadata only',sourcePath:path}]}); return;
  }
  if (Array.isArray(value.parts)) { value.parts.forEach((part,i) => contentSegments(c,message,part,classified,`${path}/parts/${i}`,{...extra,sourceContentType:type})); if (!value.parts.length) record(c,message,'other','',path,{...extra,emptyObject:true}); return; }
  if (Array.isArray(value.content)) { contentSegments(c,message,value.content,classified,`${path}/content`,extra); return; }
  if (Array.isArray(value.contentBlocks)) { contentSegments(c,message,value.contentBlocks,classified,`${path}/contentBlocks`,extra); return; }
  if (Array.isArray(value.thoughts)) {
    value.thoughts.forEach((v,i) => {
      const trace=plain(v),summary=str(v?.summary),text=trace||summary;
      record(c,message,'thinking',text,`${path}/thoughts/${i}`,{...extra,sourceContentType:type,observed:!!text,reasoningRepresentation:trace?'trace':summary?'summary-only':'unavailable',originalTraceAvailable:!!trace,...(!trace?{reasoningUnavailable:true}:{}),metadata:{summary,finished:typeof v?.finished==='boolean'?v.finished:null,chunkCount:arr(v?.chunks).length}});
    });
    if(!value.thoughts.length)record(c,message,'other','',path,{...extra,sourceContentType:type,emptyObject:true,observed:false,reasoningUnavailable:true});
    return;
  }
  const text = plain(value);
  if (text || ['text','output_text','input_text','thinking','reasoning','reasoning_recap','code','execution_output'].includes(type)) record(c,message,classified==='thinking'&&!text?'other':classified,text,path,{...extra,sourceContentType:type,...(classified==='thinking'&&!text?{observed:false,reasoningUnavailable:true}:{})});
  else { const retained=typeof value.payload==='string'?value.payload:'',available=typeof value.payload==='string';record(c,message,'other',retained,path,{...extra,sourceContentType:type || 'unknown',unsupportedStructure:true,observed:available,unsupportedMetadata:{type:type||'unknown',id:nativeId(value.id),status:typeof value.status==='string'?value.status:null,representation:'typed unknown content; arbitrary metadata discarded'}}); c.diagnostics.push({code:'unsupported-content',path,severity:'warning',message:'Unrecognized content retains only permitted typed evidence; text is unavailable unless explicitly supplied.'}); }
}
function finalize(c) {
  c.ordering??={kind:'retained-source-array',verified:c.coverage!=='normalized',provenance:'original source array order; does not establish prompt/reply pairing'};
  const objectRecords=new Map();for(const r of c.records)if(r.originalObjectId!=null&&!objectRecords.has(r.originalObjectId))objectRecords.set(r.originalObjectId,r.objectId);
  for(const r of c.records)if(r.relationship?.verified&&r.relationship.parentOriginalId!=null)r.relationship.parentObjectId=objectRecords.get(str(r.relationship.parentOriginalId))??null;
  c.capabilities = { originalRecords: c.coverage !== 'normalized', normalizedOnly: c.coverage === 'normalized', messageTimestamps: c.records.some(r=>r.timestamp!==null), conversationDates: c.createdAt !== null || c.updatedAt !== null, models:c.records.some(r=>r.model!=='unknown'), thinking:c.records.some(r=>r.category==='thinking' && r.observed), redactedThinking:c.records.some(r=>r.category==='redacted'), branches:c.format==='chatgpt-mapping' || c.branches.alternativeNodes.length>0, versions:c.versions.length>0, tools:c.records.some(r=>['tool_call','tool_output'].includes(r.category)), searchEvents:c.records.some(r=>r.event?.type==='search'), usage:c.records.some(r=>r.usage), attachments:c.records.some(r=>r.attachments?.length), references:c.records.some(r=>r.references?.length) };
  c.capabilityCoverage = { datedSegments:c.records.filter(r=>r.timestamp!==null).length, modelledSegments:c.records.filter(r=>r.model!=='unknown').length, observedTextSegments:c.records.filter(r=>r.observed && r.text).length, segments:c.records.length, objects:new Set(c.records.map(r=>r.objectId)).size };
  c.limitations = [];
  if (c.coverage === 'normalized') c.limitations.push('Only surviving normalized records are available; original branches, content-block boundaries and original timestamp provenance may be unavailable.');
  if (!c.capabilities.messageTimestamps) c.limitations.push('No original message timestamps; conversation dates are kept separately.');
  if (!c.capabilities.models) c.limitations.push('Exact model identifiers are unavailable.');
  if (!c.capabilities.usage) c.limitations.push('No interpretable recorded request-token usage.');
  if (c.format.startsWith('gemini-activity')) c.limitations.push('Activity entries are source events; missing responses and full conversation history are not reconstructed.');
  if (c.format.startsWith('meta')) c.limitations.push('Transcript speaker boundaries are derived from unindented speaker labels outside code fences; transcript dates do not date individual messages.');
  delete c._raw; return c;
}

function chatgpt(raw,ctx) {
  const c=makeConversation(raw,'openai','chatgpt-mapping',ctx); c._raw=raw;
  const nodes=new Map(Object.entries(raw.mapping).filter(([,n])=>obj(n))), children=new Map();
  for (const [id,n] of nodes) {
    if (typeof n.parent==='string') { if (!children.has(n.parent)) children.set(n.parent,[]); children.get(n.parent).push(id); if (!nodes.has(n.parent)) { c.branches.missingParents++; c.diagnostics.push({code:'missing-parent',path:`/mapping/${pointer(id)}/parent`,severity:'warning',message:'Retained parent node is missing.'}); } }
  }
  c.branches.branchPoints=[...children.values()].filter(v=>v.length>1).length;
  let current=typeof raw.current_node==='string' && nodes.has(raw.current_node) ? raw.current_node : null;
  if (!current) {
    const leaves=[...nodes].filter(([id])=>!children.has(id)); const candidates=leaves.length?leaves:[...nodes];
    current=candidates.sort((a,b)=>(normalizeTimestamp(b[1].message?.create_time).timestamp??-Infinity)-(normalizeTimestamp(a[1].message?.create_time).timestamp??-Infinity))[0]?.[0] ?? null;
    c.diagnostics.push({code:'selected-path-fallback',severity:'warning',message:'No valid current_node; latest dated retained leaf selected as an explicit fallback.'});
  } else c.branches.selectedPathKnown=true;
  const active=new Set(); while(current && nodes.has(current)) { if(active.has(current)) { c.branches.cycles++; c.diagnostics.push({code:'branch-cycle',path:'/mapping',severity:'warning',message:'Cycle in selected parent chain.'}); break; } active.add(current); current=nodes.get(current).parent; }
  // Check every retained chain too, since an alternative may contain a cycle.
  const cycleNodes=new Set(); for(const [id] of nodes) { const seen=new Set();let at=id;while(at && nodes.has(at)){if(seen.has(at)){cycleNodes.add(at);break;}seen.add(at);at=nodes.get(at).parent;} } c.branches.cycles=Math.max(c.branches.cycles,cycleNodes.size);
  c.branches.selectedNodes=[...active].reverse(); c.branches.alternativeNodes=[...nodes.keys()].filter(id=>!active.has(id));
  c.branches.selectedDepth=c.branches.cycles?null:active.size;
  if(!c.branches.cycles){let maxDepth=0;for(const [id] of nodes){let depth=0,at=id;while(at&&nodes.has(at)){depth++;at=nodes.get(at).parent;}maxDepth=Math.max(maxDepth,depth);}c.branches.maxDepth=maxDepth;}else c.branches.maxDepth=null;
  c.branches.depthUnit='retained mapping nodes along parent chain, including non-message root';
  c.ordering={kind:'recorded-parent-graph',verified:true,provenance:'/mapping/*/parent; source-selected leaf /current_node when valid'};
  c.topology={kind:'chatgpt-mapping',complete:c.branches.cycles===0&&c.branches.missingParents===0,scope:'all retained mapping nodes, including non-message nodes',sourceSelectedLeaf:c.branches.selectedPathKnown?raw.current_node:null,selectedLeaf:c.branches.selectedNodes.at(-1)??null,nodes:[...nodes].map(([id,n])=>({id,parentId:typeof n.parent==='string'?n.parent:null,childIds:children.get(id)??[],messageObjectId:obj(n.message)?`${c.id}:object:${hash(nativeId(n.message.id)??id).slice(0,24)}`:null,originalObjectId:obj(n.message)?nativeId(n.message.id)??id:null,selected:active.has(id),sourceSelected:c.branches.selectedPathKnown?active.has(id):null,provenance:`/mapping/${pointer(id)}`}))};
  const seenMessages=new Map();
  for(const [id,n] of nodes) {
    const m=n.message;if(!obj(m))continue;
    const originalObjectId=nativeId(m.id) ?? id; const existing=seenMessages.get(originalObjectId);
    if(existing){ existing.forEach(r=>{r.nodeAliases=[...(r.nodeAliases??[r.nodeId]),id];r.selected ||= active.has(id);});c.diagnostics.push({code:'duplicate-message-object',path:`/mapping/${pointer(id)}`,severity:'info',message:'Repeated mapping representation of the same original message identity counted once.'});continue;}
    const before=c.records.length, sourceRole=str(m.author?.role??m.role), channel=str(m.channel??m.metadata?.channel), objectId=`${c.id}:object:${hash(originalObjectId).slice(0,24)}`;
    const parentNode=typeof n.parent==='string'?nodes.get(n.parent):null;
    const extra={originalObjectId,objectId,nodeId:id,parentId:typeof n.parent==='string'?n.parent:null,selected:active.has(id),sourceRole,channel,originalOrder:active.has(id)?c.branches.selectedNodes.indexOf(id):[...nodes.keys()].indexOf(id),relationship:{kind:'recorded-parent',verified:true,parentOriginalId:obj(parentNode?.message)?nativeId(parentNode.message.id)??n.parent:null,parentNodeId:typeof n.parent==='string'?n.parent:null,provenance:`/mapping/${pointer(id)}/parent`},toolIndicators:arr(m.metadata?.tool_icons).filter(value=>typeof value==='string'),attachments:attachments(m,`/mapping/${pointer(id)}/message`),references:references(m,`/mapping/${pointer(id)}/message`)};
    let category=role(sourceRole);if(category==='response' && /^(analysis|reasoning|thinking)$/.test(channel))category='thinking';if(category==='response' && channel==='commentary')category='commentary';
    if(sourceRole==='assistant' && m.recipient && m.recipient!=='all') {category='tool_call';extra.event={id:`${c.id}:call:${hash(originalObjectId).slice(0,24)}`,type:'tool_call',name:str(m.recipient),callId:nativeId(m.metadata?.tool_call_id??m.id),status:str(m.status)};}
    if(sourceRole==='tool'){extra.event={id:`${c.id}:output:${hash(originalObjectId).slice(0,24)}`,type:'tool_output',name:str(m.author?.name),callId:nativeId(m.metadata?.tool_call_id),status:str(m.status)};}
    contentSegments(c,m,m.content,category,`/mapping/${pointer(id)}/message/content`,extra);
    const reasoning=m.reasoning??m.metadata?.reasoning;if(reasoning && category!=='user')contentSegments(c,m,reasoning,'thinking',`/mapping/${pointer(id)}/message/reasoning`,extra);
    for(const [i,call] of arr(m.tool_calls??m.metadata?.tool_calls).entries())contentSegments(c,m,{...call,type:'function_call',name:call.function?.name??call.name,arguments:call.function?.arguments??call.arguments},'tool_call',`/mapping/${pointer(id)}/message/tool_calls/${i}`,extra);
    seenMessages.set(originalObjectId,c.records.slice(before));
  }
  return finalize(c);
}

function claude(raw,ctx,provider='anthropic') {
  const c=makeConversation(raw,provider,provider==='meta'?'meta-converted-transcript':raw.project?'claude-project':'claude-chat-messages',ctx);c._raw=raw;
  if(provider==='meta'&&!obj(raw.meta_ai_source)){
    // Envelope-only provenance was previously dispatched through Claude. IDs are
    // opaque anchors: correct the provider dimension while preserving those IDs.
    c.id=`anthropic:${hash([ctx.sourceId,'anthropic','',c.originalId??c.rawHash]).slice(0,32)}`;
    c.identityAudit=[{kind:'preserved-legacy-conversation-anchor',conversationId:c.id,scope:'conversation and descendant object/logical/segment IDs',priorProvider:'anthropic',provider:'meta',provenance:'explicit meta-ai-to-threadshelf envelope',reason:'Provider correction preserves the established opaque identity namespace; the prefix is not provider evidence.'}];
  }
  if(provider==='meta' && typeof raw.meta_ai_source?.original_transcript==='string')c.rawHash=hash(raw.meta_ai_source.original_transcript);
  arr(raw.chat_messages??raw.messages).forEach((m,i)=>{
    if(!obj(m)){c.diagnostics.push({code:'invalid-message',path:`/chat_messages/${i}`,severity:'warning',message:'Non-object message retained in diagnostics.'});return;}
    const path=`/${raw.chat_messages?'chat_messages':'messages'}/${i}`, category=role(m.sender??m.role), extra={sourceIndex:i,sourceRole:str(m.sender??m.role)};
    const parent=m.parent_message_id??m.parentMessageId??m.parent_uuid;if(parent!=null){extra.parentId=parent;extra.relationship={kind:'recorded-parent',verified:true,parentOriginalId:str(parent),provenance:`${path}/parent_message_id`};}
    // Explicit converted Meta model='Meta AI' is a platform display placeholder.
    if(provider==='meta' && m.model==='Meta AI'){extra.model='unknown';extra.modelProvenance='unavailable: source platform placeholder';}
    const content=Array.isArray(m.content)?m.content:arr(m.content?.contentBlocks).length?m.content.contentBlocks:m.content?.content??m.text??m.content;
    contentSegments(c,m,content,category,`${path}/content`,extra);
    if(Array.isArray(m.content?.contentBlocks) && typeof m.content.content==='string' && !m.content.contentBlocks.some(b=>b?.type==='text' && typeof b.text==='string' && b.text))record(c,m,category,m.content.content,`${path}/content/content`,extra);
    if(m.thinking && category!=='user')contentSegments(c,m,m.thinking,'thinking',`${path}/thinking`,extra);
  });return finalize(c);
}

function metaNative(raw,ctx) {
  const conversations=[],occurrences=new Map();
  for(const transcript of findTranscripts(raw)){
    // Reader's Meta converter hashes Python-compatible ensure_ascii JSON of
    // [account, original transcript]. Preserve that identity across conversion.
    const ascii = v => JSON.stringify(v).replace(/[\u007f-\uffff]/g,ch=>'\\u'+ch.charCodeAt(0).toString(16).padStart(4,'0'));
    const account=raw.fbid==null?'null':typeof raw.fbid==='bigint'?str(raw.fbid):ascii(raw.fbid);
    const identity=hash(`[${account}, ${ascii(transcript.original)}]`),occurrence=(occurrences.get(identity)??0)+1;occurrences.set(identity,occurrence);
    const date=conversationDate(transcript.label),messages=splitTranscript(transcript.original);
    const originalId=`meta-ai:${identity}:${occurrence}`;
    const c=makeConversation({id:originalId,title:raw.localTitleGenerator?.metaTitles?.[originalId]??`Meta AI — ${transcript.label}`,...(date.created_at?{created_at:date.created_at}:{})},'meta','meta-transcript',ctx,originalId);c._raw={};c.rawHash=hash(transcript.original);c.identityProvenance='derived source account and original transcript hash, occurrence retained';
    if(date.created_at){c.createdDate={...normalizeTimestamp(date.created_at,`${transcript.pointer}/label`),datePrecision:date.precision==='day'?'day':date.precision==='seconds'?'second':'millisecond',source:'transcript label'};c.createdAt=c.createdDate.timestamp;}
    messages.messages.forEach((m,i)=>record(c,m,role(m.sender),m.text,`${transcript.pointer}/value/speaker/${i}`,{sourceIndex:i,logicalId:`${c.id}:speaker:${i}`,logicalProvenance:'derived unindented You:/Meta AI: labels outside Markdown fences',model:'unknown',modelProvenance:'unavailable',reliability:'derived',sourceRole:m.sender}));
    if(messages.preamble)record(c,{},'other',messages.preamble,`${transcript.pointer}/value/preamble`,{logicalId:null,sourceIndex:'preamble',model:'unknown',modelProvenance:'unavailable'});
    if(!messages.messages.length)c.diagnostics.push({code:'transcript-boundaries-unavailable',severity:'warning',message:'No supported transcript speaker boundaries; preserved preamble as source-native text.'});
    c.transcriptLabel=transcript.label;conversations.push(finalize(c));
  }return conversations;
}

function studio(raw,ctx) {
  const provider=ctx.provider==='gemini' || raw.provider==='gemini'?'gemini':'google-ai-studio';
  const c=makeConversation(raw,provider,provider==='gemini'?'gemini-activity-html':raw.imagenPrompt?'ai-studio-imagen':'ai-studio-chunks',ctx);c._raw=raw;
  let group=-1,last=null;
  arr(raw.chunkedPrompt?.chunks??raw.chunks).forEach((chunk,i)=>{
    const r=role(chunk.role), originalObjectId=nativeId(chunk.id)??`chunk-${i}`;
    const eventIndex=Number.isInteger(chunk.source_index)?Math.floor(chunk.source_index/2):null;
    if(r!==last){group++;last=r;}
    const logicalId=provider==='gemini'&&eventIndex!==null?`${c.id}:activity:${eventIndex}:${r}`:`${c.id}:role-group:${group}`;
    const extra={originalObjectId,logicalId,sourceIndex:i,sourceRole:str(chunk.role),logicalProvenance:provider==='gemini'?'recorded activity card association':'derived contiguous source-role chunk group',...(provider==='gemini'?{activityId:`${c.id}:activity:${eventIndex??i}`}:{})};
    const category=chunk.isThought===true?'thinking':r;
    contentSegments(c,chunk,chunk.text??chunk.parts??(chunk.driveImage?{type:'image',...chunk.driveImage}:null),category,`/chunkedPrompt/chunks/${i}`,extra);
  });
  arr(raw.imagenPrompt?.imagenTurns).forEach((turn,i)=>{
    record(c,turn,'user',str(turn.prompt),`/imagenPrompt/imagenTurns/${i}/prompt`,{sourceIndex:`${i}-prompt`,logicalId:`${c.id}:imagen:${i}:prompt`});
    arr(turn.generatedImages).forEach((image,j)=>contentSegments(c,turn,{type:'image',...image},'other',`/imagenPrompt/imagenTurns/${i}/generatedImages/${j}`,{sourceIndex:`${i}-images`,logicalId:`${c.id}:imagen:${i}:response`,generatedMedia:true}));
  });return finalize(c);
}

function lmstudio(raw,ctx) {
  const c=makeConversation(raw,'lm-studio','lm-studio-versions',ctx);c._raw=raw;
  arr(raw.messages).forEach((m,i)=>{
    const versions=arr(m.versions), selected=Number.isInteger(m.currentlySelected)&&versions[m.currentlySelected]?m.currentlySelected:0;
    if(m.currentlySelected!==selected)c.diagnostics.push({code:'selected-version-fallback',path:`/messages/${i}/currentlySelected`,severity:'warning',message:'Invalid selected version; version zero explicitly selected as fallback.'});
    versions.forEach((v,j)=>{
      const path=`/messages/${i}/versions/${j}`,extra={sourceIndex:`${i}:version:${j}`,objectId:`${c.id}:object:${hash([i,j,nativeId(v.id)]).slice(0,24)}`,logicalId:`${c.id}:message:${i}`,versionId:`${i}:${j}`,selected:j===selected,sourceRole:str(v.role)};
      extra.originalOrder=i;extra.versionIndex=j;
      const versionDate=timeOf(v,path,c.diagnostics),outerDate=timeOf(m,`/messages/${i}`,c.diagnostics);
      if(versionDate.timestamp===null&&outerDate.timestamp!==null)Object.assign(extra,outerDate,{timeInheritedFrom:'original outer message'});
      c.versions.push({messageIndex:i,versionIndex:j,id:extra.versionId,selected:j===selected,model:modelOf(v,raw,path).model});
      if(!Array.isArray(v.steps))contentSegments(c,v,v.content,role(v.role),`${path}/content`,extra);
      else v.steps.forEach((step,k)=>{
        const stepPath=`${path}/steps/${k}`;
        if(step.type==='contentBlock')contentSegments(c,{...v,...step},step.content,step.style?.type==='thinking'?'thinking':role(v.role),`${stepPath}/content`,{...extra,stepIndex:k,recordedStepType:step.type});
        else if(/tool|function/i.test(step.type??''))contentSegments(c,v,{...step,type:/output|result/i.test(step.type)?'tool_result':'tool_use'},'other',stepPath,extra);
        else record(c,v,'other',plain(step.content),stepPath,{...extra,stepIndex:k,recordedStepType:step.type,event:{id:`${c.id}:event:${hash([i,j,k]).slice(0,24)}`,type:'status',name:str(step.type),status:str(step.status)},executionMetadata:obj(step.stats)?Object.fromEntries(['tokensPerSecond','numTokens','numPromptTokens','numGeneratedTokens','timeToFirstTokenSec','totalTimeSec'].filter(key=>Number.isFinite(step.stats[key])).map(key=>[key,{value:step.stats[key],provenance:`${stepPath}/stats/${key}`,semanticsVerified:false}])):undefined});
      });
    });
  });c.branches.alternativeNodes=c.versions.filter(v=>!v.selected).map(v=>v.id);c.ordering={kind:'retained-message-array-with-recorded-versions',verified:true,provenance:'/messages; /messages/*/versions; no inferred prompt/reply parents'};return finalize(c);
}

function generic(raw,ctx,provider,format,coverage='original') {
  const c=makeConversation(raw,provider,format,{...ctx,coverage});c._raw=raw;
  arr(raw.messages??raw.turns).forEach((m,i)=>{
    if(!obj(m)){c.diagnostics.push({code:'invalid-message',path:`/messages/${i}`,severity:'warning',message:'Non-object message cannot be interpreted.'});return;}
    const path=`/${raw.messages?'messages':'turns'}/${i}`,extra={sourceIndex:i,parentId:m.parentMessageId??null,sourceRole:str(m.role??m.sender)};
    const priorNormalized=format==='openrouter-turns'&&raw.platform!=='openrouter';
    if(priorNormalized){extra.objectId=`${c.id}:object:${hash(m.source_message_id??m.source_node_id??m.turn_index??i).slice(0,24)}`;extra.originalObjectId=nativeId(m.source_message_id);extra.logicalId=m.source_message_id!=null?extra.objectId:null;}
    const parent=m.parentMessageId??m.parent_message_id;if(parent!=null)extra.relationship={kind:'recorded-parent',verified:true,parentOriginalId:str(parent),provenance:`${path}/parentMessageId`};
    if(format==='openrouter-turns'&&['user','ai','assistant'].some(k=>typeof m[k]==='string')){
      const turnId=`${c.id}:turn:${nativeId(m.id)??i}`;
      const sourceObjectId=nativeId(m.id??m.uuid??m._id??i),objectId=extra.objectId??`${c.id}:object:${hash(sourceObjectId).slice(0,24)}`,legacyEmpty=!priorNormalized&&m.content==null&&m.text==null&&m.message==null;
      const primaryKey=typeof m.ai==='string'?'ai':typeof m.assistant==='string'?'assistant':'user';
      const priorThought=m.reasoningContent??m.thinkingContent??m.reasoning_content??m.thinking??m.reasoning;
      if(priorThought&&priorThought!==m.thinking)contentSegments(c,m,priorThought,'thinking',`${path}/reasoning`,{...extra,turnId,logicalId:priorNormalized?extra.logicalId:objectId,relationship:{kind:'recorded-named-turn',verified:true,turnId,provenance:path}});
      for(const [key,cat]of [['user','user'],['thinking','thinking'],['ai','response'],['assistant','response']])if(typeof m[key]==='string'){
        const legacyId=`${c.id}:segment:${hash([objectId,`${path}/content`,'other']).slice(0,24)}`;
        const legacyThinking=legacyEmpty&&key==='thinking'&&!!m.thinking&&!m.reasoningContent&&!m.thinkingContent&&!m.reasoning_content&&!m.reasoning;
        const thinkingId=`${c.id}:segment:${hash([objectId,`${path}/reasoning`,'thinking']).slice(0,24)}`;
        const preserved=key===primaryKey&&legacyEmpty?{id:legacyId,segmentId:legacyId,logicalId:objectId}:legacyThinking?{id:thinkingId,segmentId:thinkingId,logicalId:objectId}:priorNormalized?{logicalId:extra.logicalId}:{};
        const r=record(c,m,cat,m[key],`${path}/${key}`,{...extra,sourceRole:key,turnId,logicalId:`${turnId}:${cat}`,...preserved,relationship:{kind:'recorded-named-turn',verified:true,turnId,provenance:path}});
        if(key===primaryKey&&legacyEmpty){c.identityAudit??=[];c.identityAudit.push({kind:'preserved-legacy-container-anchor',segmentId:r.id,objectId:r.objectId,logicalId:r.logicalId,priorSourcePath:`${path}/content`,sourcePath:`${path}/${key}`,priorCategory:'other',category:cat,reason:'1.0 adapter retained this named turn as an empty container; 2.0 retains its existing identity on the primary reply field (or prompt when no reply is recorded). Additional roles have separate logical identities.'});}
        if(legacyThinking){c.identityAudit??=[];c.identityAudit.push({kind:'preserved-legacy-thinking-anchor',segmentId:r.id,objectId:r.objectId,logicalId:r.logicalId,priorSourcePath:`${path}/reasoning`,sourcePath:`${path}/thinking`,reason:'The retained source thought and its legacy reply logical boundary preserve their established IDs.'});}
      }
      return;
    }
    const category=role(m.role??m.sender);const thinking=m.reasoningContent??m.thinkingContent??m.reasoning_content??m.thinking??m.reasoning;
    if(category==='tool_output')extra.event={id:`${c.id}:event:${hash([i,'output']).slice(0,24)}`,type:'tool_output',name:str(m.name),callId:nativeId(m.tool_call_id??m.call_id),status:str(m.status)};
    if(thinking && category!=='user')contentSegments(c,m,thinking,'thinking',priorNormalized&&thinking===m.thinking?`${path}/thinking`:`${path}/reasoning`,extra);
    contentSegments(c,m,m.content??m.text??m.message,category,priorNormalized?path:`${path}/content`,extra);
    for(const [j,call]of arr(m.tool_calls).entries())contentSegments(c,m,{...call,type:'tool_use',name:call.function?.name??call.name,input:call.function?.arguments??call.arguments},'tool_call',`${path}/tool_calls/${j}`,extra);
    if(obj(m.function_call))contentSegments(c,m,{...m.function_call,type:'tool_use',id:m.function_call.id??m.tool_call_id,input:m.function_call.arguments},'tool_call',`${path}/function_call`,extra);
  });return finalize(c);
}

function normalized(raw,ctx) {
  const p=platform(raw.provider??raw.platform??ctx.provider);const c=makeConversation(raw,p,'normalized-turns',{...ctx,coverage:'normalized'},raw.conversationKey??raw.key);c._raw=raw;
  arr(raw.turns).forEach((m,i)=>{
    if(!obj(m))return;const objectId=`${c.id}:object:${hash(m.source_message_id??m.source_node_id??m.turn_index??i).slice(0,24)}`,extra={objectId,originalObjectId:nativeId(m.source_message_id),logicalId:m.source_message_id!=null?objectId:null,sourceIndex:i,sourceRole:str(m.source_role??m.role),nodeId:m.source_node_id??null,coverage:'normalized',reliability:'derived',timeProvenance:'normalized surviving timestamp; original field unavailable'};
    let found=false;for(const [key,category]of [['user','user'],['thinking','thinking'],['ai','response'],['assistant','response'],['system','system'],['tool','tool_output']])if(typeof m[key]==='string'){found=true;record(c,m,role(m.source_role)==='system'?'system':role(m.source_role)==='tool_output'?'tool_output':category,m[key],`/turns/${i}/${key}`,extra);}
    if(!found)contentSegments(c,m,m.content??m.text,role(m.role),`/turns/${i}`,extra);
  });if(ctx.sourceTurnRoot)c.records.forEach(r=>{r.sourceLocation.jsonPointer=r.rawPath.replace(/^\/turns\//,'/');});return finalize(c);
}

function agentItem(c,m,item,path,extra) {
  const type=str(item.type), key=nativeId(item.id)??nativeId(item.call_id)??path, eventId=`${c.id}:event:${hash([extra.objectId,key]).slice(0,24)}`;
  const start=timeOf(item,path,c.diagnostics), end=timeOf(item,path,c.diagnostics,['completed_at','completedAt']);
  const originalCallId=nativeId(item.call_id??item.callId);
  const event={id:eventId,type:'status',name:str(item.name??item.tool),callId:originalCallId?`${extra.objectId}:call:${originalCallId}`:null,originalCallId,status:str(item.status??item.search_status)};
  event.originalOrder=Number.isSafeInteger(item.output_index)?item.output_index:extra.eventOrder??null;
  event.sourceItemId=nativeId(item.id);event.requestId=nativeId(item.response_id??item.request_id);event.taskId=event.requestId?`${extra.objectId}:task:${event.requestId}`:null;event.provenance=path;
  if(start.timestamp!==null||end.timestamp!==null)event.lifecycle={startedAt:start.timestamp,completedAt:end.timestamp,taskId:event.taskId,semanticsVerified:false,endpointMeaning:'source item creation/completion; execution start is not independently verified',startProvenance:start.timeProvenance,endProvenance:end.timeProvenance,startPrecision:start.datePrecision,endPrecision:end.datePrecision};
  if(start.timestamp!==null && end.timestamp!==null && end.timestamp>=start.timestamp)event.durationMs=end.timestamp-start.timestamp;
  else if(start.timestamp!==null&&end.timestamp!==null)c.diagnostics.push({code:'invalid-event-duration',path,severity:'warning',message:'Completion precedes start; no duration manufactured.'});
  const itemModel=modelOf(item,c._raw,path);
  const itemExtra={...extra,sourceItemId:nativeId(item.id),eventOrder:event.originalOrder,...(itemModel.model==='unknown'?modelOf(m,c._raw,path.replace(/\/output_items\/\d+$/, '')):itemModel),...(start.timestamp!==null?start:{}),event};
  if(Number.isFinite(event.durationMs))itemExtra.duration={id:`${eventId}:duration`,value:event.durationMs,unit:'milliseconds',scope:'source-item-lifecycle',semanticsVerified:!['day','unknown'].includes(start.datePrecision)&&!['day','unknown'].includes(end.datePrecision),datePrecision:[start.datePrecision,end.datePrecision],provenance:`${path}/created_at..completed_at`,reliability:'derived difference of recorded item endpoints'};
  if(/^(reasoning|thinking)$/.test(type)){const trace=plain(item.content??item.text),summary=plain(item.summary);contentSegments(c,m,item.content??item.summary??item.text,'thinking',`${path}/content`,{...itemExtra,event:undefined,reasoningRepresentation:trace?'trace':summary?'summary-only':'unavailable',originalTraceAvailable:!!trace,observed:!!(trace||summary)});}
  else if(/^(message|text|output_text)$/.test(type))contentSegments(c,m,item.content??item.text,role(m.role),`${path}/content`,{...itemExtra,event:undefined});
  else if(/webSearch|web_search/i.test(type)){event.type='search';event.name='web search';record(c,m,'other',str(item.query),path,{...itemExtra,references:references(item,path)});}
  else if(/FunctionCallOutput|function_call_output|tool_result/i.test(type)){event.type='tool_output';record(c,m,'tool_output',plain(item.output??item.content) || inert(item.output??item.content),path,itemExtra);}
  else if(/FunctionCall|function_call|tool_use/i.test(type)){event.type='tool_call';record(c,m,'tool_call',plain(item.arguments??item.input)||inert(item.arguments??item.input),path,itemExtra);}
  else {const text=plain(item.content??item.text);record(c,m,'other',text,path,{...itemExtra,observed:!!text||typeof item.content==='string'||typeof item.text==='string',unsupportedStructure:true,unsupportedMetadata:{type,id:nativeId(item.id),status:typeof item.status==='string'?item.status:null,representation:'typed unknown source item; arbitrary metadata discarded'}});c.diagnostics.push({code:'unknown-agent-item',path,severity:'warning',message:'Unknown agent item retains only permitted typed evidence; no arbitrary source metadata is mirrored.'});}
}
function venice(raw,ctx) {
  const account=ctx.account??raw._sourceOwner??'';const c=makeConversation(raw,'venice',ctx.format??'venice-console',ctx,raw.id,account);c._raw=raw;
  c.rawHash=stableHash({id:raw.id,account,messages:arr(raw.messages).map(m=>Object.fromEntries(Object.entries(m).filter(([k])=>k!=='turn_index')))});
  arr(raw.messages).forEach((m,i)=>{
    const path=`/messages/${i}`,originalObjectId=nativeId(m.id)??`message-${i}`,objectId=`${c.id}:object:${hash(originalObjectId).slice(0,24)}`,extra={originalObjectId,objectId,logicalId:objectId,parentId:m.parentMessageId??null,sourceRole:str(m.role),selected:!m.parentMessageId,sourceIndex:i};
    if(m.parentMessageId!=null)extra.relationship={kind:'recorded-parent',verified:true,parentOriginalId:str(m.parentMessageId),provenance:`${path}/parentMessageId`};
    if(m.parentMessageId)c.branches.alternativeNodes.push(originalObjectId);
    const items=arr(m.output_items??m.output),seen=new Set();let hasText=false,hasThinking=false;
    const accept=(item,itemPath)=>{const identity=nativeId(item.id)??`${str(item.type)}:${nativeId(item.call_id)??hash(item)}`;if(seen.has(identity)){c.diagnostics.push({code:'duplicate-agent-representation',path:itemPath,severity:'info',message:'Repeated display/output representation of an agent item counted once.'});return;}seen.add(identity);hasThinking ||= /reasoning|thinking/.test(str(item.type));hasText ||= /^(message|text|output_text)$/.test(str(item.type));agentItem(c,m,item,itemPath,extra);};
    items.forEach((item,j)=>{if(obj(item))accept(item,`${path}/output_items/${j}`);});
    arr(m.agentSegments).forEach((seg,j)=>{
      if(obj(seg.raw)){accept(seg.raw,`${path}/agentSegments/${j}/raw`);return;}
      const item={...seg,type:seg.type==='tool'?(seg.phase==='output'?'serverFunctionCallOutput':seg.tool==='webSearch'?'webSearch':'serverFunctionCall'):seg.type==='text'?'message':seg.type};
      if(!items.length)accept(item,`${path}/agentSegments/${j}`);else c.diagnostics.push({code:'ambiguous-agent-display',path:`${path}/agentSegments/${j}`,severity:'warning',message:'Display segment lacks original item identity; retained diagnostic avoids duplicating source events.'});
    });
    if(!hasThinking){const thought=m.reasoningContent??m.thinkingContent??m.reasoning_content??m.reasoning;if(thought)contentSegments(c,m,thought,'thinking',`${path}/reasoningContent`,extra);}
    if(!hasText)contentSegments(c,m,m.content,role(m.role),`${path}/content`,extra);
    const contextItems=[m,...items.filter(item=>obj(item.context_metadata))];
    for(const [contextIndex,contextItem]of contextItems.entries())if(contextItem.context_metadata){const metadata=contextItem.context_metadata,contextPath=contextIndex?`${path}/output_items/${items.indexOf(contextItem)}/context_metadata`:`${path}/context_metadata`,target=c.records.find(r=>r.objectId===objectId&&(contextIndex===0||r.sourceItemId===nativeId(contextItem.id)));if(target)target.contextOccupancy={id:`${objectId}:context:${hash(contextPath).slice(0,16)}`,totalTokens:Number.isFinite(metadata.total_tokens)?metadata.total_tokens:null,maxContextLength:Number.isFinite(metadata.max_context_length)?metadata.max_context_length:null,provenance:contextPath,scope:'context occupancy; not consumed or billable tokens',sourceItemId:nativeId(contextItem.id)};}
  });return finalize(c);
}
function grok(raw,ctx) {
  const meta=raw.conversation??raw, converted=ctx.provider==='venice'||meta.venice_metadata||raw.venice_metadata||arr(raw.responses).some(w=>w.response?.venice_metadata??w.venice_metadata);
  if(converted){const original=meta.venice_metadata??{},messages=[];const unmapped=arr(ctx.unmapped).filter(v=>str(v.venice_conversation_id)===str(original.id??meta.id)),indices=new Set(unmapped.map(v=>v.message_index));let at=0;
    for(const w of arr(raw.responses)){while(indices.has(at))at++;const m=w.response??w;messages.push({...m.venice_metadata,id:m.venice_metadata?.id??m._id,role:m.venice_metadata?.role??(m.sender==='human'?'user':'assistant'),content:m.venice_original_content??m.message,reasoningContent:m.venice_metadata?.reasoningContent??m.agent_thinking_traces,turn_index:at++});}
    unmapped.forEach(v=>messages.push({...v.message,turn_index:v.message_index}));messages.sort((a,b)=>a.turn_index-b.turn_index);
    const normalized=venice({...original,id:original.id??meta.id,messages},{...ctx,account:meta.venice_owner_id??ctx.account,format:'venice-grok-compatible'});normalized.title=str(meta.title)||normalized.title;return normalized;
  }
  const knownProvider=platform(meta.provider??meta.platform??ctx.provider);
  const c=makeConversation(meta,knownProvider==='unknown'?'unknown':knownProvider,'grok-account-responses',ctx);c._raw=meta;
  if(c.provider==='unknown')c.diagnostics.push({code:'unknown-original-platform',severity:'warning',message:'Grok-compatible structure is recognized, but original platform provenance is not supplied.'});
  arr(raw.responses).forEach((w,i)=>{const m=w.response??w,path=`/responses/${i}/response`,extra={sourceIndex:i,originalObjectId:nativeId(m._id??m.id),parentId:m.parent_response_id??null};
    arr(m.agent_thinking_traces).forEach((t,j)=>record(c,m,'thinking',plain(t),`${path}/agent_thinking_traces/${j}`,extra));
    contentSegments(c,m,m.message,role(m.sender),`${path}/message`,extra);
  });return finalize(c);
}
function activity(raw,ctx) {
  if(raw.format==='gemini-activity-html-event'){
    const c=makeConversation(raw,'gemini',raw.format,{...ctx,rawPath:raw.rawSourcePath??ctx.rawPath},raw.id);c._raw=raw;
    const kind=['prompt-only','feedback','canvas','unknown'].includes(raw.activityKind)?raw.activityKind:'unknown',category=kind==='prompt-only'?'user':'other';
    const metadata={kind,sourceCardIndex:raw.sourceCardIndex,dateOriginal:typeof raw.dateOriginal==='string'?raw.dateOriginal:null,dateCertainty:str(raw.dateCertainty),classificationProvenance:str(raw.classificationProvenance),conversationAssociation:'unavailable'};
    const extra={logicalId:null,activityId:`${c.id}:activity`,sourceIndex:raw.sourceCardIndex,sourceRole:'activity',activityMetadata:metadata,sourceTextTruncated:raw.contentTruncated===true,fullSourceTextCharacters:raw.fullTextCharacters,event:category==='other'?{id:`${c.id}:activity`,type:'status',name:`Gemini ${kind} activity`,status:'source-recorded'}:undefined};
    record(c,raw,category,str(raw.prompt??raw.content),'/content',extra);c.activitySourceUrl=typeof raw.sourceUrl==='string'?raw.sourceUrl:'';return finalize(c);
  }
  const url=str(raw.titleUrl??raw.url),id=/gemini\.google\.com\/app\/([A-Za-z0-9_-]+)/.exec(url)?.[1];
  const c=makeConversation(raw,'gemini','gemini-activity-json',ctx,id??hash(raw));c._raw=raw;
  const eventId=hash(raw),extra={sourceIndex:eventId,logicalId:null,activityId:`${c.id}:activity:${eventId}`,activityGranularity:'exported activity entry',sourceRole:'activity'};
  const title=str(raw.title),prompt=raw.prompt??title.replace(/^(?:Prompted|Submitted prompt:|Elküldött lekérdezés:)\s*/i,'');
  const isPrompt=raw.prompt!=null||/^(?:Prompted|Submitted prompt:|Elküldött lekérdezés:)\s*/i.test(title),isFeedback=/^(?:Gave feedback|Feedback|Visszajelzés|Értékelés)/i.test(title)||raw.activityType==='feedback',isCanvas=/\bGemini Canvas\b/i.test(title)||raw.activityType==='canvas';
  extra.activityMetadata={kind:isPrompt?raw.response!=null||raw.answer!=null?'query-response':'prompt-only':isFeedback?'feedback':isCanvas?'canvas':'unknown',classificationProvenance:raw.activityType?'/activity/activityType':'/activity/title',classificationCertainty:isPrompt||isFeedback||isCanvas?'recognized source label/field':'unknown activity label/shape',dateOriginal:typeof raw.time==='string'?raw.time:null,conversationAssociation:id?'explicit source activity URL':'unavailable'};
  if(isFeedback){const value=raw.feedback??raw.rating;if(['string','number','boolean'].includes(typeof value))extra.activityMetadata.feedback={value,provenance:raw.feedback!=null?'/activity/feedback':'/activity/rating',semantics:'source-recorded value; no sentiment or quality inference'};}
  if(isPrompt)record(c,raw,'user',str(prompt),'/activity/prompt',extra);
  else record(c,raw,'other',title,'/activity/title',{...extra,event:{id:extra.activityId,type:'status',name:'Gemini activity',status:'recorded'}});
  if(raw.response!=null||raw.answer!=null)record(c,raw,'response',str(raw.response??raw.answer),'/activity/response',extra);
  c.activitySourceUrl=url;return finalize(c);
}

export const ADAPTER_REGISTRY = Object.freeze([
  {id:'chatgpt',version:ADAPTER_VERSION,formats:['chatgpt-mapping'],recognize:v=>obj(v.mapping),normalize:chatgpt,description:'Mapping-node identities, parent-derived branches, selected paths, content segments and explicit tool recipients.'},
  {id:'venice',version:ADAPTER_VERSION,formats:['venice-console','venice-grok-compatible','venice-v4-dexie'],recognize:(v,c)=>((v.provider==='venice'||c?.provider==='venice')&&Array.isArray(v.messages))||v._sourceOwner!=null&&Array.isArray(v.messages),normalize:venice,description:'Message-scoped agent output reconciliation, calls/outputs/search events and original Venice provenance.'},
  {id:'grok',version:ADAPTER_VERSION,formats:['grok-account-responses'],recognize:v=>Array.isArray(v.responses),normalize:grok,description:'Account response wrappers and distinct exported reasoning traces; explicit converted provenance overrides compatible container.'},
  {id:'meta',version:ADAPTER_VERSION,formats:['meta-converted-transcript'],recognize:(v,c)=>(obj(v.meta_ai_source)||c?.provider==='meta')&&Array.isArray(v.chat_messages),normalize:(v,c)=>claude(v,c,'meta'),description:'Transcript-derived speaker boundaries, independent conversation dates and unknown exact model.'},
  {id:'claude',version:ADAPTER_VERSION,formats:['claude-chat-messages','claude-project'],recognize:v=>Array.isArray(v.chat_messages)||obj(v.project)&&Array.isArray(v.messages),normalize:claude,description:'Original messages/content blocks, thinking/redacted traces, tools, project snapshots.'},
  {id:'studio',version:ADAPTER_VERSION,formats:['ai-studio-chunks','ai-studio-imagen','gemini-activity-html'],recognize:(v,c)=>Array.isArray(v.chunkedPrompt?.chunks)||Array.isArray(v.imagenPrompt?.imagenTurns)||(v.provider==='gemini'||c?.provider==='gemini')&&Array.isArray(v.chunks),normalize:studio,description:'Contiguous-role prompt/response chunk relationships and explicit thought indicators.'},
  {id:'lm-studio',version:ADAPTER_VERSION,formats:['lm-studio-versions'],recognize:v=>Array.isArray(v.messages)&&(v.messages.some(m=>Array.isArray(m?.versions))||'perChatPredictionConfig'in v||'usePerChatPredictionConfig'in v),normalize:lmstudio,description:'All retained message versions, selected version and exported execution steps.'},
  {id:'openrouter',version:ADAPTER_VERSION,formats:['openrouter-turns'],recognize:(v,c)=>platform(v.platform??v.provider??c?.provider)==='openrouter'&&Array.isArray(v.turns),normalize:(v,c)=>generic(v,c,'openrouter','openrouter-turns'),description:'Platform independent of model/developer, supplied request usage and tools.'},
  {id:'gemini',version:ADAPTER_VERSION,formats:['gemini-activity-json','gemini-activity-html-event'],recognize:v=>v.format==='gemini-activity-html-event'||/gemini/i.test(str(v.header)+str(v.titleUrl)+str(v.products)),normalize:activity,description:'Source activity-event granularity, prompt-only entries and recorded dates.'},
  {id:'normalized',version:ADAPTER_VERSION,formats:['normalized-turns'],recognize:v=>Array.isArray(v.turns),normalize:normalized,description:'Surviving normalized fields with explicit reduction in original-data coverage.'},
  {id:'converted',version:ADAPTER_VERSION,formats:['converted-messages','static-html'],recognize:v=>Array.isArray(v.messages),normalize:(v,c)=>generic(v,c,platform(v.provider??v.platform??c.provider),v.format==='static-html'?'static-html':'converted-messages','partial'),description:'Explicit source roles and original provider labels, unsupported structures stay visible.'},
]);

/** Supports raw documents and retained Reader {raw,turns,...} wrappers.
 * Unsupported neighboring entries never exclude valid conversations.
 */
export function normalizeConversations(inputs, options = {}) {
  const ctx={sourceId:options.sourceId??'source',collectionId:options.collectionId??'direct',sourceFile:options.sourceFile??'',...options};
  const result=[],diagnostics=[];
  const dispatch=(value,context)=>{
    if(!obj(value)){diagnostics.push({code:'unsupported-record',path:context.rawPath??'',severity:'warning',message:'Non-conversation source record cannot be interpreted.'});return;}
    // Reader retained originals take precedence over display copies.
    if(obj(value.raw)) {
      const before=result.length;dispatch(value.raw,{...context,collectionIds:value.collectionIds??context.collectionIds,provider:value.provider??context.provider,title:value.title,originalId:value.conversationKey,rawPath:`${context.rawPath??''}/raw`});
      if(result.length===before && Array.isArray(value.turns)){result.push(normalized(value,context));diagnostics.push({code:'normalized-fallback',severity:'warning',message:'Retained original format unsupported; surviving normalized fields analyzed with reduced coverage.'});}return;
    }
    if(value.format==='venice-chat-history'||Array.isArray(value.owners)){
      if(value.formatVersion!=null&&Number(value.formatVersion)!==1){diagnostics.push({code:'unsupported-version',severity:'error',message:'Unsupported Venice console export version.'});return;}
      arr(value.owners).forEach((o,i)=>arr(o.conversations).forEach((c,j)=>{const normalized=venice(c,{...context,account:str(o.ownerId),format:value.veniceBackup?'venice-v4-dexie':'venice-console',rawPath:`${context.rawPath??''}/owners/${i}/conversations/${j}`});if(value.veniceBackup)normalized.containerMetadata=backupMetadata(value.veniceBackup);result.push(normalized);}));return;
    }
    if(Array.isArray(value.label_values)){result.push(...metaNative(value,context));return;}
    if(Array.isArray(value.conversations)){
      const nativeGrok=Array.isArray(value.media_posts)&&Array.isArray(value.tasks)&&Array.isArray(value.projects);
      value.conversations.forEach((c,i)=>dispatch(c,{...context,provider:value.venice_conversion?.format==='venice-to-threadshelf-grok'?'venice':value._meta_ai_archive?.format==='meta-ai-to-threadshelf'?'meta':value.provider??value.platform??(nativeGrok?'grok':context.provider),unmapped:value.venice_unmapped_messages,rawPath:`${context.rawPath??''}/conversations/${context.sourceRecordIndex??i}`,sourceRecordIndex:undefined}));return;
    }
    if(Array.isArray(value.activity??value.activities)){const key=Array.isArray(value.activity)?'activity':'activities';arr(value[key]).forEach((v,i)=>dispatch(v,{...context,rawPath:`${context.rawPath??''}/${key}/${i}`}));return;}
    if(value.provider==='gemini' && value.canvas===true){const c=makeConversation(value,'gemini','gemini-activity-canvas',context);c._raw=value;record(c,value,'other',str(value.content),'/canvas/content',{logicalId:null,event:{id:`${c.id}:canvas`,type:'status',name:'canvas activity',status:'recorded'}});result.push(finalize(c));return;}
    const adapter=ADAPTER_REGISTRY.find(a=>a.recognize(value,context));
    if(!adapter){diagnostics.push({code:'unsupported-format',path:context.rawPath??'',severity:'warning',message:'Unsupported or ambiguous conversation shape; valid neighboring records remain available.'});return;}
    try{result.push(adapter.normalize(value,context));}catch(e){diagnostics.push({code:'adapter-error',adapter:adapter.id,path:context.rawPath??'',severity:'error',message:e.message});}
  };
  validateTree(inputs,options.limits);
  if(Array.isArray(inputs) && inputs.length && inputs.every(v=>obj(v)&&['user','ai','thinking'].some(k=>typeof v[k]==='string')))dispatch({turns:inputs,provider:options.provider??'unknown'},{...ctx,sourceTurnRoot:true});
  else if(Array.isArray(inputs))inputs.forEach((v,i)=>dispatch(v,{...ctx,rawPath:`${ctx.rawPath??''}/${ctx.sourceRecordIndex??i}`,sourceRecordIndex:undefined}));else dispatch(inputs,ctx);
  const conversations=reconcileConversations(result,{diagnostics});
  for(const c of conversations)diagnostics.push(...c.diagnostics.map(d=>({...d,conversationId:c.id,provider:c.provider,format:c.format})));
  return {conversations,diagnostics,adapterVersion:ADAPTER_VERSION,schemaVersion:ANALYTICAL_SCHEMA_VERSION};
}

/** Reconcile separately streamed documents using the same identity rules. */
export function reconcileConversations(result,{diagnostics=[]}={}) {
  // Exact duplicate snapshots merge membership; conflicting recorded identities are visible.
  const unique=new Map();for(const c of result){const existing=unique.get(c.id);if(!existing){unique.set(c.id,c);continue;}
    if(existing.rawHash===c.rawHash){existing.collectionIds=[...new Set([...existing.collectionIds,...c.collectionIds])];existing.duplicateRepresentations=(existing.duplicateRepresentations??0)+1;diagnostics.push({code:'duplicate-conversation-representation',conversationId:c.id,severity:'info',message:'Identical source conversation representation counted once; memberships preserved.'});}
    else if(c.format==='gemini-activity-json'&&existing.format===c.format){const known=new Set(existing.records.map(r=>r.id));existing.records.push(...c.records.filter(r=>!known.has(r.id)));existing.rawHash=hash([existing.rawHash,c.rawHash]);finalize(existing);}
    else{const candidateId=c.id,newId=`${c.id}:export:${c.rawHash.slice(0,16)}`;c.id=newId;c.identityCandidate=candidateId;
      const rebase=v=>typeof v==='string'&&v.startsWith(candidateId+':')?newId+v.slice(candidateId.length):v;
      for(const r of c.records){for(const key of ['id','segmentId','objectId','logicalId','activityId'])r[key]=rebase(r[key]);if(r.event){r.event.id=rebase(r.event.id);r.event.callId=rebase(r.event.callId);}}
      unique.set(c.id,c);diagnostics.push({code:'ambiguous-conversation-identity',conversationId:c.id,severity:'warning',message:'Different source versions share a recorded identity; retained for review rather than silently merged.'});}
  }
  return [...unique.values()];
}
