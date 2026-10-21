/** Pure Venice v4/Dexie v1 assembly. Adapted from Reader 3.1.0's MIT parser.
 * Input members have already been read and verified by the read-only source layer.
 * No filesystem, database, decryption, restoration, or profile lifecycle is used. */
import { isDeepStrictEqual } from 'node:util';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const cancelled = signal => { if (signal?.aborted) throw new DOMException('Import cancelled.', 'AbortError'); };
export const isVeniceBackupManifest = value => object(value)&&value.backupVersion===4&&typeof value.encrypted==='boolean'&&Number.isSafeInteger(value.chunkCount)&&value.chunkCount>=0&&(typeof value.databaseVersion==='number'||typeof value.databaseVersion==='string')&&typeof value.ownerId==='string';
export const isVeniceDexieChunk = value => object(value)&&value.formatName==='dexie'&&value.formatVersion===1&&object(value.data)&&Object.hasOwn(value.data,'databaseVersion')&&Array.isArray(value.data.data)&&value.data.data.every(block=>object(block)&&typeof block.tableName==='string'&&block.inbound===true&&Array.isArray(block.rows));

function plainRow(raw) {
  const result = structuredClone(raw), types = result.$types ?? {};
  delete result.$types;
  if (!object(types)) throw new Error('Unsupported Dexie type annotations.');
  for (const [keyPath, kind] of Object.entries(types)) {
    if (kind === 'arrayNonindexKeys') continue;
    if (kind !== 'undef') throw new Error('Unsupported Dexie chat value type; use the console JSON export.');
    const pieces = keyPath.split('.'); let target = result;
    for (const piece of pieces.slice(0, -1)) target = object(target) || Array.isArray(target) ? Object.hasOwn(target, piece) ? target[piece] : null : null;
    const last = pieces.at(-1);
    if (Array.isArray(target) && /^\d+$/.test(last) && Number(last) < target.length) target[Number(last)] = null;
    else if (object(target)) delete target[last];
  }
  return result;
}

export function assembleVeniceBackup(parts, { signal, limits = {} } = {}) {
  let manifest = null; const chunks = new Map(), media = new Map();
  for (const part of parts) {
    cancelled(signal);
    if (part.manifest) {
      const current = part.manifest;
      if (!object(current) || current.backupVersion !== 4) throw new Error('Unsupported Venice backup manifest version (expected 4).');
      if (current.encrypted !== false) throw new Error("Venice encrypted backups are unsupported; export with Don't encrypt this backup.");
      if (manifest && !isDeepStrictEqual(manifest, current)) throw new Error('Selected Venice ZIP parts belong to different backups.');
      manifest = current;
    }
    for (const member of part.members) {
      const match = /^db\/chunk-(0|[1-9][0-9]*)\.json$/.exec(member.name);
      if (match) {
        const index = Number(match[1]);
        if (!Number.isSafeInteger(index) || chunks.has(index)) throw new Error('Duplicate or invalid Venice database chunk.');
        chunks.set(index, member.value);
      } else if (member.name !== 'manifest.json' && !/(?:^|\/)(?:settings|preferences|bookmarks|reading(?:-v2)?|activity|vectors|cookies|credentials|accounts?|profiles?|sessions?|logs?|crash|cache)(?:[.\/]|$)/i.test(member.name)) media.set(member.name,{name:member.name,sizeBytes:Number.isSafeInteger(member.sizeBytes)&&member.sizeBytes>=0?member.sizeBytes:null,compressedSizeBytes:Number.isSafeInteger(member.compressedSizeBytes)&&member.compressedSizeBytes>=0?member.compressedSizeBytes:null,kind:'archive member; no conversation association established',bytesOpened:false});
    }
  }
  if (!manifest) throw new Error('Missing Venice manifest.json; select every complete ZIP part together.');
  const count = manifest.chunkCount;
  if (!Number.isInteger(count) || count < 0 || count > (limits.entries ?? 100000)) throw new Error('Invalid Venice manifest chunkCount.');
  const missing = Array.from({ length: count }, (_, index) => index).filter(index => !chunks.has(index));
  const extra = [...chunks.keys()].filter(index => index >= count);
  if (missing.length || extra.length) throw new Error(`Incomplete/inconsistent Venice backup: ${missing.length} missing chunks; ${extra.length} unexpected chunks. Select all parts together.`);
  const tables = new Map(); let rowCount = 0;
  for (let index = 0; index < count; index++) {
    cancelled(signal); const chunk = chunks.get(index);
    if (!object(chunk) || chunk.formatName !== 'dexie' || chunk.formatVersion !== 1 || !object(chunk.data) || !Array.isArray(chunk.data.data)) throw new Error('Unsupported or invalid Dexie v1 chunk.');
    if (String(chunk.data.databaseVersion) !== String(manifest.databaseVersion)) throw new Error('Venice database version mismatch.');
    for (const block of chunk.data.data) {
      if (!object(block) || typeof block.tableName !== 'string' || !Array.isArray(block.rows) || block.inbound !== true || !block.rows.every(object)) throw new Error('Invalid or unsupported Dexie table encoding.');
      rowCount += block.rows.length;
      if (rowCount > (limits.records ?? 2000000)) throw new Error('Venice backup exceeds the database row limit.');
      if (!tables.has(block.tableName)) tables.set(block.tableName, []);
      for (const row of block.rows) tables.get(block.tableName).push(row);
    }
  }
  const conversations = new Map(), owners = new Map(), seenMessages = new Set();
  for (const raw of tables.get('conversations') ?? []) {
    cancelled(signal); const conversation = plainRow(raw), id = conversation.id;
    if (typeof id !== 'string' || !id || conversations.has(id) || Object.hasOwn(conversation, 'messages')) throw new Error('Missing, duplicate, or ambiguous Venice conversation.');
    conversation.messages = []; conversations.set(id, conversation);
    const owner = Object.hasOwn(conversation, 'ownerId') ? conversation.ownerId : manifest.ownerId;
    if (typeof owner !== 'string') throw new Error('Invalid Venice owner ID.');
    if (!owners.has(owner)) owners.set(owner, { ownerId: owner, conversations: [] });
    owners.get(owner).conversations.push(conversation);
  }
  for (const raw of tables.get('messages') ?? []) {
    cancelled(signal); const message = plainRow(raw);
    if (typeof message.id !== 'string' || !message.id || seenMessages.has(message.id)) throw new Error('Missing or duplicate Venice message ID.');
    if (typeof message.conversationId !== 'string' || !conversations.has(message.conversationId)) throw new Error('Venice messages lack their conversation; select every part.');
    seenMessages.add(message.id); conversations.get(message.conversationId).messages.push(message);
  }
  const stamp = message => ['number', 'bigint'].includes(typeof message.createdAtUnixTimestamp) ? Number(message.createdAtUnixTimestamp) : 0;
  for (const conversation of conversations.values()) conversation.messages.sort((a, b) => stamp(a) - stamp(b));
  return {
    format: 'venice-chat-history', formatVersion: 1, exportedAt: manifest.createdAt,
    source: { allStoredMessageVariantsIncluded: true, provenance: 'venice-v4-dexie-v1-backup' },
    owners: [...owners.values()],
    veniceBackup: { manifest:{backupVersion:manifest.backupVersion,encrypted:manifest.encrypted,chunkCount:manifest.chunkCount,databaseVersion:manifest.databaseVersion,createdAt:manifest.createdAt??null}, mediaArchivePaths:[...media.keys()].sort(),mediaMembers:[...media.values()].sort((a,b)=>a.name.localeCompare(b.name)), mediaBytesEmbedded: false, retainedTables:['conversations','messages'] },
  };
}
