# ThreadShelf Local Suite 1.4.1 verification record

## Scope

This patch addresses dependency vulnerabilities and updates release metadata. Reader, Analytics and Alternative are aligned at 1.4.1. Existing application interfaces, speech features, settings, profile locations and archive/schema identifiers are retained. Electron 45.1.0, development Node.js 24.22.1, managed npm 12.2.1 and ONNX Runtime 1.31.1 remain pinned. The illustrated manual and screenshots retain their original 1.4.0 content and provenance.

## Security changes

- Reader and Analytics use minimatch 11.0.2 for GHSA-g3hv-75wg-m249 (CVE-2026-118764), which concerns hostile glob-pattern amplification.
- Both applications use glob 14.0.3 for GHSA-3g3m-2fjr-6pw4 (CVE-2026-118773), which concerns filesystem traversal continuing after cancellation. The actual bundled glob entry point is checked as well as the separately resolved minimatch module.
- Reader's holiday-data build replaces unpatched deepmerge 4.3.1, affected by GHSA-gcqx-w48m-w2h4 (CVE-2026-93753), with a small local adapter around pinned @fastify/deepmerge 3.2.4. It retains the pinned parser's merge-all and array concatenation contract while rejecting prototype-modifying keys. The shipped holiday engine is regenerated with this implementation; its attribution and notices are refreshed. The rule JSON retains exactly the same parsed content, with some property ordering differences.

## Local validation

- Reader: 754 tests total, with 750 passing, four expected optional skips and zero failures. Analytics: all 316 tests pass. Both production renderer builds pass at version 1.4.1.
- Six focused matcher/cancellation/archive regressions pass across Reader and Analytics. The bounded hostile-pattern cases fail the vulnerable original matcher and glob 14.0.2 bundled matcher, and pass the selected patched versions. Normal glob selection and Electron ASAR packed/unpacked file contents are preserved.
- npm audits report zero known vulnerabilities for Reader, Analytics, the holiday helper and the unchanged diagram helper at the time of validation.
- Holiday helper: 12 tests pass, including prototype-key rejection, merge compatibility and 207-country rule/event coverage. A clean copied source installation and its three merge-security tests also pass. Repeated generation yields identical engine, rule and notice hashes.
- Baseline committed holiday engine versus regenerated bundle: 226,665 daily comparisons for all 207 supported countries over 2025–2027, with zero differences.
- Alternative: 184 source/service tests and five speech-packaging regression tests pass.
- Release assembly, recovery and native speech gates: 34 tests pass.
- Source-companion verification and assembly: all nine test scripts pass (144 tests).
- Reader package validation: 71 tests; streaming archive writer: three tests. Analytics package validation: 54 tests. All pass.
- Managed npm integrity/security: 19 tests pass. Server patch installer safety: 16 tests pass.
- Independent diff review finds only security implementation/dependency changes, their regressions/notices, and release-version/documentation changes. No personal data, credential patterns, private filesystem paths or conversation references were found in the changed/new files. This is a bounded review, not an assertion that automated scanning proves every possible secret absent.

## Windows CPU cleanup follow-up

Native Windows package validation exposed a cancellation race: the Python worker could close before the process-tree termination command finished, leaving a native Pocket TTS descendant holding its temporary working directory. Both applications now wait for the termination command to close before removing the speech session. The command has a ten-second timeout; session removal uses bounded retries for transient filesystem locks and reports persistent cleanup failures.

Four new shared speech regressions cover the parent-closes-first ordering, taskkill launch failure, nonzero termination status and persistent cleanup errors. The two primary regressions fail the previous implementation and pass the corrected code. The shared speech service suite passes all 113 tests. The complete Reader source run passes 754 tests with four expected optional skips (758 total), and Alternative passes all 188 tests. The Reader and Alternative runtime copies remain identical.

Real Linux CPU validation passes nine buffered voice cases, four streaming voice cases, cancellation after initial audio for both engines, buffered fallback, exact streamed/final audio equality, and temporary-file cleanup. The long-path relocation case also passes. Native Windows confirmation remains a required release-workflow gate; Linux execution and simulated Windows event ordering do not substitute for that result.

## Native release gates and limits

A v1.4.1 tag push builds Reader, Analytics and Alternative on native Windows and Linux runners. The existing publication gates require all six package jobs, archive/runtime validation, native GUI checks, packaged CPU speech evidence for Reader and Alternative, rendering checks, and exact tagged-commit publication ledgers. Missing or failed evidence prevents publication. Uploads are verified against the complete asset names, sizes and SHA-256 digests before the draft becomes public.

The release contains nine native packages, two HTML previews, suite source ZIP/TAR.GZ, the unchanged offline manual in a versioned ZIP, verification Markdown/evidence ZIP and one SHA256SUM.txt (17 assets total). Existing dependency-source companions retain their original versioned locations and checksums.

This record reports local validation. It does not claim that GitHub CI has finished or that the release is already published. Windows execution and final packaged CPU/GUI results are recorded by the native workflow. System-wide DEB installation, every OS variant and real remote speech-provider availability are not asserted by local source tests. Synthetic test inputs do not include user archives or credentials.
