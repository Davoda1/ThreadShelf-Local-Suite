// Browser-safe source identities shared by the UI and saved-reading mutations.
// Storage remains schema 1: source identity is encoded in each existing key/ref.
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function normalizeReadingSourceScope(scope) {
  if (!object(scope) || !['local', 'server'].includes(scope.mode)) throw new Error('Invalid saved-reading source.');
  if (scope.mode === 'local') return { mode: 'local' };
  if (typeof scope.serverUrl !== 'string' || !scope.serverUrl.trim()) throw new Error('A server address is required for saved-reading scope.');
  let url;
  try { url = new URL(scope.serverUrl.trim()); } catch { throw new Error('Invalid saved-reading server address.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Invalid saved-reading server address.');
  url.pathname = url.pathname.replace(/\/+$/, '') + '/';
  return { mode: 'server', serverUrl: url.href };
}

const parseKey = key => {
  if (typeof key !== 'string') return null;
  try { const value = JSON.parse(key); return object(value) ? value : null; } catch { return null; }
};

export function readingSourceFor(value) {
  let identity;
  if (typeof value === 'string') identity = parseKey(value);
  else if (object(value)) {
    // The persistent key wins over a contradictory embedded navigation ref.
    identity = parseKey(value.key);
    if (!identity) {
      const refs = [value.ref, value.position?.ref].filter(object);
      if (refs.length) {
        const scopes = refs.map(ref => { try { return normalizeReadingSourceScope(ref); } catch { return null; } });
        if (scopes.some(scope => scope === null) || scopes.some(scope => JSON.stringify(scope) !== JSON.stringify(scopes[0]))) return null;
        return scopes[0];
      }
      identity = value;
    }
  }
  try { return normalizeReadingSourceScope(identity); } catch { return null; }
}

export function matchesReadingSource(value, scope) {
  const expected = normalizeReadingSourceScope(scope);
  const actual = readingSourceFor(value);
  return actual !== null && actual.mode === expected.mode && (actual.mode === 'local' || actual.serverUrl === expected.serverUrl);
}

export function limitRecentForSource(recent, source, limit = 200) {
  if (!source) return recent; // Never guess ownership of unidentified legacy rows.
  let count = 0;
  return recent.filter(entry => !matchesReadingSource(entry, source) || ++count <= limit);
}
