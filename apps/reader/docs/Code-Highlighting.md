# Code highlighting

Version 1.1.0 retains the separate **Code theme** preference: Default, VS Code, GitHub, Monokai, Nord, Dracula, Solarized, Codex, Xcode Classic and Ayu. It changes colors, not language detection or source text. Every palette follows the independent System/Light/Dark color mode. The new wave background and prompt-control style do not change code colors or source text. See `Themes.md` for variants and provenance.

ThreadShelf Local Reader 1.1.0 bundles **194 grammars**: every one of highlight.js 11.12.0’s 193 registered languages, plus a dedicated Fish grammar written for this project under the MIT license. Plain text is included in that count. Mermaid uses a separate bundled diagram renderer and is not part of the grammar count. No grammar is downloaded at runtime.

## Requested languages and shell dialects

| Fence label | Rendering |
| --- | --- |
| C, C++, C#, Rust, Python, Java, JavaScript, JSON, HTML/XML, CSS, PowerShell | Dedicated bundled grammars |
| Fish, fishshell, fish-shell | Dedicated Fish grammar; functions, control flow, builtins, comments, quoting, variables/list slices and nested command substitutions |
| Bash | Bash grammar |
| Zsh | Shared Bash lexical grammar, labeled Zsh |
| sh, POSIX, posix-sh, posix-shell, sh/posix, posix/sh | Shared Bash lexical grammar, labeled POSIX Shell |
| ksh, ksh93, mksh, dash, ash | Shared Bash lexical grammar, labeled by the shell |
| shell | Generic shell script, using Bash lexical highlighting |
| console, shellsession, shell-session, terminal | Prompted Shell Session grammar with Bash command highlighting |

A highlighter colors source; it does not validate, run, or translate it. Shared shell grammars cover common shell syntax but do not claim a complete parser for every Zsh/KornShell dialect extension. Unknown labels remain readable as plain text. User-supplied HTML remains inert.

Fence names are case-insensitive. Common labels such as C++, C#, js, py, rs and ps1 are recognized, as are language-/lang- prefixes, .python, and {.python}. Extra fence metadata after the first token does not alter the language.

The original code text remains available for copying after highlighting or search. Message copy always uses the original archived Markdown. Mermaid’s own Copy control copies whichever Original/Repaired source is displayed.

## Registered grammars

This table is generated from the actual bundled registry. The next table records Reader-specific fence overrides; those overrides take priority over upstream alias names. In particular, the upstream canonical name shell describes a prompted session, while a raw shell fence deliberately selects script highlighting. Use console or shellsession for prompts.

| Grammar ID | Language | Upstream aliases |
| --- | --- | --- |
| 1c | 1C:Enterprise | — |
| abnf | Augmented Backus-Naur Form | — |
| accesslog | Apache Access Log | — |
| actionscript | ActionScript | as |
| ada | Ada | — |
| angelscript | AngelScript | asc |
| apache | Apache config | apacheconf |
| applescript | AppleScript | osascript |
| arcade | ArcGIS Arcade | — |
| arduino | Arduino | ino |
| armasm | ARM Assembly | arm |
| asciidoc | AsciiDoc | adoc |
| aspectj | AspectJ | — |
| autohotkey | AutoHotkey | ahk |
| autoit | AutoIt | — |
| avrasm | AVR Assembly | — |
| awk | Awk | — |
| axapta | X++ | x++ |
| bash | Bash | sh, zsh |
| basic | BASIC | — |
| bnf | Backus–Naur Form | — |
| brainfuck | Brainfuck | bf |
| c | C | h |
| cal | C/AL | — |
| capnproto | Cap’n Proto | capnp |
| ceylon | Ceylon | — |
| clean | Clean | dcl, icl |
| clojure | Clojure | clj, edn |
| clojure-repl | Clojure REPL | — |
| cmake | CMake | cmake.in |
| coffeescript | CoffeeScript | coffee, cson, iced |
| coq | Coq | — |
| cos | Caché Object Script | cls |
| cpp | C++ | c++, cc, cxx, h++, hh, hpp, hxx |
| crmsh | crmsh | crm, pcmk |
| crystal | Crystal | cr |
| csharp | C# | c#, cs |
| csp | CSP | — |
| css | CSS | — |
| d | D | — |
| dart | Dart | — |
| delphi | Delphi | dfm, dpr, pas, pascal |
| diff | Diff | patch |
| django | Django | jinja |
| dns | DNS Zone | bind, zone |
| dockerfile | Dockerfile | docker |
| dos | Batch file (DOS) | bat, batch, cmd |
| dsconfig | dsconfig | — |
| dts | Device Tree | — |
| dust | Dust | dst |
| ebnf | Extended Backus-Naur Form | — |
| elixir | Elixir | ex, exs |
| elm | Elm | — |
| erb | ERB | — |
| erlang | Erlang | erl |
| erlang-repl | Erlang REPL | — |
| excel | Excel formulae | xls, xlsx |
| fish | Fish | fish-shell, fishshell |
| fix | FIX | — |
| flix | Flix | — |
| fortran | Fortran | f90, f95 |
| freedesktop | FreeDesktop config | desktop, systemd |
| fsharp | F# | f#, fs |
| gams | GAMS | gms |
| gauss | GAUSS | gss |
| gcode | G-code (ISO 6983) | nc |
| gherkin | Gherkin | feature |
| glsl | GLSL | — |
| gml | GML | — |
| go | Go | golang |
| golo | Golo | — |
| gradle | Gradle | — |
| graphql | GraphQL | gql |
| groovy | Groovy | — |
| haml | HAML | — |
| handlebars | Handlebars | hbs, html.handlebars, html.hbs, htmlbars |
| haskell | Haskell | hs |
| haxe | Haxe | hx |
| hsp | HSP | — |
| http | HTTP | https |
| hy | Hy | hylang |
| inform7 | Inform 7 | i7 |
| ini | TOML, also INI | toml |
| irpf90 | IRPF90 | — |
| isbl | ISBL | — |
| java | Java | jsp |
| javascript | JavaScript | cjs, js, jsx, mjs |
| jboss-cli | JBoss CLI | wildfly-cli |
| json | JSON | json5, jsonc |
| julia | Julia | — |
| julia-repl | Julia REPL | jldoctest |
| kotlin | Kotlin | kt, ktm, kts, ktx |
| lasso | Lasso | lassoscript, ls |
| latex | LaTeX | tex |
| ldif | LDIF | — |
| leaf | Leaf | — |
| less | Less | — |
| lisp | Lisp | — |
| livecodeserver | LiveCode | — |
| livescript | LiveScript | ls |
| llvm | LLVM IR | — |
| lsl | LSL (Linden Scripting Language) | — |
| lua | Lua | pluto |
| makefile | Makefile | mak, make, mk |
| markdown | Markdown | md, mkd, mkdown |
| mathematica | Mathematica | mma, wl |
| matlab | Matlab | — |
| maxima | Maxima | — |
| mel | MEL | — |
| mercury | Mercury | m, moo |
| mipsasm | MIPS Assembly | mips |
| mizar | Mizar | — |
| mojolicious | Mojolicious | — |
| monkey | Monkey | — |
| moonscript | MoonScript | moon |
| n1ql | N1QL | — |
| nestedtext | Nested Text | nt |
| nginx | Nginx config | nginxconf |
| nim | Nim | — |
| nix | Nix | nixos |
| node-repl | Node REPL | — |
| nsis | NSIS | — |
| objectivec | Objective-C | mm, obj-c, obj-c++, objc, objective-c++ |
| ocaml | OCaml | ml |
| openscad | OpenSCAD | scad |
| oxygene | Oxygene | — |
| parser3 | Parser3 | — |
| perl | Perl | pl, pm |
| pf | Packet Filter config | pf.conf |
| pgsql | PostgreSQL | postgres, postgresql |
| php | php | — |
| php-template | PHP template | — |
| plaintext | Plain text | text, txt |
| pony | Pony | — |
| powershell | PowerShell | ps, ps1, pwsh |
| processing | Processing | pde |
| profile | Python profiler | — |
| prolog | Prolog | — |
| properties | .properties | — |
| protobuf | Protocol Buffers | proto |
| puppet | Puppet | pp |
| purebasic | PureBASIC | pb, pbi |
| python | Python | gyp, ipython, py |
| python-repl | python-repl | pycon |
| q | Q | k, kdb |
| qml | QML | qt |
| r | R | — |
| reasonml | ReasonML | re |
| rib | RenderMan RIB | — |
| roboconf | Roboconf | graph, instances |
| routeros | MikroTik RouterOS script | mikrotik |
| rsl | RenderMan RSL | — |
| ruby | Ruby | gemspec, irb, podspec, rb, thor |
| ruleslanguage | Oracle Rules Language | — |
| rust | Rust | rs |
| sas | SAS | — |
| scala | Scala | — |
| scheme | Scheme | scm |
| scilab | Scilab | sci |
| scss | SCSS | — |
| shell | Shell Session | console, shellsession |
| smali | Smali | — |
| smalltalk | Smalltalk | st |
| sml | SML (Standard ML) | ml |
| sqf | SQF | — |
| sql | SQL | — |
| stan | Stan | stanfuncs |
| stata | Stata | ado, do |
| step21 | STEP Part 21 | p21, step, stp |
| stylus | Stylus | styl |
| subunit | SubUnit | — |
| swift | Swift | — |
| taggerscript | Tagger Script | — |
| tap | Test Anything Protocol | — |
| tcl | Tcl | tk |
| thrift | Thrift | — |
| tp | TP | — |
| twig | Twig | craftcms |
| typescript | TypeScript | cts, mts, ts, tsx |
| vala | Vala | — |
| vbnet | Visual Basic .NET | vb |
| vbscript | VBScript | vbs |
| vbscript-html | VBScript in HTML | — |
| verilog | Verilog | sv, svh, v |
| vhdl | VHDL | — |
| vim | Vim Script | — |
| wasm | WebAssembly | — |
| wren | Wren | — |
| x86asm | Intel x86 Assembly | — |
| xl | XL | tao |
| xml | HTML, XML | atom, html, plist, rss, svg, wsf, xhtml, xjb, xsd, xsl |
| xquery | XQuery | xpath, xq, xqm |
| yaml | YAML | yml |
| zephir | Zephir | zep |

## Reader fence aliases and overrides

| Fence | Resolved grammar |
| --- | --- |
| (empty) | plaintext |
| ash | bash |
| asm | x86asm |
| c# | csharp |
| c++ | cpp |
| cc | cpp |
| cjs | javascript |
| console | shell |
| cp | cpp |
| cplusplus | cpp |
| cs | csharp |
| csharp | csharp |
| cxx | cpp |
| dash | bash |
| docker | dockerfile |
| dockerfile | dockerfile |
| env | bash |
| fish | fish |
| fish-shell | fish |
| fishshell | fish |
| golang | go |
| h | c |
| h++ | cpp |
| hpp | cpp |
| htm | xml |
| html | xml |
| hxx | cpp |
| js | javascript |
| ksh | bash |
| ksh93 | bash |
| kt | kotlin |
| kts | kotlin |
| log | plaintext |
| md | markdown |
| mermaid | mermaid |
| mjs | javascript |
| mksh | bash |
| mmd | mermaid |
| nasm | x86asm |
| no-highlight | plaintext |
| node | javascript |
| nodejs | javascript |
| nohighlight | plaintext |
| output | plaintext |
| pl | perl |
| plain | plaintext |
| plaintext | plaintext |
| posix | bash |
| posix-sh | bash |
| posix-shell | bash |
| posix/sh | bash |
| ps | powershell |
| ps1 | powershell |
| pwsh | powershell |
| py | python |
| py3 | python |
| python3 | python |
| rb | ruby |
| rs | rust |
| sh | bash |
| sh/posix | bash |
| shell | bash |
| shell-session | shell |
| shellsession | shell |
| sqlite | sql |
| svg | xml |
| terminal | shell |
| text | plaintext |
| ts | typescript |
| txt | plaintext |
| x86asm | x86asm |
| xhtml | xml |
| xml | xml |
| yml | yaml |
| zsh | bash |

## Verification and provenance

`tests/code-highlighting.test.mjs` verifies actual token spans and exact text round trips for C, C++, C#, Rust, Python, Zsh, Bash, sh, POSIX, JSON, Java, JavaScript, HTML, CSS, Fish, shell scripts, PowerShell, and prompted console sessions. It also checks every registered upstream alias, explicit Reader aliases, and Fish-specific quoting/substitution rules. `tests/reader.browser.mjs` renders those examples in Electron and verifies code/message copying.

The Fish grammar is original MIT-licensed project code in `src/reader/fish.js`, based on the [official Fish language documentation](https://fishshell.com/docs/current/language.html) and [command reference](https://fishshell.com/docs/current/commands.html). It is independent of the Bash grammar. highlight.js retains the original BSD-3-Clause notice in `licenses/`.
