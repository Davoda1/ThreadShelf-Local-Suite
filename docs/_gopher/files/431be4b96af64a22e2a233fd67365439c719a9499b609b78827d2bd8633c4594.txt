# Explorer: distributions and relationships

[Analytics manual](index.md)

Explorer adds 32 measurement families across **Distributions**, **Relationships**, **Sequences**, **Compare** and **Observability**. Choose a subview, then select a **Chart family**. Some families have multiple related charts, such as a histogram and the corresponding empirical cumulative distribution. The original standard workspaces retain their established definitions; Explorer's methods are labeled separately.

## How to read an Explorer chart

1. Apply the desired shared filters first.
2. Choose the Explorer subview and chart family.
3. Set only the local controls relevant to that measurement.
4. Check the available/eligible/unavailable counts and the measurement state.
5. Open **Measurement, coverage and evidence definition** for the observation unit, date basis, timezone, precision, branch policy, counting perspective, source representation, reliability, algorithm and evidence rule.
6. Read the drawing together with the complete **Exact data table**.
7. Select a populated mark or table row to inspect the corresponding contributors.

The default local settings use response content, segment-length lens, provider grouping, character volume, attachment bytes, segment temporal units, count-based seasonality, conversation relationships, selected association context and a visible-mark limit of 40. Individual charts expose only supported controls. Changing a display presentation does not silently replace the underlying measurement.

The visible-mark selector normally offers 20, 40, 100 or 200; co-occurrence matrices offer 20, 40 or 100. Some compact grids and structure profiles do not use that selector. The disclosure states how much is drawn. Exact table rows remain available through 50-row paging. Table search narrows visible table rows. **Copy exact table** copies the complete chart-local table, not just the current page.

## Distribution families 01–06

| Family | Question it answers | Controls and interpretation |
| --- | --- | --- |
| 01 Length histogram and ECDF | How are observed text lengths distributed? | Choose user, response, original trace or summary; choose segment or supported logical-message lens. Histogram bins are lower-inclusive and upper-exclusive. ECDF shows the fraction at or below each threshold. |
| 02 Distribution groups and box plots | How does the length distribution differ by provider, model or observed month? | Choose the content population and grouping. Read count, minimum, quartiles, median, maximum and mean. A sample with fewer than five observations is flagged as small. |
| 03 Conversation concentration | How much of the selected volume comes from the largest conversations? | Choose characters or segments. Rank and cumulative share describe concentration; top 1%, 5% and 10% use rounded-up conversation counts, with at least one conversation when any exist. |
| 04 Code-block size by declared language | How large are retained fenced code bodies? | Choose body characters or lines. The first word of the exact declaration supplies the language group; Unspecified is explicit. Closed and unclosed fences remain distinguishable. |
| 05 Exact prompt-repeat spectrum | How often does identical normalized prompt wording recur? | Uses complete trustworthy logical prompts, or a disclosed segment fallback. Frequency, distinct conversations and distinct models are different dimensions. It is wording equality, not request identity. |
| 06 Attachment size and image dimensions | What metadata describes retained attachments? | Choose bytes, dimensions or aspect ratio. A true zero-byte value is available; missing size is not zero. Dimensions need positive recorded values and do not prove image-file access. |

The length histograms use fixed bins from zero through very large texts, ending with an open-ended range. A label such as `[100, 250)` means at least 100 and fewer than 250. The final range has no finite upper boundary. Do not read equal visual bin widths as equal numerical widths.

Explorer quartiles use the **R7** definition: sort observations, locate `(N−1) × p`, and interpolate between neighboring observations as needed. Membership weighting behaves as integer repetitions without expanding them into a separate array. These quantiles can differ from legacy percentile definitions. A different median produced by a different population or algorithm is not automatically a bug.

An observed empty string has length zero. Missing/redacted text, incomplete grouping or a required missing full-text index makes the measurement unavailable. A truncated evidence excerpt is never used as a substitute for full captured length.

## Calendar and progression families 07–12

| Family | What is measured | Read the boundary carefully |
| --- | --- | --- |
| 07 Weekday × hour heatmap | 168 weekday/hour cells in the chosen timezone | Choose segments, stored objects or supported logical messages. Clock-precision original timestamps are required; day-only dates cannot supply hours. |
| 08 Calendar seasonality | Month/year counts, within-year shares or rates per calendar day | Choose Count, Share or Rate. Rates account for actual calendar days, leap days and clipping by the selected range. |
| 09 Observed streaks and gaps | Runs of active calendar days and intervening empty days | The first/last archive runs can be censored by the observation window. A gap is the number of empty days between activity, not calendar distance. |
| 10 Observed conversation continuation | Whether retained conversations have later observed activity at week offsets | Cohorts use first retained dated messages; a later offset needs adequate follow-up coverage. This is not user retention or churn. |
| 11 Response shape by conversation position | Observed reply-length bands and code share by retained reply ordinal | A supported original selected path or verified source order is required. Filtered-out replies leave ordinal gaps; this does not measure learning or fatigue. |
| 12 Recorded timestamp intervals | Gaps between verified adjacent original observations | Both endpoints need clock precision and must remain selected. Ties, reversed timestamps, precision gaps and filtered gaps are separate. This is not generation latency or time to first token. |

For heatmaps, inspect cell counts and coverage before comparing intensities. A missing source capability is different from a valid zero-count cell. A change of timezone can move an event into another hour or day without changing the underlying event.

## Relationship families 13–18

| Family | Question and local choices | Limits |
| --- | --- | --- |
| 13 Prompt volume × reply volume | Compare user and final-response character volume by conversation, or by a verified paired relationship | The paired lens needs recorded parent ancestry or a verified shared turn; array order and a logical ID alone do not prove pairing |
| 14 Exported trace × final response | Compare original trace or summary representation against final response, using conversation or same-object lens | Summary-only observations remain separate; a missing trace is not zero hidden reasoning; ratio-of-sums differs from a distribution of per-unit ratios |
| 15 Content-feature prevalence by model | Compare the share of supported logical final replies containing parsed features | Presence per reply, occurrence totals and denominators differ; attachment metadata uses a separate eligible population |
| 16 Model and code-language co-occurrence | Inspect recorded presence sets by model or language, using joint count or Jaccard similarity | Repeating the same block does not multiply presence; remaining labels may join an explicit Other set; co-occurrence is not causation |
| 17 Reference channels and domain concentration | Compare textual links, structured references, unlinked markers and recorded domains | Only HTTP(S) URLs enter domain cells; identical URLs across channels deduplicate within the scoped source object; no URL is fetched |
| 18 Parser-derived Markdown structure | Inspect headings, lists/items, quotes, tables, code, links/images, breaks and paragraphs | Counts come from a CommonMark/GFM parser over complete owned text; they do not overwrite legacy regex measures |

The prompt/reply and trace/response density grids use equally spaced labeled bins so an outlier cannot compress the smaller ranges. Labels abbreviate 1,000 as k and 1,000,000 as M; hover and keyboard focus show exact ranges. Color strength uses a logarithmic count scale, while cell text and exact tables retain original counts. Every populated bin is shown. Empty combinations have zero observed support and no contributing evidence; unavailable observations remain a separate coverage population.

Small density grids stay compact inside their card in this release. Larger grids retain their available-width layout. The grid itself avoids a separate scroll region for these compact density views, although the workspace still scrolls in a shorter window.

Co-occurrence maps use matching labels on both axes. Mirrored cells refer to the same recorded relationship and open the same contributors; do not add both halves to claim twice as many observations. Jaccard is joint presence divided by union presence. An Other presence set is the union of omitted labels, not a single newly discovered model or language.

Markdown structure analysis has bounded parser work. An individual text input beyond the parser bounds, a parser failure or a missing current full-text index makes the affected structure observations unavailable with a reason. Other independently supported measurements can remain available.

## Save an exploration

Choose **Save exploration preset**, enter a descriptive name up to 200 characters, and save. A preset retains shared filters, selected subview/chart, local Explorer configuration and any applied A/B comparison. Apply it later from Sources & settings. It is more specific than an ordinary saved view and is still not a backup of source data.

Continue with [sequences, observability and history](05-Explorer-Sequences.md).
