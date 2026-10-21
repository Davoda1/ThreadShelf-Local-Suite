const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Pick a real bucket, including zeros; never interpolate counts between buckets. */
export function nearestTimelinePoint(clientX, left, width, count) {
 if (count < 2 || width <= 0) return 0;
 const x = (clientX - left) / width * 960;
 return clamp(Math.round((x - 12) / 936 * (count - 1)), 0, count - 1);
}

/** Pointer tolerance in CSS pixels, independent of zoom and the SVG viewBox.
 * Adjacent buckets still use their exact midpoint as the selection boundary. */
export function withinTimelineHitArea(clientX, clientY, bounds, padding = 8) {
 return bounds.width > 0 && bounds.height > 0 && clientX >= bounds.left - padding && clientX <= bounds.right + padding && clientY >= bounds.top - padding && clientY <= bounds.bottom + padding;
}

/** One keyboard target per chart, with a viewport-bounded tooltip and true data marker. */
export class TimelineInspector {
 constructor({getCharts,formatPeriod,formatNumber}) { Object.assign(this,{getCharts,formatPeriod,formatNumber}); }
 attach(host) {
  this.dispose();this.host=host;this.controller=new AbortController();
  const listen=(target,type,fn,options={})=>target.addEventListener(type,fn,{...options,signal:this.controller.signal});
  listen(host,'pointermove',event=>{const plot=this.pointerPlot(event);if(plot)this.inspectPointer(plot,event);else this.hide();});
  listen(host,'pointerdown',event=>{const plot=this.pointerPlot(event);if(plot)this.inspectPointer(plot,event);else this.hide();});
  // Leaving the SVG no longer dismisses a point immediately: its nearby
  // padding is a valid hover target too. Leaving the workspace always does.
  listen(host,'pointerleave',event=>{if(event.pointerType!=='touch')this.hide();});
  listen(host,'focusin',event=>{const plot=this.plot(event.target);if(plot)this.show(plot,Number(plot.dataset.activePoint)||0,true);});
  listen(host,'focusout',event=>{if(this.plot(event.target))this.hide();});
  listen(host,'keydown',event=>this.keydown(event));
  listen(host.ownerDocument,'pointerdown',event=>{if(!host.contains(event.target))this.hide();});
  // Capture also catches scrolls in a disclosure/table and dismisses a stale overlay.
  listen(host,'scroll',()=>this.hide(),{capture:true,passive:true});
  listen(host.ownerDocument.defaultView,'resize',()=>this.hide(),{passive:true});
  listen(host.ownerDocument.defaultView,'blur',()=>this.hide());
 }
 dispose(){this.hide();this.controller?.abort();this.controller=null;this.host=null;}
 plot(target){return target?.closest?.('.analytics-timeline-focus')||null;}
 pointerPlot(event){
  const direct=this.plot(event.target);if(direct)return direct;
  if(event.target?.closest?.('button,a,input,select,summary,details'))return null;
  const plot=event.target?.closest?.('.analytics-timeline-card')?.querySelector('.analytics-timeline-focus');
  return plot&&withinTimelineHitArea(event.clientX,event.clientY,plot.getBoundingClientRect())?plot:null;
 }
 inspectPointer(plot,event){const data=this.getCharts()[Number(plot.dataset.timelineIndex)];if(!data)return;const bounds=plot.getBoundingClientRect();this.show(plot,nearestTimelinePoint(event.clientX,bounds.left,bounds.width,data.items.length));}
 keydown(event){
  const plot=this.plot(event.target);if(!plot)return;
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();this.hide();return;}
  const movement={ArrowLeft:-1,ArrowDown:-1,ArrowRight:1,ArrowUp:1,Home:-Infinity,End:Infinity};
  if(!(event.key in movement))return;
  event.preventDefault();event.stopPropagation();
  const data=this.getCharts()[Number(plot.dataset.timelineIndex)];if(!data?.items.length)return;
  this.show(plot,clamp((Number(plot.dataset.activePoint)||0)+movement[event.key],0,data.items.length-1),true);
 }
 show(plot,index,announce=false){
  const data=this.getCharts()[Number(plot.dataset.timelineIndex)];if(!data?.items.length)return;
  index=clamp(index,0,data.items.length-1);
  if(!announce&&this.current?.plot===plot&&Number(plot.dataset.activePoint)===index)return;
  const card=plot.closest('.analytics-card'),tooltip=card.querySelector('.timeline-tooltip'),dot=card.querySelector('.timeline-hover-dot'),guide=card.querySelector('.timeline-hover-guide');
  if(!tooltip||!dot)return;
  if(this.current?.plot!==plot)this.hide();
  const item=data.items[index],period=this.formatPeriod(item.date||item.month,data.bucket),value=this.formatNumber(item.count)+' '+data.unit;
  tooltip.querySelector('.timeline-tooltip-period').textContent=period;
  tooltip.querySelector('.timeline-tooltip-value').textContent=value;
  tooltip.hidden=false;dot.hidden=false;if(guide)guide.hidden=false;
  const bounds=plot.getBoundingClientRect(),cardBounds=card.getBoundingClientRect(),[cx,cy]=data.coordinates[index],x=bounds.left+cx/960*bounds.width,y=bounds.top+cy/156*bounds.height;
  // Absolute offsets originate at the padding edge. Real page zoom can make
  // the rendered borders fractional; clientLeft/clientTop round them to integers.
  const style=this.host.ownerDocument.defaultView.getComputedStyle(card),borderLeft=parseFloat(style.borderLeftWidth)||0,borderTop=parseFloat(style.borderTopWidth)||0;
  const left=x-cardBounds.left-borderLeft,top=y-cardBounds.top-borderTop;
  dot.style.left=left+'px';dot.style.top=top+'px';dot.dataset.pointIndex=String(index);
  if(guide){guide.style.left=left+'px';guide.style.top=(bounds.top-cardBounds.top-borderTop+12/156*bounds.height)+'px';guide.style.height=(132/156*bounds.height)+'px';}
  const viewport=this.host.getBoundingClientRect(),win=this.host.ownerDocument.defaultView,margin=8;
  const minX=Math.max(margin,viewport.left+margin),minY=Math.max(margin,viewport.top+margin),maxX=Math.min(win.innerWidth-margin,viewport.right-margin),maxY=Math.min(win.innerHeight-margin,viewport.bottom-margin);
  tooltip.style.maxWidth=Math.max(1,Math.min(320,maxX-minX))+'px';
  const tip=tooltip.getBoundingClientRect();
  let tx=x+14,ty=y-tip.height-14;
  if(tx+tip.width>maxX)tx=x-tip.width-14;
  if(ty<minY)ty=y+14;
  tooltip.style.left=clamp(tx,minX,Math.max(minX,maxX-tip.width))+'px';
  tooltip.style.top=clamp(ty,minY,Math.max(minY,maxY-tip.height))+'px';
  plot.dataset.activePoint=String(index);
  if(announce)card.querySelector('.timeline-announcement').textContent=period+': '+value;
  this.current={plot,tooltip,dot,guide};
 }
 hide(){if(!this.current)return;const {plot,tooltip,dot,guide}=this.current;tooltip.hidden=true;dot.hidden=true;if(guide)guide.hidden=true;const live=plot.closest('.analytics-card')?.querySelector('.timeline-announcement');if(live)live.textContent='';this.current=null;}
}
