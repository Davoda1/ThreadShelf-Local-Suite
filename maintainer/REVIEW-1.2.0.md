# Reader and Alternative 1.2.0 — release scope and validation

This release updates the public Reader and Alternative from commit `07ba8221176def076c394d07ef0057fac69c59d4`. Analytics stays at 1.0.0. The manual, server patch, dependency locks and runtime pins are unchanged.

## Behavior and compatibility

Useful JSON-only assistant and reasoning responses render as indented, highlighted code. The formatter preserves original string and number tokens, including large numbers and duplicate keys. Message copy and export retain the original source; code-block copy uses the formatted display. Embedded HTML, links, rich-content markers and mathematical notation remain literal JSON text. Existing filtering continues to hide empty and internal-only responses. User messages, Markdown and already fenced code retain their existing behavior.

Both applications use canonical file URLs at startup, avoiding mismatches for installation paths containing percent characters. Alternative also accepts literal backslashes in POSIX filenames while preserving Windows encoded-separator rejection. Exact file, owning WebContents and main-frame IPC checks remain in place. Reader's PowerShell development helper can invoke bundled npm through Node without requiring a standalone npm wrapper.

Public application/profile names, archive schemas, settings identities, image controls and Reader's independent optional resource cache are retained. The public Reader's image-host restrictions remain unchanged. Alternative retains its stronger state recovery and image-request credential filtering. It does not acquire a persistent resource cache. Public loopback defaults, synthetic demonstration data, sanitized media and third-party attribution remain in place.

## Validation gates

The [Checks workflow](https://github.com/Davoda1/ThreadShelf-Local-Suite/actions/workflows/checks.yml) runs Linux and Windows source tests and builds, existing image/cache/layout regressions, JSON rendering and copy checks, and Reader archive integration. Profile tests use the exact public 1.0.0 and 1.1.0 source baselines, exercise upgrade and downgrade, and compare original profile/archive bytes and source text. Windows also runs the bundled-npm PowerShell regression fixture. Existing optional model/platform skips remain explicit.

The [desktop package workflow](https://github.com/Davoda1/ThreadShelf-Local-Suite/actions/workflows/build.yml) builds the pinned releases on Windows and Linux. It validates archive contents, runtime identity and native entry points, then launches the extracted ZIP, TAR.GZ and DEB applications with Chromium's sandbox enabled. Synthetic native checks cover JSON rendering, hidden responses, raw message versus formatted code clipboard behavior, settings persistence and unchanged package bytes. Alternative's JSON fixture invokes its shipped renderer and native clipboard API; its existing built-in demo is also exercised. DEB payload execution is not a system-wide installation test.

Source, fixtures, preview content and release inputs are reviewed for credentials, private names/email addresses, personal websites, machine paths and identifying media metadata. Legitimate public project attribution and third-party copyright/license notices are retained. Private archives, configuration and development evidence are excluded from release assets.

## Release contents

The release contains six native packages (Windows portable ZIP, Linux TAR.GZ and DEB for each updated application), two self-contained synthetic HTML previews, complete Suite Source ZIP and TAR.GZ, a verification report and one `SHA256SUM.txt`. Windows packages retain a native EXE at their root. Linux entries resolve directly to native executables; no launcher wrappers are added.

Source archives are snapshots of the final tagged commit, without Git history, installed dependencies, test logs, caches or build staging. Analytics, the offline manual and applicable Native-Sources/Runtime-Sources companions remain linked at v1.0.0. Node.js 24.19.0, npm 11.9.0 and Electron 44.9.1 remain pinned. No `-latest` runtime variant is introduced.

The [release verification report](https://github.com/Davoda1/ThreadShelf-Local-Suite/releases/download/v1.2.0/ThreadShelf-Local-Suite-1.2.0-Verification.md) records the actual commit, workflow results, asset hashes and execution limits. Publication follows successful source and package workflows; this scope document alone is not evidence that a particular run passed.
