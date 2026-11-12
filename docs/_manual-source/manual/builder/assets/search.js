(()=>{'use strict';
const host=document.getElementById('search-data'),form=document.getElementById('search-form');
if(!host||!form)return;
let data;try{data=JSON.parse(host.textContent)}catch{return}
const results=document.getElementById('search-results'),status=document.getElementById('search-status'),pager=document.getElementById('search-pages');
const q=form.elements.q,kind=form.elements.kind,tag=form.elements.filter_tag,sort=form.elements.sort;
let page=1;
const compare=(a,b)=>a<b?-1:a>b?1:0;
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e};
function read(){try{const p=new URLSearchParams(location.search);q.value=(p.get('q')||'').slice(0,400);kind.value=p.get('kind')||'';tag.value=p.get('filter_tag')||'';sort.value=p.get('sort')||'relevance';page=Math.max(1,Number.parseInt(p.get('page')||'1',10)||1)}catch{page=1}if(!sort.value)sort.value='relevance'}
function update(write=false){
const query=Array.from(q.value.trim()).slice(0,200).join('');q.value=query;
const re=query?new RegExp(escape(query),'iu'):null;let found=[];
for(let i=0;i<data.records.length;i++){
 const r=data.records[i];if(!query&&!r.path)continue;if(kind.value&&r.kind!==kind.value)continue;if(tag.value&&!r.tags.includes(tag.value))continue;
 let score=0;for(const [key,weight]of Object.entries({title:8,path:6,description:4,tags:3,text:1})){const t=key==='tags'?r.tags.join(' '):r[key];if(re&&re.test(t))score+=weight}
 if(re&&!score)continue;found.push({...r,score,ordinal:i});
}
found.sort((a,b)=>{let n=sort.value==='name'?compare(a.name_order,b.name_order):sort.value==='updated'?compare(b.updated,a.updated):query?b.score-a.score:0;return n||a.ordinal-b.ordinal});
const count=found.length,pages=Math.max(1,Math.ceil(count/data.pageSize));page=Math.min(page,pages);
const table=el('table',undefined,'menu'),cols=el('colgroup');for(const cls of ['icon-col','','type-col'])cols.append(el('col',undefined,cls));table.append(cols);table.setAttribute('aria-label','Search results');const body=el('tbody');table.append(body);
const names={dir:['DIR','gopher-menu'],file:['FILE','plain'],markdown:['FILE','markdown'],image:['IMG','image'],archive:['FILE','download']};
for(const r of found.slice((page-1)*data.pageSize,page*data.pageSize)){
 const row=el('tr'),iconCell=el('td',undefined,'icon-cell'),icon=el('img',undefined,'icon');icon.src=data.icons[r.kind==='markdown'?'file':r.kind];icon.alt='('+names[r.kind][0]+')';icon.width=20;icon.height=22;iconCell.append(icon);
 const cell=el('td',undefined,'label'),link=el('a',r.title+(r.path?' — '+r.path:''));link.setAttribute('href',r.href);cell.append(link);
 let text=(re&&re.test(r.text)?r.text:r.description).replace(/\s+/gu,' ');const match=re?.exec(text);const start=match?Math.max(0,match.index-70):0;const snippet=(start?'…':'')+text.slice(start,start+240)+(text.length>start+240?'…':'');
 if(snippet){cell.append(el('br'),el('span',snippet,'summary'))}
 row.append(iconCell,cell,el('td',names[r.kind][1],'type'));body.append(row);
}
results.replaceChildren(count?table:el('p','No matching entries. Try a shorter phrase or clear a filter.','notice'));
status.textContent=query?`${count} results for “${query}”.`:`${count} entries.`;
pager.replaceChildren();if(pages>1){
 const button=(label,target)=>{const b=el('button',label);b.type='button';b.addEventListener('click',()=>{page=target;update(true);status.scrollIntoView({block:'nearest'});status.focus({preventScroll:true})});return b};
 if(page>1)pager.append(button('Previous',page-1));pager.append(el('span',` Page ${page} of ${pages} `));if(page<pages)pager.append(button('Next',page+1));
}
if(write)try{const params=new URLSearchParams({index:'1'});if(query)params.set('q',query);if(kind.value)params.set('kind',kind.value);if(tag.value)params.set('filter_tag',tag.value);if(sort.value!=='relevance')params.set('sort',sort.value);if(page>1)params.set('page',String(page));history.replaceState(null,'',location.pathname+'?'+params.toString()+location.hash)}catch{}
}
status.tabIndex=-1;form.hidden=false;read();update();
form.addEventListener('submit',e=>{e.preventDefault();page=1;update(true)});
for(const control of [kind,tag,sort])control.addEventListener('change',()=>{page=1;update(true)});
addEventListener('popstate',()=>{read();update()});
})();
