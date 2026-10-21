/** Pure Meta Accounts Center transcript helpers; MIT notice alongside module. */
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const strip = text => text.trim();
export function* findTranscripts(value, pointer = '') {
  if (object(value)) {
    if (typeof value.label === 'string' && value.label.toLowerCase().endsWith('.txt')) {
      if (typeof value.value !== 'string') throw new Error('Transcript has no string value at ' + pointer);
      yield { pointer, label: value.label, original: value.value };
    }
    for (const [key, child] of Object.entries(value)) {
      yield* findTranscripts(child, pointer + '/' + key.replaceAll('~', '~0').replaceAll('/', '~1'));
    }
  } else if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) yield* findTranscripts(value[i], pointer + '/' + i);
  }
}

export function splitTranscript(text) {
  const messages = [], preamble = [];
  let current = null, fenceChar = null, fenceLength = 0;
  // Python splitlines(keepends=True) recognizes more than CR/LF.
  const lines = text.match(/[^\n\r\v\f\x1c-\x1e\x85\u2028\u2029]*(?:\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]|$)/g) || [];
  for (const line of lines) {
    if (!line) continue;
    const speaker = fenceChar === null ? /^(You|Meta AI):[ \t]?/.exec(line) : null;
    let body = line;
    if (speaker) {
      current = { sender: speaker[1] === 'You' ? 'human' : 'assistant', text: '' };
      messages.push(current);
      body = line.slice(speaker[0].length);
    }
    if (current === null) preamble.push(line);
    else current.text += body;
    const marker = /^ {0,3}(`{3,}|~{3,})([^\n]*)/.exec(body);
    if (marker) {
      const [, run, suffix] = marker;
      if (fenceChar === null) { fenceChar = run[0]; fenceLength = run.length; }
      else if (run[0] === fenceChar && run.length >= fenceLength && !strip(suffix)) { fenceChar = null; fenceLength = 0; }
    }
  }
  return { preamble: preamble.join(''), messages };
}

export function repairText(text) {
  if (Array.from(text).some(c => c.codePointAt(0) > 255)) return text;
  try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(Buffer.from(text, 'latin1')); }
  catch { return text; }
}

function fenced(text) {
  let longest = 0;
  for (const match of text.matchAll(/`+/g)) longest = Math.max(longest, match[0].length);
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return fence + '\n' + text + '\n' + fence;
}

export function conversationDate(label) {
  const match = /_(\d{2})-(\d{2})-(\d{4})(?:_(\d+))?\.txt$/i.exec(label);
  if (!match) return {};
  const [, monthText, dayText, yearText, epoch] = match;
  const month = Number(monthText), day = Number(dayText), year = Number(yearText);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return {};
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return {};
  const calendar = `${yearText}-${monthText}-${dayText}`;
  const info = { calendar_date: calendar, created_at: calendar, precision: 'day', source: 'transcript_label' };
  if (epoch && [10, 13].includes(epoch.length)) {
    info.epoch_in_label = epoch;
    const timestamp = new Date(Number(epoch) * (epoch.length === 13 ? 1 : 1000));
    if (!Number.isNaN(timestamp.valueOf())) {
      const iso = timestamp.toISOString();
      if (iso.slice(0, 10) === calendar) {
        info.created_at = epoch.length === 13 ? iso : iso.replace('.000Z', 'Z');
        info.precision = epoch.length === 13 ? 'milliseconds' : 'seconds';
      } else info.note = 'Epoch UTC date differs; explicit calendar date retained.';
    }
  }
  return info;
}
