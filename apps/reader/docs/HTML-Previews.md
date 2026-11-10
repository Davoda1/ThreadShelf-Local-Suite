# Conversation styling and isolated HTML previews

Reader and Alternative 1.4.4.

## Conversation text

Ordinary user and response text can contain safe HTML formatting, including
`<mark>` and `<span style="color:#e64340;background-color:#a8c0ff">`.
The sanitizer permits a bounded set of formatting elements and CSS properties.
It rejects scripts, event handlers, URL-bearing CSS and application-wide styling.
Existing Markdown formatting, code literals, original copying and SVG rules remain.

VeniceAI markers such as `^1^` and `^12^` use small soft-square citation badges
which follow the current application theme. A marker does not invent a source,
URL or source title absent from the export. Code and math remain literal/protected.

## Eligible HTML blocks

Only unlabelled blocks and original labels `unknown`, `html`, `htm`, `html5`
qualify. Language highlighting guesses do not expand this list. The source must
be one complete HTML5 page with its doctype and explicit html, head and body
structure. Fragments, escaped source, quoted/template content, malformed/truncated
pages and multiple documents do not qualify. Programming-language labels such as
JavaScript, Python and PHP always remain code. There is no server/template compiler.

Code is initially selected. Render starts a temporary preview. Copy and download
use the original code, irrespective of the active view. A complete HTML page may
contain SVG; standalone SVG retains its previous isolated image-only handling.

## Preview boundary

The desktop preview has a separate temporary browser session and sandboxed native
view. It has no Node.js integration or application API, and cannot access the
conversation archive, application settings or arbitrary local files. HTML/CSS
and ordinary embedded JavaScript run only within that preview. The offline HTML
demo cannot reproduce this native isolation and does not substitute an executable
iframe for it.

Reading → Allow external resources in HTML previews starts enabled. It applies
only to these previews, not ordinary conversation images or configured providers.
Public HTTPS resources can be loaded through the guarded preview network path;
local/private addresses, non-HTTPS network addresses and unsupported protocols are
rejected. Disabling the option stops active previews and blocks subsequent external
resources and script-generated requests. Embedded scripts and assets remain usable.
Disabling loading cannot undo a request which already completed.

The preview is not a general-purpose browser. Permission requests, popups,
downloads, server form submission and automatic navigation are restricted.
External link opening requires a genuine user action and validation. A plain
relative filename has no accompanying project directory to read.

Switching to Code, leaving the conversation or changing preview network policy
destroys the page. Rendering again starts fresh; temporary values and script
state are not retained. The page's own styles remain confined to its preview;
the surrounding controls use existing application theme tokens.
