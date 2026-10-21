/** Rebuildable Activity index. Durable data is compressed; the private SQLite
 * working copy contains metadata only and is removed on close. Source content
 * is read one changed conversation at a time, never retained across the archive. */
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { setImmediate as yieldTask } from 'node:timers/promises';
import { encodeFile, decodeFile, normalizeProfile, profileExtension, MAX_CODEC_FILE_BYTES } from './codec.mjs';
import { normalizeActivity, activityDay } from './activity-normalize.mjs';
import { activityCustomRange, activityRange } from './activity-range.mjs';

// Version 3 adds marked start estimates for normalized server copies. Rejecting
// old derived caches forces automatic re-normalization even without an import.
// Keep the cache location stable: older readers can safely rebuild their view.
const CACHE_VERSION = 3, DAY = 86400000, APPLICATION_ID = 0x54534131;
const abort = signal => { if (signal?.aborted) throw Object.assign(new Error('Activity was cancelled.'), { name: 'AbortError', code: 'ABORT_ERR' }); };
const exists = async file => { try { await fs.access(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } };
async function sha256(file) { const hash = createHash('sha256'); for await (const bytes of createReadStream(file)) hash.update(bytes); return hash.digest('hex'); }
const emptyDay = date => ({ date, messages: 0, user: 0, assistant: 0, tool: 0, conversations: 0 });
const dateValue = value => { if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null; const date = new Date(value + 'T00:00:00Z'); return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null; };
const sortedObject = map => Object.fromEntries([...map].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
const count = (map, key, value = 1) => map.set(key, (map.get(key) || 0) + value);

export class ActivityService {
  constructor({ store, dataDir, profile = '7z', onProgress = () => {} } = {}) {
    if (!store || !dataDir) throw new TypeError('Activity requires an open archive and profile data directory.');
    this.store = store; this.root = path.resolve(dataDir, 'activity-v1'); this.profileSource = profile; this.onProgress = onProgress;
    this.db = null; this.temporary = null; this.manifest = null; this.queue = Promise.resolve(); this.stale = false; this.closed = false;
    this.stats = { indexedConversations: 0, decodedConversations: 0, reusedConversations: 0, recovery: '' };
  }
  currentProfile() { return normalizeProfile(typeof this.profileSource === 'function' ? this.profileSource() : this.profileSource); }
  status() { return { version: CACHE_VERSION, profile: this.currentProfile(), ...this.stats, revision: this.manifest?.revision || '', compressedBytes: this.manifest?.bytes || 0 }; }
  invalidate() { this.stale = true; }
  enqueue(task) { const result = this.queue.then(task); this.queue = result.catch(() => {}); return result; }
  query(options = {}, context = {}) { return this.enqueue(async () => { activityCustomRange(options); await this.ensureIndex(context); return this.report(options, context); }); }
  rebuild(options = {}, context = {}) { return this.enqueue(async () => { activityCustomRange(options); await this.initialize(context); this.db.exec('DELETE FROM conversations; DELETE FROM metadata;'); this.stale = true; await this.ensureIndex(context); return this.report(options, context); }); }

  async initialize({ signal } = {}) {
    if (this.closed) throw new Error('The Activity index is closed.');
    if (this.db) return;
    abort(signal); await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
    const stat = await fs.lstat(this.root); if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('The Activity cache directory has an unsafe type.');
    // ApplicationService holds the profile writer lease. Reclaim only this
    // cache's marked working directories after an interrupted prior process.
    for (const name of await fs.readdir(this.root)) if (/^working-[a-f0-9-]{36}$/.test(name)) {
      const directory = path.join(this.root, name), entry = await fs.lstat(directory);
      if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error('An Activity working directory has an unsafe type.');
      await fs.rm(directory, { recursive: true, force: true });
    }
    this.temporary = path.join(this.root, `working-${randomUUID()}`); await fs.mkdir(this.temporary, { mode: 0o700 });
    this.databasePath = path.join(this.temporary, 'activity.sqlite');
    try {
      if (await exists(path.join(this.root, 'current.json'))) {
        const manifestFile = path.join(this.root, 'current.json');
        if ((await fs.stat(manifestFile)).size > 8192) throw new Error('Activity cache manifest exceeds its limit.');
        const manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'));
        if (manifest.version !== CACHE_VERSION || !/^[a-f0-9-]{36}\.(?:7z|zip)$/.test(manifest.file || '') || !/^[a-f0-9]{64}$/.test(manifest.sha256 || '') || !Number.isSafeInteger(manifest.logicalBytes) || manifest.logicalBytes < 0 || manifest.logicalBytes > MAX_CODEC_FILE_BYTES || typeof manifest.revision !== 'string') throw new Error('Unsupported Activity cache manifest.');
        normalizeProfile(manifest.profile);
        const compressed = path.join(this.root, manifest.file);
        if (await sha256(compressed) !== manifest.sha256) throw new Error('Activity cache checksum differs.');
        await decodeFile(compressed, this.databasePath, { profile: manifest.profile, maxBytes: manifest.logicalBytes, expectedBytes: manifest.logicalBytes, signal });
        this.db = new DatabaseSync(this.databasePath);
        if (this.db.prepare('PRAGMA application_id').get().application_id !== APPLICATION_ID || this.db.prepare('PRAGMA user_version').get().user_version !== CACHE_VERSION || this.db.prepare('PRAGMA quick_check').get().quick_check !== 'ok') throw new Error('Invalid Activity cache database.');
        if (this.db.prepare("SELECT value FROM metadata WHERE key='revision'").get()?.value !== manifest.revision) throw new Error('Activity cache revision differs.');
        this.manifest = manifest;
      }
    } catch (error) {
      this.db?.close(); this.db = null; this.manifest = null; await fs.rm(this.databasePath, { force: true });
      if (error.name === 'AbortError' || error.code === 'ABORT_ERR') { await fs.rm(this.temporary, { recursive: true, force: true }); this.temporary = null; throw error; }
      this.stats.recovery = 'rebuilt-cache';
    }
    if (!this.db) {
      this.db = new DatabaseSync(this.databasePath);
      this.db.exec(`PRAGMA application_id=${APPLICATION_ID}; PRAGMA user_version=${CACHE_VERSION};
        CREATE TABLE metadata (key TEXT PRIMARY KEY,value TEXT NOT NULL);
        CREATE TABLE conversations (id TEXT PRIMARY KEY,content_hash TEXT NOT NULL,collection TEXT NOT NULL,source_file TEXT NOT NULL,conversation_key TEXT NOT NULL,title TEXT NOT NULL,provider TEXT NOT NULL,created INTEGER,created_estimated INTEGER NOT NULL,updated INTEGER,coverage TEXT NOT NULL,branch_fallback INTEGER NOT NULL,cycle INTEGER NOT NULL,duplicate_messages INTEGER NOT NULL,branch_points INTEGER NOT NULL,seen INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE messages (conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,ordinal INTEGER NOT NULL,role TEXT NOT NULL,time INTEGER,model TEXT NOT NULL,active INTEGER NOT NULL,PRIMARY KEY(conversation_id,ordinal));
        CREATE INDEX messages_model ON messages(model,conversation_id); CREATE INDEX conversations_collection ON conversations(collection); CREATE INDEX conversations_hash ON conversations(content_hash);`);
    }
    await fs.chmod(this.databasePath, 0o600);
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA temp_store=FILE; PRAGMA cache_size=-16384;');
    this.stats.indexedConversations = this.db.prepare('SELECT count(*) AS n FROM conversations').get().n;
  }

  async ensureIndex({ signal } = {}) {
    await this.initialize({ signal }); abort(signal);
    const revision = this.store.searchRevision(), previous = this.db.prepare("SELECT value FROM metadata WHERE key='revision'").get()?.value;
    if (previous === revision && !this.stale) { if (this.manifest?.profile !== this.currentProfile() || this.manifest?.revision !== revision) await this.persist(revision, { signal }); return; }
    const identity = revision.slice(0, revision.lastIndexOf(':')), previousIdentity = previous?.slice(0, previous.lastIndexOf(':'));
    let decoded = 0, reused = 0, done = 0;
    const total = this.store._open().prepare('SELECT count(*) AS n FROM conversations').get().n;
    this.onProgress({ phase: 'activity-index', done, current: done, total });
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (previousIdentity && identity !== previousIdentity) this.db.exec('DELETE FROM conversations');
      this.db.exec('UPDATE conversations SET seen=0');
      const old = this.db.prepare('SELECT content_hash FROM conversations WHERE id=?');
      const shared = this.db.prepare('SELECT id FROM conversations WHERE content_hash=? LIMIT 1');
      const metadata = this.db.prepare('UPDATE conversations SET collection=?,source_file=?,conversation_key=?,title=?,provider=?,seen=1 WHERE id=?');
      const remove = this.db.prepare('DELETE FROM conversations WHERE id=?');
      const insert = this.db.prepare('INSERT INTO conversations VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)');
      const event = this.db.prepare('INSERT INTO messages VALUES (?,?,?,?,?,?)');
      const copyConversation = this.db.prepare('INSERT INTO conversations SELECT ?,content_hash,?,?,?,?,?,created,created_estimated,updated,coverage,branch_fallback,cycle,duplicate_messages,branch_points,1 FROM conversations WHERE id=?');
      const copyEvents = this.db.prepare('INSERT INTO messages SELECT ?,ordinal,role,time,model,active FROM messages WHERE conversation_id=?');
      const rows = this.store._open().prepare('SELECT id,content_hash,collection,source_file,conversation_key,title,provider FROM conversations ORDER BY id').iterate();
      for (const row of rows) {
        abort(signal);
        if (old.get(row.id)?.content_hash === row.content_hash) { metadata.run(row.collection, row.source_file, row.conversation_key, row.title, row.provider, row.id); reused++; }
        else if (shared.get(row.content_hash)) {
          const source = shared.get(row.content_hash).id; remove.run(row.id);
          copyConversation.run(row.id, row.collection, row.source_file, row.conversation_key, row.title, row.provider, source);
          copyEvents.run(row.id, source); reused++;
        } else {
          const normalized = normalizeActivity(this.store.thread({ id: row.id })); decoded++;
          remove.run(row.id);
          insert.run(row.id, row.content_hash, row.collection, row.source_file, row.conversation_key, row.title, row.provider, normalized.created, Number(normalized.createdEstimated), normalized.updated, normalized.coverage, Number(normalized.branchFallback), Number(normalized.cycle), normalized.duplicateMessages, normalized.branchPoints);
          for (let index = 0; index < normalized.messages.length; index++) {
            if (index && index % 2048 === 0) { await yieldTask(); abort(signal); }
            const message = normalized.messages[index]; event.run(row.id, index, message.role, message.time, message.model, Number(message.active));
          }
        }
        done++; if (done % 20 === 0) { this.onProgress({ phase: 'activity-index', done, current: done, total }); await yieldTask(); }
      }
      abort(signal);
      if (this.store.searchRevision() !== revision) throw new Error('The archive changed while Activity was indexing. Refresh Activity to retry.');
      this.db.exec('DELETE FROM conversations WHERE seen=0');
      this.db.prepare("INSERT OR REPLACE INTO metadata VALUES ('revision',?)").run(revision);
      this.db.exec('COMMIT'); this.stale = false;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    this.stats.indexedConversations = total; this.stats.decodedConversations = decoded; this.stats.reusedConversations = reused;
    await this.persist(revision, { signal }); this.onProgress({ phase: 'activity-ready', done: total, current: total, total });
  }

  async persist(revision, { signal } = {}) {
    abort(signal); const profile = this.currentProfile(), file = `${randomUUID()}${profileExtension(profile)}`, target = path.join(this.root, file);
    try {
      const result = await encodeFile(this.databasePath, target, { profile, maxBytes: MAX_CODEC_FILE_BYTES, signal });
      const manifest = { version: CACHE_VERSION, file, profile, revision, sha256: await sha256(target), logicalBytes: result.expandedBytes, bytes: result.bytes };
      abort(signal);
      const temporary = path.join(this.root, `current-${randomUUID()}.part`); const handle = await fs.open(temporary, 'wx', 0o600);
      try { await handle.writeFile(JSON.stringify(manifest)); await handle.sync(); } finally { await handle.close(); }
      await fs.rename(temporary, path.join(this.root, 'current.json')); this.manifest = manifest;
      for (const name of await fs.readdir(this.root)) if (name !== file && (/^[a-f0-9-]{36}\.(?:7z|zip)$/.test(name) || /^current-[a-f0-9-]{36}\.part$/.test(name))) await fs.rm(path.join(this.root, name), { force: true });
    } catch (error) { if (this.manifest?.file !== file) await fs.rm(target, { force: true }).catch(() => {}); throw error; }
  }

  async setProfile(profile, { signal } = {}) {
    profile = normalizeProfile(profile);
    return this.enqueue(async () => {
      this.profileSource = profile;
      if (this.db) await this.persist(this.db.prepare("SELECT value FROM metadata WHERE key='revision'").get()?.value || '', { signal });
      else { await fs.rm(this.root, { recursive: true, force: true }); this.manifest = null; }
    });
  }

  async report(options, { signal } = {}) {
    abort(signal);
    const zone = options.zone === 'utc' ? 'utc' : 'local', branch = options.branch === 'active' ? 'active' : 'all';
    const metric = ['messages', 'user', 'assistant', 'conversations'].includes(options.metric) ? options.metric : 'messages';
    const bucket = ['daily', 'weekly', 'monthly'].includes(options.bucket) ? options.bucket : 'monthly';
    const clauses = [], parameters = [];
    if (options.collection && options.collection !== 'all') { clauses.push('c.collection=?'); parameters.push(String(options.collection)); }
    if (options.provider && options.provider !== 'all') { clauses.push('c.provider=?'); parameters.push(String(options.provider)); }
    const scope = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
    const active = branch === 'active' ? ' AND m.active=1' : '';
    const events = this.db.prepare(`SELECT role,time,model FROM messages m WHERE m.conversation_id=?${active} ORDER BY ordinal`);
    const years = new Set(), models = new Set(); let earliest = null, latest = null, totalConversations = 0;
    const includeDate = time => { const date = activityDay(time, zone); if (!date) return; years.add(date.slice(0, 4)); if (earliest === null || date < earliest) earliest = date; if (latest === null || date > latest) latest = date; };
    const scopeRows = this.db.prepare(`SELECT c.* FROM conversations c ${scope} ORDER BY c.id`);
    for (const conversation of scopeRows.iterate(...parameters)) {
      abort(signal); totalConversations++; includeDate(conversation.created);
      let checked = 0;
      for (const event of events.iterate(conversation.id)) { includeDate(event.time); if (event.role === 'assistant') models.add(event.model); if (++checked % 2048 === 0) { await yieldTask(); abort(signal); } }
      if (totalConversations % 100 === 0) await yieldTask();
    }
    const yearList = [...years].sort().reverse();
    const { year, start, end } = activityRange(options, { years: yearList, earliest, latest, zone });
    const daily = new Map(), sparse = (Date.parse(end + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / DAY > 36600;
    if (!sparse) for (let time = Date.parse(start + 'T00:00:00Z'), last = Date.parse(end + 'T00:00:00Z'); time <= last; time += DAY) { const date = new Date(time).toISOString().slice(0, 10); daily.set(date, emptyDay(date)); }
    const inRange = date => date !== null && date >= start && date <= end;
    const dayFor = date => { if (!daily.has(date)) daily.set(date, emptyDay(date)); return daily.get(date); };
    const roles = new Map(), modelCounts = new Map(), weekdays = Array(7).fill(0), hours = Array(24).fill(0);
    const coverage = { original: 0, normalized: 0 }, warnings = { branchFallback: 0, cycles: 0, duplicateMessages: 0 };
    let undated = 0, undatedConversations = 0, estimatedStarts = 0, messages = 0, conversations = 0, processed = 0;
    const query = String(options.search || '').trim().toLocaleLowerCase().slice(0, 1024), model = String(options.model || '');
    const drillDate = dateValue(options.date);
    this.db.exec('CREATE TEMP TABLE IF NOT EXISTS activity_query_rows (id TEXT PRIMARY KEY,created INTEGER,last INTEGER,messages INTEGER,value TEXT NOT NULL); DELETE FROM activity_query_rows');
    // Statements for the query table are prepared only after it exists.
    const insertRow = this.db.prepare('INSERT INTO activity_query_rows VALUES (?,?,?,?,?)');
    const modelMatches = this.db.prepare(`SELECT 1 FROM messages m WHERE m.conversation_id=? AND m.model=?${active} LIMIT 1`);
    for (const conversation of scopeRows.iterate(...parameters)) {
      abort(signal);
      if (++processed % 100 === 0) { await yieldTask(); abort(signal); }
      if (query && ![conversation.title, conversation.source_file, conversation.provider].some(value => value.toLocaleLowerCase().includes(query))) continue;
      if (model && !modelMatches.get(conversation.id, model)) continue;
      coverage[conversation.coverage]++; warnings.branchFallback += conversation.branch_fallback; warnings.cycles += conversation.cycle; warnings.duplicateMessages += conversation.duplicate_messages;
      const created = activityDay(conversation.created, zone); let number = 0, user = 0, assistant = 0, last = null, totalMessages = 0, hasDated = false, matchDay = !drillDate || metric === 'conversations' && created === drillDate;
      if (conversation.created === null) undatedConversations++;
      if (inRange(created)) { dayFor(created).conversations++; if (conversation.created_estimated) estimatedStarts++; }
      for (const event of events.iterate(conversation.id)) {
        totalMessages++; if (totalMessages % 2048 === 0) { await yieldTask(); abort(signal); } if (event.time === null) { undated++; continue; }
        hasDated = true; if (last === null || event.time > last) last = event.time;
        const date = activityDay(event.time, zone); if (!inRange(date)) continue;
        if (drillDate === date && (metric === 'messages' || event.role === metric)) matchDay = true;
        const day = dayFor(date); day.messages++; number++;
        if (event.role === 'user') { day.user++; user++; }
        if (event.role === 'assistant') { day.assistant++; assistant++; count(modelCounts, event.model); }
        if (event.role === 'tool') day.tool++;
        count(roles, event.role); const dateTime = new Date(event.time);
        weekdays[zone === 'utc' ? dateTime.getUTCDay() : dateTime.getDay()]++; hours[zone === 'utc' ? dateTime.getUTCHours() : dateTime.getHours()]++;
      }
      messages += number;
      const completelyUndated = !created && !hasDated;
      if (inRange(created) || number > 0 || completelyUndated && year !== 'custom') {
        conversations++;
        if (matchDay) {
          const row = { id: conversation.id, collection: conversation.collection, sourceFile: conversation.source_file, conversationKey: conversation.conversation_key, title: conversation.title, provider: conversation.provider, created: conversation.created, createdEstimated: Boolean(conversation.created_estimated), updated: conversation.updated, last, messages: number, totalMessages, user, assistant, branches: conversation.branch_points, coverage: conversation.coverage, undated: completelyUndated };
          insertRow.run(row.id, row.created, row.last, row.messages, JSON.stringify(row));
        }
      }
    }
    const days = [...daily.values()].sort((a, b) => a.date.localeCompare(b.date));
    let activeDays = 0, longest = 0, streak = 0, previousDate = null, busiest = null, value = 0, started = 0;
    const timeline = new Map();
    for (const day of days) {
      const time = Date.parse(day.date + 'T00:00:00Z'); value += day[metric]; started += day.conversations;
      if (day[metric] > 0) { activeDays++; streak = previousDate !== null && time - previousDate === DAY ? streak + 1 : 1; longest = Math.max(longest, streak); if (!busiest || day[metric] > busiest.count) busiest = { date: day.date, count: day[metric] }; } else streak = 0;
      previousDate = time;
      let key = day.date;
      if (bucket === 'monthly') key = key.slice(0, 7);
      else if (bucket === 'weekly') { const date = new Date(time), weekday = (date.getUTCDay() + 6) % 7; key = new Date(time - weekday * DAY).toISOString().slice(0, 10); }
      count(timeline, key, day[metric]);
    }
    const rowCount = this.db.prepare('SELECT count(*) AS n FROM activity_query_rows').get().n;
    const limit = Math.min(200, Math.max(1, Math.floor(Number(options.limit) || 50))), requestedOffset = Math.max(0, Math.floor(Number(options.offset) || 0));
    const offset = Math.min(requestedOffset, Math.max(0, Math.ceil(rowCount / limit) - 1) * limit);
    const order = options.sort === 'title' ? "json_extract(value,'$.title') COLLATE NOCASE,id" : options.sort === 'messages' ? 'messages DESC,id' : options.sort === 'oldest' ? 'created IS NULL,created,id' : 'coalesce(last,created) IS NULL,coalesce(last,created) DESC,id';
    const rows = this.db.prepare(`SELECT value FROM activity_query_rows ORDER BY ${order} LIMIT ? OFFSET ?`).all(limit, offset).map(row => JSON.parse(row.value));
    this.db.exec('DELETE FROM activity_query_rows'); abort(signal);
    return { version: 1, zone, branch, metric, year, start, end, years: yearList, models: [...models].sort(), daily: days, sparse, summary: { conversations, started, estimatedStarts, messages, value, activeDays, longest, busiest, undated, undatedConversations, totalConversations }, roles: sortedObject(roles), modelCounts: sortedObject(modelCounts), weekdays, hours, bucket, timeline: [...timeline].map(([date, count]) => ({ date, count })), rows, rowCount, offset, limit, coverage, warnings, storage: this.status() };
  }

  close() { return this.enqueue(async () => { this.closed = true; this.db?.close(); this.db = null; if (this.temporary) await fs.rm(this.temporary, { recursive: true, force: true }); this.temporary = null; }); }
  async discard() { await this.close(); const stat = await fs.lstat(this.root).catch(error => { if (error.code === 'ENOENT') return null; throw error; }); if (stat?.isSymbolicLink()) throw new Error('The Activity cache directory has an unsafe type.'); await fs.rm(this.root, { recursive: true, force: true }); }
}

export function activityCSV(report) {
  const escape = value => '"' + String(value ?? '').replace(/^[=+\-@\t\r]/, "'$&").replace(/"/g, '""') + '"';
  return '\uFEFF' + [['date', 'messages_or_stored_turns', 'user', 'assistant', 'tool', 'conversations_started'], ...report.daily.map(day => [day.date, day.messages, day.user, day.assistant, day.tool, day.conversations])].map(row => row.map(escape).join(',')).join('\r\n') + '\r\n';
}
