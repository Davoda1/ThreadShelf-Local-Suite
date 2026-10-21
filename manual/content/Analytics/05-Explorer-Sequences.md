# Explorer: sequences, observability and capture history

[Analytics manual](index.md)

These Explorer families require more than visible conversation text. Original parent links, event identities, timestamp precision, verified field meanings or actual historical captures may be necessary. A chart that reports Unavailable with a specific reason can be functioning correctly: it is refusing to manufacture evidence the export did not preserve.

## Sequences and retained structure: families 19–24

| Family | What to use it for | Required interpretation |
| --- | --- | --- |
| 19 Selected-path ladder and model transitions | Inspect retained message/object order and verified reply-to-reply model transitions | Choose a conversation in the retained-path control. Non-message roots and filtered gaps remain visible. Filtering does not create a new parent relationship between newly adjacent visible replies. |
| 20 Retained branches and versions | Inspect message/non-message topology, selected and alternative nodes, branch points and retained versions | The detailed graph uses neutral node labels for the scoped conversation. Missing parents and cycles make structural completeness limited. Alternative versions are not automatically retries or extra costs. |
| 21 Depth and alternatives relationships | Compare verified retained-parent depth with alternatives | Explorer depth counts parent edges with root depth 0. Missing/unverified parents and cycles make depth unavailable. Structural all-retained context is distinct from selected text totals. |
| 22 Call/output association | Examine recorded calls and zero, one or multiple retained matching outputs | Selected-only association is the default; Conversation context is an explicit alternative. Reused ambiguous identifiers do not silently assign an output to multiple calls. Missing output does not prove failure. |
| 23 Recorded durations and lifecycle lanes | Inspect validated duration distributions, source-item intervals or verified task lifecycle spans | Units and scope must be verified. Creation/completion endpoints alone may establish only an item interval. Execution concurrency needs suitable task identity and verified lifecycle semantics. |
| 24 Usage and context observations | Inspect audited request fields, input/output pairs and supplied context occupancy | Generic consumer-export counters can remain unavailable to this strict family. Context needs a total and a positive limit from the same observation; no current model lookup fills a historical limit. |

The ladder's conversation selection is not a global filter. It scopes the detailed retained-path view. The shared selection and contract still describe which records can contribute. Inspect parent and branch provenance when a ladder has gaps or a graph is incomplete.

Call/output counts use distinct scoped identities. Repeated display copies do not multiply events. Outputs without a matching call remain separate, and a call identifier reused ambiguously is labeled as such. Tool indicators are not promoted to invocations merely because their names resemble a tool.

Duration values need a unit and a scope. A nonnegative numerical value named executionTime is not sufficient if the export does not establish what it measures. A recap duration can remain a recap duration; a recorded item interval can remain an item interval. Lifecycle lanes do not claim elapsed model inference time or costs unless the source provides the required verified semantics. Unknown duration is not an observed zero-duration operation.

Usage fields are also kept separate. Input, output, cached, reasoning and total values can overlap. The stricter family requires a matching verified provider/export audit, including field meaning, scope and unit. A generic verified flag inside imported data is not a substitute for that audit. Context occupancy is independently measured from supplied totals/limits and must not be summed with request token usage.

## Comparison families 25–28

These appear in Explorer Compare and use explicitly applied A/B selections. The full workflow is in [Compare, evidence and reports](06-Evidence-and-Reports.md).

| Family | Interpretation |
| --- | --- |
| 25 Aligned-bin selection differences | Aligns category, model or day keys and displays exact A/B available text-volume totals and signed B−A changes. Relative change requires A greater than zero. Unavailable text remains unavailable. |
| 26 Distribution and quantile shifts | Compares reply/content-length histograms, ECDFs and R7 quantiles with common bins and both sample sizes. It describes these archive populations; it does not assert statistical significance. |
| 27 Selection identity intersections | Separates intersections of scoped conversation identities from intersections of exact normalized prompt wording. Equal wording does not prove the same request. Membership weights do not create duplicate set identities. |
| 28 Contribution to aggregate change | Decomposes compatible additive character-volume change by category, model or day. Component sum, total and residual check arithmetic. This is not a causal explanation, and medians/percentages are not additive components. |

## Observability families 29–32

| Family | What it explains |
| --- | --- |
| 29 Metric observability matrix | Shows eligible and available populations by format/provider for text, precise original dates, original traces, duration/usage/context candidates and retained parent relationships. A conversation capability flag does not establish every record's completeness. |
| 30 Diagnostic and representation profile | Shows explicit diagnostic and source-representation limitations. A warning with no unambiguous record association remains a conversation-level occurrence. It is not an AI answer-quality score. |
| 31 Coverage change alongside metric change | Places A/B values beside the same metric's eligible/available counts and fractions. A numerical increase with reduced coverage can warrant a different interpretation. Missing values remain unavailable. |
| 32 Source-capture history and differences | Compares two actual retained captures for scoped additions, removals, content changes, selected paths and capabilities. Capture dates are observation provenance, not activity dates. |

When an observational matrix reports a low fraction, open the contract and associated evidence. For example, conversation-date filtering cannot make original clock timestamps available. Imported normalized text may support character volume while lacking original parent links. Such differences should guide what comparisons are defensible.

## Enable and bound capture history

Capture history is **disabled by default**. It is separate from the current active snapshot and separate from the original Analytics 1.0 rollback baseline.

1. Open Sources & settings.
2. Locate Capture history.
3. Enable retention.
4. Set the retained capture count and history size limit.
5. Save the history settings.
6. Refresh the relevant source as it changes over time.

The controls allow up to **20 prior captures** and **4096 MiB** of compressed routine history per source. The size input has a 1 MiB minimum. The supplied defaults in this control are three retained captures and 128 MiB when no other values are stored. These bounds do not mean that a missing historical state can be recreated.

## Compare two actual captures

1. On a source card, choose **Capture history**.
2. Review each capture's identity, capture time and stored size.
3. Choose actual retained captures as Selection A and Selection B.
4. Choose Compare.
5. Inspect summary counts and expand the exact difference tables.
6. Copy an exact table if needed, or use supported contributing evidence.

The active capture is protected. A protected recovery predecessor and the independent 1.0 rollback baseline are not ordinary history entries to evict. Remove controls apply only to removable retained history. Removed-record evidence needs the earlier capture: a list of aggregate removal counts is not enough to reconstruct the removed text.

Changes in index version or capture time do not automatically become content changes. Content comparison uses documented original/scoped identities and normalized-owned fingerprints where appropriate. Change categories can overlap; adding all counts together may not yield a distinct total of changed records. A conversation with a text change and a selected-path change can contribute to both categories.

## Preserve context when sharing a result

Record both capture identities, their observation dates, the applied filters, branch scope and comparison direction. Do not describe a capture made on one date as containing all real-world activity through that date unless the source coverage establishes it. A locally stale export remains a snapshot of what that export retained.

Continue with [comparison, evidence and reports](06-Evidence-and-Reports.md).
