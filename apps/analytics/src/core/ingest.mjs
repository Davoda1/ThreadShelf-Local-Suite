/** Independent read-only direct-export ingestion. Never opens a Reader profile,
 * runs exported JavaScript, extracts ZIP members, or writes to source paths. */
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Reader, ZipReader } from '@zip.js/zip.js';
import { normalizeConversations, reconcileConversations } from './adapters.mjs';
import { decodeJSONBytes } from './parsers/json-bytes.mjs';
import { parseJSON } from './parsers/common.mjs';
import { jsonEvents } from './parsers/stream-json.mjs';
import { parseDocument, prepareExport as prepareGemini, renderChildren, plain } from './parsers/gemini.mjs';
import { assembleVeniceBackup, isVeniceBackupManifest, isVeniceDexieChunk } from './parsers/venice-backup.mjs';

export const INGEST_LIMITS = Object.freeze({
  fileBytes: 512 * 1024 ** 2, htmlBytes: 512 * 1024 ** 2,
  streamBytes: 256 * 1024 ** 3, zipBytes: 1024 ** 4, expandedBytes: 256 * 1024 ** 3,
  recordBytes: 512 * 1024 ** 2, metadataBytes: 16 * 1024 ** 2,
  streamingThreshold: 8 * 1024 ** 2, entries: 100000, records: 2000000,
  depth: 64, jsonDepth: 256, nodes: 4000000, pathLength: 32768,
});
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const forbiddenNames = new Set(['settings.json', 'interface.json', 'appearance.json', 'layout.json', 'reading.json', 'reading-v2.json', 'reading-v2.json.bak', 'preferences', 'cookies', 'archive.sqlite', 'vectors.sqlite', 'current.json', 'previous.json', 'writer.json', 'writer-gate.json', 'cleanup-pending.json', 'initializing.json']);
const forbiddenDirectories = new Set(['local-storage-v2', 'activity-v1', 'search', 'local storage', 'session storage', 'indexeddb', 'cache', 'code cache', 'gpu cache']);
const abort = signal => { if (signal?.aborted) throw new DOMException('Import cancelled.', 'AbortError'); };
const tick = () => new Promise(resolve => setImmediate(resolve));
const identity = stat => `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
const sha256 = value => createHash('sha256').update(value).digest('hex');
const candidate = name => /\.(?:json|html?|zip)$/i.test(name) || !path.extname(name);
const emit = (options, data) => options.onProgress?.({ operation: 'ingest', ...data });
const profileNames = names => names.has('local-storage-v2') || names.has('archive.sqlite') || names.has('reading-v2.json') || names.has('activity-v1') || (names.has('current.json') && (names.has('objects') || names.has('snapshots') || names.has('records')));

function checkedLimits(overrides) {
  const limits = { ...INGEST_LIMITS, ...overrides };
  for (const [name, value] of Object.entries(limits)) if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Invalid ingest limit: ${name}.`);
  return limits;
}

function safeTree(root, limits) {
  const stack = [[root, 0]]; let nodes = 0;
  while (stack.length) {
    const [value, depth] = stack.pop();
    if (!value || typeof value !== 'object') continue;
    if (++nodes > limits.nodes || depth > limits.jsonDepth) throw new Error('Export JSON exceeds the complexity limit.');
    for (const child of Object.values(value)) if (child && typeof child === 'object') stack.push([child, depth + 1]);
  }
}

function ancestorPaths(filename) {
  const result = []; let current = path.dirname(filename);
  while (true) { result.push(current); const parent = path.dirname(current); if (parent === current) break; current = parent; }
  return result.reverse();
}

/** Metadata-only inventory detects Reader profiles before any content is read.
 * Every ancestor is checked so selecting a renamed export inside a profile is
 * also refused. Reparse points and symlink ancestors never become source roots. */
async function checkPath(filename, options, { directory = false } = {}) {
  if (filename.length > options.limits.pathLength || filename.includes('\0')) throw new Error('Input path exceeds the safety limit.');
  for (const ancestor of [...ancestorPaths(filename), ...(directory ? [filename] : [])]) {
    const stat = await fs.lstat(ancestor);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Symbolic-link or reparse-point source paths are refused.');
    const base = path.basename(ancestor).toLowerCase();
    if (forbiddenDirectories.has(base) || /^(?:threadshelf[- ]local[- ]reader|threadshelf-local-analytics)$/i.test(base)) throw new Error('Reader/profile directories require the explicit Reader-source route.');
    const names = new Set((await fs.readdir(ancestor)).map(name => name.toLowerCase()));
    if (profileNames(names)) throw new Error('Reader/profile directory detected; direct export scanning is refused.');
  }
  if (!directory && forbiddenNames.has(path.basename(filename).toLowerCase())) throw new Error('Reader settings, reading state, activity cache, and database files are excluded.');
}

/** Linux reads are anchored through open directory descriptors; the final file
 * is O_NOFOLLOW. This closes ancestor replacement races during file opening.
 * Windows uses lstat reparse rejection plus path/handle identity checks. */
async function secureOpen(filename, options) {
  await checkPath(filename, options);
  const before = await fs.lstat(filename);
  if (!before.isFile() || before.isSymbolicLink()) throw new Error('Only regular, non-symlink export files are supported.');
  if(before.nlink>1)throw new Error('Hard-linked export sources are refused because their writable aliases cannot be safely scoped.');
  let handle; const parents = [];
  try {
    if (process.platform === 'linux') {
      let parent = await fs.open(path.parse(filename).root, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW); parents.push(parent);
      for (const component of path.dirname(filename).slice(path.parse(filename).root.length).split(path.sep).filter(Boolean)) {
        parent = await fs.open(`/proc/self/fd/${parent.fd}/${component}`, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW); parents.push(parent);
        const names = new Set((await fs.readdir(`/proc/self/fd/${parent.fd}`)).map(name => name.toLowerCase()));
        if (profileNames(names)) throw new Error('Reader/profile directory detected through anchored source path.');
      }
      handle = await fs.open(`/proc/self/fd/${parent.fd}/${path.basename(filename)}`, constants.O_RDONLY | constants.O_NOFOLLOW);
    } else handle = await fs.open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const initial = await handle.stat();
    if (!initial.isFile() || identity(initial) !== identity(before)) throw new Error('Input path changed before it could be read.');
    const unchanged = async () => {
      abort(options.signal);
      const [state, nameState] = await Promise.all([handle.stat(), fs.lstat(filename)]);
      if (identity(state) !== identity(initial) || identity(nameState) !== identity(initial) || nameState.isSymbolicLink()) throw new Error('Input changed during import; no records from this file were committed.');
      await checkPath(filename, options);
    };
    return { handle, initial, unchanged, close: async () => { await handle.close(); for (const parent of parents.reverse()) await parent.close(); } };
  } catch (error) { await handle?.close(); for (const parent of parents.reverse()) await parent.close(); throw error; }
}

async function* diskChunks(opened, options, { hash } = {}) {
  await opened.unchanged();
  for (let offset = 0; offset < opened.initial.size;) {
    abort(options.signal);
    const data = Buffer.allocUnsafe(Math.min(256 * 1024, opened.initial.size - offset));
    const { bytesRead } = await opened.handle.read(data, 0, data.length, offset);
    if (!bytesRead) throw new Error('Source was truncated during import.');
    offset += bytesRead; const chunk = data.subarray(0, bytesRead); hash?.update(chunk); yield chunk;
  }
  await opened.unchanged();
}

async function readAll(factory, maxBytes, signal) {
  const chunks = []; let bytes = 0;
  for await (const chunk of factory()) { abort(signal); bytes += chunk.byteLength; if (bytes > maxBytes) throw new Error('Source exceeds the whole-document safety limit.'); chunks.push(Buffer.from(chunk)); }
  return Buffer.concat(chunks);
}

async function* scan(paths, options, diagnostics, depth = 0, seen = new Set(), budget = { entries: 0 }) {
  for (const input of paths) {
    abort(options.signal); const filename = path.resolve(input);
    if (seen.has(filename)) continue; seen.add(filename);
    if (++budget.entries > options.limits.entries) throw new Error('Selected directory tree exceeds the entry limit.');
    try {
      const stat = await fs.lstat(filename);
      if (stat.isSymbolicLink()) throw new Error('Symbolic-link/reparse source skipped.');
      if (stat.isDirectory()) {
        await checkPath(filename, options, { directory: true });
        if (depth >= options.limits.depth) throw new Error('Directory nesting exceeds the depth limit.');
        const entries = await fs.readdir(filename, { withFileTypes: true });
        if (entries.length + budget.entries > options.limits.entries) throw new Error('Selected directory tree exceeds the entry limit.');
        const allowed = entries.filter(entry => !forbiddenNames.has(entry.name.toLowerCase()) && !forbiddenDirectories.has(entry.name.toLowerCase()));
        if (allowed.length !== entries.length) diagnostics.push({ code: 'excluded-metadata', severity: 'info', sourceFile: filename, message: 'Excluded profile/cache/settings names without reading their content.' });
        const before = identity(stat);
        yield* scan(allowed.sort((a, b) => a.name.localeCompare(b.name)).map(entry => path.join(filename, entry.name)), options, diagnostics, depth + 1, seen, budget);
        if (identity(await fs.lstat(filename)) !== before) throw new Error('Export directory changed during scanning; retry a stable copy.');
      } else if (stat.isFile() && (depth === 0 || candidate(path.basename(filename)))) {
        await checkPath(filename, options); yield { filename, stat };
      }
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      diagnostics.push({ code: 'source-refused', severity: 'error', sourceFile: filename, message: error.message });
      emit(options, { phase: 'warning', sourceFile: filename, message: error.message });
    }
  }
}

function* tree(node) { if (typeof node !== 'string') { yield node; for (const child of node.children ?? []) yield* tree(child); } }
function strictArrayAssignment(source) {
  const assignment = /(?:var|let|const)\s+jsonData\s*=\s*/.exec(source.slice(0, 16 * 1024 ** 2));
  if (!assignment) return null;
  const start = assignment.index + assignment[0].length;
  if (source[start] !== '[') throw new Error('HTML jsonData must be a strict JSON array.');
  let depth = 0, quoted = false, escaped = false;
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    if (quoted) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false; }
    else if (c === '"') quoted = true;
    else if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') if (--depth === 0) return parseJSON(source.slice(start, i + 1));
  }
  throw new Error('Incomplete HTML jsonData JSON array.');
}

function parseHTML(raw, filename, diagnostics) {
  const source = new TextDecoder('utf-8', { fatal: true }).decode(raw).replace(/^\uFEFF/, '');
  if (/outer-cell/.test(source) && /gemini/i.test(source)) {
    const prepared = prepareGemini(raw);
    for (const warning of prepared.report.warnings) diagnostics.push({ code: 'gemini-warning', severity: 'warning', sourceFile: filename, message: warning });
    if (prepared.report.unknown || prepared.report.feedback || prepared.report.duplicates) diagnostics.push({ code: 'gemini-activity-coverage', severity: 'info', sourceFile: filename, message: `${prepared.report.unknown} unclassified activity cards, ${prepared.report.feedback} feedback activities, ${prepared.report.duplicates} exact duplicate representations.` });
    return [
      ...prepared.conversations.map(conv => ({ provider: 'gemini', ...conv, sourceSHA256: prepared.sourceSHA256 })),
      ...prepared.activities.map(activity => ({ ...activity,id:`${prepared.sourceSHA256}:activity-card:${activity.sourceCardIndex}`,sourceSHA256:prepared.sourceSHA256,rawSourcePath:`/html/cards/${activity.sourceCardIndex}` })),
    ];
  }
  const supported=document=>normalizeConversations(document,{sourceId:'html-route-validation'}).conversations.length>0;
  const embedded = strictArrayAssignment(source);
  if (embedded !== null && supported(embedded)) return [embedded];
  const nodes = [...tree(parseDocument(source))], parsed = [];
  for (const script of nodes.filter(node => node.tag === 'script' && (/^(?:application|text)\/(?:ld\+)?json$/i.test(node.attrs.type ?? '') || /^(?:data|conversations|export-data)$/.test(node.attrs.id ?? '')))) {
    try { const document=parseJSON(script.children.filter(child => typeof child === 'string').join(''));if(supported(document))parsed.push(document);else diagnostics.push({code:'html-unrelated-json',severity:'info',sourceFile:filename,message:'Unrelated inert JSON block does not suppress static conversation fallback.'}); }
    catch { diagnostics.push({ code: 'html-invalid-embedded-json', severity: 'warning', sourceFile: filename, message: 'An inert embedded JSON block is invalid and was skipped.' }); }
  }
  if (parsed.length) return parsed;
  const blocks = nodes.filter(node => /(?:^|\s)(?:conversation|conversation-card)(?:\s|$)/.test(node.attrs?.class ?? '') || node.attrs?.['data-conversation-id']);
  for (const [index, block] of blocks.entries()) {
    const descendants = [...tree(block)];
    const messages = descendants.filter(node => /(?:^|\s)(?:message|turn)(?:\s|$)/.test(node.attrs?.class ?? '') || node.attrs?.['data-message-author-role']).map((node, i) => ({
      id: node.attrs['data-message-id'] ?? `html-message-${i}`,
      role: node.attrs['data-message-author-role'] ?? node.attrs['data-role'] ?? (/\buser\b/.test(node.attrs.class ?? '') ? 'user' : /\bthinking\b/.test(node.attrs.class ?? '') ? 'thinking' : 'assistant'),
      content: renderChildren(node.children),
      ...(node.attrs['data-timestamp'] ? { timestamp: node.attrs['data-timestamp'] } : {}),
      ...(node.attrs['data-model'] ? { model: node.attrs['data-model'] } : {}),
      ...(node.attrs['data-parent-message-id'] ? { parentMessageId:node.attrs['data-parent-message-id'] } : {}),
      ...(node.attrs['data-request-id'] ? { request_id:node.attrs['data-request-id'] } : {}),
      ...(node.attrs['data-status'] ? { status:node.attrs['data-status'] } : {}),
      attachments:[...tree(node)].filter(child=>child.tag==='img'||child.attrs?.['data-attachment-id']).map(child=>({id:child.attrs['data-attachment-id']??null,name:child.attrs.alt??'',type:child.attrs['data-mime-type']??(child.tag==='img'?'image':'unknown'),width:/^\d+$/.test(child.attrs.width??'')?Number(child.attrs.width):null,height:/^\d+$/.test(child.attrs.height??'')?Number(child.attrs.height):null,size_bytes:/^\d+$/.test(child.attrs['data-size-bytes']??'')?Number(child.attrs['data-size-bytes']):null})),
    }));
    if (!messages.length) continue;
    const heading = descendants.find(node => /^h[1-3]$/.test(node.tag));
    parsed.push({ provider: block.attrs['data-provider'] ?? 'converted', format: 'static-html', id: block.attrs['data-conversation-id'] ?? `html-${sha256(filename)}-${index}`, title: heading ? plain(heading).trim() : `Conversation ${index + 1}`, ...(block.attrs['data-created-at']?{created_at:block.attrs['data-created-at']} : {}),messages });
  }
  if (!parsed.length) throw new Error('HTML contains no supported inert conversation data.');
  diagnostics.push({ code: 'html-static-coverage', severity: 'info', sourceFile: filename, message: 'Static HTML has only the exported visible messages; absent branches, models, and timestamps remain unknown.' });
  return parsed;
}

function normalizeDocuments(documents, filename, options, diagnostics) {
  const conversations = [];
  for (const document of documents) {
    abort(options.signal); safeTree(document, options.limits);
    const result = normalizeConversations(document, { sourceId: options.sourceId, collectionId: options.collectionId, sourceFile: filename,...(options.sourceRecordIndex!=null?{sourceRecordIndex:options.sourceRecordIndex}:{}),...(document?.rawSourcePath?{rawPath:document.rawSourcePath}:{}) });
    conversations.push(...result.conversations);
    diagnostics.push(...result.diagnostics.map(item => ({ sourceFile: filename, ...item })));
  }
  return conversations;
}

const needsWholeArray = value => object(value) && (['user', 'ai', 'thinking'].some(key => typeof value[key] === 'string') || /gemini/i.test(String(value.header) + String(value.titleUrl) + String(value.products)));
async function parseSource(factory, size, filename, options, diagnostics) {
  const { limits } = options;
  let prefix = Buffer.alloc(0); for await (const chunk of factory()) { prefix = Buffer.from(chunk.subarray(0, 8192)); break; }
  const head = prefix.toString('utf8').replace(/^\uFEFF/, '').trimStart();
  const html = /\.html?$/i.test(filename) || head.startsWith('<');
  const utf8 = !prefix.subarray(0, 4).includes(0) && prefix[0] !== 0xff && prefix[0] !== 0xfe;
  if (html || !utf8 || size <= limits.streamingThreshold || !/^[\[{]/.test(head)) {
    const raw = await readAll(factory, html ? limits.htmlBytes : limits.fileBytes, options.signal);
    return normalizeDocuments(html ? parseHTML(raw, filename, diagnostics) : [decodeJSONBytes(raw)], filename, options, diagnostics);
  }
  const metadata = Object.create(null); let kind, wrapped = false, whole = false, records = 0, metadataBytes = 0;
  emit(options, { phase: 'validating', sourceFile: filename, totalBytes: size });
  for await (const event of jsonEvents(factory(), options)) {
    abort(options.signal);
    if (event.type === 'start') kind = event.kind;
    if (event.type === 'container') wrapped = true;
    if (event.type === 'record') {
      if (++records > limits.records) throw new Error('JSON exceeds the conversation record limit.');
      safeTree(event.value, limits); whole ||= needsWholeArray(event.value);
      if (records % 100 === 0) { emit(options, { phase: 'validating', sourceFile: filename, current: records }); await tick(); }
    }
    if (event.type === 'field') {
      metadataBytes += event.bytes;
      if (metadataBytes > limits.fileBytes) throw new Error('JSON wrapper metadata exceeds the safety limit.');
      safeTree(event.value, limits); metadata[event.name] = event.value;
    }
  }
  whole ||= kind !== 'array' && !wrapped;
  whole ||= metadata.venice_conversion != null || metadata.format === 'venice-chat-history' || Array.isArray(metadata.owners) || Array.isArray(metadata.label_values);
  if (kind === 'object' && !wrapped) return normalizeDocuments([metadata], filename, options, diagnostics);
  if (whole || metadataBytes > limits.metadataBytes) {
    if (size > limits.fileBytes) throw new Error('This provider needs whole-document processing; split exports into smaller files.');
    return normalizeDocuments([decodeJSONBytes(await readAll(factory, limits.fileBytes, options.signal))], filename, options, diagnostics);
  }
  const conversations = [];
  emit(options, { phase: 'parsing', sourceFile: filename, total: records });
  for await (const event of jsonEvents(factory(), options)) if (event.type === 'record') {
    const document = wrapped ? { ...metadata, conversations: [event.value] } : [event.value];
    conversations.push(...normalizeDocuments([document], filename, { ...options,sourceRecordIndex:event.index }, diagnostics));
    if (event.index % 100 === 0) { emit(options, { phase: 'parsing', sourceFile: filename, current: event.index + 1, total: records }); await tick(); }
  }
  return conversations;
}

class DiskZipReader extends Reader {
  constructor(opened) { super(); this.opened = opened; this.size = opened.initial.size; }
  async readUint8Array(index, length) {
    if (!Number.isSafeInteger(index) || !Number.isSafeInteger(length) || index < 0 || length < 0 || length > 64 * 1024 ** 2 || index + length > this.size) throw new Error('Invalid or excessive ZIP read bounds.');
    const data = new Uint8Array(length); let offset = 0;
    while (offset < length) { const { bytesRead } = await this.opened.handle.read(data, offset, length - offset, index + offset); if (!bytesRead) throw new Error('Truncated ZIP.'); offset += bytesRead; }
    return data;
  }
}

function validateZip(entries, options) {
  if (entries.length > options.limits.entries) throw new Error('ZIP exceeds the entry limit.');
  const names = new Set(); let expanded = 0;
  for (const entry of entries) {
    if (![entry.uncompressedSize, entry.compressedSize].every(n => Number.isSafeInteger(n) && n >= 0)) throw new Error('Invalid ZIP/ZIP64 entry size.');
    const name = entry.filename;
    const unixMode=(entry.externalFileAttributes??0)>>>16;
    if((unixMode&0xf000)===0xa000||((entry.unixMode??0)&0xf000)===0xa000)throw new Error('Symbolic-link ZIP members are refused.');
    if (name.length > options.limits.pathLength || name.includes('\0') || /(^[\\/]|^[a-z]:|(?:^|[\\/])\.\.(?:[\\/]|$))/i.test(name)) throw new Error('Unsafe ZIP member path.');
    const canonical = name.replaceAll('\\', '/').split('/').filter(part => part && part !== '.').join('/');
    if (canonical.split('/').length > options.limits.depth) throw new Error('ZIP member nesting exceeds the depth limit.');
    if (names.has(canonical)) throw new Error('Duplicate ZIP member path.'); names.add(canonical);
    expanded += entry.uncompressedSize;
    if (!Number.isSafeInteger(expanded) || expanded > options.limits.expandedBytes) throw new Error('ZIP expanded size exceeds the safety limit.');
  }
  if ([...names].some(name => /(?:^|\/)(?:archive\.sqlite|reading(?:-v2)?\.json|current\.json|local-storage-v2)(?:\/|$)/i.test(name))) throw new Error('Reader/profile ZIP detected; use the explicit Reader-source route.');
}

async function* zipChunks(entry, options, budget) {
  if (entry.encrypted) throw new Error('Encrypted ZIP entries are unsupported; use an unencrypted export.');
  if (entry.uncompressedSize > options.limits.streamBytes) throw new Error('ZIP member exceeds the streaming safety limit.');
  const controller = new AbortController(), cancel = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener('abort', cancel, { once: true });
  const stream = new TransformStream(); let failure, count = 0;
  const pump = entry.getData(stream.writable, { checkSignature: true, useWebWorkers: false, signal: controller.signal }).catch(async error => { failure = error; try { await stream.writable.abort(error); } catch {} });
  try {
    for await (const chunk of stream.readable) {
      abort(options.signal); count += chunk.byteLength;
      if (count > entry.uncompressedSize || count > options.limits.streamBytes) throw new Error('ZIP member expanded beyond its declared bounds.');
      yield chunk;
    }
    await pump; if (failure) throw failure;
    if (count !== entry.uncompressedSize) throw new Error('ZIP expanded size mismatch.');
    if (budget && (budget.bytes += count) > options.limits.expandedBytes) throw new Error('Selected ZIP data exceeds the expansion safety limit.');
  } finally { controller.abort(); options.signal?.removeEventListener('abort', cancel); await pump; }
}

async function parseZip(opened, filename, options, diagnostics, budget) {
  const zip = new ZipReader(new DiskZipReader(opened), { useWebWorkers: false });
  try {
    const entries = await zip.getEntries({ filenameValidation: 'tolerant' }); validateZip(entries, options);
    const manifestEntry = entries.find(entry => entry.filename === 'manifest.json');
    const chunks = entries.filter(entry => /^db\/chunk-(0|[1-9][0-9]*)\.json$/.test(entry.filename));
    let manifest;
    if (manifestEntry && !manifestEntry.directory) {
      try { manifest = decodeJSONBytes(await readAll(() => zipChunks(manifestEntry, options), Math.min(options.limits.fileBytes, options.limits.metadataBytes), options.signal)); }
      catch (error) { if (chunks.length || error.name === 'AbortError') throw error; }
    }
    const members=[];
    if(isVeniceBackupManifest(manifest)||chunks.length){
      for(const entry of chunks){try{const value=decodeJSONBytes(await readAll(()=>zipChunks(entry,options),options.limits.fileBytes,options.signal));safeTree(value,options.limits);members.push({name:entry.filename,value});}catch(error){if(isVeniceBackupManifest(manifest)||error.name==='AbortError')throw error;}}
    }
    const verifiedManifest=isVeniceBackupManifest(manifest),verifiedChunkPart=members.length>0&&members.length===chunks.length&&members.every(member=>isVeniceDexieChunk(member.value));
    if (verifiedManifest || verifiedChunkPart) {
      budget.bytes+=chunks.reduce((sum,entry)=>sum+entry.uncompressedSize,0)+(verifiedManifest?manifestEntry.uncompressedSize:0);if(budget.bytes>options.limits.expandedBytes)throw new Error('Selected Venice parts exceed the expansion safety limit.');
      for(const entry of entries.filter(entry=>!entry.directory&&entry.filename!=='manifest.json'&&!/^db\/chunk-(0|[1-9][0-9]*)\.json$/.test(entry.filename)&&!entry.filename.split(/[\\/]/).some(part=>forbiddenNames.has(part.toLowerCase())||forbiddenDirectories.has(part.toLowerCase()))))members.push({name:entry.filename,sizeBytes:entry.uncompressedSize,compressedSizeBytes:entry.compressedSize});
      await opened.unchanged();
      return { backup: { sourceFile: filename, ...(verifiedManifest?{manifest}:{}), members }, conversations: [] };
    }
    const conversations = [];
    for (const entry of entries) {
      abort(options.signal);
      if (entry.directory || !candidate(entry.filename)) continue;
      if (/\.zip$/i.test(entry.filename)) {
        diagnostics.push({ code: 'nested-zip-unsupported', severity: 'warning', sourceFile: `${filename}!/${entry.filename}`, message: 'Nested ZIPs are not scanned; extract this complete container and select it separately.' }); continue;
      }
      if (entry.filename.split(/[\\/]/).some(part => forbiddenNames.has(part.toLowerCase()) || forbiddenDirectories.has(part.toLowerCase()))) {
        diagnostics.push({ code: 'zip-excluded-metadata', severity: 'info', sourceFile: filename, message: 'Profile/cache/settings member excluded without reading.' }); continue;
      }
      const sourceFile = `${filename}!/${entry.filename}`;
      try {
        const memberDiagnostics = [];
        const records = await parseSource(() => zipChunks(entry, options), entry.uncompressedSize, sourceFile, options, memberDiagnostics);
        budget.bytes += entry.uncompressedSize;
        if (budget.bytes > options.limits.expandedBytes) throw new Error('Selected ZIP exports exceed the expansion safety limit.');
        conversations.push(...records); diagnostics.push(...memberDiagnostics);
      } catch (error) {
        if (error.name === 'AbortError') throw error;
        diagnostics.push({ code: 'zip-member-error', severity: 'error', sourceFile, message: error.message });
      }
      await tick();
    }
    await opened.unchanged(); return { conversations };
  } finally { await zip.close(); }
}

/** Public API. Results are transactionally retained per stable source file;
 * unsupported neighboring files have explicit diagnostics. Venice multipart
 * backups are validated together before any backup conversation is retained.
 * `files` inventories physical sources (never ZIP media content); `bytes` is
 * their selected file size, not repeated streaming validation I/O. */
export async function ingestExports(paths, options = {}) {
  if (!Array.isArray(paths) || !paths.length || !paths.every(item => typeof item === 'string' && item.length)) throw new Error('Select one or more direct export files or extracted folders.');
  options = { ...options, limits: checkedLimits(options.limits) };
  const sourceId = options.sourceId ?? `exports:${sha256(paths.map(item => path.resolve(item)).sort().join('\n'))}`;
  options.sourceId = sourceId;
  const conversations = [], diagnostics = [], files = [], backups = [], scanned = [], budget = { bytes: 0 }; let bytes = 0;
  emit(options, { phase: 'scanning' });
  for await (const item of scan(paths, options, diagnostics)) scanned.push(item);
  for (const [index, item] of scanned.entries()) {
    abort(options.signal); const filename = item.filename, report = { sourceFile: filename, path: filename, bytes: item.stat.size, status: 'pending' };
    files.push(report); let opened;
    emit(options, { phase: 'reading', sourceFile: filename, current: index + 1, total: scanned.length, totalBytes: item.stat.size });
    try {
      if (/\.(?:7z|rar)$/i.test(filename)) throw new Error('Direct 7z/RAR export archives are unsupported; extract the export folder and select it. Reader compressed storage uses the Reader-source route.');
      opened = await secureOpen(filename, options); const size = opened.initial.size;
      const magic = Buffer.alloc(4); await opened.handle.read(magic, 0, magic.length, 0);
      const zip = /\.zip$/i.test(filename) || magic.subarray(0, 2).toString('ascii') === 'PK';
      if (!Number.isSafeInteger(size) || size > (zip ? options.limits.zipBytes : options.limits.streamBytes) || !Number.isSafeInteger(bytes + size)) throw new Error('Source exceeds the configured input size limit.');
      // Windows can retain the same size and timestamps for an in-place write
      // while this read handle is open. Compare content before and after parsing
      // as well as the path/handle metadata, without retaining source bytes.
      const initialDigest = createHash('sha256'); for await (const chunk of diskChunks(opened, options, { hash: initialDigest })) {}
      const initialHash = initialDigest.digest('hex');
      let result, localDiagnostics = [];
      if (zip) result = await parseZip(opened, filename, options, localDiagnostics, budget);
      else result = { conversations: await parseSource(() => diskChunks(opened, options), size, filename, options, localDiagnostics) };
      // Fingerprint the entire physical source after decoding, while still held
      // read-only. A failed stability check discards this file's parsed records.
      const digest = createHash('sha256'); for await (const chunk of diskChunks(opened, options, { hash: digest })) {}
      const finalHash = digest.digest('hex');
      if (finalHash !== initialHash) throw new Error('Input changed during import; no records from this file were committed.');
      report.sha256 = finalHash; report.status = result.backup ? 'venice-part' : result.conversations.length ? 'imported' : 'unsupported';
      report.conversations = result.conversations.length; bytes += size;
      if (result.backup) backups.push(result.backup);
      conversations.push(...result.conversations); diagnostics.push(...localDiagnostics);
      emit(options, { phase: report.status, sourceFile: filename, conversations: result.conversations.length });
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      report.status = 'error'; report.error = error.message;
      diagnostics.push({ code: 'export-read-error', severity: 'error', sourceFile: filename, message: error.message });
      emit(options, { phase: 'error', sourceFile: filename, message: error.message });
    } finally { await opened?.close(); }
    await tick();
  }
  if (backups.length) {
    const sourceFile = backups.map(part => part.sourceFile).join(';');
    try {
      const backup = assembleVeniceBackup(backups, { signal: options.signal, limits: options.limits });
      const records = normalizeDocuments([backup], sourceFile, options, diagnostics); conversations.push(...records);
      for (const file of files.filter(file => file.status === 'venice-part')) file.status = 'imported';
      emit(options, { phase: 'venice-complete', conversations: records.length });
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      diagnostics.push({ code: 'venice-backup-error', severity: 'error', sourceFile, message: error.message });
      for (const file of files.filter(file => file.status === 'venice-part')) { file.status = 'error'; file.error = error.message; }
    }
  }
  const reconciled = reconcileConversations(conversations, { diagnostics });
  emit(options, { phase: 'complete', current: scanned.length, total: scanned.length, conversations: reconciled.length });
  return { sourceId, conversations: reconciled, diagnostics, files, bytes };
}
