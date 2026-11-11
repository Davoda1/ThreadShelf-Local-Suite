// Provider conversation identity is independent of the file or server that
// transported it. Collection membership is applied by the archive separately.
const scalar = value => typeof value === 'string' ? value.trim()
  : typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : '';

export function canonicalProvider(value) {
  const name = scalar(value).toLowerCase();
  if (['openai', 'chatgpt'].includes(name)) return 'openai';
  if (['grok', 'xai', 'x.ai'].includes(name)) return 'grok';
  if (['venice', 'veniceai', 'venice.ai'].includes(name)) return 'venice';
  if (['anthropic', 'claude'].includes(name)) return 'anthropic';
  return name;
}

function normalizeKey(value, provider) {
  let key = scalar(value);
  // Older normalized imports could add an alias before an already-prefixed key
  // (for example ChatGPT:openai:<id>). Remove only this provider's namespaces.
  for (let depth = 0; depth < 16; depth++) {
    const colon = key.indexOf(':');
    if (colon <= 0 || canonicalProvider(key.slice(0, colon)) !== provider) break;
    key = key.slice(colon + 1);
  }
  if (!key || /^(?:undefined|null|unknown)$/i.test(key) || /^(?:local|server):/.test(key)) return '';
  return key;
}

/** Native ID only; local row UUIDs and server/provenance hashes are not IDs. */
export function conversationId(document = {}) {
  const provider = canonicalProvider(document.provider);
  if (!provider || provider === 'venice') return null;
  const source = document.sourceIdentity;
  const raw = document.raw && typeof document.raw === 'object' ? document.raw : {};
  const native = raw.conversation || raw.thread?.raw?.conversation || raw.thread?.raw || raw;
  const values = [document.conversationKey, source?.conversationKey, source?.key,
    raw.thread?.conversationKey, raw.summary?.conversationKey,
    native.conversation_id, native.conversationId, native.uuid, native.id];
  for (const value of values) {
    const key = normalizeKey(value, provider);
    if (key) return key;
  }
  return null;
}

/** Stable, metadata-indexable identity; VeniceAI deliberately has none. */
export function reliableConversationIdentity(document = {}) {
  const provider = canonicalProvider(document.provider), id = conversationId(document);
  return id === null ? null : JSON.stringify([provider, id]);
}
