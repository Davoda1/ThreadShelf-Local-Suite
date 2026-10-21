# Release procedure

1. Review changes and ensure application version metadata agrees with the intended release.
2. Build the affected components with the pinned toolchain; run tests and package validators.
3. Rebuild the manual and check links, search and screenshots.
4. Run the public-tree check and review the complete source/release inputs for private data.
5. Stage exactly three packages per application: Windows ZIP, Linux TAR.GZ and DEB. Alongside them, include the suite Source archive, the Native-Sources companion and **every numbered Runtime-Sources part** described in the component source notices. Verify the runtime mirror with `python assemble-runtime-sources.py` after extracting all parts together.
6. Create a single release-level `SHA256SUM.txt` over the nine packages, the suite Source archive, the Native-Sources companion, every Runtime-Sources part and other explicitly listed distribution files. Do not hash the checksum file itself.
7. Verify checksums after copying or downloading the distribution.
8. Tag the reviewed source commit; create a draft GitHub release, attach files, review it and publish.

## Windows checksum verification

Run this PowerShell code from the extracted combined release directory. It accepts the SHA-256 manifest's two-space separator and fails on a missing file or mismatch.

```powershell
$failed = $false
Get-Content -LiteralPath '.\SHA256SUM.txt' | ForEach-Object {
    if ($_ -match '^([0-9a-fA-F]{64})  (.+)$') {
        $expected = $Matches[1].ToLowerInvariant()
        $relative = $Matches[2]
        if (-not (Test-Path -LiteralPath $relative -PathType Leaf)) {
            Write-Host "MISSING $relative"
            $failed = $true
        } else {
            $actual = (Get-FileHash -LiteralPath $relative -Algorithm SHA256).Hash.ToLowerInvariant()
            if ($actual -ne $expected) {
                Write-Host "MISMATCH $relative"
                $failed = $true
            } else {
                Write-Host "OK $relative"
            }
        }
    } elseif ($_.Trim()) {
        throw 'Malformed checksum manifest line.'
    }
}
if ($failed) { throw 'Checksum verification failed.' }
```

On GNU/Linux, use `sha256sum -c SHA256SUM.txt` from the same directory.

## Source archive versus release archive

The source archive is an extracted repository snapshot containing code, tests, notices, build tools and both editable/built documentation. It excludes `.git` history, ordinary installed dependencies, build caches, personal state and native release packages. Intentional vendored dependency source and required codec assets are retained.

The release archive is a distribution container. The nine inner native packages are the convenient individual GitHub Release downloads. The included `manual/` directory is the offline built manual. Extracting the container is required before installing a DEB or unpacking a portable application package.

The separate `ThreadShelf-Local-Suite-1.0.0-Native-Sources.tar.gz` supplies the covered native dependency sources, patches and build recipes. **All numbered** `ThreadShelf-Local-Suite-1.0.0-Runtime-Sources-*.tar.gz` parts supply the complete pinned runtime Git dependency graph and supplemental build sources/data described in the source manifest. Both companions are release assets beside the binaries; they are separate from the combined application release archive.

Offer the suite Source archive, Native-Sources companion and every Runtime-Sources part at the [same release location](https://github.com/Davoda1/ThreadShelf-Local-Suite/releases/tag/v1.0.0) as the matching binaries. Preserve component notices, manifests, provenance, build data and rebuild instructions. The release-level checksum manifest covers every source part as well as the individual packages and convenience archives. See [BUILD.md](BUILD.md) for verification/assembly commands and [runtime source access](../apps/reader/licenses/ELECTRON-SOURCE-ACCESS.md) for exact coverage and external SDK/tool prerequisites.
