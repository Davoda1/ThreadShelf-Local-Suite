import { createHash, randomBytes } from 'node:crypto';
import { marked } from 'marked';
import { normalizeServerUrl } from './state.mjs';
import { resourceUrl } from './resource-requests.mjs';

function identity(ref, defaultServer = '') {
  return ref.mode === 'server'
    ? JSON.stringify({ mode: 'server', serverUrl: normalizeServerUrl(ref.serverUrl || defaultServer), collection: ref.collection, sourceFile: ref.sourceFile, conversationKey: ref.conversationKey || '' })
    : JSON.stringify({ mode: 'local', id: ref.id });
}
function imageSources(thread) {
  const urls = new Set(), seen = new Set(), stack = [{ value: thread.turns, depth: 0, urlField: false }];
  const urlNames = /^(?:url|src|href|image|images|image_?urls?|thumbnail_?urls?|thumbnail)$/i;
  let nodes = 0, enqueued = 1, textBytes = 0, urlBytes = 0;
  const add = value => {
    try {
      const url = resourceUrl(value);
      if (!urls.has(url) && urls.size < 2048 && urlBytes + url.length <= 1024 * 1024) { urls.add(url); urlBytes += url.length; }
    } catch { /* Only supported remote sources are authorized. */ }
  };
  for (const name of ['contentReferences', 'content_references', 'metadata']) if (thread[name]) { stack.push({ value: thread[name], depth: 0, urlField: false }); enqueued++; }
  while (stack.length && nodes++ < 50000) {
    const { value, depth, urlField } = stack.pop();
    if (typeof value === 'string') {
      if (urlField && /^https?:\/\//i.test(value)) add(value);
      if (value.length <= 8 * 1024 * 1024 && value.includes('![') && textBytes + value.length <= 16 * 1024 * 1024) {
        textBytes += value.length;
        try { marked.walkTokens(marked.lexer(value), token => { if (token.type === 'image') add(token.href); }); } catch { /* Malformed source text remains ordinary text. */ }
      }
    } else if (value && typeof value === 'object' && !seen.has(value) && depth < 32) {
      seen.add(value);
      for (const key in value) {
        if (enqueued >= 50000) break;
        if (!Object.hasOwn(value, key)) continue;
        stack.push({ value: value[key], depth: depth + 1, urlField: urlNames.test(key) || (Array.isArray(value) && urlField) });
        enqueued++;
      }
    }
  }
  return urls;
}

// Opaque per-session capabilities keep ownership and image authorization in the
// service. Renderer callers cannot invent titles, owners, cache paths or URLs.
export class ResourceContexts {
  constructor(limit = 32) { this.limit = limit; this.byIdentity = new Map(); this.byToken = new Map(); }
  register(thread, ref, defaultServer = '') {
    const mode = ref.mode === 'server' ? 'server' : 'local';
    const trusted = mode === 'server' ? { ...ref, collection: thread.collection, sourceFile: thread.sourceFile, conversationKey: thread.conversationKey || '' } : { mode, id: thread.id };
    const key = identity(trusted, defaultServer);
    const prior = this.byIdentity.get(key);
    this.byIdentity.delete(key);
    const context = {
      token: prior?.token || randomBytes(32).toString('hex'), identity: key,
      conversation: { key: createHash('sha256').update(key).digest('hex'), title: String(thread.title || 'Untitled conversation').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 512), source: mode, sourceId: mode === 'server' ? normalizeServerUrl(ref.serverUrl || defaultServer) : String(thread.collection || '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 512) },
      sources: imageSources(thread),
    };
    this.byIdentity.set(key, context); this.byToken.set(context.token, context);
    while (this.byIdentity.size > this.limit) {
      const first = this.byIdentity.keys().next().value;
      this.byToken.delete(this.byIdentity.get(first).token); this.byIdentity.delete(first);
    }
  }
  token(ref) {
    const context = this.byIdentity.get(identity(ref));
    if (!context) throw new Error('Open the conversation before loading its resources.');
    this.byIdentity.delete(context.identity);this.byIdentity.set(context.identity,context);
    return { contextToken: context.token };
  }
  owner(token, url) {
    const context = this.byToken.get(token);
    if (!context || !context.sources.has(resourceUrl(url))) throw new Error('The image is not authorized for this conversation.');
    this.byIdentity.delete(context.identity);this.byIdentity.set(context.identity,context);
    return { ...context.conversation };
  }
  clear() { this.byIdentity.clear(); this.byToken.clear(); }
}
