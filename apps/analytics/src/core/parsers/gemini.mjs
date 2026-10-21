/** Native Gemini Takeout / My Activity parser and ThreadShelf Googlefy writer.
 * Imported markup is parsed as data and is never evaluated or navigated.
 * Conversation identities deliberately remain the legacy Gemini /app/ IDs.
 */
import { parse } from 'parse5';
import { sha256 } from './common.mjs';

export const MAX_SOURCE_BYTES = 64 * 1024 * 1024;
export const MAX_NODES = 1_000_000;
export const MAX_DEPTH = 160;
export const LOCALES = {
  hu: { query: ['Elküldött lekérdezés:'], feedback: ['Törölte a korábbi visszajelzést.'], canvas: ['Sikerült a következő Gemini Canvas létrehozása:'] },
  en: { query: ['Submitted prompt:', 'Prompted'], feedback: ['Deleted previous feedback.', 'Removed previous feedback.', 'Gave feedback', 'Submitted feedback'], canvas: ['Created Gemini Canvas:', 'Created a Gemini Canvas:'] },
  de: { query: ['Gesendete Anfrage:'], feedback: [], canvas: [] },
  fr: { query: ['Requête envoyée :'], feedback: [], canvas: [] },
};
export const MONTHS = Object.fromEntries([
  'jan január january', 'feb február february', 'márc március mar march',
  'ápr április apr april', 'máj május may', 'jún június jun june',
  'júl július jul july', 'aug augusztus august', 'szept szeptember sep sept september',
  'okt október oct october', 'nov november', 'dec december',
].flatMap((words, index) => words.split(' ').map(word => [word, index + 1])));

const inert = new Set(['script', 'style', 'iframe', 'object', 'template']);
const splitLines = value => value.split(/\r\n|[\n\v\f\r\x1c-\x1e\x85\u2028\u2029]/u);
const unicodeSlice = (value, length) => Array.from(value).slice(0, length).join('');
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const nodeFrom = children => ({ tag: '', attrs: {}, children });
const hasClass = (node, value) => typeof node !== 'string' && (node.attrs.class || '').split(/\s+/u).includes(value);

function* walk(node) {
  if (typeof node === 'string') return;
  yield node;
  for (const child of node.children) yield* walk(child);
}

/** parse5 uses an inert standards-compliant parser; validate complexity before walking recursively. */
export function parseDocument(text) {
  const document = parse(text);
  const queue = [[document, 0]];
  let count = 0;
  while (queue.length) {
    const [node, depth] = queue.pop();
    if (node.tagName && (++count > MAX_NODES || depth >= MAX_DEPTH)) {
      throw new Error('Takeout HTML exceeds parser complexity limits.');
    }
    const children = node.content ? [node.content] : node.childNodes || [];
    for (const child of children) queue.push([child, depth + 1]);
  }
  function convert(node) {
    if (node.nodeName === '#text') return node.value;
    const attrs = Object.fromEntries((node.attrs || []).map(attr => [attr.name, attr.value]));
    return { tag: node.tagName || '', attrs,
      children: (node.childNodes || []).filter(child => child.nodeName !== '#comment' && child.nodeName !== '#documentType').map(convert) };
  }
  return convert(document);
}

export function plain(node) {
  if (typeof node === 'string') return node;
  if (inert.has(node.tag)) return '';
  if (node.tag === 'br') return '\n';
  return node.children.map(plain).join('');
}

function safeLink(value) {
  const href = value.trim();
  if (/[\x00-\x20\x7f]/u.test(href) || !/^(https?|mailto):/iu.test(href)) return '';
  return href.replaceAll('(', '%28').replaceAll(')', '%29').replaceAll('<', '%3C').replaceAll('>', '%3E');
}

function fenceFor(text, min) {
  return '`'.repeat(Math.max(min, ...Array.from(text.matchAll(/`+/gu), match => match[0].length + 1)));
}

export function markdown(node) {
  if (typeof node === 'string') return node.replace(/([\\`*_\[\]])/gu, '\\$1').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const tag = node.tag;
  if (inert.has(tag) || tag === 'title' || tag === 'head') return '';
  if (tag === 'pre') {
    const value = plain(node).replace(/\r\n?/gu, '\n'), fence = fenceFor(value, 3);
    return '\n\n' + fence + '\n' + value + (value.endsWith('\n') ? '' : '\n') + fence + '\n\n';
  }
  if (tag === 'code') {
    const value = plain(node), fence = fenceFor(value, 1);
    const padding = value.startsWith('`') || value.endsWith('`') ? ' ' : '';
    return fence + padding + value + padding + fence;
  }
  if (tag === 'ul' || tag === 'ol') {
    const lines = [];
    const start = (node.attrs.start || '1').trim();
    let number = /^[+-]?\d+$/u.test(start) ? Number(start) : 1;
    for (const child of node.children) if (typeof child !== 'string' && child.tag === 'li') {
      const value = child.children.map(markdown).join('').trim();
      const marker = tag === 'ol' ? `${number}. ` : '- ';
      const parts = splitLines(value);
      lines.push(marker + parts[0] + parts.slice(1).map(part => '\n' + ' '.repeat(marker.length) + part).join(''));
      number++;
    }
    return '\n\n' + lines.join('\n') + '\n\n';
  }
  if (tag === 'table') {
    let rows = [];
    for (const tr of walk(node)) if (tr.tag === 'tr') {
      const cells = tr.children.filter(child => typeof child !== 'string' && ['th', 'td'].includes(child.tag))
        .map(child => markdown(child).trim().replaceAll('|', '\\|').replaceAll('\n', '<br>'));
      if (cells.length) rows.push(cells);
    }
    if (!rows.length) return '';
    const width = Math.max(...rows.map(row => row.length));
    rows = rows.map(row => [...row, ...Array(width - row.length).fill('')]);
    rows.splice(1, 0, Array(width).fill('---'));
    return '\n\n' + rows.map(row => '| ' + row.join(' | ') + ' |').join('\n') + '\n\n';
  }
  const text = node.children.map(markdown).join('');
  if (tag === 'br') return '\n';
  if (tag === 'hr') return '\n\n---\n\n';
  if (tag === 'strong' || tag === 'b') return '**' + text + '**';
  if (tag === 'em' || tag === 'i') return '*' + text + '*';
  if (tag === 'a') { const link = safeLink(node.attrs.href || ''); return link ? '[' + text + '](' + link + ')' : text; }
  if (tag === 'blockquote') return '\n\n' + splitLines(text.trim()).map(line => '> ' + line).join('\n') + '\n\n';
  if (/^h[1-6]$/u.test(tag)) return '\n\n' + '#'.repeat(Number(tag[1])) + ' ' + text.trim() + '\n\n';
  if (['p', 'div', 'section'].includes(tag)) return text.trim() ? '\n\n' + text.trim() + '\n\n' : '';
  return text;
}

export function renderChildren(children) {
  const chunks = [];
  let inCode = false, fence = '';
  for (const line of splitLines(children.map(markdown).join('').trim())) {
    const match = /^( *`{3,})(.*)$/u.exec(line);
    if (match && (!inCode || line === fence)) {
      if (!inCode) { inCode = true; fence = match[1]; } else inCode = false;
    }
    if (!inCode && !line.trim() && chunks.length && chunks.at(-1) === '') continue;
    chunks.push(inCode ? line : line.trimEnd());
  }
  return chunks.join('\n').trim();
}

function validUTC(year, month, day, hour, minute, second, millis = 0) {
  if (![year, month, day, hour, minute, second, millis].every(Number.isInteger) || year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return null;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, millis);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

/** Only explicit zones. The process locale/timezone never changes imported dates. */
export function timestamp(input) {
  const value = input.trim().replaceAll('\xa0', ' ');
  // The ordinary Takeout ISO form. Truncate fractions to milliseconds as Python does.
  const iso = /^(\d{4})-?(\d{2})-?(\d{2})[Tt ](\d{2}):?(\d{2})(?::?(\d{2})(?:[.,](\d+))?)?(Z|[+-]\d{2}(?::?\d{2})?)$/u.exec(value);
  if (iso) {
    const date = validUTC(...iso.slice(1, 7).map((part, index) => Number(part || (index === 5 ? 0 : part))), Number((iso[7] || '').padEnd(3, '0').slice(0, 3)));
    const zone = iso[8];
    if (!date) return null;
    let minutes = 0;
    if (zone !== 'Z') {
      const numbers = zone.slice(1).replace(':', '');
      const hours = Number(numbers.slice(0, 2)), remainder = Number(numbers.slice(2) || 0);
      if (hours > 23 || remainder > 59) return null;
      minutes = (hours * 60 + remainder) * (zone[0] === '-' ? -1 : 1);
    }
    return new Date(date.getTime() - minutes * 60000).toISOString();
  }
  const zone = /\s(CEST|CET|UTC|GMT)$/u.exec(value);
  if (!zone) return null;
  const body = value.slice(0, zone.index).trim();
  const patterns = [
    [/^(\d{4})\.\s*([^\s.]+)\.?\s+(\d{1,2})\.\s+(\d{1,2}):(\d{2}):(\d{2})$/iu, 'ymd'],
    [/^([^\s.]+)\.?\s+(\d{1,2}),?\s+(\d{4}),?\s+(\d{1,2}):(\d{2}):(\d{2})(?:\s+(AM|PM))?$/iu, 'mdy'],
    [/^(\d{1,2})\s+([^\s.]+)\.?\s+(\d{4}),?\s+(\d{1,2}):(\d{2}):(\d{2})$/iu, 'dmy'],
  ];
  for (const [pattern, order] of patterns) {
    const parts = pattern.exec(body);
    if (!parts) continue;
    const fields = Object.fromEntries(Array.from(order, (key, i) => [key, parts[i + 1]]));
    const month = MONTHS[fields.m.toLowerCase()];
    if (!month) return null;
    let hour = Number(parts[4]);
    if (parts[7]) {
      if (hour < 1 || hour > 12) return null;
      hour = hour % 12 + (parts[7].toUpperCase() === 'PM' ? 12 : 0);
    }
    const date = validUTC(Number(fields.y), month, Number(fields.d), hour, Number(parts[5]), Number(parts[6]));
    if (!date) return null;
    return new Date(date.getTime() - ({ CEST: 2, CET: 1, UTC: 0, GMT: 0 }[zone[1]] * 3600000)).toISOString();
  }
  return null;
}

function prefix(value, kind) {
  for (const locale of Object.values(LOCALES)) for (const marker of locale[kind]) {
    if (value.toLowerCase().startsWith(marker.toLowerCase())) return marker;
  }
  return null;
}

function sourceURL(node) {
  const urls = new Set();
  for (const child of walk(node)) if (child.tag === 'a' && /^https:\/\/gemini\.google\.com\/app\/[A-Za-z0-9_-]+(?:[?#][^\s]*)?$/u.test(child.attrs.href || '')) urls.add(child.attrs.href);
  if (new Set(Array.from(urls, url => new URL(url).pathname.split('/').at(-1))).size !== 1) return null;
  return Array.from(urls).sort(compare)[0];
}

export function prepareExport(raw) {
  if (raw.byteLength > MAX_SOURCE_BYTES) throw new Error('Gemini HTML exceeds the 64 MiB input limit.');
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(raw).replace(/\r\n?/gu, '\n'); }
  catch { throw new Error('Gemini Takeout HTML must be UTF-8.'); }
  const document = parseDocument(text);
  const cards = Array.from(walk(document)).filter(node => hasClass(node, 'outer-cell'));
  if (!cards.length || !cards.some(card => sourceURL(card) || Array.from(walk(card)).some(node => hasClass(node, 'header-cell') && plain(node).toLowerCase().includes('gemini')))) {
    throw new Error('Not a supported Gemini Takeout / My Activity HTML export.');
  }
  const report = { activityCards: cards.length, queries: 0, feedback: 0, canvas: 0, unknown: 0, duplicates: 0, unknownDescriptions: [], warnings: [] };
  const groups = new Map(), canvases = [], activities = [], seen = new Set();
  const retain=(kind,index,card,{url=null,stamp=null,dateRaw=null,content='',prompt=null,reason='source activity label'}={})=>{
    const limit=64*1024,characters=Array.from(content).length;
    activities.push({provider:'gemini',format:'gemini-activity-html-event',activityKind:kind,sourceCardIndex:index,id:`activity-card:${index}`,sourceUrl:url,createdAt:stamp,dateOriginal:dateRaw,dateCertainty:stamp?'explicit-zone source card timestamp':'unavailable or unrecognized source card date',content:unicodeSlice(content,limit),contentTruncated:characters>limit,fullTextCharacters:characters,...(prompt!==null?{prompt:unicodeSlice(prompt,limit)}:{}),classificationProvenance:reason,conversationAssociation:'unavailable; no conversation inferred from this activity'});
  };
  for (const [index, card] of cards.entries()) {
    const nodes = Array.from(walk(card));
    const primary = nodes.find(node => hasClass(node, 'content-cell') && !hasClass(node, 'mdl-typography--caption') && !hasClass(node, 'mdl-typography--text-right'));
    if (!primary) { report.unknown++; report.unknownDescriptions.push(`Card ${index + 1}: missing content cell`); retain('unknown',index,card,{content:plain(card).trim(),reason:'missing content-cell; unknown activity'}); continue; }
    const metadata = nodes.filter(node => hasClass(node, 'mdl-typography--caption'));
    const url = sourceURL(nodeFrom(metadata));
    const first = plain(primary).trimStart(), before = [], after = [];
    let stamp = null,dateRaw=null;
    for (const child of primary.children) {
      const candidate = timestamp(plain(child));
      if (stamp === null && candidate) { stamp = candidate;dateRaw=plain(child).trim(); }
      else if (stamp === null) before.push(child);
      else after.push(child);
    }
    const marker = prefix(first, 'query'), feedback = prefix(first, 'feedback');
    const canvas = prefix(first, 'canvas') || (/^[^\n]{0,100}\bGemini Canvas\b[^\n]*:/u.test(first) ? 'Canvas' : null);
    const kind = feedback ? 'FEEDBACK_ACTIVITY' : canvas ? 'CANVAS_CREATED' : url && stamp && after.some(child=>plain(child).trim()) && (marker || plain(nodeFrom(before)).includes('\xa0')) ? 'QUERY_RESPONSE' : marker ? 'PROMPT_ONLY' : 'UNKNOWN_ACTIVITY';
    const recordedId=card.attrs['data-activity-id'];
    const key = recordedId?JSON.stringify([recordedId,kind,url,stamp,plain(nodeFrom(before)),renderChildren(after)]):null;
    if (key&&seen.has(key)) { report.duplicates++; continue; }
    if(key)seen.add(key);
    if (kind === 'FEEDBACK_ACTIVITY') { report.feedback++;retain('feedback',index,card,{url,stamp,dateRaw,content:renderChildren(primary.children),reason:'recognized localized feedback label; feedback meaning preserved as source text'}); }
    else if (kind === 'CANVAS_CREATED') {
      let content = plain(nodeFrom(before)).trim();
      if (content.includes('\n')) content = content.slice(content.indexOf('\n') + 1);
      canvases.push({ createdAt: stamp, content, card: index + 1 }); report.canvas++;
      retain('canvas',index,card,{url,stamp,dateRaw,content,reason:'recognized Canvas creation label'});
    } else if (kind === 'QUERY_RESPONSE') {
      let prompt = plain(nodeFrom(before));
      if (marker && prompt.trimStart().startsWith(marker)) {
        prompt = prompt.trimStart().slice(marker.length);
        if (prompt.startsWith('\xa0') || prompt.startsWith(' ')) prompt = prompt.slice(1);
      } else if (prompt.includes('\xa0')) prompt = prompt.slice(prompt.indexOf('\xa0') + 1);
      if (prompt.endsWith('\n')) prompt = prompt.slice(0, -1);
      const response = renderChildren(after), cid = new URL(url).pathname.split('/').at(-1);
      let title = (card.attrs['data-conversation-title'] || '').trim();
      for (const meta of metadata) title ||= (meta.attrs['data-conversation-title'] || '').trim();
      if (!groups.has(cid)) groups.set(cid, { id: cid, sourceUrl: url, sourceTitle: '', sourceCards: [], turns: [] });
      const group = groups.get(cid);
      group.sourceCards.push({ sourceCardIndex: index, card });
      if (title) {
        if (group.sourceTitle && group.sourceTitle !== title) report.warnings.push(`${cid}: conflicting explicit titles; newest source card wins.`);
        else group.sourceTitle = title;
      }
      group.turns.push([stamp, -index, prompt, response]); report.queries++;
    } else if(kind==='PROMPT_ONLY') {
      let prompt=plain(nodeFrom(before)).trimStart().slice(marker.length).replace(/^[ \xa0]/u,'').replace(/\n$/u,'');
      retain('prompt-only',index,card,{url,stamp,dateRaw,content:prompt,prompt,reason:'recognized localized prompt label; no retained response'});
    } else {
      report.unknown++; report.unknownDescriptions.push(`Card ${index + 1}: ` + unicodeSlice(first, 240).replaceAll('\n', ' '));
      retain('unknown',index,card,{url,stamp,dateRaw,content:renderChildren(primary.children),reason:'unrecognized activity label/shape; no inferred reply or association'});
    }
  }
  const conversations = [];
  for (const cid of Array.from(groups.keys()).sort(compare)) {
    const group = groups.get(cid), chunks = [], messages = [];
    group.turns.sort((a, b) => compare(a[0], b[0]) || a[1] - b[1] || compare(a[2], b[2]) || compare(a[3], b[3]));
    for (const [stamp, sourceCard, prompt, response] of group.turns) for (const [role, content] of [['user', prompt], ['model', response]]) {
      chunks.push({ role, text: content, createdAt: stamp, source_index: -sourceCard * 2 + (role === 'model' ? 1 : 0) });
      messages.push({ role: role === 'model' ? 'assistant' : role, content, parentMessageId: null });
    }
    delete group.turns;
    Object.assign(group, { name: group.sourceTitle || 'Untitled Gemini conversation ' + cid, hasDefaultName: !group.sourceTitle, messages, createdAt: chunks[0].createdAt, chunks });
    conversations.push(group);
  }
  report.conversations = conversations.length;
  report.chunks = conversations.reduce((sum, conversation) => sum + conversation.chunks.length, 0);
  report.promptOnly=activities.filter(item=>item.activityKind==='prompt-only').length;
  return { conversations, canvas: canvases, activities, report, sourceSHA256: sha256(raw) };
}
