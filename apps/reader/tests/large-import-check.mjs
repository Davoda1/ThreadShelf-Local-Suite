/** Opt-in ~210 MiB synthetic import+SQLite smoke. Run: node tests/large-import-check.mjs [report.json]
 * No user exports are read. The temporary source/database are removed after the run.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { importPaths } from '../src/core/importers.mjs';
import { ArchiveStore } from '../src/core/archive.mjs';
const targetBytes = 210 * 1024 ** 2;
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'threadshelf-large-synthetic-'));
const filename = path.join(directory, 'conversations.json');
const started = performance.now();
let sourceBytes = 1, conversations = 0, maxRSS = process.memoryUsage().rss, store;
const sample = 'Synthetic archival passage with Unicode Árvíztűrő 日本語 and reproducible search terms. ';
const sampleMemory = () => { maxRSS = Math.max(maxRSS, process.memoryUsage().rss); };
function conversation(index) {
  const mapping = { root: { id: 'root', parent: null, message: null } };
  for (let n = 0; n < 48; n++) {
    const id = 'node-' + n;
    mapping[id] = { id, parent: n ? 'node-' + (n - 1) : 'root', message: {
      id: `message-${index}-${n}`, author: { role: n % 2 ? 'assistant' : 'user' },
      create_time: 1780000000 + index * 100 + n,
      content: { content_type: 'text', parts: [`Conversation ${index}, message ${n}.\n` + sample.repeat(42)] },
    } };
  }
  return { id: 'synthetic-large-' + index, title: 'Synthetic large archive ' + index, current_node: 'node-47', mapping };
}
try {
  const output = await fs.open(filename, 'w');
  try {
    await output.write('[');
    while (sourceBytes < targetBytes) {
      const text = (conversations ? ',\n' : '') + JSON.stringify(conversation(conversations));
      await output.write(text); sourceBytes += Buffer.byteLength(text); conversations++;
    }
    await output.write(']'); sourceBytes++;
  } finally { await output.close(); }
  console.log(JSON.stringify({ phase: 'generated', sourceBytes, conversations }));
  store = new ArchiveStore(path.join(directory, 'data'));
  await store.init();
  const durations = [], outcomes = [];
  for (let pass = 0; pass < 2; pass++) {
    const passStart = performance.now(), counts = { imported: 0, updated: 0, skipped: 0, errors: 0 };
    let seen = 0;
    for await (const record of importPaths([filename])) {
      if (record.error) { counts.errors++; throw new Error(record.error); }
      const result = await store.upsert(record); counts[result.status]++;
      if (++seen % 100 === 0) { sampleMemory(); console.log(JSON.stringify({ phase: pass ? 'reimport' : 'import', current: seen, total: conversations })); }
    }
    sampleMemory(); outcomes.push(counts); durations.push(Math.round(performance.now() - passStart));
    assert.equal(seen, conversations); assert.equal(counts.errors, 0);
    assert.equal(pass ? counts.skipped : counts.imported, conversations);
  }
  const collections = await store.collections();
  assert.equal(collections.reduce((n, collection) => n + collection.count, 0), conversations);
  const page = await store.files({ page: 1, pageSize: 1 });
  const first = await store.thread({ id: page.files[0].id });
  assert.equal(first.turns.length, 48); assert.equal(first.turns[0].turn_index, 1); assert.equal(first.turns.at(-1).turn_index, 48);
  assert.ok(first.raw.mapping.root); assert.match(first.turns[0].user, /Árvíztűrő 日本語/);
  const report = { status: 'PASS', syntheticOnly: true, runtime: process.version, platform: process.platform, arch: process.arch,
    sourceBytes, sourceMiB: +(sourceBytes / 1024 ** 2).toFixed(2), conversations, turns: conversations * 48,
    firstImportMs: durations[0], reimportMs: durations[1], totalElapsedMs: Math.round(performance.now() - started),
    peakSampledRSSMiB: +(maxRSS / 1024 ** 2).toFixed(2), outcomes,
    assertions: ['All generated conversations imported through importPaths and ArchiveStore', 'Exact reimport skipped all records without duplicates', 'Source indexes, raw mapping and Unicode text retained'], temporaryInputsRemoved: true };
  if (process.argv[2]) await fs.writeFile(path.resolve(process.argv[2]), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (store) await store.close();
  await fs.rm(directory, { recursive: true, force: true });
}
