# ThreadShelf Local Suite manual

The complete user manual covers Local Reader 1.0.0, Local Analytics 1.0.0,
Local Alternative 1.0.0 and the optional search patch for upstream ThreadShelf
1.3.0. Open `../docs/index.html` directly in a browser; no web server is required.
The release bundle includes the same generated site under `manual/index.html`.

## Edit and build

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
sources and releases stay in the main suite repository, which can remain private
while the manual is public.

The `base_url` in `content/.site.json` controls canonical, feed and sitemap URLs;
change it when publishing elsewhere. No visitor account, analytics service or
remote font is required. GitHub operates the hosting service and handles request
logs under GitHub's privacy policy. The build writes `.nojekyll` to retain
underscore-prefixed assets when using branch-based GitHub Pages. See
`../maintainer/GITHUB-SETUP.md` for publication and synchronization instructions.

## Screenshot provenance

All screenshots were remade from the released 1.0.0 interfaces with synthetic
data; old screenshots and personal exports were excluded. Details and individual
captions are in `content/Screenshots/` and `SCREENSHOTS.md`.

Reader and Analytics use their actual compiled production renderer and explicit
synthetic preview bridges. These captures illustrate real UI controls and do not
claim native file, live-server or model execution. Alternative uses the actual
native Electron window and built-in synthetic demo. The recorded Electron 44.4.5
is the historical capture environment; the final desktop packages use Electron
44.9.1. Images are captured pixels,
not mockups or AI-generated replacements. Do not add private profile directories,
conversation exports, hostnames, real account details or personal paths to the
manual inputs.

## License

Original suite documentation and build wrappers are covered by the repository's
MIT license, `Copyright (c) 2026 davoda1`. Gopher HTTP retains a separate MIT
notice. Application screenshots inherit the applications' notices; bundled
third-party libraries retain their respective licenses. See the repository and
component third-party notices.

## Dependency and runtime source companions

The separate release asset
[ThreadShelf-Local-Suite-1.0.0-Native-Sources.tar.gz](https://github.com/Davoda1/ThreadShelf-Local-Suite/releases/download/v1.0.0/ThreadShelf-Local-Suite-1.0.0-Native-Sources.tar.gz)
contains the covered dependency sources, patches, build material and provenance
listed in the companion manifests. It accompanies the application source archive
and portable/installed binaries. This companion preserves the identified native
library sources and build material.

The [release page](https://github.com/Davoda1/ThreadShelf-Local-Suite/releases/tag/v1.0.0)
also provides **all numbered**
`ThreadShelf-Local-Suite-1.0.0-Runtime-Sources-*.tar.gz` parts. Together they
preserve the complete pinned Electron/Chromium Git dependency trees selected for
Linux x64 and Windows x64, supplemental build sources and release build data.
Extract every part into the same parent directory, then run
`python assemble-runtime-sources.py` from the merged
`ThreadShelf-Local-Suite-1.0.0-Runtime-Sources/` directory to verify the inner
archives. The mirror's manifest, audit and README describe coverage and assembly;
normal compiler, SDK and build-utility prerequisites remain separate.

Each native application includes `licenses/ELECTRON-SOURCE-ACCESS.md` with exact
Electron 44.9.1 source retrieval and rebuild/replacement directions. Reader also
includes `licenses/SOURCE-AND-REBUILD.md` for sharp/libvips. Preserve these
instructions, original notices, the suite Source archive, the Native-Sources
companion and every Runtime-Sources part alongside redistributed binaries.
The manual’s [developer reference](content/Reference/development.md) explains the
separate downloads and their purposes.
