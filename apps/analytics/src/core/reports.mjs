import {PRODUCT_VERSION} from './storage-versions.mjs';
/** Report serializers accept one committed buildReport result, never filter drafts. */
import {translator,dictionaries} from '../ui/i18n.mjs';
import {safeMarkdownHTML,SAFE_MARKDOWN_CSS,SAFE_MARKDOWN_VERSION} from './safe-markdown.mjs';
import {highlighter,normalizeCodeLanguage} from '../ui/highlight.js';
import {CODE_THEMES} from '../ui/themes.mjs';
import {SUPPORTED_FILTER_KEYS} from './metrics.mjs';
const list = v => Array.isArray(v)?v:[];
export const escapeHtml = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function renderValue(v,t=translator('en')) {return v==null?t('unavailable'):typeof v==='object'?JSON.stringify(v):String(v);}
/** Drop potentially large drilldown lists before traversing their contents. Numerical cells stay exact. */
function withoutEvidenceReferences(value) {
  if(Array.isArray(value))return value.map(withoutEvidenceReferences);
  if(value&&typeof value==='object'){
    const out={};for(const [key,item] of Object.entries(value))if(!['evidenceIds','evidenceIndex','evidenceKey','rankEvidenceKey','recordIds','contributingIds','missingIds'].includes(key))out[key]=withoutEvidenceReferences(item);
    return out;
  }
  return value;
}
const privateField=/^(?:prompt|promptText|promptWording|text|title|excerpt|rawPath|sourcePath|path|filename|fileName|url|fullUrl|href|query|freeTextLabel)$/i;
function safeAppliedFilters(filters,includeLabels,disclosures) {
  const result={...filters};
  if(!includeLabels){delete result.displayAliases;
    for(const key of ['search','query','promptText','tokenTerm','freeTextLabel'])if(Object.hasOwn(result,key)){
      const original=result[key];delete result[key];result[key+'Applied']=original!=null&&String(original).length>0;
      disclosures.push('Applied '+key+' wording is omitted; the exported population still reflects that filter.');
    }
    for(const key of Object.keys(filters||{}))if(!SUPPORTED_FILTER_KEYS.has(key)&&!['search','query','promptText','tokenTerm','freeTextLabel'].includes(key)){
      result[key]={status:'unapplied',valueOmitted:true};
      disclosures.push('Unsupported filter '+key+': original values are omitted; this version did not apply them.');
    }
  }
  return result;
}
function exportedExplorer(explorer,includeLabels,disclosures) {
  if(!explorer||!Array.isArray(explorer.charts))return null;
  const labels=new Map();
  const neutral=(value)=>{if(value==null||value==='')return value;const key=String(value);if(!labels.has(key))labels.set(key,'Label '+(labels.size+1));return labels.get(key);};
  const metadata=value=>{
    if(Array.isArray(value))return value.map(metadata);
    if(value&&typeof value==='object'){
      const out={};for(const [key,item] of Object.entries(value)){
        if(['evidenceIds','evidenceIndex','evidenceKey','rankEvidenceKey','recordIds','contributingIds','missingIds'].includes(key))continue;
        if(!includeLabels&&key==='displayAliases')continue;
        if(['filters','filterScope','filtersA','filtersB','comparisonFiltersA','comparisonFiltersB'].includes(key)&&item&&typeof item==='object'&&!Array.isArray(item)){out[key]=safeAppliedFilters(item,includeLabels,disclosures);continue;}
        if(!includeLabels&&['search','query','promptText','tokenTerm','freeTextLabel'].includes(key)){out[key+'Applied']=item!=null&&String(item).length>0;continue;}
        if(!includeLabels&&privateField.test(key)&&typeof item==='string'){out[key]=neutral(item);continue;}
        out[key]=metadata(item);
      }return out;
    }return value;
  };
  const charts=explorer.charts.map(chart=>{
    const privateColumns=new Set(list(chart.privateColumns));
    for(const column of list(chart.columns))if(column&&typeof column==='object'&&column.privacy==='private')privateColumns.add(column.key);
    const rows=list(chart.rows).map(row=>{
      const result={};for(const [key,value] of Object.entries(row||{})){
        if(['evidenceIds','evidenceKey','rankEvidenceKey','recordIds','contributingIds','missingIds'].includes(key))continue;
        const conditionalPrivate=!chart.privateColumnCondition||Object.entries(chart.privateColumnCondition).every(([field,expected])=>row[field]===expected);
        if(!includeLabels&&(privateColumns.has(key)&&conditionalPrivate||privateField.test(key)))result[key]=Array.isArray(value)?value.map(neutral):neutral(value);
        else result[key]=withoutEvidenceReferences(value);
      }return result;
    });
    if(!includeLabels&&privateColumns.size)disclosures.push('Chart '+String(chart.id)+': private categorical labels are replaced by consistent neutral labels.');
    return {id:chart.id,family:chart.family,subview:chart.subview,titleKey:chart.titleKey,columns:chart.columns,rows,exactRowCount:rows.length,contract:metadata(chart.contract||{}),display:metadata(chart.display||{}),privateColumns:[...privateColumns],privateColumnCondition:chart.privateColumnCondition,labelsIncluded:includeLabels};
  });
  return {versions:explorer.versions||{},generatedAt:explorer.generatedAt||null,filterStatus:explorer.filterStatus||'applied',unsupportedFilterKeys:explorer.unsupportedFilterKeys||[],filters:safeAppliedFilters(explorer.filters||{},includeLabels,disclosures),warnings:withoutEvidenceReferences(explorer.warnings||[]),charts};
}
/** Spreadsheet formulas are neutralized only for textual values; numeric negatives remain numbers. */
export function csvCell(value) {
  let text=value==null?'':typeof value==='object'?JSON.stringify(value):String(value);
  if(typeof value!=='number'&&/^[\s\u0000-\u001f]*[=+\-@]/u.test(text))text="'"+text;
  return '"'+text.replace(/"/g,'""')+'"';
}
/** Exports default to aggregate/observed-number tables; private texts/titles require opt-in. */
export function exportPayload(report,options={}) {
  if(!report||typeof report!=='object'||!report.application||!report.filters)throw new TypeError('A complete applied analytical report is required.');
  const includeEvidence=options.includeEvidence===true,includeLabels=options.includeLabels===true;
  const legacyCompatible=options.legacyCompatible===true||options.mode==='legacy';
  const disclosures=[];
  const allowedIds=options.evidenceIds?new Set(options.evidenceIds):null;
  const includedEvidence=includeEvidence?list(report.evidence).filter(e=>!allowedIds||allowedIds.has(e.id)):[];
  const evidenceConversations=new Set(includedEvidence.map(e=>e.conversationId));
  const tables={};
  for(const [key,values] of Object.entries(report.tables||{})) {
    tables[key]=list(values).map((row,index)=>{
      const next={...row};
      if(!includeEvidence || key==='conversations'&&!evidenceConversations.has(next.id)){delete next.title;delete next.text;delete next.provenance;delete next.rawPath;
        if(key==='conversations')next.label=`Conversation ${index+1}`;
        if(key==='quality')next.reason=next.reason?String(next.reason).replace(/(?:[A-Za-z]:[\\/]|\/(?:home|mnt|workspace|Users)\/)[^\s]+/g,'[source location omitted]'):next.reason;
      }
      return next;
    });
  }
  const selection={...report.selection};
  if(selection.sourceScope){
    const safeScope=scope=>{const out={};for(const k of ['id','kind','sourceId','snapshotId','capturedAt','commitId','generation','state','complete','stale','coverage'])if(scope&&scope[k]!=null)out[k]=scope[k];return out;};
    selection.sourceScope=Array.isArray(selection.sourceScope)?selection.sourceScope.map(safeScope):safeScope(selection.sourceScope);
  }
  const exportedFilters=safeAppliedFilters(report.filters,includeLabels||includeEvidence,disclosures);
  const previousPeriod=report.previousPeriod?{...report.previousPeriod,filters:{...report.previousPeriod.filters}}:null;
  if(previousPeriod)previousPeriod.filters=safeAppliedFilters(previousPeriod.filters,includeLabels||includeEvidence,disclosures);
  const explorer=legacyCompatible?null:exportedExplorer(report.explorer,includeLabels,disclosures);
  if(legacyCompatible)disclosures.push('Legacy-compatible export preserves supported 1.0 analytical meanings and omits all Explorer additions; this is neither a lossless downgrade nor an application-state backup.');
  const payload={application:report.application,generatedAt:report.generatedAt,selection,filters:exportedFilters,dateRange:report.dateRange,summary:report.summary,coverage:report.coverage,definitions:report.definitions,tables,warnings:report.warnings||[],previousPeriod,export:{mode:legacyCompatible?'legacy-compatible':'current',reportSchemaVersion:explorer?'2.0.0':'1.0.0',safeMarkdownVersion:SAFE_MARKDOWN_VERSION,disclosures},privacy:{mode:includeEvidence?'Explicit evidence inclusion':'Aggregates; conversation text and titles excluded',includedEvidenceCount:includeEvidence?includedEvidence.length:0,newPrivateLabelsIncluded:includeLabels,legacyCategoryLabels:'Original model/provider/domain/declared-language/attachment/filter categorical labels may remain in 1.0 tables; aggregate exports are not anonymous.',privateFilterWordingOmitted:!includeLabels&&!includeEvidence}};
  if(explorer)payload.explorer=explorer;
  if(includeEvidence)payload.evidence=includedEvidence;
  return includeEvidence?payload:withoutEvidenceReferences(payload);
}
export function reportJSON(report,options={}) {return JSON.stringify(exportPayload(report,options),null,2)+'\n';}
/** One RFC4180 section per table. Metadata and definitions precede exact chart tables. */
export function reportCSV(report,options={}) {
  const payload=exportPayload(report,options);const lines=[];
  const row=values=>lines.push(values.map(csvCell).join(','));
  row(['ThreadShelf Local Analytics',payload.application.version||PRODUCT_VERSION,'Analytical schema',payload.application.analyticalSchemaVersion]);
  for(const key of ['application','generatedAt','selection','filters','dateRange','coverage','definitions','privacy','export'])row([key,payload[key]]);
  row(['summary']);row(['metric','value']);for(const [key,value] of Object.entries(payload.summary))row([key,value]);
  if(payload.previousPeriod){row(['previousPeriod',payload.previousPeriod]);}
  const selectedTable=options.table;
  for(const [key,values] of Object.entries(payload.tables)) {
    if(selectedTable&&selectedTable!==key)continue;
    row([]);row(['table',key]);
    const columns=[...new Set(values.flatMap(r=>Object.keys(r)))];
    if(!columns.length){row(['status','No eligible records']);continue;}
    row(columns);for(const value of values)row(columns.map(c=>value[c]));
  }
  if(payload.explorer){row([]);row(['explorerVersions',payload.explorer.versions]);row(['explorerAppliedFilters',payload.explorer.filters]);
    for(const chart of payload.explorer.charts){
      if(selectedTable&&selectedTable!==chart.id&&selectedTable!=='explorer:'+chart.id)continue;
      row([]);row(['table','explorer:'+chart.id]);row(['family',chart.family,'subview',chart.subview]);row(['contract',chart.contract]);row(['display',chart.display]);
      const columns=[...new Set([...list(chart.columns).map(c=>typeof c==='string'?c:c.key),...chart.rows.flatMap(r=>Object.keys(r))])].filter(Boolean);
      if(!columns.length){row(['status','No eligible records']);continue;}
      row(columns);for(const item of chart.rows)row(columns.map(c=>item[c]));
    }
  }
  if(payload.evidence){row([]);row(['table','explicitEvidence']);const columns=[...new Set(payload.evidence.flatMap(r=>Object.keys(r)))];row(columns);for(const e of payload.evidence)row(columns.map(c=>e[c]));}
  return '\ufeff'+lines.join('\r\n')+'\r\n';
}
const humanize = key => key.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/_/g,' ').replace(/^./,c=>c.toUpperCase());
const headingKeys={timelineDaily:'daily',timelineWeekly:'weekly',timelineMonthly:'monthly',hour:'hourly',weekday:'weekdays',dateModel:'modelTimeline',datePlatform:'platformTimeline',rollingAverage:'rolling',codeLanguages:'languages',lengthDistribution:'lengths',repeatedPrompts:'repeated',tools:'toolNames',toolAssociations:'eventSequences',toolOutputs:'tool-output',toolIndicators:'indicator',searchEvents:'eventSequences',durations:'timing',quality:'diagnostics',deduplication:'provenance',userMessages:'user',responseMessages:'response',thinkingSegments:'thinking',toolCalls:'tool-call',codeBlocks:'code',collectionMemberships:'memberships',label:'title',eligiblePopulation:'scope',countingUnit:'unit',timeBasis:'timestamp',branchPolicy:'branches',filterScope:'filters',derivation:'definition',interactionDepth:'depth',retainedAlternatives:'alternatives',logicalMessages:'records',selectedSegments:'selected',allRetainedSegments:'allBranches',model:'model',modelFamilies:'modelFamilies',sourceId:'sources',conversationId:'conversations',evidenceIds:'evidence',category:'categories',timestamp:'timestamp',datePrecision:'precision',milliseconds:'timing',unit:'unit',scope:'scope',available:'recorded',total:'records',percent:'coverage',explanation:'definition',minimum:'value',maximum:'value',mean:'value',median:'value',p90:'value',count:'count',value:'value',provider:'platform',format:'formats',selected:'selected',reliability:'reliability',capability:'capabilities',dimension:'kind',reason:'definition'};
Object.assign(headingKeys,{messages:'records',timestamps:'timestamp',hourOfDay:'hourly',text:'textLength',originalRecords:'normalizedCoverage',thinkingResponseRatio:'thinkingRatio',attachmentSize:'recordedSize',attachmentAvailability:'attachments',knownSizeCount:'recordedSize',recordedBytes:'recordedSize',logicalId:'annotationTarget',objectId:'objects',originalObjectId:'objects',depthUnit:'unit',retainedAlternativeNodes:'alternatives',outputCount:'tool-output',key:'sourceId',id:'sourceId',selectedPopulation:'scope',weight:'perspective',availability:'status',scopeDifferences:'scope',current:'selectionA',previous:'selectionB',percentageChange:'change',originalValue:'value',originalUnit:'unit',from:'selectionA',to:'selectionB',matchingRule:'definition',classification:'original',timeProvenance:'provenance',modelProvenance:'provenance',nodeId:'sourceId',parentId:'sourceId'});
const reportLocaleRows=`
analyticalReport|Analytical report|Elemzési jelentés|Analysebericht|Rapport analytique|分析レポート
modelDevelopers|Recorded model developers|Rögzített modellfejlesztők|Erfasste Modellentwickler|Développeurs de modèles enregistrés|記録されたモデル開発元
thinkingRepresentations|Exported thinking representations|Exportált gondolatmenet-ábrázolások|Exportierte Denkdarstellungen|Représentations de réflexion exportées|エクスポートされた思考の表現
contextOccupancy|Recorded context occupancy|Rögzített kontextusfoglaltság|Erfasste Kontextbelegung|Occupation du contexte enregistrée|記録されたコンテキスト占有量
recordedHelp|Recorded means supplied by the source, not independently verified.|A rögzített adat a forrásból származik, nem független ellenőrzésből.|Erfasst bedeutet von der Quelle geliefert, nicht unabhängig geprüft.|Enregistré signifie fourni par la source, sans vérification indépendante.|記録済みとはソースに含まれることであり、独立した検証済みという意味ではありません。
adapterVersions|Adapter versions|Adapterverziók|Adapterversionen|Versions des adaptateurs|アダプターの版
minimum|Minimum|Minimum|Minimum|Minimum|最小値
maximum|Maximum|Maximum|Maximum|Maximum|最大値
mean|Mean|Átlag|Mittelwert|Moyenne|平均値
median|Median|Medián|Median|Médiane|中央値
p90|90th percentile|90. percentilis|90. Perzentil|90e percentile|90パーセンタイル
logicalBoundary|Distinct recorded logical message identities; missing boundaries are not invented.|Külön rögzített logikai üzenetazonosítók; a hiányzó határokat nem találjuk ki.|Eindeutige erfasste logische Nachrichtenidentitäten; fehlende Grenzen werden nicht erfunden.|Identités logiques distinctes enregistrées ; les limites absentes ne sont pas inventées.|記録済みの論理メッセージ識別子を重複なく数え、欠落した境界は作りません。
attachmentBytes|Explicit recorded byte sizes only; attachment token size is not request usage.|Csak rögzített bájtméret; a melléklet tokenmérete nem kéréshasználat.|Nur explizit erfasste Bytegrößen; Anhangstoken sind keine Anfragenutzung.|Tailles en octets explicites uniquement ; les jetons d’un fichier ne sont pas la consommation d’une requête.|明示されたバイト数のみです。添付のトークン数をリクエスト使用量にしません。
traceRule|Original exported traces, summary-only thinking and unavailable representations remain separate.|Az eredeti exportált nyomok, összefoglalók és hiányzó gondolatmenetek külön maradnak.|Original exportierte Denkspuren, reine Zusammenfassungen und fehlende Darstellungen bleiben getrennt.|Les traces originales, les résumés seuls et les représentations absentes restent distincts.|元の思考トレース、要約のみ、利用不可の表現を分けます。
usageRule|Verified scope and original fields are preserved; overlapping usage fields are never added into a fabricated total.|A hitelesített hatókör és eredeti mezők megmaradnak; az átfedő használati mezőkből nem készül kitalált összeg.|Geprüfter Umfang und Originalfelder bleiben erhalten; überlappende Nutzungsfelder werden nicht zu einer erfundenen Summe addiert.|La portée validée et les champs originaux sont conservés ; les champs qui se chevauchent ne sont pas additionnés en un total fictif.|確認できた範囲と元の項目を保持し、重複する使用量項目から架空の合計を作りません。
indicatorRule|Scoped recorded calls and outputs are separate from exported tool indicators; indicators do not prove invocations.|A hatókörrel rendelkező hívások és kimenetek különböznek az eszközjelzésektől; a jelzés nem bizonyít hívást.|Erfasste Aufrufe und Ausgaben sind von Werkzeughinweisen getrennt; Hinweise beweisen keinen Aufruf.|Les appels et sorties enregistrés sont distincts des indicateurs ; un indicateur ne prouve pas une invocation.|範囲を持つ記録済み呼び出しと出力を表示情報と分けます。表示情報は呼び出しの証明ではありません。
emptyPopulation|No eligible records in this selection.|Nincs jogosult rekord ebben a kiválasztásban.|Keine geeigneten Datensätze in dieser Auswahl.|Aucun enregistrement éligible dans cette sélection.|この選択に対象の記録はありません。
endExclusive|End exclusive|Záró határ nélkül|Ende ausgeschlossen|Fin exclue|終端を含まない
calendarComparisonRule|Calendar comparisons preserve local boundaries across daylight-saving transitions.|A naptári összehasonlítás megőrzi a helyi napok határát óraátállításkor is.|Kalendervergleiche bewahren lokale Tagesgrenzen bei Sommerzeitwechseln.|Les comparaisons calendaires conservent les limites locales lors des changements d’heure.|暦による比較では夏時間の変更時にも現地の日付境界を保持します。
explorerReport|Explorer exact data|Explorer pontos adatok|Explorer: exakte Daten|Données exactes de l’Explorer|Explorer の正確なデータ
metricContract|Counting and coverage contract|Számlálási és lefedettségi szabályok|Zähl- und Abdeckungsregeln|Règles de comptage et de couverture|集計とカバレッジの規則
displayDisclosures|Display and aggregation disclosures|Megjelenítési és összesítési tájékoztatás|Darstellungs- und Aggregationshinweise|Informations sur l’affichage et l’agrégation|表示と集計に関する情報
reportMetadata|Version and report metadata|Verzió és jelentésmetaadatok|Versions- und Berichtsmetadaten|Métadonnées de version et de rapport|版とレポートのメタデータ
imageOmitted|Image omitted|Kép kihagyva|Bild ausgelassen|Image omise|画像は省略
blockedLink|Unavailable link|Nem elérhető hivatkozás|Nicht verfügbarer Link|Lien indisponible|利用できないリンク
markdownTruncated|Display excerpt truncated; copy retains the original source.|A megjelenített részlet csonkolva; a másolás az eredeti forrást őrzi meg.|Anzeigeauszug gekürzt; Kopieren bewahrt den Originaltext.|Extrait affiché tronqué ; la copie conserve la source originale.|表示は抜粋です。コピーは元のソースを保持します。
legacyCompatibleReport|Legacy-compatible report: supported 1.0 meanings; Explorer additions omitted.|Korábbi verzióval kompatibilis jelentés: támogatott 1.0 jelentések; Explorer-kiegészítések nélkül.|Altformat-kompatibler Bericht: unterstützte 1.0-Bedeutungen; ohne Explorer-Erweiterungen.|Rapport compatible avec l’ancienne version : mesures 1.0 prises en charge, sans ajouts Explorer.|旧版互換レポート：対応する 1.0 の意味を保持し、Explorer の追加項目を省略します。
privateLabelReport|New private labels are neutral unless explicitly included. Legacy categorical labels can be sensitive.|Az új privát címkék semlegesek, kivéve kifejezett hozzáadáskor. A korábbi kategóriacímkék érzékenyek lehetnek.|Neue private Beschriftungen bleiben ohne ausdrückliche Auswahl neutral. Bisherige Kategorienamen können sensibel sein.|Les nouveaux libellés privés sont neutres sauf inclusion explicite. Les catégories historiques peuvent être sensibles.|新しい非公開ラベルは明示的に含めるまで中立です。旧版のカテゴリ名には機密情報が含まれる場合があります。
truncatedEvidence|Evidence excerpt; original full-text measurements remain unchanged.|Bizonyítékrészlet; az eredeti teljes szöveg mérései változatlanok.|Belegauszug; Messungen des vollständigen Originaltexts bleiben unverändert.|Extrait de preuve ; les mesures du texte original complet restent inchangées.|根拠は抜粋です。元の全文の測定値は変わりません。
`;
const reportLocales=Object.fromEntries(['en','hu','de','fr','ja'].map(l=>[l,{}]));
for(const line of reportLocaleRows.trim().split('\n')){const [key,...v]=line.split('|');['en','hu','de','fr','ja'].forEach((l,i)=>reportLocales[l][key]=v[i]);}
function localizedTranslator(language){const common=translator(language),extra=reportLocales[language]||reportLocales.en;return key=>extra[key]||common(key);}
function localizedHeading(key,t) {if(reportLocales.en[key])return t(key);const translation=t(headingKeys[key]||key);return translation===(headingKeys[key]||key)?humanize(key):translation;}
const coverageHelpKeys={timestamps:['activityHelp','datePrecisionHelp'],hourOfDay:['datePrecisionHelp'],models:['modelsHelp','originalModel'],platforms:['modelsHelp','originalPlatform'],logicalMessages:['logicalBoundary'],objects:['objects','sourceNative'],text:['lengthRule','noThinking'],thinkingTrace:['traceRule','noThinking'],thinkingResponseRatio:['traceRule','noThinking','characterRatio'],attachmentSize:['attachmentBytes'],attachmentAvailability:['bytesUnavailable','coverageHelp'],durations:['recordedDurationHelp'],usage:['usageRule','nonBillable'],originalRecords:['normalizedCoverage','formatCoverage']};
function localizedCoverage(key,value,t,language){return language==='en'?value:{...value,explanation:(coverageHelpKeys[key]||['coverageHelp']).map(t).join(' '),reliability:t(value.reliability==='Recorded'?'recorded':value.reliability==='Estimated'?'estimated':value.reliability==='Unavailable'?'unavailable':'derived')};}
function localizedDefinition(key,value,t,language){
  if(language==='en')return value;
  const unitKeys={activity:['segments'],messages:['user','response'],composition:['segments','characters'],words:['words'],structure:['conversations','objects','sourceNative'],content:['sourceNative'],tools:['tool-call'],timing:['milliseconds'],usage:['tokens','unit'],quality:['conversations','records']};
  const methods={activity:['activityHelp','membershipScope'],messages:['logicalBoundary','compositionRule'],composition:['compositionRule','traceRule','noThinking'],words:['lengthRule'],structure:['structureHelp','repeatedRule'],content:['contentHelp','lengthRule','attachmentBytes'],tools:['indicatorRule'],timing:['recordedDurationHelp'],usage:['usageRule','nonBillable'],quality:['formatCoverage','normalizedCoverage']};
  return {...value,countingUnit:(unitKeys[key]||['sourceNative']).map(t).join(' / '),eligiblePopulation:t('coverageAll'),filterScope:t('appliedFilters')+' '+t('modelFilterHelp'),timeBasis:t(value.timeBasis==='conversation'?'conversations':'timestamp')+' · '+t('datePrecisionHelp'),branchPolicy:t(value.branchPolicy==='all'?'allBranches':value.branchPolicy==='alternative'?'alternative':'selected'),derivation:(methods[key]||['coverageHelp']).map(t).join(' '),coverage:{...value.coverage,explanation:(methods[key]||['coverageHelp']).map(t).join(' ')},reliability:t(value.reliability==='Recorded'?'recorded':value.reliability==='Estimated'?'estimated':value.reliability==='Unavailable'?'unavailable':'derived')};
}
function htmlTable(values,t=localizedTranslator('en'),markdownFields=[]) {
  if(!values.length)return '<p class="unavailable">'+escapeHtml(t('emptyPopulation'))+'</p>';
  const columns=[...new Set(values.flatMap(r=>Object.keys(r)))].filter(k=>k!=='evidenceIds');
  return '<div class="table-scroll"><table><thead><tr>'+columns.map(c=>'<th scope="col">'+escapeHtml(localizedHeading(c,t))+'</th>').join('')+'</tr></thead><tbody>'+values.map(r=>'<tr>'+columns.map(c=>'<td>'+(markdownFields.includes(c)&&typeof r[c]==='string'?'<div class="safe-markdown">'+safeMarkdownHTML(r[c])+'</div>':escapeHtml(renderValue(r[c],t)))+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
}
function highlightedCode(code,declared) {const language=normalizeCodeLanguage(declared);return highlighter.getLanguage(language)?highlighter.highlight(code,{language,ignoreIllegals:true}).value:escapeHtml(code);}
function reportCodeCSS(themeId) {
  const theme=CODE_THEMES.find(t=>t.id===themeId)||CODE_THEMES[0];
  const defaultLight={background:'#f6f8fa',foreground:'#243443',header:'#edf1f6',label:'#465b70',border:'#cbd7df',comment:'#617767',keyword:'#8250df',string:'#0a3069',number:'#0550ae',title:'#8250df',type:'#953800',variable:'#953800',meta:'#0550ae',operator:'#243443',attribute:'#0550ae',selector:'#116329'};
  const defaultDark={background:'#171c24',foreground:'#d8e1ef',header:'#202936',label:'#b1bfd4',border:'#38455c',comment:'#9bad9c',keyword:'#ff7b72',string:'#a5d6ff',number:'#79c0ff',title:'#d2a8ff',type:'#ffa657',variable:'#ffa657',meta:'#79c0ff',operator:'#d8e1ef',attribute:'#79c0ff',selector:'#7ee787'};
  const vars=(defaults,mode)=>Object.entries({...defaults,...theme.tokens[mode]}).map(([k,v])=>'--syntax-'+k+':'+v+';').join('');
  return '.safe-markdown{'+vars(defaultLight,'light')+'}@media(prefers-color-scheme:dark){.safe-markdown{'+vars(defaultDark,'dark')+'}}'+'.safe-markdown .code-block{border:1px solid var(--syntax-border);border-radius:6px;overflow:hidden;margin:10px 0;background:var(--syntax-background);color:var(--syntax-foreground)}.safe-markdown .code-head{background:var(--syntax-header);color:var(--syntax-label);padding:6px 12px}.safe-markdown .code-block pre{background:var(--syntax-background);color:var(--syntax-foreground);margin:0}.safe-markdown .hljs-comment,.safe-markdown .hljs-quote{color:var(--syntax-comment)}.safe-markdown .hljs-keyword,.safe-markdown .hljs-selector-tag,.safe-markdown .hljs-literal{color:var(--syntax-keyword)}.safe-markdown .hljs-string,.safe-markdown .hljs-regexp{color:var(--syntax-string)}.safe-markdown .hljs-number{color:var(--syntax-number)}.safe-markdown .hljs-title,.safe-markdown .hljs-function{color:var(--syntax-title)}.safe-markdown .hljs-type,.safe-markdown .hljs-built_in{color:var(--syntax-type)}.safe-markdown .hljs-variable,.safe-markdown .hljs-params{color:var(--syntax-variable)}.safe-markdown .hljs-meta{color:var(--syntax-meta)}.safe-markdown .hljs-attr,.safe-markdown .hljs-attribute,.safe-markdown .hljs-tag{color:var(--syntax-attribute)}.safe-markdown .hljs-operator,.safe-markdown .hljs-punctuation{color:var(--syntax-operator)}.safe-markdown .hljs-selector-id,.safe-markdown .hljs-selector-class{color:var(--syntax-selector)}.safe-markdown .hljs-addition{color:var(--syntax-addition);background:var(--syntax-addition-background)}.safe-markdown .hljs-deletion{color:var(--syntax-deletion);background:var(--syntax-deletion-background)}';
}
function barChart(values,title) {
  const data=values.slice(0,16);if(!data.length)return '';
  const max=Math.max(1,...data.map(r=>Number(r.count)||0));const height=50+data.length*30;
  return '<svg class="chart" viewBox="0 0 700 '+height+'" role="img" aria-label="'+escapeHtml(title)+'"><title>'+escapeHtml(title)+'</title>'+data.map((r,i)=>{const width=420*(Number(r.count)||0)/max;return '<g><title>'+escapeHtml(r.label)+': '+escapeHtml(r.count)+'</title><text x="8" y="'+(30+i*30)+'">'+escapeHtml(String(r.label).slice(0,27))+'</text><rect x="225" y="'+(15+i*30)+'" width="'+width+'" height="20" rx="4"></rect><text x="'+(235+width)+'" y="'+(30+i*30)+'">'+escapeHtml(r.count)+'</text></g>';}).join('')+'</svg>';
}
export function reportHTML(report,options={}) {
  const p=exportPayload(report,options);
  const language=Object.hasOwn(dictionaries,options.language||p.filters.language)?(options.language||p.filters.language):'en';
  const t=localizedTranslator(language);
  const favicon='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#172b46"/><path fill="#70c5b5" d="M11 40h9v14h-9zm16-14h9v28h-9zm16-14h9v42h-9z"/></svg>');
  const sections=Object.entries(p.tables).map(([key,values],index)=>({key,id:'table-'+index+'-'+String(key).replace(/[^a-zA-Z0-9_-]/g,'-'),values,title:localizedHeading(key,t)}));
  const explorerSections=(p.explorer?.charts||[]).map((chart,index)=>({...chart,htmlId:'explorer-'+index,title:localizedHeading(chart.titleKey||chart.id,t)}));
  const prose=value=>'<div class="safe-markdown">'+safeMarkdownHTML(String(value??''),{highlight:highlightedCode,labels:{imageOmitted:t('imageOmitted'),blockedLink:t('blockedLink'),truncated:t('markdownTruncated')}})+'</div>';
  const contractHTML=value=>'<dl>'+Object.entries(value||{}).map(([key,detail])=>'<dt>'+escapeHtml(localizedHeading(key,t))+'</dt><dd>'+(['definition','limitations','explanation','derivation'].includes(key)&&typeof detail==='string'?prose(detail):escapeHtml(renderValue(detail,t)))+'</dd>').join('')+'</dl>';
  const summaryKeys=['conversations','collectionMemberships','records','userMessages','responseMessages','thinkingSegments','characters','activeDays','toolCalls','codeBlocks'];
  const evidence=p.evidence?'<section id="evidence"><h2>'+escapeHtml(t('evidence'))+'</h2><p>'+escapeHtml(t('includeEvidence'))+'</p>'+p.evidence.map(e=>'<article class="evidence"><h3>'+escapeHtml(e.title)+' · '+escapeHtml(e.category)+'</h3><dl><dt>'+escapeHtml(t('snapshot'))+'</dt><dd>'+escapeHtml(e.id)+'</dd><dt>'+escapeHtml(t('messageModel'))+'</dt><dd>'+escapeHtml(e.sourceId)+' / '+escapeHtml(e.model)+'</dd><dt>'+escapeHtml(t('provenance'))+'</dt><dd>'+escapeHtml(e.classification)+' / '+escapeHtml(e.provenance)+'</dd></dl>'+(e.textTruncated?'<p class="unavailable">'+escapeHtml(t('truncatedEvidence'))+' · '+escapeHtml(e.fullTextCharacters)+' '+escapeHtml(t('characters'))+'</p>':'')+prose(e.text==null?t('noThinking'):e.text)+'</article>').join('')+'</section>':'';
  const document='<!doctype html><html lang="'+language+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'"><title>ThreadShelf Local Analytics · '+escapeHtml(t('analyticalReport'))+'</title><link rel="icon" href="'+favicon+'"><style>'+`
:root{color-scheme:light dark;--bg:#f4f7fb;--panel:#fff;--ink:#172b46;--muted:#526580;--line:#d6dfeb;--accent:#247967;--stripe:#edf3f8}
@media(prefers-color-scheme:dark){:root{--bg:#101720;--panel:#17212e;--ink:#e0eaf4;--muted:#a0b2c7;--line:#344357;--accent:#70c5b5;--stripe:#1d2a39}}
*{box-sizing:border-box}body{margin:0;font:15px/1.55 system-ui,sans-serif;color:var(--ink);background:var(--bg)}header,main,footer{max-width:1240px;margin:auto;padding:24px}header{border-bottom:1px solid var(--line)}h1{font-size:28px;margin:0 0 4px}h2{font-size:22px}h3{font-size:17px}p{overflow-wrap:anywhere}a{color:var(--accent)}.subtitle,.unavailable{color:var(--muted)}nav{display:flex;gap:8px;flex-wrap:wrap;margin:20px 0}nav a{padding:5px 10px;background:var(--panel);border:1px solid var(--line);border-radius:6px;text-decoration:none}.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.stat,section{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:18px}.stat strong{display:block;font-size:25px}.stat span{color:var(--muted);font-size:13px}section{margin:18px 0;scroll-margin:20px}.table-scroll{overflow:auto}table{border-collapse:collapse;width:100%;font-size:13px}th,td{padding:9px 11px;text-align:left;vertical-align:top;border-bottom:1px solid var(--line);overflow-wrap:anywhere;max-width:400px}th{font-weight:650;background:var(--stripe)}tbody tr:nth-child(even){background:var(--stripe)}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:var(--stripe);padding:12px;border-radius:6px;font:13px/1.5 ui-monospace,monospace}dl{display:grid;grid-template-columns:minmax(120px,180px) 1fr;gap:6px}dt{color:var(--muted)}dd{margin:0;overflow-wrap:anywhere}.chart{width:100%;max-height:600px}.chart text{fill:var(--ink);font:13px system-ui,sans-serif}.chart rect{fill:var(--accent)}.evidence{border-top:1px solid var(--line);padding-top:14px}@media print{body{background:white;color:black}nav{display:none}section{break-inside:avoid}header,main,footer{padding:12px}.table-scroll{overflow:visible}table{font-size:10px}.chart{max-height:360px}}
`+SAFE_MARKDOWN_CSS+reportCodeCSS(options.codeTheme)+'</style></head><body><header><h1>ThreadShelf Local Analytics</h1><p class="subtitle">'+escapeHtml(p.application.version||PRODUCT_VERSION)+' · '+escapeHtml(t('reportVersion'))+' '+escapeHtml(p.application.analyticalSchemaVersion)+' · '+escapeHtml(p.generatedAt)+'</p><p>'+escapeHtml(t(p.evidence?'includeEvidence':'aggregateDefault'))+'</p><nav aria-label="'+escapeHtml(t('scope'))+'"><a href="#scope">'+escapeHtml(t('scope'))+'</a><a href="#coverage">'+escapeHtml(t('coverage'))+'</a><a href="#definitions">'+escapeHtml(t('definitions'))+'</a>'+sections.map(s=>'<a href="#'+s.id+'">'+escapeHtml(s.title)+'</a>').join('')+(explorerSections.length?'<a href="#explorer-data">'+escapeHtml(t('explorerReport'))+'</a>':'')+(p.evidence?'<a href="#evidence">'+escapeHtml(t('evidence'))+'</a>':'')+'</nav></header><main><div class="stats">'+summaryKeys.map(key=>'<div class="stat"><strong>'+escapeHtml(renderValue(p.summary[key],t))+'</strong><span>'+escapeHtml(localizedHeading(key,t))+'</span></div>').join('')+'</div><section id="scope"><h2>'+escapeHtml(t('scope'))+'</h2><dl><dt>'+escapeHtml(t('reportTime'))+'</dt><dd>'+escapeHtml(p.generatedAt)+'</dd><dt>'+escapeHtml(t('captured'))+'</dt><dd>'+escapeHtml(p.selection.capturedAt||t('unavailable'))+'</dd><dt>'+escapeHtml(t('sources'))+'</dt><dd>'+escapeHtml(renderValue(p.selection.sourceIds,t))+'</dd><dt>'+escapeHtml(t('snapshots'))+'</dt><dd>'+escapeHtml(renderValue(p.selection.snapshotIds,t))+'</dd><dt>'+escapeHtml(t('coveragePeriod'))+'</dt><dd>'+escapeHtml(renderValue(p.selection.coveragePeriod,t))+'</dd><dt>'+escapeHtml(t('timezone'))+'</dt><dd>'+escapeHtml(p.dateRange.zone)+'</dd><dt>'+escapeHtml(t('branches'))+'</dt><dd>'+escapeHtml(t(p.filters.branch==='all'?'allBranches':p.filters.branch==='alternative'?'alternative':'selected'))+'</dd><dt>'+escapeHtml(t('perspective'))+'</dt><dd>'+escapeHtml(t(p.selection.perspective==='memberships'?'memberships':'unique'))+'</dd><dt>'+escapeHtml(t('adapterVersions'))+'</dt><dd>'+escapeHtml(renderValue(p.application.adapterVersions,t))+'</dd></dl><h3>'+escapeHtml(t('appliedFilters'))+'</h3><pre>'+escapeHtml(JSON.stringify(p.filters,null,2))+'</pre><p>'+escapeHtml(t('compositionRule')+' '+t('noUnknownZero')+' '+t('noThinking'))+'</p><h3>'+escapeHtml(t('reportMetadata'))+'</h3><pre>'+escapeHtml(JSON.stringify({application:p.application,export:p.export,explorerVersions:p.explorer?.versions||null},null,2))+'</pre><p>'+escapeHtml(t(p.export.mode==='legacy-compatible'?'legacyCompatibleReport':'privateLabelReport'))+'</p></section><section id="coverage"><h2>'+escapeHtml(t('coverage'))+'</h2>'+htmlTable(Object.entries(p.coverage).map(([metric,value])=>({metric:localizedHeading(metric,t),...localizedCoverage(metric,value,t,language)})),t,['explanation'])+'</section><section id="definitions"><h2>'+escapeHtml(t('definitions'))+'</h2>'+Object.entries(p.definitions).map(([key,value])=>'<h3>'+escapeHtml(localizedHeading(key,t))+'</h3>'+contractHTML(localizedDefinition(key,value,t,language))).join('')+'</section>'+(p.previousPeriod?'<section id="previous"><h2>'+escapeHtml(t('previousPeriod'))+'</h2><p>'+escapeHtml(p.previousPeriod.calendarDays)+' '+escapeHtml(t('days'))+' · '+escapeHtml(p.previousPeriod.dateRange.startDay)+' '+escapeHtml(t('until'))+' '+escapeHtml(p.previousPeriod.dateRange.endDay)+' · '+escapeHtml(t('endExclusive'))+' · '+escapeHtml(t('calendarComparisonRule'))+'</p>'+htmlTable(p.previousPeriod.comparison,t)+'</section>':'')+sections.map(s=>'<section id="'+s.id+'"><h2>'+escapeHtml(s.title)+'</h2>'+(['platforms','models','composition','codeLanguages'].includes(s.key)?barChart(s.values,s.title):'')+htmlTable(s.values,t)+'</section>').join('')+(explorerSections.length?'<section id="explorer-data"><h2>'+escapeHtml(t('explorerReport'))+'</h2><p>'+escapeHtml(t('privateLabelReport'))+'</p></section>'+explorerSections.map(s=>'<section id="'+s.htmlId+'"><h2>'+escapeHtml(s.title)+'</h2><h3>'+escapeHtml(t('metricContract'))+'</h3>'+contractHTML(s.contract)+'<h3>'+escapeHtml(t('displayDisclosures'))+'</h3>'+contractHTML(s.display)+htmlTable(s.rows,t)+'</section>').join(''):'')+evidence+'</main><footer>'+escapeHtml(t('sourceSafety')+' · '+t('evidenceTextSafe')+' '+t('recordedHelp'))+'</footer></body></html>';
  return document;
}

export const toJSON = reportJSON;
export const toCSV = reportCSV;
export const toHTML = reportHTML;
export const exportJSON = reportJSON;
export const exportCSV = reportCSV;
export const exportHTML = reportHTML;
