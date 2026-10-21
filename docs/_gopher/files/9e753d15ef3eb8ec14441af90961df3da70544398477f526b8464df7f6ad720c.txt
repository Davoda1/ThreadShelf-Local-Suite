# Standard workspaces and chart reading

[Analytics manual](index.md)

The navigation contains **Overview**, **Activity & time**, **Models & platforms**, **Content & code**, **Conversations & structure**, **Tools & recorded usage**, **Data quality**, **Explorer**, and **Sources & settings**. The shared selection remains in effect when you change workspace. Workspace changes start the new view at the top; background capture updates preserve the current workspace's scroll and open table state.

## Overview in light and dark mode

See the [Analytics screenshot gallery](../Screenshots/analytics-gallery.md#overview-scope-before-interpretation) for light and dark views of Overview with synthetic data.

## Common chart and table controls

Hover a bar or focus it with the keyboard to see the exact label and value. Stacked activity bars show the User, Thinking, Response and Other subtotals with matching category colors. Other may list recap, commentary or tool records as indented details; those are already inside Other and must not be added a second time. Enter opens contributing evidence where available. Escape dismisses hover details.

Open **Exact data table** for numerical values behind a chart. Standard tables show 100 rows per page, with Previous/Next for the rest. Their Copy action copies the visible page as TSV. Exported reports include complete tables. Table searches or conversation sorting reset the affected table to the first page, making the new row population easier to inspect.

The category palette uses blue for user prompts, amber for exported thinking and green for assistant responses, with secondary categories labeled separately. Model-series colors identify models; they do not redefine the content categories. Text labels remain the guide when colors are difficult to distinguish.

## Overview

Overview is the first consistency check. The headline tiles show conversations, user messages, exported-thinking segments and assistant responses. These are intentionally different units: a source message can contain several content segments, while a final response can still be one logical response message.

The activity timeline shows retained segments over time. Observed composition separates content categories and their text volume. The Platforms chart groups records by recorded provider provenance. Coverage lists numerators and denominators for date, model, text, object/message boundaries and other supported measurements.

Before deciding that a model or platform has little activity, verify whether the export includes the original model or platform metadata. Unknown labels are retained rather than guessed from collection names or nearby records.

## Activity & time

This workspace shows active days, longest streak, dated segments and undated segments. Switch the timeline between **Daily**, **Weekly** and **Monthly**. These buttons change aggregation granularity, not the shared date range.

The **Calendar mosaic** draws one square for every day of the displayed year, with Monday-first weekday rows, week columns and localized month/day labels. Leap years include February 29. Five intensity levels indicate matching activity. Hover or focus exposes a date and exact count. Select a day with contributing records to open evidence. A day without matching dated activity remains empty and does not open unrelated records.

**Hour of day** includes only observations with the required clock precision. **Day of week** groups dated activity under the applied timezone. A day-only source date may be valid for a date chart while remaining unavailable to an hourly chart.

Other activity details include busiest day, average per active day and average per calendar day. The active-day denominator includes only dates with at least one selected dated segment. The calendar-day denominator includes the calendar span. The seven-day rolling average divides by seven and treats inactive selected dates as zero. These measures should not be compared without their denominator.

Where the current range supports it, the previous-period table compares an equal number of calendar days. A difference is an archive observation, not an inference about time spent working. Neither gaps between messages nor calendar intensity measures attention, productivity or elapsed application use.

## Models & platforms

Model and platform distributions are separate. The workspace includes recorded models, platforms, model developers, model families, retained model changes, and daily model/platform series. Exact model labels remain visible even if analytical family aliases are configured.

The model-filter notice matters: message-level filtering keeps only matching records; conversation-level filtering selects conversations containing the model. A conversation with multiple models can therefore yield different populations under the two modes.

Each daily series graph has an independent hover setting:

| Mode | Behavior |
| --- | --- |
| All series | Follows the nearest displayed date with a vertical guide and displays the series values for that date |
| Single point | Shows one observed plotted point |

The choice stays with that graph while the app is open and does not change the other graph. Use Left/Right and Home/End to move through dates, Enter to reach available evidence values, and Escape to clear hover. Missing date/series groups can show zero observed segments with a coverage note; they do not gain fabricated observed points or evidence.

Legacy model-change tables retain their original counting definition. Explorer's verified-parent model-transition analysis is a separate measurement. A difference between them should be investigated through their contracts, not treated as a display inconsistency.

## Content & code

The headline measures include Unicode characters, code blocks, code lines and attachment observations. The workspace includes declared code languages, text volume by category, thinking representations, length distributions, observed trace/response ratio, domains, attachment metadata, links, citation records and Markdown tables.

Characters are **Unicode code points**, not bytes, UTF-16 code units or visual glyphs. A combined emoji can contain several code points. Words/text units use the runtime's Unicode word segmentation where available, with a labeled fallback. These counts are not model tokens.

Code languages come from retained Markdown fence declarations. An unspecified language stays unspecified; the app does not claim that syntax appearance establishes the language. Code lines and characters concern fence bodies. Fence delimiters remain part of total text, so prose and body-code totals need not sum exactly to full text.

An exported full thinking trace, a reasoning recap/summary, and redacted or unavailable thinking are distinct. The observed trace/response ratio requires actual retained original trace text and response text in the eligible population. It does not infer hidden reasoning or count an unavailable trace as an observed empty trace.

Attachments are metadata observations. A filename, MIME type, dimensions or explicit byte size does not prove that the actual file is accessible. Missing byte sizes stay unavailable. File-token metadata is not added to request-token consumption.

Domains come from retained textual links and structured references. A citation is not automatically a search event, and the app does not visit the URL to verify the destination’s contents. Links inside fenced code are not treated identically to ordinary textual links.

## Conversations & structure

The conversation-detail table lists titles, platform, segments, stored objects, interaction depth, retained alternatives and characters. Search the table rows and sort by **Characters**, **Segments**, **Interaction depth**, **Retained alternatives** or **Title**, in ascending or descending order.

Other tables compare selected-path segments with all-retained segments, list retained versions, show exact repeated-prompt groups and explain explicit deduplication/aliases. The selected/all comparison is structural context and need not equal an ordinary category-filtered count.

Repeated-prompt matching normalizes Unicode to NFC, collapses whitespace, trims the ends and remains case-sensitive. It identifies equal wording, not equal request events. Groups use neutral labels rather than automatically publishing private prompt wording. Conversation deduplication relies on explicit source identities and deliberate aliases, not text similarity.

Depth is format-dependent. Legacy ChatGPT depth includes retained non-message mapping roots. Explorer has a separately defined verified-parent-edge depth with root depth zero. Always read the unit when comparing depth values.

## Tools & recorded usage

This workspace separates tool calls, tool outputs, usage records and recorded durations. Tables include named tools, output associations, event sequences, request-usage fields, context occupancy, durations, tool indicators and recorded search events.

A call and the corresponding output are not two invocations. Repeated display representations with the same scoped event identity do not become extra calls. An indicator saying that a message mentions or uses a tool is weaker than a recorded call event. An unmatched output stays visible without inventing a missing call.

Usage fields preserve their recorded scope and units. Input, output, cached, reasoning and total counters may overlap, so do not sum all fields indiscriminately. Context occupancy measures supplied context against a supplied limit and is separate from consumed or billable tokens. No costs are inferred from a model name.

Recorded duration fields, explicit recap durations and original timestamp gaps have different meanings. A “Thought for…” recap does not establish end-to-end latency. An item creation/completion interval does not necessarily identify execution start. Explorer applies stricter verified-semantic requirements for some usage/lifecycle charts, so those can legitimately be unavailable even when the standard workspace displays a recorded candidate field.

## Data quality

Use Data quality whenever a result is surprising. It shows measurement coverage, capability matrices, diagnostic codes, explicit deduplication, annotations and source cards. Coverage records what is available in the selected population. It does not rank the quality of the AI's answers.

Inspect whether the source is original, normalized-only or partial. A normalized transcript may preserve readable text while losing branches, event identities, original model fields or precise dates. Analytics keeps that loss visible instead of reconstructing unsupported detail.

The **Open related Explorer** links in applicable workspaces lead to deeper measurements while preserving the shared scope. Continue with [Explorer distributions and relationships](04-Explorer-Distributions.md).
