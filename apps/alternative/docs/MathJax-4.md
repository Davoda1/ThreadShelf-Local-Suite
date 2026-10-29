# MathJax 4.1.3 integration

Reader and Alternative use the same pinned MathJax 4.1.3 TeX/MathML-to-SVG
component and local assistive-MathML component. Analytics does not use MathJax.
The migration selectively reuses the personal editions' renderer integration;
public application features, settings, storage and release numbering stay independent.

## Offline loading and security

The application loads the engine, compatibility module, original TeX font data
and assistive MathML from its own packaged files. No CDN or font download is
required. The installed application keeps `script-src 'self'`, `connect-src
'none'` and adds explicit `worker-src 'none'`. No eval or remote resource
exception is introduced. The existing clipped assistive MathML remains available
to screen readers; v4's new worker-based speech, braille and exploration defaults
are disabled. This is unrelated to future application TTS work.

The standalone preview embeds the same files and registers assistive MathML
before engine startup, avoiding dynamic component URL requests. Its pre-existing
inline/data-script preview policy is separate from the installed app policy.

## Compatibility and version pin

The public 1.3.0 bundled engine identified itself as 3.2.1. The new runtime is
4.1.3. Original licensed TeX glyph outlines, metrics and font tables are supplied
as constant data through the v4 font interface. The data extraction recipe uses
the pinned 3.2.2 font package at build time only: no v3 executable runtime ships.

`mathjax-compat.js` retains established token/font mappings, accent behaviour,
spacing, script scaling and extensible-glyph geometry using the v4 engine.
The adapter checks the exact supported version and API shape. Future MathJax
updates must review the adapter; changing a version number alone is insufficient.
The existing TeX package lists, overflow behaviour and local SVG font cache are
preserved. The new `textmacros` default is disabled to avoid changing saved text.

## Reproduction and checks

Run `python3 scripts/update-mathjax.py` from the application source to restore
upstream files. The adjacent lock records npm SHA-512 integrity, source URLs,
file destinations and the generated font-data hash. Source and runtime license
notices are included. `scripts/build-legacy-mathjax-font.mjs` extracts constant
font tables; the old package is temporary build input only.

`tools/tests/mathjax-migration.mjs` at the suite root checks both real application
initializers under their production CSP, the exact engine version, representative
formulas, clipped assistive MathML, renderer Node isolation and rejected inline
scripts/eval/workers/network fetches. An optional `MATHJAX_BASELINE_REV` reads the
previous bundle/config from git for selected formula geometry, glyph, accessible
text and pixel comparisons. The old runtime is never included in the deliverables.
Use `READER_ELECTRON` and `THREADSHELF_PLAYWRIGHT_MODULE` to select the native test
runtime and driver. `MATHJAX_HEADLESS=1 MATHJAX_SKIP_PIXELS=1` permits geometry and
security checks where the host has no usable display; it does not claim pixel
validation. Tests cover representative cases, not every possible TeX expression.
