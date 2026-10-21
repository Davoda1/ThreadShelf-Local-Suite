import manifest from '../package.json' with {type:'json'};
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { dictionaries, locales, translator, localeCode } from '../src/ui/i18n.js';
import { setRendererLocale, tr, readerLocaleCoverage } from '../src/reader/locale.js';
import { validateSettings } from '../src/core/state.mjs';
import { ApplicationService } from '../src/core/service.mjs';

const slots = text => [...String(text).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();

test('Japanese translates every application key with exactly the original substitution slots', () => {
  assert.ok(locales.includes('ja'));
  assert.deepEqual(Object.keys(dictionaries.ja).sort(), Object.keys(dictionaries.en).sort());
  const ja = translator('ja');
  for (const [key, text] of Object.entries(dictionaries.en)) {
    assert.equal(typeof dictionaries.ja[key], 'string', key);
    assert.ok(dictionaries.ja[key].trim(), key + ' must not be blank');
    assert.deepEqual(slots(dictionaries.ja[key]), slots(text), key + ' parameters');
    const values = Object.fromEntries(slots(text).map((name, i) => [name, 'パラメーター' + i]));
    assert.doesNotMatch(ja(key, values), /\{\w+\}/, key + ' unresolved parameters');
  }
  assert.equal(ja('loading'), '読み込み中…');
  assert.equal(ja('settings'), '設定');
  assert.match(ja('countItems', {count: 123}), /123/);
  assert.equal(localeCode('ja'), 'ja-JP');
  assert.equal(localeCode('unknown'), 'en-GB');
  assert.equal(new Intl.DateTimeFormat(localeCode('ja')).resolvedOptions().locale, 'ja-JP');
});

test('Japanese covers every shared Reader control without changing archive text', () => {
  setRendererLocale('ja');
  try {
    for (const key of readerLocaleCoverage) {
      assert.ok(tr(key).trim(), key);
      assert.notEqual(tr(key), key, key + ' must have a Japanese translation');
    }
    assert.equal(tr('Copy'), 'コピー');
    assert.equal(tr('User'), 'ユーザー');
    assert.equal(tr('unchanged conversation text — こんにちは'), 'unchanged conversation text — こんにちは');
  } finally { setRendererLocale('en'); }
});

test('Japanese is accepted and persisted across a real service restart while unknown locales remain rejected', async t => {
  assert.equal(validateSettings({language: 'ja'}).language, 'ja');
  assert.throws(() => validateSettings({language: 'xx'}), /Invalid setting: language/);
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tslr-ja-'));
  let app = await new ApplicationService({dataDir}).init();
  t.after(async () => { await app?.shutdown(); await fs.rm(dataDir, {recursive: true, force: true}); });
  const seeded = await app.store.upsert({provider: 'openai', collection: '日本語', sourceFile: 'japanese.json', conversationKey: 'ja', title: '日本語の会話', turns: [{user: 'Original text — こんにちは世界', turn_index: 0}]});
  const before = app.store.thread({id: seeded.summary.id});
  await app.handle('settings.save', {values: {language: 'ja'}});
  await app.shutdown();app = await new ApplicationService({dataDir}).init();
  const boot = await app.handle('bootstrap');
  assert.equal(boot.settings.language, 'ja');
  assert.equal(boot.version, manifest.version);
  assert.deepEqual(app.store.thread({id: seeded.summary.id}), before);
  await assert.rejects(app.handle('settings.save', {values: {language: 'xx'}}), /Invalid setting: language/);
  assert.equal((await app.handle('bootstrap')).settings.language, 'ja');
});
