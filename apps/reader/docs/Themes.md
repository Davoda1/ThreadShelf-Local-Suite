# Appearance and code themes

Version 1.1.0 has these independent choices in Settings → Appearance:

- **Color mode:** System, Light or Dark. System follows the operating system, including changes while the application is open.
- **Interface theme:** Default, Ocean, Forest, Ember, Amethyst, OLED, Modern, Modern OLED, Platinum, Platinum Plus, Professional, Vellum, Prism, Nocturne, Garnet, Smoked Glass, Harbor Haze, Amber Room or Opal Daylight.
- **Code theme:** Default, VS Code, GitHub, Monokai, Nord, Dracula, Solarized, Codex, Xcode Classic or Ayu.
- **Local/Server widths:** Equal width (the default), Server wider (the original balance), or Local wider. The switch keeps the same overall width; this setting changes the space assigned to each tab.
- **Wave video background:** Off by default. Show the approved local wave loop behind conversation blocks, with the 03 dark video for Dark mode and the 05 day video for Light mode.
- **Show video on welcome page:** Available when waves are enabled; Off by default.
- **Use holiday fireworks:** Available when both waves and welcome video are enabled; Off by default. Replaces the welcome video on a recognized holiday, never a conversation video.
- **Prompt button style:** 1 Compact left, 2 Centered pill, 3 Divider footer, 4 Header action, or 5 Outlined right (the default).

All nineteen interface palettes and all ten code themes have Light and Dark versions selected by Color mode, with System following the operating system. Changing the interface palette leaves the selected code colors unchanged; changing code highlighting leaves the interface unchanged. Appearance changes can be previewed while the dialog is open; **Save settings** persists them. Cancelling, replacing the dialog or a failed save restores the committed appearance. High contrast is an explicit readability override above both palettes.

## Conversation background and prompt control

The **Wave video background** switch has the description “Show wave video loop behind conversation blocks.” The original switch enables video in an open conversation in the Reader workspace, in either Local or Server mode. In Professional, the same video also appears behind the transparent thread header; no extra video player is created. Platinum Plus retains the same video placement, while the opaque header hides the video directly beneath it. The dependent welcome switch extends playback to the welcome area. It does not replace the list, application toolbar, Settings, Activity or Insights backgrounds. Off retains the existing conversation background.

The ordinary assets are approved 12-second, 1920×1080, 24 fps loops. They are bundled in the desktop distributions and embedded in the offline preview; playback does not fetch media from the network.

| Resolved color mode | Approved video | Bundled asset |
| --- | --- | --- |
| Dark | 03 dark loop | `public/waves/quiet-water-v4-1920x1080-24fps.mp4` |
| Light | 05 day loop | `public/waves/05-day-loop.mp4` |

Holiday playback uses the separately bundled `01-multicolour-loop.mp4` and offline rules described in `Holidays.md`. It requires all three switches and a welcome screen. Disabling either parent switch stops welcome video while retaining the saved child preferences.

System mode uses the operating system's resolved Light/Dark appearance. Playback pauses while the document is hidden. Turning waves off, disabling app animations, enabling reduced motion or leaving Reader removes the active media; opening a conversation again restores it when allowed. Conversation and theme changes replace the media as needed, and discarded embedded Blob URLs are released. High contrast retains the selected video while preserving the theme's message surfaces and text styling.

The five prompt styles inherit the active theme's colors and retain the existing prompt expansion, collapse and keyboard behavior. They change the control's placement and styling, without changing archived message text or the long-prompt threshold.

| Setting | Stored ID |
| --- | --- |
| 1 Compact left | `compact-left` |
| 2 Centered pill | `centered-pill` |
| 3 Divider footer | `divider-footer` |
| 4 Header action | `header-action` |
| 5 Outlined right (default) | `outlined-right` |

## Interface palettes

| Palette | Appearance |
| --- | --- |
| Default | Established neutral surfaces and green accent, unchanged in normal contrast. |
| Ocean | Cool blue surfaces, blue controls and sea-green assistant accents. |
| Forest | Soft green surfaces with foliage accents. |
| Ember | Warm sand or charcoal-brown surfaces with copper accents. |
| Amethyst | Lavender or deep plum surfaces with violet accents. |
| OLED | Pure black background and near-black/grey surfaces in Dark mode; white background and pale-grey surfaces in Light mode. Neutral controls retain colored warning/error states. Message-type labels and left-edge indicators use blue for User, green for Assistant, amber for Thinking and purple for Tool/System. |
| Modern | Default's exact base colors and Reader role colors with neutral translucent glass, frosted banner and status bars, raised cards and controls, and layered highlights and shadows. The effects add no green cast to surfaces. |
| Modern OLED | OLED's exact neutral palette and colored chat-role labels/edges with Modern's glass and depth. Dark mode retains a true-black workspace; Light mode uses white and pale-grey surfaces. |
| Platinum | Cool silver-white or deep graphite surfaces with ice-blue accents, precise edges and restrained glass. |
| Platinum Plus | Professional colors and depth with an opaque, unblurred thread header and Settings window; other translucent surfaces and Thinking’s 2px blur remain. |
| Professional | Platinum neutrals with Glacier blue/cyan accents, layered glass and depth; visibly translucent Thinking surfaces with backdrop blur, and a transparent thread header with heavy backdrop blur. |
| Vellum | Warm ivory or ink surfaces, brass accents and softly layered matte depth. No glass backdrop. |
| Prism | Pale porcelain or blue-black glass with violet controls and a fine static cyan/violet banner edge. |
| Nocturne | Cool ivory with deep-blue controls in Light mode; midnight blue with soft-gold accents in Dark mode. Subtle glass and a fine gold edge. |
| Garnet | Pale surfaces with deep-red accents in Light mode; black with deep-red controls and bars in Dark mode. Off-white text preserves readable contrast on red surfaces. |
| Smoked Glass | Smoked charcoal and mist-grey glass with mint accents at night, pale neutral glass and deep-teal controls by day. |
| Harbor Haze | Blue/teal glass over an aqua, indigo and sea-green ambient backdrop; pale aquatic glass in Light mode. |
| Amber Room | Warm amber/brown glass and honey accents at night, golden ivory glass with dark-bronze controls by day. |
| Opal Daylight | Opalescent pale-blue/lilac glass by day, deep-blue glass with ice-blue accents at night. |

The nineteen interface palettes cover surfaces, borders, text, controls, focus, status colors, Reader navigation and message accents. Default is the initial selection. Theme changes preserve message geometry, source text and independent code colors.

Professional overlays the scrollport with an 8% cool tint and 12px backdrop blur. Thinking uses an 8% amber tint and 2px blur. A single video player supplies the background when enabled. Measured content padding and a visible-viewport inset keep messages, search results and bookmarks clear of the header. High contrast, forced colors, reduced transparency and unavailable backdrop-filter support use opaque surfaces.

Platinum Plus shares Professional's paired colors, depth and navigation behavior, but the thread header and Settings window are fully opaque and unblurred in both color modes. Thinking retains the same tint and 2px blur. The ordinary Settings dimming scrim remains.

Modern and Modern OLED change presentation without moving or resizing interface
elements. Glass colors derive from the selected base palette; lighting, shadows
and modal shading are neutral. Blur is confined to decorative banner/status
layers (24px) and the existing dialog backdrop (16px); graphs and their ancestors
do not gain transforms, filters or fixed-position containing blocks. Activity
tooltips stay opaque for clear data values. High contrast, forced colors and the
operating system's reduced-transparency preference replace the glass effects
with solid surfaces. Both Modern variants add no animations and honor the
existing animation and reduced-motion settings. They do not make the native
application window transparent or change independent code colors.

Platinum, Prism and Nocturne reuse the existing scoped Modern surface effects,
with static theme-specific refinements. Vellum uses matte surfaces. Garnet uses
a distinct black/deep-red treatment. These additions do not alter chart transforms,
message geometry, window transparency or the source-switch widths. New effects
honor high contrast, forced colors and reduced transparency. All five new
palettes retain distinct blue User, green Assistant, amber Thinking and purple
Tool/System indicators in normal contrast.

Smoked Glass, Harbor Haze, Amber Room and Opal Daylight provide four additional glass palettes.
Each has paired Light/Dark colors and a static, CSS-only ambient wallpaper inside
the application. Layered translucent panels, frosted cards, highlights and soft
shadows provide the glass effect. The Activity workspace uses the same
translucent wash as Reader to keep labels readable across wallpaper areas. The native desktop window remains opaque.
These palettes preserve the shared layout, source-switch proportions, responsive breakpoints, message offsets and scrollbar space.

The shared theme catalog keeps solid semantic colors for startup, fallbacks and
readouts. `src/ui/glassy.css` adds the optional translucent paint only for these
four IDs. Blur is applied to decorative pseudo-elements (32–40px according to
the design) and the dialog overlay (16px), never directly to charts or their
ancestors. Tooltips, transient help and the Reader navigator panel keep opaque
surfaces. High contrast, forced colors, reduced transparency and lack of blur
support use opaque surfaces. No animations or runtime dependencies are added.
Existing motion preferences continue to apply. Code themes, code copy buttons,
search highlights, source content, clipboard behavior and saved preferences keep
their existing independent behavior. Amber Room uses white text on the dark
Light-mode primary buttons to correct the design study's low-contrast pairing.
Amber Room and Opal Daylight use slightly darker Light-mode secondary text so
Activity labels retain contrast in short, wide windows.

## Code palettes and provenance

The new stylesheets and semantic token mappings are authored for this application. No upstream theme CSS rules are copied. Familiar editor palette colors informed the schemes below; these are adapted implementations, not official editor stylesheet distributions. All custom themes include readable text, comments, nested token classes, inline code, code controls, diff additions/deletions and paired light/dark variants.

| Theme | Basis and adaptations |
| --- | --- |
| Default | Existing Reader light/dark syntax styles and code surfaces. The normal-contrast appearance is preserved, including when a different interface palette is selected. |
| VS Code | Visual Studio-family colors, informed by Highlight.js `vs.css` (Visual Studio-like C# coloring by Jason Diamond) and `vs2015.css` (Nicolas LLOBERA), with an original extended semantic mapping and paired surfaces. This is not an official VS Code stylesheet. |
| GitHub | Familiar GitHub syntax colors, informed by Highlight.js `github.css` and `github-dark.css`; the upstream headers identify github.com and maintainer Hirse. |
| Monokai | Familiar Monokai colors, informed by the Highlight.js theme port by Luigi Maselli. An original light variant and brighter dark comments/keywords improve readability. |
| Nord | Nord color family by Arctic Ice Studio and Sven Greb, referenced through bundled Highlight.js `nord.css`. Original light adaptation and contrast-adjusted dark tokens. The upstream theme identifies the applicable MIT license. |
| Dracula | Familiar Dracula colors, referenced through the Highlight.js Base16 scheme by Mike Barkmin, based on Dracula Theme. Original light adaptation and brighter dark comments. The upstream header identifies an MIT-or-more-permissive scheme license. |
| Solarized | Ethan Schoonover's Solarized color family, referenced through bundled Highlight.js Base16 schemes, modified there by aramisgithub. Both variants have contrast-adjusted comments and token colors. The upstream headers identify MIT-or-more-permissive scheme licenses. |
| Codex | An original Codex-inspired palette combining quiet green surfaces, warm strings and restrained blue/purple tokens. It is not an official OpenAI or Codex stylesheet and includes no proprietary assets. |
| Xcode Classic | Xcode-inspired magenta keywords, red strings and distinct type colors. The light direction references the bundled Highlight.js `xcode.css`, “XCode style (c) Angel Garcia”; dark adaptation and Reader token mapping are authored for this application. It is not an official Apple theme or asset. |
| Ayu | Adapted from the [Ayu project's palette](https://github.com/ayu-theme/ayu-colors), with warm keywords, green strings and blue type colors. Light tokens are darkened for readable contrast on the Reader code background. The upstream MIT notice is retained in `licenses/Ayu-MIT.txt`. |

The existing Highlight.js package and the accompanying BSD notice remain included in the application distribution. Ayu’s MIT notice is also included in source/binary packages and embedded in the offline preview. Palette names identify visual references rather than an endorsement. Custom-theme code foreground and every semantic token color meet a 4.5:1 contrast ratio against their code background; label and diff-text pairs are checked as well. Default retains the Reader's historical colors, while High contrast provides a brighter, explicit code palette for every selection.

Themes are local CSS and hexadecimal colors. They fetch no fonts, stylesheets, images or other network resources, and add no runtime dependencies. Japanese UI glyphs use a separately bundled offline font, independent of the selected palette. Changing a palette modifies presentation only: code text, rendered token DOM, original export content and clipboard source remain unchanged.

## Startup appearance

Five small orbiting dots indicate startup.
Every interface palette uses the selected Light or Dark colors from the first
visible frame, including all nineteen Dark variants. System mode follows OS
appearance, including changes while the main interface loads. The dots use the
palette accent color; no visible Loading text or artificial display delay is
added. A localized loading status remains available to assistive technology.
Enabling reduced motion or disabling app animations keeps the dots stationary, and
forced-colors mode uses the operating system’s colors.

## Persistence and compatibility

The existing interface and code palette preferences are saved under the user-data root in `appearance.json`:

```json
{
  "schemaVersion": 1,
  "data": {
    "uiPalette": "default",
    "codeTheme": "default"
  }
}
```

The application merges these values into `bootstrap.settings` and accepts them through `settings.save`. Invalid IDs are rejected before any preference file is changed. The file uses the same atomic write, backup and shutdown-drain behavior as other saved preferences.

Existing `settings.json` retains the established keys, including `theme`; `interface.json` retains only `searchPanelExpanded`. The Local/Server width choice is stored separately as `sourceSwitchWidth` in `layout.json`. Older strict preference readers can continue reading the unchanged `settings.json` and `interface.json` key shapes while ignoring the new layout file. Merely loading the profile does not rewrite those existing files. This guarantee concerns those preference files only, not support for new palette IDs or other storage formats in older releases. Missing layout preferences select Equal width. Theme IDs remain separate in `appearance.json`; missing appearance preferences select both Default palettes. Invalid width or theme choices are rejected before saving. The archive database schema, reading positions, bookmarks and collection identities remain unchanged.

The existing `reader-appearance.json` stores wave, welcome-video, holiday-video and prompt-style preferences:

```json
{
  "schemaVersion": 1,
  "data": {
    "waveVideoBackground": false,
    "waveVideoWelcome": false,
    "holidayVideoWelcome": false,
    "promptExpandStyle": "outlined-right"
  }
}
```

Missing welcome-video fields default to Off. Professional and Platinum Plus are ordinary palette IDs in `appearance.json`. Close the application before replacing program files.

A missing Reader appearance file supplies all video switches Off and Outlined
right without writing a file merely to load defaults. Saving uses the established
atomic temporary-file rename and validated backup behavior. All three video values
must be booleans, and prompt styles must be one of the five supported IDs; invalid
values are rejected without coercion. A corrupt primary file can recover from a
validated backup. If neither copy is valid, or an unsupported envelope is
encountered, loading refuses the file and preserves the original bytes rather than silently
overwriting it. These preferences do not migrate archives or change reading
positions, bookmarks, collection identities, compression profiles or server data.

## Development

`src/core/themes.mjs` is the browser-safe shared catalog. It exports `UI_PALETTES`, `CODE_THEMES`, their ID arrays, and `APPEARANCE_DEFAULTS`. Each palette record contains `id`, `name`, `swatch` and `tokens.light` / `tokens.dark`. Default and Modern share empty token maps and inherit the original interface stylesheet's Light/Dark colors. Modern OLED shares OLED's complete immutable token maps.

`src/core/reader-appearance.mjs` defines the Reader appearance defaults and the five prompt-style IDs. `src/ui/reader-appearance.css` supplies the scoped prompt-control and wave-background styling. These additions leave the palette catalog and independent code themes intact.

The UI writes the selected IDs to root attributes `data-ui-palette` and `data-code-theme`; the existing `data-theme` holds the resolved light/dark mode. The optional `data-contrast="high"` takes priority for readability.

After editing catalog values or token mappings, run:

```sh
node scripts/generate-themes.mjs
npm run build
```

The generator writes committed `src/ui/themes.css` and `src/ui/code-themes.css`, imported after Reader styles. The generated interface stylesheet imports the separately maintained `src/ui/modern.css` for Modern, Modern OLED, Platinum, Prism, Nocturne and Garnet surface treatments;
`src/ui/theme-effects.css` supplies the scoped matte/glass/red refinements and
message-role colors; `src/ui/glassy.css` supplies the four
wallpaper/glass variants and their accessibility fallbacks. The generator runs only during development; packaged applications use bundled CSS. Rules target Reader code tokens and code controls without coloring unrelated UI content. Core tests verify catalog validity, contrast and preference compatibility; desktop tests verify computed colors, independent palettes, source preservation and clipboard behavior.
