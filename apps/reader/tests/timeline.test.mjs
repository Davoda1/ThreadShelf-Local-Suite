import test from 'node:test';
import assert from 'node:assert/strict';
import { nearestTimelinePoint, withinTimelineHitArea, TimelineInspector } from '../src/ui/timeline.js';

test('timeline pointer target adds eight CSS pixels without moving bucket boundaries', () => {
  const bounds = { left: 50, right: 250, top: 100, bottom: 220, width: 200, height: 120 };
  for (const [x, y] of [[42,100],[258,220],[50,92],[250,228],[150,150]]) assert.equal(withinTimelineHitArea(x,y,bounds),true);
  for (const [x, y] of [[41,100],[259,220],[50,91],[250,229]]) assert.equal(withinTimelineHitArea(x,y,bounds),false);
  assert.equal(withinTimelineHitArea(50,100,{...bounds,width:0}),false);
  assert.equal(nearestTimelinePoint(42,50,200,5),0);
  assert.equal(nearestTimelinePoint(258,50,200,5),4);
  assert.equal(nearestTimelinePoint(150,50,200,5),2);
  const midpoint = 50 + (12 + 936 * 1.5 / 4) / 960 * 200;
  assert.equal(nearestTimelinePoint(midpoint - .01,50,200,5),1);
  assert.equal(nearestTimelinePoint(midpoint + .01,50,200,5),2);
});

test('padded timeline hit area never steals surrounding links or disclosure controls', () => {
  const plot={getBoundingClientRect:()=>({left:0,right:100,top:0,bottom:50,width:100,height:50})};
  const card={querySelector:()=>plot};
  const inspector=new TimelineInspector({getCharts:()=>[]});
  const target=interactive=>({closest:selector=>selector==='.analytics-timeline-card'?card:selector==='button,a,input,select,summary,details'?interactive?{}:null:null});
  assert.equal(inspector.pointerPlot({target:target(false),clientX:50,clientY:55}),plot);
  assert.equal(inspector.pointerPlot({target:target(false),clientX:50,clientY:60}),null);
  assert.equal(inspector.pointerPlot({target:target(true),clientX:50,clientY:55}),null);
});
