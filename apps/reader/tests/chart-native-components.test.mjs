// Revision 4: the native Chart components carry the same literal contracts
// as the existing public synthetic widget fixtures. No private exports here.
import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeChart, exactChartValue} from '../src/reader/rich-charts.js';
import {prepareRichMarkdown} from '../src/reader/rich-parser.js';
import {exportedFixtures, fixtureById, genuiMessage, readerMessage, fixtureLiteral} from './fixtures/chart-compatibility.mjs';

const content = id => structuredClone(fixtureById(id).payload.charts_widget_v2.content);
function parsedChart(source) {
  const records = [...prepareRichMarkdown(source).records.values()];
  assert.equal(records.length, 1);
  assert.equal(records[0].tag, 'Chart');
  assert.equal(records[0].source, source);
  return normalizeChart(records[0].attrs.content, {family: records[0].family || 'Chart'});
}

for (const fixture of exportedFixtures) test(`${fixture.id}: native component and legacy wrapper preserve widget rendering semantics`, () => {
  const input = fixture.payload.charts_widget_v2.content;
  const original = fixtureLiteral(input);
  const widget = normalizeChart(input, {family: 'charts_widget_v2'});
  assert.equal(widget.ok, true);
  for (const source of [readerMessage(input), genuiMessage({chart: {language: 'recharts-json', content: input}})]) {
    const native = parsedChart(source);
    assert.equal(native.ok, true, native.reason);
    assert.deepEqual(native.chart, widget.chart);
  }
  assert.equal(fixtureLiteral(input), original);
});

test('native horizontal bars retain direction, exact percentages and bounds', () => {
  const result = parsedChart(readerMessage(content('C04')));
  assert.equal(result.chart.orientation, 'horizontal');
  assert.deepEqual(result.chart.yDomain, {min: 0, max: 100});
  assert.deepEqual(result.chart.series[0].values, [51, 71, 100]);
  assert.equal(exactChartValue(result.chart.series[0].values[1], result.chart.series[0]), '71%');
});

test('native scatter metadata is retained without turning point order into labels', () => {
  const input = content('C09');
  input.meta = {title: 'Synthetic samples', description: '<script>inert</script>', footer: 'Saved values'};
  input.series[0].unit = 'V';
  input.yAxisMin = -3;
  input.yAxisMax = 5;
  const chart = parsedChart(readerMessage(input)).chart;
  assert.equal(chart.description, input.meta.description);
  assert.equal(chart.title, input.meta.title);
  assert.equal(chart.footer, input.meta.footer);
  assert.deepEqual(chart.series[0].points, [{x: .5, y: -2.5}, {x: 2, y: 3.125}, {x: 4.5, y: 1.25}]);
  assert.equal(exactChartValue(chart.series[0].points[1].y, chart.series[0]), '3.125 V');
  assert.deepEqual(chart.yDomain, {min: -3, max: 5});
});

test('native chart support does not relax unknown fields, layouts or data validation', () => {
  for (const family of ['Chart', 'chart', 'charts_widget_v2']) {
    for (const [id, mutate] of [
      ['C04', value => { value.layout = 'horizontal'; }],
      ['C05', value => { value.layout = 'vertical'; }],
      ['C05', value => { value.stacked = true; }],
      ['C05', value => { value.series[0].stackId = 'a'; }],
      ['C07', value => { value.valueKey = 'other'; }],
      ['C07', value => { value.data[0].value = -1; }],
      ['C07', value => { value.innerRadius = 40; }],
      ['C09', value => { value.data[0].x = '0.5'; }],
      ['C09', value => { value.data[0].label = 'P1'; }],
      ['C09', value => { value.meta = {source: 'unrecognized'}; }],
    ]) {
      const input = content(id); mutate(input);
      const result = normalizeChart(input, {family});
      assert.equal(result.ok, false, family + ': ' + fixtureLiteral(input));
      assert.equal(fixtureLiteral(result.payload), fixtureLiteral(input));
    }
  }
  assert.equal(normalizeChart(content('C05'), {family: 'unrecognized'}).ok, false);
});

test('converter-created Markdown tables remain passive and are not reconstructed as charts', () => {
  for (const source of [
    '**Synthetic saved bar data**\n\n| Category | Value |\n| --- | ---: |\n| A | 12 |\n| B | 18 |',
    '**Synthetic saved pie data**\n\n| Category | Amount |\n| --- | ---: |\n| A | 6 |\n| B | 4 |',
  ]) {
    const result = prepareRichMarkdown(source);
    assert.equal(result.records.size, 0);
    assert.equal(result.content, source);
  }
});
