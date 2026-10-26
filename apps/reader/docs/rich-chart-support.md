# Safe chart support in Reader 1.2.0

Charts are temporary renderer DOM/SVG. The adapter does not change message text, original source, turns, IDs, storage, reading positions, or Analytics events. Both Local and Server views call the same renderer. Existing converter-created Markdown tables and currency snapshots remain Markdown; the Reader never guesses a chart from their rows.

## Export adapters

Only a recognized rich `Chart` component or the exact `genui{literal object}` wrapper enters these adapters. GenUI accepts a single `chart` or `charts_widget_v2` record containing `content`, with optional `language: "recharts-json"`. Arbitrary JSON, fenced examples and converter-created Markdown tables never trigger a chart. The wrapper has no accepted version field; unknown wrapper fields or versions remain original source.

Reader gives native `Chart.content`, GenUI `chart.content` and GenUI `charts_widget_v2.content` the same validated exported data contract. The surrounding wrapper no longer limits a valid native component to vertical bars.

| Preserved input | Validated content | Local presentation |
| --- | --- | --- |
| All three exported wrappers above | `chartType: "bar"`, `xKey`, `series`, `data`; optional `layout: "vertical"` | Omitted layout gives vertical bars. The evidenced `"vertical"` layout arranges categories vertically and bars horizontally. |
| All three exported wrappers above | `chartType: "line"`, `xKey`, `series`, `data` | Independent categorical lines, ordered category positions, shared inspection |
| All three exported wrappers above | `chartType: "pie"`, `nameKey`, `valueKey`, exactly one matching series, `data` | Reference ring presentation with unchanged saved `chartType: "pie"`; raw values plus identified, calculated share of total |
| All three exported wrappers above | `chartType: "scatter"`, numeric `xKey` column, `series`, numeric data columns | Unconnected numeric points; each series `dataKey` supplies Y at each recorded X |
| Explicit `threadshelf-chart` version 1 object | Reader-owned contract below | Vertical/horizontal bar, line, area, solid pie, doughnut or scatter |
| Other types, fields, versions, layouts or semantic features | No guessed mapping | Bounded saved-data fallback; rejected surrounding syntax stays original source |

All exported contracts optionally accept `meta` with only `title`, `description` and `footer`, and a chart-level text `valueSuffix`. Noncircular contracts optionally accept finite `yAxisMin`/`yAxisMax`; for horizontal bars these still bound the numeric value axis. Series accept only `dataKey`, optional `label`, `valueFormat` (`raw` or `integer`), `valueSuffix` and `unit`. A nonempty unit and nonempty suffix together are ambiguous and rejected. An explicit series suffix, including `""`, takes precedence over a chart-level suffix; an explicit series unit also prevents inheriting that suffix. A common numeric axis shows the effective suffix/unit only when all series agree. Incompatible series retain their own tooltip/table units while the common axis remains unitless. Suffixes never multiply or normalize source numbers.

Categorical data rows must contain a string category and a finite numeric value for each series. Scatter requires finite numeric X and Y; numeric strings are rejected. Rows may not contain extra columns. Series keys must be unique and distinct from the category/X key. Pie's sole series `dataKey` must equal `valueKey`. Source order, labels, metadata and bounds are retained. Missing series labels use the recorded data key as a local display heading. This scatter contract supplies no point labels; the Reader does not invent labels from order. Explicit Reader-owned scatter labels remain supported.

The supplied synthetic fixtures cover seven exported chart contracts, including `layout: "vertical"` for horizontal bars. Reader-owned fixtures additionally cover area and doughnut charts. Unsupported schema versions retain a saved-data fallback. Tests establish support for these explicit contracts, not every possible future export or conversion.

The supplied native-component response represents the C06 area and C08 doughnut examples as static SVG illustrations, explicitly outside the native Chart contract. These are handled separately by the rich-layout renderer; no exported `chartType: "area"` or `chartType: "doughnut"` schema is inferred from their appearance. The supplied legacy L01/L02 examples have already become Markdown tables in the archived source, with no retained chart payload. They remain tables; their headings or numeric rows are not used to fabricate chart metadata.

No exported area, doughnut, `horizontal-bar` type, stacking, percent normalization, error bars, interpolation, additional axes, callbacks, resource URLs or style contract is inferred. Unsupported semantics cause saved-data fallback. Multi-series bars remain independently measured, side by side. Reader-owned area series remain independent translucent fills from zero, never summed.

## Reader-owned schema, version 1

A rich `Chart` component can carry the following **synthetic Reader-owned example**:

```json
{
  "schema": "threadshelf-chart",
  "version": 1,
  "type": "bar",
  "orientation": "horizontal",
  "title": "Synthetic instrument samples",
  "description": "Reader-owned example; not a recovered export contract.",
  "categoryLabel": "Sample",
  "categories": ["A", "B"],
  "series": [{"label": "Voltage", "values": [-2.5, 3.125], "unit": "V"}],
  "yAxis": {"min": -5, "max": 5, "label": "Voltage", "unit": "V"},
  "footer": "Synthetic values."
}
```

- Required common fields: `schema: "threadshelf-chart"`, `version: 1`, `type`, `series`.
- Optional common text: `title`, `description`, `footer`.
- Cartesian category types (`bar`, `line`, `area`) require `categories` (ordered strings). Each series requires `values` of exactly the same length. Optional `categoryLabel` gives the table's first-column heading. Optional `xAxis` accepts `label`/`unit`; numeric category-axis bounds are unsupported. `yAxis` accepts finite numeric `min`/`max` and text `label`/`unit`.
- Bar alone accepts `orientation: "vertical" | "horizontal"` (vertical is the local default). The numeric axis is always `yAxis`, including horizontal bars; this keeps orientation independent of the data contract.
- Pie/doughnut require `categories` and exactly one series of nonnegative `values`, with at least one positive value. Axis objects are unsupported. Arc sizes express relative recorded magnitudes. Custom inspection includes an explicitly labelled, locally calculated share of the total alongside the raw value; the exact-value table remains raw. Zero rows remain in the legend and table and can be inspected without a fabricated nonzero slice.
- Scatter requires one or more series with `points: [{"x": 1.25, "y": -2.5, "label": "optional name"}]`. It accepts numeric `xAxis` and `yAxis`; category arrays/labels are unsupported. Points are not connected, aggregated, sorted or reinterpreted as time values.
- Series allow optional `label`, `valueFormat: "raw" | "integer"`, and either `unit` (displayed with a separating space) or `valueSuffix` (appended verbatim). To preserve source precision, `integer` never rounds fractional recorded values. Cartesian categorical charts and scatter use series units/suffixes for Y values, or an explicitly supplied `yAxis.unit` when both series fields are absent. An explicit series unit or suffix takes precedence, including an empty suffix. Scatter uses `xAxis.unit` for X values. This display inheritance does not add a unit property to source or normalized series metadata.
- Optional fields with explicit `null`, unknown keys, duplicate exported series keys, nonnumeric values or numeric strings are rejected instead of coerced. Category names may repeat and retain their supplied order.

## Precision, bounds and circular presentation

Exact tables, accessible descriptions and custom inspection panels use the preserved JavaScript number's shortest round-trip text with the supplied suffix/unit; `-0` remains `-0`. No value scaling or source rounding occurs. `valueFormat: "integer"` does not discard a recorded fraction such as `3.125`. Literal spelling such as trailing zeros cannot be recovered once a JSON number is parsed. Derived axis ticks alone use up to six significant digits for legibility.

Bar/area domains include zero and all recorded values. Explicit bounds are retained; bounds that would clip data or exclude a required zero baseline trigger saved-data fallback. Other absent bounds are computed locally. Line and scatter do not force a zero baseline. Constant domains get a local nonzero plotting span, without synthetic data rows.

For the evidenced exported pie contract, the Reader uses a ring by local presentation policy consistently across native `Chart`, GenUI `chart` and GenUI `charts_widget_v2`. The transient `circularPresentation: "ring"` flag is not an accepted source field and does not change the archived `chartType`. Explicit Reader-owned pie remains solid and explicit doughnut remains a ring.

Every accepted circular chart exposes the raw value and **Share of total (calculated)** in inspection. This derived share is `value / sum(values) × 100`, displayed with up to six significant digits, and is never saved into message content. C07 retains raw 6/3/1 and shows calculated 60%/30%/10%. Negative, nonfinite or zero-total circular data falls back safely; no equal shares are fabricated. A single positive slice is valid. Zero-valued categories remain in the legend/table and inspection without a visible slice.

## Pointer and keyboard inspection

Charts have app-owned, theme-aware floating tooltip panels with a category/point heading and series-color swatches. Bars highlight the active mark, including a transparent inspection target for a true zero-height/width bar. Lines and areas inspect the whole category band: one vertical crosshair and one panel show every series in original order, with all corresponding points highlighted. Category identity uses position, so duplicate labels remain distinct. Scatter inspection selects the nearest recorded point within an 18 CSS-pixel radius, shows numeric X/Y with an X-position guide, and preserves explicit point labels when present. Equal-distance overlaps choose original series order then point order; keyboard navigation still reaches every point. Pie/doughnut slice, legend and panel colors agree.

Pointer inspection uses bounded hit testing and updates the panel only when the inspection target changes; scroll/resize positioning is scheduled with animation frames. It does not reparse the message or rebuild charts. SVG-to-screen coordinate transforms keep guides aligned when resized, zoomed or scrolled. Panels are contained within the visible Reader and viewport bounds, do not shift document layout, and do not intercept unrelated pointer clicks. Exact values remain selectable in the disclosure rather than requiring selection inside a transient panel. Native SVG mark titles are not used alongside the custom panels.

Tab enters the chart viewport; Arrow Right/Down and Left/Up inspect next/previous values, while Home/End select the first/last. Navigation stops at the ends and Tab leaves the chart without a focus trap. Keyboard inspection exposes the same values, including zero-valued circular legend entries. Escape dismisses the panel without immediately reopening it on a stationary target; movement to another target or explicit navigation permits inspection again. Inspection is transient and removed when the target leaves the visible region, focus leaves the chart, a surrounding view changes, or the message/view is removed or rerendered. Root event delegation is disposed with the renderer; active-panel listeners and observers are removed when dismissed.

Each chart retains a localized **Exact values** disclosure, semantic table headings/caption and a keyboard-scrollable viewport. Long or dense plot labels may be abbreviated; complete labels remain in accessible text and tables. Dense graphics and tables scroll within the figure. Series colors, active styling and panels derive from the selected Reader theme; chart legends, marks and swatches share those colors. Labels/tables carry the same distinctions without relying on color. All 19 interface themes, five locales, high contrast, forced colors and reduced-motion settings use the shared Reader styles; no chart animation is introduced.

## Limits and safety

Per chart: at most 200 category rows, 8 series, 1,000 aggregate data points, depth 12, 12,000 literal nodes, 200,000 total string/key characters and 4,096 characters per individual string. Numeric magnitudes are bounded to ±10^15 and must be finite. All pie/doughnut values are nonnegative. A validated bounded but unsupported object is retained as inert formatted JSON in the fallback. The surrounding parser preserves raw source for rejected syntax and parser budget failures.

Only plain literal records/arrays are accepted by the chart adapters. Prototype-related keys, accessors, cycles, holes, executable values and nonplain objects are rejected. Chart DOM is constructed with app-owned element names/attributes and `textContent`; the chart adapters do not insert exported HTML/SVG, scripts, handlers, callbacks, CSS or resource URLs. The separate rich-layout static-SVG path does not extend the accepted chart data schemas. There are no chart dependencies, network calls, CDN requests, currency conversion, service calls, file access or privileged-bridge calls. Chart color/shape geometry is app-owned. The supplied literal object is copied and never mutated. The transient normalized representation carries `schema: threadshelf-chart` and `version: 1`, ordered `categories`/`series`, text metadata, and validated axes. Computed `xDomain`/`yDomain`, `numericAxisSuffix`, `circularPresentation` and a retained exported `dataKey` are renderer-only fields, not accepted extra fields in the Reader-owned input contract and never persisted.

`tests/fixtures/chart-compatibility.mjs` stores the seven chat-derived widget fixtures and all seven Reader-owned presentations, with source serialization that retains negative zero. `tests/chart-native-components.test.mjs` checks the same seven exported data objects through native component and legacy GenUI wrappers, including horizontal-bar direction, exact percentages, scatter metadata, and rejection of unknown semantics. It also verifies that converter-created Markdown tables remain passive. Tests exercise recognized message wrappers, normalization and the production renderer. The release verification report records the actual test commands, fresh results and platform limitations; older evidence remains historical. Private exports, screenshots and profiles are not distributed in source archives.
