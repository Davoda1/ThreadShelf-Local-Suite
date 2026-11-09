import { createHash, randomBytes } from 'node:crypto';
import { marked } from 'marked';
import { normalizeServerUrl } from './state.mjs';
import { resourceUrl } from './resource-requests.mjs';
import { prepareRichMarkdown, RICH_LIMITS } from '../reader/rich-parser.js';
import { createGrokContextResolver, grokImageUrls } from '../reader/grok-renderer.js';

const grokContainers = new Set(['cardAttachment', 'cardAttachmentsJson', 'card_attachments_json', 'cardAttachments']);
const ownValue = (value, key) => value && typeof value === 'object' ? Object.getOwnPropertyDescriptor(value, key)?.value : undefined;

// Resolve only presentation nodes from the displayed turn, using the same
// parser and exact message/card bindings as the renderer. Searching every URL
// in raw export metadata would authorize unused cards, citations and files.
function grokImageSources(thread, add, markdownImages) {
  const turns = ownValue(thread, 'turns');
  if (!Array.isArray(turns)) return;
  let resolve, textBytes = 0, nodes = 0, parses = 0;
  const started = Date.now();
  const pending = [];
  const admissible = () => nodes < 50000 && parses < 1024 && Date.now() - started < 1000;
  const parse = (source, context) => {
    if (typeof source !== 'string' || source.length > RICH_LIMITS.message || textBytes + source.length > 16 * 1024 * 1024 || !admissible()) return;
    textBytes += source.length; parses++;
    try { for (const node of prepareRichMarkdown(source).records.values()) pending.push({ node, context }); }
    catch { /* Unsupported or oversized presentation remains inert source. */ }
  };
  for (let index = 0; index < Math.min(turns.length, 20000) && admissible(); index++) {
    const turn = ownValue(turns, String(index));
    const source = ownValue(turn, 'user') ?? ownValue(turn, 'thinking') ?? ownValue(turn, 'ai') ?? ownValue(turn, 'content');
    if (typeof source !== 'string' || !/<(?:grok[:\s>-]|xaiArtifact\b|image-card\b)/.test(source)) continue;
    resolve ||= createGrokContextResolver(thread);
    parse(source, resolve(turn));
    while (pending.length && admissible()) {
      const { node, context } = pending.pop(); nodes++;
      if (node.kind === 'grok') {
        for (const url of grokImageUrls(node, context)) add(url);
        if (!node.incomplete && !node.malformed && node.family === 'artifact' && node.attrs.contentType === 'text/markdown') markdownImages(node.body);
      } else if (node.kind === 'component' && Array.isArray(node.children)) {
        // Match the renderer's structural dedent, keeping literal bindings and
        // child components as opaque separators instead of parsing their text.
        let source = '';
        for (const child of node.children) {
          if (child.kind === 'markdown') source += child.text;
          else { source += 'TSRESOURCECHILD'; if (child.kind === 'component') pending.push({ node: child, context }); }
        }
        const lines = source.replace(/^\n/, '').split('\n');
        const indents = lines.filter(line => line.trim()).map(line => line.match(/^ */)[0].length);
        const indent = indents.length ? indents.reduce((least, value) => Math.min(least, value), Infinity) : 0;
        parse(lines.map(line => line.slice(Math.min(indent, line.match(/^ */)[0].length))).join('\n'), context);
      }
    }
  }
}

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
  const markdownImages = value => {
    if (typeof value !== 'string' || value.length > 8 * 1024 * 1024 || !value.includes('![') || textBytes + value.length > 16 * 1024 * 1024) return;
    textBytes += value.length;
    try { marked.walkTokens(marked.lexer(value), token => { if (token.type === 'image') add(token.href); }); } catch { /* Malformed source text remains ordinary text. */ }
  };
  grokImageSources(thread, add, markdownImages);
  for (const name of ['contentReferences', 'content_references', 'metadata']) if (thread[name]) { stack.push({ value: thread[name], depth: 0, urlField: false }); enqueued++; }
  while (stack.length && nodes++ < 50000) {
    const { value, depth, urlField } = stack.pop();
    if (typeof value === 'string') {
      if (urlField && /^https?:\/\//i.test(value)) add(value);
      markdownImages(value);
    } else if (value && typeof value === 'object' && !seen.has(value) && depth < 32) {
      seen.add(value);
      for (const key in value) {
        if (enqueued >= 50000) break;
        if (!Object.hasOwn(value, key) || grokContainers.has(key)) continue;
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
