/** Bounded read-ahead preserves source order while independent server reads overlap.
 * Writes stay with the single archive coordinator; rejected reads are observed
 * immediately and unfinished reads are drained before the caller closes. */
export async function* orderedPrefetch(items, load, { concurrency = 3, signal } = {}) {
  const width = Math.max(1, Math.min(4, Math.trunc(concurrency) || 1));
  const pending = new Map();
  let next = 0;
  const fill = () => {
    while (next < items.length && pending.size < width && !signal?.aborted) {
      const index = next++;
      pending.set(index, Promise.resolve().then(() => {
        signal?.throwIfAborted();
        return load(items[index], index);
      }).then(value => ({ value }), error => ({ error })));
    }
  };
  fill();
  try {
    for (let index = 0; index < items.length; index++) {
      signal?.throwIfAborted();
      const outcome = await pending.get(index);
      pending.delete(index);
      signal?.throwIfAborted();
      fill();
      yield { item: items[index], index, ...outcome };
    }
  } finally {
    await Promise.all(pending.values());
  }
}
