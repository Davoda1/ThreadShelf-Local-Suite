// Small, deterministic view-state rules shared with the renderer tests.
export const SEARCH_PERIODS=Object.freeze(['all','week','month','3months','6months','year','2years','5years']);
export function searchPreferences(settings,source){
 const allowed=source==='server'?['titles','keyword','semantic']:['titles','keyword','exact','fuzzy','semantic','hybrid','ollama'];
 const stored=settings.searchPreferences?.[source]||{},mode=stored.mode||settings.searchMode||'keyword';
 return {mode:allowed.includes(mode)?mode:'keyword',provider:stored.provider||'',role:stored.role||'',...(source==='local'?{period:SEARCH_PERIODS.includes(stored.period)?stored.period:'all'}:{})};
}
export function appendSearchResults(existing,batch){
 const key=item=>item.passageId??JSON.stringify([item.conversationId||item.id,item.turnIndex,item.role,item.ordinal??item.partIndex??'']);
 const seen=new Set(existing.map(key)),next=existing.slice();
 for(const item of batch||[]){const id=key(item);if(!seen.has(id)){seen.add(id);next.push(item);}}
 return next;
}
export function searchProgressPercent(progress){
 if(Number.isFinite(progress?.fraction)&&progress.fraction>=0)return Math.min(99,Math.floor(progress.fraction*100));
 const total=Number(progress?.total),current=Number(progress?.current);if(!Number.isFinite(total)||total<=0||!Number.isFinite(current)||current<0)return null;
 // Completion also includes ranking and snippet hydration; never claim 100% early.
 return Math.min(99,Math.max(0,Math.floor(current/total*100)));
}
