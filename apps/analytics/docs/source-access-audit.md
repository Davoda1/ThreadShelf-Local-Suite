# Read-only source access contract

Analytics reads selected Reader archives and supported export files. It writes only to positively identified Analytics-owned storage and to explicit export destinations outside source roots.

## Reader boundary

Reader capture validates the published archive pointer, catalog schema and checksums before projecting permitted catalog fields. A control envelope may contain unrelated Reader state that must be read to validate the envelope's checksum; bookmarks, reading positions/history and other excluded fields are discarded during projection and never become analytics. Analytics does not open Reader preferences, Activity caches, semantic indexes, browser data or unrelated profile files.

Capture reads a coherent publication, copies permitted data into an owned work job, and verifies publication identity before committing. Publication changes retry or produce an explicit stale/failure result; partial captured conversations are not published. Source directories and source files are never opened for writing, and Analytics does not acquire a Reader writer lease.

## Safety and ownership

Unknown formats, unsafe traversal, symlinks/junctions and hard-link aliases are rejected where the source contract requires regular files. Export destinations cannot overlap known or recognizable Reader sources. Cleanup enumerates positively owned Analytics jobs and namespaces; it cannot use a source reference as a deletion target. A disconnected source retains the prior complete owned capture for analysis.

The operating system may independently update file access times when a file is read. This is not a source write issued by Analytics.

## Verification

The automated suite covers source-access instrumentation, checksum validation, publication races, cancellation, simulated disk-full failures, source/output aliases, disconnected capture use and owned cleanup. Reader discovery tests use synthetic standard profiles. The live Reader test uses the adjacent public `../reader` source by default, or `READER_BASELINE_ROOT` when explicitly supplied, with a temporary synthetic profile. No personal capture is needed for tests.
