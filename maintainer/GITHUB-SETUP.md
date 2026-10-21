# Publish ThreadShelf Local Suite on GitHub

This guide targets the existing repository **https://github.com/Davoda1/ThreadShelf-Local-Suite**. The suite is an independent repository with component subdirectories. Upstream attribution is supplied through documentation and dependency notices.

## 1. Extract the correct archive

Extract `ThreadShelf-Local-Suite-1.0.0-Source.tar.gz`. Enter the resulting `ThreadShelf-Local-Suite` directory; `README.md`, `apps/`, `server-patch/` and `docs/` must be directly inside it. Commit this extracted tree. Upload the native application packages separately as release assets.

Windows PowerShell and Linux Bash both support:

```text
tar -xzf ThreadShelf-Local-Suite-1.0.0-Source.tar.gz
cd ThreadShelf-Local-Suite
```

Install Git if it is not already available. The source archive contains no `.git` history.

## 2. Choose a public-safe Git identity

Git commits carry an author name and email address. On GitHub, open **Settings → Emails**, enable **Keep my email addresses private**, and copy the exact GitHub-provided `noreply` address shown for your account. The address can contain an account-specific numeric prefix; do not guess it. Enable the option to block command-line pushes that expose your personal email if available.

Initialize the repository and set identity locally for this repository. Replace the placeholder with the exact GitHub `noreply` address before running the email command:

```text
git init -b master
git config --local user.name davoda1
git config --local user.email "YOUR_GITHUB_NOREPLY_ADDRESS"
git config --local user.useConfigOnly true
git remote add origin https://github.com/Davoda1/ThreadShelf-Local-Suite.git
```

On Windows, also run `git config --local core.longpaths true` before staging the supplied synthetic test fixtures. Use a short checkout directory.

For authentication, use Git Credential Manager, GitHub CLI authentication, or an SSH key. Never place a token in a remote URL, source file, script or `.env` committed to this repository.

## 3. Inspect and make the first push

From the extracted repository root:

```text
python tools/check-public-tree.py
git add .
git diff --cached --stat
git status
git commit -m "Release ThreadShelf Local Suite 1.0.0"
git log -1 --format=fuller
git push -u origin master
```

Review the displayed commit identity before pushing. If it is wrong and the commit has not been pushed, correct the local configuration and use `git commit --amend --reset-author --no-edit`, then check it again.

The supplied source tree includes required vendored source and assets. The included `.gitignore` keeps ordinary dependencies, build output and private state out of Git while retaining Alternative's intentional vendored build dependencies. Do not replace it with a blanket rule that drops those files.

If GitHub rejects a push because the remote already contains commits, inspect the remote history first. For a repository initialized with a README/license through the website, clone that repository into a new directory and copy the extracted source contents into the clone; review and commit there. Do not force-push over history you intend to keep.

The delivered source has been checked for oversized files. If future work introduces a large asset, decide whether it belongs in release assets or Git LFS before committing it; document any new retrieval prerequisite.

## 4. Configure the repository

Use the **About** settings on the repository home page:

- **Description:** `Desktop readers, local archive analytics, and search integration tools for ThreadShelf, with an illustrated user manual.`
- **Website:** `https://davoda1.github.io/ThreadShelf-Local-Suite-Manual/`
- **Topics:** `threadshelf`, `chat-archive`, `desktop`, `electron`, `local-first`, `analytics`, `windows`, `linux`, `semantic-search`.

Under **Settings → General**, keep **Issues** enabled so the provided templates are available. Enable Discussions only if you want a separate discussion space. Confirm that `master` is the default branch. After validation, the repository's visibility can be changed to public through the visibility controls. Review GitHub's confirmation dialog before making that change.

Under the repository's security settings, enable **private vulnerability reporting** if offered. This activates the reporting route described in `SECURITY.md` without requiring a personal email address.

## 5. Use the supplied Actions workflows

The workflows pin external actions to full commit IDs and Node.js to 24.19.0. They need no personal secret for ordinary builds.

Under **Settings → Actions → General**, permit the GitHub-owned actions used by the workflows. Keep default workflow permissions at **Read repository contents**. Fork pull requests must not receive secrets or a write token.

- **Checks:** validates the public tree and runs component checks.
- **Build desktop packages:** builds Windows and Linux artifacts when a version tag matching `v*` is pushed. It can also be run manually from the Actions tab.

The build workflow uploads workflow artifacts for review. It does not create a GitHub Release or change repository visibility. Download the artifacts, review job results and test native startup on the target systems before publishing a later release.

## 6. Publish the manual with GitHub Pages

The hosted manual is **https://davoda1.github.io/ThreadShelf-Local-Suite-Manual/**. The public website repository, **https://github.com/Davoda1/ThreadShelf-Local-Suite-Manual**, contains only generated documentation and required notices. The main suite repository can remain private. Pages is disabled on the main repository because the current account plan does not support Pages from a private repository.

The static site is built in `docs/`; reading it does not require PHP or Node.js. It includes `.nojekyll` and uses relative navigation suitable for the website path. `manual/content/.site.json` sets the matching canonical base URL.

The website repository uses these settings:

1. Under **Settings → Pages**, select **Deploy from a branch**.
2. Choose **master** and **/(root)**, then **Save**.
3. Keep HTTPS enforced and leave the custom-domain field empty.
4. Wait for **pages-build-deployment** to succeed.
5. Check navigation, search, screenshots and a deep-linked chapter beneath `/ThreadShelf-Local-Suite-Manual/`.

After editing the manual:

1. Run the rebuild command in `manual/README.md`, then commit both the editable manual source and refreshed `docs/` output in the main suite repository.
2. Clone or update the manual website repository in a separate directory.
3. Replace the previously published generated files with the **contents** of `docs/`, including `.nojekyll`; do not add a surrounding `docs` directory. Remove generated files that no longer exist in the rebuilt output.
4. Retain the website's `README.md`, suite `LICENSE`, Gopher `GOPHER-LICENSE.txt` and `THIRD-PARTY-NOTICES.md`. Review any changed asset notices before publishing.
5. Review the diff for private data and unintended files. Commit and push the website repository's `master` branch, then wait for Pages deployment and verify the live site.

Copy only generated documentation and required notices into the public website repository. Do not copy the main repository's `.git`, application sources, release packages, environment files, local state or credentials. GitHub serves the published manual publicly, even while the main repository is private. Links to the main repository and desktop downloads become available to unauthenticated visitors when that repository is made public.

Keep the main repository's **About → Website** field set to the hosted manual URL. Publishing the main repository later does not require moving the manual or changing that URL.

## 7. Create release 1.0.0

Extract `ThreadShelf-Local-Suite-1.0.0-Releases.tar.gz` into a separate directory. It contains nine native packages, an offline manual, release notes and one `SHA256SUM.txt`.

Verify it on Linux:

```text
sha256sum -c SHA256SUM.txt
```

On Windows PowerShell, use the validation script in `maintainer/RELEASE.md`.

Create an annotated tag from the reviewed commit:

```text
git tag -a v1.0.0 -m "ThreadShelf Local Suite 1.0.0"
git push origin v1.0.0
```

On GitHub, open **Releases → Draft a new release**, choose `v1.0.0`, use the title **ThreadShelf Local Suite 1.0.0**, and copy the prepared release notes. Attach the **nine individual application packages**, `ThreadShelf-Local-Suite-1.0.0-Source.tar.gz`, `ThreadShelf-Local-Suite-1.0.0-Native-Sources.tar.gz`, **every numbered** `ThreadShelf-Local-Suite-1.0.0-Runtime-Sources-*.tar.gz` part, and `SHA256SUM.txt`. Keep the suite source and both complete source companions available beside the binary downloads. You may also attach the combined release TAR.GZ as a convenience download. GitHub automatically offers source archives of the tag; those are separate from the supplied validated source archive and dependency companions.

Save the release as a draft while reviewing the release assets. Check that the version, target architecture, download names and manual link are correct, then publish when ready.

## Official GitHub references

- [Adding locally hosted code](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github)
- [Setting your commit email address](https://docs.github.com/en/account-and-profile/how-tos/email-preferences/setting-your-commit-email-address)
- [Configuring a Pages publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [Managing releases](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)

These instructions were updated on 2026-10-21. GitHub may change menu labels; the linked official documentation is the reference for later changes.
