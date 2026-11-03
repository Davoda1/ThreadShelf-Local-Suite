# ThreadShelf Local Suite 1.4.2 verification record

## Scope

Reader and Alternative add an SVG / Code toggle for eligible chat code blocks. All three applications are aligned at 1.4.2; Analytics functionality is unchanged. Dependencies, Electron 45.1.0, development Node.js 24.22.1, managed npm 12.2.1 and ONNX Runtime 1.31.1 retain their existing pins. Profiles, archive/schema identifiers, speech providers/settings and packaging layouts remain unchanged.

The illustrated manual and screenshots retain their original 1.4.0 content and provenance. The root and application READMEs document the new controls. Historical review records and the versioned server patches are preserved.

## SVG preview behavior

- Eligible chat code blocks have no language tag, or an `svg` or `xml` tag, and contain one complete, valid SVG document. Whitespace and XML comments may surround the root.
- Raw SVG, strict Base64 and `data:image/svg+xml;base64,` input are supported. HTML containing SVG, extra content, malformed input and other language tags remain code.
- Code is the initial view. The per-block toggle changes only the view; Copy retains its existing source text, including the original Base64 representation.
- Previews use isolated image rendering. Scripts, interactivity and external resource loading are disabled. XML declarations, document types, entity declarations and processing instructions are rejected conservatively; parsing and input size are bounded.

## Local validation

- Reader: 758 tests total, with 754 passes, four expected optional skips and zero failures. Analytics: all 316 tests pass. Alternative: all 188 source and speech tests pass. Reader and Analytics production renderer builds pass at version 1.4.2.
- Focused SVG suites pass on the pinned Electron 45.1.0: 27 Reader and 32 Alternative fixtures cover eligibility, original Copy behavior in both views, lazy image decoding, malformed and hostile inputs, image failure fallback, cleanup and light/dark layouts. No external requests or page errors occur. Existing Mermaid rendering remains covered.
- The complete Chromium browser gate passes all ten scripts without skipped feature checks, including image rendering/queues, 380 cache-layout cases, visibility, ONNX WASM, Alternative JSON and both new SVG suites.
- The integration gate passes both Reader–Analytics 7z/ZIP6 workflows without skips, nine cache/storage checks, and five upgrade/rollback checks for each pinned public Reader 1.0.0 and 1.1.0 baseline. Both baseline checkouts remain unchanged.
- The rebuilt Reader standalone preview passes offline checks on Electron 45.1.0: raw SVG and Base64 previews decode, native clipboard text stays exact in both views, the public version is 1.4.2, and no HTTP requests or page errors occur. The test leaves the HTML bytes unchanged.
- The final Alternative demo passes the same offline raw/Base64 and exact-Copy checks on Electron 45.1.0, with no HTTP requests or page errors. Its visible About version is 1.4.2. All 188 Alternative tests pass again against the finalized metadata.
- Release/native-speech gates, package validators, source-companion verification, server-patch safety, managed npm integrity and matcher/archive regressions: 391 tests pass. The 39 checks affected by final packaging metadata edits pass again.
- Windows PE resource validation confirms numeric file/product versions 1.4.2.0 and matching string metadata. Only the resource section changes; this is a static metadata check, not Windows execution.
- Reader, Analytics and diagram-helper lockfile audits report zero known vulnerabilities at validation time. Package manifests and dependency locks retain their previous dependency contents; only the application version fields change.
- Independent diff review and bounded text scanning find no private references, credential patterns or private filesystem paths in the changed/new files. Public-tree and whitespace checks pass. Automated scanning is not a guarantee that every possible secret can be detected.

Local preparation and validation are complete. No dependency updates or unrelated application changes were required.

## Speech-cache repair follow-up

Windows source validation exposed a stale negative validation result: restoring a valid pinned recording could leave it unavailable when its size and reported timestamps matched the previously rejected file. Reader and Alternative now memoize successful file validation only. Previously rejected candidates are rechecked, while positive memoization, streaming limits, playback digest verification and pinned-original protection remain intact.

The existing end-to-end regression now holds the target file's reported timestamps constant. It reproduces the original failure before the fix and passes afterward, retaining every original pin, replacement and playback assertion without adding sleeps or retries. Both focused speech suites pass all 113 tests, and an independent same-metadata check confirms repaired bytes become available while healthy entries retain the fast path.

Full rechecks pass: Reader has 754 passes and four expected optional skips (758 total), Alternative has 188 passes without skips, and all 34 publication/release-gate tests pass. The shared implementation and tests remain byte-identical between the two applications. Native Windows confirmation remains a CI requirement.

## Native release gates and limits

No GitHub commit, tag, CI run or release publication is part of this preparation record. Local source checks do not establish native Windows behavior or a completed release.

The existing release workflow requires all six native package jobs, archive/runtime validation, native GUI checks, packaged CPU speech evidence for Reader and Alternative, rendering checks and exact tagged-commit publication ledgers. Final asset names, sizes and SHA-256 digests must match before publication. The release asset layout and unchanged dependency-source companions retain their existing policy.
