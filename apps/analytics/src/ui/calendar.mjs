/** Pure annual calendar projection. Does not change shared filters, tables or evidence identities. */
const DAY=86400000;
const finite=value=>typeof value==='number'&&Number.isFinite(value);
function validDay(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const date=new Date(value+'T00:00:00Z');return finite(+date)&&date.toISOString().slice(0,10)===value;}
function dayForInstant(value,zone){if(!finite(value))return null;try{const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:!zone||zone==='local'?Intl.DateTimeFormat().resolvedOptions().timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(value).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));return `${parts.year.padStart(4,'0')}-${parts.month}-${parts.day}`;}catch{return null;}}
function previousDay(day){return validDay(day)?new Date(Date.parse(day+'T00:00:00Z')-DAY).toISOString().slice(0,10):null;}
export function calendarRange(report={}){
  const range=report.dateRange||{},filters=report.filters||{};
  const start=validDay(range.startDay)?range.startDay:dayForInstant(range.start,range.zone||filters.timeZone);
  const end=validDay(range.endDay)?previousDay(range.endDay):dayForInstant(finite(range.end)?range.end-1:null,range.zone||filters.timeZone);
  return {start,end,invalid:range.invalid===true};
}
export function calendarYearChoices(report={},now=Date.now()){
  const years=new Set(),{start,end}=calendarRange(report);
  const add=value=>{const year=Number(String(value||'').slice(0,4));if(Number.isInteger(year)&&year>=1&&year<=9999)years.add(year);};
  for(const row of report.tables?.timelineDaily||[])if(validDay(row.date||row.label))add(row.date||row.label);
  const filters=report.filters||{};
  if((filters.range==='year'||filters.range==='calendar-year')&&Number.isInteger(Number(filters.year)))add(String(filters.year).padStart(4,'0')+'-01-01');
  if(start)add(start);if(end)add(end);
  if(start&&end&&start<=end){const first=Number(start.slice(0,4)),last=Number(end.slice(0,4));for(let year=first;year<=last;year++)years.add(year);}
  if(!years.size)add(dayForInstant(now,report.dateRange?.zone||filters.timeZone)||new Date(now).toISOString().slice(0,10));
  return [...years].sort((a,b)=>b-a);
}
export function calendarIntensity(count,maximum){return count>0?Math.max(1,Math.min(4,Math.ceil(Math.sqrt(count/Math.max(maximum,1))*4))):0;}
export function buildYearCalendar(report={},requestedYear,options={}){
  const years=calendarYearChoices(report,options.now),candidate=Number(requestedYear),year=years.includes(candidate)?candidate:years[0],yearText=String(year).padStart(4,'0');
  const start=new Date(yearText+'-01-01T00:00:00Z'),end=new Date(start);end.setUTCFullYear(year+1);
  const dayCount=Math.round((end-start)/DAY),offset=(start.getUTCDay()+6)%7,columnCount=Math.ceil((offset+dayCount)/7),range=calendarRange(report),rows=report.tables?.timelineDaily||[],byDay=new Map();
  let maximum=0;rows.forEach((row,rowIndex)=>{const date=row.date||row.label;if(!validDay(date))return;const count=finite(row.count)&&row.count>=0?row.count:0;maximum=Math.max(maximum,count);if(!byDay.has(date))byDay.set(date,{row,rowIndex,count});});
  const days=[];
  for(let index=0;index<dayCount;index++){
    const date=new Date(+start+index*DAY).toISOString().slice(0,10),entry=byDay.get(date),inRange=!range.invalid&&(!range.start||date>=range.start)&&(!range.end||date<=range.end),count=inRange?(entry?.count||0):null;
    days.push({date,index,row:inRange?entry?.row||null:null,rowIndex:inRange?entry?.rowIndex??null:null,column:Math.floor((offset+index)/7),weekday:(offset+index)%7,inRange,count,level:inRange?calendarIntensity(count,maximum):null,hasEvidence:inRange&&count>0&&entry!=null});
  }
  const locale=options.locale||'en-GB';
  const monthFormatter=new Intl.DateTimeFormat(locale,{month:'short',timeZone:'UTC'}),weekdayFormatter=new Intl.DateTimeFormat(locale,{weekday:'short',timeZone:'UTC'});
  const months=Array.from({length:12},(_,month)=>{const date=new Date(start);date.setUTCMonth(month,1);return {label:monthFormatter.format(date),month,column:Math.floor((offset+Math.round((date-start)/DAY))/7)};});
  const weekdays=Array.from({length:7},(_,i)=>weekdayFormatter.format(new Date(Date.UTC(2023,0,2+i))));
  return {year,yearText,years,dayCount,offset,columnCount,trailingGaps:columnCount*7-offset-dayCount,maximum,range,days,months,weekdays};
}
/** Arrow keys mirror Reader: vertical calendar days, horizontal full weeks. */
export function calendarNavigation(days,currentDate,key){
  const eligible=days.filter(day=>day.inRange),current=eligible.findIndex(day=>day.date===currentDate);
  if(!eligible.length)return null;
  if(key==='Home')return eligible[0].date;if(key==='End')return eligible.at(-1).date;
  const moves={ArrowLeft:-7,ArrowRight:7,ArrowUp:-1,ArrowDown:1};if(!(key in moves))return null;
  const actual=days.findIndex(day=>day.date===currentDate);if(actual<0)return eligible[0].date;
  const step=moves[key],target=Math.max(0,Math.min(days.length-1,actual+step));
  if(days[target].inRange)return days[target].date;
  const forward=step>0;return (forward?eligible.find(day=>day.index>=target):[...eligible].reverse().find(day=>day.index<=target))?.date||(forward?eligible.at(-1):eligible[0]).date;
}
