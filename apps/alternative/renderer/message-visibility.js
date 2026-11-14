/* View-only filtering adapted from ThreadShelf Local Reader.
 * Source content, source indexes, copying and export are never rewritten. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TSAVisibility = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const thoughtsKeys = new Set(['content_type', 'source_analysis_msg_id', 'thoughts']);
  const thoughtKeys = new Set(['chunks', 'content', 'finished', 'summary']);
  // Alternative calls its rendered thinking role "reasoning".
  const normalizedRole = role => role === 'ai' ? 'assistant' : ['reasoning', 'analysis'].includes(role) ? 'thinking' : role;

  function isHiddenThoughtsMessage(message) {
    if (message?.originalJsonOnly === false) return false;
    if (!['assistant', 'thinking'].includes(normalizedRole(message?.role))) return false;
    let content = message.content;
    const serialized = typeof content === 'string';
    if (serialized) {
      // Only recognize a complete, bounded export envelope. Code examples,
      // unknown structures and mixed prose remain available to the reader.
      if (content.length > 1024 * 1024 || !content.includes('"content_type"') || !content.includes('"source_analysis_msg_id"')) return false;
      const firstLine = content.match(/^[^\S\r\n]*\S[^\r\n]*/m)?.[0] || '';
      if (/^(?: {4}| {0,3}\t)/.test(firstLine)) return false;
      const text = content.trim();
      if (!text.startsWith('{') || !text.endsWith('}')) return false;
      try { content = JSON.parse(text); } catch { return false; }
    }
    if (!record(content) || content.content_type !== 'thoughts' || !Array.isArray(content.thoughts)) return false;
    if (Object.keys(content).some(key => !thoughtsKeys.has(key))) return false;
    if (serialized && (typeof content.source_analysis_msg_id !== 'string' || !content.source_analysis_msg_id.trim())) return false;
    if (content.source_analysis_msg_id !== undefined && typeof content.source_analysis_msg_id !== 'string') return false;
    return content.thoughts.every(thought => record(thought)
      && Object.keys(thought).every(key => thoughtKeys.has(key))
      && (thought.content == null || typeof thought.content === 'string' && !thought.content.trim())
      && (thought.chunks === undefined || Array.isArray(thought.chunks) && thought.chunks.length === 0)
      && (thought.summary == null || typeof thought.summary === 'string')
      && (thought.finished === undefined || typeof thought.finished === 'boolean'));
  }

// This classification uses original source only. Parsed JSON is discarded;
// source strings (including duplicate keys and large integers) are never replaced.
const aiRole = role => ['assistant', 'ai', 'thinking', 'reasoning', 'analysis'].includes(role);
function nonempty(value) { return value !== undefined && value !== null && value !== '' && (!Array.isArray(value) || value.length > 0); }
function hasOtherOutput(value) {
  if (!record(value)) return false;
  return ['attachments', 'attachment', 'images', 'image', 'audio', 'video', 'files', 'assets', 'tool_calls', 'outputs'].some(key => nonempty(value[key]));
}
function sourceText(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.every(part => typeof part === 'string') ? value.join('\n\n') : null;
  if (!record(value) || hasOtherOutput(value)) return null;
  if (Array.isArray(value.parts)) {
    if (value.content_type && value.content_type !== 'text') return null;
    if (Object.keys(value).some(key => !['parts', 'content_type'].includes(key))) return null;
    return sourceText(value.parts);
  }
  if ((value.type === 'text' || value.content_type === 'text') && typeof value.text === 'string'
    && Object.keys(value).every(key => ['type', 'content_type', 'text'].includes(key))) return value.text;
  return null;
}
function validJsonObjectSource(source) {
  if (typeof source !== 'string' || source.length > 1024 * 1024) return false;
  const firstLine = source.match(/^[^\S\r\n]*\S[^\r\n]*/m)?.[0] || '';
  if (/^(?: {4}| {0,3}\t)/.test(firstLine)) return false;
  const text = source.trim();
  if (!(text.startsWith('{') && text.endsWith('}') || text.startsWith('[') && text.endsWith(']'))) return false;
  try { const value = JSON.parse(text); return value !== null && typeof value === 'object'; } catch { return false; }
}
function originalJsonOnly(entry, displayedContent) {
  if (!record(entry) || hasOtherOutput(entry) || hasOtherOutput(entry.metadata)) return false;
  const sourceRole = entry.raw?.message?.author?.role ?? entry.raw?.author?.role ?? entry.source_role ?? entry.author?.role ?? entry.role;
  if (sourceRole && !aiRole(sourceRole)) return false;
  if (['user', 'thinking', 'ai'].filter(key => entry[key] !== undefined && entry[key] !== null).length > 1) return false;
  const raw = record(entry.raw?.message) ? entry.raw.message : record(entry.raw) && Object.hasOwn(entry.raw, 'content') ? entry.raw : entry;
  if (hasOtherOutput(raw) || hasOtherOutput(raw.metadata) || Object.hasOwn(raw, 'parts') && Object.hasOwn(raw, 'content')) return false;
  const content = raw === entry ? entry.content ?? entry.parts ?? entry.ai ?? entry.thinking ?? displayedContent : raw.content;
  const original = sourceText(content);
  if (original !== null) return validJsonObjectSource(original);
  // ChatGPT serializes a complete thoughts envelope as JSON. Only its known
  // data fields qualify; unknown structured output stays visible.
  if (record(content) && content.content_type === 'thoughts' && Array.isArray(content.thoughts)
    && Object.keys(content).every(key => thoughtsKeys.has(key))
    && content.thoughts.every(item => record(item) && Object.keys(item).every(key => thoughtKeys.has(key))
      && (item.content == null || typeof item.content === 'string')
      && (item.summary == null || typeof item.summary === 'string')
      && (item.finished === undefined || typeof item.finished === 'boolean')
      && (item.chunks === undefined || Array.isArray(item.chunks) && item.chunks.every(chunk => typeof chunk === 'string')))) {
    return validJsonObjectSource(displayedContent);
  }
  return false;
}
function intermediateJsonMessages(messages, enabled = false) {
  const hidden = new Set();
  if (!enabled) return hidden;
  // The adapter supplies selected-branch order. Never sort by timestamps or
  // inspect siblings. Tool/system turns do not terminate an AI response sequence.
  let laterAI = false;
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.role === 'user') { laterAI = false; continue; }
    if (!aiRole(message.role)) continue;
    if (laterAI && (typeof message.originalJsonOnly === 'boolean' ? message.originalJsonOnly : originalJsonOnly(message, message.content))) hidden.add(message);
    laterAI = true;
  }
  return hidden;
}
function visibleMessages(messages, enabled = false) {
  const hidden = intermediateJsonMessages(messages, enabled);
  return messages.filter(message => !isHiddenThoughtsMessage(message) && !hidden.has(message));
}

  function timestampMillis(value) {
    if(value===undefined||value===null||value==='')return null;
    let ms;if(typeof value==='number'||/^\d+(\.\d+)?$/.test(String(value))){const number=Number(value);ms=Math.trunc(number<100000000000?number*1000:number);}else ms=Date.parse(value);
    return Number.isFinite(ms)&&Math.abs(ms)<=8640000000000000?ms:null;
  }
  function summarizeMessages(messages, enabled = false) {
    if (!Array.isArray(messages)) throw new TypeError('Normalized messages are required.');
    const hidden = new Set(), visible = new Set();
    let count = 0, preview = "", lastTurnAt = "", lastTime = null;
    const ordinals = new Map(), positions = new Map();
    const intermediate = intermediateJsonMessages(messages, enabled);
    for (const [position,message] of messages.entries()) {
      const index = message.turnIndex ?? message.turn_index;
      const key = `${index}:${normalizedRole(message.role)}`;
      positions.set(`${message.sourceTurnPosition??position}:${normalizedRole(message.role)}`,index);
      if (isHiddenThoughtsMessage(message) || intermediate.has(message)) hidden.add(key);
      else { visible.add(key); count++; const time=timestampMillis(message.createdAt); if(time!==null&&(lastTime===null||time>lastTime)){lastTime=time;lastTurnAt=new Date(time).toISOString();} if (!ordinals.has(key)) ordinals.set(key,count); if (!preview) preview=String(message.content||"").replace(/\s+/g," ").trim().slice(0,250); }
    }
    return enabled ? {count,hidden,visible,ordinals,positions,preview,lastTurnAt} : {count,hidden,visible};
  }

  // Search display decisions are independent of the preference. One returned
  // result page can therefore be shown/hidden without querying the server again.
  function classifyMessages(messages) {
    return {baseline:summarizeMessages(messages,false),hidden:summarizeMessages(messages,true)};
  }
  function searchDecision(item, classification) {
    const unknown={emptyHidden:false,intermediateHidden:false,classified:false};
    if(!item||!classification)return unknown;
    const position=Object.hasOwn(item,'sourceTurnPosition')?item.sourceTurnPosition:undefined;
    let mapped=item;
    if(Object.hasOwn(item,'sourceTurnPosition')){
      if(!Number.isSafeInteger(position)||position<0)return unknown;
      const index=classification.hidden.positions.get(`${position}:${normalizedRole(item.role)}`);
      if(!Number.isSafeInteger(index))return unknown;
      mapped={...item,turnIndex:index};
    }else if(!Number.isSafeInteger(item.turnIndex??item.turn_index)||(item.turnIndex??item.turn_index)<0)return unknown;
    const index=mapped.turnIndex??mapped.turn_index,role=normalizedRole(mapped.role),key=`${index}:${role}`;
    const known=role?classification.hidden.visible.has(key)||classification.hidden.hidden.has(key):[...classification.hidden.visible,...classification.hidden.hidden].some(value=>value.startsWith(`${index}:`));
    if(!known)return unknown;
    const emptyHidden=isHiddenViewEntry(mapped,classification.baseline);
    return {emptyHidden,intermediateHidden:!emptyHidden&&isHiddenViewEntry(mapped,classification.hidden),classified:true,turnIndex:index};
  }
  // A returned server position is not a retained source index. Resolve it again
  // from the thread opened by the user, including before page classification
  // finishes. Unknown or hidden targets must never focus a different bubble.
  function searchTarget(item,classification,shown) {
    const decision=searchDecision(item,classification);
    if(!decision.classified)return null;
    const role=normalizedRole(item.role);
    const matches=shown.filter(message=>message.turnIndex===decision.turnIndex&&(!role||normalizedRole(message.role)===role));
    return matches.length===1?matches[0]:null;
  }
  // Normalize only the fields needed for visibility. Unlike full rendering,
  // this does not build rich contexts, image bindings or retained raw headers.
  function normalizeSearchTurns(turns) {
    if(!Array.isArray(turns))throw new TypeError('Conversation turns are required.');
    const text=value=>{if(value==null)return '';if(typeof value==='string')return value;if(typeof value==='number'||typeof value==='boolean')return String(value);if(Array.isArray(value))return value.map(text).filter(Boolean).join('\n\n');if(record(value)){if(value.text!==undefined)return text(value.text);if(value.parts!==undefined)return text(value.parts);if(value.content!==undefined)return text(value.content);if(value.type==='image'||value.content_type==='image_asset_pointer'||value.image_url||value.asset_pointer)return '[Image attachment — not included in the readable export]';if(/audio|video/.test(value.type||value.content_type||''))return '[Media attachment — not included in the readable export]';try{return JSON.stringify(value,null,2);}catch{return '[Unavailable content]';}}return '';};
    const messages=[];
    turns.forEach((entry,index)=>{
      if(!record(entry))entry={content:entry};
      const fields=['user','thinking','ai'].filter(key=>entry[key]!==undefined&&entry[key]!==null);
      const items=fields.length?fields.map(key=>({role:key==='user'?'user':key==='thinking'?'reasoning':['tool','system'].includes(entry.source_role)?entry.source_role:'assistant',content:entry[key]})):[{role:entry.role||entry.author?.role||entry.source_role||'assistant',content:entry.content??entry.text??''}];
      items.forEach((item,itemIndex)=>{
        let role=String(item.role).toLowerCase();
        if(['thinking','analysis','reasoning'].includes(role)||(role==='assistant'&&(entry.channel||entry.metadata?.channel)==='analysis'))role='reasoning';
        if(!['user','assistant','reasoning','tool','system'].includes(role))role='assistant';
        const content=text(item.content),assets=itemIndex===items.length-1&&Array.isArray(entry.assets)?entry.assets:[];
        if(!content.trim()&&!entry.model&&!assets.length)return;
        const turnIndex=Number.isSafeInteger(Number(entry.turnIndex??entry.turn_index))?Number(entry.turnIndex??entry.turn_index):index;
        messages.push({role,content,originalJsonOnly:originalJsonOnly(entry,content),turnIndex,sourceTurnPosition:index});
      });
    });
    return messages;
  }

  function isHiddenViewEntry(item, summary) {
    const role = normalizedRole(item?.role);
    if (role && !['assistant', 'thinking'].includes(role)) return false;
    const indexValue = item?.turnIndex ?? item?.turn_index;
    const index = indexValue === null || indexValue === '' ? NaN : Number(indexValue);
    if (summary && Number.isSafeInteger(index) && index >= 0) {
      if (role) {
        const key = `${index}:${role}`;
        if (summary.visible.has(key)) return false;
        if (summary.hidden.has(key)) return true;
      } else {
        const prefix = `${index}:`;
        if ([...summary.visible].some(key => key.startsWith(prefix))) return false;
        if ([...summary.hidden].some(key => key.startsWith(prefix))) return true;
      }
    }
    // Server search hits already contain their source text. Never use only a
    // substring marker to remove a result or assume it represents a full turn.
    return isHiddenThoughtsMessage({role: role || 'assistant', content: item?.text ?? item?.content ?? item?.excerpt ?? ''});
  }

  function visibleExcerpt(item, summary) {
    return isHiddenViewEntry(item, summary) ? '' : String(item?.excerpt ?? item?.text ?? item?.content ?? '');
  }

  return Object.freeze({timestampMillis, classifyMessages, searchDecision, searchTarget, normalizeSearchTurns, originalJsonOnly, intermediateJsonMessages, visibleMessages, isHiddenThoughtsMessage, summarizeMessages, isHiddenViewEntry, visibleExcerpt});
});
