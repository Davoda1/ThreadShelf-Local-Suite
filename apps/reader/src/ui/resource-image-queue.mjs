// Bound bridge traffic independently of how many images a conversation mounts.
// Waiting work belongs to its image controller and is discarded on cancellation.
const cancelled = () => new DOMException('Image request cancelled', 'AbortError');

export function createResourceImageQueue(concurrency = 4) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 64) throw new RangeError('Invalid image concurrency.');
  const pending = [];
  let active = 0;
  function drain() {
    while (active < concurrency && pending.length) {
      const job = pending.shift();
      job.signal?.removeEventListener('abort', job.abort);
      if (job.signal?.aborted) { job.reject(cancelled()); continue; }
      active++;
      Promise.resolve().then(() => {
        if (job.signal?.aborted) throw cancelled();
        return job.task();
      }).then(job.resolve, job.reject).finally(() => { active--; drain(); });
    }
  }
  return function enqueue(task, { signal } = {}) {
    if (signal?.aborted) return Promise.reject(cancelled());
    return new Promise((resolve, reject) => {
      const job = { task, signal, resolve, reject, abort: null };
      job.abort = () => {
        const index = pending.indexOf(job);
        if (index < 0) return;
        pending.splice(index, 1);
        signal.removeEventListener('abort', job.abort);
        reject(cancelled());
      };
      signal?.addEventListener('abort', job.abort, { once: true });
      pending.push(job); drain();
    });
  };
}
