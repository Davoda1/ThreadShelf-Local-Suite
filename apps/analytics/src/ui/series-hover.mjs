// Local, browser-safe line chart rendering and interaction. Importing this file
// does not touch a document, source data, storage, or any network API.
const SERIES_COLORS = Object.freeze(['#916dc9','#ca5f91','#a47b38','#637fc3','#b162ad','#538487','#bd715e','#7c8b45']);
const GEOMETRY = Object.freeze({width:640,height:195,left:38,right:622,top:18,bottom:168,valueHeight:140});
const LABELS = Object.freeze({
  noData:'No data',segments:'Content segments',seriesHoverMode:'Hover details',
  seriesHoverAll:'All series at date',seriesHoverPoint:'Individual point',
  seriesHoverHelp:'Move over the graph or use Left/Right on the graph. Select an observed value to view evidence.',
  seriesNoObservations:'No observed records',seriesUnavailable:'Unavailable',
  seriesObservedCount:'Observed content segments',
});
const escapeHTML = value => String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const finiteCount = value => typeof value==='number'&&Number.isFinite(value)&&value>=0;
const boundedInteger = (value,fallback,maximum) => Number.isFinite(value)&&value>0?Math.min(maximum,Math.floor(value)):fallback;
const translate = (input,key) => {
  const value=input.t?.(key);
  return value!=null&&value!==key?String(value):(LABELS[key]||key);
};
const numberLabel = (input,value) => String(input.formatNumber?.(value)??value);
const seriesX = (model,index) => model.geometry.left+index/Math.max(1,model.days.length-1)*(model.geometry.right-model.geometry.left);
const seriesY = (model,value) => model.geometry.bottom-value/model.max*model.geometry.valueHeight;
const safeID = value => {
  let hash=2166136261;
  for(const character of String(value)){hash^=character.codePointAt(0);hash=Math.imul(hash,16777619);}
  return `series-${(hash>>>0).toString(36)}`;
};

/** Build a bounded view, retaining indices from the original exact metric table.
 * A missing grouped row means zero observed records in this selection; it does
 * not supply a data point or evidence identity. A supplied nonnumeric count is
 * unavailable, never zero. Neither case is drawn as an observed point. */
export function buildSeriesChartModel(input={}) {
  const data=Array.isArray(input.rows)?input.rows:[],field=String(input.field||'model');
  const maxDates=boundedInteger(input.maxDates,45,45),maxSeries=boundedInteger(input.maxSeries,8,8);
  const series=[...new Set(data.map(row=>String(row?.[field]??'')))].slice(0,maxSeries);
  const days=[...new Set(data.map(row=>row?.date).filter(date=>typeof date==='string'&&date.length>0))].sort().slice(-maxDates);
  const lookup=new Map();
  for(let rowIndex=0;rowIndex<data.length;rowIndex++){
    const row=data[rowIndex];if(!row||typeof row.date!=='string'||!row.date)continue;
    let group=lookup.get(row.date);if(!group){group=new Map();lookup.set(row.date,group);}
    const name=String(row[field]??'');
    if(!group.has(name))group.set(name,{row,rowIndex});
  }
  let max=1;
  const cells=series.map(name=>days.map(date=>{
    const record=lookup.get(date)?.get(name);
    if(!record)return {kind:'none',count:0,rowIndex:null,row:null};
    const {row,rowIndex}=record;
    if(!finiteCount(row.count))return {kind:'unavailable',count:null,rowIndex,row};
    max=Math.max(max,row.count);
    return {kind:'observed',count:row.count,rowIndex,row};
  }));
  return {id:String(input.id??input.key??'series'),key:String(input.key||'dateModel'),field,days,series,
    colors:SERIES_COLORS.slice(0,series.length),max,cells,geometry:GEOMETRY,
    input:{t:input.t,formatNumber:input.formatNumber,title:input.title}};
}

/** Map CSS-pixel client coordinates through SVG's default xMidYMid meet layout.
 * This accounts for both SVG scaling and unused letterbox space. Runtime uses
 * getScreenCTM when available to also cover browser zoom and ancestor scaling. */
export function clientPointToViewBox({clientX,clientY,rect,viewBox={x:0,y:0,width:640,height:195}}={}) {
  if(!rect||![clientX,clientY,rect.left,rect.top,rect.width,rect.height,viewBox.width,viewBox.height].every(Number.isFinite)||rect.width<=0||rect.height<=0||viewBox.width<=0||viewBox.height<=0)return null;
  const scale=Math.min(rect.width/viewBox.width,rect.height/viewBox.height);
  const offsetX=(rect.width-viewBox.width*scale)/2,offsetY=(rect.height-viewBox.height*scale)/2;
  return {x:(clientX-rect.left-offsetX)/scale+(viewBox.x||0),y:(clientY-rect.top-offsetY)/scale+(viewBox.y||0)};
}

export function nearestDateIndex(x,dateCount,geometry=GEOMETRY) {
  if(!Number.isFinite(x)||!Number.isInteger(dateCount)||dateCount<=0)return null;
  if(dateCount===1)return 0;
  const width=geometry.right-geometry.left;
  if(!Number.isFinite(width)||width<=0)return null;
  return Math.max(0,Math.min(dateCount-1,Math.round((x-geometry.left)/width*(dateCount-1))));
}

/** Independent graph preferences survive DOM replacement and navigation. */
export function createSeriesChartState() {
  const modes=new Map(),dates=new Map(),models=new Map();
  return {
    getMode:id=>modes.get(String(id))||'all',
    setMode(id,mode){if(mode!=='all'&&mode!=='point')throw new TypeError('Unknown series hover mode');modes.set(String(id),mode);},
    getActiveDate:id=>dates.get(String(id))??null,
    setActiveDate(id,date){dates.set(String(id),String(date));},
    clearActiveDate:id=>dates.delete(String(id)),
    getModel:id=>models.get(String(id)),
    setModel(model){models.set(model.id,model);},
  };
}
const defaultState=createSeriesChartState();

/** Return escaped chart markup; exact table exports stay with the caller.
 * Existing table-evidence and series-evidence actions are deliberately retained.
 * Supply a unique id when a table is displayed in more than one graph. */
export function renderSeriesChart(input={},state=defaultState) {
  const model=buildSeriesChartModel(input);state.setModel(model);
  if(!model.days.length||!model.series.length)return `<div class="chart-empty">${escapeHTML(translate(input,'noData'))}</div>`;
  const {key,field,id,series,days,geometry}=model,mode=state.getMode(id),helpID=safeID(id)+'-help';
  const paths=series.map((name,seriesIndex)=>{
    let drawing=false,path='';
    for(let dateIndex=0;dateIndex<days.length;dateIndex++){
      const cell=model.cells[seriesIndex][dateIndex];
      // Preserve the established line's zero baseline for an absent grouped
      // row. It is a derived zero only: no observed point or evidence anchor.
      // A genuinely unavailable supplied count remains a gap instead of zero.
      if(cell.kind==='unavailable'){drawing=false;continue;}
      path+=`${drawing?'L':'M'}${seriesX(model,dateIndex).toFixed(1)} ${seriesY(model,cell.count).toFixed(1)} `;drawing=true;
    }
    return `<path d="${path.trim()}" fill="none" stroke="${model.colors[seriesIndex]}" stroke-width="2" stroke-dasharray="${seriesIndex%3===0?'none':seriesIndex%3===1?'7 3':'2 3'}" pointer-events="none"/>`+
      model.cells[seriesIndex].map((cell,dateIndex)=>cell.kind!=='observed'?'':`<circle class="series-observed-point" cx="${seriesX(model,dateIndex)}" cy="${seriesY(model,cell.count)}" r="4" fill="${model.colors[seriesIndex]}" stroke="var(--surface)" stroke-width="1.5" tabindex="0" role="button" data-action="table-evidence" data-table="${escapeHTML(key)}" data-row-index="${cell.rowIndex}" data-series-index="${seriesIndex}" data-date-index="${dateIndex}" aria-label="${escapeHTML(name+' · '+days[dateIndex]+' · '+numberLabel(input,cell.count)+' '+translate(input,'segments'))}"></circle>`).join('');
  }).join('');
  return `<div class="series-view" data-series-chart="${escapeHTML(id)}" data-series-mode="${mode}"><div class="series-chart-toolbar" role="group" aria-label="${escapeHTML(translate(input,'seriesHoverMode'))}"><span>${escapeHTML(translate(input,'seriesHoverMode'))}</span><div class="series-mode-buttons">${[['all','seriesHoverAll'],['point','seriesHoverPoint']].map(([value,label])=>`<button type="button" data-series-mode-choice="${value}" aria-pressed="${value===mode}">${escapeHTML(translate(input,label))}</button>`).join('')}</div></div><div class="series-plot"><svg class="series-chart" viewBox="0 0 ${geometry.width} ${geometry.height}" tabindex="0" role="group" aria-label="${escapeHTML(input.title||key)}" aria-describedby="${helpID}"><path d="M38 18V168H624" fill="none" stroke="var(--border)"/><text x="4" y="32" fill="var(--muted)" font-size="10">${escapeHTML(numberLabel(input,model.max))}</text><text x="18" y="168" fill="var(--muted)" font-size="10">0</text><text x="38" y="188" fill="var(--muted)" font-size="10">${escapeHTML(days[0])}</text><text x="622" y="188" text-anchor="end" fill="var(--muted)" font-size="10">${escapeHTML(days.at(-1))}</text><rect class="series-hit-area" x="38" y="18" width="584" height="150" fill="transparent" aria-hidden="true"/>${paths}<line class="series-crosshair" x1="38" x2="38" y1="18" y2="168" stroke="var(--muted)" stroke-width="1" stroke-dasharray="3 3" pointer-events="none" hidden/></svg><div class="series-hover-tooltip" data-series-tooltip hidden></div><div class="series-hover-announcement sr-only" data-series-announcement aria-live="polite" aria-atomic="true"></div></div><div class="series-legend">${series.map((name,index)=>`<button type="button" data-action="series-evidence" data-table="${escapeHTML(key)}" data-field="${escapeHTML(field)}" data-series="${escapeHTML(name)}"><i style="background:${model.colors[index]}"></i><span>${escapeHTML(name)}</span></button>`).join('')}</div><p class="series-hover-help" id="${helpID}">${escapeHTML(translate(input,'seriesHoverHelp'))}</p></div>`;
}

function toSVGPoint(svg,event) {
  const matrix=svg.getScreenCTM?.();
  if(matrix){try{const inverse=matrix.inverse();return {x:inverse.a*event.clientX+inverse.c*event.clientY+inverse.e,y:inverse.b*event.clientX+inverse.d*event.clientY+inverse.f};}catch{}}
  return clientPointToViewBox({clientX:event.clientX,clientY:event.clientY,rect:svg.getBoundingClientRect()});
}
function anchorClientPoint(svg,x,y) {
  const matrix=svg.getScreenCTM?.();
  if(matrix)return {x:matrix.a*x+matrix.c*y+matrix.e,y:matrix.b*x+matrix.d*y+matrix.f};
  const rect=svg.getBoundingClientRect(),scale=Math.min(rect.width/GEOMETRY.width,rect.height/GEOMETRY.height);
  return {x:rect.left+(rect.width-GEOMETRY.width*scale)/2+x*scale,y:rect.top+(rect.height-GEOMETRY.height*scale)/2+y*scale};
}
function clearHover(view,state) {
  state.clearActiveDate(view.dataset.seriesChart);
  view.querySelector('.series-crosshair')?.setAttribute('hidden','');
  const tooltip=view.querySelector('[data-series-tooltip]');if(tooltip){tooltip.hidden=true;tooltip.replaceChildren();delete tooltip.dataset.selection;}
  for(const point of view.querySelectorAll('.series-observed-point.is-date-active'))point.classList.remove('is-date-active');
  const announcement=view.querySelector('[data-series-announcement]');if(announcement)announcement.textContent='';
}
function appendTooltipRow(tooltip,model,seriesIndex,dateIndex) {
  const doc=tooltip.ownerDocument,cell=model.cells[seriesIndex][dateIndex],name=model.series[seriesIndex];
  const row=doc.createElement(cell.rowIndex==null?'div':'button');row.className='series-tooltip-row';
  if(cell.rowIndex!=null){row.type='button';row.dataset.action='table-evidence';row.dataset.table=model.key;row.dataset.rowIndex=String(cell.rowIndex);}
  const marker=doc.createElement('i');marker.className='series-tooltip-marker';marker.style.backgroundColor=model.colors[seriesIndex];marker.setAttribute('aria-hidden','true');
  const label=doc.createElement('span');label.className='series-tooltip-name';label.textContent=name;
  const count=doc.createElement('strong');count.className='series-tooltip-count';count.textContent=cell.kind==='unavailable'?translate(model.input,'seriesUnavailable'):numberLabel(model.input,cell.count);
  row.append(marker,label,count);
  if(cell.kind==='none'){const note=doc.createElement('span');note.className='series-tooltip-note';note.textContent=translate(model.input,'seriesNoObservations');row.append(note);}
  tooltip.append(row);
  return `${name}: ${count.textContent}${cell.kind==='none'?' · '+translate(model.input,'seriesNoObservations'):''}`;
}
function positionTooltip(view,model,dateIndex,seriesIndex=null) {
  const plot=view.querySelector('.series-plot'),svg=view.querySelector('.series-chart'),tooltip=view.querySelector('[data-series-tooltip]');
  const plotRect=plot.getBoundingClientRect(),tooltipRect=tooltip.getBoundingClientRect();
  const cell=seriesIndex==null?null:model.cells[seriesIndex][dateIndex];
  const anchor=anchorClientPoint(svg,seriesX(model,dateIndex),cell?.kind==='observed'?seriesY(model,cell.count):GEOMETRY.top);
  const left=Math.max(8,Math.min(anchor.x-plotRect.left+12,plotRect.width-tooltipRect.width-8));
  const top=seriesIndex==null?8:Math.max(8,Math.min(anchor.y-plotRect.top+10,plotRect.height-tooltipRect.height-8));
  tooltip.style.left=`${left}px`;tooltip.style.top=`${top}px`;
}
function showHover(view,model,state,dateIndex,seriesIndex=null,announce=false) {
  if(dateIndex==null||!model.days[dateIndex])return;
  const tooltip=view.querySelector('[data-series-tooltip]'),line=view.querySelector('.series-crosshair'),all=state.getMode(model.id)==='all';
  if(!all&&(seriesIndex==null||model.cells[seriesIndex]?.[dateIndex]?.kind!=='observed')){clearHover(view,state);return;}
  state.setActiveDate(model.id,model.days[dateIndex]);
  const selection=`${all?'all':seriesIndex}:${dateIndex}`;
  // The date snaps, so repeated movement within the same date needs no layout
  // reads or hundreds of point-class mutations. The anchor is date-based too.
  if(!tooltip.hidden&&tooltip.dataset.selection===selection){
    if(announce){const announcement=view.querySelector('[data-series-announcement]');if(announcement)announcement.textContent=tooltip.dataset.announcement;}
    return;
  }
  if(tooltip.dataset.selection!==selection){
    tooltip.replaceChildren();tooltip.dataset.selection=selection;
    const heading=tooltip.ownerDocument.createElement('div');heading.className='series-tooltip-heading';heading.textContent=model.days[dateIndex];
    const unit=tooltip.ownerDocument.createElement('span');unit.textContent=translate(model.input,'seriesObservedCount');heading.append(unit);tooltip.append(heading);
    const indices=all?model.series.map((_,index)=>index):[seriesIndex];
    const descriptions=indices.map(index=>appendTooltipRow(tooltip,model,index,dateIndex));
    tooltip.dataset.announcement=model.days[dateIndex]+' · '+descriptions.join('; ');
  }
  tooltip.hidden=false;
  if(all){line.removeAttribute('hidden');line.setAttribute('x1',String(seriesX(model,dateIndex)));line.setAttribute('x2',String(seriesX(model,dateIndex)));}else line.setAttribute('hidden','');
  for(const point of view.querySelectorAll('.series-observed-point'))point.classList.toggle('is-date-active',all&&Number(point.dataset.dateIndex)===dateIndex);
  positionTooltip(view,model,dateIndex,all?null:seriesIndex);
  if(announce){const announcement=view.querySelector('[data-series-announcement]');if(announcement)announcement.textContent=tooltip.dataset.announcement;}
}

const installed=new WeakMap();
/** Install delegated interaction once. Listeners survive all caller rerenders.
 * Returns cleanup for component hosts; no actions send evidence independently. */
export function attachSeriesHover(scope=globalThis.document,state=defaultState) {
  if(!scope?.addEventListener)return ()=>{};
  if(installed.has(scope))return installed.get(scope);
  const context=event=>{
    const view=event.target?.closest?.('[data-series-chart]');
    if(!view||!(scope===view.ownerDocument||scope.contains?.(view)))return null;
    const model=state.getModel(view.dataset.seriesChart);return model?{view,model}:null;
  };
  const pointermove=event=>{
    const ctx=context(event);if(!ctx||event.target.closest('[data-series-tooltip]'))return;
    const {view,model}=ctx,svg=event.target.closest('.series-chart');if(!svg)return;
    const point=event.target.closest('.series-observed-point');
    if(state.getMode(model.id)==='point'){
      if(point)showHover(view,model,state,Number(point.dataset.dateIndex),Number(point.dataset.seriesIndex));else clearHover(view,state);
      return;
    }
    const position=toSVGPoint(svg,event);
    if(!position||position.x<GEOMETRY.left||position.x>GEOMETRY.right||position.y<GEOMETRY.top||position.y>GEOMETRY.bottom){clearHover(view,state);return;}
    showHover(view,model,state,nearestDateIndex(position.x,model.days.length));
  };
  const pointerout=event=>{const ctx=context(event);if(ctx&&!ctx.view.contains(event.relatedTarget))clearHover(ctx.view,state);};
  const click=event=>{
    const choice=event.target?.closest?.('[data-series-mode-choice]');if(!choice)return;
    const ctx=context(event);if(!ctx)return;event.preventDefault();
    state.setMode(ctx.model.id,choice.dataset.seriesModeChoice);ctx.view.dataset.seriesMode=choice.dataset.seriesModeChoice;
    for(const button of ctx.view.querySelectorAll('[data-series-mode-choice]'))button.setAttribute('aria-pressed',String(button===choice));
    clearHover(ctx.view,state);
  };
  const focusin=event=>{
    const ctx=context(event);if(!ctx)return;
    const point=event.target.closest('.series-observed-point');
    if(point)showHover(ctx.view,ctx.model,state,Number(point.dataset.dateIndex),Number(point.dataset.seriesIndex),true);
    else if(event.target.matches('.series-chart')&&state.getMode(ctx.model.id)==='all')showHover(ctx.view,ctx.model,state,Math.max(0,ctx.model.days.indexOf(state.getActiveDate(ctx.model.id))),null,true);
  };
  const focusout=event=>{const ctx=context(event);if(ctx&&!ctx.view.contains(event.relatedTarget))clearHover(ctx.view,state);};
  const keydown=event=>{
    const ctx=context(event);if(!ctx)return;
    const {view,model}=ctx;
    if(event.key==='Escape'){event.preventDefault();clearHover(view,state);return;}
    if(!event.target.matches('.series-chart,.series-observed-point'))return;
    if(event.key==='Enter'&&event.target.matches('.series-chart')){const button=view.querySelector('[data-series-tooltip] button');if(button){event.preventDefault();button.focus({preventScroll:true});}return;}
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();
    const point=event.target.closest('.series-observed-point'),current=point?Number(point.dataset.dateIndex):Math.max(0,model.days.indexOf(state.getActiveDate(model.id)));
    const direction=event.key==='ArrowLeft'?-1:1;
    let dateIndex=event.key==='Home'?0:event.key==='End'?model.days.length-1:Math.max(0,Math.min(model.days.length-1,current+direction));
    if(state.getMode(model.id)==='point'){
      const seriesIndex=point?Number(point.dataset.seriesIndex):0;
      const observed=model.cells[seriesIndex].map((cell,index)=>({cell,index})).filter(item=>item.cell.kind==='observed');
      const eligible=event.key==='Home'?observed[0]:event.key==='End'?observed.at(-1):direction<0?observed.filter(item=>item.index<current).at(-1):observed.find(item=>item.index>current);
      if(!eligible)return;dateIndex=eligible.index;
      const target=[...view.querySelectorAll('.series-observed-point')].find(element=>Number(element.dataset.seriesIndex)===seriesIndex&&Number(element.dataset.dateIndex)===dateIndex);
      target?.focus({preventScroll:true});showHover(view,model,state,dateIndex,seriesIndex,true);
    }else{
      view.querySelector('.series-chart').focus({preventScroll:true});showHover(view,model,state,dateIndex,null,true);
    }
  };
  const listeners={pointermove,pointerout,click,focusin,focusout,keydown};
  for(const [name,listener] of Object.entries(listeners))scope.addEventListener(name,listener);
  const viewWindow=(scope.ownerDocument||scope).defaultView;
  const resize=()=>{for(const view of scope.querySelectorAll('[data-series-chart]'))clearHover(view,state);};
  viewWindow?.addEventListener('resize',resize);
  const cleanup=()=>{for(const [name,listener] of Object.entries(listeners))scope.removeEventListener(name,listener);viewWindow?.removeEventListener('resize',resize);installed.delete(scope);};
  installed.set(scope,cleanup);return cleanup;
}
