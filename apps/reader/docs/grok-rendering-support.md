# Grok archive rendering — Reader and Alternative 1.4.3

These adapters display retained Grok presentation data inside the existing reader.
They never rewrite the original message, imported archive, metadata or whole-message
Copy text. They do not run tools, scripts, interface documents, tasks, permission
requests, connector authentication, purchases or location requests.

## Supported envelopes

- Raw `<grok:render>` markers, including optional `card_type` / `type` and dynamic
  `<argument name="…">` values; ordinary XML entities and CDATA values are decoded
  as data without an XML DOM, DTD or entity-expansion engine.
- `grok-card` / `grok-card-list` and their URI-encoded `data-id`, `data-type`,
  `data-plain-type`, and `data-arg-*` attributes.
- The recorded self-closing `<grok type="render_card" id="…" />` form,
  historical `<grok:richcontent>`, paired `grok` UI envelopes, generated-image
  groups, file groups, `image-card` and `file-mention`.
- The observed `[](grok_render_citation_card_json={"cardIds":[…]})` citation-link form.
- `xaiArtifact` metadata/content and `xai:tool_usage_card` activity records.
- Explicit, complete `chartjs` and `xaitask` fenced JSON blocks. Other fenced,
  inline, indented and escaped code examples remain literal code.

Unknown family names and incomplete or malformed envelopes remain inspectable.
Closing markers found inside protected code cannot consume that code block.
A missing closing tag does not absorb later messages, paragraphs or siblings.

## Identity and source resolution

The native Grok import retains the original `raw.responses` objects. Source
message identifiers resolve only that message's own `cardAttachment`,
`cardAttachmentsJson`, `card_attachments_json`, or `cardAttachments` metadata.
An encoded container is parsed as bounded JSON, then cards bind by explicit
`id`, `card_id`, or `cardId`. Conflicting duplicate card IDs become unresolved.
There is no title matching, global card search, array-position inference from
`citation_id`, or invented URL.

Resolved citations use compact source links with app-owned SVG icons. Tooltips
and accessible labels retain the source title, exact card/citation IDs and original
marker. Missing metadata displays a readable unresolved reference. Block cards
include expandable original markup and saved data. Whole-message Copy remains
byte-for-byte the original message string.

A server or earlier converter may have discarded the required metadata. Such
records display an informative fallback until actual metadata is supplied; a
rendering update cannot reconstruct discarded sources or assets.

## Card presentation

| Card family | Reader behavior |
| --- | --- |
| `citation_card` / DOM `citation_card_list` | Exact-ID citation links or explicit unresolved chips |
| `image_card`, `generated_image_card` | Actual retained image URL through the existing image loading/caching policy; missing-image notice otherwise |
| `images_card` and generated-image groups | Bounded explicitly identified image members |
| `rendered_file_card` | Recorded HTTP(S) file link, or missing-asset label retaining the filename/path |
| `generated_video_card`, `generated_audio_card`, `media_variant_card` | Recorded media link; no unsolicited autoplay or remote player |
| `chart_card` | Safe SVG chart for supported literal data, otherwise inspectable saved configuration |
| `visualization_card`, `ui_card`, `mcp_app_card` | Readable archived metadata and source; imported HTML/interface code is not executed |
| `places_card`, `weather_card`, `sports_card`, `finance_card`, `x_posts_card`, `x_users_card` | Bounded readable saved fields and exact source data; no invented live lookup |
| `ask_user_question_card`, `request_permission_card`, `request_connector_auth_card`, `location_request_card`, `checkout_form_card`, `automation_card`, `safety_warning` | Passive SVG-headed archived card, showing saved fields and inspectable data |
| `xaiArtifact` | Title/MIME label; safe Markdown rendering or literal code. Valid SVG source retains the existing explicit SVG preview controls |
| `xai:tool_usage_card` | Tool name/activity and source, with no execution |

These are archive representations of the supported card families, not replicas
of Grok's live interactive app. Unknown future fields remain in saved-data
inspection. The dated vocabulary is not treated as a final universal schema.

## Chart.js and task fences

The Chart.js adapter handles `bar`, `line`, `pie`, `doughnut` and `scatter` with
finite numeric data; horizontal bars; titles; bounded linear axes; and up to eight
series / 200 categories / 1,000 points under the existing SVG chart limits.
Dataset colours and simple presentation settings use the reader's theme and
local chart presentation. Unsupported semantics—including stacking, logarithmic
or time axes, callback fields, hidden series, filled/tensioned lines, bubble
radius, radar and polar-area charts—retain their original configuration as data.
It does not execute callback strings or guess unsupported chart meanings.

`xaitask` JSON displays a passive archived task with its saved fields. No schedule
is created. Both data-fence types retain the exact original inner code in an
expandable source block with the existing Copy control. Original whole-message
Copy still contains the complete original fences.

## Safety and bounds

Only app-created DOM and SVG icons are inserted. Source content uses text nodes;
URLs require credential-free HTTP(S) without control characters or backslashes.
Image URLs are handed through the normal deferred image renderer and privileged
resource authorization. Reader retains its public-address-only image network
policy; private/local destinations remain blocked. Generic links do not become
image-fetch permissions.

Parsing limits include 2,000,000 message characters, 200,000 characters per
component, 256 component records, bounded JSON depth/fields/nodes, and a bounded
metadata collection. Accessors, prototype keys, cycles and hostile arrays are
rejected without evaluation. A shared per-message rendering budget also limits
repeated expansion of the same large card. Over-budget components show an
explicit display-limit notice; the original archived message and Copy remain
available unchanged.

## Regression coverage

`tests/grok-rendering.test.mjs` exercises protocol forms, exact ID resolution,
missing/conflicting metadata, literal code, malformed boundaries, XML/CDATAs,
Unicode, chart semantics, source preservation, budgets and hostile data shapes.

`tests/grok-rendering.browser.mjs` exercises the production ConversationRenderer
under Chromium, or optionally Electron with sandbox/context isolation, using the
production CSP. It verifies
all recognized family presentations, resolved/unresolved citations, deferred
images, SVG charts, narrow/wide light/dark layouts, original message/code copying,
keyboard source inspection, zero unsolicited network requests, no imported script
execution and bounded repeated-card rendering.
