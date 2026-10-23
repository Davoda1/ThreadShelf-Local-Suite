import test from 'node:test';
import assert from 'node:assert/strict';
import {buildYearCalendar,calendarRange,calendarYearChoices,calendarIntensity,calendarNavigation} from '../src/ui/calendar.mjs';
const report=(rows=[],dateRange={},filters={})=>({tables:{timelineDaily:rows},dateRange,filters});
test('whole annual calendar fills every day and aligns Monday-first columns',()=>{
  const calendar=buildYearCalendar(report([{date:'2026-07-04',count:5,evidenceIds:['one']}]),2026);
  assert.equal(calendar.dayCount,365);assert.equal(calendar.days[0].date,'2026-01-01');assert.equal(calendar.days.at(-1).date,'2026-12-31');assert.equal(calendar.offset,3);assert.equal(calendar.columnCount,53);
  assert.equal(calendar.days.find(d=>d.date==='2026-01-05').weekday,0);assert.equal(calendar.days.find(d=>d.date==='2026-01-11').weekday,6);
  assert.equal(calendar.days.filter(d=>d.count===0).length,364);assert.equal(new Set(calendar.days.map(d=>d.date)).size,365);
});
test('leap-year February and rare 54-column Monday grids retain every date',()=>{
  const leap=buildYearCalendar(report([{date:'2024-02-29',count:2}]),2024);assert.equal(leap.dayCount,366);assert(leap.days.some(d=>d.date==='2024-02-29'));assert.equal(leap.offset,0);assert.equal(leap.columnCount,53);
  const sunday=buildYearCalendar(report([{date:'2012-01-01',count:1}]),2012);assert.equal(sunday.offset,6);assert.equal(sunday.columnCount,54);assert.equal(sunday.days.at(-1).date,'2012-12-31');assert.equal(sunday.days.at(-1).weekday,0);
});
test('custom filter range marks outside days separately and provides every year including empty years',()=>{
  const input=report([{date:'2025-12-31',count:4},{date:'2026-01-02',count:7}],{startDay:'2025-12-30',endDay:'2027-01-02'},{range:'custom'});
  assert.deepEqual(calendarYearChoices(input),[2027,2026,2025]);
  const calendar=buildYearCalendar(input,2025);assert.equal(calendar.days[0].inRange,false);assert.equal(calendar.days[0].count,null);assert.equal(calendar.days[0].rowIndex,null);assert.equal(calendar.days.at(-2).inRange,true);assert.equal(calendar.days.at(-2).count,0);assert.equal(calendar.days.at(-1).count,4);
  assert.equal(calendarRange(input).end,'2027-01-01');
});
test('daily evidence associates exact applied table row identities without source mutation or zero-day fallbacks',()=>{
  const row={date:'2026-10-01',count:9,evidenceIds:['alpha','beta']};const input=report([row]);const before=JSON.stringify(input);const calendar=buildYearCalendar(input,2026),active=calendar.days.find(d=>d.date===row.date),zero=calendar.days.find(d=>d.date==='2026-09-30');
  assert.strictEqual(active.row,row);assert.equal(active.rowIndex,0);assert.equal(active.hasEvidence,true);assert.equal(zero.count,0);assert.equal(zero.hasEvidence,false);assert.equal(zero.rowIndex,null);assert.equal(JSON.stringify(input),before);
});
test('calendar choices respect explicit empty-year selections and range boundaries',()=>{
  assert.deepEqual(calendarYearChoices(report([],{startDay:'2024-01-01',endDay:'2025-01-01'},{range:'year',year:2024})),[2024]);
  assert.deepEqual(calendarYearChoices(report([],{startDay:'2025-12-29',endDay:'2026-01-04'},{range:'7d'})),[2026,2025]);
  const newYear=Date.parse('2026-01-01T00:00:00Z');
  assert.deepEqual(calendarYearChoices(report([],{},{timeZone:'UTC'}),newYear),[2026]);
  assert.deepEqual(calendarYearChoices(report([],{},{timeZone:'America/New_York'}),newYear),[2025]);
  assert.deepEqual(calendarYearChoices(report([],{zone:'Asia/Tokyo'},{timeZone:'America/New_York'}),newYear),[2026]);
  const numeric=calendarRange(report([],{start:Date.parse('2026-03-29T00:00:00Z'),end:Date.parse('2026-03-30T00:00:00Z'),zone:'Europe/Budapest'}));assert.deepEqual(numeric,{start:'2026-03-29',end:'2026-03-30',invalid:false});
});
test('five intensity levels follow Reader square-root scaling rather than linear shading',()=>{
  assert.deepEqual([0,1,25,56,100].map(n=>calendarIntensity(n,100)),[0,1,2,3,4]);assert.equal(calendarIntensity(9,0),4);
});
test('keyboard navigation moves days/weeks with one eligible range and year-boundary clamping',()=>{
  const calendar=buildYearCalendar(report([],{startDay:'2026-01-10',endDay:'2026-01-21'}),2026);
  assert.equal(calendarNavigation(calendar.days,'2026-01-12','ArrowRight'),'2026-01-19');assert.equal(calendarNavigation(calendar.days,'2026-01-12','ArrowUp'),'2026-01-11');assert.equal(calendarNavigation(calendar.days,'2026-01-10','ArrowLeft'),'2026-01-10');assert.equal(calendarNavigation(calendar.days,'2026-01-20','ArrowDown'),'2026-01-20');assert.equal(calendarNavigation(calendar.days,'2026-01-14','Home'),'2026-01-10');assert.equal(calendarNavigation(calendar.days,'2026-01-14','End'),'2026-01-20');assert.equal(calendarNavigation(calendar.days,'2026-01-14','Enter'),null);
});
test('locale month and weekday labels follow each interface language',()=>{
  const january=new Date('2026-01-01T00:00:00Z');for(const locale of ['en-GB','hu-HU','de-DE','fr-FR','ja-JP']){const calendar=buildYearCalendar(report([{date:'2026-01-01',count:1}]),2026,{locale});assert.equal(calendar.months[0].label,new Intl.DateTimeFormat(locale,{month:'short',timeZone:'UTC'}).format(january));assert.equal(calendar.weekdays[0],new Intl.DateTimeFormat(locale,{weekday:'short',timeZone:'UTC'}).format(new Date('2023-01-02T00:00:00Z')));}
});
