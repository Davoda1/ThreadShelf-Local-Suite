# Rich component grammar and passive adapters — Reader 1.0.0

This is the exact implemented Reader-owned adapter contract. The known markup has no version declaration. It is a bounded interpretation of the observed export vocabulary, not a generic HTML/JSX/Svelte implementation or a promise to support future private formats. Chart schema details are in `rich-chart-support.md`.

## Pipeline and preservation

`prepareRichMarkdown` locates case-sensitive rich spans and produces transient, data-only nodes plus 128-bit cryptographically random placeholder records. Random placeholders are checked for absence from source. The normal Markdown, mathematics and HTML sanitizer process the surrounding prose. App-created DOM replaces only placeholders present in that message's private record map. Every rich component's actual prose children use the same Markdown/math/sanitizer pipeline. Template-bound values and typed attributes never enter Markdown, mathematics, markup or template parsing again.

Rich extraction precedes math substitution so chart/string literals such as `$x^2$` are not rewritten. Mathematics outside attribute literals, fenced and inline code, top-level indented code, escaped examples, existing Markdown links/images, comments and unrelated raw HTML are excluded using the existing Markdown dependency plus bounded delimiter recognition. The literal bracket-math compatibility form is excluded too. Known components are parsed with exact nesting, quoted strings, balanced braces and explicit self-closing forms; DOMParser repair is not used. Inside a validated rich span, source indentation is structural; Markdown children are dedented before rendering. Use fenced code within rich children for unambiguous code examples. Ordinary top-level indented Markdown code remains excluded.

The render path never changes `message.content`, `sourceText`, stored turns, raw source, models, timestamps, IDs, selected branches or order. The existing `.message` anchors and whole-message Copy source remain intact. No normalized graphics or interactions are written into archives or analytics. Local and Server modes both use `ReaderView` and `ConversationRenderer`. The renderer performs no network calls.

## Components and properties

| Component | Accepted properties | Presentation |
|---|---|---|
| `box` | `gap`, `width`, `height`, `size`, `minWidth`, `align`, `flex`, `border`, `radius`, `padding`, `justify`, `background`, `clip`, `direction` | Responsive column/row, cards, framed architecture blocks, dimensions and layout bars |
| `row` | `align`, `gap`, `justify`, `wrap` | Flex row; wraps at narrow Reader widths |
| `text` | `color`, `size`, `weight`, `tabularNums`, `textAlign` | Markdown text with validated styles |
| `title` | `size`, `color`, `tabularNums` | Semantic local heading, Markdown children |
| `caption` | `textAlign` | Secondary caption, Markdown children |
| `divider` | `color` | Theme-aware divider |
| `grid` | `columns`, `gap` | Grid, responsive down to two columns on narrow windows |
| `grid-item` | None | Ordered grid child |
| `icon` | `name`, `color`, `size`, `inline` | App-owned line icon; unknown name is a passive diamond |
| `Entity` | `category`, `value`, `disambig` | Inline semantic value; category/disambiguation retained in tooltip; no guessed link or lookup |
| `Link` | `url`, `title` | Explicit safe link only |
| `Cite` | `ref`, `refs` | Exact associated reference binding only; compact pills retain original IDs in accessible labels/tooltips |
| `AsyncImage` | `query`, `aspectRatio`, `width`, `maxWidth` | Source-sized Corner aperture or Soft horizon SVG placeholder, with theme-inherited colors and the saved query in the accessible label/tooltip; no remote loads or searches |
| `AsyncImageGroup` | `query`, `aspectRatio`, `layout` | Passive offline query-list text; no simulated carousel |
| `Chart` | `content` | Validated literal object dispatched to the bundled SVG/DOM chart renderer |
| `svg` | `viewBox`, `width`, `height`, `preserveAspectRatio` | Bounded static illustration containing only `path` and `circle`; see the separate grammar below |

For `AsyncImage`, an explicit pixel width or cap of at most 320px selects Corner aperture; otherwise `width="100%"` selects Soft horizon. Remaining images in row layouts use Corner aperture, and other slots use Soft horizon. Selection uses layout attributes, never query text. Missing dimensions retain intrinsic content sizing; the renderer does not invent a default width or aspect ratio.

`Entity`, `Link`, `Cite`, `Chart`, `AsyncImage`, `AsyncImageGroup`, `icon` and `divider` are terminal components. Nonempty paired children cause preserved-source fallback rather than silently losing that text. Empty paired forms are accepted.

Rules shared across applicable components:

- Strings are single- or double-quoted, or supplied as literal expressions inside braces. Only the evidenced bare `row align=start` / `row align=center` forms are accepted. Other bare expressions are rejected.
- Presence booleans are limited to `border`, `clip`, `tabularNums` and `inline`; braced boolean values are also accepted.
- `gap` and `padding`: integer 0–16, in quarter-rem steps. `columns`: integer 1–12. `flex`: nonnegative decimal number/numeric string, maximum 1024; relative grow ratios are preserved.
- Dimensions: decimal `px` from 0–2048 or `%` from 0–100. `box size` sets both dimensions. Responsive maximum widths constrain the containing message.
- `align`: start/center/end/stretch. `justify`: start/center/end/between. `direction`: row/column. `wrap`: wrap/nowrap.
- `radius`: 2xs/xs/sm/md/lg/xl/full. Text/icon size: 2xs/xs/sm/md/lg/xl/2xl. Weight: normal/medium/semibold/bold. Alignment: start/left/center/right/end.
- Text colors: default/secondary/tertiary/subtle/info/success/warning/danger/error, mapped to app theme variables. Backgrounds: surface-secondary/surface-tertiary/info/success/warning/danger/error or six-digit hexadecimal RGB. Info/success use the current accent, warning uses the warning color, and danger/error use the danger color. Forced/high contrast modes replace explicit background colors with safe theme colors and outlines while retaining dimensions and labels.
- Images accept numeric `A:B` aspect-ratio metadata; groups accept the observed `carousel` declaration but remain static, offline captions. Queries are not image identities or asset URLs.
- Link URLs must explicitly start with HTTP, HTTPS or mailto; controls, whitespace, backslashes and other schemes are rejected. No callback, event handler, style string, CSS URL, spread attribute or script is accepted.

App-owned icons: arrow-right, arrow-down-up, check-circle, alert-circle, download, file-text, file-code, server, database, sparkles, archive, badge-check, file-search, layout-dashboard, panels-top-left, type. No downloaded icon dependency is introduced. The deliberate `TS32-unknown-icon` fixture retains the passive fallback.

An empty percentage fill inside a full-width, clipped, fully rounded surface track with an explicit pixel height up to 32 px is recognized as a layout progress bar. The sole fill must have a percentage width and the track's height (or 100% height); formatting whitespace is ignored. Neutral surface fills use the first chart-series accent, regardless of which neutral surface names the source used. Semantic and explicit fill colors are retained. Ordinary cards and color swatches are unaffected. Forced colors use a visible system highlight for the fill.

## Static SVG illustrations

Reader accepts the evidenced static `svg`/`path`/`circle` illustrations as a separate data-only grammar. This does not turn on arbitrary exported SVG or change the HTML sanitizer. Validated values become attributes on newly created SVG namespace nodes; saved markup is never assigned to `innerHTML`.

- The root is `svg`, with a required four-number `viewBox` whose width and height are positive. Optional `width`/`height` follow the dimension limits above. `preserveAspectRatio` is `none`, or an SVG Min/Mid/Max alignment with optional `meet`/`slice`.
- Children are only `path` or `circle`, without descendants or non-whitespace text. No nested `svg`, `g`, text, comments, definitions, gradients, references, links, images, `use`, scripts, animation or `foreignObject` is supported.
- All attributes are quoted literal strings. Template bindings, braced values, presence attributes and unknown properties are rejected. `path` requires `d`; `circle` requires `cx`, `cy` and `r`.
- Shape paint accepts `fill`, `stroke`, `strokeWidth`, `strokeLinecap`, `strokeLinejoin`, `opacity`, `fillOpacity`, `strokeOpacity`; standard hyphenated spellings of the camel-case fields also work. Duplicate spellings of one field are rejected. Paint is only `none`, `currentColor`, three-digit RGB or six-digit RGB; resource URLs and arbitrary CSS are rejected. Caps are butt/round/square and joins are miter/round/bevel.
- Path data starts with M/m and supports SVG M/L/H/V/C/S/Q/T/A/Z commands and their lowercase forms, validated command argument counts and arc flags. At most 512 explicit commands and 2,048 numeric values occur in one path. All numeric values are finite with absolute value at most 100,000. Circle radius/stroke width are nonnegative and at most 2,048; opacity is 0–1.
- One SVG has at most 256 elements including the root; each attribute has at most 8,192 string units. All existing span, nesting, output, time and aggregate node budgets also apply, including when a finite template repeats an illustration.
- Unsupported, malformed or over-budget SVG keeps the original source. Fenced/inline/indented code, mathematics, escaped samples and unrelated HTML retain their existing exclusion rules. Illustrations retain saved colors and geometry and have no chart inspection or invented exact-value table; their saved surrounding descriptions and labels remain visible.

## Literal and finite-template grammar

Literal values are finite numbers, booleans, null, quoted strings, arrays and plain literal records. Object keys may be quoted or safe identifier names; trailing commas are accepted. Strings accept JSON escapes plus an escaped single quote. Duplicate keys and `__proto__`, `prototype`, `constructor` keys are rejected at every depth. There are no identifiers as data, functions, regular expressions, getters, calls, spreads, imports, assignments or arbitrary expressions.

Within a validated component span only:

```text
{#each [literal, finite, data] as item,i}
  <grid-item><title>{item.s}</title><caption>{item.t}</caption></grid-item>
{/each}
{#if i < 3}<icon name="arrow-right"/>{/if}
```

Iteration accepts a finite literal array, including arrays of literal records, or an array reached through an existing loop-local plain-record binding. An optional index binding is zero-based. Nested loops share aggregate budgets. Bindings are local identifiers followed by dot-separated own properties of plain literal records. Array/string prototype and built-in properties, global variables and missing properties are rejected. Text bindings must resolve to strings, finite numbers, booleans or null, and become inert DOM text. An array or record can be a typed attribute/iterable but cannot be implicitly formatted as text.

Conditions accept exactly two same-type primitive operands (literal or binding) and one of `<`, `<=`, `>`, `>=`, `==`, `!=`, `===`, `!==`. Equality always uses strict comparison; no coercion. No logical expressions, function calls, arithmetic, assignment, `else`, await, key expression, or other Svelte directive is implemented. Unsupported syntax retains source. Template syntax outside a coherent rich component is not executed.

## Legacy and metadata adapters

Only a real `genui{literal object}` marker with one known wrapper is eligible. Arbitrary fenced JSON and converter-created unknown-wrapper JSON are never graphic triggers.

| Exact wrapper | Accepted shape | Behavior |
|---|---|---|
| `chart` | `{content: literal-object}`; optional `language: "recharts-json"` | Chart adapter |
| `charts_widget_v2` | Same wrapper shape; validated bar, horizontal-bar layout, categorical line, pie-family and numeric scatter contracts | Chart adapter |
| `citation` | `{ref: string}` or `{refs: string[]}` | Exact-binding Cite adapter |
| `refs` | Reference list/string or the Cite property record | Exact-binding Cite adapter |
| `suggest_automation` | `{label: string}` only | Passive archived suggestion text, no scheduling/control |
| `map_widget` | `{points: [{name, category?, ref?}, ...]}` only | Saved location/category list; no map fetch, location inference or service calls |

Unknown wrapper keys/versions/contracts remain original source. A recognized chart wrapper with unsupported content uses the bounded saved-chart-data fallback; later valid siblings remain renderable. Chart suffix inheritance, orientation, numeric domains and the local pie-family ring policy are specified in `rich-chart-support.md`. The other observed legacy marker families (`cite`, `i`, `video`, `navlist`, `link`, `product_entity`, `products`, `businesses_map`, `filecite`, `entity`, `image_group`, `entity_metadata`, `product`, `link_title`, `url`, `visualize`; 16 kinds besides `genui`) and the separate opaque currency marker retain their original source when still present. Converted readable Markdown links/tables, historical currency snapshots and intended missing-widget placeholders are preserved unchanged. No DIL runtime, action, expression, automation, live currency conversion or absent chart is reconstructed. Non-visible native metadata does not create a warning or widget. Native reference enrichment uses the separate strict source-message association in `rich-context.js`.

## Hard limits and recovery

| Resource | Limit |
|---|---:|
| Message considered for rich extraction | 2 MiB of JS string units |
| One rich span or literal input | 256 KiB of JS string units |
| Recursive grammar/data/template nesting | 24 |
| Parsed plus expanded nodes, shared per message | 4,096 |
| Parsed literal values | 20,000 |
| One decoded literal string | 32,768 string units |
| Array length | 512 |
| Aggregate loop iterations | 512 |
| Expanded text and serialized attribute data | 1 MiB |
| Top-level rich fragments | 256 |
| Counted parser/interpreter operations | 1,000,000 |
| Cooperative parsing/Markdown traversal deadline | 300 ms |
| Lexical preflight opening angle brackets | 4,096 |
| Lexical preflight braces/brackets/backticks | 20,000 |
| Reference list / reference ID | 64 / 256 characters |
| Map points / image queries | 128 / 32 |
| Most text properties / link URLs / image queries | 4,096 characters |

Limits count JavaScript string units, not UTF-8 bytes. The wall-time check is cooperative; it is not a worker cancellation guarantee. The linear lexical preflight runs before Markdown tokenization, and HTML closing tags are indexed once to prevent quadratic repeated lookups. Messages rejected by preflight/Markdown traversal use a contained inert source `<pre>` without re-entering Markdown. At the fragment cap, remaining source is ordinary escaped Markdown. Complete malformed/unsupported components fall back locally and cannot consume a following valid sibling. A malformed unclosed component conservatively preserves the remainder because no reliable nested/sibling boundary exists. A rendering exception falls back for that one source node.

## Checks

`tests/rich-parser.test.mjs` covers literals/prototype rejection, all common property classes, finite loops and inert values, terminal-child preservation, aggregate amplification limits, Markdown/code/HTML/math exclusion, source indentation, malformed sibling recovery, random placeholders, known legacy wrappers, exact snapshot preservation, hostile tag-soup preflight and safe URL handling. All included regression fixtures are synthetic. `tests/rich-renderer.browser.mjs` additionally covers structurally indented finite grids, block-before-inline prose, absence of opaque markers in DOM/code-copy records, unchanged source and inert bound strings. Browser integration tests cover actual ReaderView and source/storage/analytics invariants; see the release verification report for executed platforms and remaining test limits.

`tests/rich-layout-r4.test.mjs` covers semantic paint, bounded static SVG, malformed/active SVG rejection, Markdown/math exclusions and repeated-SVG aggregate budgets. `tests/rich-layout-r4.browser.mjs` checks visible 51%/71%/100% fills in Platinum light/dark and forced colors, preserved explicit paint, safe SVG geometry, all nine icon names found in the second formatting response plus database/sparkles, the deliberate unknown-icon fallback, and a 680 px viewport.
