#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  buildMermaidRepairCandidate,
  buildMermaidRepairCandidates,
} from '../src/reader/mermaid-repair.js';

const validFlowchart = `flowchart TD
  A[Imported chat] --> B[Rendered diagram]
`;
assert.ok(buildMermaidRepairCandidates(validFlowchart).length >= 1, 'fallback candidates may exist, but the renderer must only try them after the original fails');

const flowchartWithParentheses = `graph LR
  subgraph Sources
    A[Ubuntu Security Notices]
    B[Vendor Feeds (nginx, Node.js, PHP, DB)]
    C[Global CVE Feeds]
    D[Container Scanners (Trivy, Grype)]
    E[Dependency Scanners (npm audit, osv-scanner)]
  end
  A --> B
  B --> C
`;
const flowchartCandidates = buildMermaidRepairCandidates(flowchartWithParentheses);
assert.ok(flowchartCandidates.length >= 1, 'parenthesized flowchart labels should produce repair candidates');
assert.match(flowchartCandidates[0], /B\["Vendor Feeds \(nginx, Node\.js, PHP, DB\)"\]/);
assert.match(flowchartCandidates[0], /D\["Container Scanners \(Trivy, Grype\)"\]/);
assert.match(flowchartCandidates[0], /E\["Dependency Scanners \(npm audit, osv-scanner\)"\]/);
assert.match(flowchartCandidates[0], /A\[Ubuntu Security Notices\]/);

const sequenceWithSemicolons = `sequenceDiagram
  participant S as "Sensor Constellation"
  participant F as "Fleet AI (Command)"
  participant W as "Weapon Bus (RKKV/Swarms)"
  participant D as "Defender Net"

  S->>F: "Detection: hot plume, acceleration profile, ephemeris"
  F->>F: "Forecast: where can intercept occur in 6–24 months?"
  F->>W: "Launch plan signed; midcourse corridor selected"
  W->>D: "Approach: minimal emissions; passive nav + star fixes"
  D->>D: "Deception: decoys, spoofed signatures, false plume profiles"
  D->>S: "Attempt sensor saturation (laser dazzling / EW)"
  S->>F: "Track confidence drops; corridor update"
  F->>W: "Terminal corrections (tiny Δv) + target constraints"
  W-->>D: "High-velocity pass; casualties occur without 'visual range'"
`;
const sequenceCandidates = buildMermaidRepairCandidates(sequenceWithSemicolons);
assert.ok(sequenceCandidates.length >= 1, 'sequence messages with literal semicolons should produce repair candidates');
assert.doesNotMatch(sequenceCandidates[0], /signed; midcourse/);
assert.match(sequenceCandidates[0], /signed#59; midcourse/);
assert.match(sequenceCandidates[0], /emissions#59; passive/);
assert.match(sequenceCandidates[0], /drops#59; corridor/);
assert.match(sequenceCandidates[0], /pass#59; casualties/);
assert.match(sequenceCandidates[0], /6–24 months/);
assert.match(sequenceCandidates[0], /tiny Δv/);
assert.ok(
  sequenceCandidates.some((candidate) => /participant F as Fleet AI \(Command\)/.test(candidate)),
  'a later fallback should normalize quoted participant aliases',
);

const unquotedSequence = `sequenceDiagram
  participant S as Sensor Constellation
  participant F as Fleet AI Command
  S->>F: Detection – hot plume, acceleration profile, ephemeris
  F->>F: Forecast intercept window (6–24 months)
  F->>S: Track confidence drops; corridor update
`;
const unquotedCandidate = buildMermaidRepairCandidate(unquotedSequence);
assert.ok(unquotedCandidate, 'unquoted sequence with a semicolon should be repairable');
assert.match(unquotedCandidate, /drops#59; corridor update/);
assert.match(unquotedCandidate, /Detection – hot plume/);

const bareSequenceMessage = `F->>F: "Forecast: where can intercept occur in 6–24 months?"`;
const bareSequenceCandidates = buildMermaidRepairCandidates(bareSequenceMessage);
assert.ok(bareSequenceCandidates.length >= 1, 'a bare sequence message should gain a sequenceDiagram header');
assert.match(bareSequenceCandidates[0], /^sequenceDiagram\nF->>F:/);

const bareFlowchart = `A[Outer system sensors\\n(AU-scale)] --> B[Track & forecast]`;
const bareFlowCandidates = buildMermaidRepairCandidates(bareFlowchart);
assert.ok(bareFlowCandidates.length >= 1, 'a bare flowchart fragment should gain a flowchart header');
assert.match(bareFlowCandidates[0], /^flowchart TD\n/);
assert.ok(
  bareFlowCandidates.some((candidate) => /A\["Outer system sensors\\n\(AU-scale\)"\]/.test(candidate)),
  'a flowchart fallback should quote parser-sensitive node labels',
);

const bareNode = `D[Inspection shell\\n(traffic control)]`;
const bareNodeCandidates = buildMermaidRepairCandidates(bareNode);
assert.ok(bareNodeCandidates.length >= 1, 'a bare Mermaid node should be treated as a flowchart fragment');
assert.match(bareNodeCandidates[0], /^flowchart TD\n/);

const legacyBar = `bar
    title Example usable fraction (6-disk vdev)
    Mirror 50
    RAIDZ1 83
    RAIDZ2 67
    RAIDZ3 50
`;
const barCandidate = buildMermaidRepairCandidate(legacyBar);
assert.ok(barCandidate, 'simple legacy bar pseudocode should convert to xychart-beta');
assert.match(barCandidate, /^xychart-beta/);
assert.match(barCandidate, /x-axis \["Mirror", "RAIDZ1", "RAIDZ2", "RAIDZ3"\]/);
assert.match(barCandidate, /bar \[50, 83, 67, 50\]/);

const unrelatedBrokenDiagram = `sequenceDiagram
  this is not a sequence message
`;
assert.equal(buildMermaidRepairCandidate(unrelatedBrokenDiagram), null, 'unsupported syntax errors must not invent a repair candidate');

const sourceSnapshot = sequenceWithSemicolons;
buildMermaidRepairCandidates(sequenceWithSemicolons);
assert.equal(sequenceWithSemicolons, sourceSnapshot, 'repair generation must not mutate the archived source string');

console.log('Mermaid repair tests: PASS');
