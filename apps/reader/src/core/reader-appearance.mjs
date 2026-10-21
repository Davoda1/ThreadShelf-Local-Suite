// Browser-safe definitions for reader preferences. Revision 5 extends the
// existing reader-appearance.json file; missing fields use these defaults.
export const PROMPT_EXPAND_STYLES = Object.freeze([
  'compact-left', 'centered-pill', 'divider-footer', 'header-action', 'outlined-right',
]);
export const READER_APPEARANCE_DEFAULTS = Object.freeze({
  waveVideoBackground: false,
  waveVideoWelcome: false,
  holidayVideoWelcome: false,
  promptExpandStyle: 'outlined-right',
});
