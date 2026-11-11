import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { mkdirSync, mkdtempSync, lstatSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { restoreArchiveWorkerError } from './archive-work-errors.mjs';

// Workers only touch immutable content objects. The archive coordinator remains
// the sole SQLite writer, so concurrent parsing cannot race conversation IDs.
export class ArchiveWorkPool {
  constructor(contentDir, { concurrency = Math.min(4, Math.max(1, availableParallelism() - 1)), compression = '7z', blockBytes } = {}) {
    this.contentDir = contentDir; this.concurrency = concurrency; this.compression = compression; this.blockBytes = blockBytes;
    this.slots = []; this.queue = []; this.sequence = 0; this.closed = false;
    this.activeBytes = 0; this.byteBudget = 256 * 1024 * 1024;
    this.signals = new Map();
  }
  run(task, { signal } = {}) {
    signal?.throwIfAborted();
    if (this.closed) return Promise.reject(new Error('The archive worker pool is closed.'));
    return new Promise((resolve, reject) => {
      const ref = task.contentRef;
      const weight = task.estimatedBytes || (ref ? ref.header.bytes + ref.groups.reduce((n, group) => n + group.blob.bytes, 0) : 64 * 1024 * 1024);
      const job = { id: ++this.sequence, task, signal, resolve, reject, weight, active: false };
      job.abort = () => {
        const slot = this.slots.find(item => item.job === job);
        if (slot) { slot.job = null; this._terminate(slot); this.slots.splice(this.slots.indexOf(slot), 1); }
        else this.queue = this.queue.filter(item => item !== job);
        this._settle(job, signal.reason || Object.assign(new Error('Operation cancelled.'), { name: 'AbortError' }));
        this._dispatch();
      };
      if (signal) {
        let watch = this.signals.get(signal);
        if (!watch) {
          watch = { jobs: new Set() };
          watch.abort = () => { for (const item of [...watch.jobs]) item.abort(); };
          this.signals.set(signal, watch); signal.addEventListener('abort', watch.abort, { once: true });
        }
        watch.jobs.add(job);
      }
      this.queue.push(job); this._dispatch();
    });
  }
  _settle(job, error, result) {
    if (job.settled) return; job.settled = true;
    if (job.active) { this.activeBytes -= job.weight; job.active = false; }
    const watch = this.signals.get(job.signal);
    if (watch) { watch.jobs.delete(job); if (!watch.jobs.size) { job.signal.removeEventListener('abort', watch.abort); this.signals.delete(job.signal); } }
    if (error) job.reject(error); else job.resolve(result);
  }
  _spawn() {
    mkdirSync(this.contentDir, { recursive: true, mode: 0o700 });
    const directory = lstatSync(this.contentDir);
    if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error('Local content directory must be a regular directory.');
    const stagingDirectory = mkdtempSync(join(this.contentDir, 'reader-archive-worker-'));
    const worker = new Worker(new URL('./archive-work-worker.mjs', import.meta.url), {
      workerData: { contentDir: this.contentDir, compression: this.compression, blockBytes: this.blockBytes, stagingDirectory },
      // Test-runner and entry-point flags are not valid Worker arguments.
      execArgv: [],
    });
    const slot = { worker, job: null, stagingDirectory }; this.slots.push(slot); worker.unref();
    worker.on('message', message => {
      const job = slot.job; if (!job || message.id !== job.id) return;
      slot.job = null; worker.unref();
      const error = message.error ? restoreArchiveWorkerError(message.error) : null;
      this._settle(job, error, message.result); this._dispatch();
    });
    worker.on('error', error => {
      const job = slot.job; slot.job = null;
      this.slots = this.slots.filter(item => item !== slot);
      if (job) this._settle(job, error); this._terminate(slot); this._dispatch();
    });
    worker.on('exit', code => {
      const job = slot.job; slot.job = null;
      this.slots = this.slots.filter(item => item !== slot);
      this._removeStaging(slot);
      if (job) this._settle(job, new Error(`Archive worker exited before completing its operation (${code}).`));
      this._dispatch();
    });
    return slot;
  }
  _removeStaging(slot) {
    return slot.cleanup ||= rm(slot.stagingDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
  _terminate(slot) {
    if (!slot.termination) {
      slot.termination = slot.worker.terminate().catch(() => {}).then(() => this._removeStaging(slot));
      (this.terminations ||= new Set()).add(slot.termination);
      slot.termination.finally(() => this.terminations.delete(slot.termination)).catch(() => {});
    }
    return slot.termination;
  }
  _dispatch() {
    if (this.closed) return;
    while (this.queue.length) {
      const next = this.queue[0];
      if (next.signal?.aborted) { this.queue.shift(); this._settle(next, next.signal.reason || new Error('Operation cancelled.')); continue; }
      // A document larger than the budget runs alone. Other requests cannot
      // multiply that peak by the worker count.
      if (this.activeBytes && this.activeBytes + next.weight > this.byteBudget) return;
      let slot;
      try { slot = this.slots.find(item => !item.job) || (this.slots.length < this.concurrency ? this._spawn() : null); }
      catch (error) { this.queue.shift(); this._settle(next, error); continue; }
      if (!slot) return;
      const job = this.queue.shift(); if (job.settled) continue;
      slot.job = job; job.active = true; this.activeBytes += job.weight;
      slot.worker.ref(); slot.worker.postMessage({ id: job.id, task: job.task });
    }
  }
  close() {
    if (this.closing) return this.closing;
    this.closed = true;
    const error = new Error('The archive worker pool was closed.');
    for (const job of this.queue) this._settle(job, error); this.queue = [];
    const workers = this.slots.splice(0);
    for (const slot of workers) { if (slot.job) this._settle(slot.job, error); slot.job = null; }
    return this.closing = Promise.allSettled([...workers.map(slot => this._terminate(slot)), ...(this.terminations || [])]);
  }
}
