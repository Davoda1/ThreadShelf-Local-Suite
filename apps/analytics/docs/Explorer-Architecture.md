# Architecture and boundaries

The main process owns only Analytics data and exposes a fixed IPC operation list to a sandboxed, isolated renderer. Source dialogs register read-only inputs. Source access and Reader capture do not invoke Reader startup or storage writers. Linux input handles are descriptor anchored; Windows uses compatible Node shared-file handles and repeated identity checks, with weaker protection against a hostile concurrent path replacement than Linux descriptor anchoring. Neither is a kernel isolation guarantee.

The storage namespace preserves the original legacy marker and files. Versioned mutable state is published atomically; immutable captures are fingerprint referenced. Derived indexes validate their algorithm/schema version and compressed base fingerprint. Owned full text is analyzed in desktop workers before excerpts cross IPC. Renderer calculations consume numeric indexes and retained metadata and never assume an excerpt is the full text.

The browser calculation worker retains chart evidence indexes; renderer payloads strip identity lists and lazy evidence resolver functions. Explicit evidence requests resolve the exact bin/cell/edge population and return paginated excerpts. All exact numerical tables remain distinct from bounded SVG presentation. Parser-derived measurements are new metrics; legacy regex counts keep their machine identifiers and definitions.

Optional capture history is disabled initially. A protected prior active capture supports recovery independently of user history retention. Garbage collection scans positively owned Analytics generations/blobs only; it never traverses source references. The original 1.0.0 rollback files are preserved separately and are not updated to reflect subsequent 2.0.0-only edits. Legacy and new versions must not write concurrently.

Safe Markdown creates allowlisted markup from parser tokens. Source HTML remains escaped; images become text. Source URLs occupy no loading/navigation attributes. Explicit link buttons use the narrow HTTP(S) external-open route. Original source and code copy payloads are separate from presentation markup.

The release does not add a server dependency. Provider fields without verified semantics produce unavailable metrics with reasons; they never become zero or inferred consumption, cost, latency or answer quality.
