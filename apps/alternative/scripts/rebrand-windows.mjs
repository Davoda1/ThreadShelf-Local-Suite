// Build-only tooling. Does not execute the input Windows binary.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as PE from '../vendor/build/node_modules/pe-library/dist/index.js';
import * as RE from '../vendor/build/node_modules/resedit/dist/index.js';
const project = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [input, output] = process.argv.slice(2);
if (!input || !output || path.resolve(input) === path.resolve(output)) {
  throw new Error('Usage: node scripts/rebrand-windows.mjs original-electron.exe output.exe');
}
const exe = PE.NtExecutable.from(fs.readFileSync(input), { ignoreCert: true });
const resource = PE.NtExecutableResource.from(exe);
const icons = RE.Data.IconFile.from(fs.readFileSync(path.join(project, 'assets/icon.ico')));
const groups = RE.Resource.IconGroupEntry.fromEntries(resource.entries);
for (const group of groups) RE.Resource.IconGroupEntry.replaceIconsForResource(
  resource.entries, group.id, group.lang, icons.icons.map(icon => icon.data)
);
const infos = RE.Resource.VersionInfo.fromEntries(resource.entries);
if (!infos.length || !groups.length) throw new Error('Unexpected Electron resource layout.');
for (const info of infos) {
  info.setFileVersion(1, 1, 0, 0, 1033);
  info.setProductVersion(1, 1, 0, 0, 1033);
  info.setStringValues({ lang: 1033, codepage: 1200 }, {
    CompanyName: 'davoda1',
    FileDescription: 'ThreadShelf Local Alternative',
    FileVersion: '1.3.1.0',
    InternalName: 'threadshelf-local-alternative',
    LegalCopyright: 'Copyright (c) 2026 davoda1; Electron contributors and third parties',
    OriginalFilename: 'ThreadShelf Local Alternative.exe',
    ProductName: 'ThreadShelf Local Alternative',
    ProductVersion: '1.3.1',
  });
  info.outputToResourceEntries(resource.entries);
}
resource.outputResource(exe);
// Rebranding invalidates upstream Authenticode; generate an explicitly unsigned EXE.
fs.writeFileSync(output, Buffer.from(exe.generate()));
const check = PE.NtExecutable.from(fs.readFileSync(output));
const checkResource = PE.NtExecutableResource.from(check);
const strings = RE.Resource.VersionInfo.fromEntries(checkResource.entries)[0]
  .getStringValues({ lang: 1033, codepage: 1200 });
if (strings.ProductName !== 'ThreadShelf Local Alternative') throw new Error('PE brand verification failed');
console.log(JSON.stringify({ output, product: strings.ProductName, version: strings.ProductVersion, signed: false }));
