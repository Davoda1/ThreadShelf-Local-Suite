# Privacy, network use and source fidelity

## Local does not require a network connection

Ordinary Local reading, import, text search, bookmarks and Activity work from retained data on the computer. The source declares no telemetry. Imported HTML and component markup are treated as untrusted data; the renderer sanitizes supported content and does not execute imported application scripts.

The interface and rich rendering do not recreate a provider session. Opening an archived chart, automation suggestion or image query does not sign in to that provider or execute the original widget runtime.

## Actions that can use the network

| Action | Destination or effect |
| --- | --- |
| Built-in semantic Download model | Downloads model/tokenizer/configuration files from the model host |
| Built-in inference after setup | Uses the cached model locally |
| ThreadShelf Server read/search/Insights | Contacts the configured server |
| Copy from server | Reads selected collections from that server into Local |
| Ollama detection/test/index/search/download/remove | Contacts the configured local/private-network Ollama service |
| External conversation link | Opens the explicit supported destination through the system's external-link action |
| Source build scripts | Download/check selected toolchain and dependencies as documented by the source project |

Do not confuse a local application with a guarantee that every optional action is offline. Before indexing an archive with Ollama, check the configured Ollama address because message chunks are sent there for embeddings. The Ollama test action is narrower and uses only a synthetic sentence.

## Source text and display transformations

The app can repair a Mermaid diagram for viewing, lay out supported rich components, calculate a chart share, or highlight a search match without modifying archived source text. Whole-message Copy preserves original retained text. The exact-value table preserves saved chart numbers. Passive fallbacks retain unsupported content rather than running it.

Where native provider mapping metadata is present, citation association uses exact message/reference identities. Missing metadata is not reconstructed from a title or unrelated supporting source. Query-only images use local placeholders and do not initiate an image request. These behaviors preserve fidelity even when they produce a less complete visual than the original provider website.

## Sensitive content in exports and reports

Conversation Markdown/JSON, backups and Analytics captures can contain private messages, prompts, code, filenames, source records and associated metadata. A report that looks like aggregate statistics can still include sampled excerpts or conversation titles depending on the report options. Review the specific export controls and selected scope before sharing it.

A Local backup is a recovery artifact, not a redacted publication. Keep it in storage with appropriate access controls. Deleting a record in Reader does not erase separately exported files, original provider exports or an already captured Analytics dataset.

## Profiles and logs

The application profile includes conversation storage, settings, saved reading, indexes, downloaded models and Chromium session/log/crash-report data. A full-profile copy can therefore contain more personal material than a data-only backup. Use **Open data folder** to inspect the actual destination rather than assuming portable programs store all data beside the EXE.

For support, prefer a concise description, application version, exact error and a synthetic minimal example where possible. If a private export is needed to reproduce a parser problem, retain it securely and understand the export’s contents before handing it to anyone.

Related: [Backups](backup.md), [Rich reading](../Reader/reading.md), [Local Analytics](../Analytics/index.md).
