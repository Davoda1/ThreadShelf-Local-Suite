/** Independent read-only direct-export ingestion. Never opens a Reader profile,
 * runs exported JavaScript, extracts ZIP members, or writes to source paths. */
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash,randomUUID } from 'node:crypto';
import { Reader, ZipReader } from '@zip.js/zip.js';
import { normalizeConversations, prepareConversationDocument, reconcileConversations,validateAnalyticalTree,DEFAULT_ANALYTICAL_LIMITS } from './adapters.mjs';
import { decodeJSONBytes } from './parsers/json-bytes.mjs';
import { parseJSON } from './parsers/common.mjs';
import { jsonEvents } from './parsers/stream-json.mjs';
import { parseDocument, prepareExport as prepareGemini, renderChildren, plain } from './parsers/gemini.mjs';
import { assembleVeniceBackup, isVeniceBackupManifest, isVeniceDexieChunk } from './parsers/venice-backup.mjs';
import {DiskVeniceBackup} from './parsers/venice-backup-disk.mjs';
import {DiskInputLedger} from './input-ledger.mjs';
import {assertOutputOutsideSource} from './source-access.mjs';

export const INGEST_LIMITS = Object.freeze({
  fileBytes: 512 * 1024 ** 2, htmlBytes: 512 * 1024 ** 2,
  streamBytes: 256 * 1024 ** 3, zipBytes: 1024 ** 4, expandedBytes: 256 * 1024 ** 3,
  recordBytes: 512 * 1024 ** 2, metadataBytes: 16 * 1024 ** 2,
  streamingThreshold: 8 * 1024 ** 2, entries: 100000, records: 2000000,
  depth: 64, jsonDepth: 256, nodes: DEFAULT_ANALYTICAL_LIMITS.nodes, pathLength: 32768,
});
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const forbiddenNames = new Set(['settings.json', 'interface.json', 'appearance.json', 'layout.json', 'reading.json', 'reading-v2.json', 'reading-v2.json.bak', 'preferences', 'cookies', 'archive.sqlite', 'vectors.sqlite', 'current.json', 'previous.json', 'writer.json', 'writer-gate.json', 'cleanup-pending.json', 'initializing.json']);
const forbiddenDirectories = new Set(['local-storage-v2', 'activity-v1', 'search', 'local storage', 'session storage', 'indexeddb', 'cache', 'code cache', 'gpu cache']);
const abort = signal => { if (signal?.aborted) throw new DOMException('Import cancelled.', 'AbortError'); };
const tick = () => new Promise(resolve => setImmediate(resolve));
const identity = stat => `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
const sha256 = value => createHash('sha256').update(value).digest('hex');
const candidate = name => /\.(?:json|html?|zip)$/i.test(name) || !path.extname(name);
const emit = (options, data) => options.onProgress?.({ operation: 'ingest', ...data,...(options.consumer?{completed:data.completed??data.current??0,total:data.total??0}:{}) });
const profileNames = names => names.has('local-storage-v2') || names.has('archive.sqlite') || names.has('reading-v2.json') || names.has('activity-v1') || (names.has('current.json') && (names.has('objects') || names.has('snapshots') || names.has('records')));
async function directoryProfile(directory,options,cacheKey=directory,state){
  if(!options.consumer)return profileNames(new Set((await fs.readdir(directory)).map(name=>name.toLowerCase())));
  state??=await fs.stat(directory);const token=identity(state),db=options.ledger?.db;
  if(db&&!options.profileCacheReady){db.exec('CREATE TABLE directory_profiles(path TEXT PRIMARY KEY,identity TEXT NOT NULL,is_profile INTEGER NOT NULL)');options.profileCacheReady=true;}
  const retained=db?.prepare('SELECT identity,is_profile FROM directory_profiles WHERE path=?').get(cacheKey);if(retained?.identity===token)return !!retained.is_profile;
  const flags=new Set(),relevant=new Set(['local-storage-v2','archive.sqlite','reading-v2.json','activity-v1','current.json','objects','snapshots','records']);let found=false;
  const opened=await fs.opendir(directory);try{for await(const entry of opened){abort(options.signal);const name=entry.name.toLowerCase();if(relevant.has(name))flags.add(name);if(profileNames(flags)){found=true;break;}}}finally{await opened.close().catch(()=>{});}
  db?.prepare('INSERT INTO directory_profiles(path,identity,is_profile) VALUES(?,?,?) ON CONFLICT(path) DO UPDATE SET identity=excluded.identity,is_profile=excluded.is_profile').run(cacheKey,token,found?1:0);return found;
}


function checkedLimits(overrides) {
  const limits = { ...INGEST_LIMITS, ...overrides };
  for (const [name, value] of Object.entries(limits)) if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Invalid ingest limit: ${name}.`);
  return limits;
}

function safeTree(root, limits) {
  validateAnalyticalTree(root,{nodes:limits.nodes,depth:limits.jsonDepth});
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
    if (await directoryProfile(ancestor,options,ancestor,stat)) throw new Error('Reader/profile directory detected; direct export scanning is refused.');
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
      let originalParent=path.parse(filename).root;
      for (const component of path.dirname(filename).slice(path.parse(filename).root.length).split(path.sep).filter(Boolean)) {
        parent = await fs.open(`/proc/self/fd/${parent.fd}/${component}`, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW); parents.push(parent);
        originalParent=path.join(originalParent,component);
        if (await directoryProfile(`/proc/self/fd/${parent.fd}`,options,originalParent,await parent.stat())) throw new Error('Reader/profile directory detected through anchored source path.');
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
    if(options.ledger){if(!options.ledger.remember(filename))continue;}else{if (seen.has(filename)) continue; seen.add(filename);}
    if (++budget.entries > options.limits.entries) throw new Error('Selected directory tree exceeds the entry limit.');
    try {
      const stat = await fs.lstat(filename);
      if (stat.isSymbolicLink()) throw new Error('Symbolic-link/reparse source skipped.');
      if (stat.isDirectory()) {
        await checkPath(filename, options, { directory: true });
        if (depth >= options.limits.depth) throw new Error('Directory nesting exceeds the depth limit.');
        if(options.ledger){
          const before=identity(stat);let excluded=false;
          for await(const entry of options.ledger.directoryEntries(filename)){
            if(forbiddenNames.has(entry.name.toLowerCase())||forbiddenDirectories.has(entry.name.toLowerCase())){excluded=true;continue;}
            yield*scan([path.join(filename,entry.name)],options,diagnostics,depth+1,seen,budget);
          }
          if(excluded)diagnostics.push({code:'excluded-metadata',severity:'info',sourceFile:filename,message:'Excluded profile/cache/settings names without reading their content.'});
          if(identity(await fs.lstat(filename))!==before)throw new Error('Export directory changed during scanning; retry a stable copy.');
          continue;
        }
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

async function normalizeDocuments(documents, filename, options, diagnostics) {
  const conversations = [];
  for (const document of documents) {
    abort(options.signal); safeTree(document, options.limits);
    const context={sourceId:options.sourceId,collectionId:options.collectionId,sourceFile:filename,...options.normalizationContext,...(options.sourceRecordIndex!=null?{sourceRecordIndex:options.sourceRecordIndex}:{}),...(document?.rawSourcePath?{rawPath:document.rawSourcePath}:{})};
    const result = options.consumer ? prepareConversationDocument(document,context) : normalizeConversations(document,context);
    if(options.consumer){for(const conversation of result.conversations){abort(options.signal);await options.consumer.onConversation(conversation);options.consumerState.count++;}await options.consumer.onDiagnostics?.(result.diagnostics.map(item=>({sourceFile:filename,...item})));}
    else{conversations.push(...result.conversations);diagnostics.push(...result.diagnostics.map(item => ({ sourceFile: filename, ...item })));}
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
  if(options.consumer&&head.startsWith('[')&&!options.forceTwoPass){
    const unit=await options.consumer.beginUnit({kind:'json-array',sourceFile:filename}),before=options.consumerState.count;let fallback=false,records=0,unitOpen=true;
    try{
      emit(options,{phase:'parsing',sourceFile:filename,completed:0,total:0,totalBytes:size});
      for await(const event of jsonEvents(factory(),options))if(event.type==='record'){
        abort(options.signal);if(needsWholeArray(event.value)){fallback=true;break;}
        if(++records>limits.records)throw new Error('JSON exceeds the conversation record limit.');
        await normalizeDocuments([[event.value]],filename,{...options,sourceRecordIndex:event.index},diagnostics);
        if(records%100===0){emit(options,{phase:'parsing',sourceFile:filename,completed:records,total:0,totalBytes:size});await tick();}
      }
      if(fallback){await options.consumer.rollbackUnit(unit);unitOpen=false;options.consumerState.count=before;return parseSource(factory,size,filename,{...options,forceTwoPass:true},diagnostics);}
      await options.consumer.commitUnit(unit);unitOpen=false;emit(options,{phase:'parsing',sourceFile:filename,completed:records,total:records,totalBytes:size});return[];
    }catch(error){if(unitOpen)await options.consumer.rollbackUnit(unit);options.consumerState.count=before;throw error;}
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
    conversations.push(...await normalizeDocuments([document], filename, { ...options,sourceRecordIndex:event.index }, diagnostics));
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
    if(options.consumer&&(isVeniceBackupManifest(manifest)||chunks.length)){
      if(typeof options.workspace!=='string'||!path.isAbsolute(options.workspace))throw new Error('A private ingestion workspace is required for a Venice backup.');
      const assembler=options.consumerState.venice??=new DiskVeniceBackup({filename:path.join(options.workspace,'venice-'+randomUUID()+'.sqlite'),signal:options.signal,limits:options.limits});
      assembler.beginPart();let recognized=0;
      try{
        if(isVeniceBackupManifest(manifest))assembler.addManifest(manifest);
        for(const entry of chunks){abort(options.signal);const value=decodeJSONBytes(await readAll(()=>zipChunks(entry,options),options.limits.fileBytes,options.signal));safeTree(value,options.limits);if(!isVeniceDexieChunk(value)){if(isVeniceBackupManifest(manifest))throw new Error('Unsupported or invalid Dexie v1 chunk.');break;}assembler.addChunk(entry.filename,value);recognized++;await tick();}
        if(isVeniceBackupManifest(manifest)||recognized>0&&recognized===chunks.length){
          budget.bytes+=chunks.reduce((sum,entry)=>sum+entry.uncompressedSize,0)+(isVeniceBackupManifest(manifest)?manifestEntry.uncompressedSize:0);if(budget.bytes>options.limits.expandedBytes)throw new Error('Selected Venice parts exceed the expansion safety limit.');
          for(const entry of entries)if(!entry.directory)assembler.addMedia({name:entry.filename,sourcePart:filename,sizeBytes:entry.uncompressedSize,compressedSizeBytes:entry.compressedSize});
          await opened.unchanged();return{backupDisk:true,conversations:[]};
        }
        assembler.rollbackPart();
      }catch(error){assembler.rollbackPart();throw error;}
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
      let memberUnit,memberCount=options.consumerState?.count;
      try {
        memberUnit=await options.consumer?.beginUnit?.({kind:'member',sourceFile});
        const memberDiagnostics = [];
        const records = await parseSource(() => zipChunks(entry, options), entry.uncompressedSize, sourceFile, options, memberDiagnostics);
        budget.bytes += entry.uncompressedSize;
        if (budget.bytes > options.limits.expandedBytes) throw new Error('Selected ZIP exports exceed the expansion safety limit.');
        conversations.push(...records); diagnostics.push(...memberDiagnostics);
        await options.consumer?.commitUnit?.(memberUnit);
      } catch (error) {
        if(options.consumer){if(memberUnit!==undefined)await options.consumer.rollbackUnit(memberUnit);options.consumerState.count=memberCount;}
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
  if(options.consumer&&['onConversation','beginUnit','commitUnit','rollbackUnit'].some(key=>typeof options.consumer[key]!=='function'))throw new TypeError('Direct import consumer requires conversation and transaction callbacks.');
  options = { ...options, limits: checkedLimits(options.consumer?{records:Number.MAX_SAFE_INTEGER,...options.limits}:options.limits),...(options.consumer?{consumerState:{count:0}}:{}) };
  let ledger;
  if(options.consumer){if(typeof options.workspace!=='string'||!path.isAbsolute(options.workspace))throw new TypeError('A private absolute workspace is required for streaming import.');await assertOutputOutsideSource(options.workspace,paths);ledger=new DiskInputLedger({filename:path.join(options.workspace,'input-'+randomUUID()+'.sqlite'),signal:options.signal});options.ledger=ledger;}
  const sourceId = options.sourceId ?? `exports:${sha256(paths.map(item => path.resolve(item)).sort().join('\n'))}`;
  options.sourceId = sourceId;
  const conversations = [], diagnostics = ledger?{push:(...items)=>ledger.addDiagnostics(items)}:[], files = [], backups = [], scanned = [], budget = { bytes: 0 }; let bytes = 0;
  const fileValues=status=>ledger?ledger.files(status?{status}:{}):files.filter(file=>!status||file.status===status);
  const putFile=async(index,report)=>{if(ledger){ledger.putFile(index,report);await options.consumer.onFile?.(report,index);}};
  const updateParts=async(status,error)=>{if(ledger){let last=-1;for(;;){const row=ledger.db.prepare("SELECT ordinal,report FROM files WHERE status='venice-part' AND ordinal>? ORDER BY ordinal LIMIT 1").get(last);if(!row)break;const file=JSON.parse(row.report);file.status=status;if(error)file.error=error;await putFile(row.ordinal,file);last=row.ordinal;}}else for(const file of fileValues('venice-part')){file.status=status;if(error)file.error=error;}};
  const backupSourceLabel=()=>{if(!ledger)return files.filter(file=>file.status==='venice-part').map(file=>file.sourceFile).join(';');const n=ledger.countFiles({status:'venice-part'});if(n===1)return JSON.parse(ledger.db.prepare("SELECT report FROM files WHERE status='venice-part' ORDER BY ordinal LIMIT 1").get().report).sourceFile;return `Venice backup (${n} ZIP parts; full inventory retained)`;};
  try{
  emit(options, { phase: 'scanning' });
  for await (const item of scan(paths, options, diagnostics))if(ledger)ledger.addScanned(item.filename,{size:item.stat.size});else scanned.push(item);
  const scanCount=ledger?ledger.db.prepare('SELECT COUNT(*) AS n FROM scanned').get().n:scanned.length;let scanIndex=0;
  for (const item of ledger?ledger.scanned():scanned) {
    const index=scanIndex++;
    abort(options.signal); const filename = item.filename, report = { sourceFile: filename, path: filename, bytes: item.stat.size, status: 'pending' };
    if(!ledger)files.push(report);let opened,fileUnit;const beforeCount=options.consumerState?.count;
    emit(options, { phase: 'reading', sourceFile: filename, current: index + 1, total: scanCount, totalBytes: item.stat.size });
    try {
      fileUnit=await options.consumer?.beginUnit?.({kind:'file',sourceFile:filename});
      if (/\.(?:7z|rar)$/i.test(filename)) throw new Error('Direct 7z/RAR export archives are unsupported; extract the export folder and select it. Reader compressed storage uses the Reader-source route.');
      opened = await secureOpen(filename, options); const size = opened.initial.size;report.bytes=size;
      const magic = Buffer.alloc(4); await opened.handle.read(magic, 0, magic.length, 0);
      const zip = /\.zip$/i.test(filename) || magic.subarray(0, 2).toString('ascii') === 'PK';
      if (!Number.isSafeInteger(size) || size > (zip ? options.limits.zipBytes : options.limits.streamBytes) || !Number.isSafeInteger(bytes + size)) throw new Error('Source exceeds the configured input size limit.');
      // Preserve public source-coherence protection even when Windows reports
      // unchanged size and timestamps for an in-place edit. Hash bytes around
      // parsing without retaining the input or adding another JSON parse.
      const initialDigest=createHash('sha256');for await(const chunk of diskChunks(opened,options,{hash:initialDigest})){}const initialFingerprint=initialDigest.digest('hex');
      let result, localDiagnostics = [];
      if (zip) result = await parseZip(opened, filename, options, localDiagnostics, budget);
      else result = { conversations: await parseSource(() => diskChunks(opened, options), size, filename, options, localDiagnostics) };
      // Fingerprint the entire physical source after decoding, while still held
      // read-only. A failed stability check discards this file's parsed records.
      const digest = createHash('sha256'); for await (const chunk of diskChunks(opened, options, { hash: digest })) {}
      const count=options.consumer?options.consumerState.count-beforeCount:result.conversations.length;
      const finalFingerprint=digest.digest('hex');if(finalFingerprint!==initialFingerprint)throw new Error('Input changed during import; no records from this file were committed.');
      report.sha256 = finalFingerprint; report.status = result.backup||result.backupDisk ? 'venice-part' : count ? 'imported' : 'unsupported';
      report.conversations = count;
      if (result.backup) backups.push(result.backup);
      conversations.push(...result.conversations); diagnostics.push(...localDiagnostics);
      await options.consumer?.commitUnit?.(fileUnit);
      if(result.backupDisk)options.consumerState.venice.commitPart();
      bytes += size;
      emit(options, { phase: report.status, sourceFile: filename, conversations: count });
    } catch (error) {
      options.consumerState?.venice?.rollbackPart();
      if(options.consumer){if(fileUnit!==undefined)await options.consumer.rollbackUnit(fileUnit);options.consumerState.count=beforeCount;}
      if (error.name === 'AbortError') throw error;
      report.status = 'error'; report.error = error.message;
      diagnostics.push({ code: 'export-read-error', severity: 'error', sourceFile: filename, message: error.message });
      emit(options, { phase: 'error', sourceFile: filename, message: error.message });
    } finally { await opened?.close();await putFile(index,report); }
    await tick();
  }
  if(options.consumerState?.venice){
    const assembler=options.consumerState.venice;let unit;const previousCount=options.consumerState.count;
    try{
      assembler.validate();unit=await options.consumer.beginUnit({kind:'venice-backup'});
      for(const media of assembler.iterateMedia())await options.consumer.onAuxiliary?.('venice-media',media.inventoryKey||media.name,media);
      let count=0;
      for await(const value of assembler.conversations()){
        abort(options.signal);const context={sourceId:options.sourceId,collectionId:options.collectionId,sourceFile:backupSourceLabel(),provider:'venice',account:value.ownerId,format:'venice-v4-dexie',rawPath:`/owners/${value.ownerIndex}/conversations/${value.conversationIndex}`};
        const prepared=prepareConversationDocument(value.conversation,context);await options.consumer.onDiagnostics?.(prepared.diagnostics);
        for(const conversation of prepared.conversations){conversation.containerMetadata={...value.backupMetadata,sourceInventoryNamespace:'source-files'};await options.consumer.onConversation(conversation);options.consumerState.count++;count++;}
        if(count%64===0)emit(options,{phase:'venice-normalize',current:count});
      }
      await options.consumer.commitUnit(unit);await updateParts('imported');emit(options,{phase:'venice-complete',completed:count,total:count,conversations:count});
    }catch(error){if(unit!==undefined)await options.consumer.rollbackUnit(unit);options.consumerState.count=previousCount;if(error.name==='AbortError')throw error;diagnostics.push({code:'venice-backup-error',severity:'error',sourceFile:backupSourceLabel(),message:error.message});await updateParts('error',error.message);}
    finally{assembler.close();await fs.rm(assembler.filename,{force:true});}
  }
  if (backups.length) {
    const sourceFile = backups.map(part => part.sourceFile).join(';');
    try {
      const backup = assembleVeniceBackup(backups, { signal: options.signal, limits: options.limits });
      const records = await normalizeDocuments([backup], sourceFile, options, diagnostics); conversations.push(...records);
      for (const file of files.filter(file => file.status === 'venice-part')) file.status = 'imported';
      emit(options, { phase: 'venice-complete', conversations: records.length });
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      diagnostics.push({ code: 'venice-backup-error', severity: 'error', sourceFile, message: error.message });
      for (const file of files.filter(file => file.status === 'venice-part')) { file.status = 'error'; file.error = error.message; }
    }
  }
  const reconciled = options.consumer?[]:reconcileConversations(conversations, { diagnostics });
  emit(options, { phase: 'complete', current: scanCount, total: scanCount, conversations: options.consumer?options.consumerState.count:reconciled.length });
  if(ledger){const sampledFiles=[],sampledDiagnostics=[];for(const file of ledger.files()){if(sampledFiles.length>=100)break;sampledFiles.push(file);}for(const diagnostic of ledger.diagnostics()){await options.consumer.onDiagnostics?.([diagnostic]);if(sampledDiagnostics.length<100)sampledDiagnostics.push(diagnostic);}return{sourceId,conversations:[],conversationCount:options.consumerState.count,fileCount:ledger.countFiles(),diagnostics:sampledDiagnostics,diagnosticsAreStreamed:true,files:sampledFiles,bytes};}
  return { sourceId, conversations: reconciled,diagnostics, files, bytes };
  }finally{if(options.consumerState?.venice){const assembler=options.consumerState.venice;assembler.close();await fs.rm(assembler.filename,{force:true});}if(ledger){ledger.close();await fs.rm(ledger.filename,{force:true});}}
}
