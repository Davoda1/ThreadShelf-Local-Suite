import { parentPort, workerData } from 'node:worker_threads';
import { ContentStore } from './content-packs.mjs';
import { describeDeduplication, stripDeduplicationHistory, hasDeduplicationHistory } from './deduplication.mjs';
import { serializeArchiveWorkerError } from './archive-work-errors.mjs';

const content = new ContentStore({ directory: workerData.contentDir, compression: workerData.compression,
  blockBytes: workerData.blockBytes, cacheBytes: 32 * 1024 * 1024, stagingDirectory: workerData.stagingDirectory });
parentPort.on('message', ({ id, task }) => {
  try {
    let result;
    if (task.kind === 'describe') {
      const document = task.document || content.readDocument(task.contentRef);
      result = { description: describeDeduplication(document, task.row), hasHistory: hasDeduplicationHistory(document) };
      // Fingerprints encode complete content. Review/remapping only needs a
      // bounded excerpt and whether extra payload was present, keeping the
      // coordinator's review cache independent of full archive size.
      result.description.events = result.description.events.map(event => ({ ...event,
        text: event.text.slice(0, 500), extra: Object.keys(event.extra).length ? { present: true } : {} }));
      if (task.includeDocument) result.document = stripDeduplicationHistory(document);
    } else if (task.kind === 'write') {
      result = content.writeDocument(task.document);
    } else if (task.kind === 'read') {
      result = stripDeduplicationHistory(content.readDocument(task.contentRef));
    } else throw new Error('Unknown archive worker task.');
    parentPort.postMessage({ id, result });
  } catch (error) { parentPort.postMessage({ id, error: serializeArchiveWorkerError(error) }); }
});
