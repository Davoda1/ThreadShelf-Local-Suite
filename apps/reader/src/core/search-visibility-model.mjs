// Shared browser-safe presentation decisions; reads no storage and changes no source.
import { turnToMessage, isHiddenThoughtsMessage, intermediateJsonMessages } from '../reader/messages.js';

const roleOf = role => role === 'ai' ? 'assistant' : role;
export const validIndex = value => Number.isSafeInteger(value) && value >= 0;
export const unknown = () => ({ classified: false, emptyHidden: false, intermediateHidden: false });

export function classifySearchTurns(turns) {
  const messages = Array.from(turns, turnToMessage);
  const intermediate = intermediateJsonMessages(messages, true);
  const records = messages.map(message => ({ turnIndex: message.turn_index, role: message.role,
    emptyHidden: isHiddenThoughtsMessage(message), intermediateHidden: intermediate.has(message) }));
  const byIndex = new Map();
  for (const record of records) {
    const key = `${record.turnIndex}:${record.role}`;
    if (!byIndex.has(key)) byIndex.set(key, []);
    byIndex.get(key).push(record);
  }
  return { records, byIndex };
}

export function searchHitDecision(hit, classified) {
  if (!classified) return unknown();
  const role = roleOf(hit.role);
  let records;
  if (Object.hasOwn(hit, 'sourceTurnPosition')) {
    if (!validIndex(hit.sourceTurnPosition)) return unknown();
    const record = classified.records[hit.sourceTurnPosition];
    if (!record || role && record.role !== role) return unknown();
    records = [record];
  } else {
    if (!validIndex(hit.turnIndex) || !role) return unknown();
    records = classified.byIndex.get(`${hit.turnIndex}:${role}`);
    if (!records?.length) return unknown();
  }
  // Ambiguous normalized representations stay visible. Do not infer which
  // source part matched by inspecting a potentially truncated excerpt.
  if (records.some(record => record.emptyHidden !== records[0].emptyHidden || record.intermediateHidden !== records[0].intermediateHidden)) return unknown();
  return { classified: true, turnIndex: records[0].turnIndex,
    emptyHidden: records.every(record => record.emptyHidden),
    intermediateHidden: records.every(record => record.intermediateHidden) };
}
