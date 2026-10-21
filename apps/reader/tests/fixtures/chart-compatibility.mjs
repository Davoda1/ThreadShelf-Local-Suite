/** Chat-derived synthetic fixture content supplied in the correction request.
 * These are not bytes from a complete account export or a converter round trip.
 * Keep the recognized GenUI envelope in integration/preview tests.
 */
export function fixtureLiteral(value) {
  if (typeof value === 'number' && Object.is(value, -0)) return '-0';
  if (Array.isArray(value)) return '[' + value.map(fixtureLiteral).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).map(([k,v]) => JSON.stringify(k) + ':' + fixtureLiteral(v)).join(',') + '}';
  return JSON.stringify(value);
}
export const genuiMessage = payload => 'genui' + fixtureLiteral(payload) + '';
export const readerMessage = content => '<Chart content={' + fixtureLiteral(content) + '}/>';
export const exportedFixtures = [
  {id:'C01',title:'Counts',payload:{charts_widget_v2:{content:{chartType:'bar',xKey:'category',series:[{dataKey:'count',label:'Count',valueFormat:'raw'}],yAxisMin:0,yAxisMax:60,data:[{category:'Alpha',count:40},{category:'Beta',count:52},{category:'Gamma',count:53}]}}}},
  {id:'C02',title:'Chart-level percentage suffix',payload:{charts_widget_v2:{content:{chartType:'bar',xKey:'category',series:[{dataKey:'score',label:'Score'}],valueSuffix:'%',yAxisMin:0,yAxisMax:100,data:[{category:'Alpha',score:52.3},{category:'Beta',score:70.5},{category:'Gamma',score:72.6}]}}}},
  {id:'C03',title:'Negative and zero bars',payload:{charts_widget_v2:{content:{chartType:'bar',xKey:'category',series:[{dataKey:'value',label:'Value'}],yAxisMin:-3,yAxisMax:4,data:[{category:'Negative',value:-2.5},{category:'Zero',value:0},{category:'Positive',value:3.125}]}}}},
  {id:'C04',title:'Horizontal bars',payload:{charts_widget_v2:{content:{chartType:'bar',layout:'vertical',xKey:'category',series:[{dataKey:'value',label:'Coverage',valueSuffix:'%'}],yAxisMin:0,yAxisMax:100,data:[{category:'Alpha',value:51},{category:'Beta',value:71},{category:'Gamma',value:100}]}}}},
  {id:'C05',title:'Shared multi-series lines',payload:{charts_widget_v2:{content:{chartType:'line',xKey:'category',series:[{dataKey:'a',label:'Series A'},{dataKey:'b',label:'Series B'}],yAxisMin:0,yAxisMax:4,data:[{category:'First',a:1.25,b:0},{category:'Second',a:0,b:1},{category:'Third',a:3.125,b:2},{category:'Fourth',a:2.5,b:4}]}}}},
  {id:'C07',title:'Pie-family reference ring',payload:{charts_widget_v2:{content:{chartType:'pie',nameKey:'category',valueKey:'value',series:[{dataKey:'value',label:'Items'}],data:[{category:'Alpha',value:6},{category:'Beta',value:3},{category:'Gamma',value:1}]}}}},
  {id:'C09',title:'Numeric scatter',payload:{charts_widget_v2:{content:{chartType:'scatter',xKey:'x',series:[{dataKey:'y',label:'Probe A'}],data:[{x:0.5,y:-2.5},{x:2,y:3.125},{x:4.5,y:1.25}]}}}},
];
const own = (type, more) => ({schema:'threadshelf-chart',version:1,type,...more});
export const readerFixtures = [
  {id:'R01',title:'Reader vertical grouped bars',content:own('bar',{categories:['A','B','C'],series:[{label:'First',values:[-0,-2.5,3.125],unit:'V'},{label:'Second',values:[1,0,2.5],unit:'V'}]})},
  {id:'R02',title:'Reader horizontal bars',content:own('bar',{orientation:'horizontal',categories:['A','B','C'],series:[{label:'Coverage',values:[51,71,100],valueSuffix:'%'}]})},
  {id:'R03',title:'Reader lines',content:own('line',{categories:['Same','Same','Last'],series:[{label:'First',values:[-0,3.125,2.5]},{label:'Second',values:[1,0,4]}],yAxis:{unit:'kg'}})},
  {id:'R04',title:'Reader unstacked area',content:own('area',{categories:['A','B','C','D'],series:[{label:'Measured',values:[2,5,3,6]}]})},
  {id:'R05',title:'Reader explicit solid pie',content:own('pie',{categories:['Alpha','Beta','Gamma'],series:[{label:'Items',values:[6,3,1]}]})},
  {id:'R06',title:'Reader explicit doughnut',content:own('doughnut',{categories:['Alpha','Beta','Gamma'],series:[{label:'Items',values:[5,3,2]}]})},
  {id:'R07',title:'Reader labelled numeric scatter',content:own('scatter',{xAxis:{label:'Time',unit:'s'},yAxis:{label:'Voltage',unit:'V'},series:[{label:'Trial',points:[{x:.5,y:-2.5,label:'P1'},{x:2,y:3.125,label:'P2'},{x:4.5,y:1.25,label:'P3'}]}]})},
];
export const fixtureById = id => exportedFixtures.find(f => f.id === id) || readerFixtures.find(f => f.id === id);
