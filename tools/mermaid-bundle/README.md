# Shared offline Mermaid renderer

Reader and Alternative use the same committed `mermaid.min.js`. This recipe rebuilds the renderer from the upstream Mermaid core modules and locked npm dependencies. It builds Mermaid **12.2.0** with **DOMPurify 3.4.17** and **KaTeX 0.19.1**. No manual editing of minified dependency code is required.

These versions address DOMPurify advisories [GHSA-55q2-fjhq-7xh7](https://github.com/advisories/GHSA-55q2-fjhq-7xh7) and [GHSA-6688-9rhm-gjv2](https://github.com/advisories/GHSA-6688-9rhm-gjv2), and KaTeX advisory [GHSA-238p-pmpm-9mq7](https://github.com/advisories/GHSA-238p-pmpm-9mq7). This bundle ships in application release **1.3.0**. The applications explicitly select classic diagram appearance, Dagre layout, 200-pixel label wrapping, and content-sized flowchart/state nodes to preserve their existing behavior across Mermaid 12's changed defaults. Diagram security settings and repair behavior remain unchanged.

## Rebuild

Use **Node.js 24.22.1** and the [managed npm 12.2.1 profile with bundled Undici 6.29.1](../../maintainer/NPM-TOOLCHAIN.md). From this directory:

```text
node ../npm.mjs -- ci --ignore-scripts
node ../npm.mjs -- run build
node ../npm.mjs -- run check
```

`build` updates both application copies and their accompanying notice/manifest files. `check` builds in memory and fails if any committed output differs. The lockfile records npm package URLs and integrity digests. The build requires network access when those packages are not already cached; using the packaged apps does not require npm or a network connection for diagrams.

The build imports Mermaid's `dist/mermaid.core.mjs` dependency graph, whose DOMPurify and KaTeX imports resolve to the explicitly overridden versions. It does not rebundle the upstream standalone file with old dependencies already embedded. All lazy diagram imports are folded into one browser file, with zero external imports.

The two output copies are:

- `apps/reader/public/mermaid.min.js`
- `apps/alternative/vendor/mermaid.min.js`

Each application also receives `Mermaid-BUNDLE-NOTICES.txt` and `Mermaid-BUNDLE-MANIFEST.json` in the corresponding license directory. The manifest lists the components actually incorporated by esbuild, their versions, original notice hashes, the bundle checksum, and the recipe/lockfile checksums. The notices preserve the original third-party legal text. DOMPurify is used under the Apache-2.0 option of the upstream dual license. These files accompany the native application packages.

## Browser and security regressions

Install the matching Playwright Chromium browser, then run:

```text
node ../npm.mjs -- exec -- playwright-core install chromium
node ../npm.mjs -- test
```

On a Linux CI runner that needs browser system libraries, use `node ../npm.mjs -- exec -- playwright-core install --with-deps chromium`. Alternatively, set `THREADSHELF_CHROMIUM` to an existing compatible Chromium executable. The test-only browser starts with `--no-sandbox` so the isolated CI/container harness can run; this does not change any packaged application's sandbox configuration.

To run the same cases inside the target Electron renderer, set `THREADSHELF_ELECTRON` to the unmodified Electron runtime executable and run `node test.mjs` under a graphical session (or `xvfb-run -a` on Linux). This uses an isolated test window with context isolation, renderer sandboxing, and Node integration disabled. The reported runtime versions identify the binary actually exercised. The test-only `--no-sandbox` switch remains necessary for a root/container harness; it does not verify the operating-system sandbox.

The tests cover common diagrams in light and dark themes, the KaTeX MathML path, deterministic Reader repairs, strict rendering of malicious labels/links, and all three advisory regression scenarios against the exact dependencies incorporated into the bundle. They also check that both applications receive identical bytes and that rendering makes no network requests. The KaTeX scenario enables HTML labels only in the test because Mermaid uses that path for math labels; product defaults remain unchanged.

Run `node ../npm.mjs -- audit` to query current advisories for the complete locked build graph. A clean result is time-bound and does not establish that every possible security defect is absent. When changing a dependency, rebuild the bundle, review the generated notices, rerun the tests, and rebuild the affected application distributions.

Original build/test recipe: Copyright (c) 2026 davoda1, MIT. Upstream libraries retain the terms recorded in their original notices.
