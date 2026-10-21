// The application version is independent of the downloadable delivery revision.
export const RELEASE_REVISION = 0;

export function releaseFilename(name, revision = RELEASE_REVISION) {
  if (revision === null || revision === 0) return name;
  if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('Release revision must be a positive integer, zero, or null.');
  const dot = name.lastIndexOf('.');
  const extension = name.endsWith('.tar.gz') ? '.tar.gz' : dot > 0 ? name.slice(dot) : '';
  return `${extension ? name.slice(0, -extension.length) : name}-${revision}${extension}`;
}

export function releaseArtifactNames(version) {
  const stem = `ThreadShelf-Local-Analytics-${version}`;
  return [
    `${stem}-Windows-x64-Portable.zip`,
    `${stem}-Linux-amd64.tar.gz`,
    `threadshelf-local-analytics_${version}_amd64.deb`,
    `${stem}-Source.zip`,
    `${stem}-Source.tar.gz`,
    `${stem}-Preview.html`,
    `${stem}-Verification.md`,
    `${stem}-CHECKSUMS.txt`
  ].map(name => releaseFilename(name));
}
