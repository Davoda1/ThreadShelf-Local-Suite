/** Bounded, real 7z/LZMA2 and ZIP6 codecs using the bundled upstream 7-Zip.
 * Buffer calls are synchronous and intended for the application's storage worker.
 * File calls stream data and support AbortSignal cancellation during native work.
 * No shell, PATH lookup, untrusted member paths, or plaintext temporary files are
 * used by buffer operations. Each object contains exactly one payload.bin member.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export const CODEC_VERSION = '26.03';
export const MAX_CODEC_BYTES = 64 * 1024 ** 2;
export const MAX_CODEC_FILE_BYTES = 64 * 1024 ** 3;
const MAX_METADATA_BYTES = 32 * 1024;
const MEMBER = 'payload.bin';
const root = fileURLToPath(new URL('../../', import.meta.url));
const magic7z = Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]);

export function normalizeProfile(profile = '7z') {
  if (profile === '7z') return '7z';
  if (profile === 'zip' || profile === 'zip6') return 'zip6';
  throw codecError('Unsupported storage compression profile.', 'CODEC_PROFILE');
}
export function profileExtension(profile) { return normalizeProfile(profile) === '7z' ? '.7z' : '.zip'; }
export function getCodecExecutable() {
  const relative = process.platform === 'linux' && process.arch === 'x64' ? 'linux-x64/7zz'
    : process.platform === 'win32' && process.arch === 'x64' ? 'win32-x64/7za.exe' : null;
  if (!relative) throw codecError(`Bundled storage compression is unavailable on ${process.platform}/${process.arch}.`, 'CODEC_PLATFORM');
  const executable = path.join(root, 'vendor', '7zip', relative);
  if (!fs.existsSync(executable)) throw codecError('The bundled 7-Zip component is missing. Restore the application files.', 'CODEC_MISSING');
  return executable;
}
function codecError(message, code = 'CODEC_INVALID', cause) {
  return Object.assign(new Error(message, cause ? { cause } : undefined), { code });
}
function limit(value, ceiling, fallback) {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result < 0 || result > ceiling) throw codecError(`Invalid codec size limit (maximum ${ceiling} bytes).`, 'CODEC_LIMIT');
  return result;
}
function aborted(signal) {
  if (signal?.aborted) throw Object.assign(new Error('Storage compression was cancelled.'), { name: 'AbortError', code: 'ABORT_ERR' });
}
function timeout(options, fallback = 300_000) {
  return Math.max(1, Math.min(limit(options.timeoutMs, 3_600_000, fallback), 3_600_000));
}
const type = profile => normalizeProfile(profile) === '7z' ? '-t7z' : '-tzip';
function encodeArgs(output, profile) {
  return ['a', type(profile), output, `-si${MEMBER}`,
    ...(normalizeProfile(profile) === '7z'
      ? ['-m0=LZMA2', '-md=16m', '-mx=7', '-ms=off', '-mhc=off', '-mtr=off']
      : ['-mm=Deflate', '-mx=6']),
    '-mmt=2', '-mtm=off', '-mta=off', '-mtc=off', '-bd', '-bb0', '-bso0', '-bsp0', '-y'];
}
const listArgs = (input, profile) => ['l', type(profile), '-slt', '-ba', '-sccUTF-8', '-bd', '-bsp0', input];
const decodeArgs = (input, profile) => ['x', type(profile), '-so', '-bd', '-bb0', '-bsp0', '-y', '-mmt=2', input, MEMBER];
function processFailure(result, action) {
  if (result.error?.code === 'ENOBUFS') throw codecError(`${action} exceeded its output size limit.`, 'CODEC_LIMIT', result.error);
  if (result.error?.code === 'ETIMEDOUT') throw codecError(`${action} exceeded its time limit.`, 'CODEC_TIMEOUT', result.error);
  if (result.error) throw codecError(`${action} failed: ${result.error.message}`, 'CODEC_PROCESS', result.error);
  if (result.status !== 0) {
    const detail = String(result.stderr || '').trim().slice(0, 1000);
    throw codecError(`${action} failed${detail ? `: ${detail}` : ` (exit ${result.status ?? result.signal})`}.`);
  }
}
function runSync(args, options = {}, input, maxBuffer = MAX_METADATA_BYTES) {
  aborted(options.signal);
  const result = spawnSync(getCodecExecutable(), args, {
    input, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    windowsHide: true, shell: false, maxBuffer: Math.max(1, maxBuffer),
    timeout: timeout(options), killSignal: 'SIGKILL',
  });
  processFailure(result, 'Storage compression');
  aborted(options.signal);
  return result.stdout;
}
function validateListing(bytes, profile, maxBytes, expectedBytes) {
  const records = bytes.toString('utf8').trim().split(/\r?\n\s*\r?\n/).filter(Boolean);
  if (records.length !== 1) throw codecError('A storage object must contain exactly one member.');
  const values = {};
  for (const line of records[0].split(/\r?\n/)) {
    const match = /^([^=]+?) = ?(.*)$/.exec(line);
    if (!match) throw codecError('Invalid storage object metadata.');
    if (Object.hasOwn(values, match[1])) throw codecError('Duplicate storage object metadata.');
    values[match[1]] = match[2];
  }
  const size = /^\d+$/.test(values.Size || '') ? Number(values.Size) : NaN;
  if (!Number.isSafeInteger(size) || size < 0 || size > maxBytes) throw codecError('Storage object exceeds its expanded size limit.', 'CODEC_LIMIT');
  if (expectedBytes !== undefined && size !== expectedBytes) throw codecError('Storage object expanded size does not match its descriptor.');
  if (values.Path !== MEMBER || values.Folder === '+' || values.Encrypted !== '-' || values['Symbolic Link'] || values['Hard Link']) throw codecError('Storage object member name or type is invalid.');
  // Prevent attacker-supplied archives from requesting huge LZMA dictionaries.
  // Our fixed 16 MiB encoder produces LZMA2:24, or no method for an empty file.
  if (normalizeProfile(profile) === '7z') {
    if (!(values.Method === 'LZMA2:24' || (size === 0 && values.Method === ''))) throw codecError('Unsupported storage object LZMA2 parameters.');
  } else if (!['Deflate', 'Store'].includes(values.Method)) throw codecError('Unsupported ZIP storage object method.');
  return size;
}
function validateMagic(bytes, profile) {
  const valid = normalizeProfile(profile) === '7z'
    ? bytes.subarray(0, 6).equals(magic7z)
    : bytes.length >= 4 && bytes.readUInt32LE(0) === 0x04034b50;
  if (!valid) throw codecError('Storage object container does not match its compression profile.');
}
function plain7zHeader(file) {
  // Inspect the small uncompressed next-header before asking native 7-Zip to
  // list it. Encoded headers can carry their own independent LZMA dictionary;
  // ThreadShelf never creates them and rejects them before native allocation.
  const fd = fs.openSync(file, 'r');
  try {
    const bytes = Buffer.alloc(32);
    if (fs.readSync(fd, bytes, 0, 32, 0) !== 32) throw codecError('Truncated 7z storage object.');
    const offset = bytes.readBigUInt64LE(12), size = bytes.readBigUInt64LE(20), fileBytes = BigInt(fs.fstatSync(fd).size);
    if (size === 0n || size > BigInt(MAX_METADATA_BYTES) || 32n + offset + size !== fileBytes || offset > BigInt(Number.MAX_SAFE_INTEGER)) throw codecError('Invalid 7z storage header size.');
    const kind = Buffer.alloc(1); fs.readSync(fd, kind, 0, 1, Number(32n + offset));
    if (kind[0] !== 1) throw codecError('Compressed 7z storage headers are unsupported.');
  } finally { fs.closeSync(fd); }
}
function privateTemp(options = {}) {
  const directory = fs.mkdtempSync(path.join(options.tempDir || os.tmpdir(), 'threadshelf-codec-'));
  fs.chmodSync(directory, 0o700);
  return directory;
}
function regularZipMember(file) {
  // 7-Zip records fstat(stdin) on Unix: a piped source otherwise becomes a FIFO
  // in the archive. ZIP has no -mtr=off switch, so normalize only the generated
  // single central-directory member to a regular owner-readable/writable file.
  // These metadata fields are outside member CRCs and support ZIP64 unchanged.
  const fd = fs.openSync(file, 'r+');
  try {
    const size = fs.fstatSync(fd).size, end = Buffer.alloc(22);
    if (size < 22 || fs.readSync(fd, end, 0, 22, size - 22) !== 22 || end.readUInt32LE(0) !== 0x06054b50 || end.readUInt16LE(20) !== 0) throw codecError('Generated ZIP footer is invalid.');
    let offset = end.readUInt32LE(16);
    if (offset === 0xffffffff) {
      const locator = Buffer.alloc(20); fs.readSync(fd, locator, 0, 20, size - 42);
      if (locator.readUInt32LE(0) !== 0x07064b50) throw codecError('Generated ZIP64 locator is invalid.');
      const recordOffset = locator.readBigUInt64LE(8);
      if (recordOffset > BigInt(size - 56)) throw codecError('Generated ZIP64 offset is invalid.');
      const record = Buffer.alloc(56); fs.readSync(fd, record, 0, 56, Number(recordOffset));
      if (record.readUInt32LE(0) !== 0x06064b50 || record.readBigUInt64LE(32) !== 1n) throw codecError('Generated ZIP64 record is invalid.');
      const directoryOffset = record.readBigUInt64LE(48);
      if (directoryOffset > BigInt(size - 46)) throw codecError('Generated ZIP64 central directory offset is invalid.');
      offset = Number(directoryOffset);
    }
    const central = Buffer.alloc(46 + Buffer.byteLength(MEMBER));
    if (offset + central.length > size || fs.readSync(fd, central, 0, central.length, offset) !== central.length || central.readUInt32LE(0) !== 0x02014b50) throw codecError('Generated ZIP central directory is invalid.');
    const nameLength = central.readUInt16LE(28);
    if (nameLength !== Buffer.byteLength(MEMBER) || central.subarray(46).toString('utf8') !== MEMBER) throw codecError('Generated ZIP member is invalid.');
    const attributes = Buffer.alloc(4); attributes.writeUInt32LE(0x81800020); // S_IFREG | 0600; DOS archive bit.
    fs.writeSync(fd, Buffer.from([3]), 0, 1, offset + 5); // Unix origin for POSIX mode.
    fs.writeSync(fd, attributes, 0, 4, offset + 38);
  } finally { fs.closeSync(fd); }
}
export function encodeBuffer(bytes, profile = '7z', options = {}) {
  profile = normalizeProfile(profile);
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) throw new TypeError('encodeBuffer requires bytes.');
  const maxBytes = limit(options.maxBytes, MAX_CODEC_BYTES, MAX_CODEC_BYTES);
  if (bytes.byteLength > maxBytes) throw codecError('Storage input exceeds its expanded size limit.', 'CODEC_LIMIT');
  aborted(options.signal);
  const directory = privateTemp(options), output = path.join(directory, `object${profileExtension(profile)}`);
  try {
    runSync(encodeArgs(output, profile), options, bytes);
    if (profile === 'zip6') regularZipMember(output);
    const maxPacked = bytes.byteLength + Math.ceil(bytes.byteLength / 100) + 65536;
    if (fs.statSync(output).size > maxPacked) throw codecError('Compressed storage object exceeds its size allowance.', 'CODEC_LIMIT');
    return fs.readFileSync(output);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}
export function decodeBuffer(bytes, profile = '7z', options = {}) {
  profile = normalizeProfile(profile);
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) throw new TypeError('decodeBuffer requires bytes.');
  const maxBytes = limit(options.maxBytes, MAX_CODEC_BYTES, MAX_CODEC_BYTES);
  if (bytes.byteLength > MAX_CODEC_BYTES * 1.01 + 65536) throw codecError('Compressed storage object exceeds its size limit.', 'CODEC_LIMIT');
  validateMagic(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), profile);
  aborted(options.signal);
  const directory = privateTemp(options), input = path.join(directory, `object${profileExtension(profile)}`);
  try {
    fs.writeFileSync(input, bytes, { flag: 'wx', mode: 0o600 });
    if (profile === '7z') plain7zHeader(input);
    const size = validateListing(runSync(listArgs(input, profile), options), profile, maxBytes, options.expectedBytes);
    const result = runSync(decodeArgs(input, profile), options, undefined, Math.max(size, 4096));
    if (result.length !== size || result.length > maxBytes) throw codecError('Storage object expanded size is inconsistent.');
    return result;
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

function byteGuard(maxBytes) {
  let bytes = 0;
  const stream = new Transform({ transform(chunk, _encoding, callback) {
    bytes += chunk.length;
    callback(bytes > maxBytes ? codecError('Storage stream exceeded its size limit.', 'CODEC_LIMIT') : null, chunk);
  } });
  return { stream, get bytes() { return bytes; } };
}
async function runStream(args, { input, output, maxBytes, signal, timeoutMs }) {
  aborted(signal);
  const child = spawn(getCodecExecutable(), args, { windowsHide: true, shell: false, stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
  let stderr = '', outputBytes = 0, failure = null;
  const fail = error => { failure ||= error; child.kill('SIGKILL'); };
  const onAbort = () => fail(Object.assign(new Error('Storage compression was cancelled.'), { name: 'AbortError', code: 'ABORT_ERR' }));
  signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => fail(codecError('Storage compression exceeded its time limit.', 'CODEC_TIMEOUT')), timeout({ timeoutMs }, 900_000));
  timer.unref?.();
  child.stderr.on('data', chunk => {
    stderr += chunk.toString('utf8');
    if (stderr.length > MAX_METADATA_BYTES) fail(codecError('Storage compression diagnostics exceeded their size limit.', 'CODEC_LIMIT'));
  });
  const completion = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (status, killedBy) => { try { if (failure) throw failure; processFailure({ status, signal: killedBy, stderr }, 'Storage compression'); resolve(); } catch (error) { reject(error); } });
  });
  const pending = [completion];
  if (input) {
    const guard = byteGuard(maxBytes);
    pending.push(pipeline(fs.createReadStream(input), guard.stream, child.stdin).catch(error => { fail(error); throw error; }));
  }
  if (output) {
    const guard = byteGuard(maxBytes);
    pending.push(pipeline(child.stdout, guard.stream, fs.createWriteStream(output, { flags: 'wx', mode: 0o600 })).then(() => { outputBytes = guard.bytes; }).catch(error => { fail(error); throw error; }));
  } else {
    child.stdout.on('data', chunk => { outputBytes += chunk.length; if (outputBytes > MAX_METADATA_BYTES) fail(codecError('Unexpected compression output exceeded its size limit.', 'CODEC_LIMIT')); });
  }
  try {
    const results = await Promise.allSettled(pending);
    if (failure) throw failure;
    const rejected = results.find(result => result.status === 'rejected');
    if (rejected) throw rejected.reason;
    aborted(signal);
    return outputBytes;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); }
}
async function regularFile(input, maxBytes) {
  const stat = await fsp.lstat(input);
  if (!stat.isFile() || stat.size > maxBytes) throw codecError('Codec input is not a regular file within the size limit.', 'CODEC_LIMIT');
  return stat;
}
async function publishFile(temporary, target) {
  const handle = await fsp.open(temporary, 'r+');
  try { await handle.sync(); } finally { await handle.close(); }
  // The temporary sibling shares the target filesystem. Hard-link publication
  // is exclusive, so a preexisting destination is never silently overwritten.
  await fsp.link(temporary, target);
  await fsp.unlink(temporary);
}
export async function encodeFile(source, target, options = {}) {
  const profile = normalizeProfile(options.profile), maxBytes = limit(options.maxBytes, MAX_CODEC_FILE_BYTES, MAX_CODEC_FILE_BYTES);
  aborted(options.signal);
  const stat = await regularFile(source, maxBytes);
  const temporary = `${path.resolve(target)}.${randomUUID()}.part`;
  try {
    await runStream(encodeArgs(temporary, profile), { ...options, input: source, maxBytes });
    if (profile === 'zip6') regularZipMember(temporary);
    const size = validateListing(runSync(listArgs(temporary, profile), options), profile, maxBytes, stat.size);
    await publishFile(temporary, target);
    return { profile, bytes: (await fsp.stat(target)).size, expandedBytes: size };
  } finally { await fsp.rm(temporary, { force: true }); }
}
export async function decodeFile(source, target, options = {}) {
  const profile = normalizeProfile(options.profile);
  const maxBytes = limit(options.maxBytes, MAX_CODEC_FILE_BYTES, undefined);
  aborted(options.signal);
  await regularFile(source, MAX_CODEC_FILE_BYTES * 1.01);
  const header = Buffer.alloc(6), handle = await fsp.open(source, 'r');
  try { await handle.read(header, 0, 6, 0); } finally { await handle.close(); }
  validateMagic(header, profile);
  if (profile === '7z') plain7zHeader(source);
  const size = validateListing(runSync(listArgs(source, profile), options), profile, maxBytes, options.expectedBytes);
  const temporary = `${path.resolve(target)}.${randomUUID()}.part`;
  try {
    const bytes = await runStream(decodeArgs(source, profile), { ...options, output: temporary, maxBytes: size });
    if (bytes !== size) throw codecError('Storage object expanded size is inconsistent.');
    await publishFile(temporary, target);
    return { profile, bytes, expandedBytes: size };
  } finally { await fsp.rm(temporary, { force: true }); }
}
