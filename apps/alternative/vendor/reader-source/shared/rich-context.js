import {createGrokContextResolver} from './grok-renderer.js';
import {marked} from 'marked';
// Transient, message-scoped citation bindings. Never changes archived turns/raw.
// Bind only explicit saved identities; never infer references from array order.
const plain = value => value !== null && typeof value === 'object' &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const own = (value, key) => {
  if (!plain(value) || ['__proto__', 'prototype', 'constructor'].includes(key)) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
};
const bounded = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max;
const empty = Object.freeze({ references: Object.freeze(Object.create(null)) });
function safeUrl(value) {
  if (!bounded(value, 4096) || /[\u0000-\u0020\u007f]/.test(value)) return null;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? value : null;
  } catch { return null; }
}
function referencesFor(message) {
  const metadata = own(message, 'metadata');
  const records = own(metadata, 'content_references');
  if (!Array.isArray(records) || records.length > 1024) return empty;
  const references = Object.create(null), conflicts = new Set();
  let budget = 4096;
  function put(id, value) {
    if (--budget < 0) throw new RangeError('Citation metadata budget');
    if (!bounded(id, 256) || /[\s\u0000-\u001f]/.test(id) || ['__proto__','prototype','constructor'].includes(id) || conflicts.has(id)) return;
    const previous = references[id];
    if (previous && (previous.url !== value.url || previous.filename !== value.filename)) { delete references[id]; conflicts.add(id); return; }
    references[id] = Object.freeze(value);
  }
  function add(item, file = false) {
    const url = safeUrl(own(item, 'url'));
    const filenameValue = own(item, 'filename') ?? own(item, 'file_name');
    const filename = bounded(filenameValue, 2048) ? filenameValue : undefined;
    if (!url && !(file && filename)) return;
    const titleValue = own(item, 'title'), title = bounded(titleValue, 2048) ? titleValue : filename || url;
    const value = {url, title, ...(filename ? {filename} : {})};
    // Direct identities are accepted only when present in saved metadata.
    const direct = own(item, 'ref_id'); if (direct !== undefined) put(direct, value);
    const refs = own(item, 'refs');
    if (!Array.isArray(refs) || refs.length > 256) return;
    for (const ref of refs) {
      if (--budget < 0) throw new RangeError('Citation metadata budget');
      if (typeof ref === 'string') { put(ref, value); continue; }
      const turn = own(ref, 'turn_index'), index = own(ref, 'ref_index'), type = own(ref, 'ref_type');
      if (!Number.isSafeInteger(turn) || turn < 0 || !Number.isSafeInteger(index) || index < 0 || !['search', 'view', 'fetch', 'news', 'file', 'image'].includes(type)) continue;
      put(`turn${turn}${type}${index}`, value);
    }
  }
  try {
    for (const record of records) {
      const type = own(record, 'type');
      if (type === 'grouped_webpages' || type === 'grouped_files') {
        const items = own(record, 'items');
        if (!Array.isArray(items) || items.length > 256) continue;
        for (const item of items) { if (--budget < 0) return empty; add(item, type === 'grouped_files'); }
      } else if (['webpage', 'webpage_extended', 'file', 'file_citation'].includes(type)) add(record, type === 'file' || type === 'file_citation');
    }
  } catch { return empty; }
  return Object.keys(references).length ? Object.freeze({references: Object.freeze(references)}) : empty;
}
// Page links are presentation metadata, scoped to this original message. A
// saved link label is not asserted to be the Page's exact title or contents.
// Markdown's lexer keeps links in code fences/inline code out of this map.
function pageLinksFor(message, turn) {
  const pages = Object.create(null), conflicts = new Set();
  let count = 0;
  function add(urlValue, titleValue, titleSource) {
    if (++count > 1024) throw new RangeError('Page metadata budget');
    const url = safeUrl(urlValue);
    if (!url) return;
    const parsed = new URL(url);
    if (parsed.hostname !== 'chatgpt.com' || parsed.port) return;
    const match = /^\/(?:space|s)\/(page_[A-Za-z0-9_-]{1,128})\/?$/.exec(parsed.pathname);
    if (!match || conflicts.has(match[1])) return;
    const id = match[1], title = bounded(titleValue, 2048) ? titleValue : undefined;
    const previous = pages[id];
    if (previous && previous.url !== url) { delete pages[id]; conflicts.add(id); return; }
    if (previous?.titleSource === 'saved-metadata' || previous?.title && titleSource === 'saved-link') return;
    pages[id] = Object.freeze({url, ...(title ? {title, titleSource} : {})});
  }
  try {
    const metadata = own(message, 'metadata'), records = own(metadata, 'content_references');
    if (Array.isArray(records) && records.length <= 1024) for (const record of records) {
      const type = own(record, 'type');
      if (['link_title', 'webpage', 'webpage_extended'].includes(type)) add(own(record, 'url'), own(record, 'title'), 'saved-metadata');
      if (type === 'grouped_webpages') {
        const items = own(record, 'items');
        if (Array.isArray(items) && items.length <= 256) for (const item of items) add(own(item, 'url'), own(item, 'title'), 'saved-metadata');
      }
    }
    const parts = own(own(message, 'content'), 'parts');
    const sources = [];
    if (Array.isArray(parts) && parts.length <= 256) for (let i = 0; i < parts.length; i++) {
      const descriptor = Object.getOwnPropertyDescriptor(parts, String(i));
      if (descriptor && 'value' in descriptor && typeof descriptor.value === 'string') sources.push(descriptor.value);
    }
    // Server-only adapters can retain the complete text without the original
    // message object. Resolve only a link literally saved in that same turn.
    if (!sources.length) for (const key of ['ai', 'human']) {
      const source = own(turn, key); if (typeof source === 'string') sources.push(source);
    }
    let length = 0, tokens = 0;
    for (const source of sources) {
      length += source.length; if (length > 2 * 1024 * 1024) return Object.freeze(Object.create(null));
      if (!source.includes('page_')) continue;
      marked.walkTokens(marked.lexer(source, {gfm: true}), token => {
        if (++tokens > 20000) throw new RangeError('Page token budget');
        if (token.type === 'link') add(token.href, token.text, 'saved-link');
      });
    }
  } catch { return Object.freeze(Object.create(null)); }
  return Object.freeze(pages);
}
function mappingFor(thread) {
  const raw = own(thread, 'raw');
  const direct = own(raw, 'mapping');
  if (plain(direct)) return direct;
  // The read-only Enhanced adapter preserves its original under
  // raw.thread.raw. This is a fixed wrapper path, not a recursive object scan.
  const wrapped = own(own(own(raw, 'thread'), 'raw'), 'mapping');
  return plain(wrapped) ? wrapped : undefined;
}
function createChatGPTContextResolver(thread) {
  const mapping = mappingFor(thread);
  const withPages = (context, message, turn) => {
    const pages = pageLinksFor(message, turn);
    return Object.keys(pages).length ? Object.freeze({...context, pages}) : context;
  };
  if (!plain(mapping)) return turn => withPages(empty, undefined, turn);
  const ids = Object.keys(mapping);
  if (ids.length > 20000) return () => empty;
  const messages = new Map(), duplicates = new Set(), cache = new WeakMap();
  for (const id of ids) {
    const message = own(own(mapping, id), 'message'), messageId = own(message, 'id');
    if (!bounded(messageId, 256)) continue;
    if (messages.has(messageId)) duplicates.add(messageId);
    else messages.set(messageId, message);
  }
  return turn => {
    const messageId = own(turn, 'source_message_id'), nodeId = own(turn, 'source_node_id');
    if (!bounded(messageId, 256)) return withPages(empty, undefined, turn);
    let message;
    if (bounded(nodeId, 256)) {
      message = own(own(mapping, nodeId), 'message');
      if (own(message, 'id') !== messageId) return empty;
    } else {
      if (duplicates.has(messageId)) return empty;
      message = messages.get(messageId);
    }
    if (!plain(message)) return empty;
    if (!cache.has(message)) cache.set(message, withPages(referencesFor(message), message, turn));
    return cache.get(message);
  };
}

export function createRichContextResolver(thread) {
  const chatgpt=createChatGPTContextResolver(thread),grok=createGrokContextResolver(thread);
  return turn => {
    const context=chatgpt(turn),extra=grok(turn);
    return Object.keys(extra.grokCards || {}).length ? Object.freeze({...context,...extra}) : context;
  };
}
