# ThreadShelf Local Suite manual

The user manual covers Local Reader 1.4.5, Local Analytics 1.4.5,
Local Alternative 1.4.5 and the optional search patch for upstream ThreadShelf
1.3.0 and 1.4.1. Open `../docs/index.html` directly in a browser; no web server is required.
The release bundle includes the same generated site under `manual/index.html`.

## Edit and build

The instructions below describe the Suite source archive. In the published
website checkout, use its `_manual-source/rebuild.py` wrapper and the accompanying
`_manual-source/README.md` to preserve the current website screenshots and captions.

Requirements: Python 3.10+ and PHP CLI 8.2+ with the standard ctype extension.
There are no Composer, npm, CDN or network dependencies for manual generation.
The bundled publisher is the supplied Gopher HTTP **3.0.0**, with the original
MIT license retained in `builder/LICENSE`.

From the Suite repository root:

```sh
python3 manual/build.py --check-only
python3 manual/build.py
```

On Windows, use `py -3` instead of `python3`. Pass `--php PATH` if PHP is not on
PATH. The script runs Gopher's strict source validation, writes `docs/`, then
checks every generated local HTML link, image and fragment. Existing output is
replaced only if it carries Gopher's own build marker; an unrelated directory
is refused. `--check-only` does not write output.

This checkout includes the current website's 44 public 1.4.5 screenshots under
`content/Images/`, restored and checked against its original SHA-256 image map.
`website-source/` retains the website's README, offline rebuild wrapper and image
provenance map. A normal build refreshes `docs/_manual-source/` from the editable
sources and regenerates its image map, so the offline site retains matching
authoring sources without storing a second copy of the PNGs. The standalone
website rebuild command above remains usable without an application checkout.

Edit Markdown in `content/`. `.menu.json` orders chapters; `.catalog.json`
provides titles, descriptions and tags. Update those metadata files when adding
or renaming content. `builder/docs/CONTENT.md` documents the supported markup
and configuration. `builder/src/`, `assets/` and `tools/package.php` are the
editable publisher source; `builder/index.php` is the supplied bundled entry
point. Repackage publisher changes with `php builder/tools/package.php` from
this directory, and review the resulting diff before rebuilding the manual.

## Offline and GitHub Pages

`docs/` is self-contained. Navigation, images, styles and static search use
relative paths. It works from a file URL or at the hosted manual address:
`https://davoda1.github.io/ThreadShelf-Local-Suite-Manual/`.
The public `Davoda1/ThreadShelf-Local-Suite-Manual` repository publishes a copy of
the generated files and required notices through GitHub Pages. Application
sources and releases stay in the public main suite repository.

The `base_url` in `content/.site.json` controls canonical, feed and sitemap URLs;
change it when publishing elsewhere. No visitor account, analytics service or
remote font is required. GitHub operates the hosting service and handles request
logs under GitHub's privacy policy. The build writes `.nojekyll` to retain
underscore-prefixed assets when using branch-based GitHub Pages. See
`../maintainer/GITHUB-SETUP.md` for publication and synchronization instructions.

## Screenshot provenance

All 44 screenshots show the public 1.4.5 interfaces with synthetic demonstration
records: 18 Reader, 13 Analytics and 13 Alternative images. The galleries identify
the current capture methods, dimensions and relevant limits. Images are unaltered
captures of the current application interface.

Capture details are recorded in `SCREENSHOTS.md` and the galleries in
`content/Screenshots/`. The images illustrate actual controls and rendering, not
successful paid-provider requests or operating-system installation. Keep private
profiles, conversation exports, hostnames, account details and personal paths out
of capture inputs.

## License

Original suite documentation and build wrappers are covered by the repository's
MIT license, `Copyright (c) 2026 davoda1`. Gopher HTTP retains a separate MIT
notice. Application screenshots inherit the applications' notices; bundled
third-party libraries retain their respective licenses. See the repository and
component third-party notices.

## Dependency and runtime source companions

The current application runtime is Electron 45.2.3. Its matching source offer
requires the six numbered v1.3.0 Runtime-Sources ZIPs and metadata ZIP plus the
v1.4.5 Runtime-Source-Update supplement,
with checksums and assembler instructions in each application's
`licenses/ELECTRON-SOURCE-ACCESS.md`. Reader's ONNX Runtime 1.31.1 source companion
is also associated with v1.3.0. The old v1.0.0 Native-Sources companion is reused
only for its unchanged sharp/libvips scope; its old Electron source material is
not the current runtime's source offer.

Reader and Alternative retain preparation instructions, pinned asset inventories
and original notices for their bundled CPU speech engines/models. Source builds
must prepare and verify those required assets before packaging.

See [the developer reference](content/Reference/development.md) and the packaged
source-access notices for verification, extraction, rebuilding and redistribution
requirements. Retain the correct dependency versions and their existing source
links rather than renaming historical companions to the application version.
