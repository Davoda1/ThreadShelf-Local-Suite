# Contributing

Use [Issues](https://github.com/Davoda1/ThreadShelf-Local-Suite/issues) for reproducible defects and focused proposals. Identify the application, suite release, operating system and package type. Include a minimal synthetic example rather than a real conversation export.

1. Create a branch from `master` and install the pinned tools in `maintainer/BUILD.md`.
2. Make a focused change in the relevant component. Keep unrelated applications and data formats unchanged.
3. Run that component's tests and build. For UI changes, inspect light and dark appearance and the 680×540 minimum window.
4. Update the relevant manual source, then rebuild `docs/`.
5. Run `python tools/check-public-tree.py` and review the files you are about to commit.
6. Submit a pull request explaining the problem, resulting behavior and tests actually executed.

Preserve read-only boundaries for Analytics and Alternative. Keep production Linux launch paths native and the Windows portable EXE at the ZIP root. Build scripts belong to source packages. Do not introduce telemetry, production sandbox bypass flags, private server defaults or automatic network calls without an explicit design discussion.

Dependencies require their source, version, license and attribution to be documented. Test screenshots and fixtures must use synthetic content. Contributions are supplied under this project's MIT license, subject to the existing licenses of third-party components.
