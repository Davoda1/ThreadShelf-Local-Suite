import test from 'node:test';
import assert from 'node:assert/strict';
import { Marked } from 'marked';
import { createFileCitationExtension, parseFileCitation, fileTypeLabel, FILE_EXTENSION_LABELS, MAX_FILE_CITATION_LENGTH } from '../src/reader/file-citations.js';
import { protectMathInMarkdown, discardMathRecords } from '../src/reader/math.js';
import { formatJsonResponse } from '../src/reader/json-response.js';

const citation = (path, extra = ' purpose="output"') => `:codex-file-citation{path="${path}"${extra}}`;
const marked = new Marked({gfm:true, breaks:true, extensions:[createFileCitationExtension()]});
const escaped = value => value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');

test('extensive offline labels cover code, archives, data and media with conventional names', () => {
  assert.ok(Object.keys(FILE_EXTENSION_LABELS).length >= 500);
  for (const [name, label] of Object.entries({
    'report.pdf':'PDF', 'notes.txt':'Plain Text', 'README.markdown':'Markdown',
    'source.cpp':'C++', 'header.h':'C/C++ Header', 'index.js':'JavaScript', 'main.rs':'Rust',
    'main.py':'Python', 'schema.proto':'Protocol Buffers', 'script.ps1':'PowerShell',
    'backup.7z':'7-Zip', 'backup.tar':'TAR', 'backup.tar.xz':'TAR.XZ', 'backup.TAR.GZ':'TAR.GZ',
    'backup.tar.bz2':'TAR.BZ2', 'types.d.ts':'TypeScript Declaration',
    'image.JpEg':'JPEG', 'sound.flac':'FLAC', 'video.mp4':'MP4', 'font.woff2':'Web Font',
    'model.gguf':'GGUF', 'weights.safetensors':'SafeTensors', 'data.parquet':'Parquet',
    '.eslintrc.json':'JSON', '.config.json':'JSON', '.hidden.txt':'Plain Text',
    'pixmap.xpm':'XPM', 'map.topojson':'TopoJSON', 'file.db':'Database', 'file.cfg':'Configuration',
    'file.bak':'Backup', 'file.dat':'Data', 'archive.a':'Static Library',
    'board.kicad_pcb':'KiCad', 'part.step':'STEP', 'document.docx':'Word',
  })) assert.equal(fileTypeLabel(name), label, name);
  for (const name of ['LICENSE','.env','.txt','filename.','unknown.unregisteredformat','noextension']) assert.equal(fileTypeLabel(name), '', name);
  for (const suffix of Object.keys(FILE_EXTENSION_LABELS)) {
    assert.ok(suffix === suffix.toLowerCase() && /^[a-z0-9_+.-]+$/.test(suffix));
    assert.ok(FILE_EXTENSION_LABELS[suffix].length > 0 && FILE_EXTENSION_LABELS[suffix].length < 40);
  }
});

test('complete markers accept reordered attributes, spaces, quotes, unicode and escaped filename characters', () => {
  assert.deepEqual(parseFileCitation(citation('sandbox:/workspace/report.pdf')+' trailing'), {raw:citation('sandbox:/workspace/report.pdf'),filename:'report.pdf'});
  const quoted = ":codex-file-citation{purpose = 'output' path = 'sandbox:/work/árvíz 日本語.txt'}";
  assert.equal(parseFileCitation(quoted).filename,'árvíz 日本語.txt');
  assert.equal(parseFileCitation(citation('sandbox:/work/my%20report.pdf')).filename,'my report.pdf');
  assert.equal(parseFileCitation(citation('sandbox:/work/100%ready.txt')).filename,'100%ready.txt');
  assert.equal(parseFileCitation(citation('C:\\work\\report.pdf')).filename,'report.pdf');
  assert.equal(parseFileCitation(':codex-file-citation{path="sandbox:/work/a\\"quote.txt"}').filename,'a"quote.txt');
});

test('known references render inert icon filename and badge; unknown types use classic inline', () => {
  const original = `Here: ${citation('sandbox:/a/report.pdf')} then ${citation('sandbox:/b/output.unknownxyz')}.`;
  const html = marked.parse(original);
  assert.equal((html.match(/class="ts-file-citation/g)||[]).length,2);
  assert.equal((html.match(/class="ts-file-type/g)||[]).length,1);
  assert.match(html,/class="ts-file-name">report\.pdf<\/span>/);
  assert.match(html,/class="ts-file-type" aria-hidden="true">PDF<\/span>/);
  assert.match(html,/aria-disabled="true"/);
  assert.doesNotMatch(html,/<a\b|\bhref=|\bdownload=|\bonclick=|sandbox:/);
  assert.equal(original,`Here: ${citation('sandbox:/a/report.pdf')} then ${citation('sandbox:/b/output.unknownxyz')}.`);
});

test('chip option never emits a badge, even for recognized extensions', () => {
  const chip = new Marked({extensions:[createFileCitationExtension({style:'chip',classPrefix:'tsa-file'})]});
  const html = chip.parse(citation('sandbox:/file.7z'));
  assert.match(html,/tsa-file-chip/);
  assert.doesNotMatch(html,/-type|7-Zip/);
});

test('inline, fenced, indented and escaped code examples keep literal marker text', () => {
  const raw=citation('sandbox:/work/report.pdf');
  for (const content of ['`'+raw+'`','```text\n'+raw+'\n```','~~~text\n'+raw+'\n~~~','    '+raw,'\\'+raw]) {
    const html=marked.parse(content);
    assert.doesNotMatch(html,/ts-file-citation/,content);
    assert.ok(html.includes(':codex-file-citation'),content);
  }
  const codeAndProse=marked.parse('`'+raw+'` then '+raw);
  assert.equal((codeAndProse.match(/class="ts-file-citation/g)||[]).length,1);
});

test('active Markdown links and image labels do not turn a reference into a clickable dummy', () => {
  const raw=citation('sandbox:/work/report.pdf');
  for (const content of [`[${raw}](https://example.test)`,`![${raw}](https://example.test/image.png)`,`[${raw}][x]\n\n[x]: https://example.test`]) {
    assert.doesNotMatch(marked.parse(content),/ts-file-citation/);
  }
  assert.doesNotMatch(marked.parse(`[ordinary](https://example.test/${raw})`),/ts-file-citation/);
});

test('math protection and JSON-only formatting retain their established literal behavior', () => {
  const raw=citation('sandbox:/work/report.pdf');
  const protectedMath=protectMathInMarkdown('$\\text{'+raw+'}$');
  try { assert.doesNotMatch(marked.parse(protectedMath.content),/ts-file-citation/); }
  finally { discardMathRecords(protectedMath.ids); }
  const json=JSON.stringify({sample:raw});
  const result=formatJsonResponse(json,'assistant');
  assert.ok(result.includes(':codex-file-citation'));
  assert.doesNotMatch(result,/ts-file-citation/);
});

test('malformed and oversized markers remain literal without permissive repair', () => {
  for (const content of [
    ':codex-file-citation{}', ':codex-file-citation{purpose="output"}',
    ':codex-file-citation{path=""}', ':codex-file-citation{path="sandbox:/folder/"}',
    ':codex-file-citation{path=report.pdf}', ':codex-file-citation{path="report.pdf"',
    ':codex-file-citation{path="a.pdf" path="b.txt"}', ':codex-file-citation{path="a.pdf"oops="bad"}',
    ':codex-file-citation{path="bad\nname.pdf"}', ':codex-file-citation{path="bad\u202ename.pdf"}',
    citation('sandbox:/x/'+ 'a'.repeat(MAX_FILE_CITATION_LENGTH)),
  ]) {
    assert.equal(parseFileCitation(content),null);
    assert.doesNotMatch(marked.parse(content),/ts-file-citation/);
  }
});

test('attribute-shaped and HTML-shaped filenames remain escaped text without executable markup', () => {
  const filename='<img onerror=alert(1)>.txt';
  const html=marked.parse(citation('sandbox:/'+filename));
  assert.ok(html.includes(escaped(filename)));
  assert.doesNotMatch(html,/<img\b|<script\b| href=| src=/);
  const unsafeOptions=createFileCitationExtension({classPrefix:'x" onclick="bad',title:'<title>"'});
  const output=unsafeOptions.renderer({filename:'a.pdf'});
  assert.match(output,/class="ts-file-citation/);
  assert.doesNotMatch(output,/onclick=|<title>/);
});

test('ordinary Markdown is byte-identical with and without the extension', () => {
  const baseline=new Marked({gfm:true,breaks:true});
  for (const content of ['# Heading\n\n**Bold** and *italic*\n\n- A\n- B','[link](https://example.test) ![alt](data:image/png;base64,aA==)','| A | B |\n|---|---|\n| 1 | 2 |','```js\nconst answer=42;\n```','Just text, with :other-marker{x="y"}.']) {
    assert.equal(marked.parse(content),baseline.parse(content));
  }
});
