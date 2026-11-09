// Bound decoded fetch bodies before buffering/JSON parsing. Content-Length is
// only an early rejection hint: compressed/chunked responses need a live bound.
export async function boundedResponseText(response, maxBytes, label = 'Service') {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new TypeError('Invalid response size limit.');
  const tooLarge = () => new Error(`${label} response exceeds its ${Math.ceil(maxBytes / 1024 / 1024)} MiB safety limit.`);
  if (Number(response.headers.get('content-length')) > maxBytes) {
    await response.body?.cancel().catch(() => {});
    throw tooLarge();
  }
  if (!response.body) return '';
  const reader = response.body.getReader(), parts = [];
  let bytes = 0, complete = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) { complete = true; break; }
      bytes += value.byteLength;
      if (bytes > maxBytes) throw tooLarge();
      parts.push(value);
    }
    return Buffer.concat(parts, bytes).toString('utf8');
  } finally {
    if (!complete) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
