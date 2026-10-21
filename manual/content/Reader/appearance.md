# Appearance, reading preferences and accessibility

## Save or cancel a visual preview

Open **Settings → Appearance**. The app previews applicable appearance changes while the dialog is open. **Save settings** commits the choices; **Cancel** restores the saved appearance. Returning from nested Settings pages preserves the parent draft. This preview behavior concerns preferences, not already completed import/database/model operations.

## Appearance controls

| Control | Choices and behavior |
| --- | --- |
| Language | English, Magyar, Deutsch, Français or 日本語; stored conversation text is unchanged |
| Color mode | System follows the operating system; Light and Dark select an explicit mode |
| Interface palette | Nineteen palettes listed below, each with light/dark variants |
| Code-block theme | Ten independent code palettes; changing the interface palette does not reset it |
| Text size | Small, Normal, Large or Extra large |
| Local / Server width | Equal width, Server wider or Local wider; divides the existing source-switch width only |
| Wave video background | Shows bundled ordinary wave loops behind conversation blocks; Off by default |
| Show video on welcome page | Available under the master wave option; Off by default |
| Use holiday fireworks | Available when welcome video is enabled; Off by default |
| Styled analytics bars | Adds theme gradients/glow in Reader Local Activity and Server Insights; Off by default |
| Show full prompt style | Five designs for the same expand/collapse operation |
| High contrast | Uses readability-focused solid surfaces |
| Animations | Controls application transitions and participates in video/motion policy |

## Interface palette catalog

The order in this release is:

| Palette | Character |
| --- | --- |
| Default | Baseline app colors and role distinctions |
| Ocean | Ocean-oriented color accents |
| Forest | Forest-oriented color accents |
| Ember | Warm ember accents |
| Amethyst | Purple accents |
| OLED | Black/grey or white/grey surfaces with role colors |
| Modern | Default base colors with frosted neutral surfaces and depth |
| Modern OLED | OLED base with Modern material effects |
| Platinum | Silver/graphite with ice-blue accents |
| Platinum Plus | Professional colors and geometry, with opaque, unblurred thread header and Settings window |
| Professional | Cool blue accents, translucent/blurred surfaces and restrained depth |
| Vellum | Warm paper and ink with matte-brass accents |
| Prism | Neutral glass with violet/cyan edges |
| Nocturne | Midnight blue/gold or cool ivory/navy |
| Garnet | Deep-red controls and bars with black or pale surfaces |
| Smoked Glass | Glassy palette with an offline ambient background |
| Harbor Haze | Glassy harbor palette with an offline ambient background |
| Amber Room | Glassy warm palette with an offline ambient background |
| Opal Daylight | Glassy opal palette with an offline ambient background |

Platinum Plus is directly below Platinum and above Professional. In this release, the **Platinum Plus thread header and Settings window use neither transparency nor blur**. It retains Professional-derived colors, shadows and overlay geometry. Thinking retains the amber tint and 2 px backdrop blur; other dialogs retain their inherited material. Professional itself retains the translucent header with 12 px blur and the blurred Settings window. Do not expect choosing Platinum Plus to remove every translucent surface in the whole application.

These nineteen entries are the Reader catalog. Local Analytics has a separate release-specific palette catalog; do not assume the newer Reader themes appear in the separate Analytics application.

## Code themes

The code-block choices are Default, VS Code, GitHub, Monokai, Nord, Dracula, Solarized, Codex, Xcode Classic and Ayu. They use adapted light/dark pairs. Choose a code theme for readability of syntax and an interface palette for the rest of the app; the settings are intentionally independent.

Syntax highlighting is determined by the bundled language grammar and fence label. A color choice cannot make unsupported syntax execute or convert an unknown label into a recognized language. Plain code remains copyable even when no special highlighting applies.

## Prompt expansion styles

| Number | Style | Behavior |
| --- | --- | --- |
| 1 | Compact left | Compact left-aligned expansion control |
| 2 | Centered pill | Centered pill-shaped control |
| 3 | Divider footer | Expansion control associated with a divider/footer |
| 4 | Header action | Control presented as a header action |
| 5 | Outlined right | Right-aligned outlined control; default |

All five control the same retained long-prompt expansion state. The style choice does not alter the source, bookmarks, search or exports. The control appears when Compact conversation layout is enabled and the prompt is long enough to collapse.

## Video behavior

Ordinary wave video is opt-in. It uses the bundled 03 early-morning/dark and 05 day loops according to the resolved light/dark mode. It does not fetch background media. The master switch is labeled **Wave video background**, with the description **Show wave video loop behind conversation blocks.**

Enabling the master switch reveals **Show video on welcome page**. Enabling that reveals **Use holiday fireworks**. The settings are prerequisites, not three independent media players. Turning the master off stops video in both areas. Holiday video affects only the welcome page; an open conversation keeps ordinary waves.

Video respects application animation, operating-system reduced-motion and visibility controls. If you have enabled waves but do not see playback, check those preferences and whether the relevant workspace is visible. A reduced-motion environment may intentionally suppress motion. See [Holiday behavior](holidays.md).

## Reading settings

**Settings → Reading** offers Pages or Continuous scrolling, page sizes 20/25/50/100/200, ordinary list sort order, Compact conversation layout and a shortcut to Saved reading. Compact conversation layout affects long user prompts and reasoning collapses. It is not a setting that removes assistant replies or decreases the actual archive contents.

## Practical accessibility choices

Use an explicit light/dark mode if you need the same appearance regardless of the OS. Increase text size before enlarging screenshots or changing display scaling merely to read a paragraph. High contrast and operating-system forced colors use solid readable surfaces, so they can intentionally override some glass, gradient or translucent styling.

Keyboard focus is visible, dialogs keep focus within their bounds, and many hover chart interactions have keyboard equivalents. The original values remain available through tables and text, so chart color need not carry the whole meaning. Animation and reduced-motion settings affect transitions without deleting content.

Related: [Keyboard reference](../Reference/shortcuts.md), [Reading](reading.md), [Holidays](holidays.md).

