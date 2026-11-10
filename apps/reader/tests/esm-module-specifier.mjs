import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Test/development harnesses may receive either a native path or an ESM
// specifier. Keep relative/package/URL resolution at the importing call site;
// only absolute filesystem paths need conversion before dynamic import().
export function testModuleSpecifier(value, { windows = process.platform === 'win32' } = {}) {
  const platformPath = windows ? path.win32 : path.posix;
  return platformPath.isAbsolute(value) ? pathToFileURL(value, { windows }).href : value;
}
