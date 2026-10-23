// Synthetic rendering coverage; no private export content is reproduced.
// No security advisory facts or private account content are reproduced here.
export const securityCard = `<box border padding={3} radius="md" gap={3} background="surface-secondary">
  <row justify="between" align="center" wrap="wrap" gap={2}>
    <title>Synthetic security issue</title>
    <text color="danger" weight="semibold">Critical</text>
  </row>
  <row align="center" wrap="wrap" gap={2}>
    <text color="danger" size="xl" weight="bold" tabularNums>9.2 / 10</text>
    <caption>Synthetic severity value for renderer testing</caption>
  </row>
  <text>Saved description with **emphasis** and \`configuration.option\`.</text>
  <row gap={3} wrap="wrap"><text weight="semibold">Affects</text><text>Example application deployment</text></row>
  <row gap={3} wrap="wrap"><text weight="semibold">Evidence</text><text>A synthetic observation, not a security recommendation.</text></row>
  <row gap={3} wrap="wrap"><text weight="semibold">Action</text><text>Read the original source and its qualifications.</text></row>
  <row gap={2} wrap="wrap"><caption>Sources:</caption><Link url="https://example.org/advisory" title="Example source"/></row>
</box>`;

export const visualizeReference = 'visualize{"path":"/unavailable/security-cards.html"}';
export const securityMarkdown = '## Synthetic security issue\n\n**Critical · 9.2 / 10**\n\n- **Affects:** Example application.\n- **Action:** Read the source.\n\n[Example source](https://example.org/advisory)';
