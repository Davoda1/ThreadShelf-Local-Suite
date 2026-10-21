// Synthetic examples for the offline preview; no private export content.
// All charts enter the same message parser and production renderer as archives.
import {exportedFixtures, readerFixtures, genuiMessage, readerMessage} from '../tests/fixtures/chart-compatibility.mjs';

export const richLayoutPreview = `
### Rich export rendering

This paragraph is ordinary Markdown before the dashboard. These examples are synthetic: they demonstrate preserved literal data through the production Reader, not a complete account-export or converter/server round trip. Whole-message Copy retains the original source.

<box border radius="lg" padding={3} gap={2}>
  <row align="center" gap={3}>
    <icon name="file-text" size="xl"/>
    <box flex="1" gap={1}>
      <title>Native UI rendering dashboard</title>
      <caption>Cards, local icons and Markdown inside a theme-aware frame.</caption>
    </box>
  </row>
  <divider/>
  <grid columns={3} gap={2}>
    <grid-item>
      <box border radius="md" padding={3} gap={2} background="surface-secondary">
        <icon name="file-text"/>
        <title>Archive</title>
        <text weight="semibold">32 messages</text>
        <caption>Synthetic preserved conversation records.</caption>
      </box>
    </grid-item>
    <grid-item>
      <box border radius="md" padding={3} gap={2} background="surface-secondary">
        <icon name="file-code"/>
        <title>Formatting</title>
        <text>**Bold**, *italic* and \`inline-code\` text.</text>
        <caption>Ordinary Markdown remains readable inside cards.</caption>
      </box>
    </grid-item>
    <grid-item>
      <box border radius="md" padding={3} gap={2} background="surface-secondary">
        <icon name="check-circle"/>
        <title>Identity</title>
        <Entity category="software" value="TS32 Demo Reader" disambig="Synthetic preview identity"/>
        <caption>A saved label, with no external lookup.</caption>
      </box>
    </grid-item>
  </grid>
  <divider/>
  <caption>Ready · all three cards are local, synthetic preview content.</caption>
</box>

This ordinary Markdown paragraph comes immediately after the dashboard. It must remain visible, with **emphasis**, \`code\` and an inline <Entity category="software" value="ThreadShelf Local Reader"/> preserved.

### Four finite steps

<grid columns={4} gap={2}>
  {#each [{s:"Import",t:"Keep the source"},{s:"Parse",t:"Validate literal data"},{s:"Render",t:"Draw locally"},{s:"Verify",t:"Inspect exact values"}] as item,i}
    <grid-item>
      <box border radius="md" padding={2} gap={2}>
        <caption>Step {i}</caption>
        <title>{item.s}</title>
        <text>{item.t}</text>
        {#if i < 3}<icon name="arrow-right"/>{/if}
      </box>
    </grid-item>
  {/each}
</grid>

### Layout-based progress

<box border radius="md" padding={3} gap={3}>
  {#each [{name:"Alpha",width:"51%"},{name:"Beta",width:"71%"},{name:"Gamma",width:"100%"}] as item}
    <box gap={1}>
      <row justify="between"><text>{item.name}</text><text tabularNums>{item.width}</text></row>
      <box width="100%" height="14px" radius="full" background="surface-secondary" border clip>
        <box width={item.width} height="14px" radius="full" background="surface-tertiary"/>
      </box>
    </box>
  {/each}
</box>
`;

const interactionNotes = {
  C01: 'Hover or focus any category to inspect the exact count. The numeric domain is 0–60.',
  C02: 'Inspect Beta: Score 70.5%, with the matching color swatch. The chart-level suffix is presentation only; values are never multiplied.',
  C03: 'Inspect Zero at the baseline as well as the negative and positive bars. Zero remains an exact, reachable value.',
  C04: 'Inspect Beta: Coverage 71%. The saved layout "vertical" arranges categories vertically and bars horizontally.',
  C05: 'Inspect Second: Series A 0 and Series B 1. Inspect Third: Series A 3.125 and Series B 2. One shared panel follows the category crosshair.',
  C07: 'Inspect Alpha: raw Items 6 and locally calculated share of total 60%. This widget family uses a local ring presentation; its saved chartType remains "pie".',
  C09: 'Inspect the point at X=2: Probe A, Y=3.125. The X-position guide follows the numeric coordinate. This source contains no P1/P2/P3 labels.',
};

export const chartCompatibilityPreview = `
### Native widget fixtures

These seven chat-derived synthetic objects use their actual recognized GenUI message envelope. Move the pointer within a chart or use keyboard focus to inspect the custom panel. Exact values remain available in each chart's disclosure. Escape dismisses inspection; changing the active target allows inspection again.

${exportedFixtures.map(f=>`#### ${f.id} — ${f.title}\n\n${interactionNotes[f.id]}\n\n${genuiMessage(f.payload)}`).join('\n\n')}
`;

export const readerChartsPreview = `
### Reader-owned chart presentations

These seven explicit \`threadshelf-chart\` version 1 fixtures demonstrate the Reader's own contract. They are not additional claims about exported widget schemas. The repeated labels in the line fixture remain separate positions; its zero and fractional values remain exact. The grouped bars include negative zero. Solid pie and doughnut retain their explicitly requested presentations.

${readerFixtures.map(f=>`#### ${f.id} — ${f.title}\n\n${readerMessage(f.content)}`).join('\n\n')}
`;

export const richRegressionPreview = `
### Source and fallback controls

This ordinary Markdown table stays a table; values alone never establish a chart:

| Category | Value |
| --- | ---: |
| Alpha | 51 |
| Beta | 71 |
| Gamma | 100 |

Inline component syntax stays code: \`<Entity value="Literal inline example"/>\`.

\`\`\`json
{"charts_widget_v2":{"content":{"chartType":"bar","xKey":"category","series":[{"dataKey":"count"}],"data":[{"category":"Literal JSON","count":32}]}}}
\`\`\`

\`\`\`html
<box><text>Fenced component source remains code.</text></box>
<svg><circle cx="10" cy="10" r="5"/></svg>
\`\`\`

    <Entity value="Indented component source remains code"/>

Bound strings are inert text even when they resemble markup, Markdown or template directives:

<box border padding={2}>
  {#each [{label:'<Entity value="inert"/> **inert emphasis** {#if 1 === 1}inert{/if}'}] as item}
    <text>{item.label}</text>
  {/each}
</box>

This unknown chart semantic retains saved data, and the valid sibling after it still renders:

<Chart content={{"chartType":"bar","xKey":"name","stacked":true,"series":[{"dataKey":"value"}],"data":[{"name":"Unsupported stacking","value":1}]}}/>

<box border padding={2}><text>Valid sibling after unsupported chart data.</text></box>

An external image description stays offline: <AsyncImage query="synthetic offline preview image"/>

[Interactive visualization not included in this export.]

Synthetic saved currency snapshot: 1 USD = 315.68 HUF, as of 1 October 2026. Not a live rate.

TS32-NATIVE-UI-END

Ordinary Markdown continues after the rich examples. Message Copy, code Copy, selection and search remain available. Use Settings to inspect the production themes, languages, light/dark/system appearance, large text and high contrast.
`;

export const revision4Preview = `
### Revision 4 rendering corrections

These synthetic examples exercise both saved progress layouts and native component chart wrappers.

<box border radius="md" padding={3} gap={3}>
  <row gap={2}><icon name="database"/><icon name="sparkles"/><text>Neutral and semantic fills</text></row>
  {#each [{width:"51%",color:"surface-secondary"},{width:"71%",color:"info"},{width:"100%",color:"info"}] as item}
    <text tabularNums>{item.width}</text>
    <box width="100%" height="14px" background="surface-tertiary" radius="full" clip>
      <box width={item.width} height="14px" background={item.color}/>
    </box>
  {/each}
</box>

${exportedFixtures.filter(f=>['C04','C05','C07','C09'].includes(f.id)).map(f=>readerMessage(f.payload.charts_widget_v2.content)).join('\n\n')}

<box border radius="md" padding={3} gap={2}>
  <title>Saved static SVG illustration</title>
  <svg viewBox="0 0 200 80" width="100%" height="80px" preserveAspectRatio="xMidYMid meet">
    <path d="M10 70 L60 35 L110 50 L190 10 L190 70 Z" fill="#3b82f6" fillOpacity="0.2"/>
    <path d="M10 70 L60 35 L110 50 L190 10" fill="none" stroke="#3b82f6" strokeWidth="3"/>
    <circle cx="60" cy="35" r="4" fill="#3b82f6"/>
  </svg>
  <caption>This illustration uses its saved geometry. It is not an interactive chart payload.</caption>
</box>
`;

export const revision5Preview = `
### Revision 5 cards and allocation

These synthetic examples preserve a saved image slot and a two-part allocation. Query-only images remain offline because no image asset is present.

<row gap={3} align="center">
  <AsyncImage query="synthetic archive workstation" aspectRatio="5:4" maxWidth="172px"/>
  <box flex={1} gap={1}>
    <text weight="semibold"><Entity category="product" value="Archive workstation" disambig="Synthetic preview product"/></text>
    <caption>A saved card label and description.</caption>
    <text>Original reference identifiers remain available in a compact source marker. <Cite refs={["turn701search0","turn701search1"]}/></text>
  </box>
</row>

<box gap={3}>
  <row gap={3}>
    <box flex={1}><caption>Total capacity</caption><title>144 units</title></box>
    <box flex={1}><caption>Active allocation</caption><title>120 units</title></box>
    <box flex={1}><caption>Reserve</caption><title>24 units</title></box>
  </row>
  <box direction="row" height="14px" radius="full" background="surface-secondary" clip>
    <box background="#4788C7" flex={120}/>
    <box background="#A4AAB5" flex={24}/>
  </box>
  <row justify="between" gap={2}>
    <text>Active allocation (83.3%)</text><text>Reserve (16.7%)</text>
  </row>
</box>
`;

export const revision6Preview = `
### Revision 6 image placeholders

The selected Corner aperture design sits beside text; Soft horizon fills a wide image slot. Both inherit the active Reader theme. These examples contain only synthetic image descriptions.

<row align="center" gap={3}>
  <AsyncImage query="synthetic archive subject thumbnail" aspectRatio="5:4" maxWidth="148px"/>
  <box flex={1} gap={1}>
    <text weight="semibold">A compact subject card</text>
    <text>The archived description remains readable beside its original image slot.</text>
  </box>
</row>

<AsyncImage query="synthetic full-width archive landscape" aspectRatio="16:9" width="100%"/>

The source image is not present in this synthetic example. Its place in the layout is retained.
`;

export const richPreview = richLayoutPreview + chartCompatibilityPreview + readerChartsPreview + revision4Preview + revision5Preview + revision6Preview + richRegressionPreview;
