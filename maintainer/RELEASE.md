# Release procedure

Version **1.3.0** aligns all three apps. The release contains nine native packages, two HTML previews, the exact tagged source ZIP/TAR.GZ, a verification report, verification-evidence ZIP, version-inventory workbook, ten matching runtime/ONNX source assets and one release-wide checksum. Preserve the separately linked, unchanged v1.0.0 Native-Sources offer for sharp/libvips. The [verification record](REVIEW-1.3.0.md) distinguishes candidate evidence from the final tagged release report.

1. Review changes and ensure application version metadata agrees with the intended release.
2. Build the affected components with the pinned toolchain; run tests and package validators.
3. Rebuild the manual and check links, search and screenshots if its content changes; preserve the existing manual for application-only updates.
4. Run the public-tree check and review the complete source/release inputs for private data.
5. Stage exactly three packages per updated application: Windows ZIP, Linux TAR.GZ and DEB. Include a complete source snapshot of the tested commit. Preserve direct links to unchanged applications and the Native-Sources companion and **every numbered Runtime-Sources part** described in the component source notices. Refresh source companions when their covered dependencies change. Keep the numbered 1.3.0 source ZIP parts intact; extract only their metadata ZIPs and use the offline assemblers described in [source verification](RUNTIME-SOURCE-PREPARATION.md).
6. Create a single release-level `SHA256SUM.txt` covering every asset attached to the new release except the checksum file itself. Keep unchanged assets and their original checksum manifest in the earlier release; do not rename them as a new application version.
7. Verify checksums after copying or downloading the distribution.
8. Squash-merge only after the final candidate checks pass, with a descriptive title and body. Tag that exact merged commit and require its Checks workflow and all six package jobs to pass. Use those tagged CI artifacts for final package/privacy review.
9. Stage the source assets in an unpublished draft as needed. Complete the external final asset ledger, verification report/evidence and single checksum; reconcile all uploaded sizes/digests and source availability. Publish the prepared draft only after those gates pass, then recheck public tagged URLs and assets.

For **1.2.0**, Reader and Alternative supply six new native packages, two HTML previews, the complete source ZIP/TAR.GZ and a verification report, plus one checksum manifest. Analytics remains **1.0.0**. The offline manual, Native-Sources and all three Runtime-Sources parts remain at **v1.0.0**. The root README and release notes link to the exact current component downloads across the current and earlier releases. The old combined `1.0.0-Releases.tar.gz` remains a historical 1.0.0 bundle.

## Windows checksum verification

Run this PowerShell code in a directory containing the files listed in the chosen release's checksum manifest. It accepts the SHA-256 manifest's two-space separator and fails on a missing file or mismatch. If downloading individual files only, compare their `Get-FileHash -Algorithm SHA256` output with the corresponding manifest entries.

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

The historical 1.0.0 combined release archive is a distribution container with nine native packages and an offline manual. Versions 1.1.0 and 1.2.0 use individual component downloads and does not replace that historical container.

The separate `ThreadShelf-Local-Suite-1.0.0-Native-Sources.tar.gz` supplies the covered native dependency sources, patches and build recipes. **All numbered** `ThreadShelf-Local-Suite-1.0.0-Runtime-Sources-*.tar.gz` parts supply the complete pinned runtime Git dependency graph and supplemental build sources/data described in the source manifest. Both companions are release assets beside the binaries; they are separate from the combined application release archive.

Offer direct links to the current suite source and all applicable shared source companions beside the binary downloads, even when unchanged companions remain in an earlier release. Preserve component notices, manifests, provenance, build data and rebuild instructions. Use each asset's original release checksum manifest. See [BUILD.md](BUILD.md) for verification/assembly commands and [runtime source access](../apps/reader/licenses/ELECTRON-SOURCE-ACCESS.md) for exact coverage and external SDK/tool prerequisites.
