function indexValue(value, fallback) {
  if (Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value) && Number.isSafeInteger(Number(value))) return Number(value);
  return fallback;
}
export function turnToMessage(turn, index) {
  const role = turn.user !== undefined ? 'user' : turn.thinking !== undefined ? 'thinking'
    : ['system', 'tool'].includes(turn.source_role) ? turn.source_role : 'assistant';
  return { message_id: `turn-${index}-${role}`, turn_index: indexValue(turn.turnIndex, indexValue(turn.turn_index, index)),
    role, content: String(turn.user ?? turn.thinking ?? turn.ai ?? turn.content ?? ''), model: turn.model || '', created_at: turn.createdAt || turn.created_at || '' };
}

