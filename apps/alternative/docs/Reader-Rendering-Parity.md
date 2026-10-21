# Rendering comparison with ThreadShelf Local Reader

Alternative shares licensed rich-rendering components with Local Reader, while retaining a separate reading interface. The following describes Alternative's implemented behavior.

| Area | Alternative 1.0.0 behavior |
| --- | --- |
| Mermaid repair | Uses Reader's unchanged deterministic repair module. It can infer missing flowchart/sequence headers, quote punctuation-sensitive labels, correct sequence message semicolons, and convert supported legacy bar syntax. Original rendering is tried first; a maximum of four candidates is attempted. |
| Diagram inspection | Repaired previews are labelled. Original/repaired views and source disclosures remain available. Copy original and Copy repaired are separate; message copy and Markdown export preserve the original. |
| Diagram appearance and safety | Diagrams rerender when Light/Dark/System appearance changes. Archive directives cannot override rendering configuration; HTML, callbacks and external diagram links remain inert. Unsupported or oversized diagrams retain readable source. |
| Markdown and code | Tables, inline formatting, lists, quotations and fenced code retain their structure. The offline 194-language highlighter uses VS Code Light+/Dark+ colors; literal source is preserved for copying. |
| Mathematics | Reader-derived source protection and local MathJax preserve TeX, including literal math-like text inside code. Exported HTML is not executed. |
| Rich cards and layout | The bounded Reader parser/renderers support the validated Entity, box/row/text, divider, step/progress, and static-illustration contracts. Progress colors follow the active palette, and adjacent segments retain their saved proportions. |
| Charts | The existing shared rich renderer retains validated bar, horizontal bar, line, area, pie/doughnut and scatter presentations, exact values and accessible tables. Hover and keyboard inspection handle negative, zero and fractional values. Escape dismisses an inspected chart without also closing reader panels. |
| Images | Compact Corner aperture and full-width Soft horizon placeholders retain their saved bounds/aspect ratios and theme colors. Unavailable image assets are not replaced with guessed photographs; available external links open only when selected. |
| Citations | Compact citations use explicit, message-scoped source bindings. Direct raw-mapping messages preserve message/node identities so they reach the reference resolver. Missing or mismatched bindings remain unavailable rather than linking to a guessed source. |
| Find, outline and reading | Alternative keeps a separate full-text Find, prompt outline, saved reading positions and focused reading layout. Syntax spans remain compatible with phrase matching and exact copying. |

Alternative deliberately keeps long user prompts expanded. Reader folds them after fifteen rendered lines and offers five fold-button styles. Alternative retains separate reasoning/tool/system disclosures, typography, reading pane, theme choices and chart tooltip placement. Reader's wave backgrounds, local archive manager, and separate theme catalog are outside this renderer comparison.

The two new fictional ChatGPT conversations demonstrate these features through an observatory notebook and a diagram workshop. They use supported saved-content structures, including message-scoped citation metadata. The three fictional Claude guide chats use the normal conversation renderer and link to those examples.

The Mermaid repair source is included at `vendor/reader-source/mermaid-repair.js`. The deterministic adapter rebuild is documented in `BUILD.md`. Run the browser verification scripts listed there to check the renderer.

Rich rendering can only use data retained by the server or export. Missing source assets, unsupported visual contracts and metadata removed during server normalization cannot be reconstructed faithfully by the client.
