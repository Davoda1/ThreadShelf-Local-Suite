// These preferences deliberately live outside the strict files read by 3.2 and
// the original 1.0.0. JsonState supplies the versioned, atomic JSON envelope.
export const EXTENDED_PREFERENCES_FILE = 'extended-preferences-v1.json';
export const LOCAL_SEARCH_PERIODS = Object.freeze(['all', 'week', 'month', '3months', '6months', 'year', '2years', '5years']);
export const LOCAL_SEARCH_MODES = Object.freeze(['titles', 'keyword', 'exact', 'fuzzy', 'semantic', 'hybrid', 'ollama']);
export const SERVER_SEARCH_MODES = Object.freeze(['titles', 'keyword', 'semantic']);
const roles = ['', 'user', 'ai', 'thinking'];
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const EXTENDED_DEFAULTS = Object.freeze({
  analyticsStyledBars: false,
  searchPreferences: Object.freeze({
    local: Object.freeze({ mode: 'keyword', provider: '', role: '', period: 'all' }),
    server: Object.freeze({ mode: 'keyword', provider: '', role: '' }),
  }),
});

export function extendedPreferenceDefaults(searchMode = 'keyword') {
  const value = structuredClone(EXTENDED_DEFAULTS);
  if (LOCAL_SEARCH_MODES.includes(searchMode)) value.searchPreferences.local.mode = searchMode;
  if (SERVER_SEARCH_MODES.includes(searchMode)) value.searchPreferences.server.mode = searchMode;
  return value;
}

// A save may change one source or one field; the caller merges it with its
// current snapshot. Never reset the other source when saving a partial draft.
export function validateSearchPreferences(value) {
  if (!plain(value)) throw new Error('Invalid setting: searchPreferences');
  const result = {};
  for (const [source, fields] of Object.entries(value)) {
    if (!['local', 'server'].includes(source) || !plain(fields)) throw new Error('Invalid search preference source.');
    const next = {};
    for (const [key, item] of Object.entries(fields)) {
      if (key === 'mode') {
        if (!(source === 'local' ? LOCAL_SEARCH_MODES : SERVER_SEARCH_MODES).includes(item)) throw new Error(`Invalid ${source} search method.`);
      } else if (key === 'provider') {
        if (typeof item !== 'string' || (item !== '' && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(item))) throw new Error('Invalid search provider.');
      } else if (key === 'role') {
        if (!roles.includes(item)) throw new Error('Invalid search role.');
      } else if (key === 'period' && source === 'local') {
        if (!LOCAL_SEARCH_PERIODS.includes(item)) throw new Error('Invalid local search period.');
      } else throw new Error(`Invalid ${source} search preference: ${key}`);
      next[key] = item;
    }
    result[source] = next;
  }
  return result;
}

export function validateExtendedPatch(value) {
  if (!plain(value)) throw new Error('Invalid extended preferences.');
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === 'analyticsStyledBars') {
      if (typeof item !== 'boolean') throw new Error('Invalid setting: analyticsStyledBars');
      result[key] = item;
    } else if (key === 'searchPreferences') result[key] = validateSearchPreferences(item);
    else throw new Error(`Invalid extended preference: ${key}`);
  }
  return result;
}

export function mergeExtendedPreferences(current, patch) {
  const valid = validateExtendedPatch(patch);
  return { ...current, ...valid, searchPreferences: {
    local: { ...current.searchPreferences.local, ...valid.searchPreferences?.local },
    server: { ...current.searchPreferences.server, ...valid.searchPreferences?.server },
  } };
}

export function validateExtendedPreferences(value) {
  return mergeExtendedPreferences(EXTENDED_DEFAULTS, value);
}
