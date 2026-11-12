# ThreadShelf Local Suite manual

Read the illustrated user manual at **https://davoda1.github.io/ThreadShelf-Local-Suite-Manual/**.

This repository hosts the generated documentation for ThreadShelf Local Reader 1.4.5,
Local Analytics 1.4.5, Local Alternative 1.4.5 and the search integration patch for
ThreadShelf 1.3.0 and 1.4.1. It includes installation, settings, workflows, troubleshooting,
Text-to-Speech in Reader and Alternative, collection-scoped Reader cleanup, code
wrapping and display-only line numbers, isolated HTML previews, and screenshots
made with synthetic data. All 44 screenshots are fresh captures of the public 1.4.5 interfaces using
synthetic demonstration content.

Application sources and desktop releases are maintained in
[Davoda1/ThreadShelf-Local-Suite](https://github.com/Davoda1/ThreadShelf-Local-Suite).
The main repository supplies the public source, desktop packages and matching
dependency-source access instructions. This website includes its own editable
manual source in [`_manual-source/`](_manual-source/README.md), based on the
public v1.4.5 source and retaining the website's current screenshots and captions.

## Website updates

Requirements: Python 3.10+ and PHP CLI 8.2+ with ctype. Edit the Markdown and
metadata in `_manual-source/manual/content/`. From this repository's root, run:

```sh
python3 _manual-source/rebuild.py --check-only
python3 _manual-source/rebuild.py --output ../rebuilt-manual
```

Pass `--php PATH` if needed. The offline wrapper restores the 44 source PNGs
from this site's hashed image payloads, validates the source,
rebuilds the site and checks every local HTML link, image and fragment.
The output directory must not already exist. See the authoring-source README
for screenshot replacement instructions and scope.

Review the rebuilt site, then synchronize its **contents** into this repository's
root, including `.nojekyll` and `_manual-source/`. Remove obsolete generated files
while retaining the README, authoring source and required license/notices files.
Do not overwrite these website-specific galleries and screenshots with an older
main-repository manual build. Review the diff before committing.
GitHub Pages publishes from `master` and `/(root)` with HTTPS enforced.

This website contains static documentation and required notices. It does not contain
desktop application sources, binaries, personal configuration or real conversation
archives. It also works offline: download the site and open `index.html`.

## Licenses

Original suite documentation: Copyright (c) 2026 davoda1, [MIT](LICENSE).
Gopher HTTP 3.0.0 website engine: [MIT](GOPHER-LICENSE.txt).
See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) for attribution and scope.
