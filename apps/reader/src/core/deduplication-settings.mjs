// Kept separate so earlier readers can still read their preference files.
export const DEDUPLICATION_SETTINGS_FILE = 'deduplication-v1.json';
export const DEDUPLICATION_DEFAULTS = Object.freeze({ deleteOtherPromptOnlyAutomatically: false });

export function validateDeduplicationSettings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).some(key => !Object.hasOwn(DEDUPLICATION_DEFAULTS, key))
      || Object.values(value).some(item => typeof item !== 'boolean')) {
    throw new Error('Invalid deduplication settings.');
  }
  return { ...DEDUPLICATION_DEFAULTS, ...value };
}

export function validateDeduplicationPreferenceChange(args, current) {
  if (!args || typeof args !== 'object' || Array.isArray(args)
      || Object.keys(args).some(key => !['deleteOtherPromptOnlyAutomatically', 'confirmed'].includes(key))
      || typeof args.deleteOtherPromptOnlyAutomatically !== 'boolean'
      || (args.confirmed !== undefined && typeof args.confirmed !== 'boolean')) {
    throw new Error('Invalid deduplication preference change.');
  }
  if (args.deleteOtherPromptOnlyAutomatically && !current.deleteOtherPromptOnlyAutomatically && args.confirmed !== true) {
    throw new Error('Confirm automatic deletion of unanswered prompts before enabling it.');
  }
  return validateDeduplicationSettings({ deleteOtherPromptOnlyAutomatically: args.deleteOtherPromptOnlyAutomatically });
}
