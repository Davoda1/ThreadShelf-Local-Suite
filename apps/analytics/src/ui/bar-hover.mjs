// Offline stacked bars. Counts come from the existing exact aggregate rows;
// interaction only reveals those values and retains the original evidence row.
const GROUPS=Object.freeze([
  {key:'user',color:'var(--user)'},
  {key:'thinking',color:'var(--thinking)'},
  {key:'response',color:'var(--response)'},
  {key:'other',color:'var(--accent)'},
]);
const OTHER_CATEGORIES=Object.freeze(['recap','commentary','tool_call','tool_output','redacted','system','other']);
const FALLBACKS={noData:'No data',timeline:'Activity timeline',segments:'Content segments',count:'Count',unavailable:'Unavailable',user:'User prompts',thinking:'Thinking',response:'Final responses',other:'Other records',recap:'Reasoning recaps',commentary:'Intermediate commentary','tool-call':'Recorded tool calls','tool-output':'Recorded tool outputs','redacted-thinking':'Redacted thinking',system:'System'};
const escaped=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isCount=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
const translated=(input,key)=>{const value=input.t?.(key);return String(value!=null&&value!==key?value:FALLBACKS[key]||key);};
const categoryLabel=(input,key)=>String(input.categoryLabel?.(key)??translated(input,({tool_call:'tool-call',tool_output:'tool-output',redacted:'redacted-thinking'})[key]||key));
const countLabel=(input,value)=>isCount(value)?String(input.formatNumber?.(value)??value):translated(input,'unavailable');
const safeID=value=>{let hash=2166136261;for(const c of String(value)){hash^=c.codePointAt(0);hash=Math.imul(hash,16777619);}return `stacked-${(hash>>>0).toString(36)}`;};

/** The four visual groups retain their established colors. Other is an exact
 * remainder, with separately indented observed source categories below it.
 * Null/non-finite counts remain unavailable; they do not become false zeros. */
export function buildStackedBarModel(input={}) {
  const rows=Array.isArray(input.rows)?input.rows:[],limit=Number.isInteger(input.maxRows)&&input.maxRows>0?Math.min(input.maxRows,45):45;
  const start=input.placement==='first'?0:Math.max(0,rows.length-limit),bars=rows.slice(start,start+limit).map((row,index)=>{
    const primary=GROUPS.slice(0,3).map(group=>({...group,count:isCount(row[group.key])?row[group.key]:null}));
    const known=primary.every(group=>group.count!==null),primaryCount=known?primary.reduce((sum,group)=>sum+group.count,0):null;
    const total=isCount(row.count)?row.count:null;
    const other=total!==null&&known&&primaryCount<=total?total-primaryCount:null;
    const measure=input.measure||'count',value=row[measure]??row.value;
    return {row,rowIndex:start+index,date:String(input.itemLabel?.(row)??row.date??row.label??''),total,value:isCount(value)?value:null,fillColor:input.key==='composition'?(GROUPS.find(group=>group.key===row.label)?.color||GROUPS[3].color):GROUPS[3].color,hasCategoryCounts:GROUPS.slice(0,3).every(group=>Object.hasOwn(row,group.key)),
      groups:[...primary,{...GROUPS[3],count:other}],
      otherBreakdown:OTHER_CATEGORIES.filter(key=>Object.hasOwn(row,key)).map(key=>({key,color:GROUPS[3].color,count:isCount(row[key])?row[key]:null})),
    };
  });
  return {id:String(input.id??input.key??'timelineDaily'),key:String(input.key||'timelineDaily'),bars,max:Math.max(1,...bars.map(bar=>bar.value??0)),presentation:input.presentation||'stacked',input};
}

export function createStackedBarState() {
  const models=new Map();return {getModel:id=>models.get(String(id)),setModel:model=>models.set(model.id,model)};
}
const defaultState=createStackedBarState();

function description(model,bar) {
  const {input}=model;
  const unit=input.measureLabel||translated(input,bar.hasCategoryCounts?'segments':'count');
  const heading=`${bar.date} · ${countLabel(input,bar.value)} ${unit}`;
  if(!bar.hasCategoryCounts)return heading;
  const groups=bar.groups.map(group=>`${categoryLabel(input,group.key)}: ${countLabel(input,group.count)}`);
  const details=bar.otherBreakdown.map(group=>`${categoryLabel(input,group.key)}: ${countLabel(input,group.count)}`);
  return `${heading}${input.measure&&input.measure!=='count'?' · '+countLabel(input,bar.total)+' '+translated(input,'segments'):''} · ${groups.join('; ')}${details.length?' ('+details.join('; ')+')':''}`;
}

/** Escaping also covers localized labels and source periods. No private text,
 * raw record lists, external URLs, or dynamically chosen colors are embedded. */
export function stackedTooltipMarkup(model,index) {
  const bar=model.bars[index];if(!bar)return '';
  const {input}=model;
  const row=(group,detail=false)=>`<div class="stacked-tooltip-row${detail?' stacked-tooltip-detail':''}" data-category="${group.key}"${detail?' data-other-detail="true"':''}><i class="stacked-tooltip-marker" style="background:${group.color}" aria-hidden="true"></i><span class="stacked-tooltip-name">${escaped(categoryLabel(input,group.key))}</span><strong class="stacked-tooltip-count">${escaped(countLabel(input,group.count))}</strong></div>`;
  const unit=input.measureLabel||translated(input,bar.hasCategoryCounts?'segments':'count');
  const heading=`<div class="stacked-tooltip-heading"><strong>${escaped(bar.date)}</strong>${bar.hasCategoryCounts?`<span>${escaped(translated(input,'count'))}: <b data-stacked-total>${escaped(countLabel(input,bar.value))}</b> ${escaped(unit)}</span>`:''}</div>`;
  if(!bar.hasCategoryCounts)return heading+`<div class="stacked-tooltip-row" data-category="measure"><i class="stacked-tooltip-marker" style="background:${bar.fillColor}" aria-hidden="true"></i><span class="stacked-tooltip-name">${escaped(unit)}</span><strong class="stacked-tooltip-count" data-stacked-total>${escaped(countLabel(input,bar.value))}</strong></div>`;
  const countHeading=input.measure&&input.measure!=='count'?`<div class="stacked-tooltip-unit">${escaped(translated(input,'segments'))}: <strong data-stacked-segment-total>${escaped(countLabel(input,bar.total))}</strong></div>`:'';
  return heading+countHeading+bar.groups.map(group=>row(group)).join('')+(bar.otherBreakdown.length?`<div class="stacked-tooltip-breakdown" role="group" aria-label="${escaped(categoryLabel(input,'other'))}">${bar.otherBreakdown.map(group=>row(group,true)).join('')}</div>`:'');
}

/** Horizontal bars share the same exact category detail without changing the
 * existing ranked window, measurement scale, or native evidence action. */
export function renderHoverBars(input={},state=defaultState) {
  const model=buildStackedBarModel({...input,presentation:'horizontal',placement:'first'});state.setModel(model);
  if(!model.bars.length)return `<div class="chart-empty">${escaped(translated(input,'noData'))}</div>`;
  const tooltipID=safeID(model.id)+'-tooltip';
  return `<div class="stacked-bar-view" data-stacked-chart="${escaped(model.id)}"><div class="stacked-bar-plot stacked-bar-horizontal">${model.bars.map((bar,index)=>`<button type="button" class="bar-row" data-stacked-index="${index}" data-action="table-evidence" data-table="${escaped(model.key)}" data-row-index="${bar.rowIndex}" aria-label="${escaped(description(model,bar))}" aria-describedby="${tooltipID}"><span class="name">${escaped(bar.date)}</span><span class="bar-track" aria-hidden="true"><span class="bar-fill" style="display:block;width:${bar.value===null?0:bar.value/model.max*100}%;background:${bar.fillColor}"></span></span><span class="number">${escaped(countLabel(input,bar.value))}</span></button>`).join('')}<div class="stacked-bar-tooltip stacked-horizontal-tooltip" id="${tooltipID}" role="tooltip" data-stacked-tooltip hidden></div></div></div>`;
}

export function renderStackedBarChart(input={},state=defaultState) {
  const model=buildStackedBarModel(input);state.setModel(model);
  if(!model.bars.length)return `<div class="chart-empty">${escaped(translated(input,'noData'))}</div>`;
  const tooltipID=safeID(model.id)+'-tooltip';
  return `<div class="stacked-bar-view" data-stacked-chart="${escaped(model.id)}"><div class="legend stacked-bar-legend">${GROUPS.map(group=>`<span class="${group.key}"><i class="stacked-legend-marker" style="background:${group.color}" aria-hidden="true"></i>${escaped(categoryLabel(input,group.key))}</span>`).join('')}</div><div class="stacked-bar-plot"><div class="bar-chart" role="group" aria-label="${escaped(input.title||translated(input,'timeline'))}">${model.bars.map((bar,index)=>`<button type="button" class="chart-column" data-stacked-index="${index}" data-action="table-evidence" data-table="${escaped(model.key)}" data-row-index="${bar.rowIndex}" aria-label="${escaped(description(model,bar))}" aria-describedby="${tooltipID}"><span class="chart-stack" style="height:${bar.total===null?0:bar.total/model.max*124}px" aria-hidden="true">${bar.groups.map(group=>`<i class="chart-segment ${group.key}" style="height:${bar.total&&group.count!==null?group.count/bar.total*100:0}%;background:${group.color}"></i>`).join('')}</span><span class="axis-label" aria-hidden="true">${escaped(input.axisLabel?.(bar.date)??bar.date.slice(5))}</span></button>`).join('')}</div><div class="stacked-bar-tooltip" id="${tooltipID}" role="tooltip" data-stacked-tooltip hidden></div></div></div>`;
}

/** Clamp both axes to the measured plot. CSS separately caps tooltip size;
 * this is also finite for narrow plots and long translated category names. */
export function boundedStackedTooltipPosition({plotWidth,plotHeight,tooltipWidth,tooltipHeight,anchorX,anchorY=8,padding=8}={}) {
  const numbers=[plotWidth,plotHeight,tooltipWidth,tooltipHeight,anchorX,anchorY,padding];
  if(!numbers.every(Number.isFinite)||numbers.slice(0,4).some(value=>value<0)||padding<0)return null;
  const clamp=(value,size,extent)=>Math.max(Math.min(padding,extent),Math.min(value,Math.max(padding,extent-size-padding)));
  return {left:clamp(anchorX+12,tooltipWidth,plotWidth),top:clamp(anchorY,tooltipHeight,plotHeight)};
}

/** A short horizontal list may be smaller than its detail. Keep the detail
 * within the viewport vertically and the list horizontally without adding
 * artificial blank chart height or clipping it to a single bar's height. */
export function boundedHorizontalTooltipPosition({plot,tooltip,anchor,viewportWidth,viewportHeight,padding=8,bounds={left:0,top:0,right:viewportWidth,bottom:viewportHeight}}={}) {
  if(!plot||!tooltip||!anchor||![plot.left,plot.top,plot.width,tooltip.width,tooltip.height,anchor.left,anchor.top,anchor.width,viewportWidth,viewportHeight,padding].every(Number.isFinite))return null;
  if(![bounds.left,bounds.top,bounds.right,bounds.bottom].every(Number.isFinite))return null;
  const minimumX=Math.max(padding,bounds.left+padding,plot.left+padding),maximumX=Math.min(viewportWidth-tooltip.width-padding,bounds.right-tooltip.width-padding,plot.left+plot.width-tooltip.width-padding);
  const after=anchor.left+anchor.width/2+12,preferred=after>maximumX?anchor.left-tooltip.width-12:after;
  const x=Math.max(minimumX,Math.min(preferred,maximumX));
  const y=Math.max(bounds.top+padding,Math.min(anchor.top,bounds.bottom-tooltip.height-padding));
  return {left:x-plot.left,top:y-plot.top};
}

function clippingBounds(view) {
  const win=view.ownerDocument.defaultView,bounds={left:0,top:0,right:win.innerWidth,bottom:win.innerHeight};
  // The content scroll pane clips descendants, even when the overall viewport
  // has more room. Also respect future hosts that clip their own cards.
  for(let ancestor=view.parentElement;ancestor;ancestor=ancestor.parentElement){
    const style=win.getComputedStyle(ancestor),clipX=/^(auto|scroll|hidden|clip)$/.test(style.overflowX),clipY=/^(auto|scroll|hidden|clip)$/.test(style.overflowY);
    if(!clipX&&!clipY)continue;
    const rect=ancestor.getBoundingClientRect();
    if(clipX){bounds.left=Math.max(bounds.left,rect.left);bounds.right=Math.min(bounds.right,rect.right);}
    if(clipY){bounds.top=Math.max(bounds.top,rect.top);bounds.bottom=Math.min(bounds.bottom,rect.bottom);}
  }
  return bounds;
}

function hide(view) {
  const tooltip=view.querySelector('[data-stacked-tooltip]');if(tooltip){tooltip.hidden=true;delete tooltip.dataset.stackedIndex;}
  for(const button of view.querySelectorAll('[data-stacked-index].is-stacked-active'))button.classList.remove('is-stacked-active');
}
function show(view,model,index,reposition=false) {
  if(!model.bars[index])return;
  const tooltip=view.querySelector('[data-stacked-tooltip]'),plot=view.querySelector('.stacked-bar-plot'),button=view.querySelector(`[data-stacked-index="${index}"]`);
  if(!tooltip||!plot||!button)return;
  if(!reposition&&!tooltip.hidden&&tooltip.dataset.stackedIndex===String(index))return;
  if(tooltip.dataset.stackedIndex!==String(index)){tooltip.innerHTML=stackedTooltipMarkup(model,index);tooltip.dataset.stackedIndex=String(index);tooltip.scrollTop=0;}
  // Hover details can cover a dense bar. Clicking those non-button details
  // keeps the same native delegated evidence route and exact original row;
  // the tooltip itself still accepts wheel scrolling for a long breakdown.
  tooltip.dataset.action='table-evidence';tooltip.dataset.table=model.key;tooltip.dataset.rowIndex=String(model.bars[index].rowIndex);
  tooltip.hidden=false;
  for(const element of view.querySelectorAll('[data-stacked-index]'))element.classList.toggle('is-stacked-active',element===button);
  const rect=plot.getBoundingClientRect(),anchor=button.getBoundingClientRect(),win=view.ownerDocument.defaultView,bounds=clippingBounds(view);
  const availableWidth=Math.max(0,Math.min(rect.right,bounds.right)-Math.max(rect.left,bounds.left)-16);
  tooltip.style.maxWidth=`${availableWidth}px`;tooltip.style.minWidth=`${Math.min(220,availableWidth)}px`;
  tooltip.style.maxHeight=`${Math.max(0,Math.min(model.presentation==='horizontal'?320:rect.height-16,bounds.bottom-bounds.top-16))}px`;
  const size=tooltip.getBoundingClientRect();
  let position=boundedHorizontalTooltipPosition({plot:rect,tooltip:size,anchor:model.presentation==='horizontal'?anchor:{...anchor,left:anchor.left,top:Math.max(rect.top+8,bounds.top+8),width:anchor.width},viewportWidth:win.innerWidth,viewportHeight:win.innerHeight,bounds});
  if(model.presentation==='stacked'&&position)position.top=Math.max(bounds.top+8-rect.top,Math.min(position.top,rect.height-size.height-8));
  if(position){tooltip.style.left=`${position.left}px`;tooltip.style.top=`${position.top}px`;}
}

const installed=new WeakMap();
/** One delegated listener set survives report recalculation and navigation.
 * Native bar buttons keep their existing click/Enter/Space evidence action. */
export function attachStackedBarHover(scope=globalThis.document,state=defaultState) {
  if(!scope?.addEventListener)return ()=>{};
  if(installed.has(scope))return installed.get(scope);
  const context=event=>{
    const view=event.target?.closest?.('[data-stacked-chart]');
    if(!view||!(scope===view.ownerDocument||scope.contains?.(view)))return null;
    const model=state.getModel(view.dataset.stackedChart);return model?{view,model}:null;
  };
  const activate=event=>{const ctx=context(event),button=event.target?.closest?.('[data-stacked-index]');if(ctx&&button)show(ctx.view,ctx.model,Number(button.dataset.stackedIndex));};
  const leave=event=>{
    const ctx=context(event);if(!ctx)return;
    if(ctx.view.contains(event.relatedTarget))return;
    // A keyboard-focused bar retains its detail while a pointer leaves it.
    const focused=ctx.view.ownerDocument.activeElement?.closest?.('[data-stacked-index]');
    if(event.type==='pointerout'&&focused&&ctx.view.contains(focused)){show(ctx.view,ctx.model,Number(focused.dataset.stackedIndex));return;}
    hide(ctx.view);
  };
  const keydown=event=>{
    const ctx=context(event);if(!ctx)return;
    if(event.key==='Escape'){event.preventDefault();hide(ctx.view);return;}
    const button=event.target.closest('[data-stacked-index]');if(!button)return;
    if(['ArrowUp','ArrowDown','PageUp','PageDown'].includes(event.key)){
      const tooltip=ctx.view.querySelector('[data-stacked-tooltip]');if(tooltip&&!tooltip.hidden){event.preventDefault();tooltip.scrollTop+=(event.key==='ArrowUp'||event.key==='PageUp'?-1:1)*(event.key.startsWith('Page')?tooltip.clientHeight:24);}return;
    }
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();const current=Number(button.dataset.stackedIndex),last=ctx.model.bars.length-1;
    const index=event.key==='Home'?0:event.key==='End'?last:Math.max(0,Math.min(last,current+(event.key==='ArrowLeft'?-1:1)));
    const next=ctx.view.querySelector(`[data-stacked-index="${index}"]`);next?.focus({preventScroll:true});show(ctx.view,ctx.model,index);
  };
  const listeners={pointerover:activate,pointermove:activate,focusin:activate,pointerout:leave,focusout:leave,keydown};
  for(const [name,listener] of Object.entries(listeners))scope.addEventListener(name,listener);
  const win=(scope.ownerDocument||scope).defaultView;
  const reposition=()=>{
    for(const view of scope.querySelectorAll('[data-stacked-chart]')){
      const tooltip=view.querySelector('[data-stacked-tooltip]');
      // Escape and pointer departure remain dismissed. Native scroll events
      // may arrive after hover/focus has opened a tip while revealing its bar.
      if(!tooltip||tooltip.hidden)continue;
      const model=state.getModel(view.dataset.stackedChart);if(!model){hide(view);continue;}
      const current=view.querySelector(`[data-stacked-index="${tooltip.dataset.stackedIndex}"]`),hovered=view.querySelector('[data-stacked-index]:hover'),focused=view.ownerDocument.activeElement?.closest?.('[data-stacked-index]');
      const button=hovered||(view.matches?.(':hover')?current:null)||(focused&&view.contains(focused)?focused:null);
      if(!button){hide(view);continue;}
      const rect=button.getBoundingClientRect(),bounds=clippingBounds(view);
      if(rect.right<=bounds.left||rect.left>=bounds.right||rect.bottom<=bounds.top||rect.top>=bounds.bottom){hide(view);continue;}
      show(view,model,Number(button.dataset.stackedIndex),true);
    }
  };
  const scroll=event=>{if(!event.target?.closest?.('[data-stacked-tooltip]'))reposition();};
  scope.addEventListener('scroll',scroll,true);
  win?.addEventListener('resize',reposition);
  const cleanup=()=>{for(const [name,listener] of Object.entries(listeners))scope.removeEventListener(name,listener);scope.removeEventListener('scroll',scroll,true);win?.removeEventListener('resize',reposition);installed.delete(scope);};
  installed.set(scope,cleanup);return cleanup;
}
