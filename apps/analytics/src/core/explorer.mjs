import {PRODUCT_VERSION} from './storage-versions.mjs';
import {applyFilters} from './metrics.mjs';
import {buildExplorerA} from './explorer-a.mjs';
import {buildExplorerB} from './explorer-b.mjs';

export const EXPLORER_SCHEMA_VERSION='2.0.0';
export const METRIC_ALGORITHM_VERSION='explorer:2.0.0';
export const FILTER_SCHEMA_VERSION='analytics-filters:1+explorer:2';
export const REPORT_SCHEMA_VERSION='analytics-report:2';
function annotated(filters,annotations={}){
 return {...filters,aliases:filters.aliases||annotations.dedupAliases||{},excludedConversationIds:filters.excludedConversationIds||annotations.exclusions||[],modelFamilyAliases:filters.modelFamilyAliases||annotations.modelFamilyAliases||{}};
}
/** Pure deterministic full-population tables. Evidence sets stay in the worker. */
export function buildExplorerReport(conversations=[],filters={},annotations={},options={}){
 const applied=annotated(filters,annotations),selected=applyFilters(conversations,applied,options);
 const shared={...options,originalConversations:conversations,comparisonA:options.comparisonFiltersA?applyFilters(conversations,annotated(options.comparisonFiltersA,annotations),options):null,comparisonB:options.comparisonFiltersB?applyFilters(conversations,annotated(options.comparisonFiltersB,annotations),options):null};
 const a=buildExplorerA(selected,shared),b=buildExplorerB(selected,shared);
 const evidenceIndex=new Map([...(a.evidenceIndex||[]),...(b.evidenceIndex||[])]);
 const charts=[...(a.charts||[]),...(b.charts||[])];
 for(const chart of charts){
  chart.contract={filterScope:selected.filters,branchPolicy:selected.filters.branch,perspective:selected.filters.perspective,dateBasis:selected.filters.timeBasis,timeZone:selected.dateRange.zone,algorithmVersion:METRIC_ALGORITHM_VERSION,normalizedSchemaVersions:[...new Set(conversations.map(c=>c.schemaVersion||'legacy:1'))],sourceIds:[...new Set(selected.conversations.map(c=>c.sourceId||c.sourceInstanceId).filter(Boolean))],...chart.contract};
  chart.exactRowCount=chart.rows?.length||0;
 }
 return {charts,evidenceIndex,filters:selected.filters,warnings:selected.warnings,filterStatus:selected.filterStatus,unsupportedFilterKeys:selected.unsupportedFilterKeys,versions:{application:PRODUCT_VERSION,legacyMetrics:'1.0.0',explorerSchema:EXPLORER_SCHEMA_VERSION,metricAlgorithm:METRIC_ALGORITHM_VERSION,filterSchema:FILTER_SCHEMA_VERSION,reportSchema:REPORT_SCHEMA_VERSION},generatedAt:new Date(options.now??Date.now()).toISOString()};
}
/** Original wording is returned only for an explicit evidence request. */
export function resolveExplorerEvidence(explorer,conversations,{chartId,evidenceKey,rowIndex=0,offset=0,limit=100}={}){
 const chart=explorer?.charts?.find(c=>c.id===chartId),row=chart?.rows?.[rowIndex];
 const key=evidenceKey||row?.evidenceKey,stored=explorer?.evidenceIndex?.get(key),entries=typeof stored==='function'?stored():typeof stored?.resolve==='function'?stored.resolve():stored;
 const identifiers=new Set(entries instanceof Set?entries:Array.isArray(entries)?entries:entries?.recordIds||entries?.ids||[]);
 const found=[];
 for(const c of conversations||[])for(const r of c.records||[]){
  if(!identifiers.has(r.id)&&!identifiers.has(c.id))continue;
  found.push({id:r.id,recordId:r.id,conversationId:c.id,title:c.title,provider:c.provider,model:r.model,category:r.category,text:r.observed===false||r.category==='redacted'?null:r.text,textTruncated:r.textExcerpt===true,fullTextCharacters:r.explorerAnalysis?.characters??r.contentAnalysis?.characters??null,date:r.timestamp,day:r.dateValue,datePrecision:r.datePrecision,sourceId:c.sourceId||c.sourceInstanceId,snapshotId:c.snapshotId,sourceFormat:c.format,classification:r.coverage,provenance:r.rawPath,timeProvenance:r.timeProvenance,logicalId:r.logicalId,objectId:r.objectId,selected:r.selected!==false,reason:row?.reason||chart?.contract?.evidenceSelectionRule||'Exact contributing observation',event:r.event||null,attachments:r.attachments||[],references:r.references||[]});
 }
 const start=Math.max(0,Math.floor(offset)),size=Math.max(1,Math.min(100,Math.floor(limit)));
 return {total:found.length,offset:start,limit:size,evidence:found.slice(start,start+size).map(e=>({...e,text:typeof e.text==='string'?e.text.slice(0,20000):null,textTruncated:e.textTruncated||(typeof e.text==='string'&&e.text.length>20000)})),contract:chart?.contract||null,row:row||null};
}
