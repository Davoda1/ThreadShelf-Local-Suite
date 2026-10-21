// Public release names use the application version without private development revision suffixes.
export const RELEASE_REVISION = 0;
export function releaseFilename(filename) {
  const extension = filename.match(/(?:\.tar\.gz|\.[^.]+)$/)?.[0];
  if (!extension) throw new Error(`Release filename needs an extension: ${filename}`);
  return RELEASE_REVISION ? `${filename.slice(0, -extension.length)}-${RELEASE_REVISION}${extension}` : filename;
}
