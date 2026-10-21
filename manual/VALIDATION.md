# Manual validation

The public 1.0.0 manual was rebuilt and checked on 2026-10-21 using the supplied
Gopher HTTP **3.0.0** engine with PHP CLI 8.3.6 and ctype. Browser validation used
Chromium 151.0.7922.34. The editable publisher source and license are included;
these documentation-validation runtimes are not distributed with the manual.

- 49 authored Markdown chapters, approximately 36,900 words.
- 26 newly captured screenshots with synthetic data; individual provenance in
  `SCREENSHOTS.md` and the screenshot galleries.
- Gopher strict content check: 86 nodes, zero warnings.
- Static generation: 99 HTML pages and 75 original content/image assets.
- Generated HTML validation: 2,405 local links/assets/fragments, zero missing
  targets, zero broken fragments and zero root-relative navigation URLs.
- Chromium browser checks passed for both direct `file:` browsing and HTTP
  serving beneath `/ThreadShelf-Local-Suite/`.
- Static full-text search returned five entries for `cursor`, including server
  chapters, in both delivery modes and both viewport/color settings.
- All 26 screenshots loaded with valid dimensions across the three application
  galleries in both delivery modes and both viewport/color settings.
- Light desktop (1440 × 1000) and dark mobile (390 × 844) layouts were checked.
  All 24 tested page/viewport combinations had no horizontal document overflow.
  Desktop, mobile, search and gallery screenshots were visually inspected.
- The 40 browser checks passed with no page errors, console errors, HTTP errors,
  failed requests or external HTTP(S) requests.
- Content scan found no removed personal website/email, private workspace
  directory, private host address or superseded public GUI version label.

These checks validate documentation generation/navigation and the illustrated
interface. They do not establish native Windows execution, a reader's local
server deployment, model configuration or a specific private export format.
See the root and component validation records for application/package tests.

Reproduce strict content and generated-link checks with:

```sh
python3 manual/build.py
python3 manual/verify.py
```
