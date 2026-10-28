// Authored, non-trained fixture. It tests inference/runtime interoperability,
// tokenization, pooling and truncation; it makes no semantic-quality claim.
import fs from 'node:fs/promises';
import path from 'node:path';

export const SYNTHETIC_MODEL = 'synthetic/threadshelf-encoder';
export const SYNTHETIC_DIMENSION = 4;
export const SYNTHETIC_MAX_TOKENS = 8;
export const SYNTHETIC_TEXTS = Object.freeze([
  'hello world', 'goodbye világ', 'kenyér kert',
  'hello world goodbye kert világ kenyér hello world goodbye', '',
]);
export const SYNTHETIC_VOCAB = Object.freeze({
  '[PAD]': 0, '[UNK]': 1, '[CLS]': 2, '[SEP]': 3, '[MASK]': 4,
  hello: 5, world: 6, goodbye: 7, kert: 8, világ: 9, kenyér: 10,
});
const WEIGHTS = [
  [0, 0, 0, 0], [1, 1, 1, 1], [2, 1, 1, 2], [1, 2, 2, 1],
  [2, 2, 1, 1], [8, 1, 2, 1], [1, 8, 1, 2], [2, 1, 8, 1],
  [1, 2, 1, 8], [2, 6, 1, 2], [6, 2, 3, 1],
];
const SCALE = 0.125;

// Minimal protobuf wire encoder for the explicit ONNX ModelProto below.
// Field numbers follow onnx/onnx.proto; no private runtime schema is imported.
function varint(input) {
  let value = BigInt(input);
  const bytes = [];
  do { bytes.push(Number(value & 127n) | (value > 127n ? 128 : 0)); value >>= 7n; } while (value);
  return Buffer.from(bytes);
}
const integer = (field, value) => Buffer.concat([varint(field << 3), varint(value)]);
const bytes = (field, value) => {
  const data = typeof value === 'string' ? Buffer.from(value) : value;
  return Buffer.concat([varint((field << 3) | 2), varint(data.length), data]);
};
const message = (...fields) => Buffer.concat(fields.flat());
function valueInfo(name, elementType, dimensions) {
  const shape = message(dimensions.map(dimension => bytes(1,
    typeof dimension === 'string' ? bytes(2, dimension) : integer(1, dimension))));
  return message(bytes(1, name), bytes(2, bytes(1, message(integer(1, elementType), bytes(2, shape)))));
}
function initializer(name, elementType, dimensions, data) {
  return message(dimensions.map(dimension => integer(1, dimension)), integer(2, elementType), bytes(8, name), bytes(9, data));
}
function node(op, inputs, output, attributes = {}) {
  return message(inputs.map(input => bytes(1, input)), bytes(2, output), bytes(3, output), bytes(4, op),
    Object.entries(attributes).map(([name, value]) => bytes(5, message(bytes(1, name), integer(3, value), integer(20, 2)))));
}
function float(value) { const data = Buffer.alloc(4); data.writeFloatLE(value); return data; }
function int64(value) { const data = Buffer.alloc(8); data.writeBigInt64LE(BigInt(value)); return data; }

export function createSyntheticModelBytes() {
  // INT8 weights are dequantized then indexed by the BERT token IDs. Attention
  // masking and a zero token-type contribution exercise every declared input.
  const graph = message(
    [
      node('DequantizeLinear', ['weights_q8', 'weight_scale', 'weight_zero'], 'weights'),
      node('Gather', ['weights', 'input_ids'], 'gathered', { axis: 0 }),
      node('Cast', ['attention_mask'], 'attention_float', { to: 1 }),
      node('Unsqueeze', ['attention_float', 'axes'], 'attention_3d'),
      node('Mul', ['gathered', 'attention_3d'], 'masked'),
      node('Cast', ['token_type_ids'], 'types_float', { to: 1 }),
      node('Unsqueeze', ['types_float', 'axes'], 'types_3d'),
      node('Mul', ['types_3d', 'zero'], 'types_zero'),
      node('Add', ['masked', 'types_zero'], 'last_hidden_state'),
    ].map(value => bytes(1, value)),
    bytes(2, 'ThreadShelfSyntheticQuantizedEncoder'),
    [
      initializer('weights_q8', 3, [WEIGHTS.length, SYNTHETIC_DIMENSION], Buffer.from(WEIGHTS.flat())),
      initializer('weight_scale', 1, [], float(SCALE)),
      initializer('weight_zero', 3, [], Buffer.from([0])),
      initializer('axes', 7, [1], int64(2)),
      initializer('zero', 1, [], float(0)),
    ].map(value => bytes(5, value)),
    ['input_ids', 'attention_mask', 'token_type_ids'].map(name => bytes(11, valueInfo(name, 7, ['batch', 'sequence']))),
    bytes(12, valueInfo('last_hidden_state', 1, ['batch', 'sequence', SYNTHETIC_DIMENSION])),
  );
  return message(integer(1, 8), bytes(2, 'ThreadShelf synthetic regression fixture'),
    bytes(3, '1'), bytes(7, graph), bytes(8, message(bytes(1, ''), integer(2, 13))));
}

export function syntheticTokenIds(text, { preserveFinalSeparator = false } = {}) {
  const words = String(text).trim().toLowerCase().split(/\s+/).filter(Boolean);
  const ids = [SYNTHETIC_VOCAB['[CLS]'], ...words.map(word => SYNTHETIC_VOCAB[word] ?? SYNTHETIC_VOCAB['[UNK]']), SYNTHETIC_VOCAB['[SEP]']];
  // Existing Transformers truncation slices the complete sequence, whereas
  // search-wasm.mjs explicitly retains SEP. Keep those established contracts
  // distinct for long-input tests rather than asserting artificial parity.
  return preserveFinalSeparator && ids.length > SYNTHETIC_MAX_TOKENS
    ? [...ids.slice(0, SYNTHETIC_MAX_TOKENS - 1), ids.at(-1)]
    : ids.slice(0, SYNTHETIC_MAX_TOKENS);
}
export function expectedSyntheticHiddenState(ids, attention = ids.map(() => 1)) {
  return ids.flatMap((id, index) => WEIGHTS[id].map(value => value * SCALE * attention[index]));
}
export function expectedSyntheticEmbedding(text, options) {
  const ids = syntheticTokenIds(text, options);
  const mean = Array.from({ length: SYNTHETIC_DIMENSION }, (_, column) => ids.reduce((sum, id) => sum + WEIGHTS[id][column] * SCALE, 0) / ids.length);
  const norm = Math.hypot(...mean);
  return mean.map(value => value / norm);
}

export async function writeSyntheticEmbeddingModel(cacheDir) {
  const modelDir = path.join(cacheDir, SYNTHETIC_MODEL);
  const modelBytes = createSyntheticModelBytes();
  await fs.mkdir(path.join(modelDir, 'onnx'), { recursive: true });
  const specialTokens = ['[PAD]', '[UNK]', '[CLS]', '[SEP]', '[MASK]'];
  const configuration = { model_type: 'bert', architectures: ['BertModel'], hidden_size: SYNTHETIC_DIMENSION,
    vocab_size: WEIGHTS.length, max_position_embeddings: SYNTHETIC_MAX_TOKENS, num_attention_heads: 1, num_hidden_layers: 1 };
  const tokenizer = { version: '1.0', truncation: null, padding: null,
    added_tokens: specialTokens.map(content => ({ id: SYNTHETIC_VOCAB[content], content, single_word: false, lstrip: false, rstrip: false, normalized: false, special: true })),
    normalizer: { type: 'BertNormalizer', clean_text: true, handle_chinese_chars: true, strip_accents: false, lowercase: true },
    pre_tokenizer: { type: 'BertPreTokenizer' },
    post_processor: { type: 'BertProcessing', sep: ['[SEP]', 3], cls: ['[CLS]', 2] },
    decoder: { type: 'WordPiece', prefix: '##', cleanup: true },
    model: { type: 'WordPiece', unk_token: '[UNK]', continuing_subword_prefix: '##', max_input_chars_per_word: 100, vocab: SYNTHETIC_VOCAB } };
  const tokenizerConfiguration = { tokenizer_class: 'BertTokenizer', model_max_length: SYNTHETIC_MAX_TOKENS,
    do_lower_case: true, strip_accents: false, unk_token: '[UNK]', sep_token: '[SEP]', pad_token: '[PAD]', cls_token: '[CLS]', mask_token: '[MASK]' };
  await Promise.all([
    fs.writeFile(path.join(modelDir, 'config.json'), JSON.stringify(configuration)),
    fs.writeFile(path.join(modelDir, 'tokenizer.json'), JSON.stringify(tokenizer)),
    fs.writeFile(path.join(modelDir, 'tokenizer_config.json'), JSON.stringify(tokenizerConfiguration)),
    fs.writeFile(path.join(modelDir, 'onnx/model_quantized.onnx'), modelBytes),
  ]);
  return { model: SYNTHETIC_MODEL, modelDir, modelBytes, dimension: SYNTHETIC_DIMENSION };
}
