import { parseJSON } from './common.mjs';
/** Match Python json.loads(bytes), including UTF-16/32 exports and BOMs. */
export function decodeJSONBytes(bytes) {
  const raw = Buffer.from(bytes);
  let encoding = 'utf-8', offset = 0;
  if (raw.subarray(0, 4).equals(Buffer.from([0xff, 0xfe, 0, 0]))) { encoding = 'utf-32le'; offset = 4; }
  else if (raw.subarray(0, 4).equals(Buffer.from([0, 0, 0xfe, 0xff]))) { encoding = 'utf-32be'; offset = 4; }
  else if (raw.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) offset = 3;
  else if (raw.subarray(0, 2).equals(Buffer.from([0xff, 0xfe]))) { encoding = 'utf-16le'; offset = 2; }
  else if (raw.subarray(0, 2).equals(Buffer.from([0xfe, 0xff]))) { encoding = 'utf-16be'; offset = 2; }
  else if (raw.length >= 4 && raw[0] === 0 && raw[1] === 0 && raw[2] === 0) encoding = 'utf-32be';
  else if (raw.length >= 4 && raw[1] === 0 && raw[2] === 0 && raw[3] === 0) encoding = 'utf-32le';
  else if (raw.length >= 2 && raw[0] === 0) encoding = 'utf-16be';
  else if (raw.length >= 2 && raw[1] === 0) encoding = 'utf-16le';
  if (encoding.startsWith('utf-32')) {
    if ((raw.length - offset) % 4) throw new Error('Invalid UTF-32 JSON byte length.');
    const parts = [], chunk = [];
    for (let i = offset; i < raw.length; i += 4) {
      const cp = encoding === 'utf-32le' ? raw.readUInt32LE(i) : raw.readUInt32BE(i);
      if (cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) throw new Error('Invalid UTF-32 JSON character.');
      chunk.push(cp);
      if (chunk.length === 4096) { parts.push(String.fromCodePoint(...chunk)); chunk.length = 0; }
    }
    parts.push(String.fromCodePoint(...chunk));
    return parseJSON(parts.join(''));
  }
  return parseJSON(new TextDecoder(encoding, { fatal: true, ignoreBOM: true }).decode(raw.subarray(offset)));
}
