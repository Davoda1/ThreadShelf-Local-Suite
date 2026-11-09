import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import sharp from 'sharp';
import { ResourceContexts } from '../src/core/resource-contexts.mjs';
import { ResourceCache } from '../src/core/resource-cache.mjs';

const url = name => `https://images.example.test/${name}.png`;
const card = (id, name = id) => ({ id, cardType: 'image_card', card: { image: { original: url(name), link: url(`${name}-source`) } } });
const render = (id, family = 'image_card') => `<grok:render card_id="${id}" card_type="${family}"/>`;
function archive(source, cards, extra = {}) {
  return { id: 'grok', title: 'Grok resource fixture', turns: [{ ai: source, source_message_id: 'message-a' }], raw: { responses: [{ response: { id: 'message-a', cardAttachmentsJson: cards.map(value => JSON.stringify(value)) } }] }, ...extra };
}
function register(value) {
  const contexts = new ResourceContexts(), ref = { mode: 'local', id: value.id };
  contexts.register(value, ref);
  const token = contexts.token(ref).contextToken;
  return destination => contexts.owner(token, destination);
}

test('Grok metadata-only images authorize only displayed cards from the exact source message', () => {
  const value = archive(`${render('shown')}\n${render('citation', 'citation_card')}\n${render('file', 'rendered_file_card')}`, [
    card('shown'), card('unused'),
    { id: 'citation', cardType: 'citation_card', card: { url: url('citation') } },
    { id: 'file', cardType: 'rendered_file_card', card: { url: url('file') } },
  ]);
  value.raw.responses.push({ response: { id: 'message-b', cardAttachmentsJson: [JSON.stringify(card('shown', 'other-message'))] } });
  const original = structuredClone(value), owner = register(value);
  assert.equal(owner(url('shown')).title, value.title);
  for (const name of ['unused', 'shown-source', 'citation', 'file', 'other-message', 'unrelated']) assert.throws(() => owner(url(name)), /not authorized/);
  assert.deepEqual(value, original);
});

test('Grok per-turn object containers do not authorize unused cards or source links', () => {
  const value = archive(render('shown'), []);
  value.turns[0].cardAttachments = [card('shown'), card('unused'), { id: 'citation', card: { url: url('citation') } }];
  const owner = register(value);
  assert.doesNotThrow(() => owner(url('shown')));
  for (const name of ['unused', 'shown-source', 'citation']) assert.throws(() => owner(url(name)), /not authorized/);
});

test('Grok generated galleries, explicit image tags and Markdown artifacts share image authorization', () => {
  const generated = { id: 'generated', cardType: 'generated_image_card', card: { image_chunk: { imageUrl: url('generated') } } };
  const source = `<box>\n  <grok-generated-images data-id="original,generated,citation"/>\n</box>\n\n<image-card src="${url('direct')}"/>\n\n<xaiArtifact contentType="text/markdown">![Artifact](${url('artifact')})</xaiArtifact>`;
  const owner = register(archive(source, [card('original'), generated, { id: 'citation', cardType: 'citation_card', card: { url: url('citation') } }]));
  for (const name of ['original', 'generated', 'direct', 'artifact']) assert.doesNotThrow(() => owner(url(name)), name);
  assert.throws(() => owner(url('citation')), /not authorized/);
});

test('Grok image markup in code, mathematics, raw HTML or literal bindings grants no authority', () => {
  const markup = render('hidden');
  for (const source of [
    `\`${markup}\``, `\`\`\`xml\n${markup}\n\`\`\``, `$$${markup}$$`,
    `<script>${markup}</script>`, `<box>{${JSON.stringify(markup)}}</box>`,
    '<grok:render card_id="hidden" card_type="image_card">',
    '<grok:render card_id="hidden" card_id="hidden" card_type="image_card"/>',
    render('hidden', 'unknown_card'),
  ]) assert.throws(() => register(archive(source, [card('hidden')]))(url('hidden')), /not authorized/, source);
});

test('Grok conflicting cards, missing bindings and malformed URL metadata fail closed', () => {
  const duplicate = archive(render('shown'), [card('shown'), card('shown', 'conflict')]);
  for (const name of ['shown', 'conflict']) assert.throws(() => register(duplicate)(url(name)), /not authorized/);
  const unbound = archive(render('shown'), [card('shown')]); delete unbound.turns[0].source_message_id;
  assert.throws(() => register(unbound)(url('shown')), /not authorized/);
  const duplicateMessage = archive(render('shown'), [card('shown')]); duplicateMessage.raw.responses.push(duplicateMessage.raw.responses[0]);
  assert.throws(() => register(duplicateMessage)(url('shown')), /not authorized/);
  const malformed = archive(render('shown'), [{ id: 'shown', cardType: 'image_card', card: { url: 'https://user:secret@images.example.test/shown.png' } }]);
  assert.throws(() => register(malformed)(url('shown')), /not authorized/);
});

test('Grok authorized image metadata still passes the existing reserved-address network policy', async t => {
  const owner = register(archive(render('shown'), [card('shown')]));
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'threadshelf-grok-resource-'));
  let requested = false;
  const cache = await new ResourceCache({ dataDir: directory, lookup: async () => [{ address: '169.254.169.254', family: 4 }], request: () => { requested = true; throw new Error('Network must not be reached'); } }).init();
  t.after(async () => { await cache.close(); await fs.rm(directory, { recursive: true, force: true }); });
  await assert.rejects(cache.load({ url: url('shown'), conversation: owner(url('shown')) }), /address|reserved|not allowed|blocked/i);
  assert.equal(requested, false);
});

test('a metadata-only Grok image loads through the resource cache and HTTP transport', async t => {
  const png = await sharp({ create: { width: 2, height: 2, channels: 4, background: '#4080c0ff' } }).png().toBuffer();
  let requests = 0;
  const server = http.createServer((request, response) => {
    requests++;
    assert.equal(request.url, '/saved.png');
    response.writeHead(200, { 'content-type': 'image/png', 'content-length': png.length }); response.end(png);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const destination = 'http://images.example.test/saved.png';
  const owner = register(archive(render('saved'), [{ id: 'saved', cardType: 'image_card', card: { image: { original: destination } } }]));
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'threadshelf-grok-load-'));
  // Keep the public address policy active. The fixture alone maps its checked
  // public destination to a real local HTTP server, without external requests.
  const cache = await new ResourceCache({ dataDir: directory,
    lookup: async () => [{ address: '93.184.216.34', family: 4 }],
    request: (address, options, callback) => {
      assert.equal(address.href, destination);
      options.lookup(address.hostname, { all: true }, (error, pinned) => {
        assert.equal(error, null); assert.deepEqual(pinned, [{ address: '93.184.216.34', family: 4 }]);
      });
      return http.request(`http://127.0.0.1:${server.address().port}${address.pathname}`, options, callback);
    },
  }).init();
  t.after(async () => { await cache.close(); await fs.rm(directory, { recursive: true, force: true }); });
  const loaded = await cache.load({ url: destination, conversation: owner(destination) });
  assert.equal(requests, 1); assert.equal(loaded.cached, false); assert.equal(loaded.stored, false);
  assert.deepEqual(Buffer.from(loaded.dataUrl.split(',')[1], 'base64'), png);
  assert.throws(() => owner(destination.replace('saved.png', 'unrelated.png')), /not authorized/);
});
