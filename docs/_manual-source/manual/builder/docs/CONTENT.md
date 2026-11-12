# Content format and output behavior

## Directory selection and precedence

Each directory has an optional title and an ordered menu. Selection order is:

1. `.menu.json` containing `entries` supplies the menu.
2. Otherwise a regular, non-symlink `gophermap` supplies the menu.
3. Otherwise immediate public children are listed, directories first and then files, using deterministic natural ordering with a bytewise tie-breaker.

A `.menu.json` containing only `title` does not suppress a `gophermap` or the automatic listing. `index.md` or `index.txt` is rendered above the menu independently of the selected menu format. Markdown has precedence over text when both intro files exist.

An explicitly empty entries array creates an empty menu. It does not deny direct access to other public files. All eligible files receive static wrapper pages regardless of whether a custom menu links to them. The full site index includes eligible documents and directories, omitting the intro source files as separate entries. PHP search includes their text under the corresponding directory result.

Root and nested `.menu.json` share the same schema. Menu paths are literal source names, not URL-encoded strings. Relative paths resolve from the menu's directory; leading `/` means the content root. `..` is allowed in authored links only while the result stays within the content root. Request parameters do not accept dot-segment navigation.

Unknown settings/fields, missing targets, bad JSON, repeated `auto` entries, or an entry with multiple category keys are errors. Menu/site metadata is limited to 256 KiB; the catalog has a separate 2 MiB limit. Each information string in `.menu.json` is limited to 32 KiB; labels are limited to 1,000 bytes. Keep metadata reasonably small.

## Menu entries

| Key | Meaning |
| --- | --- |
| `text` | Informational text, split into rows at newlines; blank lines preserved. |
| `path` | A local directory or file. An optional `label` overrides the title. |
| `url` | An HTTP, HTTPS or mailto link. Optional `label`. Native Gopher links require explicit opt-in. |
| `search: true` | PHP search / site index, or the static full site index. Optional `label`. |
| `tags: true` | Optional cross-directory tag index in both editions. Optional `label`. |
| `auto: true` | Remaining direct children, excluding explicitly listed targets and intro sources. |

No title inference or word substitution is applied to filenames. `.menu.json` labels let you show friendly names without renaming the actual files.

## Optional catalog (3.0.0; compatible with 2.0.0)

Put `.catalog.json` in the root of the content tree. It accepts exactly one `items` object whose keys are literal, case-sensitive paths relative to the root. Each item may contain `title` and `author` (200 bytes each), `description` and `alt` (1,000 bytes each), `date` and `updated` (valid YYYY-MM-DD calendar dates), and `tags` (up to 16 nonempty UTF-8 strings, 80 bytes each). `updated` cannot precede `date` when both exist. A catalog may contain at most 10,000 items, 256 distinct tags, and occupy at most 2 MiB. Unknown fields, missing or non-public targets, repeated tags on one item, and invalid types fail content checks and builds. A missing catalog is valid and produces an empty tag index.

```json
{
  "items": {
    "Books/Reading list.md": {
      "description": "A reading list for visitors.",
      "tags": ["Books", "Reference"]
    },
    "Computers/Terminal browsers.txt": {
      "tags": ["Reference"]
    }
  }
}
```

Descriptions appear on item pages, site-index rows, and tag results. Tags link to separate pages containing every item with that exact tag. Tag names are case-sensitive across items (`Books` and `books` create distinct tag pages), though duplicates on a single item differing only by ASCII letter case are rejected. The PHP search checks descriptions and tag names as well as filenames and readable text. Tag browsing needs no JavaScript, database, or URL rewriting. Static tag pages live under `_gopher/tags/`; PHP routes use `?tags=1` and `?tag=<name>`. Rebuild the static edition after editing the catalog; refresh the PHP edition.

## Gophermap input

Tabs, not spaces, separate fields:

```text
TYPEdisplay text<TAB>selector<TAB>host<TAB>port
```

For example, with `gopher_host` set to `example.test`:

```text
Welcome to this directory.

0About this archive	/About.txt	example.test	70
1Books	/Books	example.test	70
hExternal website	URL:https://example.org/	example.org	70
```

The code block displays `\t` for clarity; put **real tab characters** in the file. Information lines without tabs are preserved as text; `i` entries with tabs are also information. The terminal single-dot line is ignored. Omitted host/port fields are allowed for local menus. To avoid ambiguity, selectors should be ordinary literal source paths, not pre-encoded HTTP URLs.

| Type | Behavior |
| --- | --- |
| `0`, `1`, `5`, `9`, `g`, `I`, local `h` | Resolves a public source item and links to its appropriate HTTP wrapper. The actual file kind determines rendering. |
| `i` | Information row. |
| `3` | Error/unavailable row, escaped as text. |
| `h` with `URL:` | Safe external HTTP, HTTPS or mailto navigation. |
| `7`, local | PHP site-wide search, or the static site index; does not implement the original selector's query semantics. |
| `7`, remote | Explicitly unavailable. No proxy requests. |
| `8` | Explicitly unavailable Telnet service. |
| Other types / malformed fields | Rejected. |

The local host is the configured `gopher_host` and port; an omitted host is also treated as local. Other Gopher targets are annotated as disabled by default. Set `external_gopher` to `link` to emit native `gopher://` links with a “Gopher client required” label. The application does not translate those remote services into HTTP. Executable or server-specific menu extensions are not run.

## Text and Markdown

Plain text preserves whitespace and newlines inside an escaped `pre` element. Long lines wrap for reading; original downloads preserve the file bytes. Browser font choice determines exact character widths.

The dependency-free Markdown dialect supports:

- ATX and setext headings, basic generated heading IDs and duplicate suffixes.
- Paragraphs, `**bold**`, `*italic*`, `~~strikethrough~~`, inline backticks and fenced code.
- Ordered/unordered lists, ordinary nested lists, blockquotes, horizontal rules.
- Basic pipe tables (header and body), links and raster-image references.
- Basic HTTP/mailto angle autolinks and Markdown punctuation escapes.
- Full/collapsed/shortcut reference links with standalone definitions.
- Noninteractive `[x]` / `[ ]` task-list markers and fenced-code language captions.
- Automatic contents navigation for document pages with at least three headings.

It is **not** a complete CommonMark or GitHub-Flavored Markdown implementation. Footnotes, YAML frontmatter, interactive task-list controls, HTML passthrough, syntax highlighting, math, table alignment, arbitrary embedded media, and every nested-emphasis/list edge case are outside its supported dialect. Unsupported constructs remain ordinary escaped text; links using a blocked scheme are labeled. Do not use Markdown as an executable template language.

ATX example:

```markdown
# Notes

A **strong statement** and some `inline code`.

[About](../About.txt)
[Specific section](#examples)
![Local picture](../Images/picture.png)

## Examples

- One item
- Another item
```

Heading IDs replace runs of non-letters/non-digits with `-`, trim them, and lowercase ASCII. Repeated IDs receive `-2`, `-3`, etc. Non-ASCII case folding of generated IDs is not promised. The reserved navigation ID begins with `_gh-` and does not conflict with generated heading IDs.

Link paths in Markdown are **URLs**, unlike literal JSON menu paths. Encode `#` as `%23` and a literal `%` as `%25`; `&` can be `%26`. Spaces can be `%20` or a destination can be angle-bracketed. A `#` that is not encoded is a fragment separator even inside angle brackets. Examples:

```markdown
[Accented file](<Név%20%26%20spaces%20%231.txt>)
[Percent filename](plus%2Bpercent%253F.txt)
```

Local links are rewritten to the generated HTML / PHP route; root-relative source links resolve within the source tree rather than the host's domain root. Fragments survive. Strict build/check validates local section targets against the actual generated heading IDs; missing sections fail strict validation. Local query strings are not supported; external HTTP URLs may have queries. A remote Markdown image is converted into a link rather than fetched as an image, avoiding an automatic tracking request.

Unreadable/non-UTF-8 text or text exceeding `max_text_bytes` gets an explanatory wrapper and an original download. Text rendering has a default limit of 2 MiB and configurable maximum of 16 MiB. Directory traversal has a depth limit of 64 and a configurable node cap, default 10,000; very large archives should be measured before deployment. PHP full-text search scans eligible text on each request and is intended for modest personal archives, not a heavily loaded search service.

## Output names and downloads

```text
content/Books/Notes.md       -> public/Books/Notes.md.html
content/About.txt           -> public/About.txt.html
content/Images/picture.png  -> public/Images/picture.png.html
content/Books/              -> public/Books/index.html
                            -> public/_gopher/index.html (full site index)
```

Appending `.html`, rather than replacing the extension, distinguishes `Notes.md` from `Notes.txt`. A source directory whose name conflicts with a generated file is rejected. ASCII-case-equivalent output collisions are also rejected. The generator is not a complete validator for every OS-specific filename rule; keep source names portable when using Windows/macOS filesystems.

Original file bytes are copied into `_gopher/files/<SHA-256-of-logical-source-path>.<safe-extension>`. This SHA-256 is a routing filename derived from the path, **not a content checksum**. Actual release checksums are separate. Setting `show_checksums` adds the actual SHA-256 content digest to each file wrapper. The wrapper's `download` attribute and PHP response's `Content-Disposition` preserve the original filename where supported. Very old browsers may save the hashed basename; original bytes are unaffected.

Text and source-code downloads use `.txt` / `text/plain`. Verified PNG, GIF, JPEG, WebP, and AVIF files use their detected image type. Other files, including HTML, SVG, and archives, are served as binary attachments. There is intentionally no active HTML/SVG preview.

## Private, reserved, or unsupported paths

Dotfiles and dot-directories, backup names ending in `~`, `gophermap` as a directly downloadable item, and any `_gopher` subtree are non-public. Symbolic links, sockets/devices, and unreadable files are excluded. The following extensions are excluded on any path component, case-insensitively for ASCII:

```text
php php3 php4 php5 php7 php8 phtml pht phar cgi fcgi asp aspx jsp
pem key sqlite sqlite3 db bak old swp
```

This is not a comprehensive secrets classifier. Ordinary `.txt` or `.json` files are publishable even when their contents are sensitive. Only put public material in the source tree. All participating files should remain stable during a build; the publisher does not take filesystem snapshots.


## New publishing settings

| Setting | Default | Limits / behaviour |
| --- | --- | --- |
| `description` | empty | Plain text used in page metadata |
| `language` | `en` | Language-tag-shaped ASCII identifier |
| `base_url` | empty | Absolute HTTP(S) directory URL; no credentials, query or fragment |
| `page_size` | 100 | 1–1,000 menu rows per directory page, including information rows |
| `search_page_size` | 30 | 1–200 interactive results per page |
| `search_budget_bytes` | 16 MiB | 1 byte–64 MiB total indexed text |
| `static_search` | true | Optional offline JavaScript search; complete no-script HTML index remains |
| `show_checksums` | false | Display actual SHA-256 digests of original files |
| `show_details` | true | Include catalog descriptions in ordinary menu rows |

Existing settings remain: `site_name`, `gopher_host`, `gopher_port`, `external_gopher`, `show_types`, `footer`, `max_text_bytes`, and `max_entries`. Unknown settings are rejected. All limits are validation boundaries, not performance promises.

## Pagination and editorial metadata

The first directory page keeps its ordinary path. Later static pages live in `_gopher/pages/<SHA-256-of-directory-path>/<number>.html`; PHP uses `?p=...&page=2`. Information rows count toward page size, and menu order is preserved. Introductions appear only on page one. Every page has ordinary previous/next links; the complete no-script index is not truncated.

Titles in the catalog override inferred file/directory titles. Explicit menu labels still override display labels in that menu. Byline and dates appear on item pages. Sibling navigation follows the ordinary sorted immediate-file order, excluding directory introductions; it does not reorder itself to match custom menus.

## Search indexing and ordering

Both engines match a literal phrase in title (weight 8), path (6), description (4), joined tags (3) and readable body (1). Weights add; stable traversal order breaks relevance/date ties. Title sort uses a deterministic bytewise order supplied by PHP to the static index, not locale collation. Tags are exact-match filters. Date sorting uses `updated`, falling back to `date`.

Directory introductions are indexed under their directory. The empty-query index omits the root directory itself. A nonempty query can find it. Binaries have name/metadata entries but no body. Oversized or invalidly encoded text is omitted from body indexing and counted in a visible notice. Unicode case matching follows PCRE/JavaScript Unicode rules; neither engine normalises composed/decomposed spellings. Snippet boundaries can differ slightly because PHP budgets UTF-8 bytes and browsers slice UTF-16 strings.

The generated static index embeds public text as escaped JSON. This can make the index page substantially larger than ordinary pages; it is a deliberate tradeoff for offline search without a network service. CSP grants permission only to the exact embedded script’s SHA-256. Editing that script in generated HTML requires a rebuild, including its CSP hash.

## Recent items, feeds and sitemap

`_gopher/recent.html` uses explicit catalog publication dates and sorts by update/publication date descending. Undated items and directories do not become feed entries. Atom and RSS include up to 50 dated files. Feeds use plain-text summaries, stable canonical item URLs, midnight UTC dates, and the configured site name as the fallback Atom author. An empty Atom feed uses the Unix epoch as a deterministic fallback timestamp.

Setting `base_url` enables Atom, RSS, sitemap and canonical metadata. For static output this must be the actual deployment directory, including any subdirectory. For PHP it must be the directory containing the application file. Navigation remains relative; these discovery URLs are absolute. Never publish the example’s `example.invalid` placeholder unchanged if you want usable subscriptions or indexing.

The sitemap includes source-item wrapper URLs and directories, excluding standalone introduction files. It does not enumerate search queries, tags, recent pages or directory continuation pages. This intentionally avoids duplicate discovery surfaces. RSS and Atom timestamps describe articles, not the age of their historical subject matter.

## PHP download and cache semantics

HTML/XML representations use strong SHA-256 ETags of their emitted body. Original downloads use a strong content ETag and Last-Modified. If-None-Match takes precedence over If-Modified-Since. Cache-Control is `no-cache`, permitting storage with revalidation, not `no-store`.

GET supports one byte range, including suffix and open-ended forms, with If-Range handling. An unsatisfiable supported range receives 416; a valid range receives 206. Multipart ranges are intentionally ignored and return the complete representation. HEAD returns full-representation headers and no body. Content-Length and range streaming are tested, but a file changing during a response is outside the stable-content model.
