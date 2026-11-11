# Managed npm toolchain

Suite 1.4.5 builds use **Node.js 26.13.0 LTS** and an isolated, verified copy of
**npm 12.2.2**. The bootstrap replaces complete upstream dependency packages:
Undici **6.29.1**, glob **14.0.3**, minimatch **11.0.2**, path-scurry **3.0.0** and
`@isaacs/nonrecursive-glob-match` **1.1.0**. npm still reports **12.2.2**. This
managed profile is a local toolchain modification, not an official npm release.

Official npm 12.2.2 already includes Undici 6.29.1. Its security regression is
retained for both the pristine package and managed profile. The newer glob and
minimatch packages carry fixes for GHSA-3g3m-2fjr-6pw4 and GHSA-g3hv-75wg-m249;
their required dependencies are pinned alongside them. The application lockfiles
and Electron's embedded runtime are independent of these build dependencies.
No npm toolchain files enter desktop packages.

## Commands

Select Node 26.13.0 first. From the repository root:

```sh
node tools/npm.mjs --report
```

Pass npm arguments after `--`; commands retain the current working directory.
From an application directory:

```sh
node scripts/npm-toolchain.mjs -- ci
node scripts/npm-toolchain.mjs -- test
node scripts/npm-toolchain.mjs -- run build
```

From `tools/mermaid-bundle`, use `node ../npm.mjs -- ci --ignore-scripts`.
An absolute path to `tools/npm.mjs` works from any project directory. Reader and
Analytics include identical standalone helpers. Source run.sh/run.ps1 wrappers,
the suite build helper and CI all use the same managed profile.

Preparation downloads pinned official registry archives, verifies SHA-512
integrity before extraction, and verifies the complete resulting file tree.
It does not execute package lifecycle scripts, change global npm, or fall back
to an unverified system copy. All six archive URLs and SHA-512 values are in
`apps/reader/scripts/npm-toolchain.mjs` and its identical Analytics copy.

## Exact upstream inputs

These archive SHA-256 hashes were independently measured from the downloaded
bytes, in addition to the pinned SHA-512 checks. They are not publisher signatures.

| Package | Version | Compressed bytes | SHA-256 |
| --- | --- | ---: | --- |
| npm | 12.2.2 | 3,069,597 | `07fecbf753e2c3bc10ebeb3e9ed8738f6a0cc1292998b79e2e9f1dd2a5525e0c` |
| undici | 6.29.1 | 297,796 | `29c4b8e0b2d86cb8795571c1959012ce057a14ecfd34858335f47c31e770a04f` |
| glob | 14.0.3 | 434,414 | `f936d47081e316874bcd0ad9ed38a4275c7a16f5dd3300917231e0030a0acd91` |
| minimatch | 11.0.2 | 100,552 | `e118e9d9150e71820608ecf8e1f8681cd4414b1e9d123e9320c88b2af4371548` |
| path-scurry | 3.0.0 | 103,785 | `28d5862f70595973f00d63bb219083d6ed7a28488685a73a1c3340ba55688675` |
| @isaacs/nonrecursive-glob-match | 1.1.0 | 106,359 | `d8eab172188bcaa83b950160fcd7c0b9dc68f44f7c470660e5d7f4c8a437d658` |

## Verification contract

The managed package contains **2,101 regular files**. Its inventory fingerprint
is `504d1c0eaa0621f2e644739ed26e2d7ce73b6bcd32b9a38788d0b58bbd2c740b`.
It is SHA-256 over sorted UTF-8 records of relative path, NUL, byte length, NUL,
file SHA-256 and newline. Unexpected files, missing files and symlinks fail the
check. The metadata and command shims live outside this immutable package tree;
command shims are separately checked for contents and executable permissions.

Every managed npm invocation verifies its complete inventory and all replacement
package versions. It additionally checks that node-gyp 13.0.0 resolves the exact
managed Undici path and compatible `^6.25.0` contract. A failed check stops the
command. `npm --version` or application audit output alone cannot establish this.

Extraction preserves the tested Windows subprocess boundary: native Node cwd
selects the destination, archive arguments are relative and use forward slashes,
and GNU tar never receives an absolute Windows drive path or a `-C` argument.

`tools/tests/npm-toolchain.test.mjs` exercises archive tampering, changed and
missing files, dependency resolution, concurrent preparation, command shims,
nested lifecycle re-verification and safe handling of the content-encoding
advisory. Historical npm 12.2.1 validation remains in REVIEW-1.3.0.md; the current
release review records validation performed against this updated profile.
