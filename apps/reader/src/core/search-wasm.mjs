// CPU fallback for computers whose optional native ONNX binding cannot load.
// It uses the identical q8 model and pooling, with no VC++ runtime dependency.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
async function modelFile(cacheDir, model, filename, allowRemote, progress) {
  const target = path.join(cacheDir, model, filename);
  if (fs.existsSync(target) && fs.statSync(target).size > 0) return target;
  if (!allowRemote) throw new Error(`Cached semantic model file is missing: ${filename}. Run semantic model setup again.`);
  progress({ phase: 'download', message: `Downloading ${filename} for the multilingual model.` });
  const response = await fetch(`https://huggingface.co/${model}/resolve/main/${filename}`);
  if (!response.ok || !response.body) throw new Error(`Model download failed for ${filename}: HTTP ${response.status}.`);
  const total = Number(response.headers.get('content-length')) || undefined;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp.${randomUUID()}`, fd = fs.openSync(temporary, 'wx');
  let loaded = 0, lastProgress = 0, success = false;
  try {
    for await (const chunk of response.body) {
      loaded += chunk.length;
      if (loaded > 512 * 1024 * 1024) throw new Error('The model file exceeds its supported size.');
      fs.writeSync(fd, chunk);
      if (Date.now() - lastProgress > 100) {
        lastProgress = Date.now();
        progress({ phase: 'download', current: loaded, total, message: `Downloading ${filename}.` });
      }
    }
    if (total && loaded !== total) throw new Error(`Incomplete model download for ${filename}.`);
    success = true;
  } finally {
    fs.closeSync(fd);
    if (!success) fs.rmSync(temporary, { force: true });
  }
  fs.renameSync(temporary, target);
  return target;
}

export async function createWasmExtractor({ cacheDir, model, allowRemote = false, onProgress = () => {} }) {
  const [ort, { Tokenizer }] = await Promise.all([import('onnxruntime-web'), import('@huggingface/tokenizers')]);
  const files = {};
  for (const filename of ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'onnx/model_quantized.onnx']) {
    files[filename] = await modelFile(cacheDir, model, filename, allowRemote, onProgress);
  }
  const configuration = JSON.parse(fs.readFileSync(files['config.json'], 'utf8'));
  const tokenizer = new Tokenizer(JSON.parse(fs.readFileSync(files['tokenizer.json'], 'utf8')),
    JSON.parse(fs.readFileSync(files['tokenizer_config.json'], 'utf8')));
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  ort.env.wasm.wasmPaths = path.dirname(require.resolve('onnxruntime-web')) + path.sep;
  onProgress({ phase: 'loading', message: 'Loading the portable CPU search engine.' });
  const session = await ort.InferenceSession.create(fs.readFileSync(files['onnx/model_quantized.onnx']), {
    executionProviders: ['wasm'], graphOptimizationLevel: 'all',
  });
  return async function extract(input) {
    const texts = Array.isArray(input) ? input : [input], vectors = [];
    for (const text of texts) {
      const encoded = tokenizer.encode(text, { add_special_tokens: true, return_token_type_ids: true });
      const maximum = Math.min(512, configuration.max_position_embeddings ?? 512);
      let ids = encoded.ids, attention = encoded.attention_mask, types = encoded.token_type_ids ?? ids.map(() => 0);
      if (ids.length > maximum) {
        ids = [...ids.slice(0, maximum - 1), ids.at(-1)];
        attention = attention.slice(0, maximum); types = types.slice(0, maximum);
      }
      const values = { input_ids: ids, attention_mask: attention, token_type_ids: types }, feeds = {};
      for (const name of session.inputNames) {
        if (!values[name]) throw new Error(`Unsupported embedding model input: ${name}.`);
        feeds[name] = new ort.Tensor('int64', BigInt64Array.from(values[name], BigInt), [1, ids.length]);
      }
      const output = await session.run(feeds);
      const hidden = output.last_hidden_state ?? output[session.outputNames[0]];
      if (!hidden || hidden.dims.length !== 3) throw new Error('The portable model returned an unexpected tensor shape.');
      const dimension = hidden.dims[2], pooled = new Float32Array(dimension);
      let count = 0;
      for (let token = 0; token < hidden.dims[1]; token++) {
        if (!attention[token]) continue;
        count++;
        for (let d = 0; d < dimension; d++) pooled[d] += hidden.data[token * dimension + d];
      }
      const norm = Math.sqrt(pooled.reduce((sum, value) => sum + (value / count) ** 2, 0));
      for (let d = 0; d < dimension; d++) pooled[d] = pooled[d] / count / norm;
      vectors.push(pooled);
      for (const tensor of Object.values(output)) tensor.dispose?.();
      for (const tensor of Object.values(feeds)) tensor.dispose?.();
    }
    return { data: Float32Array.from(vectors.flatMap(vector => Array.from(vector))), dims: [vectors.length, vectors[0]?.length ?? 0] };
  };
}
