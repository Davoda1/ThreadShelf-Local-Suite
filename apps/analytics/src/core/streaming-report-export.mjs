import {PRODUCT_VERSION} from './storage-versions.mjs';
/** Exact streamed report files; privacy dictionaries and all result rows stay on disk. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes} from 'node:crypto';
import {exportPayload,exportedExplorer,exportLegacyTableRow,withoutEvidenceReferences,safeAppliedFilters,csvCell,escapeHtml,renderValue,localizedTranslator,localizedHeading,barChart,renderPayloadHTML,reportEvidenceHTML,reportContractHTML} from './reports.mjs';

const ARRAY=Symbol('streamed-report-array');
const streamArray=iterate=>({[ARRAY]:iterate});
const check=options=>options.signal?.throwIfAborted();
const cleanTransport=row=>{const{rowId,evidenceKey,rankEvidenceKey,historyEvidence,previewTruncated,previewTruncatedFields,oversizedRow,...value}=row;return value;};
const columnKey=value=>typeof value==='string'?value:value?.key;
async function* jsonValue(value){
 if(value?.[ARRAY]){yield '[';let first=true;for await(const item of value[ARRAY]()){if(!first)yield ',';first=false;yield*jsonValue(item);}yield ']';return;}
 if(Array.isArray(value)){yield '[';for(let index=0;index<value.length;index++){if(index)yield ',';yield*jsonValue(value[index]===undefined?null:value[index]);}yield ']';return;}
 if(value&&typeof value==='object'){yield '{';let first=true;for(const[key,item]of Object.entries(value)){if(item===undefined)continue;if(!first)yield ',';first=false;yield JSON.stringify(key)+':';yield*jsonValue(item);}yield '}';return;}
 yield JSON.stringify(value)??'null';
}
async function* delimitedCell(value){
 if(value&&typeof value==='object'){yield '"';for await(const chunk of jsonValue(value))yield chunk.replaceAll('"','""');yield '"';return;}
 yield csvCell(value);
}
async function* delimitedRow(values,separator){for(let index=0;index<values.length;index++){if(index)yield separator;yield*delimitedCell(values[index]);}yield '\r\n';}
function resourcesFor(analysis){
 const tables=typeof analysis.tableManifests==='function'?analysis.tableManifests():[...analysis.rows("SELECT scope,json FROM result_manifests WHERE scope LIKE 'table:%' ORDER BY rowid")].map(row=>({...JSON.parse(row.json),id:row.scope.slice(6)}));
 return{tables:tables.map(item=>({kind:'table',id:item.id,scope:'table:'+item.id,manifest:item})),charts:(typeof analysis.chartManifests==='function'?analysis.chartManifests():analysis.chartManifests||[]).map(item=>({kind:'chart',id:item.id,scope:item.id,manifest:item}))};
}
const evidenceSource=(analysis,options)=>options.evidenceAnalysis||analysis;
function evidenceQuery(options){return {...(Array.isArray(options.evidenceIds)?{ids:options.evidenceIds}:{}),fullText:true};}
function emptyEvidence(options){return Array.isArray(options.evidenceIds)&&options.evidenceIds.length===0;}
async function evidenceCount(analysis,options){if(options.includeEvidence!==true||emptyEvidence(options))return 0;return Number(await evidenceSource(analysis,options).evidenceCount(evidenceQuery(options)));}
function rowOptions(resource,options){const selected=options.table||options.chartId;return selected===resource.id||selected===resource.scope||selected==='explorer:'+resource.id?{query:options.query||'',sortKey:options.sortKey,sortOrder:options.sortOrder,columns:options.columns,controls:options.controls}:{};}
async function* rawRows(analysis,resource,options={},originalOrder=false){check(options);let completed=0;const selected=options.table||options.chartId,allPopulations=originalOrder||options.format!=='tsv'||(selected!==resource.id&&selected!==resource.scope&&selected!=='explorer:'+resource.id);const query={...(resource.kind==='chart'?{allPopulations}:{}),...(originalOrder?{}:rowOptions(resource,options))};for await(const row of analysis.iterateRows(resource.scope,query)){check(options);yield row;if(++completed%128===0)await new Promise(resolve=>setImmediate(resolve));}}
function explorerRow(resource,row,includeLabels,neutral){const chart={...resource.manifest,rows:[cleanTransport(row)],contract:{},display:{}};return exportedExplorer({charts:[chart]},includeLabels,[],neutral).charts[0].rows[0];}
async function projectedRow(analysis,resource,row,index,options,neutral){
 if(options.exactTable===true)return withoutEvidenceReferences(cleanTransport(row));
 let value;if(resource.kind==='chart')value=explorerRow(resource,row,options.includeLabels===true,neutral);
 else{if(resource.id==='conversations')index=neutral.conversationOrdinal?.(row.id,index)??index;const permitted=options.includeEvidence===true&&!emptyEvidence(options)&&resource.id==='conversations'?await evidenceSource(analysis,options).hasEvidenceForConversation(row.id,evidenceQuery(options)):false;value=exportLegacyTableRow(resource.id,cleanTransport(row),index,{includeEvidence:resource.history?options.includeLabels===true:options.includeEvidence===true,evidenceConversation:permitted});}
 if(options.includeEvidence!==true)return withoutEvidenceReferences(value);
 if(resource.kind==='table'&&!resource.history&&resource.id!=='deduplication'&&!Object.hasOwn(value,'evidenceIds')&&row.evidenceKey&&typeof analysis.iterateEvidenceIds==='function')value.evidenceIds=streamArray(()=>analysis.iterateEvidenceIds(row.evidenceKey));
 return value;
}
function selectionFor(analysis,selection){
 const{sourceCount,sourceIdsPaged,snapshotCount,snapshotIdsPaged,collectionCount,collectionIdsPaged,conversationCount,...value}=selection||{};
 if(typeof analysis.selectionIds==='function')for(const[key,kind]of[['conversationIds','conversation'],['sourceIds','source'],['snapshotIds','snapshot'],['collectionIds','collection']])value[key]=streamArray(()=>analysis.selectionIds(kind));
 return value;
}
function headerEvidence(value,analysis,options){
 if(Array.isArray(value))return value.map(item=>headerEvidence(item,analysis,options));
 if(!value||typeof value!=='object')return value;
 const{rowId,evidenceKey,rankEvidenceKey,historyEvidence,...visible}=value,result={};for(const[key,item]of Object.entries(visible))result[key]=headerEvidence(item,analysis,options);
 if(options.includeEvidence===true&&evidenceKey&&!Object.hasOwn(result,'evidenceIds')&&typeof analysis.iterateEvidenceIds==='function')result.evidenceIds=streamArray(()=>analysis.iterateEvidenceIds(evidenceKey));
 return result;
}
async function prepare(analysis,options,dictionary){
 const history=analysis.metadata?.('kind')==='history-diff',tableOnly=options.format==='tsv';if(!history&&!tableOnly&&options.legacyCompatible!==true&&options.mode!=='legacy')await analysis.ensureAllCharts?.();
 const resources=resourcesFor(analysis),includeLabels=options.includeLabels===true,includeEvidence=options.includeEvidence===true;
 if(history)resources.charts=[];
 if(tableOnly){const selected=options.table||options.chartId;if(!selected)throw new TypeError('An analytical table is required.');resources.tables=resources.tables.filter(resource=>selected===resource.id||selected===resource.scope);resources.charts=resources.charts.filter(resource=>selected===resource.id||selected===resource.scope||selected==='explorer:'+resource.id);if(!resources.tables.length&&!resources.charts.length)throw new TypeError('Unknown analytical table.');}
 const header=analysis.header||analysis.metadata?.('header')||analysis.metadata?.('legacyHeader');if(!header)throw new TypeError('A completed analytical session is required.');
 const payload=headerEvidence(exportPayload({...header,tables:{},explorer:null,evidence:[]},options),analysis,options);delete payload.evidence;payload.selection=history?payload.selection:selectionFor(analysis,payload.selection);payload.privacy.includedEvidenceCount=await evidenceCount(analysis,options);
 if(history){const diff=analysis.metadata?.('historyDiff')||{};payload.application={...payload.application,analyticalSchemaVersion:diff.metricVersion||'capture-diff:2'};payload.selection={...payload.selection,captureComparison:{metricVersion:diff.metricVersion||'capture-diff:2',captures:diff.captures||{},tableCounts:diff.tableCounts||{}}};}
 const disclosures=payload.export.disclosures,plans=[];
 for(const entry of resources.tables){const resource={...entry,history};let count=0;const columns=new Set();for await(const raw of rawRows(analysis,resource,options,true)){if(resource.id==='conversations')dictionary.rememberConversation?.(raw.id,count);const row=await projectedRow(analysis,resource,raw,count++,options,dictionary);for(const key of Object.keys(row))columns.add(key);}const fields=options.exactTable===true&&Array.isArray(options.columns)&&options.columns.length?options.columns.filter(key=>columns.has(key)):[...columns];plans.push({...resource,count,columns:fields,rowColumns:fields});}
 let explorer=null;
 if(!history&&payload.export.mode!=='legacy-compatible'){
  const charts=[];for(const resource of resources.charts){if(resource.manifest.pending)throw Object.assign(new Error('An analytical chart has not been calculated for export.'),{code:'EXPORT_ANALYSIS_INCOMPLETE'});let count=0;const columns=new Set((resource.manifest.columns||[]).map(columnKey).filter(Boolean)),rowColumns=new Set();
   for await(const raw of rawRows(analysis,resource,options,true)){const row=await projectedRow(analysis,resource,raw,count,options,dictionary);count++;for(const key of Object.keys(row)){columns.add(key);rowColumns.add(key);}}
   const chart=exportedExplorer({charts:[{...resource.manifest,rows:[]}]},includeLabels,disclosures,dictionary).charts[0];chart.exactRowCount=count;charts.push(chart);const fields=options.exactTable===true?(Array.isArray(options.columns)&&options.columns.length?options.columns:(resource.manifest.columns||[]).map(columnKey)).filter(key=>rowColumns.has(key)):[...columns];plans.push({...resource,count,columns:fields.length?fields:[...rowColumns],rowColumns:[...rowColumns],projectedManifest:chart});
  }
  const source=header.explorer||{};explorer={versions:source.versions||analysis.metadata?.('explorerVersions')||{application:PRODUCT_VERSION,legacyMetrics:'1.0.0',explorerSchema:'2.0.0',metricAlgorithm:'explorer:2.0.0',filterSchema:'analytics-filters:1+explorer:2',reportSchema:'analytics-report:2'},generatedAt:source.generatedAt||header.generatedAt||null,filterStatus:source.filterStatus||analysis.filterStatus||'applied',unsupportedFilterKeys:source.unsupportedFilterKeys||analysis.unsupportedFilterKeys||[],filters:safeAppliedFilters(source.filters||header.filters||{},includeLabels,disclosures),warnings:withoutEvidenceReferences(source.warnings||analysis.warnings||[]),charts};payload.export.reportSchemaVersion='2.0.0';
 }
 return{payload,plans,explorer,analysis,options,dictionary};
}
async function* evidenceRows(plan){if(plan.options.includeEvidence!==true||emptyEvidence(plan.options))return;let completed=0;for await(const row of evidenceSource(plan.analysis,plan.options).iterateEvidence(evidenceQuery(plan.options))){check(plan.options);yield cleanTransport(row);if(++completed%128===0)await new Promise(resolve=>setImmediate(resolve));}}
async function* projectedRows(plan,resource){let index=0;for await(const row of rawRows(plan.analysis,resource,plan.options))yield await projectedRow(plan.analysis,resource,row,index++,plan.options,plan.dictionary);}
async function* streamJSON(plan){
 const p={...plan.payload,tables:{}};for(const resource of plan.plans)if(resource.kind==='table')p.tables[resource.id]=streamArray(()=>projectedRows(plan,resource));
 if(plan.explorer)p.explorer={...plan.explorer,charts:plan.explorer.charts.map(chart=>({...chart,rows:streamArray(()=>projectedRows(plan,plan.plans.find(resource=>resource.scope===chart.id)))}))};
 if(plan.options.includeEvidence===true)p.evidence=streamArray(()=>evidenceRows(plan));yield*jsonValue(p);yield '\n';
}
function chosen(plan,resource){const selected=plan.options.table||plan.options.chartId;return!selected||selected===resource.id||selected===resource.scope||selected==='explorer:'+resource.id;}
async function* streamDelimited(plan,separator){
 if(plan.options.exactTable===true){const selected=plan.plans.filter(resource=>chosen(plan,resource));if(selected.length!==1)throw new TypeError('A complete-table export must select exactly one table.');const resource=selected[0];yield*delimitedRow(resource.columns,separator);for await(const row of projectedRows(plan,resource))yield*delimitedRow(resource.columns.map(key=>row[key]),separator);return;}
 const p=plan.payload;yield '\ufeff';yield*delimitedRow(['ThreadShelf Local Analytics',p.application.version||PRODUCT_VERSION,'Analytical schema',p.application.analyticalSchemaVersion],separator);
 for(const key of['application','generatedAt','selection','filters','dateRange','coverage','definitions','privacy','export'])yield*delimitedRow([key,p[key]],separator);
 yield*delimitedRow(['summary'],separator);yield*delimitedRow(['metric','value'],separator);for(const[key,value]of Object.entries(p.summary))yield*delimitedRow([key,value],separator);
 if(p.previousPeriod)yield*delimitedRow(['previousPeriod',p.previousPeriod],separator);
 for(const resource of plan.plans.filter(item=>item.kind==='table')){if(!chosen(plan,resource))continue;yield*delimitedRow([],separator);yield*delimitedRow(['table',resource.id],separator);if(!resource.columns.length){yield*delimitedRow(['status','No eligible records'],separator);continue;}yield*delimitedRow(resource.columns,separator);for await(const row of projectedRows(plan,resource))yield*delimitedRow(resource.columns.map(key=>row[key]),separator);}
 if(plan.explorer){yield*delimitedRow([],separator);yield*delimitedRow(['explorerVersions',plan.explorer.versions],separator);yield*delimitedRow(['explorerAppliedFilters',plan.explorer.filters],separator);for(const resource of plan.plans.filter(item=>item.kind==='chart')){if(!chosen(plan,resource))continue;const chart=resource.projectedManifest;yield*delimitedRow([],separator);yield*delimitedRow(['table','explorer:'+resource.id],separator);yield*delimitedRow(['family',chart.family,'subview',chart.subview],separator);yield*delimitedRow(['contract',chart.contract],separator);yield*delimitedRow(['display',chart.display],separator);if(!resource.columns.length){yield*delimitedRow(['status','No eligible records'],separator);continue;}yield*delimitedRow(resource.columns,separator);for await(const row of projectedRows(plan,resource))yield*delimitedRow(resource.columns.map(key=>row[key]),separator);}}
 if(plan.options.includeEvidence===true){const columns=new Set();for await(const row of evidenceRows(plan))for(const key of Object.keys(row))columns.add(key);yield*delimitedRow([],separator);yield*delimitedRow(['table','explicitEvidence'],separator);yield*delimitedRow([...columns],separator);for await(const row of evidenceRows(plan))yield*delimitedRow([...columns].map(key=>row[key]),separator);}
}
async function* htmlTableRows(plan,resource,t){
 if(!resource.count){yield '<p class="unavailable">'+escapeHtml(t('emptyPopulation'))+'</p>';return;}
 const columns=(resource.rowColumns||resource.columns).filter(key=>key!=='evidenceIds');yield '<div class="table-scroll"><table><thead><tr>'+columns.map(key=>'<th scope="col">'+escapeHtml(localizedHeading(key,t))+'</th>').join('')+'</tr></thead><tbody>';
 for await(const row of projectedRows(plan,resource)){yield '<tr>';for(const key of columns){yield '<td>';const value=row[key];if(value?.[ARRAY]){for await(const chunk of jsonValue(value))yield escapeHtml(chunk);}else yield escapeHtml(renderValue(value,t));yield '</td>';}yield '</tr>';}
 yield '</tbody></table></div>';
}
async function* streamHTML(plan){
 const options=plan.options,language=options.language||plan.payload.filters.language||'en',t=localizedTranslator(language),p={...plan.payload,tables:{},...(plan.explorer?{explorer:{...plan.explorer,charts:plan.explorer.charts.map(chart=>({...chart,rows:[]}))}}:{})};
 const markers=[];p.selection={...p.selection};if(typeof plan.analysis.selectionIds==='function')for(const[key,kind]of[['sourceIds','source'],['snapshotIds','snapshot']]){const marker='STREAM_SCOPE_'+randomBytes(16).toString('hex');p.selection[key]=marker;markers.push({marker,kind});}else p.selection={...p.selection,sourceIds:plan.analysis.header.selection?.sourceIds||[],snapshotIds:plan.analysis.header.selection?.snapshotIds||[]};
 const fragment=async function*(text){let at=0;for(;;){let next=null,index=-1;for(const item of markers){const found=text.indexOf(item.marker,at);if(found>=0&&(index<0||found<index)){index=found;next=item;}}if(index<0){yield text.slice(at);return;}yield text.slice(at,index);for await(const chunk of jsonValue(streamArray(()=>plan.analysis.selectionIds(next.kind))))yield escapeHtml(chunk);at=index+next.marker.length;}};
 const targets=[];let tableIndex=0;for(const resource of plan.plans.filter(r=>r.kind==='table')){p.tables[resource.id]=[];targets.push({resource,id:'table-'+tableIndex+++'-'+resource.id.replace(/[^a-zA-Z0-9_-]/g,'-')});}
 let chartIndex=0;for(const resource of plan.plans.filter(r=>r.kind==='chart'))targets.push({resource,id:'explorer-'+chartIndex++});if(options.includeEvidence===true)p.evidence=[];
 const skeleton=renderPayloadHTML(p,options);let position=0;
 for(const target of targets){const start=skeleton.indexOf('<section id="'+target.id+'">',position);if(start<0)throw new Error('Report HTML section could not be located.');const end=skeleton.indexOf('</section>',start)+10;if(end<10)throw new Error('Report HTML section is incomplete.');yield*fragment(skeleton.slice(position,start));const resource=target.resource,title=localizedHeading(resource.kind==='table'?resource.id:resource.projectedManifest.titleKey||resource.id,t);yield '<section id="'+target.id+'"><h2>'+escapeHtml(title)+'</h2>';
  if(resource.kind==='table'&&['platforms','models','composition','codeLanguages'].includes(resource.id)){const bars=[];for await(const row of projectedRows(plan,resource)){bars.push(row);if(bars.length===16)break;}yield barChart(bars,title);}
  if(resource.kind==='chart'){const chart=resource.projectedManifest;for(const[key,value]of[['metricContract',chart.contract],['displayDisclosures',chart.display]])yield '<h3>'+escapeHtml(t(key))+'</h3>'+reportContractHTML(value,t);}
  yield*htmlTableRows(plan,resource,t);yield '</section>';position=end;
 }
 if(options.includeEvidence===true){const start=skeleton.indexOf('<section id="evidence">',position),end=start<0?-1:skeleton.indexOf('</section>',start)+10;if(start>=0){yield*fragment(skeleton.slice(position,start));yield '<section id="evidence"><h2>'+escapeHtml(t('evidence'))+'</h2><p>'+escapeHtml(t('includeEvidence'))+'</p>';for await(const row of evidenceRows(plan))yield reportEvidenceHTML(row,t);yield '</section>';position=end;}}
 yield*fragment(skeleton.slice(position));
}

async function* buffered(chunks,options){
 const target=65536;let pending='';for await(const chunk of chunks){check(options);let offset=0;while(offset<chunk.length){let end=Math.min(chunk.length,offset+target-pending.length);if(end<chunk.length&&end>offset&&chunk.charCodeAt(end-1)>=0xd800&&chunk.charCodeAt(end-1)<=0xdbff&&chunk.charCodeAt(end)>=0xdc00&&chunk.charCodeAt(end)<=0xdfff)end--;if(end===offset){if(pending){yield pending;pending='';continue;}end=Math.min(chunk.length,offset+2);}pending+=chunk.slice(offset,end);offset=end;if(pending.length>=target-1){yield pending;pending='';}}}if(pending)yield pending;
}
export async function* streamAnalysisReport(analysis,options={}){
 const format=options.format||'json';if(!['json','csv','html','tsv'].includes(format))throw new TypeError('Unsupported report format.');check(options);const directory=await fs.mkdtemp(path.join(options.exportWorkDirectory||os.tmpdir(),'threadshelf-report-policy-'));let db;
 try{db=new DatabaseSync(path.join(directory,'labels.sqlite'));db.exec('PRAGMA journal_mode=OFF;PRAGMA synchronous=OFF;PRAGMA temp_store=FILE;PRAGMA cache_size=-4096;CREATE TABLE labels(id INTEGER PRIMARY KEY,value TEXT NOT NULL UNIQUE);CREATE TABLE conversation_labels(value TEXT PRIMARY KEY,ordinal INTEGER NOT NULL) WITHOUT ROWID;');const find=db.prepare('SELECT id FROM labels WHERE value=?'),put=db.prepare('INSERT OR IGNORE INTO labels(value) VALUES(?)');
  const neutral=value=>{if(value==null||value==='')return value;const key=String(value);let row=find.get(key);if(!row){put.run(key);row=find.get(key);}return'Label '+row.id;};
  const remember=db.prepare('INSERT OR IGNORE INTO conversation_labels VALUES(?,?)'),conversation=db.prepare('SELECT ordinal FROM conversation_labels WHERE value=?');neutral.rememberConversation=(id,index)=>remember.run(String(id),index);neutral.conversationOrdinal=(id,fallback)=>conversation.get(String(id))?.ordinal??fallback;
  const plan=await prepare(analysis,options,neutral),chunks=format==='json'?streamJSON(plan):format==='html'?streamHTML(plan):streamDelimited(plan,format==='tsv'?'\t':',');yield*buffered(chunks,options);
 }finally{try{db?.close();}finally{await fs.rm(directory,{recursive:true,force:true});}}
}
export async function* streamOwnedReport({storage,selection,signal,onProgress,exportWorkDirectory}={}){
 if(!selection?.reportId)throw new TypeError('A committed analysis identity is required for report export.');const{openAnalysis}=await import('./disk-analysis.mjs');let analysis,evidenceAnalysis,work;try{if(selection.includeEvidence===true&&selection.evidenceContext){const{openEvidenceExportContext}=await import('./evidence-export-context.mjs');evidenceAnalysis=await openEvidenceExportContext(storage,selection.evidenceContext,{signal});}if(!exportWorkDirectory)work=await storage.newWork();analysis=await openAnalysis(storage,selection.reportId,{writable:true,signal,onProgress});yield*streamAnalysisReport(analysis,{...selection,evidenceAnalysis,signal,onProgress,exportWorkDirectory:exportWorkDirectory||work.path});}finally{try{evidenceAnalysis?.close();analysis?.close();}finally{if(work)await storage.removeWork(work.name);}}
}
