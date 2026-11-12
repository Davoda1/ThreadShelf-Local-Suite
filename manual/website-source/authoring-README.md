# Website authoring source — 1.4.5

This is the editable source for this published manual website. It is based on
the public Suite v1.4.5 source at commit
`ae26252174ce5ee4d4fb2436fb56b1b558bcb156`, with current website-specific chapters,
captions, all 44 fresh screenshots and attribution updates. Application code
remains in the [main repository](https://github.com/Davoda1/ThreadShelf-Local-Suite).

The original chapter structure and Gopher HTTP 3.0.0 publisher are retained.
`manual/content/` holds Markdown and metadata; `manual/builder/` holds the editable
publisher and its bundled entry point. The documentation and publisher are MIT
licensed, Copyright (c) 2026 davoda1; their notices accompany the site.

## Build offline

Requirements: Python 3.10+ and PHP CLI 8.2+ with ctype. From the website root:

```sh
python3 _manual-source/rebuild.py --check-only
python3 _manual-source/rebuild.py --output ../rebuilt-manual
```

Use `py -3` on Windows, or pass `--php PATH` when PHP is outside PATH. Choose a
new output directory. No application build, network download or main-repository
checkout is needed. The wrapper restores source images, checks their SHA-256
checksums, runs strict source validation, builds the site and verifies local HTML
links, images and fragments. It retains the authoring snapshot, site README and
published supplementary material in the rebuilt output.

## Edit content and screenshots

Edit Markdown and `.menu.json`, `.catalog.json` or `.site.json` in
`manual/content/`. For a screenshot replacement or addition, place the new PNG in
`manual/content/Images/` under its intended filename and update the relevant
gallery captions. Source PNGs take precedence over the existing image map.

The published PNGs are stored once, in `_gopher/files/`. `images.json` maps the
44 original filenames to those payloads and records dimensions and SHA-256
checksums. A rebuild updates the map from the current images and keeps the new
authoring snapshot free of duplicate PNG binaries. To remove an image, remove its
map entry, any supplied source PNG and the corresponding gallery references.

Review the generated site before replacing the published contents. Synchronize
with deletion of obsolete generated files, preserving the README, authoring
source and notices. Do not replace these galleries with an older manual build
from the main repository.

Capture scope is documented in `manual/SCREENSHOTS.md`; current local build
checks are recorded in `manual/VALIDATION.md`. No private capture profiles,
conversation exports or automation harnesses are included.
