# Audited pure parser subset

These modules contain data parsing only. No Reader service, storage lifecycle,
settings, reading state, activity cache, database writer, restoration code,
converter export code, or provider network client is included.

- `gemini.mjs`: the MIT Gemini Takeout/My Activity inert HTML parser from
  Reader 3.1.0's AI Export Converter 1.2.1 subset, retaining parsed source cards
  and source indexes. File-import and conversion/export functions were removed.
- `json-bytes.mjs`: the strict UTF-8/16/32 JSON byte decoder only.
- `stream-json.mjs`: Reader 3.1.0's bounded UTF-8 JSON array/wrapper framer.
- `common.mjs`: JSON integer-preservation and SHA-256 helpers only.
- `venice-backup.mjs`: independent pure assembly/validation adapted from the
  audited Venice v4 / Dexie v1 reader. ZIP I/O belongs to Analytics ingestion.

Both applicable MIT notices are retained beside these modules. Tests use
generated synthetic exports. Private uploaded exports are not release fixtures.
