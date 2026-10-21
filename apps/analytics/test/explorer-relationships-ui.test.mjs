import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseFragment} from 'parse5';
import {buildExplorerDensityGrid,buildExplorerRelationshipMatrix,formatExplorerBinBound,sampleExplorerRows,renderExplorer,attachExplorerHover} from '../src/ui/explorer.mjs';
import {translator} from '../src/ui/i18n.mjs';

const t=translator('en');
const number=value=>typeof value==='number'&&Number.isFinite(value)?value.toLocaleString('en',{maximumFractionDigits:4}):'Unavailable';
const attribute=(node,name)=>node.attrs?.find(a=>a.name===name)?.value;
const hasClass=(node,name)=>(attribute(node,'class')||'').split(/\s+/).includes(name);
const descendants=(node,predicate)=>{const found=[];function walk(n){if(predicate(n))found.push(n);for(const c of n.childNodes||[])walk(c);}walk(node);return found;};
const content=node=>node.nodeName==='#text'?node.value:(node.childNodes||[]).map(content).join('');
const byClass=(node,name)=>descendants(node,n=>hasClass(n,name));
const freeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);Object.values(value).forEach(freeze);}return value;};
const chart=(family,rows,extra={})=>({id:`${String(family).padStart(2,'0')}-relationship-test`,family,subview:'relationships',titleKey:`explorer.chart${String(family).padStart(2,'0')}`,columns:Object.keys(rows[0]||{}),contract:{state:'ready',eligible:rows.length,available:rows.length,unavailable:0,unit:'synthetic observations',algorithmVersion:'test:1'},rows,...extra});
function render(c,controls={}){return parseFragment(renderExplorer({report:{explorer:{charts:[c]}},subview:'relationships',selectedChart:c.id,config:{chartControls:{[c.id]:controls}},pages:{},queries:{},t,formatNumber:number,label:value=>String(value)}));}
const stylesheet=readFileSync(new URL('../src/ui/style.css',import.meta.url),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
function rule(selector){const matches=[...stylesheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(match=>match[1].split(',').map(s=>s.trim()).includes(selector));assert(matches.length,`Missing stylesheet selector ${selector}`);return Object.fromEntries(matches.flatMap(match=>match[2].split(';').filter(Boolean).map(declaration=>{const separator=declaration.indexOf(':');return [declaration.slice(0,separator).trim(),declaration.slice(separator+1).trim()];})));}

function densityRows(){
  const x=[0,10,50,100,250,500,1000,2500,5000,10000,50000],y=[0,10,100,1000,10000,50000],rows=[{kind:'eligible-summary',count:999}];
  for(let yi=0;yi<y.length;yi++)for(let xi=0;xi<x.length;xi++)rows.push({kind:'density',xLower:x[xi],xUpper:x[xi+1]??null,xUnbounded:xi===x.length-1,yLower:y[yi],yUpper:y[yi+1]??null,yUnbounded:yi===y.length-1,count:xi===0&&yi===0?0:(xi+1)*(yi+1),evidenceKey:`density:${yi}:${xi}`});
  return {rows,x,y};
}

test('13 complete density bins survive more than 40 rows and an extreme unbounded outlier axis',()=>{
  const fixture=densityRows(),c=freeze(chart(13,fixture.rows)),before=JSON.stringify(c);
  const plan=buildExplorerDensityGrid(c,{topN:40});
  assert.equal(plan.entries.length,66);assert.equal(plan.count,1385);assert.equal(plan.maximum,66);
  assert.deepEqual(plan.xBins.map(b=>b.lower),[0,10,50,100,250,500,1000,2500,5000,10000,50000]);
  assert.deepEqual(plan.yBins.map(b=>b.lower),[50000,10000,1000,100,10,0]);
  assert.equal(plan.xBins.at(-1).unbounded,true);assert.equal(plan.yBins[0].unbounded,true);
  const dom=render(c,{topN:20}),grid=byClass(dom,'explorer-density-grid')[0],buttons=byClass(grid,'explorer-density-cell');
  assert.equal(buttons.length,66);assert.equal(+attribute(grid,'data-total-count'),1385);
  assert.equal(descendants(grid,n=>n.tagName==='tbody')[0].childNodes.filter(n=>n.tagName==='tr').length,6);
  for(const button of buttons){const xi=fixture.x.indexOf(+attribute(button,'data-x-lower')),yi=fixture.y.indexOf(+attribute(button,'data-y-lower')),index=1+yi*11+xi;assert.equal(+attribute(button,'data-row-index'),index);assert.equal(+attribute(button,'data-count'),xi===0&&yi===0?0:(xi+1)*(yi+1));}
  assert.equal(buttons.reduce((n,b)=>n+Number(attribute(b,'data-count')),0),1385);
  const unboundedX=byClass(grid,'explorer-grid-x-label').find(header=>attribute(header,'data-x-lower')==='50000');
  assert.equal(content(unboundedX),'≥ 50k');assert.equal(attribute(unboundedX,'title'),'≥ 50,000');assert.equal(attribute(unboundedX,'aria-label'),'≥ 50,000');assert.equal(byClass(grid,'explorer-grid-x-label').length,11);
  assert.equal(JSON.stringify(c),before);
});

test('13 density bin positions depend on ordinal axis keys and all cells retain source evidence row indices',()=>{
  const fixture=densityRows(),c=chart(13,fixture.rows),dom=render(c,{topN:40}),grid=byClass(dom,'explorer-density-grid')[0];
  const far=byClass(grid,'explorer-density-cell').find(b=>attribute(b,'data-x-lower')==='50000'&&attribute(b,'data-y-lower')==='50000');
  assert.equal(attribute(far,'data-x-bin'),'10');assert.equal(attribute(far,'data-y-bin'),'0');assert.equal(attribute(far,'data-row-index'),'66');
  assert.equal(attribute(far,'data-action'),'explorer-evidence');assert.equal(attribute(far,'role'),'button');assert.equal(attribute(far,'tabindex'),'0');
  assert.equal(content(far),'66');assert(!byClass(grid,'explorer-density-cell').some(b=>attribute(b,'data-row-index')==='0'));
});

function fullDensityRows(representation){
  const edges=[0,1,10,50,100,250,500,1000,2500,5000,10000,25000,50000,100000,250000,1000000],rows=[{kind:'eligible-summary',count:999}];
  for(let y=0;y<16;y++)for(let x=0;x<16;x++)rows.push({kind:'density',...(representation?{representation}:{}),xLower:edges[x],xUpper:edges[x+1]??null,xUnbounded:x===15,yLower:edges[y],yUpper:edges[y+1]??null,yUnbounded:y===15,count:(x+1)*(y+1),evidenceKey:`complete-density:${y}:${x}`});
  return {edges,rows};
}

test('13/14 full 16×16 density rendering retains all 256 exact cells and original indices',()=>{
  for(const family of [13,14]){
    const fixture=fullDensityRows(family===14?'trace':undefined),c=freeze(chart(family,fixture.rows)),before=JSON.stringify(c),plan=buildExplorerDensityGrid(c,{topN:20}),dom=render(c,{topN:20}),grid=byClass(dom,'explorer-density-grid')[0],cells=byClass(grid,'explorer-density-cell');
    assert.equal(plan.entries.length,256);assert.equal(plan.count,18496);assert.equal(plan.maximum,256);
    assert.equal(cells.length,256);assert.equal(+attribute(grid,'data-total-count'),18496);
    for(const cell of cells){const x=fixture.edges.indexOf(+attribute(cell,'data-x-lower')),y=fixture.edges.indexOf(+attribute(cell,'data-y-lower'));assert.equal(+attribute(cell,'data-row-index'),1+y*16+x);assert.equal(+attribute(cell,'data-count'),(x+1)*(y+1));}
    assert.equal(cells.reduce((n,cell)=>n+Number(attribute(cell,'data-count')),0),18496);
    assert.deepEqual(cells.map(cell=>Number(attribute(cell,'data-row-index'))).sort((a,b)=>a-b),Array.from({length:256},(_,i)=>i+1));
    assert.equal(byClass(grid,'explorer-grid-x-label').length,16);assert.equal(byClass(grid,'explorer-grid-y-label').length,16);assert.equal(JSON.stringify(c),before);
  }
});

test('13/14 use one explicit bounded axis column and 16 equal bin columns inside a density-specific viewport',()=>{
  for(const family of [13,14]){
    const c=chart(family,fullDensityRows(family===14?'trace':undefined).rows),dom=render(c),plot=byClass(dom,'explorer-density-plot')[0],viewport=byClass(plot,'explorer-density-scroll')[0],grid=byClass(viewport,'explorer-density-grid')[0];
    assert(hasClass(plot,'explorer-grid-plot'));assert(hasClass(viewport,'explorer-grid-scroll'));assert.equal(attribute(viewport,'role'),'region');assert.equal(attribute(viewport,'tabindex'),'0');
    assert.equal(attribute(grid,'data-bin-columns'),'16');
    const groups=descendants(grid,node=>node.tagName==='colgroup');assert.equal(groups.length,1);
    const columns=groups[0].childNodes.filter(node=>node.tagName==='col');assert.equal(columns.length,17);assert(hasClass(columns[0],'explorer-density-axis-column'));
    assert(columns.slice(1).every(column=>hasClass(column,'explorer-density-bin-column')&&attribute(column,'style')===undefined&&attribute(column,'span')===undefined));
    assert.equal(byClass(grid,'explorer-grid-corner').length,1);assert.equal(content(byClass(grid,'explorer-grid-corner')[0]),'Y / X');
    assert.equal(byClass(grid,'explorer-grid-axis-title').length,0);assert.equal(byClass(viewport,'explorer-density-axes').length,1);
    assert.equal(byClass(viewport,'explorer-grid-x-title').length,1);assert.equal(byClass(viewport,'explorer-grid-y-title').length,1);
    for(const row of descendants(grid,node=>node.tagName==='tbody')[0].childNodes.filter(node=>node.tagName==='tr'))assert.equal(row.childNodes.filter(node=>node.tagName==='th'||node.tagName==='td').length,17);
  }
  const viewport=rule('.explorer-density-scroll'),grid=rule('.explorer-density-grid'),axis=rule('.explorer-density-axis-column'),header=rule('.explorer-density-grid .explorer-grid-x-label'),cell=rule('.explorer-density-grid .explorer-grid-cell');
  assert.equal(viewport['max-height'],'none!important');assert.equal(viewport['scrollbar-gutter'],'auto');assert.equal(viewport.padding,'0');assert.equal(viewport['overflow-y'],'hidden');
  assert.equal(grid.width,'min(100%,var(--density-natural-width,100%))');assert.equal(grid['min-width'],'0');assert.equal(grid['max-width'],'100%');assert.equal(grid['table-layout'],'fixed');assert.equal(axis.width,'clamp(64px,12%,130px)');
  assert.equal(header['min-width'],'0');assert.equal(cell['min-width'],'0');assert.equal(cell['min-height'],'28px');assert.equal(cell.height,'auto');assert.equal(cell['white-space'],'normal');
});

test('Density k/M labels preserve independently expected exact finite/unbounded header and cell ranges',()=>{
  for(const [value,expected]of [[0,'0'],[999,'999'],[1000,'1k'],[1250,'1.25k'],[50000,'50k'],[1000000,'1M'],[1250000,'1.25M']])assert.equal(formatExplorerBinBound(value,number),expected);
  for(const family of [13,14]){
    const c=freeze(chart(family,fullDensityRows(family===14?'trace':undefined).rows)),before=JSON.stringify(c),dom=render(c),grid=byClass(dom,'explorer-density-grid')[0];
    for(const headerClass of ['explorer-grid-x-label','explorer-grid-y-label']){
      const boundAttribute=headerClass==='explorer-grid-x-label'?'data-x-lower':'data-y-lower',headers=byClass(grid,headerClass),finite=headers.find(h=>attribute(h,boundAttribute)==='50000'),unbounded=headers.find(h=>attribute(h,boundAttribute)==='1000000');
      assert.equal(content(finite),'[50k,100k)');assert.equal(attribute(finite,'title'),'[50,000, 100,000)');assert.equal(attribute(finite,'aria-label'),'[50,000, 100,000)');
      assert.equal(content(unbounded),'≥ 1M');assert.equal(attribute(unbounded,'title'),'≥ 1,000,000');assert.equal(attribute(unbounded,'aria-label'),'≥ 1,000,000');
    }
    const exact=byClass(grid,'explorer-density-cell').find(cell=>attribute(cell,'data-x-lower')==='50000'&&attribute(cell,'data-y-lower')==='1000000'),description=attribute(exact,'aria-label');
    assert.equal(attribute(exact,'data-row-index'),'253');assert.equal(attribute(exact,'data-count'),'208');assert.equal(content(exact),'208');assert.equal(attribute(exact,'title'),description);
    assert(description.includes('[50,000, 100,000)'));assert(description.includes('≥ 1,000,000'));assert(description.includes(t('explorer.exactCellCount')+': 208'));assert(!description.includes('50k'));assert(!description.includes('1M'));
    assert(content(dom).includes(t('explorer.compactBinHelp')));assert.equal(JSON.stringify(c),before);
  }
});

test('14 trace and summary density selectors preserve their original mixed-table indices',()=>{
  const c=freeze(chart(14,[
    {kind:'summary-statistic',representation:'trace',count:50},
    {kind:'density',representation:'summary',xLower:0,xUpper:10,yLower:0,yUpper:100,count:2},
    {kind:'density',representation:'trace',xLower:0,xUpper:10,yLower:0,yUpper:100,count:3},
    {kind:'density',representation:'summary',xLower:50000,xUpper:null,xUnbounded:true,yLower:100,yUpper:null,yUnbounded:true,count:4},
    {kind:'density',representation:'trace',xLower:50000,xUpper:null,xUnbounded:true,yLower:100,yUpper:null,yUnbounded:true,count:5},
  ]));
  const trace=buildExplorerDensityGrid(c,{traceRepresentation:'trace'}),summary=buildExplorerDensityGrid(c,{traceRepresentation:'summary'});
  assert.deepEqual(trace.entries.map(e=>e.index),[2,4]);assert.deepEqual(summary.entries.map(e=>e.index),[1,3]);
  assert.equal(trace.count,8);assert.equal(summary.count,6);
  const traceDOM=render(c,{traceRepresentation:'trace',topN:1}),summaryDOM=render(c,{traceRepresentation:'summary',topN:1});
  assert.deepEqual(byClass(traceDOM,'explorer-density-cell').map(b=>Number(attribute(b,'data-row-index'))).sort((a,b)=>a-b),[2,4]);
  assert.deepEqual(byClass(summaryDOM,'explorer-density-cell').map(b=>Number(attribute(b,'data-row-index'))).sort((a,b)=>a-b),[1,3]);
  assert.equal(+attribute(byClass(summaryDOM,'explorer-density-grid')[0],'data-total-count'),6);
});

function featureRows(){const features=['fenced-code','links','markdown-tables','attachments'],rows=[];for(let i=0;i<12;i++)for(let j=0;j<4;j++)rows.push({model:`Model ${String(i).padStart(2,'0')}`,feature:features[j],numerator:i+j,denominator:100+i,prevalence:i===0&&j===0?null:i===0&&j===1?0:(i+j)/(100+i),evidenceKey:`feature:${i}:${j}`});return {features,rows};}

test('15 prevalence renders every feature for 12 selected model axes rather than a 40-row prefix',()=>{
  const fixture=featureRows(),c=freeze(chart(15,fixture.rows)),before=JSON.stringify(c),plan=buildExplorerRelationshipMatrix(c,{topN:40});
  assert.equal(plan.entries.length,48);assert.equal(plan.totalEntries,48);assert.equal(plan.ys.length,12);assert.deepEqual(plan.xs,fixture.features);
  assert.deepEqual(plan.ys,Array.from({length:12},(_,i)=>`Model ${String(11-i).padStart(2,'0')}`));
  const dom=render(c,{topN:40}),grid=byClass(dom,'explorer-matrix-grid')[0],buttons=byClass(grid,'explorer-matrix-cell');
  assert.equal(buttons.length,48);assert.equal(attribute(grid,'data-axis-count'),'12');assert.equal(byClass(grid,'explorer-grid-x-label').length,4);
  assert.deepEqual(buttons.map(b=>Number(attribute(b,'data-row-index'))).sort((a,b)=>a-b),Array.from({length:48},(_,i)=>i));
  assert.equal(JSON.stringify(c),before);
});

test('15 model axis limits keep complete feature rows for each chosen model',()=>{
  const c=chart(15,featureRows().rows),plan=buildExplorerRelationshipMatrix(c,{topN:10}),dom=render(c,{topN:10});
  assert.equal(plan.ys.length,10);assert.equal(plan.entries.length,40);assert.equal(plan.totalAxes,12);
  assert(plan.ys.every(model=>!['Model 00','Model 01'].includes(model)));
  assert.equal(byClass(byClass(dom,'explorer-matrix-grid')[0],'explorer-matrix-cell').length,40);
  for(const model of plan.ys)assert.equal(plan.entries.filter(e=>e.row.model===model).length,4);
});

test('15 unavailable prevalence remains a grey dash while an observed zero is a numeric 0%',()=>{
  const c=chart(15,featureRows().rows),dom=render(c),grid=byClass(dom,'explorer-matrix-grid')[0],buttons=byClass(grid,'explorer-matrix-cell'),missing=buttons.find(b=>attribute(b,'data-row-index')==='0'),zero=buttons.find(b=>attribute(b,'data-row-index')==='1');
  assert.equal(content(missing),'—');assert(hasClass(missing,'explorer-grid-unavailable'));assert.equal(attribute(missing,'data-value'),'');
  assert.equal(content(zero),'0%');assert(!hasClass(zero,'explorer-grid-unavailable'));assert.equal(attribute(zero,'data-value'),'0');
  const legend=byClass(dom,'explorer-intensity-legend')[0];assert.equal(attribute(legend,'data-legend-min'),'0');assert.equal(attribute(legend,'data-legend-max'),'1');
  assert(content(legend).includes('0%'));assert(content(legend).includes('25%'));assert(content(legend).includes('50%'));assert(content(legend).includes('75%'));assert(content(legend).includes('100%'));
});

function triangleRows(){return [
  {kind:'marginal',dimension:'model',source:'Ignored marginal',target:'Ignored marginal',joint:500},
  {kind:'cell',dimension:'model',source:'A',target:'A',joint:8,jaccard:1},
  {kind:'cell',dimension:'model',source:'A',target:'B',joint:2,jaccard:.25},
  {kind:'cell',dimension:'model',source:'A',target:'C',joint:0,jaccard:0},
  {kind:'cell',dimension:'model',source:'B',target:'B',joint:3,jaccard:1},
  {kind:'cell',dimension:'model',source:'B',target:'C',joint:0,jaccard:null},
  {kind:'cell',dimension:'model',source:'C',target:'C',joint:0,jaccard:null},
  {kind:'cell',dimension:'language',source:'Rust',target:'Pascal',joint:1,jaccard:.5},
];}

test('16 upper-triangle co-occurrence mirrors identical evidence indices over a shared source/target axis union',()=>{
  const c=freeze(chart(16,triangleRows())),before=JSON.stringify(c),plan=buildExplorerRelationshipMatrix(c,{matrixDimension:'model',cooccurrenceMeasure:'count',topN:1});
  assert.deepEqual(plan.xs,['A','B','C']);assert.deepEqual(plan.ys,['A','B','C']);assert.equal(plan.entries.length,6);assert.equal(plan.measure,'joint');assert.equal(plan.proportion,false);
  assert.equal(plan.cells.get(JSON.stringify(['A','B'])),plan.cells.get(JSON.stringify(['B','A'])));assert.equal(plan.cells.get(JSON.stringify(['A','B'])).index,2);
  const dom=render(c,{matrixDimension:'model',cooccurrenceMeasure:'count',topN:1}),grid=byClass(dom,'explorer-matrix-grid')[0],buttons=byClass(grid,'explorer-matrix-cell');
  assert.equal(buttons.length,9);assert(hasClass(grid,'explorer-symmetric-grid'));
  assert.equal(buttons.filter(b=>attribute(b,'data-row-index')==='2').length,2);
  assert.equal(buttons.filter(b=>attribute(b,'data-row-index')==='3').length,2);
  assert.equal(buttons.filter(b=>attribute(b,'data-row-index')==='5').length,2);
  assert(!buttons.some(b=>['0','7'].includes(attribute(b,'data-row-index'))));
  assert.equal(attribute(grid,'data-original-row-count'),'6');assert.equal(JSON.stringify(c),before);
});

test('16 Jaccard uses a fixed 0–1 scale and never converts unknown unions into zero overlap',()=>{
  const c=chart(16,triangleRows()),dom=render(c,{matrixDimension:'model',cooccurrenceMeasure:'jaccard'}),grid=byClass(dom,'explorer-matrix-grid')[0],buttons=byClass(grid,'explorer-matrix-cell'),legend=byClass(dom,'explorer-intensity-legend')[0];
  assert.equal(attribute(legend,'data-legend-min'),'0');assert.equal(attribute(legend,'data-legend-max'),'1');
  const quarter=buttons.find(b=>attribute(b,'data-row-index')==='2'),zero=buttons.find(b=>attribute(b,'data-row-index')==='3'),missing=buttons.find(b=>attribute(b,'data-row-index')==='5');
  assert.equal(content(quarter),'0.25');assert.equal(attribute(quarter,'style'),'--cell-strength:34%');assert.equal(content(zero),'0');assert.equal(attribute(zero,'data-value'),'0');
  assert.equal(content(missing),'—');assert.equal(attribute(missing,'data-value'),'');assert(hasClass(missing,'explorer-grid-unavailable'));
  const languages=buildExplorerRelationshipMatrix(c,{matrixDimension:'language',cooccurrenceMeasure:'jaccard'});assert.deepEqual(languages.xs,['Rust','Pascal']);assert.deepEqual(languages.ys,['Rust','Pascal']);assert.equal(languages.cells.get(JSON.stringify(['Pascal','Rust'])).index,7);
});

test('Density fitting leaves categorical matrix labels, exact values, and mirrored evidence rows unchanged',()=>{
  const models=freeze(chart(15,[{model:'Model 1000000',feature:'Feature 50000',numerator:3,denominator:4,prevalence:.75},{model:'Model 1000000',feature:'Feature 1000000',numerator:0,denominator:4,prevalence:0}])),overlap=freeze(chart(16,[{kind:'cell',dimension:'model',source:'Model 50000',target:'Model 1000000',joint:50000,jaccard:.5}]));
  const original=JSON.stringify([models,overlap]),before=[content(render(models)),content(render(overlap,{cooccurrenceMeasure:'count'}))];
  render(chart(13,fullDensityRows().rows));render(chart(14,fullDensityRows('trace').rows));
  assert.deepEqual([content(render(models)),content(render(overlap,{cooccurrenceMeasure:'count'}))],before);
  for(const [c,controls]of [[models,{}],[overlap,{cooccurrenceMeasure:'count'}]]){
    const dom=render(c,controls),grid=byClass(dom,'explorer-matrix-grid')[0],plot=byClass(dom,'explorer-grid-plot')[0];
    assert.equal(byClass(plot,'explorer-density-plot').length,0);assert.equal(byClass(plot,'explorer-density-scroll').length,0);assert.equal(byClass(plot,'explorer-density-axes').length,0);assert.equal(descendants(grid,node=>node.tagName==='colgroup').length,0);assert.equal(byClass(plot,'explorer-grid-scroll').length,1);assert.equal(byClass(plot,'explorer-matrix-scroll').length,1);
    assert(content(grid).includes('Model 1000000'));assert(!content(grid).includes('Model 1M'));
  }
  const featureCells=byClass(render(models),'explorer-matrix-cell');assert.deepEqual(featureCells.map(cell=>[attribute(cell,'data-row-index'),attribute(cell,'data-value'),content(cell)]),[['0','0.75','75%'],['1','0','0%']]);
  const overlapCells=byClass(render(overlap,{cooccurrenceMeasure:'count'}),'explorer-matrix-cell');assert.equal(overlapCells.length,2);assert(overlapCells.every(cell=>attribute(cell,'data-row-index')==='0'&&attribute(cell,'data-value')==='50000'&&content(cell)==='50,000'));assert.equal(JSON.stringify([models,overlap]),original);
  assert.equal(rule('.explorer-matrix-scroll').padding,'0');
  const structures=render(chart(18,[{structure:'headings',occurrences:1,presentSegments:1}]));assert.equal(byClass(structures,'explorer-grid-scroll').length,1);assert.equal(byClass(structures,'explorer-matrix-scroll').length,0);assert.equal(byClass(structures,'explorer-density-scroll').length,0);
});

test('18 horizontal structure bars expose the structure name, exact count, and source evidence index',()=>{
  const rows=[{structure:'headings',occurrences:3,presentSegments:2},{structure:'lists',occurrences:0,presentSegments:0},{structure:'quotes',occurrences:1,presentSegments:1},{structure:'tables',occurrences:null,presentSegments:0},{structure:'inlineCode',occurrences:50,presentSegments:7},{structure:'fencedCode',occurrences:1000,presentSegments:9},{structure:'indentedCode',occurrences:2,presentSegments:2}],c=freeze(chart(18,rows)),before=JSON.stringify(c),dom=render(c,{topN:1}),bars=byClass(dom,'explorer-structure-bar');
  assert.equal(bars.length,7);
  for(let i=0;i<bars.length;i++){const bar=bars[i],count=descendants(bar,n=>n.tagName==='strong')[0];assert.equal(attribute(bar,'data-row-index'),String(i));assert.equal(attribute(bar,'data-action'),'explorer-evidence');assert.equal(content(count),rows[i].occurrences===null?'Unavailable':number(rows[i].occurrences));assert(content(byClass(bar,'explorer-structure-name')[0]).length>0);}
  const zeroWidth=descendants(bars[1],n=>n.tagName==='i')[0],maxWidth=descendants(bars[5],n=>n.tagName==='i')[0];assert.equal(attribute(zeroWidth,'style'),'width:0%');assert.equal(attribute(maxWidth,'style'),'width:100%');
  assert.equal(JSON.stringify(c),before);
});

test('17 bounded concentration sampling includes the final cumulative observation and domain labels',()=>{
  const rows=Array.from({length:100},(_,i)=>({kind:'concentration',domain:`example-${i+1}.invalid`,rank:i+1,cumulativeCount:2*(i+1),cumulativeShare:(i+1)/100,count:2,evidenceKey:`domain:${i}`})),c=freeze(chart(17,rows,{display:{kind:'concentration',x:'rank',y:'cumulativeShare'}})),before=JSON.stringify(c),dom=render(c,{topN:40}),svg=descendants(dom,n=>n.tagName==='svg')[0],points=descendants(svg,n=>n.tagName==='circle');
  assert.equal(points.length,40);assert.equal(attribute(points[0],'data-row-index'),'0');assert.equal(attribute(points.at(-1),'data-row-index'),'99');
  assert.equal(attribute(points.at(-1),'cx'),'736');assert.equal(attribute(points.at(-1),'cy'),'16');
  assert(attribute(points.at(-1),'aria-label').includes('example-100.invalid'));assert(content(svg).includes('example-100.invalid'));assert.equal(JSON.stringify(c),before);
});

test('Concentration sampling is deterministic, keeps both endpoints and never rewrites numerical rows',()=>{
  const entries=freeze(Array.from({length:101},(_,index)=>({row:{rank:index+1,cumulativeShare:(index+1)/101},index}))),before=JSON.stringify(entries),sample=sampleExplorerRows(entries,5);
  assert.deepEqual(sample.map(e=>e.index),[0,25,50,75,100]);assert.equal(sample[0],entries[0]);assert.equal(sample.at(-1),entries.at(-1));
  assert.equal(sampleExplorerRows(entries,200),entries);assert.equal(JSON.stringify(entries),before);
});

test('Bin/structure grids hide unused row limits and bounded co-occurrence offers only supported limits',()=>{
  for(const family of [13,14,18]){
    const rows=family===18?[{structure:'headings',occurrences:1,presentSegments:1}]:[{kind:'density',representation:'trace',xLower:0,xUpper:10,yLower:0,yUpper:10,count:1}];
    const dom=render(chart(family,rows));assert.equal(descendants(dom,n=>attribute(n,'data-explorer-control')==='topN').length,0);
  }
  const dom=render(chart(16,triangleRows())),limit=descendants(dom,n=>attribute(n,'data-explorer-control')==='topN')[0];
  assert.deepEqual(descendants(limit,n=>n.tagName==='option').map(n=>attribute(n,'value')),['20','40','100']);
  assert(!descendants(limit,n=>n.tagName==='option').some(n=>attribute(n,'value')==='200'));
});

test('16 explicitly discloses original/retained/Other label populations rather than reporting only plotted axes',()=>{
  const c=chart(16,[{kind:'population',dimension:'model',originalLabels:100,retainedLabels:40,otherLabels:60},...triangleRows()]),plan=buildExplorerRelationshipMatrix(c,{matrixDimension:'model'});
  assert.deepEqual([plan.originalLabels,plan.retainedLabels,plan.otherLabels],[100,40,60]);
  const disclosure=byClass(render(c),'explorer-grid-disclosure')[0],text=content(disclosure);
  assert(text.includes(t('explorer.column.originalLabels')+': 100'));assert(text.includes(t('explorer.column.retainedLabels')+': 40'));assert(text.includes(t('explorer.column.otherLabels')+': 60'));
});

test('Document-scoped focus/pointer hover stays visible during in-view scroll and hides when its source leaves the viewport',()=>{
  const c=chart(13,[{kind:'density',xLower:10,xUpper:20,yLower:50000,yUpper:null,yUnbounded:true,count:7}]),rendered=byClass(render(c),'explorer-density-cell')[0],description=attribute(rendered,'aria-label'),listeners=new Map();
  let shows=0,hides=0,popoverOpen=false,sourceBox={left:650,right:670,top:500,bottom:520,width:20,height:20};
  const tooltip={dataset:{page:'0'},hidden:true,innerHTML:'',style:{},showPopover(){shows++;popoverOpen=true;},hidePopover(){hides++;popoverOpen=false;},matches:selector=>selector===':popover-open'&&popoverOpen,getBoundingClientRect:()=>({width:300,height:160})};
  const plot={dataset:{explorerChart:c.id,population:'neutral'},querySelector:()=>tooltip,querySelectorAll:()=>[mark],contains:node=>node===mark||node===tooltip};
  const mark={dataset:{rowIndex:'0',x:'10'},isConnected:true,classList:{contains:()=>false},getAttribute:name=>name==='aria-label'?description:null,getBoundingClientRect:()=>sourceBox,closest:selector=>selector==='[data-explorer-chart]'||selector==='.explorer-plot'?plot:selector==='.explorer-plot [data-row-index]'?mark:null};
  const documentRoot={ownerDocument:null,defaultView:{innerWidth:680,innerHeight:540},activeElement:mark,addEventListener:(name,callback)=>listeners.set(name,callback),querySelectorAll:()=>[tooltip]};
  attachExplorerHover(documentRoot,{getCharts:()=>[c],getConfig:()=>({chartControls:{}}),t,formatNumber:number,label:String});
  listeners.get('focusin')({target:mark});
  assert.equal(shows,1);assert.equal(tooltip.hidden,false);assert.equal(tooltip.style.left,'372px');assert.equal(tooltip.style.top,'334px');
  const text=content(parseFragment(tooltip.innerHTML));assert(text.includes('[10, 20)'));assert(text.includes('≥ 50,000'));assert(text.includes(t('explorer.exactCellCount')+': 7'));
  assert.equal(tooltip.__mark,mark);assert.equal(tooltip.dataset.population,'neutral');
  listeners.get('scroll')({target:{closest:()=>null}});assert.equal(shows,2);assert.equal(tooltip.style.left,'372px');
  listeners.get('focusout')({target:mark,relatedTarget:null});assert.equal(hides,1);assert.equal(tooltip.hidden,true);
  documentRoot.activeElement=null;
  listeners.get('pointerover')({target:mark});assert.equal(shows,3);assert.equal(tooltip.hidden,false);
  listeners.get('scroll')({target:{closest:()=>null}});assert.equal(shows,4);assert.equal(tooltip.hidden,false);assert.equal(tooltip.style.left,'372px');assert.equal(tooltip.style.top,'334px');
  assert(content(parseFragment(tooltip.innerHTML)).includes(t('explorer.exactCellCount')+': 7'));
  sourceBox={left:650,right:670,top:-100,bottom:-80,width:20,height:20};
  listeners.get('scroll')({target:{closest:()=>null}});assert.equal(shows,4);assert.equal(hides,2);assert.equal(tooltip.hidden,true);
});
