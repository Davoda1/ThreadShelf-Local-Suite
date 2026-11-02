import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import merge from 'deepmerge';
import {merge as parserMerge} from './node_modules/date-holidays-parser/src/utils.js';

const require = createRequire(import.meta.url);

function assertSafe(value) {
  if (!value || typeof value !== 'object') return;
  assert.equal(value.polluted, undefined);
  if (!Array.isArray(value)) assert.equal(Object.getPrototypeOf(value), Object.prototype);
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    assert.equal(Object.hasOwn(value, key), false, `unsafe key ${key}`);
  }
  for (const child of Object.values(value)) assertSafe(child);
}

test('the holiday parser resolves the reviewed local merge adapter', () => {
  const parserRequire = createRequire(require.resolve('date-holidays-parser'));
  assert.equal(parserRequire.resolve('deepmerge'), require.resolve('deepmerge'));
  assert.equal(require('deepmerge/package.json').name, '@threadshelf/holiday-merge');
  assert.equal(require('@fastify/deepmerge/package.json').version, '3.2.4');
});

test('merge preserves holiday rule nesting, array concatenation and input immutability', () => {
  const left = {name: {en: 'First'}, dates: [{day: 1}], flags: {observed: true}};
  const right = {name: {de: 'Zweite'}, dates: [{day: 2}], flags: {observed: false}};
  const before = JSON.stringify([left, right]);
  const result = parserMerge(left, right, {name: {en: 'Second'}});
  assert.deepEqual(result, {
    name: {en: 'Second', de: 'Zweite'}, dates: [{day: 1}, {day: 2}], flags: {observed: false}
  });
  result.dates[0].day = 9;
  result.name.en = 'Changed';
  assert.equal(JSON.stringify([left, right]), before);
  assert.deepEqual(merge.all([]), {});
  assert.throws(() => merge.all({}), TypeError);
});

test('prototype keys are discarded from merge sources, targets and cloned nested arrays', () => {
  const payload = () => JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"prototype":{"polluted":true},"safe":{"value":1}}');
  for (const result of [
    merge(payload(), {}), merge({}, payload()), merge(payload(), payload()),
    merge({nested: payload(), entries: [payload()]}, {valid: true}),
    merge({}, {nested: payload(), entries: [payload()]}),
    parserMerge(payload(), {nested: payload()}, {entries: [payload()]})
  ]) {
    assertSafe(result);
    assert.equal(Object.prototype.polluted, undefined);
  }
  const nullPrototype = Object.assign(Object.create(null), payload());
  assertSafe(merge(nullPrototype, payload()));
  assertSafe(merge({}, nullPrototype));
});
