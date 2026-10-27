# Managed npm toolchain

Suite 1.3.0 builds use **Node.js 24.22.1** and an isolated copy of official
**npm 12.2.1** whose bundled `node_modules/undici` is replaced in full by the
official **Undici 6.29.1** package. npm still reports version **12.2.1**. The
Undici replacement is a separately recorded local toolchain modification; it
is not an official patched npm release.

The application lockfiles and Electron's embedded runtime are independent of
this npm dependency. Their Undici 7.30.1 entries do not repair the npm executable.
The managed toolchain is a development dependency and is not needed to run the
packaged desktop applications.

## Why the replacement is required

On 27 October 2026, the official registry's latest stable npm 12 and npm 11
versions were 12.2.1 and 11.21.1. Both published tarballs contained Undici 6.29.0.
Their official release notes confirm that dependency:

- [npm 12.2.1 release](https://github.com/npm/cli/releases/tag/v12.2.1)
- [npm 11.21.1 release](https://github.com/npm/cli/releases/tag/v11.21.1)
- [Undici 6.29.1 security release](https://github.com/nodejs/undici/releases/tag/v6.29.1)
- [Excessive content-encoding crash advisory, GHSA-xjj6-f33q-929c](https://github.com/nodejs/undici/security/advisories/GHSA-xjj6-f33q-929c)

The Undici release addresses five advisories affecting 6.29.0, covering
EventSource, response decoding, TLS and WebSocket handling. The complete
replacement includes all of those upstream fixes. npm 12.2.1's shipped
node-gyp 13.0.0 requires Undici `^6.25.0`; 6.29.1 satisfies that range, retains
Node `>=18.17`, and introduces no runtime dependencies. Its required Agent,
EnvHttpProxyAgent, RetryAgent and fetch exports remain available.

## Commands

Select Node 24.22.1 first. From the repository root, prepare and verify the
managed profile and print its JSON report:

```sh
node tools/npm.mjs --report
```

Pass npm arguments after `--`. Commands retain the current working directory,
so run them in the project whose lockfile is being used:

```sh
# From apps/reader or apps/analytics:
node scripts/npm-toolchain.mjs -- ci
node scripts/npm-toolchain.mjs -- test
node scripts/npm-toolchain.mjs -- run build

# From tools/mermaid-bundle:
node ../npm.mjs -- ci --ignore-scripts
node ../npm.mjs -- exec -- playwright-core install chromium
```

An absolute path to `tools/npm.mjs` also works from another project directory.
Use `-- exec -- <command>` for commands normally launched with npx. Reader and
Analytics include the per-app helper for standalone source checkouts. Their
run.sh/run.ps1 helpers and the suite build helper select the managed profile.
CI selects Node with setup-node, then uses these same entrypoints.

Preparation downloads the pinned inputs when needed, verifies their integrity
before installation, and uses private managed storage. It does not run package
lifecycle scripts to prepare npm, modify global npm, or fall back to a system
npm when verification fails. No `npm install --global npm` step is required.

## Exact upstream inputs

These SHA-512 integrity values were verified against the bytes downloaded from
the official registry. SHA-256 values are also recorded for independent local
comparison; they are not represented as publisher signatures.

Official npm 12.2.1, 3,062,824 compressed bytes:

```text
URL: https://registry.npmjs.org/npm/-/npm-12.2.1.tgz
SRI: sha512-bKCmFRVT/BB+YPEYbZwQ1XUI3N5t4xKSpU1MxOjo7z3iWzKBJ0ZXRC1xFdEN+TC7N5TdywaBzf2dMXGJq/e2PQ==
SHA-256: 228bd64aaef23270dbdbd2cf3d5ef5c467602ef38c4066246cef1984adab9a67
```

Official Undici 6.29.1, 297,796 compressed bytes:

```text
URL: https://registry.npmjs.org/undici/-/undici-6.29.1.tgz
SRI: sha512-EvRlUt/QqAEvXdQeRMYUfwOQsfzpDztykrG2owGEE/rBOBoYv9uF39ZzsNDh4lTFHhTr2XOZjKkYgueD12ZmGA==
SHA-256: 29c4b8e0b2d86cb8795571c1959012ce057a14ecfd34858335f47c31e770a04f
```

The pristine npm tarball contains no `package-lock.json`, `npm-shrinkwrap.json`
or hidden `node_modules/.package-lock.json`. The replacement therefore does not
leave a shipped internal lockfile claiming Undici 6.29.0. A general dependency
install inside npm's own package directory would resolve unrelated development
dependencies and workspaces; it is not the preparation procedure.

## Verification contract

The managed profile records the original npm and replacement Undici inputs and
the resulting inventory fingerprint. Verification covers the full inventory and
file hashes, including unexpected, missing and changed files. Every npm file
outside `node_modules/undici` must match the official npm package; every file in
that subtree must match the official replacement package, including licenses.

The release build helper checks Node 24.22.1; source wrappers check their selected
Node runtime. Every managed npm invocation checks the profile integrity and the
actual Undici module resolved from npm's node-gyp consumer. Its location and
version must identify the managed 6.29.1 replacement. Merely checking
`npm --version` or an application's `npm audit` output is insufficient. A failed
profile check stops the command; it must not select an unpatched fallback.

Independent package-level validation has passed four regression cases that
reproduce the 6.29.0 unhandled-error crash and confirm safe handling with 6.29.1
through Client and RetryAgent. Seven node-gyp consumer checks passed on each
version, including redirects, gzip, retries, proxy bypass and custom-CA HTTPS.
These checks establish the dependency behavior; they do not by themselves
verify every integration entrypoint.

Final local integration passed: 18 security/integrity regressions, clean
application installs/builds/tests, all four package dependency-preparation
paths, PowerShell bootstrap fixtures, and shared renderer/holiday checks.
[REVIEW-1.3.0.md](REVIEW-1.3.0.md) records the evidence and remaining platform
limits. This closes the npm blocker; it does not authorize a commit or push. A later official npm update must receive the same
dependency inspection before removing this replacement.

The verified package contains 1,984 regular files. Its inventory fingerprint is
`9ebc2520cba8d11db8eb1ad2dcf01cc1f5be769a880631166553660c0837b0ca`.
It is SHA-256 over sorted UTF-8 lines of `relative-path`, NUL, byte length, NUL,
file SHA-256, and newline. Symlinks and unexpected files are rejected. The
metadata and command shims live outside this immutable package tree; shims
are separately checked for their expected contents and executable permissions.
