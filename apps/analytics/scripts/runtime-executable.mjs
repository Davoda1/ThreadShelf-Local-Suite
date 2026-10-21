import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const fingerprint = data => ({ bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') });

export async function verifyRuntimeExecutable(filename, expected) {
  const actual = fingerprint(await fs.readFile(filename));
  if (actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256) {
    throw new Error(`Branded runtime executable integrity failed: ${filename}`);
  }
}

export async function writeVerifiedRuntimeExecutable(source, destination) {
  // Managed filesystems can implement rename through an incomplete native
  // copy. Keep the fully extracted source until the complete branded write
  // has been flushed, closed and independently read back by size and SHA-256.
  const data = await fs.readFile(source);
  if (!data.length) throw new Error(`Empty runtime executable: ${source}`);
  const expected = fingerprint(data);
  const handle = await fs.open(destination, 'w', 0o755);
  try {
    await handle.writeFile(data);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.chmod(destination, 0o755);
  await verifyRuntimeExecutable(destination, expected);
  return expected;
}
