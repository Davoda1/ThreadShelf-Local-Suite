import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFragment} from 'parse5';
import {
  buildSeriesChartModel,
  nearestDateIndex,
  clientPointToViewBox,
  createSeriesChartState,
  renderSeriesChart,
} from '../src/ui/series-hover.mjs';

const day = offset => new Date(Date.UTC(2026, 0, 1 + offset)).toISOString().slice(0, 10);
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≈ ${expected}`);
const nodes = root => [root, ...(root.childNodes || []).flatMap(nodes)];
const attributes = node => Object.fromEntries((node.attrs || []).map(attribute => [attribute.name, attribute.value]));
const render = input => renderSeriesChart({title: 'Model timeline', t: key => key, formatNumber: value => String(value), ...input});

test('Date lookup clamps outside the plot and chooses the closest date in chart coordinates', () => {
  const geometry = {left: 38, right: 622};
  assert.equal(nearestDateIndex(-100, 5, geometry), 0);
  assert.equal(nearestDateIndex(38, 5, geometry), 0);
  assert.equal(nearestDateIndex(184, 5, geometry), 1);
  assert.equal(nearestDateIndex(330, 5, geometry), 2);
  assert.equal(nearestDateIndex(621, 5, geometry), 4);
  assert.equal(nearestDateIndex(1000, 5, geometry), 4);
  assert.equal(nearestDateIndex(330, 1, geometry), 0);
  assert.equal(nearestDateIndex(330, 0, geometry), null);
  assert.equal(nearestDateIndex(65, 4, {left: 20, right: 110}), 2);
});

test('Client coordinates respect CSS scaling and both SVG letterbox directions', () => {
  const viewBox = {x: 0, y: 0, width: 640, height: 195};
  const scaled = clientPointToViewBox({clientX: 650, clientY: 215, rect: {left: 10, top: 20, width: 1280, height: 390}, viewBox});
  close(scaled.x, 320);
  close(scaled.y, 97.5);
  const vertical = clientPointToViewBox({clientX: 48, clientY: 145.5, rect: {left: 10, top: 20, width: 640, height: 390}, viewBox});
  close(vertical.x, 38);
  close(vertical.y, 28);
  const horizontal = clientPointToViewBox({clientX: 458, clientY: 53, rect: {left: 100, top: 25, width: 1280, height: 195}, viewBox});
  close(horizontal.x, 38);
  close(horizontal.y, 28);
});

test('The 45-date and eight-series window retains exact original table row identities', () => {
  const rows = Array.from({length: 70}, (_, dateIndex) => Array.from({length: 10}, (_, seriesIndex) => ({date: day(dateIndex), model: `model-${seriesIndex}`, count: dateIndex * 10 + seriesIndex}))).flat();
  const model = buildSeriesChartModel({key: 'dateModel', field: 'model', rows});
  assert.deepEqual(model.days, Array.from({length: 45}, (_, index) => day(index + 25)));
  assert.deepEqual(model.series, Array.from({length: 8}, (_, index) => `model-${index}`));
  for (let seriesIndex = 0; seriesIndex < model.series.length; seriesIndex++) {
    for (let dateIndex = 0; dateIndex < model.days.length; dateIndex++) {
      const originalIndex = (dateIndex + 25) * 10 + seriesIndex;
      const cell = model.cells[seriesIndex][dateIndex];
      assert.equal(cell.kind, 'observed');
      assert.equal(cell.rowIndex, originalIndex);
      assert.equal(cell.row, rows[originalIndex]);
      assert.equal(cell.count, rows[originalIndex].count);
    }
  }
  assert.equal(model.max, 697, 'Only rows within the visible dates and series establish the scale');
  const smaller = buildSeriesChartModel({key: 'dateModel', field: 'model', rows, maxDates: 3, maxSeries: 2});
  assert.deepEqual(smaller.days, [day(67), day(68), day(69)]);
  assert.deepEqual(smaller.series, ['model-0', 'model-1']);
  assert.equal(smaller.cells[1][2].rowIndex, 691);
});

test('Missing and unavailable cells stay distinct from an observed zero', () => {
  const rows = [{date: day(0), model: 'alpha', count: 0}, {date: day(0), model: 'beta', count: null}, {date: day(1), model: 'alpha', count: 7}];
  const model = buildSeriesChartModel({key: 'dateModel', field: 'model', rows});
  assert.equal(model.cells[0][0].kind, 'observed');
  assert.equal(model.cells[0][0].count, 0);
  assert.equal(model.cells[0][0].rowIndex, 0);
  assert.equal(model.cells[0][0].row, rows[0]);
  assert.equal(model.cells[1][0].kind, 'unavailable');
  assert.equal(model.cells[1][0].count, null);
  assert.equal(model.cells[1][0].rowIndex, 1);
  assert.equal(model.cells[1][0].row, rows[1]);
  assert.equal(model.cells[1][1].kind, 'none');
  assert.equal(model.cells[1][1].count, 0);
  assert.equal(model.cells[1][1].rowIndex, null);
  assert.equal(model.cells[1][1].row, null);
  const actionablePoints = nodes(parseFragment(render({key: 'dateModel', field: 'model', rows})))
    .filter(node => node.tagName === 'circle' && Object.hasOwn(attributes(node), 'data-row-index'));
  assert.deepEqual(actionablePoints.map(node => attributes(node)['data-row-index']).sort(), ['0', '2'], 'Only actual observed rows provide chart evidence anchors');
});

test('Derived zeroes remain line vertices without points, while unavailable counts break the line', () => {
  const observed = [{date: day(0), model: 'alpha', count: 2}, {date: day(1), model: 'beta', count: 3}, {date: day(2), model: 'alpha', count: 4}];
  const pathCommands = rows => {
    const model = buildSeriesChartModel({key: 'dateModel', field: 'model', rows});
    const chartNodes = nodes(parseFragment(render({key: 'dateModel', field: 'model', rows})));
    const path = chartNodes.find(node => node.tagName === 'path' && attributes(node).stroke === model.colors[0]);
    assert.ok(path, 'The first series has a rendered path');
    assert.equal(chartNodes.filter(node => node.tagName === 'circle' && attributes(node)['data-series-index'] === '0' && attributes(node)['data-date-index'] === '1').length, 0, 'A non-observed date has no circle or evidence identity');
    return attributes(path).d.match(/[ML]|-?\d+(?:\.\d+)?/g).map(token => /^[ML]$/.test(token) ? token : Number(token));
  };
  assert.deepEqual(pathCommands(observed), ['M', 38, 98, 'L', 330, 168, 'L', 622, 28], 'An absent grouped row contributes a derived zero baseline vertex');
  const unavailable = [observed[0], {date: day(1), model: 'alpha', count: null}, observed[1], observed[2]];
  assert.deepEqual(pathCommands(unavailable), ['M', 38, 98, 'M', 622, 28], 'An unavailable count creates a gap instead of a zero baseline');
});

test('Non-finite counts never become observed zeroes or evidence points', () => {
  const rows = [{date: day(0), model: 'alpha', count: NaN}, {date: day(1), model: 'alpha', count: Infinity}, {date: day(2), model: 'alpha', count: undefined}];
  const model = buildSeriesChartModel({key: 'dateModel', field: 'model', rows});
  for (const cell of model.cells[0]) {
    assert.equal(cell.kind, 'unavailable');
    assert.equal(cell.count, null);
  }
  const html = render({key: 'dateModel', field: 'model', rows});
  assert.equal(nodes(parseFragment(html)).filter(node => node.tagName === 'circle' && Object.hasOwn(attributes(node), 'data-row-index')).length, 0);
  assert.ok(!html.includes('NaN') && !html.includes('Infinity'), 'SVG geometry stays finite when no values are available');
});

test('Hover modes and active dates are independent for each chart', () => {
  const state = createSeriesChartState();
  assert.equal(state.getMode('models'), 'all');
  assert.equal(state.getMode('platforms'), 'all');
  assert.ok(state.getActiveDate('models') == null);
  state.setMode('models', 'point');
  state.setActiveDate('models', day(1));
  state.setActiveDate('platforms', day(3));
  assert.equal(state.getMode('models'), 'point');
  assert.equal(state.getMode('platforms'), 'all');
  assert.equal(state.getActiveDate('models'), day(1));
  assert.equal(state.getActiveDate('platforms'), day(3));
  state.setMode('models', 'all');
  state.clearActiveDate('models');
  assert.equal(state.getMode('models'), 'all');
  assert.ok(state.getActiveDate('models') == null);
  assert.equal(state.getActiveDate('platforms'), day(3));
});

test('Chart titles, series names, keys, and formatting cannot inject HTML or event handlers', () => {
  const payload = '\"><img src=x onerror="globalThis.injection=true"><script>injection()</script>';
  const html = render({key: payload, field: 'model', title: payload, rows: [{date: day(0), model: payload, count: 3}], formatNumber: () => payload});
  const parsedNodes = nodes(parseFragment(html));
  assert.equal(parsedNodes.filter(node => node.tagName === 'script' || node.tagName === 'img').length, 0);
  for (const node of parsedNodes) {
    for (const attribute of node.attrs || []) assert.ok(!attribute.name.startsWith('on'), `${node.tagName} contains ${attribute.name}`);
  }
  assert.ok(html.includes('&lt;img'), 'Untrusted labels remain escaped text');
  assert.ok(!html.includes('<script>'));
});
