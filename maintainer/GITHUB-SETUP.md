# Maintain ThreadShelf Local Suite on GitHub

The application repository is [Davoda1/ThreadShelf-Local-Suite](https://github.com/Davoda1/ThreadShelf-Local-Suite). The generated manual is published from [Davoda1/ThreadShelf-Local-Suite-Manual](https://github.com/Davoda1/ThreadShelf-Local-Suite-Manual) at **https://davoda1.github.io/ThreadShelf-Local-Suite-Manual/**. Both repositories are public and use `master` as their only branch.

## 1. Work from the existing repository

Clone the repository to preserve its history and release tags:

```text
git clone https://github.com/Davoda1/ThreadShelf-Local-Suite.git
cd ThreadShelf-Local-Suite
git switch master
git pull --ff-only
```

For an existing checkout, confirm that the working tree is clean before updating it. On Windows, use a short checkout path and enable Git's long-path support before checkout when needed: `git -c core.longpaths=true clone https://github.com/Davoda1/ThreadShelf-Local-Suite.git`.

The published source archive is also available for inspection and builds. Its root directory includes the version and `-Source` suffix:

```text
tar -xzf ThreadShelf-Local-Suite-1.4.2-Source.tar.gz
cd ThreadShelf-Local-Suite-1.4.2-Source
```

The source archive has no `.git` history. Make repository updates in a clone; do not initialize a replacement repository or force-push over the existing history.

## 2. Set a public-safe Git identity

Git commits expose their author name and email address. In GitHub's account email settings, enable email privacy and copy the exact GitHub-provided `noreply` address. Configure it locally in the clone:

```text
git config --local user.name davoda1
git config --local user.email "YOUR_GITHUB_NOREPLY_ADDRESS"
git config --local user.useConfigOnly true
```

Replace the email placeholder before committing. Use Git Credential Manager, GitHub CLI authentication, or an SSH key. Never put credentials in remote URLs, source files, committed scripts or environment files.

Before committing, run the appropriate tests and `python tools/check-public-tree.py`. Stage the intended files, inspect `git diff --cached`, and check `git log -1 --format=fuller` before pushing. Preserve the supplied `.gitignore`: Alternative intentionally retains vendored build dependencies, while ordinary dependencies, build outputs and private state remain excluded.

## 3. Repository settings

Keep `master` as the default branch, Issues enabled, and the application repository's **About → Website** field set to the hosted manual URL. Keep application and manual repositories public so download and documentation links remain available.

Under the security settings, enable private vulnerability reporting if offered. This provides the reporting route described in [SECURITY.md](../SECURITY.md) without publishing a personal email address.

Under **Settings → Actions → General**, permit the actions used by the checked-in workflows. Keep default workflow permissions read-only; publication jobs request their required write permissions explicitly. Fork pull requests must not receive secrets or write tokens. Ordinary builds and publication use GitHub's workflow token and require no personal access token in repository secrets.

## 4. Checks and package builds

The workflows pin external actions to full commit IDs and Node.js to 24.22.1. The verified managed npm 12.2.1/Undici 6.29.1 profile is documented in [NPM-TOOLCHAIN.md](NPM-TOOLCHAIN.md).

- **Checks** runs source, public-tree, integration and packaging regressions on pushes to `master`, pull requests, or manual dispatch.
- **Build desktop packages** builds Reader, Analytics and Alternative on Windows and Linux when a version tag is pushed. Manual dispatch can build all components or a selected subset.
- A **manual package build uploads workflow artifacts only**. Its publication job is skipped by design.
- A **tag push builds and validates all six application/platform combinations, then automatically publishes** after the release assembly and upload checks pass.

For a new release, update application versions, `tools/release-versions.json`, release documentation and screenshots as needed. Review the completed source checks and any preparatory native builds before pushing an annotated stable `vX.Y.Z` tag at the reviewed commit. The publisher requires that the tag match every application's version. Pushing that tag authorizes automatic publication; do not use a release tag merely to request a trial build.

The published `v1.4.0` tag must remain unchanged. Its release contains nine native packages, two HTML previews, suite source ZIP/TAR.GZ, the offline manual ZIP, verification report/evidence ZIP and one `SHA256SUM.txt`. Existing dependency-source companions retain their original versions and download locations; see the source-access table in [README.md](../README.md).

## 5. Recover a failed publication

Use **Publish validated release** from `master` when the tagged build's six package jobs succeeded but publication failed. Supply:

- `tag`: the existing stable release tag, such as `v1.4.2`.
- `source_run`: the numeric ID of that completed **tag-push** package workflow run.

The recovery workflow checks the repository, tag, commit and all six successful package jobs, then downloads their existing artifacts. A manually dispatched package build is not an accepted recovery source. Corrected publisher code comes from `master`; application sources and documentation are archived from the original tag.

Recovery reuses matching draft assets and verifies names, sizes and SHA-256 digests before publication. It refuses to replace a published release with different bytes. Do not move the tag or remove a draft simply to retry publication. If a package job failed or an artifact expired, resolve that condition before choosing the next release action.

After publication, review the release assets, verification report and checksums. For a complete local download, run `sha256sum -c SHA256SUM.txt` on Linux. Verify native startup on the supported systems; external speech-provider availability is separate from the offline package checks.

## 6. Update the hosted manual

Editable manual sources and the builder live under `manual/` in the application repository. The generated site lives in `docs/`; it requires no PHP or Node.js to read. Build and validate it using [manual/README.md](../manual/README.md), then commit the editable sources and generated output together.

The manual repository publishes the contents of `docs/` at its root, including `.nojekyll`. In **Settings → Pages**, use **Deploy from a branch**, `master`, and `/(root)`. Keep HTTPS enforced and leave the custom domain empty.

To synchronize a manual update:

1. Clone or update the manual repository in a separate directory.
2. Copy the generated **contents** of `docs/` into that repository's root, removing obsolete generated files. Do not add an enclosing `docs/` directory.
3. Retain the website `README.md` and the generated suite `LICENSE`, Gopher `GOPHER-LICENSE.txt` and `THIRD-PARTY-NOTICES.md`.
4. Review the diff and commit to `master`. Copy only generated documentation and its required assets/notices; application sources, release packages, profiles and credentials belong outside this website repository.
5. Check the completed Pages deployment and verify live navigation, search, screenshots and a deep-linked chapter.

The hosted manual URL remains the same across application releases. No Pages site is needed in the application repository.

## Official GitHub references

- [Cloning a repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/cloning-a-repository)
- [Setting your commit email address](https://docs.github.com/en/account-and-profile/how-tos/email-preferences/setting-your-commit-email-address)
- [Configuring a Pages publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [Managing releases](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)

These instructions describe the workflows and repository layout used for 1.4.2. Review the checked-in workflow definitions when changing the release process.
