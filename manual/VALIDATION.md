# Manual validation

The public 1.4.0 manual was rebuilt and checked on 2026-11-01 using the supplied
Gopher HTTP **3.0.0** publisher with PHP CLI **8.3.6** and ctype. Browser checks used
Chromium **156.0.8078.79**. These documentation-validation tools are not packaged
with the static manual.

- 51 authored Markdown chapters, including dedicated Reader and Alternative
  Text-to-Speech guides and current image, rendering, privacy and installation
  instructions.
- 35 fresh application screenshots using synthetic data: Reader 13, Analytics 13,
  Alternative 9. Routes, resolutions and limits are in `SCREENSHOTS.md` and the
  individual application capture reports.
- Gopher strict source validation: 97 nodes, zero warnings.
- Static generation: 111 HTML pages and 86 original content/image assets.
- Generated HTML validation: 2,704 local links/assets/fragments, with no missing
  targets, broken fragments or root-relative navigation.
- Browser validation: 32 page/delivery/layout combinations, covering direct
  `file:` browsing and HTTP serving beneath `/ThreadShelf-Local-Suite-Manual/`;
  light desktop at 1440 × 1000 and dark mobile at 390 × 844.
- The home page, installation, both speech chapters, all three screenshot
  galleries and static search passed in both delivery modes and layouts. All
  gallery images loaded, and search found both new speech chapters.
- No tested page had horizontal document overflow, page/console/HTTP errors,
  broken images or external HTTP(S) requests. Representative desktop/mobile
  documentation views were visually inspected.
- Each speech chapter was checked against its application's implementation,
  including the different save/key/cleanup workflows and pinned/API/exact-match
  recording reuse priority, full-message versus legacy matching, preserved
  code/citation selection and separately stored replacements for damaged pins.
- Generated output includes the suite MIT license, Gopher license and website
  notices. The build preserves repository media in `docs/extras/` and historical
  records in `docs/verification/` while replacing generated manual files.

These checks validate documentation content, generation, navigation and rendering.
Synthetic previews and screenshot captures do not establish live speech-provider
access, a user's server configuration, native Windows execution or a private
archive format. Application and package verification are recorded separately.

Reproduce the strict content, generation and local-link checks from the suite root:

```sh
python3 manual/build.py
python3 manual/verify.py
```

Use `--php PATH` when PHP CLI is outside PATH. Browser results are recorded in
`capture-reports/manual-browser.json`.
