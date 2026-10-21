import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFragment} from 'parse5';
import fs from 'node:fs/promises';
import {buildStackedBarModel,renderStackedBarChart,renderHoverBars,stackedTooltipMarkup,createStackedBarState,boundedStackedTooltipPosition,boundedHorizontalTooltipPosition,attachStackedBarHover} from '../src/ui/bar-hover.mjs';
import {translator} from '../src/ui/i18n.mjs';

const nodes=root=>[root,...(root.childNodes||[]).flatMap(nodes)];
const attrs=node=>Object.fromEntries((node.attrs||[]).map(attribute=>[attribute.name,attribute.value]));
const text=node=>node.nodeName==='#text'?node.value:(node.childNodes||[]).map(text).join('');
const classHas=(node,name)=>(attrs(node).class||'').split(' ').includes(name);
const row=(date,count,user,thinking,response,extra={})=>({date,count,user,thinking,response,...extra});

test('A stack exposes every plotted group, including zero, and indents the exact Other categories',()=>{
  const source=row('2026-10-02',17,6,0,5,{tool_call:2,tool_output:1,recap:2,system:1});
  const model=buildStackedBarModel({rows:[source]}),bar=model.bars[0];
  assert.deepEqual(bar.groups.map(group=>[group.key,group.count]),[['user',6],['thinking',0],['response',5],['other',6]]);
  assert.deepEqual(bar.otherBreakdown.map(group=>[group.key,group.count]),[['recap',2],['tool_call',2],['tool_output',1],['system',1]]);
  assert.equal(bar.groups.reduce((sum,group)=>sum+group.count,0),17,'Indented source categories explain Other; they are not added to its grouped total');
  const tree=nodes(parseFragment(stackedTooltipMarkup(model,0))),main=tree.filter(node=>classHas(node,'stacked-tooltip-row')&&!Object.hasOwn(attrs(node),'data-other-detail'));
  assert.deepEqual(main.map(node=>attrs(node)['data-category']),['user','thinking','response','other']);
  assert.deepEqual(main.map(node=>text(nodes(node).find(child=>classHas(child,'stacked-tooltip-count')))),['6','0','5','6']);
  const details=tree.filter(node=>attrs(node)['data-other-detail']==='true');
  assert.equal(details.length,4);assert.ok(details.every(node=>classHas(node,'stacked-tooltip-detail')));
  assert.equal(text(tree.find(node=>Object.hasOwn(attrs(node),'data-stacked-total'))),'17');
  assert.ok(text(tree.find(node=>classHas(node,'stacked-tooltip-heading'))).includes('2026-10-02'));
});

test('Every category dot exactly matches its plotted stack color and its legend dot',()=>{
  const input={rows:[row('2026-10-02',8,3,2,1,{tool_call:2})]},model=buildStackedBarModel(input);
  const chart=nodes(parseFragment(renderStackedBarChart(input))),tooltip=nodes(parseFragment(stackedTooltipMarkup(model,0)));
  const segments=chart.filter(node=>classHas(node,'chart-segment')),legends=chart.filter(node=>classHas(node,'stacked-legend-marker'));
  const main=tooltip.filter(node=>classHas(node,'stacked-tooltip-row')&&!Object.hasOwn(attrs(node),'data-other-detail'));
  for(let index=0;index<4;index++){
    const marker=nodes(main[index]).find(node=>classHas(node,'stacked-tooltip-marker'));
    assert.ok(attrs(segments[index]).style.includes(attrs(marker).style));
    assert.equal(attrs(marker).style,attrs(legends[index]).style);
  }
  const otherDetail=tooltip.find(node=>attrs(node)['data-other-detail']==='true');
  assert.equal(attrs(nodes(otherDetail).find(node=>classHas(node,'stacked-tooltip-marker'))).style,'background:var(--accent)');
});

test('The last45 timeline bars and first ranked bars retain original exact table evidence indices',()=>{
  const rows=Array.from({length:70},(_,index)=>row(`day-${index}`,index+3,1,1,1));
  const timeline=buildStackedBarModel({rows,key:'timelineDaily'});
  assert.equal(timeline.bars.length,45);assert.equal(timeline.bars[0].rowIndex,25);assert.equal(timeline.bars[0].row,rows[25]);assert.equal(timeline.bars.at(-1).rowIndex,69);
  const chart=nodes(parseFragment(renderStackedBarChart({rows,key:'timelineDaily'}))),buttons=chart.filter(node=>node.tagName==='button');
  assert.equal(attrs(buttons[0])['data-row-index'],'25');assert.equal(attrs(buttons.at(-1))['data-row-index'],'69');
  assert.ok(buttons.every(node=>attrs(node)['data-action']==='table-evidence'&&attrs(node)['data-table']==='timelineDaily'));
  const state=createStackedBarState();renderHoverBars({id:'bars-hour',key:'hour',rows,maxRows:24},state);
  const ranked=state.getModel('bars-hour');assert.equal(ranked.bars.length,24);assert.equal(ranked.bars[0].rowIndex,0);assert.equal(ranked.bars.at(-1).rowIndex,23);
  assert.equal(ranked.max,26,'The scale uses the established visible ranked window');
});

test('Explicit zero remains zero while missing, non-finite and contradictory group counts remain unavailable',()=>{
  const model=buildStackedBarModel({rows:[row('zero',0,0,0,0),row('null',4,null,1,1),row('missing',5,undefined,1,1),row('infinite',Infinity,1,1,1),row('mismatch',2,2,2,2)]});
  assert.deepEqual(model.bars[0].groups.map(group=>group.count),[0,0,0,0]);
  for(const index of [1,2]){assert.equal(model.bars[index].groups[0].count,null);assert.equal(model.bars[index].groups[3].count,null);assert.ok(stackedTooltipMarkup(model,index).includes('Unavailable'));}
  assert.equal(model.bars[3].total,null);assert.equal(model.bars[4].groups[3].count,null);
  const html=renderStackedBarChart({rows:model.bars.map(bar=>bar.row)});
  assert.ok(!html.includes('NaN')&&!html.includes('Infinity'));assert.ok(!/height:-/.test(html));
});

test('Character measurements keep category counts in their own Content-segments unit',()=>{
  const state=createStackedBarState();
  renderHoverBars({id:'chars',key:'models',rows:[{label:'Model',characters:1000,count:9,user:4,thinking:2,response:2,tool_call:1}],measure:'characters',measureLabel:'Characters'},state);
  const model=state.getModel('chars'),tree=nodes(parseFragment(stackedTooltipMarkup(model,0)));
  assert.equal(text(tree.find(node=>Object.hasOwn(attrs(node),'data-stacked-total'))),'1000');
  assert.equal(text(tree.find(node=>Object.hasOwn(attrs(node),'data-stacked-segment-total'))),'9');
  assert.equal(text(tree.find(node=>classHas(node,'stacked-tooltip-unit'))),'Content segments: 9');
  assert.deepEqual(model.bars[0].groups.map(group=>group.count),[4,2,2,1]);
  const button=nodes(parseFragment(renderHoverBars(model.input,state))).find(node=>node.tagName==='button');
  assert.ok(attrs(button)['aria-label'].includes('1000 Characters'));assert.ok(attrs(button)['aria-label'].includes('9 Content segments'));
});

test('Non-category aggregate bars show only their measured value and matching dot',()=>{
  const state=createStackedBarState();renderHoverBars({id:'duration',key:'durations',rows:[{label:'Recorded duration',milliseconds:1250}],measure:'milliseconds',measureLabel:'Milliseconds'},state);
  const tree=nodes(parseFragment(stackedTooltipMarkup(state.getModel('duration'),0))),detail=tree.filter(node=>classHas(node,'stacked-tooltip-row'));
  assert.equal(detail.length,1);assert.equal(attrs(detail[0])['data-category'],'measure');assert.ok(text(detail[0]).includes('Milliseconds1250'));
  assert.equal(attrs(nodes(detail[0]).find(node=>classHas(node,'stacked-tooltip-marker'))).style,'background:var(--accent)');
  assert.equal(tree.filter(node=>classHas(node,'stacked-tooltip-breakdown')).length,0);
});

test('Composition bars preserve the established semantic role colors and measure dots match them',()=>{
  const state=createStackedBarState(),input={id:'roles',key:'composition',rows:[{label:'user',count:7},{label:'thinking',count:2},{label:'response',count:5},{label:'commentary',count:1}]};
  const chart=nodes(parseFragment(renderHoverBars(input,state))),fills=chart.filter(node=>classHas(node,'bar-fill'));
  const colors=['var(--user)','var(--thinking)','var(--response)','var(--accent)'];
  for(let index=0;index<4;index++){
    assert.ok(attrs(fills[index]).style.includes('background:'+colors[index]));
    const tooltip=nodes(parseFragment(stackedTooltipMarkup(state.getModel('roles'),index))),dot=tooltip.find(node=>classHas(node,'stacked-tooltip-marker'));
    assert.equal(attrs(dot).style,'background:'+colors[index]);
  }
});

test('Tooltip labels and periods are escaped and private evidence bodies never enter chart markup',()=>{
  const secret='PRIVATE ORIGINAL RECORD BODY',input={id:'" onpointerover="bad',key:'timelineDaily',rows:[row('<img src=x onerror=bad>',4,1,1,1,{other:1,text:secret,evidenceIds:[secret]})],categoryLabel:key=>`<script>${key}</script>`,formatNumber:value=>`<b>${value}</b>`};
  const model=buildStackedBarModel(input),html=renderStackedBarChart(input)+stackedTooltipMarkup(model,0),tree=nodes(parseFragment(html));
  assert.ok(!html.includes(secret));assert.ok(!tree.some(node=>['script','img','b'].includes(node.tagName)&&text(node)!=='<b>4</b>'));
  assert.ok(!tree.some(node=>Object.keys(attrs(node)).some(key=>key.startsWith('on'))));
  assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('&lt;img'));
});

test('Native focusable bar buttons expose all category counts and reference a real tooltip',()=>{
  const tree=nodes(parseFragment(renderStackedBarChart({rows:[row('2026-10-02',7,4,0,2,{tool_output:1})]}))),button=tree.find(node=>node.tagName==='button'),tooltip=tree.find(node=>attrs(node).role==='tooltip');
  assert.equal(attrs(button).type,'button');assert.ok(!Object.hasOwn(attrs(button),'tabindex'),'Native buttons remain in the normal tab order');
  assert.equal(attrs(button)['aria-describedby'],attrs(tooltip).id);assert.ok(Object.hasOwn(attrs(tooltip),'hidden'));
  for(const value of ['2026-10-02','7 Content segments','User prompts: 4','Thinking: 0','Final responses: 2','Other records: 1','Recorded tool outputs: 1'])assert.ok(attrs(button)['aria-label'].includes(value),value);
  assert.equal(Object.hasOwn(attrs(button),'title'),false,'Avoid competing browser-only tooltips');
});

test('Tooltip geometry stays bounded for narrow/large plots and horizontal lists near the viewport bottom',()=>{
  for(const width of [180,450,1800])for(const anchorX of [-50,0,width/2,width+100]){
    const size=Math.min(220,width-16),position=boundedStackedTooltipPosition({plotWidth:width,plotHeight:155,tooltipWidth:size,tooltipHeight:139,anchorX});
    assert.ok(position.left>=8&&position.left+size<=width-8);assert.equal(position.top,8);
  }
  assert.equal(boundedStackedTooltipPosition({plotWidth:NaN}),null);
  const position=boundedHorizontalTooltipPosition({plot:{left:245,top:390,width:390},tooltip:{width:300,height:220},anchor:{left:250,top:480,width:380},viewportWidth:680,viewportHeight:540});
  assert.ok(position.left>=8&&position.left+300<=390-8);assert.ok(position.top+390>=8&&position.top+390+220<=540-8);
  const clipped=boundedHorizontalTooltipPosition({plot:{left:245,top:390,width:390},tooltip:{width:300,height:220},anchor:{left:250,top:480,width:380},viewportWidth:680,viewportHeight:540,bounds:{left:190,top:205,right:680,bottom:510}});
  assert.ok(clipped.top+390>=213&&clipped.top+390+220<=502,'The content pane clips before the footer even when viewport has more space');
});

test('Delegated hover listeners install once and clean up without changing data or invoking evidence',()=>{
  const added=[],removed=[],scope={addEventListener:(...args)=>added.push(args),removeEventListener:(...args)=>removed.push(args),querySelectorAll:()=>[],defaultView:{addEventListener:(...args)=>added.push(args),removeEventListener:(...args)=>removed.push(args)}};
  const cleanup=attachStackedBarHover(scope);assert.equal(attachStackedBarHover(scope),cleanup);
  assert.deepEqual(added.map(([name])=>name),['pointerover','pointermove','focusin','pointerout','focusout','keydown','scroll','resize']);
  cleanup();assert.deepEqual(removed.map(([name])=>name),added.map(([name])=>name));
});

test('Focus and keyboard navigation reveal the correct bar, scroll details, and dismiss without replacing native evidence activation',()=>{
  const handlers=new Map(),state=createStackedBarState();state.setModel(buildStackedBarModel({id:'keys',rows:[row('first',3,1,1,1),row('middle',6,2,2,2),row('last',9,3,3,3)]}));
  const rect={left:100,top:200,right:600,bottom:355,width:500,height:155},tooltip={hidden:true,dataset:{},style:{},scrollTop:0,clientHeight:139,getBoundingClientRect:()=>({width:220,height:139})};
  const doc={activeElement:null,addEventListener:(name,fn)=>handlers.set(name,fn),removeEventListener:name=>handlers.delete(name),querySelectorAll:()=>[view],defaultView:{innerWidth:680,innerHeight:540,getComputedStyle:()=>({overflowX:'visible',overflowY:'visible'}),addEventListener(){},removeEventListener(){}}};
  const classes=()=>{const set=new Set();return {toggle:(name,on)=>on?set.add(name):set.delete(name),remove:name=>set.delete(name),contains:name=>set.has(name)};};
  const buttons=Array.from({length:3},(_,index)=>({dataset:{stackedIndex:String(index)},classList:classes(),closest:selector=>selector==='[data-stacked-chart]'?view:selector==='[data-stacked-index]'?buttons[index]:null,getBoundingClientRect:()=>({left:100+index*160,right:250+index*160,top:rect.top+5,bottom:rect.top+145,width:150,height:140}),focus(){doc.activeElement=this;handlers.get('focusin')({target:this});}}));
  let hovering=null;
  const view={dataset:{stackedChart:'keys'},ownerDocument:doc,parentElement:null,matches:selector=>selector===':hover'&&hovering!==null,contains:value=>buttons.includes(value)||value===tooltip,querySelector:selector=>selector==='[data-stacked-tooltip]'?tooltip:selector==='[data-stacked-index]:hover'?hovering:selector==='.stacked-bar-plot'?{getBoundingClientRect:()=>rect}:buttons.find(button=>selector===`[data-stacked-index="${button.dataset.stackedIndex}"]`),querySelectorAll:selector=>selector.includes('is-stacked-active')?buttons.filter(button=>button.classList.contains('is-stacked-active')):buttons};
  const cleanup=attachStackedBarHover(doc,state),press=(key,target=doc.activeElement)=>{const event={key,target,prevented:false,preventDefault(){this.prevented=true;}};handlers.get('keydown')(event);return event;};
  buttons[0].focus();assert.equal(tooltip.hidden,false);assert.equal(tooltip.dataset.stackedIndex,'0');
  assert.equal(tooltip.dataset.action,'table-evidence');assert.equal(tooltip.dataset.table,'timelineDaily');assert.equal(tooltip.dataset.rowIndex,'0','Covered-bar tooltip clicks use the same original evidence row');
  rect.top=230;rect.bottom=385;handlers.get('scroll')({target:{closest:()=>null}});assert.equal(tooltip.hidden,false,'A delayed native scroll-to-focus event keeps the now-visible focused bar detail');assert.equal(tooltip.dataset.stackedIndex,'0');
  assert.equal(press('ArrowRight').prevented,true);assert.equal(doc.activeElement,buttons[1]);assert.equal(tooltip.dataset.stackedIndex,'1');
  assert.equal(tooltip.dataset.rowIndex,'1');
  press('End');assert.equal(doc.activeElement,buttons[2]);press('ArrowRight');assert.equal(doc.activeElement,buttons[2]);press('Home');assert.equal(doc.activeElement,buttons[0]);
  press('ArrowDown');assert.equal(tooltip.scrollTop,24);press('PageDown');assert.equal(tooltip.scrollTop,163);
  assert.equal(press('Enter').prevented,false);assert.equal(press(' ').prevented,false,'Enter/Space retain the native evidence button activation');
  handlers.get('pointerout')({type:'pointerout',target:buttons[0],relatedTarget:null});assert.equal(tooltip.hidden,false,'Pointer departure preserves a keyboard-focused bar');
  assert.equal(press('Escape').prevented,true);assert.equal(tooltip.hidden,true);
  handlers.get('scroll')({target:{closest:()=>null}});assert.equal(tooltip.hidden,true,'Scrolling never reopens an Escape-dismissed tooltip');
  buttons[1].focus();doc.activeElement=null;handlers.get('focusout')({type:'focusout',target:buttons[1],relatedTarget:null});assert.equal(tooltip.hidden,true);
  hovering=buttons[2];handlers.get('pointerover')({target:buttons[2]});assert.equal(tooltip.hidden,false);
  handlers.get('scroll')({target:{closest:()=>null}});assert.equal(tooltip.hidden,false,'A delayed scroll after pointerover preserves the hovered bar detail');assert.equal(tooltip.dataset.stackedIndex,'2');
  tooltip.scrollTop=35;handlers.get('scroll')({target:{closest:()=>tooltip}});assert.equal(tooltip.hidden,false);assert.equal(tooltip.scrollTop,35,'Scrolling the Other breakdown never dismisses or resets it');
  rect.top=600;rect.bottom=755;handlers.get('scroll')({target:{closest:()=>null}});assert.equal(tooltip.hidden,true,'A bar scrolled outside the visible pane loses its stale tooltip');
  cleanup();assert.equal(handlers.size,0);
});

test('New hover text uses the existing five locale catalog and all legacy bars import the shared helper',async()=>{
  for(const language of ['en','hu','de','fr','ja']){
    const t=translator(language),model=buildStackedBarModel({rows:[row('2026-10-02',3,1,1,1)],t});
    const html=stackedTooltipMarkup(model,0);for(const key of ['user','thinking','response','other','segments'])assert.ok(html.includes(t(key)));
  }
  const source=await fs.readFile(new URL('../src/ui/app.js',import.meta.url),'utf8');
  assert.match(source,/function timeline\([^\n]*renderStackedBarChart/);assert.match(source,/function bars\([^\n]*renderHoverBars/);assert.match(source,/attachStackedBarHover\(document\)/);
  const css=await fs.readFile(new URL('../src/ui/bar-hover.css',import.meta.url),'utf8');assert.match(css,/max-width:calc\(100% - 16px\)/);assert.match(css,/max-height:calc\(100% - 16px\)/);assert.match(css,/overflow:auto/);
});
