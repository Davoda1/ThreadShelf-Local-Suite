/* Local mathematics: retain the original TeX appearance and assistive MathML.
 * MathJax 4 enables worker-backed speech/braille by default. The existing app
 * exposes neither those tools nor MathJax's menu; keep its previous accessible
 * MathML behavior without opening worker or network permissions.
 */
window.MathJax = {
  loader: {
    load: ['a11y/assistive-mml'],
    source: {
      'a11y/assistive-mml': new URL('../vendor/mathjax-assistive-mml.js', document.baseURI).href
    }
  },
  tex: { packages: ['base', 'ams', 'newcommand', 'noundefined'], maxBuffer: 32768, maxMacros: 1000 },
  options: {
    enableMenu: false,
    enableEnrichment: false,
    enableSpeech: false,
    enableBraille: false,
    enableExplorer: false,
    enableAssistiveMml: true,
    menuOptions: { settings: {
      enrich: false, speech: false, braille: false, assistiveMml: true,
      breakInline: false, overflow: 'Overflow'
    } }
  },
  startup: { typeset: false, ready: function () {
    const Menu = window.MathJax._?.ui?.menu?.Menu?.Menu;
    if (Menu) window.MathJax.config.options.MenuClass = class extends Menu { mergeUserSettings() {} saveUserSettings() {} };
    // The v4 combined component appends optional TeX packages during loading.
    // Preserve the actual previous application's four-package allowlist.
    window.MathJax.config.tex.packages = ['base', 'ams', 'newcommand', 'noundefined'];
    window.ThreadShelfOriginalTeXFont.install(window.MathJax);
    window.ThreadShelfMathJaxCompatibility.install(window.MathJax);
    window.MathJax.startup.defaultReady();
  } },
  output: { linebreaks: { inline: false }, displayOverflow: 'overflow' },
  svg: { fontCache: 'local', blacker: 3 }
};
