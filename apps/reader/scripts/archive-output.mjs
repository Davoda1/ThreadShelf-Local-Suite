import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

// Compressed release ZIPs currently fit comfortably below this ceiling.
// Bound memory explicitly instead of accumulating an unexpectedly huge tree.
export const MAX_RELEASE_ZIP_BYTES = 1024 * 1024 * 1024;

export function createBoundedArchiveSink(limit = MAX_RELEASE_ZIP_BYTES) {
  const chunks = [];
  let size = 0, closed = false, bytes;
  return {
    writable: new WritableStream({
      write(chunk) {
        if (size + chunk.byteLength > limit) throw new Error(`Release ZIP exceeds the ${limit}-byte in-memory output limit.`);
        // The compressor may reuse its output buffer after write returns.
        chunks.push(Buffer.from(chunk));
        size += chunk.byteLength;
      },
      close() { closed = true; }
    }),
    completeBytes() {
      if (!closed) throw new Error('Release ZIP output has not finished closing.');
      if (!bytes) { bytes = Buffer.concat(chunks, size); chunks.length = 0; }
      return bytes;
    }
  };
}

async function verifyFile(filename, expected) {
  let size = 0;
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(filename)) { size += chunk.length; hash.update(chunk); }
  if (size !== expected.bytes || hash.digest('hex') !== expected.sha256) {
    throw new Error(`Release ZIP output integrity failed: ${filename}`);
  }
}

async function writeCompleteFile(filename, bytes) {
  const handle = await fsp.open(filename, 'w', 0o644);
  try { await handle.writeFile(bytes); await handle.sync(); }
  finally { await handle.close(); }
}

export async function writeVerifiedArchive(filename, bytes) {
  if (!bytes.length) throw new Error('Cannot publish an empty release ZIP.');
  const expected = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  await fsp.mkdir(path.dirname(filename), { recursive: true });
  const temporary = path.join(path.dirname(filename), `.${path.basename(filename)}.${randomUUID()}.tmp`);
  let repairedAfterRename = false;
  try {
    // Finish all ZIP records before touching the existing artifact. The
    // native/Web stream adapter has lost trailing output on managed disks.
    await writeCompleteFile(temporary, bytes);
    await verifyFile(temporary, expected);
    await fsp.rename(temporary, filename);
    try { await verifyFile(filename, expected); }
    catch (error) {
      // Some managed filesystems implement rename using a partial copy.
      // Repair from the still-retained complete buffer, then verify again.
      // Failure never counts as an accepted/publishable release artifact.
      if (!error.message.startsWith('Release ZIP output integrity failed:') && error.code !== 'ENOENT') throw error;
      await writeCompleteFile(filename, bytes);
      await verifyFile(filename, expected);
      repairedAfterRename = true;
    }
  } finally { await fsp.rm(temporary, { force: true }); }
  return { ...expected, repairedAfterRename };
}
