# Compare selections, inspect evidence and export reports

[Analytics manual](index.md)

## Two comparison workflows

The main **Compare** control opens a summary comparison dialog. Explorer's **Compare** subview provides the detailed comparison chart families. Both start from explicit selections, but an edited comparison draft must be calculated/applied in the appropriate interface before it defines a result.

### Summary comparison

1. Apply a useful base selection.
2. Choose Compare.
3. For Selection A and Selection B, choose the current filters, a saved view, the equal-length previous period, or Custom.
4. Use the A/B edit controls when you need independent filter settings.
5. Choose Compare to calculate the result.
6. Review the displayed scopes and any scope-difference warning before reading the numerical difference.

The dialog starts with both selections based on the current filters. If both remain identical, equal results are expected. The previous-period option requires a valid bounded current period. All time does not automatically define an equal-length historical interval.

### Explorer comparison

1. Open Explorer → Compare.
2. Define A and B from current filters, saved views, previous period or custom selections.
3. Choose **Apply A and B**.
4. Confirm that the applied A/B scope text appears.
5. Select an aligned-bin, distribution, identity-intersection, contribution or coverage comparison chart.
6. Inspect exact values and eligible/available counts, then drill into relevant contributors.

Changing a draft choice is not the same as applying it. Use Save exploration preset if you want the applied comparison and selected chart configuration preserved together.

## Make a fair comparison

Keep the counting perspective, timezone and date basis compatible. Use equivalent branch scopes unless branches themselves are the subject. Decide whether you are comparing individual model records or whole conversations containing a model. Check that a source-format change has not altered which kinds of evidence are available.

A signed B−A difference says how the measured quantity changed from A to B. Percentage change needs a positive baseline; a zero denominator does not acquire an artificial percentage. A larger character total can arise from more conversations, longer records, collection-membership weighting or better export coverage. A character-volume change does not measure answer quality or cost.

If a result seems dramatic, inspect at least one contributing table row and compare the corresponding coverage. This often distinguishes a real archive-pattern change from a change in filters or available metadata.

## Evidence pane

Select a chart item, populated grid cell or exact-table row to open the corresponding contributing evidence. The panel can show source/conversation information, category, platform, original model, snapshot identity, original versus normalized classification, timestamp precision, record location, branch selection and a contribution rule.

The pane reports the exact contributing population count but retrieves at most **100 records per request**. Use Previous/Next when more contributors exist. An empty selection stays empty; it does not fall back to unrelated content. Some measurement rows describe denominators, aggregates or unavailable states without reconstructible record evidence; read the stated reason.

Evidence text is bounded for display. A truncation/excerpt notice means the pane is not showing all of the source text. Full-text measures continue to use complete owned content or validated indexes. Copy copies the text represented by the displayed evidence record/excerpt; it does not imply that a truncated pane has become a complete conversation export.

The evidence renderer supports safe Markdown headings, emphasis, lists, quotes, tables and syntax-highlighted code. Source HTML remains inert, images do not load, and HTTP(S) links require an explicit **Copy link** or **Open link** action. Copy code controls retain the source code represented by the displayed block. Opening a link is a deliberate external action; viewing evidence alone does not fetch it.

Use **Annotations** from an evidence card when you want an Analytics display alias, exclusion, virtual group or verified identity mapping for that conversation. These annotations never rewrite the original Reader/export source.

## Choose a report format

| Format | Best use | Contents and limits |
| --- | --- | --- |
| HTML | Read and share a self-contained offline analytical report | Navigation, charts, tables, favicon and automatic light/dark styling in one file |
| JSON | Scripted analysis or structured inspection | Exact applied tables, metadata, definitions and supported selected additions |
| CSV | Spreadsheet inspection | A multi-section report with metadata/definitions, summary and named tables; not a single flat table |

All formats document the applied filters, source/snapshot scope, report and capture times, units, date/timezone basis, branch policy, coverage and schema/adapter versions. Exported numerical tables are complete for the applied selection rather than truncated to screen paging or a visible chart-mark limit.

## Export step by step

1. Apply the intended shared filters and any Explorer comparison needed for the report.
2. Review source freshness, coverage and counting perspective.
3. If you need excerpts, open the relevant evidence population and choose the evidence page deliberately.
4. Choose **Export report**.
5. Select HTML, JSON or CSV.
6. Review **Include evidence**, the separate private-label inclusion option, and **Legacy-compatible export**.
7. Choose Export and select a destination outside source files, Reader profiles and Analytics-owned data.
8. Open the resulting report and verify the report scope and privacy mode before sharing it.

The evidence inclusion checkbox is disabled when no evidence records are currently available in the pane. The displayed count corresponds to the currently loaded evidence records selected for inclusion. Paging through a larger evidence population is not a promise that every previously viewed page will be included automatically. Numerical aggregate tables are independent and remain complete.

## Privacy choices

By default, reports contain aggregate analytical data and exclude private conversation text, titles and source paths. New potentially sensitive categorical labels use neutral forms unless you explicitly include labels. Including evidence requires a separate opt-in. Exact model names and other legacy categories may still reveal information about your usage, even in aggregate mode.

An evidence-enabled report can contain confidential prompts, replies, code or metadata. Review it as a document before sending it elsewhere. Inert HTML and disabled external resources limit automatic execution/loading; they do not make the text itself non-confidential.

Private code-language declarations and domain dimensions can also disclose context. Decide whether the recipient needs them. An anonymous-looking neutral group name does not make a distinctive aggregate pattern universally anonymous.

**Legacy-compatible export** preserves supported legacy meanings and omits Explorer additions. It is not a lossless downgrade of Analytics state and is not a backup of captures, settings, views or annotations. Historical report files written elsewhere are not rewritten by later calculations and are not deleted when Analytics caches are cleared.

## Copy versus export

- Standard table Copy copies the current visible page as TSV.
- Explorer Copy exact table copies the complete current chart-local table, regardless of the displayed page.
- Capture-history table Copy copies the corresponding complete exact difference table.
- Evidence Copy copies the represented record text or metadata fallback.
- Export report writes complete applied analytical tables in the selected format.

Use export for a reproducible analytical handoff. Use Copy for a deliberate short working extract. Include scope and units alongside copied numbers so they retain their meaning.

Continue with [settings, storage and backup](07-Settings-and-Storage.md).
