/**
 * Shared archived-prose renderer. Marked supplies tokens; this module alone
 * creates HTML from a closed tag/attribute allowlist. Raw HTML never reaches
 * the document as markup and no source URL is put in a loading/navigation
 * attribute. The returned source/blocks are the copy payloads, not HTML.
 */
import {marked} from 'marked';

export const SAFE_MARKDOWN_VERSION = '2.0.0';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const bounded = (value,fallback,min,max) => Number.isSafeInteger(value) ? Math.max(min,Math.min(max,value)) : fallback;
const defaults = Object.freeze({copyCode:'Copy code',copyLink:'Copy link',openLink:'Open externally',imageOmitted:'Image omitted',blockedLink:'Unavailable link',truncated:'Display excerpt truncated; copy retains the original source.'});

/** Strictly HTTP(S), no credentials, controls, slash ambiguity or relative URLs. */
export function validatedExternalUrl(value) {
  if(typeof value !== 'string' || !/^https?:\/\//i.test(value) || /[\u0000-\u0020\u007f\\]/u.test(value)) return null;
  try {const url = new URL(value);return ['http:','https:'].includes(url.protocol) && url.hostname && !url.username && !url.password ? url.href : null;} catch {return null;}
}

// Marked leaves entity spellings in text tokens. Decode only text entities and
// immediately re-escape the result; entity spellings never become attributes.
function plain(value) {
  return String(value ?? '').replace(/&(?:#(x[0-9a-f]+|[0-9]+)|amp|lt|gt|quot|apos);/gi,(all,number)=>{
    if(number){const n=number[0].toLowerCase()==='x'?parseInt(number.slice(1),16):parseInt(number,10);return n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):'\ufffd';}
    return {'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"}[all.toLowerCase()] ?? all;
  });
}

/** Accept only highlight.js's escaped text and allowlisted span classes. */
export function safeHighlightedHtml(value,fallback) {
  if(typeof value!=='string' || value.length>Math.max(4096,String(fallback).length*24+4096)) return escape(fallback);
  let out='',end=0,depth=0;
  const tags=/<[^>]*>/g;let match;
  while((match=tags.exec(value))){
    const text=value.slice(end,match.index);if(text.includes('<'))return escape(fallback);out+=text;
    if(match[0]==='</span>'){if(!depth)return escape(fallback);depth--;out+='</span>';}
    else {
      const open=/^<span class="([a-zA-Z0-9_ -]+)">$/.exec(match[0]);
      if(!open||!open[1].split(/ +/).every(c=>/^(?:hljs-[a-zA-Z0-9_-]+|[a-zA-Z0-9_-]+_)$/.test(c))||++depth>64)return escape(fallback);
      out+='<span class="'+escape(open[1])+'">';
    }
    end=tags.lastIndex;
  }
  if(depth||value.slice(end).includes('<'))return escape(fallback);
  return out+value.slice(end);
}

function normalizedSource(source) {
  let normalized='',offsets=[];
  for(let i=0;i<source.length;i++){
    offsets.push(i);const ch=source[i];if(ch==='\r'){normalized+='\n';if(source[i+1]==='\n')i++;}else normalized+=ch;
  }
  offsets.push(source.length);return {normalized,offsets};
}

function nestedFenceCopy(token,state) {
  if(!state.nestedFences){
    const lines=state.display.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g)||[],found=[];let offset=0;
    for(let i=0;i<lines.length;i++){
      const opener=/^((?:[ \t]{0,3}>[ \t]?)*[ \t]{0,3}(?:(?:[-+*]|\d+[.)])[ \t]+)?)(`{3,}|~{3,})([^\r\n]*)(?:\r\n|\r|\n|$)/.exec(lines[i]);
      if(!opener){offset+=lines[i].length;continue;}
      const start=offset,quoteDepth=(opener[1].match(/>/g)||[]).length;
      const afterQuotes=opener[1].replace(/(?:[ \t]{0,3}>[ \t]?)/g,''),indent=afterQuotes.length;
      const content=line=>{let result=line;for(let n=0;n<quoteDepth;n++)result=result.replace(/^[ \t]{0,3}>[ \t]?/,'');if(indent)result=result.replace(new RegExp('^[ \\t]{0,'+indent+'}'),'');return result;};
      const closer=new RegExp('^ {0,3}'+opener[2][0]+'{'+opener[2].length+',}[ \\t]*(?:\\r\\n|\\r|\\n|$)');
      let body='',j=i+1;for(;j<lines.length;j++){const line=content(lines[j]);if(closer.test(line))break;body+=line;}
      if(quoteDepth||indent)found.push({start,body,normalized:body.replace(/\r\n?|\n/g,'\n').replace(/\n$/,''),language:opener[3].trim(),used:false});
      for(let k=i;k<=Math.min(j,lines.length-1);k++)offset+=lines[k].length;i=j;
    }
    state.nestedFences=found;
  }
  const minimumOffset=state.offsets[Math.min(state.codeCursor,state.offsets.length-1)]||0;
  const candidate=state.nestedFences.find(item=>!item.used&&item.start>=minimumOffset&&item.normalized===String(token.text??'')&&item.language===String(token.lang??''));
  if(candidate){candidate.used=true;return candidate.body;}return null;
}

function codeCopy(token,state) {
  // Recover common direct fenced/indented blocks from the original input,
  // retaining CRLF and the final code newline. Nested transformed tokens use
  // their original token.raw rather than the parser's normalized token.text.
  const raw=String(token.raw??token.text??'');let original=raw;
  const at=state.normalized.indexOf(raw,state.codeCursor);
  if(at>=0){original=state.source.slice(state.offsets[at],state.offsets[at+raw.length]);state.codeCursor=at+raw.length;
    if(state.truncated&&state.codeCursor===state.normalized.length&&/^ {0,3}(?:`{3,}|~{3,})/.test(raw))original=state.source.slice(state.offsets[at]);
  }else {const nested=nestedFenceCopy(token,state);if(nested!==null)return nested;}
  const opener=/^ {0,3}(`{3,}|~{3,})[^\r\n]*(?:\r\n|\r|\n)/.exec(original);
  if(opener){
    let body=original.slice(opener[0].length);const char=opener[1][0],length=opener[1].length;
    const lines=body.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g)||[];
    let cursor=0;
    for(const line of lines){if(new RegExp('^ {0,3}'+(char==='`'?'`':'~')+'{'+length+',}[ \\t]*(?:\\r\\n|\\r|\\n)?$').test(line))return body.slice(0,cursor);cursor+=line.length;}
    return body;
  }
  // Copy indented code exactly as archived, including its source indentation.
  return original;
}

/**
 * Render only designated Markdown prose, never identifiers or numeric cells.
 * controls=true emits application-owned buttons with numeric indices; clients
 * resolve the index against this return value. No source data-action survives.
 * highlight(code, language) is optional and its output is re-allowlisted.
 */
export function renderSafeMarkdown(value,options={}) {
  const source=String(value??'');
  const maxCharacters=bounded(options.maxCharacters,250_000,512,2_000_000),maxTokens=bounded(options.maxTokens,25_000,32,100_000),maxDepth=bounded(options.maxDepth,32,4,64);
  const labels={...defaults,...options.labels};const display=source.slice(0,maxCharacters);
  const normalized=normalizedSource(display);
  const state={source,display,...normalized,blocks:[],links:[],codeCursor:0,count:0,truncated:display.length<source.length};
  const button=(action,index,label)=>options.controls===true?'<button type="button" class="md-tool" data-action="'+action+'" data-md-index="'+index+'">'+escape(label)+'</button>':'';
  const children=(tokens,depth)=>Array.isArray(tokens)?tokens.map(token=>render(token,depth+1)).join(''):'';
  function render(token,depth=0){
    if(!token||typeof token!=='object')return '';
    if(++state.count>maxTokens||depth>maxDepth){state.truncated=true;return state.count===maxTokens+1?'<p class="md-notice">'+escape(labels.truncated)+'</p>':'';}
    const nested=()=>children(token.tokens,depth),text=()=>escape(plain(token.text??token.raw??''));
    switch(token.type){
      case 'space':return '';
      case 'heading':{const level=Math.max(1,Math.min(6,Number(token.depth)||1));return '<h'+level+'>'+nested()+'</h'+level+'>';}
      case 'paragraph':return '<p>'+nested()+'</p>';
      case 'text':return token.tokens?nested():text();
      case 'strong':return '<strong>'+nested()+'</strong>';
      case 'em':return '<em>'+nested()+'</em>';
      case 'del':return '<del>'+nested()+'</del>';
      case 'br':return '<br>';
      case 'hr':return '<hr>';
      case 'codespan':return '<code>'+text()+'</code>';
      case 'blockquote':return '<blockquote>'+nested()+'</blockquote>';
      case 'list':{
        const tag=token.ordered?'ol':'ul',start=Number.isSafeInteger(token.start)&&token.start!==1?' start="'+token.start+'"':'';
        return '<'+tag+(token.ordered?start:'')+'>'+children(token.items,depth)+'</'+tag+'>';
      }
      case 'list_item':return '<li>'+(token.task?'<span class="md-task">'+(token.checked?'☑':'☐')+' </span>':'')+nested()+'</li>';
      case 'table':{
        const cells=(row,head)=>row.map((cell,i)=>'<'+(head?'th scope="col"':'td')+(token.align?.[i]&&['left','center','right'].includes(token.align[i])?' class="md-align-'+token.align[i]+'"':'')+'>'+children(cell.tokens,depth)+'</'+(head?'th':'td')+'>').join('');
        return '<div class="md-table-scroll"><table><thead><tr>'+cells(token.header||[],true)+'</tr></thead><tbody>'+(token.rows||[]).map(row=>'<tr>'+cells(row,false)+'</tr>').join('')+'</tbody></table></div>';
      }
      case 'code':{
        const code=codeCopy(token,state),index=state.blocks.push(code)-1,language=String(token.lang||'').split(/\s+/)[0].slice(0,80);
        let content=escape(token.text??code);
        if(typeof options.highlight==='function'){try{content=safeHighlightedHtml(options.highlight(String(token.text??code),language),token.text??code);}catch{}}
        const codeClass=/^[a-zA-Z0-9_+.-]+$/.test(language)?' class="language-'+escape(language)+'"':'';
        return '<div class="code-block"><div class="code-head"><span>'+escape(language)+'</span>'+button('markdown-copy-code',index,labels.copyCode)+'</div><pre><code'+codeClass+'>'+content+'</code></pre></div>';
      }
      case 'link':{
        const href=validatedExternalUrl(plain(token.href));
        if(!href)return '<span class="md-link-blocked">'+nested()+' <span class="md-notice">('+escape(labels.blockedLink)+')</span></span>';
        const index=state.links.push(href)-1;
        // href is escaped text only; no href, src, title, id or data-url attrs.
        return '<span class="md-link">'+nested()+' <span class="md-url">('+escape(href)+')</span>'+button('markdown-copy-link',index,labels.copyLink)+(options.openExternal===true?button('markdown-open-link',index,labels.openLink):'')+'</span>';
      }
      case 'image':return '<span class="md-image-omitted">['+escape(labels.imageOmitted)+(token.text?': '+text():'')+']</span>';
      case 'html':return token.block?'<pre class="md-raw-html">'+escape(token.raw??token.text??'')+'</pre>':escape(token.raw??token.text??'');
      case 'escape':return text();
      default:return '<span>'+escape(token.raw??token.text??'')+'</span>';
    }
  }
  let html;
  try {html=marked.lexer(display,{gfm:true,breaks:false,async:false}).map(token=>render(token)).join('');}
  catch {state.truncated=true;html='<pre>'+escape(display)+'</pre>';}
  if(state.truncated)html+='<p class="md-notice">'+escape(labels.truncated)+'</p>';
  return {html,source,blocks:state.blocks,links:state.links,truncated:state.truncated,renderedCharacters:display.length,version:SAFE_MARKDOWN_VERSION};
}

export const safeMarkdownHTML=(value,options={})=>renderSafeMarkdown(value,options).html;

/** Shared styles; no URLs, imports, external fonts or global app overrides. */
export const SAFE_MARKDOWN_CSS=`.safe-markdown{overflow-wrap:anywhere;line-height:1.55}.safe-markdown p{margin:.65em 0}.safe-markdown blockquote{margin:.7em 0;padding:.2em 1em;border-left:3px solid var(--accent);opacity:.92}.safe-markdown pre{overflow:auto;max-width:100%;white-space:pre;tab-size:4}.safe-markdown code{font:13px/1.55 ui-monospace,monospace}.safe-markdown :not(pre)>code{background:var(--stripe,var(--panel));padding:.1em .3em;border-radius:3px}.safe-markdown .md-table-scroll{overflow:auto;max-width:100%}.safe-markdown table{border-collapse:collapse;width:100%}.safe-markdown th,.safe-markdown td{border-bottom:1px solid var(--line);padding:.45em .6em;vertical-align:top}.safe-markdown .md-align-left{text-align:left}.safe-markdown .md-align-center{text-align:center}.safe-markdown .md-align-right{text-align:right}.safe-markdown .md-url,.safe-markdown .md-notice,.safe-markdown .md-image-omitted{font-size:.9em;opacity:.78}.safe-markdown .md-link{overflow-wrap:anywhere}.safe-markdown .md-tool{margin:0 .25em;font:inherit}.safe-markdown .code-head{display:flex;justify-content:space-between;align-items:center;gap:8px}.safe-markdown .md-raw-html{white-space:pre-wrap}`;
