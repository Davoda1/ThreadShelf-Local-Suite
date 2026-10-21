// Model inference is isolated so cancellation can stop downloads and CPU inference.
import { parentPort, workerData } from 'node:worker_threads';

let extractor;
let lastProgress = 0;
async function loadWasm(allowRemote) {
  const { createWasmExtractor } = await import('./search-wasm.mjs');
  extractor = await createWasmExtractor({ ...workerData, allowRemote,
    onProgress: progress => parentPort.postMessage({ event: 'progress', progress }) });
}
async function load(allowRemote) {
  if (extractor) return;
  if (workerData.backend === 'wasm') return loadWasm(allowRemote);
  let transformers;
  try { transformers = await import('@huggingface/transformers'); }
  catch (error) {
    if (error.code === 'ERR_DLOPEN_FAILED' || /onnxruntime|dll|shared object|vcruntime|msvcp140|sharp.*win32/i.test(error.message)) {
      parentPort.postMessage({ event: 'progress', progress: { phase: 'loading', message: 'Using the portable CPU search engine.' } });
      return loadWasm(allowRemote);
    }
    throw error;
  }
  const { env, pipeline } = transformers;
  env.cacheDir = workerData.cacheDir;
  env.useFSCache = true;
  env.useBrowserCache = false;
  env.allowLocalModels = true;
  env.localModelPath = workerData.cacheDir + '/';
  env.allowRemoteModels = allowRemote;
  extractor = await pipeline('feature-extraction', workerData.model, {
    dtype: 'q8', device: 'cpu', cache_dir: workerData.cacheDir,
    local_files_only: !allowRemote,
    progress_callback(info) {
      const downloading = info.status === 'progress' || info.status === 'progress_total';
      if (downloading && Date.now() - lastProgress < 80 && info.progress !== 100) return;
      if (downloading) lastProgress = Date.now();
      const message = downloading
        ? `${allowRemote ? 'Preparing' : 'Loading cached'} multilingual model (${Math.round(info.progress ?? 0)}%).`
        : info.status === 'ready' ? 'Model loaded; checking embeddings.' : `Loading ${info.file ?? 'multilingual model'}…`;
      parentPort.postMessage({ event: 'progress', progress: {
        phase: downloading ? 'download' : 'loading',
        current: info.loaded, total: info.total,
        message,
      } });
    },
  });
  // Once setup has completed, inference never fetches a model or tokenizer.
  env.allowRemoteModels = false;
}

parentPort.on('message', async ({ id, operation, texts }) => {
  try {
    if (operation === 'setup') {
      await load(true);
      const probe = await extractor('Search model readiness check.', { pooling: 'mean', normalize: true });
      if (!probe.data?.length) throw new Error('The downloaded model did not return an embedding.');
      parentPort.postMessage({ id, result: { dimension: probe.data.length } });
    } else if (operation === 'embed') {
      await load(false);
      const out = await extractor(texts, { pooling: 'mean', normalize: true });
      const values = Array.from(out.data);
      const dimension = values.length / texts.length;
      if (!Number.isInteger(dimension) || dimension < 1) throw new Error('Invalid embedding dimensions.');
      parentPort.postMessage({ id, result: texts.map((_, index) => values.slice(index * dimension, (index + 1) * dimension)) });
    } else throw new Error('Unknown model worker operation.');
  } catch (error) {
    parentPort.postMessage({ id, error: { message: error.message, name: error.name } });
  }
});
