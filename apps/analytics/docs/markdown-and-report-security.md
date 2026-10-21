# Markdown and report boundaries

`src/core/safe-markdown.mjs` is shared by the application evidence display and
opt-in HTML evidence exports. It consumes Marked 16.4.2 lexer tokens and creates
HTML from an explicit allowlist. It does not use `marked.parse` output as HTML.

Designated prose supports headings, paragraphs, emphasis, ordered/unordered
lists, quotes, inline code, backtick/tilde fences, indented code, and GFM tables.
Titles, source/model/provider identities, diagnostics, numerical cells, paths,
and timestamps remain literal. Raw HTML/SVG/MathML is escaped. Images are
omitted notices with alt text. No archived URL enters a `src`, `href`, style,
font, preview, embed, or automatic-loading attribute.

Source links appear as inert text. In the app, renderer-owned Copy link/Open
externally controls reference a numeric index in a separately held URL array;
the array only accepts absolute HTTP(S) URLs without credentials, whitespace,
controls, backslashes, or non-HTTP schemes. Source `id`, `name`, `data-*`, and
event attributes cannot create application controls. External opening requires
an explicit user action and the separate main-process HTTP(S) policy.

Highlighting retains the installed full highlight.js language set plus Fish and
existing language aliases. Highlight output is independently checked: only
escaped text and balanced `span` tags with allowed highlighter classes survive.
Unknown/invalid grammar output falls back to escaped code. The ten independent
code palettes remain available; HTML exports embed the selected palette as
static CSS with system light/dark variants.

Copy evidence uses the original source payload. Copy code uses the original
source code block rather than rendered/highlighted HTML. Direct fenced blocks
preserve original line endings and the final code newline; indented blocks
retain archived indentation. Fences without a closer are handled as code.
Rendering never changes capture text, content hashes, or measured populations.

Display parsing is bounded to 250,000 characters, 25,000 rendered tokens, and
32 nesting levels by default. These bounds affect display only; original text
is retained for copying and owned-text measurements remain independent.
Failure/truncation uses escaped fallback plus a visible excerpt notice. Evidence
that was already excerpted also carries the original full-text character count.

# Exact reports and privacy

CSV, JSON, and self-contained offline HTML serialize one applied report. New
Explorer sections retain exact histogram edges/counts, ECDF thresholds and
cumulative denominators, heatmap cells, graph supports, paired observations,
comparison values, eligibility, missing reasons, counting contracts, and display
aggregation disclosures. Drilldown registries and unrequested evidence-ID
arrays are omitted. Versions and capture/selection scope remain part of the
report. CSV text fields are protected against spreadsheet formula injection;
negative numeric cells remain numeric.

Aggregate reports omit conversation text/titles, private source paths, and new
prompt wording, full URLs, filenames, private language declarations, and private
categorical labels. Sensitive new columns use consistent neutral labels so
equality/matrix relationships and numerical weights remain exact. Applied
search wording is omitted while the population still reflects that applied
search; the omission is disclosed. `includeLabels: true` is a separate deliberate
choice from `includeEvidence: true`.
Unknown saved filter fields retain their original values in Analytics state,
but default reports replace those values with an explicit `unapplied` /
`valueOmitted` marker. Named unsupported keys and partial filter status remain
visible. Nested source wording in contract metadata is also neutralized. This
prevents an unrecognized future filter from exposing private wording even though
that filter was not applied to the reported population.

The preserved 1.0 tables may still contain recorded categorical model/provider,
domain, declared code-language, attachment-type, or filter labels. Consequently, aggregate export is not
an anonymity guarantee. The privacy metadata explicitly records this inherited
behavior instead of claiming that all potentially sensitive labels were absent.
Explicit evidence export includes only the requested evidence selection.

`legacyCompatible: true` (or `mode: 'legacy'`) preserves supported 1.0 analytical
meanings and omits Explorer additions. It is explicitly labelled and is neither
a lossless downgrade nor an application-state backup. The public app version is 1.0.0;
the preserved legacy analytical schema remains 1.0.0.

HTML reports contain embedded styling/favicon and no scripts or external font,
CDN, media, telemetry, or automatic requests. Original archived HTML/code is
never executed. Evidence excerpts and designated Coverage/definition prose use
the same safe token renderer as the application. Report navigation uses only
application-generated local fragment identifiers.

# Verification

`test/safe-markdown.test.mjs` tests supported structures, CRLF/original copy
payloads, malformed/unclosed code, strict URL handling, raw HTML/SVG/MathML/event
and command injection, omitted media, highlight allowlisting, installed language
coverage, and bounded large/deep input. `test/reports-v2.test.mjs` independently
checks exact histogram/ECDF values across all report formats, neutral-label
privacy defaults and opt-in behavior, legacy omissions, safe Markdown evidence,
palette CSS, table-identifier escaping, and formula protection. All fixtures in
these tests are invented. Inherited report/metric tests are run alongside them.
`test/explorer-integration.test.mjs` also exercises the actual A/B engines and
wrapper: all 32 required chart families, exact report rows, independently known
10/20/30-character response distributions and R7 quartiles, cumulative lazy ECDF
evidence, membership weighting, explicitly applied comparison selections with
a reconciled −7-character change and a +15-character median shift, unavailable
incompatible comparisons, real neutral-label defaults, and actual immutable
capture hash changes versus disabled-by-default history.

`test/desktop-bridge.test.mjs` runs the actual preload and actual main-process
IPC handler/sender policy in VM Electron mocks while using the real service,
Node calculation workers, capture/index/history storage, and report writes. It
checks positional/object history API mapping, synthetic source registration,
changed-content comparison, active-capture protection, targeted/all-history
removal, rebuilding with the original disconnected, filtered export, restart,
and preservation of unknown root/settings/window/discovery/annotation/view/
preset fields. It also checks main-process URL/sender/size rejection and preload
subscription disposal. These are meaningful message/storage integration checks;
they are explicitly not native Electron execution or a native OS shell-opening
test. All originals and settings in the harness are synthetic temporary files.

Retained history evidence uses the narrow `captureEvidence` bridge. The caller
supplies a registered source identity, retained capture fingerprint, scoped
record/conversation identities, applied filters, and page coordinates. There is
no path parameter. The main process retains the trusted-frame check; the service
validates selectors and bounds; a worker loads only an active/history reference
from positively owned capture storage. Current Analytics annotations and report
filter semantics apply. Results include exact population/page counts, original
capture provenance, original full-text character counts, and up to 100 records
with 20,000-character display excerpts. Retained identity availability and
observed-text availability are reported separately. Earlier removed records can
be read from an explicitly retained capture after the original source is
disconnected; unavailable or deleted history cannot be reconstructed. The
desktop bridge integration suite verifies this through the actual message path,
including object/positional overloads, pagination, aliases, exclusions, virtual
groups, model families, rejected paths/bounds, and removal of retained history.
