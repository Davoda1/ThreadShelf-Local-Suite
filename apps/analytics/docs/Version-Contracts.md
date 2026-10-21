# Version contracts

The public application version is **1.0.0**. It is independent of persisted data formats. Resetting the product release number must not relabel stored data or disable compatibility readers.

| Contract | Current identity |
| --- | --- |
| Application/product | `1.0.0` |
| Root ownership marker | `threadshelf-local-analytics:1` |
| Owned storage | Format `2`, namespace `analytics-v2` |
| Normalized capture schema | `2` |
| Adapter/content producer | `2.0.0`; supported legacy producer `1.0.0` |
| Explorer schema | `2.0.0` |
| Explorer algorithm | `explorer:2.0.0` |
| Legacy analytical filter contract | `analytics-filters:1` |
| Combined Explorer filter contract | `analytics-filters:1+explorer:2` |
| Current report format | `analytics-report:2` |

Source constants and validators are authoritative. Unknown formats fail closed or are retained with an explicit unsupported status; they are not silently reinterpreted. Existing supported legacy captures can be reindexed from full owned text. Historical exports are never rewritten. See [storage formats](Storage-Formats.md), [architecture](Explorer-Architecture.md), and [report definitions](counting-and-reports.md).
