/* Local-only mathematics. No automatic typesetting or extension fetching. */
window.MathJax = {
  loader: { load: [] },
  tex: { packages: ['base', 'ams', 'newcommand', 'noundefined'], maxBuffer: 32768, maxMacros: 1000 },
  options: { enableMenu: false },
  startup: { typeset: false, ready: function () {
    const Menu = window.MathJax._?.ui?.menu?.Menu?.Menu;
    if (Menu) window.MathJax.config.options.MenuClass = class extends Menu { mergeUserSettings() {} saveUserSettings() {} };
    window.MathJax.startup.defaultReady();
  } },
  svg: { fontCache: 'local' }
};
