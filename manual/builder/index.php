<?php
/**
 * Gopher HTTP 3.0.0 — directory-first HTTP publishing.
 * Original implementation. See LICENSE. No Composer, database or client JS.
 * This source is bundled with CSS/icons by tools/package.php into index.php.
 */
declare(strict_types=1);
namespace GopherHTTP;

const VERSION = '3.0.0';
const CSS = '/* Gopher HTTP 3.0.0: compact directory styling; no webfonts. */
:root{color-scheme:light dark;--bg:#fff;--fg:#111;--link:#0000ee;--visited:#551a8b;--rule:#777;--muted:#444}
@media(prefers-color-scheme:dark){:root{--bg:#181a1a;--fg:#eee;--link:#309cff;--visited:#c29aff;--rule:#aaa;--muted:#c3c3c3}}
html{background:var(--bg);color:var(--fg)}
body{margin:8px;font:16px "Times New Roman",Times,serif;background:var(--bg);color:var(--fg)}
a{color:var(--link);text-decoration:underline}a:visited{color:var(--visited)}a:focus-visible,button:focus-visible,input:focus-visible{outline:2px solid currentColor;outline-offset:3px}
h1{font-size:2em;margin:.67em 0}hr{border:0;border-top:1px solid var(--rule);margin:.65em 0}
.menu{width:100%;table-layout:fixed;border-spacing:1px;border-collapse:separate}
.menu col.icon-col{width:4%}.menu col.type-col{width:10%}
.menu td{padding:0;vertical-align:middle;height:24px}
.menu .icon-cell{vertical-align:top}.menu .icon{width:20px;height:22px;vertical-align:middle;image-rendering:pixelated}
.menu .label{font:13px/1.65 "DejaVu Sans Mono","Liberation Mono",Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere;padding-left:3px}
.menu .summary{color:var(--muted);font-size:11px}
.menu .type{font:10px/1.5 "Times New Roman",Times,serif;overflow-wrap:anywhere;padding-left:8px}
.menu .info .label{min-height:22px}.menu .info td{height:24px}
.breadcrumbs{font:13px/1.5 monospace;margin:-.5em 0 1em;overflow-wrap:anywhere}
.document,.intro{margin:1em 0 1.5em 4%;max-width:90ch;font:14px/1.6 "DejaVu Sans Mono","Liberation Mono",Consolas,monospace;overflow-wrap:anywhere}
.document pre,.intro pre{font:inherit;white-space:pre;overflow:auto;max-width:100%;tab-size:4}
.document pre.plain{white-space:pre-wrap;overflow-wrap:anywhere}
.markdown h1,.markdown h2,.markdown h3,.markdown h4{font-family:inherit;line-height:1.35}
.markdown h1{font-size:1.55em}.markdown h2{font-size:1.3em}.markdown h3{font-size:1.1em}
.markdown p{margin:.8em 0}.markdown blockquote{border-left:2px solid var(--rule);margin:1em 0;padding-left:1.2em}
.markdown pre{padding:.8em;border:1px solid var(--rule)}.markdown code{font:inherit}
.markdown li>p{margin:.3em 0}.table-scroll{overflow:auto;max-width:100%}
.markdown table{border-collapse:collapse}.markdown th,.markdown td{padding:.2em .7em;text-align:left;border:1px solid var(--rule)}
.document img,.intro img{max-width:100%;height:auto}.image-view{margin-left:4%;max-width:1000px}.image-view img{max-width:100%;height:auto}
.file-actions,.notice,.search{margin:1em 0;font:13px/1.6 monospace;overflow-wrap:anywhere}
.search label{display:block}.search input{max-width:90%;width:32em;font:inherit;padding:.25em}.search button{font:inherit;padding:.25em .7em;margin-left:.5em}
footer{margin-top:.6em;overflow-wrap:anywhere}.muted{color:var(--muted)}.empty{font-style:italic}
.skip{position:absolute;left:-10000px;top:auto}.skip:focus{position:static;display:block;margin-bottom:1em}
@media(max-width:600px){.menu col.icon-col{width:34px}.menu col.type-col{width:77px}.menu .type{padding-left:4px}.menu .label{font-size:12px;line-height:1.6}.document,.intro,.image-view{margin-left:0}.breadcrumbs{font-size:12px}}
@media print{:root{color-scheme:light;--bg:white;--fg:black;--link:black;--visited:black}.skip,.search{display:none}a{text-decoration:underline}}
/* 3.0 additions preserve the compact directory layout. */
[hidden]{display:none!important}
button,input,select{color:var(--fg);background:var(--bg);border:1px solid var(--rule);border-radius:2px;font:inherit}
button{cursor:pointer;padding:.3em .7em;min-height:30px}select{max-width:100%;padding:.3em}select:focus-visible,summary:focus-visible{outline:2px solid currentColor;outline-offset:3px}
.filters{display:flex;gap:.6em 1.2em;flex-wrap:wrap;margin:.6em 0}.filters label{display:flex;gap:.4em;align-items:center;max-width:100%}
.search input{box-sizing:border-box;width:min(38em,100%);max-width:100%}.search button{margin-left:0}
.pagination,.siblings,.integrity{font:13px/1.6 monospace;margin:1em 0;overflow-wrap:anywhere}.pagination a,.pagination button{display:inline-block;padding:.25em .5em}.pagination a:first-child{padding-left:0}
.contents{border-left:2px solid var(--rule);padding:.5em 1em;margin:1em 0}.contents summary{cursor:pointer;font-weight:bold}.contents ul{list-style:none;padding-left:0}.contents li{margin:.2em 0}.contents .level-2{padding-left:1em}.contents .level-3,.contents .level-4,.contents .level-5,.contents .level-6{padding-left:2em}
.integrity code{display:block;overflow-wrap:anywhere;font-size:12px}.code-language{font-size:11px;color:var(--muted);margin-bottom:-.7em!important}.task{float:left;margin-right:.6em}.image-view figcaption{font:13px/1.6 monospace;margin:.5em 0}
@media print{.pagination,.siblings,.integrity,footer,.file-actions{display:none}.contents{break-inside:avoid}img{max-height:80vh;object-fit:contain}.document,.intro{max-width:none}body{font-size:12pt}}
';
const SEARCH_JS = '(()=>{\'use strict\';
const host=document.getElementById(\'search-data\'),form=document.getElementById(\'search-form\');
if(!host||!form)return;
let data;try{data=JSON.parse(host.textContent)}catch{return}
const results=document.getElementById(\'search-results\'),status=document.getElementById(\'search-status\'),pager=document.getElementById(\'search-pages\');
const q=form.elements.q,kind=form.elements.kind,tag=form.elements.filter_tag,sort=form.elements.sort;
let page=1;
const compare=(a,b)=>a<b?-1:a>b?1:0;
const escape=s=>s.replace(/[.*+?^${}()|[\\]\\\\]/g,\'\\\\$&\');
const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e};
function read(){try{const p=new URLSearchParams(location.search);q.value=(p.get(\'q\')||\'\').slice(0,400);kind.value=p.get(\'kind\')||\'\';tag.value=p.get(\'filter_tag\')||\'\';sort.value=p.get(\'sort\')||\'relevance\';page=Math.max(1,Number.parseInt(p.get(\'page\')||\'1\',10)||1)}catch{page=1}if(!sort.value)sort.value=\'relevance\'}
function update(write=false){
const query=Array.from(q.value.trim()).slice(0,200).join(\'\');q.value=query;
const re=query?new RegExp(escape(query),\'iu\'):null;let found=[];
for(let i=0;i<data.records.length;i++){
 const r=data.records[i];if(!query&&!r.path)continue;if(kind.value&&r.kind!==kind.value)continue;if(tag.value&&!r.tags.includes(tag.value))continue;
 let score=0;for(const [key,weight]of Object.entries({title:8,path:6,description:4,tags:3,text:1})){const t=key===\'tags\'?r.tags.join(\' \'):r[key];if(re&&re.test(t))score+=weight}
 if(re&&!score)continue;found.push({...r,score,ordinal:i});
}
found.sort((a,b)=>{let n=sort.value===\'name\'?compare(a.name_order,b.name_order):sort.value===\'updated\'?compare(b.updated,a.updated):query?b.score-a.score:0;return n||a.ordinal-b.ordinal});
const count=found.length,pages=Math.max(1,Math.ceil(count/data.pageSize));page=Math.min(page,pages);
const table=el(\'table\',undefined,\'menu\'),cols=el(\'colgroup\');for(const cls of [\'icon-col\',\'\',\'type-col\'])cols.append(el(\'col\',undefined,cls));table.append(cols);table.setAttribute(\'aria-label\',\'Search results\');const body=el(\'tbody\');table.append(body);
const names={dir:[\'DIR\',\'gopher-menu\'],file:[\'FILE\',\'plain\'],markdown:[\'FILE\',\'markdown\'],image:[\'IMG\',\'image\'],archive:[\'FILE\',\'download\']};
for(const r of found.slice((page-1)*data.pageSize,page*data.pageSize)){
 const row=el(\'tr\'),iconCell=el(\'td\',undefined,\'icon-cell\'),icon=el(\'img\',undefined,\'icon\');icon.src=data.icons[r.kind===\'markdown\'?\'file\':r.kind];icon.alt=\'(\'+names[r.kind][0]+\')\';icon.width=20;icon.height=22;iconCell.append(icon);
 const cell=el(\'td\',undefined,\'label\'),link=el(\'a\',r.title+(r.path?\' — \'+r.path:\'\'));link.setAttribute(\'href\',r.href);cell.append(link);
 let text=(re&&re.test(r.text)?r.text:r.description).replace(/\\s+/gu,\' \');const match=re?.exec(text);const start=match?Math.max(0,match.index-70):0;const snippet=(start?\'…\':\'\')+text.slice(start,start+240)+(text.length>start+240?\'…\':\'\');
 if(snippet){cell.append(el(\'br\'),el(\'span\',snippet,\'summary\'))}
 row.append(iconCell,cell,el(\'td\',names[r.kind][1],\'type\'));body.append(row);
}
results.replaceChildren(count?table:el(\'p\',\'No matching entries. Try a shorter phrase or clear a filter.\',\'notice\'));
status.textContent=query?`${count} results for “${query}”.`:`${count} entries.`;
pager.replaceChildren();if(pages>1){
 const button=(label,target)=>{const b=el(\'button\',label);b.type=\'button\';b.addEventListener(\'click\',()=>{page=target;update(true);status.scrollIntoView({block:\'nearest\'});status.focus({preventScroll:true})});return b};
 if(page>1)pager.append(button(\'Previous\',page-1));pager.append(el(\'span\',` Page ${page} of ${pages} `));if(page<pages)pager.append(button(\'Next\',page+1));
}
if(write)try{const params=new URLSearchParams({index:\'1\'});if(query)params.set(\'q\',query);if(kind.value)params.set(\'kind\',kind.value);if(tag.value)params.set(\'filter_tag\',tag.value);if(sort.value!==\'relevance\')params.set(\'sort\',sort.value);if(page>1)params.set(\'page\',String(page));history.replaceState(null,\'\',location.pathname+\'?\'+params.toString()+location.hash)}catch{}
}
status.tabIndex=-1;form.hidden=false;read();update();
form.addEventListener(\'submit\',e=>{e.preventDefault();page=1;update(true)});
for(const control of [kind,tag,sort])control.addEventListener(\'change\',()=>{page=1;update(true)});
addEventListener(\'popstate\',()=>{read();update()});
})();
';
const ICONS_JSON = '{"archive":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAWCAYAAADAQbwGAAAAk0lEQVR42mNgoDJghDGCg4P/E6tp7dq1jAQVBQcH///+/SNBHBwc/B+f5UzkeCsjIwOnj5jIDStchrIQ0jil2hfOzmndjGEoAwPDf+QwZaI0VtFdihLLS5bMI+jKEw9F8cY+C6kuwmVpTEwScV7GF4ZUjWWyDUR2FbJrB48LR8OQICAqYRMTdgMXhhR5GZYfBxUAAOYeWHAiqAoSAAAAAElFTkSuQmCC","dir":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAWCAYAAADAQbwGAAAAeUlEQVR42mNgGHGAEcYItlH7j0/h2iO3GIkxkAWZs2ZJC1ZFITE1RLuQhRjXEatm7ZFbjCzE2tyU4oZXvm7OLlQvT29KYWBgE8aqeM2q6XgNe33jLPYwRJYgFzBRO9mMGjhq4GAwEJ5TXj96xPDoyWvqGQjL3MMfAABu8h+7mmPgfAAAAABJRU5ErkJggg==","error":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAWCAYAAADAQbwGAAAAjUlEQVR42mNgoDJghDGCg4P/E6tp7dq1jAQVBQcH///+/SNBHBwc/B+f5UzkeCsjIwOnj5jIDStchjJREgHYDGWiNFbRDWUhx5AZM2ZgjdS1a9cykmzgkiXzsIrHxCSR5uW1GuYMazXMCapjonZOGTWQckB0sgm+cZJ6LiQ2yQycl4n1Lu1dCMuPgwoAAAH5S6BwKFCoAAAAAElFTkSuQmCC","file":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAWCAYAAADAQbwGAAAAhElEQVR42mNgoDJghDGCg4P/E6tp7dq1jAQVBQcH///+/SNBHBwc/B+f5UzkeCsjIwOnj5jIDStchjJREgHYDGWiNFbRDWUhx5AZM2ZgjdS1a9cykmzgkiXzsIrHxCThdmFRUQVRhvf1dWCIsRCrkFgw6sJRFw4GF1JcOOB1ISw/DioAAFAZWsy0nUOCAAAAAElFTkSuQmCC","image":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAWCAYAAADAQbwGAAAAtUlEQVR42mNgoDJghDGCg4P/E6tp7dq1jAQVBQcH///+/SNBHBwc/B+f5UzkeCsjIwOnj5jIDStchjJREgHYDGWiNFbRDWUhx5AZM2ZgjdS1a9cykmzgkiXzsIrHxCRRx8voAMOFGy69IcmAAD0RymM5wuw6A9kJe/WmUgyxFac0yTMQZhi6odgsIWggLkPwGUZyGCIbhstgJmLDjVjARIlh2NRipMOlNfMpSti0zSmw/DioAABqV2Eg42msDwAAAABJRU5ErkJggg==","link":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAWCAYAAADAQbwGAAAAh0lEQVR42mNgGAXDHzCiCwQ37/6PTeHaWldGYgxkIsYwQnI4NRAykGhDiVVMjDoWUnwRJ7QIQk+NhRvqn72YESMMYQGOz/aNSIbgE2ckJuBhLkN3DbKBMDkmQkkDn2HI4jCDWQiltzgcXqUIbJwa+x9fGCLLMZJiKC455OBgItZAQmE4CqgHAG9bUZr07OQxAAAAAElFTkSuQmCC","search":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAWCAYAAADAQbwGAAAAmklEQVR42mNgGOyAEZtgaGjof3Sx1atXMxJjIBMxhuETx+tCmKYp85ZhKMxJiiLKpUzEGIYsTsilTMQYRoqhTNSO5ZFqICwpwJIGLkBM0mFCzwm4DEU2rKMk8j/RWQ9fkkA3rKJnOSPBMMTlHWwuw+ZSRlIDHZshyC4lOZaxeRPZErKSDT5DGSlJc9i8T1HCRncpNpdTzaVUAwC70VIcCYD4AQAAAABJRU5ErkJggg=="}
';
const PROJECT = 'gopher-http';
const BUILD_MARKER = '.gopher-http-build.json';
const META_LIMIT = 262144;
const DENIED_EXT = ['php','php3','php4','php5','php7','php8','phtml','pht','phar','cgi','fcgi','asp','aspx','jsp','pem','key','sqlite','sqlite3','db','bak','old','swp'];
const TEXT_EXT = ['txt','text','md','markdown','json','csv','tsv','c','h','cpp','hpp','py','sh','rs','js','css','xml','yaml','yml','toml'];

final class Failure extends \RuntimeException
{
    public function __construct(string $message, public readonly int $status = 400)
    { parent::__construct($message); }
}
function esc(string $s): string { return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE | ENT_HTML5, 'UTF-8'); }
function utf8(string $s): bool { return preg_match('//u', $s) === 1; }
function parentPath(string $p): string { $x = dirname($p); return $x === '.' ? '' : str_replace('\\', '/', $x); }
function joined(string $a, string $b): string { return $a === '' ? $b : $a . '/' . $b; }
function stringValue(mixed $v, string $what, int $max = 4096): string
{
    if (!is_string($v) || strlen($v) > $max || !utf8($v) || preg_match('/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/', $v)) {
        throw new Failure('Invalid ' . $what . '.');
    }
    return $v;
}
function encodePath(string $p): string { return implode('/', array_map('rawurlencode', explode('/', $p))); }
function relativeUrl(string $from, string $to): string
{
    $a = parentPath($from) === '' ? [] : explode('/', parentPath($from));
    $b = explode('/', $to);
    while ($a && $b && $a[0] === $b[0]) { array_shift($a); array_shift($b); }
    return str_repeat('../', count($a)) . encodePath(implode('/', $b));
}
/** URL query decoding happens once in PHP. This function NEVER decodes it again. */
function validPath(string $p): string
{
    if (strlen($p) > 4096 || !utf8($p) || preg_match('/[\x00-\x1f\x7f\\\\]/', $p)) {
        throw new Failure('Invalid path.');
    }
    if ($p === '') { return ''; }
    if ($p[0] === '/' || str_ends_with($p, '/')) { throw new Failure('Use a relative path without a trailing slash.'); }
    $parts = explode('/', $p);
    if (count($parts) > 64) { throw new Failure('Path is too deep.'); }
    foreach ($parts as $part) {
        if ($part === '' || $part === '.' || $part === '..' || $part[0] === '.' || str_ends_with($part, '~')) {
            throw new Failure('Not found.', 404);
        }
    }
    return $p;
}
/** Resolve a content-author's relative link, permitting .. only inside the root. */
function contentPath(string $base, string $target, bool $urlEncoded = false): string
{
    if ($urlEncoded) { $target = rawurldecode($target); }
    if (preg_match('/[\x00-\x1f\x7f\\\\]/', $target) || !utf8($target)) { throw new Failure('Invalid content link.'); }
    $parts = str_starts_with($target, '/') ? [] : ($base === '' ? [] : explode('/', $base));
    foreach (explode('/', $target) as $part) {
        if ($part === '' || $part === '.') { continue; }
        if ($part === '..') {
            if (!$parts) { throw new Failure('A content link escapes the content root.'); }
            array_pop($parts);
        } else { $parts[] = $part; }
    }
    return validPath(implode('/', $parts));
}
/** Links are navigation, never a server-side fetch. */
function externalUrl(string $s, bool $gopher = false): ?string
{
    $s = trim($s);
    if (!utf8($s) || preg_match('/[\x00-\x20\x7f\\\\]/', $s)) { return null; }
    if (!preg_match('~^(https?|mailto' . ($gopher ? '|gopher' : '') . '):~i', $s)) { return null; }
    $u = parse_url($s);
    if ($u === false || !isset($u['scheme'])) { return null; }
    if (strtolower($u['scheme']) !== 'mailto' && empty($u['host'])) { return null; }
    return $s;
}
function readLimited(string $file, int $limit): string
{
    $h = @fopen($file, 'rb');
    if ($h === false) { throw new Failure('A content file cannot be read.', 500); }
    try { $s = stream_get_contents($h, $limit + 1); } finally { fclose($h); }
    if ($s === false || strlen($s) > $limit) { throw new Failure('This text is too large to render. Use its download link.', 413); }
    if (!utf8($s)) { throw new Failure('Text must be UTF-8. Use its download link.', 415); }
    return preg_replace('/^\xEF\xBB\xBF/', '', $s) ?? $s;
}
function jsonFile(string $file): array
{
    try { $a = json_decode(readLimited($file, META_LIMIT), true, 32, JSON_THROW_ON_ERROR); }
    catch (\JsonException) { throw new Failure('Invalid JSON metadata.', 500); }
    if (!is_array($a)) { throw new Failure('Metadata must be a JSON object.', 500); }
    return $a;
}

/** 3.0.0 publishing features. Bundled inside the GopherHTTP namespace. */
function jsonSafe(mixed $value): string
{ return json_encode($value,JSON_HEX_TAG|JSON_HEX_AMP|JSON_HEX_APOS|JSON_HEX_QUOT|JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR); }
function xml(string $s): string { return htmlspecialchars($s,ENT_QUOTES|ENT_XML1|ENT_SUBSTITUTE,'UTF-8'); }
function csp(bool $frame=false): string
{
    return "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'sha256-".base64_encode(hash('sha256',SEARCH_JS,true))."'; form-action 'self'; base-uri 'none'; object-src 'none'".($frame?"; frame-ancestors 'none'":'');
}
function phrase(string $query,string $text): bool
{ return $query==='' || preg_match('~'.preg_quote($query,'~').'~iu',$text)===1; }
function excerpt(string $text,string $query=''): string
{
    $text=preg_replace('/\s+/u',' ',$text)??''; $offset=0;
    if ($query!=='' && preg_match('~'.preg_quote($query,'~').'~iu',$text,$m,PREG_OFFSET_CAPTURE)) { $offset=max(0,$m[0][1]-70); }
    $out=substr($text,$offset,240);
    while ($out!=='' && !utf8($out)) { if ((ord($out[0])&192)===128) { $out=substr($out,1); } else { $out=substr($out,0,-1); } }
    return ($offset>0?'…':'').$out.(strlen($text)>$offset+strlen($out)?'…':'');
}
function searchOptions(array $options=[]): array
{
    $o=$options+['kind'=>'','tag'=>'','sort'=>'relevance','page'=>1];
    if (!in_array($o['kind'],['','dir','file','markdown','image','archive'],true)
        || !in_array($o['sort'],['relevance','name','updated'],true)
        || !is_int($o['page']) || $o['page']<1 || $o['page']>100000) { throw new Failure('Invalid search options.'); }
    stringValue($o['tag'],'tag',80);
    return $o;
}
trait SiteFeatures
{
    private ?array $recordCache=null;
    public function item(string $p): array
    { return ($this->catalog()[$p]??[])+['title'=>'','description'=>'','tags'=>[],'author'=>'','date'=>'','updated'=>'','alt'=>'']; }
    public function pagePath(string $p,int $number=1): string
    { return $number===1?$this->outputPath($p):'_gopher/pages/'.hash('sha256',$p).'/'.$number.'.html'; }
    public function pageCount(string $p): int
    { return $this->kind($p)==='dir'?max(1,(int)ceil(count($this->menu($p))/$this->config['page_size'])):1; }
    public function checksum(string $p): string
    { $sum=hash_file('sha256',$this->fs($p)); if ($sum===false) { throw new Failure('Cannot checksum content.',500); } return $sum; }
    public function records(): array
    {
        if ($this->recordCache!==null) { return $this->recordCache; }
        $budget=$this->config['search_budget_bytes']; $records=[]; $omitted=0;
        foreach ($this->walk() as $p) {
            if (in_array(basename($p),['index.md','index.txt'],true)) { continue; }
            $kind=$this->kind($p); $item=$this->item($p); $text=''; $indexed=true;
            $textPath=$kind==='dir'?$this->intro($p):(in_array($kind,['file','markdown'],true)?$p:null);
            if ($textPath!==null) {
                $size=filesize($this->fs($textPath));
                if ($size>$budget || $size>$this->config['max_text_bytes']) { $indexed=false; }
                else { try { $text=$this->text($textPath); $budget-=strlen($text); } catch(Failure $e) { if (!in_array($e->status,[413,415],true)) { throw $e; } $indexed=false; } }
            }
            if (!$indexed) { $omitted++; }
            $records[]=['path'=>$p,'title'=>$this->title($p),'kind'=>$kind,'description'=>$item['description'],
                'tags'=>$item['tags'],'updated'=>$item['updated']?:$item['date'],'date'=>$item['date'],'author'=>$item['author'],
                'text'=>$text,'body_indexed'=>$indexed,'size'=>$kind==='dir'?0:filesize($this->fs($p))];
        }
        $sorted=array_keys($records);
        usort($sorted,static fn($a,$b)=>strcmp($records[$a]['title'],$records[$b]['title'])?:strcmp($records[$a]['path'],$records[$b]['path']));
        foreach($sorted as $rank=>$i) { $records[$i]['name_order']=$rank; }
        return $this->recordCache=['records'=>$records,'omitted'=>$omitted,'bytes'=>$this->config['search_budget_bytes']-$budget];
    }
    public function search(string $query,array $options=[]): array
    {
        $o=searchOptions($options); $data=$this->records(); $result=[];
        foreach ($data['records'] as $i=>$r) {
            if ($query==='' && $r['path']==='') { continue; }
            if ($o['kind']!=='' && $r['kind']!==$o['kind']) { continue; }
            if ($o['tag']!=='' && !in_array($o['tag'],$r['tags'],true)) { continue; }
            $score=0;
            foreach (['title'=>8,'path'=>6,'description'=>4,'tags'=>3,'text'=>1] as $key=>$weight) {
                $value=$key==='tags'?implode(' ',$r['tags']):$r[$key];
                if ($query!=='' && phrase($query,$value)) { $score+=$weight; }
            }
            if ($query!=='' && $score===0) { continue; }
            $r['score']=$score; $r['ordinal']=$i;
            $r['snippet']=excerpt($query!=='' && phrase($query,$r['text'])?$r['text']:$r['description'],$query);
            $result[]=$r;
        }
        usort($result,static function($a,$b)use($o,$query){
            if ($o['sort']==='updated') { $n=strcmp($b['updated'],$a['updated']); }
            elseif ($o['sort']==='relevance' && $query!=='') { $n=$b['score']<=>$a['score']; }
            else { $n=0; }
            return $n?:($a['ordinal']<=>$b['ordinal']);
        });
        if ($o['sort']==='name') { usort($result,static fn($a,$b)=>strcmp($a['title'],$b['title'])?:strcmp($a['path'],$b['path'])); }
        return ['results'=>$result,'omitted'=>$data['omitted']];
    }
    public function dated(): array
    {
        $out=[];
        foreach ($this->catalog() as $p=>$item) {
            $p=(string)$p;
            if ($item['date']==='' || $this->kind($p)==='dir') { continue; }
            $out[]=['path'=>$p,'title'=>$this->title($p)]+$item;
        }
        usort($out,static fn($a,$b)=>strcmp($b['updated']?:$b['date'],$a['updated']?:$a['date'])?:strcmp($a['path'],$b['path']));
        return $out;
    }
}
trait RendererFeatures
{
    private string $activePath='';
    private array $pageIds=[];
    private array $fragments=[];
    private array $siblingCache=[];
    public function pageHref(string $p,int $number=1): string
    {
        if ($this->static) { return relativeUrl($this->current,$this->site->pagePath($p,$number)); }
        return rawurlencode($this->entry).'?'.http_build_query(['p'=>$p,'page'=>$number],'','&',PHP_QUERY_RFC3986);
    }
    private function pager(string $p,int $number,int $count): string
    {
        if ($count<2) { return ''; }
        $s='<nav class="pagination" aria-label="Directory pages">';
        if ($number>1) { $s.='<a rel="prev" href="'.esc($this->pageHref($p,$number-1)).'">Previous</a> · '; }
        $s.='Page '.$number.' of '.$count;
        if ($number<$count) { $s.=' · <a rel="next" href="'.esc($this->pageHref($p,$number+1)).'">Next</a>'; }
        return $s.'</nav>';
    }
    private function extras(string $p): string
    {
        $item=$this->site->item($p); $out=''; $parts=[];
        if ($item['author']!=='') { $parts[]='By '.esc($item['author']); }
        if ($item['date']!=='') { $parts[]='Published <time datetime="'.$item['date'].'">'.$item['date'].'</time>'; }
        if ($item['updated']!=='') { $parts[]='Updated <time datetime="'.$item['updated'].'">'.$item['updated'].'</time>'; }
        if ($parts) { $out.='<p class="notice metadata">'.implode(' · ',$parts).'</p>'; }
        if ($this->site->kind($p)!=='dir' && $this->site->config['show_checksums']) {
            $out.='<details class="integrity"><summary>SHA-256 checksum</summary><code>'.$this->site->checksum($p).'</code></details>';
        }
        return $out;
    }
    private function siblings(string $p): string
    {
        if ($p==='' || $this->site->kind($p)==='dir') { return ''; }
        $parent=parentPath($p);
        if (!isset($this->siblingCache[$parent])) {
            $paths=[];
            foreach($this->site->children($parent) as $child) {
                if ($this->site->kind($child)!=='dir' && !in_array(basename($child),['index.md','index.txt'],true)) { $paths[]=$child; }
            }
            $this->siblingCache[$parent]=[$paths,array_flip($paths)];
        }
        [$paths,$positions]=$this->siblingCache[$parent];
        $i=$positions[$p]??null; if ($i===null) { return ''; } $links=[];
        if ($i>0) { $prev=$paths[$i-1]; $links[]='<a rel="prev" href="'.esc($this->href($prev)).'">Previous: '.esc($this->site->title($prev)).'</a>'; }
        if ($i<count($paths)-1) { $next=$paths[$i+1]; $links[]='<a rel="next" href="'.esc($this->href($next)).'">Next: '.esc($this->site->title($next)).'</a>'; }
        return $links?'<nav class="siblings" aria-label="Adjacent files">'.implode(' · ',$links).'</nav>':'';
    }
    private function contents(string $html): string
    {
        preg_match_all('~<h([1-6]) id="([^"]+)">(.*?)</h\1>~s',$html,$heads,PREG_SET_ORDER);
        if (count($heads)<3) { return ''; }
        $s='<details class="contents" open><summary>On this page</summary><nav aria-label="Document contents"><ul>';
        foreach($heads as $h) { $s.='<li class="level-'.$h[1].'"><a href="#'.$h[2].'">'.esc(html_entity_decode(strip_tags($h[3]),ENT_QUOTES|ENT_HTML5,'UTF-8')).'</a></li>'; }
        return $s.'</ul></nav></details>';
    }
    public function validateFragments(): void
    {
        foreach($this->fragments as [$p,$fragment]) {
            if (!isset($this->pageIds[$p][$fragment])) { $this->warnings[$p.'#'.$fragment]='Unresolved Markdown section: '.$p.'#'.$fragment; }
        }
    }
    public function recent(): string
    {
        $this->current='_gopher/recent.html';$rows=[];
        foreach($this->site->dated() as $r) { $rows[]=['kind'=>$this->site->kind($r['path']),'path'=>$r['path'],'label'=>$r['title'],'description'=>($r['updated']?:$r['date']).' · '.$r['description']]; }
        return $this->layout('Recently updated','<p class="notice">Dates are supplied by the author; file-copy times do not change this list.</p>'.$this->rows($rows),'',true);
    }
    private function generatedHref(string $type): string
    {
        if ($this->static) { return relativeUrl($this->current,'_gopher/'.['recent'=>'recent.html','atom'=>'atom.xml','rss'=>'rss.xml','sitemap'=>'sitemap.xml'][$type]); }
        return rawurlencode($this->entry).'?'.($type==='recent'?'recent=1':($type==='sitemap'?'sitemap=1':'feed='.$type));
    }
    private function absolute(string $p): string
    {
        return $this->site->config['base_url'].($this->static?encodePath($this->site->outputPath($p)):rawurlencode($this->entry).($p===''?'':'?p='.rawurlencode($p)));
    }
    public function xmlOutput(string $type): string
    {
        if ($this->site->config['base_url']==='') { throw new Failure('Set base_url to publish feeds and sitemap.',404); }
        $head='<?xml version="1.0" encoding="UTF-8"?>' . "\n";
        if ($type==='sitemap') {
            $s=$head.'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
            foreach($this->site->walk() as $p) {
                if (in_array(basename($p),['index.md','index.txt'],true)) { continue; }
                $item=$this->site->item($p); $date=$item['updated']?:$item['date'];
                $s.='<url><loc>'.xml($this->absolute($p)).'</loc>'.($date!==''?'<lastmod>'.$date.'</lastmod>':'').'</url>';
            }
            return $s.'</urlset>' . "\n";
        }
        $entries=array_slice($this->site->dated(),0,50); $updated=$entries?($entries[0]['updated']?:$entries[0]['date']):'1970-01-01';
        $name=$this->site->config['site_name']; $home=$this->absolute('');
        $self=$this->site->config['base_url'].($this->static?'_gopher/'.$type.'.xml':rawurlencode($this->entry).'?feed='.$type);
        if ($type==='atom') {
            $s=$head.'<feed xmlns="http://www.w3.org/2005/Atom"><id>'.xml($home).'</id><title>'.xml($name).'</title><updated>'.$updated.'T00:00:00Z</updated><link href="'.xml($home).'"/><link rel="self" href="'.xml($self).'"/><author><name>'.xml($name).'</name></author>';
            foreach($entries as $r) {
                $url=$this->absolute($r['path']);
                $s.='<entry><id>'.xml($url).'</id><title>'.xml($r['title']).'</title><link href="'.xml($url).'"/><published>'.$r['date'].'T00:00:00Z</published><updated>'.($r['updated']?:$r['date']).'T00:00:00Z</updated><summary type="text">'.xml($r['description']).'</summary>';
                if ($r['author']!=='') { $s.='<author><name>'.xml($r['author']).'</name></author>'; }
                foreach($r['tags'] as $tag) { $s.='<category term="'.xml($tag).'"/>'; } $s.='</entry>';
            }
            return $s.'</feed>' . "\n";
        }
        $s=$head.'<rss version="2.0"><channel><title>'.xml($name).'</title><link>'.xml($home).'</link><description>'.xml($this->site->config['description']?:$name).'</description>';
        foreach($entries as $r) { $url=$this->absolute($r['path']);$s.='<item><title>'.xml($r['title']).'</title><link>'.xml($url).'</link><guid isPermaLink="true">'.xml($url).'</guid><pubDate>'.gmdate('D, d M Y H:i:s',strtotime($r['date'].'T00:00:00Z')).' GMT</pubDate><description>'.xml($r['description']).'</description></item>'; }
        return $s.'</channel></rss>' . "\n";
    }
    public function index(string $query='',array $options=[]): string
    {
        $this->current='_gopher/index.html'; $o=searchOptions($options); $query=trim($query);
        $data=$this->site->search($query,$o);$found=$data['results'];$count=count($found);
        $size=$this->site->config['search_page_size'];$pages=max(1,(int)ceil($count/$size));
        if (!$this->static && $o['page']>$pages) { throw new Failure('Search page not found.',404); }
        $form='<form id="search-form" class="search" method="get" action="'.esc($this->static?'index.html':rawurlencode($this->entry)).'"'.($this->static?' hidden':'').'><input type="hidden" name="index" value="1"><label for="q">Search names, descriptions, tags and readable text (literal phrase):</label><input id="q" name="q" type="search" maxlength="200" value="'.esc($query).'"><div class="filters"><label for="kind">Type <select id="kind" name="kind">';
        foreach([''=>'All types','dir'=>'Directories','markdown'=>'Markdown','file'=>'Text / code','image'=>'Images','archive'=>'Downloads'] as $key=>$label) { $form.='<option value="'.$key.'"'.($o['kind']===$key?' selected':'').'>'.$label.'</option>'; }
        $form.='</select></label><label for="filter-tag">Tag <select id="filter-tag" name="filter_tag"><option value="">All tags</option>';
        foreach($this->site->tags() as $tag) { $form.='<option value="'.esc($tag).'"'.($o['tag']===$tag?' selected':'').'>'.esc($tag).'</option>'; }
        $form.='</select></label><label for="sort">Sort <select id="sort" name="sort">';
        foreach(['relevance'=>'Best match','name'=>'Title','updated'=>'Recently updated'] as $key=>$label) { $form.='<option value="'.$key.'"'.($o['sort']===$key?' selected':'').'>'.$label.'</option>'; }
        $form.='</select></label></div><button type="submit">Search</button> <a href="'.esc($this->indexHref()).'">Reset</a></form>';
        $rows=[];
        foreach($this->static?$found:array_slice($found,($o['page']-1)*$size,$size) as $r) { $rows[]=['kind'=>$r['kind'],'path'=>$r['path'],'label'=>$r['title'].($r['path']!==''?' — '.$r['path']:''),'description'=>$r['snippet']]; }
        $status=($query!==''?$count.' results for “'.esc($query).'”':$count.' entries').'.';
        $body=$form.'<p class="notice">'.($this->static?($this->site->config['static_search']?'Search runs locally when JavaScript is enabled. Without it, use browser Find on the complete index below.':'Use browser Find on the complete index below.'):'Search works without JavaScript.').' Body indexing is bounded to '.number_format($this->site->config['max_text_bytes']).' bytes per text and '.number_format($this->site->config['search_budget_bytes']).' bytes in total.</p>';
        if ($data['omitted']) { $body.='<p class="notice">'.$data['omitted'].' text bodies omitted because of size, encoding, or the total budget; names and catalog metadata remain searchable.</p>'; }
        $body.='<p id="search-status" class="notice" role="status" aria-live="polite">'.$status.'</p><div id="search-results">'.$this->rows($rows).'</div>';
        $nav='';
        if (!$this->static && $pages>1) {
            $params=['index'=>1,'q'=>$query,'kind'=>$o['kind'],'filter_tag'=>$o['tag'],'sort'=>$o['sort']];
            if ($o['page']>1) { $nav.='<a rel="prev" href="'.esc(rawurlencode($this->entry).'?'.http_build_query($params+['page'=>$o['page']-1],'','&',PHP_QUERY_RFC3986)).'">Previous</a> · '; }
            $nav.='Page '.$o['page'].' of '.$pages;
            if ($o['page']<$pages) { $nav.=' · <a rel="next" href="'.esc(rawurlencode($this->entry).'?'.http_build_query($params+['page'=>$o['page']+1],'','&',PHP_QUERY_RFC3986)).'">Next</a>'; }
        }
        $body.='<nav id="search-pages" class="pagination" aria-label="Search result pages">'.$nav.'</nav>';
        if ($this->static && $this->site->config['static_search']) {
            $records=$this->site->records()['records'];
            foreach($records as &$record) { $record['href']=$this->href($record['path']); } unset($record);
            $body.='<script type="application/json" id="search-data">'.jsonSafe(['records'=>$records,'pageSize'=>$size,'icons'=>json_decode(ICONS_JSON,true)]).'</script><script>'.SEARCH_JS.'</script>';
        }
        return $this->layout($query!==''?'Search results':'Site index',$body,'',true);
    }
}


final class Site
{
    use SiteFeatures;
    public readonly string $root;
    public array $config = [
        'site_name' => 'Gopher', 'gopher_host' => 'localhost', 'gopher_port' => 70,
        'external_gopher' => 'disabled', 'max_text_bytes' => 2097152,
        'max_entries' => 10000, 'show_types' => true, 'footer' => true,
        'description' => '', 'language' => 'en', 'base_url' => '',
        'page_size' => 100, 'search_page_size' => 30, 'search_budget_bytes' => 16777216,
        'static_search' => true, 'show_checksums' => false, 'show_details' => true,
    ];
    private array $kinds = [];
    private array $metas = [];
    private ?array $catalog = null;
    public array $warnings = [];
    public function __construct(string $root)
    {
        $real = realpath($root);
        if ($real === false || !is_dir($real) || !is_readable($real)) { throw new Failure('The content directory is unavailable.', 503); }
        $this->root = rtrim(str_replace('\\', '/', $real), '/');
        if ($this->root === '') { throw new Failure('The filesystem root cannot be a content directory.'); }
        $cfg = $this->root . '/.site.json';
        if (is_link($cfg)) { throw new Failure('Metadata may not be a symbolic link.', 500); }
        if (is_file($cfg)) {
            $a = jsonFile($cfg);
            foreach ($a as $key => $value) {
                if (!array_key_exists($key, $this->config)) { throw new Failure('Unknown site setting: ' . (string)$key, 500); }
                if (is_bool($this->config[$key])) {
                    if (!is_bool($value)) { throw new Failure('A boolean site setting has the wrong type.', 500); }
                } elseif (is_int($this->config[$key])) {
                    if (!is_int($value) || $value < 1) { throw new Failure('An integer site setting has the wrong type.', 500); }
                } else { stringValue($value, 'site setting'); }
                $this->config[$key] = $value;
            }
        }
        if (!in_array($this->config['external_gopher'], ['disabled','link'], true)
            || $this->config['gopher_port'] > 65535 || $this->config['max_text_bytes'] > 16777216
            || $this->config['max_entries'] > 100000) { throw new Failure('A site setting is out of range.', 500); }
        if ($this->config['page_size']>1000 || $this->config['search_page_size']>200 || $this->config['search_budget_bytes']>67108864
            || !preg_match('/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/',$this->config['language'])) { throw new Failure('Invalid publishing setting.',500); }
        $base=$this->config['base_url'];
        if ($base!=='') {
            $url=parse_url($base);
            if (externalUrl($base)===null || !in_array(strtolower($url['scheme']??''),['http','https'],true)
                || isset($url['query']) || isset($url['fragment']) || isset($url['user']) || isset($url['pass'])) { throw new Failure('base_url must be an absolute HTTP(S) directory URL.',500); }
            $this->config['base_url']=rtrim($base,'/').'/';
        }
    }
    private function permitted(string $p): bool
    {
        foreach (explode('/', $p) as $name) {
            if ($name === 'gophermap' || $name === '_gopher' || in_array(strtolower(pathinfo($name, PATHINFO_EXTENSION)), DENIED_EXT, true)) { return false; }
        }
        return true;
    }
    public function fs(string $p, bool $metadata = false): string
    {
        if (!$metadata) { validPath($p); }
        $cur = $this->root;
        foreach ($p === '' ? [] : explode('/', $p) as $part) {
            $cur .= '/' . $part;
            if (is_link($cur)) { throw new Failure('Not found.', 404); }
        }
        if (!$metadata && $p !== '' && !$this->permitted($p)) { throw new Failure('Not found.', 404); }
        if (!file_exists($cur) || (!is_dir($cur) && !is_file($cur)) || !is_readable($cur)) { throw new Failure('Not found.', 404); }
        // Lexical checks above plus a canonical boundary check; no links are followed.
        $r = realpath($cur);
        if ($r === false || ($r !== $this->root && !str_starts_with(str_replace('\\', '/', $r), $this->root . '/'))) {
            throw new Failure('Not found.', 404);
        }
        return $cur;
    }
    public function kind(string $p): string
    {
        if (isset($this->kinds[$p])) { return $this->kinds[$p]; }
        $f = $this->fs($p);
        if (is_dir($f)) { return $this->kinds[$p] = 'dir'; }
        $ext = strtolower(pathinfo($p, PATHINFO_EXTENSION));
        if (in_array($ext, ['png','gif','jpg','jpeg','webp','avif'], true)) {
            $info = @getimagesize($f);
            if (is_array($info) && in_array($info['mime'] ?? '', ['image/png','image/gif','image/jpeg','image/webp','image/avif'], true)) {
                return $this->kinds[$p] = 'image';
            }
        }
        if (in_array($ext, ['md','markdown'], true)) { return $this->kinds[$p] = 'markdown'; }
        return $this->kinds[$p] = (in_array($ext, TEXT_EXT, true) ? 'file' : 'archive');
    }
    public function children(string $p): array
    {
        if ($this->kind($p) !== 'dir') { throw new Failure('Not a directory.', 404); }
        $names = @scandir($this->fs($p));
        if ($names === false) { throw new Failure('A directory cannot be read.', 500); }
        $out = [];
        foreach ($names as $n) {
            if ($n === '' || $n[0] === '.' || $n === 'gophermap' || str_ends_with($n, '~')) { continue; }
            if (!utf8($n)) { throw new Failure('Content filenames must be UTF-8.', 500); }
            $t = joined($p, $n);
            try { $this->fs($t); $out[] = $t; }
            catch (Failure) { $this->warnings[$t] = 'Skipped non-public or unsupported entry: ' . $t; }
        }
        usort($out, function (string $a, string $b): int {
            $da = is_dir($this->root . '/' . $a); $db = is_dir($this->root . '/' . $b);
            return ($db <=> $da) ?: (strnatcasecmp(basename($a), basename($b)) ?: strcmp($a, $b));
        });
        return $out;
    }
    public function walk(): array
    {
        $out = []; $pending = [''];
        while ($pending) {
            $p = array_pop($pending); $out[] = $p;
            if (count($out) > $this->config['max_entries']) { throw new Failure('Content tree exceeds max_entries.', 413); }
            if ($this->kind($p) === 'dir') {
                foreach (array_reverse($this->children($p)) as $child) { $pending[] = $child; }
            }
        }
        return $out;
    }
    public function meta(string $dir): array
    {
        if (isset($this->metas[$dir])) { return $this->metas[$dir]; }
        $f = $this->fs($dir) . '/.menu.json';
        if (is_link($f)) { throw new Failure('Metadata may not be a symbolic link.', 500); }
        $a = is_file($f) ? jsonFile($f) : [];
        foreach ($a as $key => $value) {
            if (!in_array($key, ['title','entries'], true)) { throw new Failure('Unknown menu field: ' . (string)$key, 500); }
        }
        if (array_key_exists('title',$a)) { stringValue($a['title'], 'menu title', 200); }
        if (array_key_exists('entries',$a) && (!is_array($a['entries']) || !array_is_list($a['entries']))) { throw new Failure('Menu entries must be a JSON array.', 500); }
        return $this->metas[$dir] = $a;
    }
    public function title(string $p): string
    {
        if (isset($this->catalog()[$p]['title']) && $this->catalog()[$p]['title']!=='') { return $this->catalog()[$p]['title']; }
        if ($this->kind($p) === 'dir') { return $this->meta($p)['title'] ?? ($p === '' ? $this->config['site_name'] : basename($p)); }
        return basename($p);
    }
    public function text(string $p): string { return readLimited($this->fs($p), $this->config['max_text_bytes']); }
    /** Optional cross-directory descriptions and tags. No catalog data is executable. */
    public function catalog(): array
    {
        if ($this->catalog !== null) { return $this->catalog; }
        $file=$this->root.'/.catalog.json';
        if (is_link($file)) { throw new Failure('Catalog may not be a symbolic link.',500); }
        if (!is_file($file)) { return $this->catalog=[]; }
        try { $data=json_decode(readLimited($file,2097152),true,32,JSON_THROW_ON_ERROR); }
        catch (\JsonException) { throw new Failure('Invalid catalog JSON.',500); }
        if (!is_array($data) || array_keys($data)!==['items'] || !is_array($data['items']) || count($data['items'])>10000) {
            throw new Failure('Catalog must have an items object with at most 10000 paths.',500);
        }
        $items=[]; $uniqueTags=[];
        foreach ($data['items'] as $path=>$value) {
            $path=(string)$path;
            if (!is_string($path) || $path==='' || validPath($path)!==$path || !is_array($value)
                || array_diff(array_keys($value),['description','tags','title','author','date','updated','alt']) || !$value) {
                throw new Failure('Invalid catalog item.',500);
            }
            try { $this->kind($path); }
            catch (Failure) { throw new Failure('Catalog target is not public: '.$path,500); }
            $description=array_key_exists('description',$value)?stringValue($value['description'],'description',1000):'';
            $tags=$value['tags']??[];
            if (!is_array($tags) || !array_is_list($tags) || count($tags)>16) { throw new Failure('Invalid catalog tags.',500); }
            $seen=[];
            foreach ($tags as $tag) {
                $tag=stringValue($tag,'tag',80);
                if ($tag==='' || trim($tag)!==$tag || preg_match('/[\r\n\t]/',$tag) || isset($seen[strtolower($tag)])) { throw new Failure('Empty or repeated catalog tag.',500); }
                $seen[strtolower($tag)]=true;
                $uniqueTags[$tag]=true;
            }
            $items[$path]=['description'=>$description,'tags'=>$tags];
            foreach (['title','author','alt'] as $key) { $items[$path][$key]=array_key_exists($key,$value)?stringValue($value[$key],$key,$key==='alt'?1000:200):''; }
            foreach (['date','updated'] as $key) {
                $date=array_key_exists($key,$value)?stringValue($value[$key],$key,10):'';
                if ($date!=='' && (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/',$date,$parts) || !checkdate((int)$parts[2],(int)$parts[3],(int)$parts[1]))) { throw new Failure('Catalog dates must be valid YYYY-MM-DD dates.',500); }
                $items[$path][$key]=$date;
            }
            if ($items[$path]['updated']!=='' && $items[$path]['date']!=='' && $items[$path]['updated']<$items[$path]['date']) { throw new Failure('Updated date precedes publication date.',500); }
        }
        if (count($uniqueTags)>256) { throw new Failure('Catalog exceeds 256 distinct tags.',500); }
        return $this->catalog=$items;
    }
    public function tags(): array
    {
        $tags=[];
        foreach ($this->catalog() as $item) { foreach ($item['tags'] as $tag) { $tags['@'.$tag]=$tag; } }
        $result=array_values($tags); usort($result,static fn($a,$b)=>strnatcasecmp($a,$b)?:strcmp($a,$b));
        return $result;
    }
    public function tagPath(string $tag): string { return '_gopher/tags/'.hash('sha256',$tag).'.html'; }
    private function pathEntry(string $base, string $target, ?string $label): array
    {
        $p = contentPath($base, $target);
        try { $kind = $this->kind($p); }
        catch (Failure) { throw new Failure('Menu link has no public target: ' . joined($base, $target), 500); }
        return ['kind' => $kind, 'path' => $p, 'label' => $label ?? $this->title($p)];
    }
    public function menu(string $dir): array
    {
        $meta = $this->meta($dir); $rows = []; $used = []; $auto = false;
        if (array_key_exists('entries', $meta)) {
            foreach ($meta['entries'] as $e) {
                if (!is_array($e)) { throw new Failure('Each menu entry must be an object.', 500); }
                $types = array_intersect(['text','path','url','auto','search','tags'], array_keys($e));
                if (count($types) !== 1 || array_diff(array_keys($e), ['text','path','url','auto','search','tags','label'])) { throw new Failure('Invalid menu entry fields.', 500); }
                $label = array_key_exists('label',$e) ? stringValue($e['label'], 'label', 1000) : null;
                if (array_key_exists('text',$e)) {
                    foreach (explode("\n", str_replace("\r\n", "\n", stringValue($e['text'], 'information text', 32768))) as $line) { $rows[] = ['kind'=>'info','label'=>$line]; }
                } elseif (array_key_exists('path',$e)) {
                    $row = $this->pathEntry($dir, stringValue($e['path'], 'menu path'), $label); $rows[] = $row; $used[$row['path']] = true;
                } elseif (array_key_exists('url',$e)) {
                    $u = externalUrl(stringValue($e['url'], 'URL'), $this->config['external_gopher'] === 'link');
                    if ($u === null) { throw new Failure('Unsafe or unsupported menu URL.', 500); }
                    $rows[] = ['kind'=>'link','url'=>$u,'label'=>$label ?? $u];
                } elseif (array_key_exists('search',$e)) {
                    if ($e['search'] !== true) { throw new Failure('search must be true.', 500); }
                    $rows[] = ['kind'=>'search','label'=>$label ?? 'Search / site index','index'=>true];
                } elseif (array_key_exists('tags',$e)) {
                    if ($e['tags'] !== true) { throw new Failure('tags must be true.',500); }
                    $rows[]=['kind'=>'tags','label'=>$label ?? 'Browse tags'];
                } else {
                    if ($e['auto'] !== true || $auto) { throw new Failure('Use at most one auto:true entry.', 500); }
                    $rows[] = ['kind'=>'auto']; $auto = true;
                }
            }
        } else {
            $map = $this->fs($dir) . '/gophermap';
            if (is_link($map)) { throw new Failure('A gophermap may not be a symbolic link.', 500); }
            if (is_file($map)) { return $this->gophermap($dir, readLimited($map, META_LIMIT)); }
            $rows[] = ['kind'=>'auto'];
        }
        $result = [];
        foreach ($rows as $r) {
            if ($r['kind'] !== 'auto') { $result[] = $r; continue; }
            foreach ($this->children($dir) as $p) {
                if (isset($used[$p]) || in_array(basename($p), ['index.md','index.txt'], true)) { continue; }
                $result[] = ['kind'=>$this->kind($p),'path'=>$p,'label'=>$this->title($p)];
            }
        }
        return $result;
    }
    private function gophermap(string $dir, string $text): array
    {
        $rows = []; $lines = explode("\n", str_replace(["\r\n", "\r"], "\n", $text));
        if (end($lines) === '') { array_pop($lines); }
        foreach ($lines as $line) {
            if ($line === '.') { continue; }
            if (!str_contains($line, "\t")) { $rows[] = ['kind'=>'info','label'=>$line]; continue; }
            $t = $line[0]; $f = explode("\t", substr($line, 1));
            if (count($f) < 2 || !str_contains('i013579gIh8', $t)) { throw new Failure('Invalid or unsupported gophermap line.', 500); }
            [$label, $selector] = $f; $host = $f[2] ?? ''; $port = $f[3] ?? (string)$this->config['gopher_port'];
            if ($t === 'i' || $t === '3') { $rows[] = ['kind'=>$t === '3' ? 'error' : 'info','label'=>$label]; continue; }
            if ($t === 'h' && str_starts_with($selector, 'URL:')) {
                $u = externalUrl(substr($selector, 4));
                if ($u === null) { throw new Failure('Unsafe gophermap URL.', 500); }
                $rows[] = ['kind'=>'link','url'=>$u,'label'=>$label]; continue;
            }
            if (!ctype_digit($port) || (int)$port < 1 || (int)$port > 65535) { throw new Failure('Invalid Gopher port.', 500); }
            $local = $host === '' || (strcasecmp($host, $this->config['gopher_host']) === 0 && (int)$port === $this->config['gopher_port']);
            if ($t === '8') { $rows[] = ['kind'=>'error','label'=>$label . ' [Telnet service unavailable over HTTP]']; }
            elseif ($t === '7') {
                $rows[] = $local ? ['kind'=>'search','label'=>$label,'index'=>true] : ['kind'=>'error','label'=>$label . ' [external Gopher search unavailable]'];
            } elseif ($local) { $rows[] = $this->pathEntry($dir, $selector, $label); }
            elseif ($this->config['external_gopher'] === 'disabled') {
                $rows[] = ['kind'=>'error','label'=>$label . ' [external Gopher link disabled]'];
            } else {
                if (!preg_match('/^(?:[a-z0-9][a-z0-9.-]*|\[[0-9a-f:]+\])$/i', $host)) { throw new Failure('Invalid Gopher host.', 500); }
                $u = 'gopher://' . $host . ':' . $port . '/' . $t . encodePath($selector);
                $rows[] = ['kind'=>'link','url'=>$u,'label'=>$label . ' [Gopher client required]'];
            }
        }
        return $rows;
    }
    public function intro(string $dir): ?string
    {
        foreach (['index.md','index.txt'] as $name) {
            $p = joined($dir, $name);
            if (is_file($this->root . '/' . $p) && !is_link($this->root . '/' . $p)) { $this->fs($p); return $p; }
        }
        return null;
    }
    public function outputPath(string $p): string
    { return $this->kind($p) === 'dir' ? joined($p, 'index.html') : $p . '.html'; }
    public function rawInfo(string $p): array
    {
        $kind = $this->kind($p);
        if ($kind === 'dir') { throw new Failure('Directories cannot be downloaded as files.', 400); }
        $mime = 'application/octet-stream'; $ext = 'bin';
        if ($kind === 'image') {
            $info = @getimagesize($this->fs($p)); $mime = $info['mime'] ?? $mime;
            $ext = ['image/png'=>'png','image/gif'=>'gif','image/jpeg'=>'jpg','image/webp'=>'webp','image/avif'=>'avif'][$mime] ?? 'bin';
        } elseif (in_array($kind, ['file','markdown'], true)) { $mime = 'text/plain; charset=utf-8'; $ext = 'txt'; }
        return ['path'=>'_gopher/files/' . hash('sha256', $p) . '.' . $ext, 'mime'=>$mime, 'attachment'=>$kind === 'archive'];
    }
}

/** Deliberately bounded Markdown subset; never accepts raw HTML or executes code. */
final class Markdown
{
    private array $ids = [];
    private array $references = [];
    public function __construct(private readonly Renderer $renderer, private readonly string $base) {}
    private function headingId(string $text): string
    {
        $id = trim(preg_replace('/[^\p{L}\p{N}]+/u', '-', strtolower($text)) ?? '', '-');
        if ($id === '') { $id = 'section'; }
        $base=$id; $n=1;
        while (isset($this->ids[$id])) { $id=$base.'-'.(++$n); }
        $this->ids[$id]=true; return $id;
    }
    private function linkAt(string $s, int $start): ?array
    {
        $image = substr($s, $start, 2) === '!['; $open = $start + ($image ? 1 : 0);
        if (($s[$open] ?? '') !== '[') { return null; }
        $i = $open + 1; $nest = 1; $len = strlen($s);
        for (; $i < $len; $i++) {
            if ($s[$i] === '\\') { $i++; continue; }
            if ($s[$i] === '[') { $nest++; }
            if ($s[$i] === ']' && --$nest === 0) { break; }
        }
        if ($i >= $len || ($s[$i+1] ?? '') !== '(') { return null; }
        $j = $i + 2; $begin = $j; $depth = 1; $angle = false;
        for (; $j < $len; $j++) {
            $c = $s[$j];
            if ($c === '\\') { $j++; continue; }
            if ($c === '<') { $angle = true; } elseif ($c === '>') { $angle = false; }
            if (!$angle && $c === '(') { $depth++; }
            if (!$angle && $c === ')' && --$depth === 0) { break; }
            if ($j - $begin > 8192 || $c === "\n") { return null; }
        }
        if ($j >= $len) { return null; }
        $inside = trim(substr($s, $begin, $j-$begin));
        if (!preg_match('/^(?:<([^<>]*)>|(\S*?))(?:\s+"[^"\n]*")?$/s', $inside, $m)) { return null; }
        $url = ($m[1] ?? '') !== '' ? $m[1] : ($m[2] ?? '');
        $url = preg_replace('/\\\\([()\\\\])/', '$1', $url) ?? $url;
        return [$image, substr($s, $open+1, $i-$open-1), $url, $j+1];
    }
    public function inline(string $s, int $depth = 0): string
    {
        if ($depth > 12) { return esc($s); }
        $out = ''; $len = strlen($s);
        for ($i=0; $i<$len;) {
            $c = $s[$i];
            if ($c === '\\' && isset($s[$i+1]) && str_contains('\\`*_{}[]()#+-.!>|~', $s[$i+1])) { $out .= esc($s[$i+1]); $i+=2; continue; }
            if ($c === '`') {
                $n = strspn($s, '`', $i); $mark = str_repeat('`', $n); $end = strpos($s, $mark, $i+$n);
                if ($end !== false) { $out .= '<code>' . esc(str_replace("\n", ' ', substr($s, $i+$n, $end-$i-$n))) . '</code>'; $i=$end+$n; continue; }
            }
            if ($c === '[' || ($c === '!' && ($s[$i+1] ?? '') === '[')) {
                $link = $this->linkAt($s, $i);
                if ($link !== null) {
                    [$image, $label, $url, $next] = $link;
                    $out .= $this->renderer->markdownLink($this->base, $url, $label, $image, $this->inline($label, $depth+1));
                    $i = $next; continue;
                }
                if (preg_match('/\A(!?)\[([^\]\n]+)\](?:\[([^\]\n]*)\])?/u',substr($s,$i),$m)) {
                    $key=strtolower(preg_replace('/\s+/u',' ',trim(($m[3]??'')!==''?$m[3]:$m[2]))??'');
                    if (isset($this->references[$key])) { $out.=$this->renderer->markdownLink($this->base,$this->references[$key],$m[2],$m[1]==='!',$this->inline($m[2],$depth+1)); $i+=strlen($m[0]); continue; }
                }
            }
            if ($c === '<' && preg_match('~\A<(https?://[^<>\s]+|mailto:[^<>\s]+)>~i', substr($s,$i),$m)) {
                $out .= $this->renderer->markdownLink($this->base,$m[1],$m[1],false,esc($m[1])); $i+=strlen($m[0]); continue;
            }
            $matched = false;
            foreach (['**'=>'strong','__'=>'strong','~~'=>'del','*'=>'em','_'=>'em'] as $mark=>$tag) {
                $n = strlen($mark);
                if (substr($s,$i,$n)!==$mark || !isset($s[$i+$n]) || ctype_space($s[$i+$n])) { continue; }
                if ($mark[0] === '_' && $i > 0 && ctype_alnum($s[$i-1])) { continue; }
                $end = strpos($s,$mark,$i+$n);
                if ($end !== false && $end>$i+$n && !ctype_space($s[$end-1])) {
                    $out .= '<'.$tag.'>'.$this->inline(substr($s,$i+$n,$end-$i-$n),$depth+1).'</'.$tag.'>';
                    $i=$end+$n; $matched=true; break;
                }
            }
            if ($matched) { continue; }
            if ($c === "\n" && $i>=2 && substr($s,$i-2,2)==='  ') { $out .= '<br>'; $i++; continue; }
            // Escape runs (not bytes): UTF-8 multibyte characters must stay intact.
            $n = strcspn($s, "\\`[!<*_~\n", $i);
            if ($n === 0) { $out .= esc($c); $i++; } else { $out .= esc(substr($s,$i,$n)); $i += $n; }
        }
        return $out;
    }
    private function tableCells(string $s): array
    {
        $s=trim($s); $s=preg_replace('/^\||(?<!\\\\)\|$/','',$s)??$s;
        return array_map(static fn($x)=>trim(str_replace('\\|','|',$x)),preg_split('/(?<!\\\\)\|/',$s)?:[]);
    }
    public function render(string $text, int $depth = 0): string
    {
        if ($depth>12) { return '<pre>'.esc($text).'</pre>'; }
        $lines=explode("\n",str_replace(["\r\n","\r"],"\n",$text)); $out=''; $count=count($lines);
        if ($depth===0) {
            $fence=''; $width=0;
            foreach($lines as $lineNo=>$line) {
                if (preg_match('/^ {0,3}(`{3,}|~{3,})/',$line,$m)) {
                    if ($fence==='') { $fence=$m[1][0]; $width=strlen($m[1]); }
                    elseif ($m[1][0]===$fence && strlen($m[1])>=$width && preg_match('/^ {0,3}'.preg_quote($fence,'/').'{'.$width.',}\s*$/',$line)) { $fence=''; }
                    continue;
                }
                if ($fence==='' && preg_match('/^ {0,3}\[([^\]^]+)\]:\s*(?:<([^<>]+)>|(\S+))(?:\s+"[^"]*")?\s*$/u',$line,$m)) {
                    $key=strtolower(preg_replace('/\s+/u',' ',trim($m[1]))??'');
                    $this->references[$key]??=($m[2]!==''?$m[2]:$m[3]); $lines[$lineNo]='';
                }
            }
        }
        for ($i=0;$i<$count;) {
            $line=$lines[$i];
            if (trim($line)==='') { $i++; continue; }
            if (preg_match('/^ {0,3}(`{3,}|~{3,})(.*)$/',$line,$m)) {
                $mark=$m[1][0]; $n=strlen($m[1]); $code=[]; $language=trim($m[2]); $i++;
                while ($i<$count && !preg_match('/^ {0,3}'.preg_quote($mark,'/').'{'.$n.',}\s*$/',$lines[$i])) { $code[]=$lines[$i++]; }
                if ($i<$count) { $i++; }
                if (preg_match('/^[a-zA-Z0-9_+-]{1,40}$/',$language)) { $out.='<p class="code-language">'.esc($language).'</p>'; }
                $out.='<pre><code>'.esc(implode("\n",$code)).'</code></pre>' . "\n"; continue;
            }
            if (preg_match('/^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/',$line,$m)) {
                $n=strlen($m[1]); $out.='<h'.$n.' id="'.esc($this->headingId($m[2])).'">'.$this->inline($m[2]).'</h'.$n.'>' . "\n"; $i++; continue;
            }
            if ($i+1<$count && preg_match('/^ {0,3}(=+|-+)\s*$/',$lines[$i+1],$m)) {
                $n=$m[1][0]==='='?1:2; $out.='<h'.$n.' id="'.esc($this->headingId(trim($line))).'">'.$this->inline(trim($line)).'</h'.$n.'>' . "\n"; $i+=2; continue;
            }
            if (preg_match('/^ {0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/',$line)) { $out.="<hr>\n"; $i++; continue; }
            if (preg_match('/^ {0,3}> ?(.*)$/',$line)) {
                $block=[];
                while ($i<$count && preg_match('/^ {0,3}> ?(.*)$/',$lines[$i],$m)) { $block[]=$m[1]; $i++; }
                $out.='<blockquote>'.$this->render(implode("\n",$block),$depth+1)."</blockquote>\n"; continue;
            }
            if (preg_match('/^( {0,3})([-+*]|\d+[.)])\s+(.*)$/',$line,$m)) {
                $indent=strlen($m[1]); $ordered=ctype_digit($m[2][0]); $tag=$ordered?'ol':'ul';
                $start=$ordered ? (int)$m[2] : 1;
                $out.='<'.$tag.($ordered && $start!==1?' start="'.$start.'"':'').'>';
                while ($i<$count && preg_match('/^( {'.$indent.'})([-+*]|\d+[.)])\s+(.*)$/',$lines[$i],$m) && ctype_digit($m[2][0])===$ordered) {
                    $width=strlen($lines[$i])-strlen($m[3]); $item=[$m[3]]; $i++;
                    while ($i<$count) {
                        if (trim($lines[$i])==='') {
                            if ($i+1<$count && strspn($lines[$i+1],' ')>$indent) { $item[]=''; $i++; continue; }
                            if ($i+1<$count && preg_match('/^ {'.$indent.'}(?:[-+*]|\d+[.)])\s+/',$lines[$i+1])) { $i++; }
                            break;
                        }
                        $spaces=strspn($lines[$i],' ');
                        if ($spaces<=$indent) { break; }
                        $item[]=substr($lines[$i],min($width,$spaces)); $i++;
                    }
                    $task=''; if (preg_match('/^\[([ xX])\]\s+(.*)$/',$item[0],$taskMatch)) { $done=$taskMatch[1]!==' '; $task='<span class="task" role="img" aria-label="'.($done?'Completed':'Not completed').'">'.($done?'[x]':'[ ]').'</span> '; $item[0]=$taskMatch[2]; }
                    $out.='<li>'.$task.$this->render(implode("\n",$item),$depth+1).'</li>';
                }
                $out.='</'.$tag.">\n"; continue;
            }
            if ($i+1<$count && str_contains($line,'|') && preg_match('/^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/',$lines[$i+1])) {
                $heads=$this->tableCells($line); $out.='<div class="table-scroll"><table><thead><tr>';
                foreach($heads as $h) { $out.='<th scope="col">'.$this->inline($h).'</th>'; }
                $out.='</tr></thead><tbody>'; $i+=2;
                while($i<$count && trim($lines[$i])!=='' && str_contains($lines[$i],'|')) {
                    $cells=$this->tableCells($lines[$i++]); $out.='<tr>';
                    foreach($heads as $n=>$h) { $out.='<td>'.$this->inline($cells[$n]??'').'</td>'; } $out.='</tr>';
                }
                $out.="</tbody></table></div>\n"; continue;
            }
            $paragraph=[$line]; $i++;
            while($i<$count && trim($lines[$i])!=='' && !preg_match('/^ {0,3}(?:#{1,6}\s|>|`{3,}|~{3,}|[-+*]\s|\d+[.)]\s)/',$lines[$i])) {
                if ($i+1<$count && preg_match('/^\s*(?:=+|-+)\s*$/',$lines[$i+1])) { break; }
                $paragraph[]=$lines[$i++];
            }
            $out.='<p>'.$this->inline(implode("\n",$paragraph))."</p>\n";
        }
        return $out;
    }
}

final class Renderer
{
    use RendererFeatures;
    public array $warnings = [];
    private string $current = 'index.html';
    public function __construct(public readonly Site $site, public readonly bool $static, private readonly string $entry='index.php') {}
    public function href(string $p, bool $raw=false): string
    {
        if ($this->static) { return relativeUrl($this->current,$raw?$this->site->rawInfo($p)['path']:$this->site->outputPath($p)); }
        return rawurlencode($this->entry) . ($p==='' && !$raw?'':'?'.http_build_query(['p'=>$p]+($raw?['raw'=>'1']:[]),'','&',PHP_QUERY_RFC3986));
    }
    public function indexHref(): string
    { return $this->static?relativeUrl($this->current,'_gopher/index.html'):rawurlencode($this->entry).'?index=1'; }
    public function tagsHref(?string $tag=null): string
    {
        if ($this->static) { return relativeUrl($this->current,$tag===null?'_gopher/tags/index.html':$this->site->tagPath($tag)); }
        return rawurlencode($this->entry).($tag===null?'?tags=1':'?tag='.rawurlencode($tag));
    }
    public function markdownLink(string $base,string $url,string $label,bool $image,string $labelHtml): string
    {
        $decoded=html_entity_decode($url,ENT_QUOTES|ENT_HTML5,'UTF-8');
        if (preg_match('~^[a-z][a-z0-9+.-]*:|^//~i',$decoded)) {
            $safe=externalUrl($decoded,$this->site->config['external_gopher']==='link');
            if ($safe===null) { return $labelHtml . ' [link blocked]'; }
            return '<a href="'.esc($safe).'" rel="noreferrer">'.($image?'(IMAGE) ':'').$labelHtml.'</a>';
        }
        $u=parse_url($decoded);
        if ($u===false || isset($u['scheme']) || isset($u['host']) || isset($u['query'])) { return $labelHtml.' [link blocked]'; }
        $fragment=isset($u['fragment'])?'#'.rawurlencode(rawurldecode($u['fragment'])):'';
        if (($u['path']??'')==='' && !$image) { if ($fragment!=='') { $this->fragments[]=[$this->activePath,rawurldecode(substr($fragment,1))]; } return '<a href="'.esc($fragment===''?'#':$fragment).'">'.$labelHtml.'</a>'; }
        try {
            $p=contentPath($base,$u['path']??'',true); $kind=$this->site->kind($p);
            if ($fragment!=='' && !$image) { $this->fragments[]=[$p,rawurldecode(substr($fragment,1))]; }
            if ($image && $kind==='image') { return '<img src="'.esc($this->href($p,true)).'" alt="'.esc('(IMAGE) '.$label).'" loading="lazy" decoding="async">'; }
            return '<a href="'.esc($this->href($p).$fragment).'">'.($image?'(IMAGE) ':'').$labelHtml.'</a>';
        } catch (Failure) {
            $this->warnings[$base.'|'.$url]='Unresolved Markdown link: '.joined($base,$url);
            return $labelHtml.' [unavailable]';
        }
    }
    private function breadcrumbs(string $p): string
    {
        if ($p==='') { return ''; }
        $bits=['<a href="'.esc($this->href('')).'">server top</a>']; $prefix=''; $parts=explode('/',$p);
        foreach($parts as $i=>$part) {
            $prefix=joined($prefix,$part);
            $bits[]=$i===count($parts)-1?esc($part):'<a href="'.esc($this->href($prefix)).'">'.esc($part).'</a>';
        }
        return '<nav class="breadcrumbs" aria-label="Breadcrumb">'.implode(' / ',$bits).'</nav>';
    }
    private function rows(array $rows): string
    {
        if (!$rows) { return '<p class="notice empty">This directory is empty.</p>'; }
        $icons=json_decode(ICONS_JSON,true,16,JSON_THROW_ON_ERROR); $out='<table class="menu" aria-label="Directory menu"><colgroup><col class="icon-col"><col><col class="type-col"></colgroup><tbody>' . "\n";
        $types=['dir'=>['DIR','gopher-menu'],'file'=>['FILE','plain'],'markdown'=>['FILE','markdown'],'image'=>['IMG','image'],'archive'=>['FILE','download'],'link'=>['LINK','external link'],'search'=>['SEARCH',$this->static?'site index':'search'],'tags'=>['SEARCH','tag index'],'error'=>['ERROR','unavailable']];
        foreach($rows as $r) {
            $kind=$r['kind']; $info=$kind==='info'; $label=esc($r['label']); $tag=$types[$kind][0]??'FILE'; $type=$types[$kind][1]??'';
            $href=isset($r['path'])?$this->href($r['path']):($r['url']??(isset($r['index'])?$this->indexHref():($kind==='tags'?$this->tagsHref($r['tag']??null):null)));
            if ($href!==null) { $label='<a href="'.esc($href).'">'.$label.'</a>'; }
            $description=$r['description']??(isset($r['path']) && $this->site->config['show_details']?$this->site->item($r['path'])['description']:'');
            if ($description!=='') { $label.='<br><span class="summary">'.esc($description).'</span>'; }
            $icon=$info?'':'<img class="icon" src="'.esc($icons[in_array($kind,['markdown','tags'],true)?($kind==='tags'?'search':'file'):$kind]).'" alt="('.$tag.')" width="20" height="22">';
            $out.='<tr'.($info?' class="info"':'').'><td class="icon-cell">'.$icon.'</td><td class="label">'.($label===''?'&#160;':$label).'</td><td class="type">'.($this->site->config['show_types']?esc($type):'')."</td></tr>\n";
        }
        return $out."</tbody></table>\n";
    }
    private function document(string $p,string $class='document'): string
    {
        try { $s=$this->site->text($p); }
        catch (Failure $e) { if (in_array($e->status,[413,415],true)) { return '<p class="notice">'.esc($e->getMessage()).'</p>'; } throw $e; }
        if ($this->site->kind($p)==='markdown') { $html=(new Markdown($this,parentPath($p)))->render($s); return '<div class="'.$class.' markdown">'.($class==='document'?$this->contents($html):'').$html.'</div>'; }
        return '<div class="'.$class.'"><pre class="plain">'.esc($s).'</pre></div>';
    }
    private int $activePage=1;
    private function layout(string $title,string $body,string $p='',bool $index=false): string
    {
        $favicon=json_decode(ICONS_JSON,true)['dir']; $desc=$this->site->item($p)['description']?:$this->site->config['description'];
        $html='<!doctype html>' . "\n" . '<html lang="'.esc($this->site->config['language']).'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><meta http-equiv="Content-Security-Policy" content="'.esc(csp()).'"><title>'.esc($title.($title!==$this->site->config['site_name']?' — '.$this->site->config['site_name']:'')).'</title><meta name="description" content="'.esc($desc).'"><link rel="icon" type="image/png" href="'.esc($favicon).'"><style>'.CSS.'</style>';
        if ($this->site->config['base_url']!=='') {
            if ($this->static || !$index) { $canonical=$this->static?$this->site->config['base_url'].encodePath($this->current):$this->absolute($p).($this->activePage>1?($p===''?'?':'&').'page='.$this->activePage:''); $html.='<link rel="canonical" href="'.esc($canonical).'">'; }
            $html.='<link rel="alternate" type="application/atom+xml" title="Atom feed" href="'.esc($this->generatedHref('atom')).'"><link rel="alternate" type="application/rss+xml" title="RSS feed" href="'.esc($this->generatedHref('rss')).'">';
        }
        $html.='</head><body id="_gh-top">' . "\n";
        $html.='<a class="skip" href="#_gh-main">Skip to content</a><h1>'.esc($title).'</h1>'.($index?'':$this->breadcrumbs($p)).'<main id="_gh-main" tabindex="-1">'.$body.'</main><hr><footer>';
        $links=['<a href="'.esc($this->href('')).'">server top</a>'];
        if ($p!=='') { $links[]='<a href="'.esc($this->href(parentPath($p))).'">parent directory</a>'; }
        $links[]='<a href="'.esc($this->indexHref()).'">site index / search</a>';
        $links[]='<a href="'.esc($this->tagsHref()).'">browse tags</a>';
        $links[]='<a href="'.esc($this->generatedHref('recent')).'">recently updated</a>';
        if ($this->site->config['base_url']!=='') { foreach(['atom'=>'Atom','rss'=>'RSS','sitemap'=>'sitemap'] as $key=>$label) { $links[]='<a href="'.esc($this->generatedHref($key)).'">'.$label.'</a>'; } }
        $links[]='<a href="#_gh-top">back to top</a>';
        $html.='['.implode('] [',$links).']';
        if ($this->site->config['footer']) { $html.='<br>Generated by Gopher HTTP '.VERSION; }
        return $html."</footer></body></html>\n";
    }
    public function page(string $p,int $number=1): string
    {
        $kind=$this->site->kind($p); $this->activePath=$p; $count=$this->site->pageCount($p);
        if ($number<1 || $number>$count) { throw new Failure('Page not found.',404); }
        $this->activePage=$number; $this->current=$this->site->pagePath($p,$number); $body='';
        if ($kind==='dir') {
            $intro=$this->site->intro($p);
            if ($intro!==null && $number===1) { $body.=$this->document($intro,'intro'); }
            $pager=$this->pager($p,$number,$count);
            $body.=$pager.$this->rows(array_slice($this->site->menu($p),($number-1)*$this->site->config['page_size'],$this->site->config['page_size'])).$pager;
        } else {
            $body.='<p class="file-actions">[<a href="'.esc($this->href($p,true)).'" download="'.esc(basename($p)).'">download original</a>]';
            if (in_array($kind,['file','markdown'],true)) { $body.=' [<a href="'.esc($this->href($p,true)).'">view raw text</a>]'; }
            $body.=' — '.number_format((float)filesize($this->site->fs($p))).' bytes</p>';
            if (in_array($kind,['file','markdown'],true)) { $body.=$this->document($p); }
            elseif ($kind==='image') {
                $info=getimagesize($this->site->fs($p)); $item=$this->site->item($p);
                $body.='<figure class="image-view"><img src="'.esc($this->href($p,true)).'" alt="'.esc($item['alt']?:'(IMAGE) '.basename($p)).'" width="'.$info[0].'" height="'.$info[1].'" decoding="async"><figcaption>'.esc($item['description']).'</figcaption></figure>';
            } else { $body.='<p class="notice">This file is offered as a download. Its contents are not executed or embedded in this page.</p>'; }
        }
        $item=$this->site->item($p); $extra='';
        if ($item['description']!=='') { $extra.='<p class="notice">'.esc($item['description']).'</p>'; }
        if ($item['tags']) { $extra.='<p class="notice">Tags: '.implode(' · ',array_map(fn($tag)=>'<a href="'.esc($this->tagsHref($tag)).'">'.esc($tag).'</a>',$item['tags'])).'</p>'; }
        $html=$this->layout($this->site->title($p),$extra.$this->extras($p).$body.$this->siblings($p),$p);
        if ($number===1) { preg_match_all('/\bid="([^"]+)"/',$html,$ids); $this->pageIds[$p]=array_fill_keys(array_map(static fn($id)=>html_entity_decode($id,ENT_QUOTES|ENT_HTML5,'UTF-8'),$ids[1]),true); }
        return $html;
    }
    public function tagsIndex(): string
    {
        $this->current='_gopher/tags/index.html'; $rows=[];
        foreach ($this->site->tags() as $tag) {
            $count=0; foreach ($this->site->catalog() as $item) { if (in_array($tag,$item['tags'],true)) { $count++; } }
            $rows[]=['kind'=>'tags','tag'=>$tag,'label'=>$tag,'description'=>$count.' '.($count===1?'entry':'entries')];
        }
        return $this->layout('Browse tags','<p class="notice">'.count($rows).' tags across this archive.</p>'.$this->rows($rows),'',true);
    }
    public function tagPage(string $tag): string
    {
        if (!in_array($tag,$this->site->tags(),true)) { throw new Failure('Tag not found.',404); }
        $this->current=$this->site->tagPath($tag); $rows=[];
        $paths=array_map('strval',array_keys($this->site->catalog()));
        usort($paths,static fn($a,$b)=>strnatcasecmp($a,$b)?:strcmp($a,$b));
        foreach ($paths as $p) {
            $item=$this->site->catalog()[$p];
            if (in_array($tag,$item['tags'],true)) {
                $rows[]=['kind'=>$this->site->kind($p),'path'=>$p,'label'=>$p,'description'=>$item['description']];
            }
        }
        return $this->layout('Tag: '.$tag,'<p class="notice"><a href="'.esc($this->tagsHref()).'">All tags</a> · '.count($rows).' entries</p>'.$this->rows($rows),'',true);
    }

}

function writeFile(string $file,string $data): void
{
    $dir=dirname($file);
    if (!is_dir($dir) && !@mkdir($dir,0755,true) && !is_dir($dir)) { throw new Failure('Cannot create output directory.',500); }
    if (@file_put_contents($file,$data)===false) { throw new Failure('Cannot write output file.',500); }
}
function removeTree(string $path): void
{
    if (is_link($path) || is_file($path)) { if (!@unlink($path)) { throw new Failure('Cannot remove a generated file.',500); } return; }
    foreach (new \FilesystemIterator($path,\FilesystemIterator::SKIP_DOTS) as $item) { removeTree($item->getPathname()); }
    if (!@rmdir($path)) { throw new Failure('Cannot remove generated directory.',500); }
}
function absoluteDestination(string $dest): string
{
    if ($dest==='' || str_contains($dest,"\0")) { throw new Failure('Invalid output path.'); }
    $base=basename($dest);
    if ($base==='' || in_array($base,['.','..'],true) || is_link($dest)) { throw new Failure('Unsafe output path.'); }
    // Parent must already exist: no accidental creation outside a mistyped path.
    $parent=realpath(dirname($dest));
    if ($parent===false || !is_dir($parent)) { throw new Failure('The output parent directory must already exist.'); }
    return rtrim(str_replace('\\','/',$parent),'/').'/'.$base;
}
function validateOutputPlan(Site $site,array $paths): void
{
    $plans=['_gopher/index.html'=>'site index','_gopher/tags/index.html'=>'tag index','_gopher/recent.html'=>'recent index'];
    foreach ($site->tags() as $tag) {
        $target=$site->tagPath($tag); $key=strtolower($target);
        if (isset($plans[$key])) { throw new Failure('Tag output collision.',500); }
        $plans[$key]=$tag;
    }
    foreach($paths as $p) {
        $target=$site->outputPath($p); $key=strtolower($target);
        if (isset($plans[$key])) { throw new Failure('Output name collision: '.$target); }
        $plans[$key]=$p;
        for ($number=2;$number<=$site->pageCount($p);$number++) { $plans[$site->pagePath($p,$number)]=$p; }
    }
    foreach(array_keys($plans) as $path) {
        for ($a=parentPath($path);$a!=='';$a=parentPath($a)) {
            if (isset($plans[$a])) { throw new Failure('File/directory output collision: '.$path); }
        }
    }
}
function build(Site $site,string $destination,bool $replace=false,bool $strict=false): array
{
    $dest=absoluteDestination($destination); $root=$site->root;
    if ($dest===$root || str_starts_with($dest,$root.'/') || str_starts_with($root,$dest.'/')) { throw new Failure('Input and output must not contain one another.'); }
    if (file_exists($dest)) {
        if (!$replace || !is_dir($dest) || is_link($dest) || !is_file($dest.'/'.BUILD_MARKER) || is_link($dest.'/'.BUILD_MARKER)) { throw new Failure('Output exists. --replace only replaces a marked Gopher HTTP build.'); }
        $m=jsonFile($dest.'/'.BUILD_MARKER);
        if (($m['project']??null)!==PROJECT) { throw new Failure('Output is not a Gopher HTTP build.'); }
    }
    $paths=$site->walk(); validateOutputPlan($site,$paths);
    $stage=dirname($dest).'/.gopher-stage-'.bin2hex(random_bytes(8));
    if (!@mkdir($stage,0755)) { throw new Failure('Cannot create staging directory.',500); }
    $renderer=new Renderer($site,true); $backup=null; $committed=false; $files=0; $pages=0;
    try {
        foreach($paths as $p) {
            for ($number=1;$number<=$site->pageCount($p);$number++) { writeFile($stage.'/'.$site->pagePath($p,$number),$renderer->page($p,$number)); $pages++; }
            if ($site->kind($p)!=='dir') {
                $target=$stage.'/'.$site->rawInfo($p)['path'];
                if (!is_dir(dirname($target)) && !mkdir(dirname($target),0755,true)) { throw new Failure('Cannot create asset directory.',500); }
                if (!copy($site->fs($p),$target)) { throw new Failure('Cannot copy a content file.',500); }
                $files++;
            }
        }
        writeFile($stage.'/_gopher/index.html',$renderer->index());
        writeFile($stage.'/_gopher/recent.html',$renderer->recent());
        if ($site->config['base_url']!=='') { foreach(['sitemap','atom','rss'] as $type) { writeFile($stage.'/_gopher/'.$type.'.xml',$renderer->xmlOutput($type)); } }
        $renderer->validateFragments();
        writeFile($stage.'/_gopher/tags/index.html',$renderer->tagsIndex());
        foreach ($site->tags() as $tag) { writeFile($stage.'/'.$site->tagPath($tag),$renderer->tagPage($tag)); }
        $warnings=array_values($site->warnings+$renderer->warnings);
        if ($strict && $renderer->warnings) { throw new Failure('Strict build rejected unresolved Markdown links: '.implode('; ',$renderer->warnings)); }
        $report=['project'=>PROJECT,'version'=>VERSION,'pages'=>$pages+3+count($site->tags()),'original_files'=>$files,'warnings'=>$warnings];
        writeFile($stage.'/'.BUILD_MARKER,json_encode($report,JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)."\n");
        // Never follow symlinks when cleaning an old owned build.
        if (is_dir($dest)) {
            $backup=dirname($dest).'/.gopher-backup-'.bin2hex(random_bytes(8));
            if (!rename($dest,$backup)) { throw new Failure('Cannot move the previous build.',500); }
        }
        if (!rename($stage,$dest)) {
            if ($backup!==null && !rename($backup,$dest)) { throw new Failure('Publish failed; old build remains in '.$backup,500); }
            throw new Failure('Cannot publish staging directory.',500);
        }
        $committed=true;
        if ($backup!==null) { removeTree($backup); }
        return $report;
    } finally { if (!$committed && is_dir($stage)) { removeTree($stage); } }
}
function defaultContent(): string
{
    $env=getenv('GOPHER_HTTP_CONTENT');
    if ($env!==false && $env!=='') { return $env; }
    return is_dir(__DIR__.'/content')?__DIR__.'/content':dirname(__DIR__).'/content';
}
function help(): string
{
    return "Gopher HTTP ".VERSION."\n\n"
        ."php index.php build --source CONTENT --output OUTPUT [--replace] [--strict]\n"
        ."php index.php check --source CONTENT [--strict]\n"
        ."php index.php init --source NEW_CONTENT_DIRECTORY\n"
        ."php index.php stats --source CONTENT\n"
        ."php index.php --version\n\n"
        ."OUTPUT's parent must exist; input/output must be disjoint.\n"
        ."--replace only replaces output carrying a Gopher HTTP build marker.\n"
        ."--strict fails on unresolved Markdown links. Menu errors always fail.\n"
        ."Content must be trusted, locally authored, UTF-8, and not publicly writable.\n";
}
function cli(array $argv): int
{
    $command=$argv[1]??'--help';
    if (in_array($command,['--help','help','-h'],true)) { echo help(); return 0; }
    if ($command==='--version') { echo VERSION."\n"; return 0; }
    if (!in_array($command,['build','check','init','stats'],true)) { throw new Failure('Unknown command.\n'.help()); }
    $opts=['--source'=>defaultContent(),'--output'=>null,'--replace'=>false,'--strict'=>false];
    for($i=2;$i<count($argv);$i++) {
        $key=$argv[$i];
        if (!array_key_exists($key,$opts)) { throw new Failure('Unknown option: '.$key); }
        if (in_array($key,['--replace','--strict'],true)) { $opts[$key]=true; }
        else { if (!isset($argv[$i+1]) || str_starts_with($argv[$i+1],'--')) { throw new Failure('Missing value for '.$key); } $opts[$key]=$argv[++$i]; }
    }
    if ($command==='init') {
        $dest=absoluteDestination($opts['--source']);
        if (file_exists($dest)) { throw new Failure('Starter destination already exists.'); }
        if (!mkdir($dest,0755)) { throw new Failure('Cannot create starter directory.',500); }
        writeFile($dest.'/.site.json',jsonSafe(['site_name'=>'My archive','description'=>'A small independent archive.'])."\n");
        writeFile($dest.'/Welcome.md',"# Welcome\n\nWrite Markdown or plain text and add directories.\n\n## Next steps\n\nEdit .site.json, then run the build command.\n");
        echo jsonSafe(['project'=>PROJECT,'version'=>VERSION,'created'=>$dest])."\n"; return 0;
    }
    $site=new Site($opts['--source']);
    if ($command==='stats') {
        $counts=[]; $bytes=0; foreach($site->walk() as $p) { $kind=$site->kind($p); $counts[$kind]=($counts[$kind]??0)+1; if($kind!=='dir') { $bytes+=filesize($site->fs($p)); } }
        echo jsonSafe(['project'=>PROJECT,'version'=>VERSION,'counts'=>$counts,'file_bytes'=>$bytes,'tags'=>count($site->tags()),'search_body_bytes'=>$site->records()['bytes'],'search_omitted'=>$site->records()['omitted']])."\n"; return 0;
    }
    if ($command==='check') {
        $r=new Renderer($site,true); $paths=$site->walk(); validateOutputPlan($site,$paths);
        foreach($paths as $p) { for($number=1;$number<=$site->pageCount($p);$number++) { $r->page($p,$number); } } $r->index(); $r->tagsIndex(); $r->recent();
        $r->validateFragments();
        if ($site->config['base_url']!=='') { foreach(['sitemap','atom','rss'] as $type) { $r->xmlOutput($type); } }
        foreach ($site->tags() as $tag) { $r->tagPage($tag); }
        if ($opts['--strict'] && $r->warnings) { throw new Failure(implode("\n",$r->warnings)); }
        $report=['project'=>PROJECT,'version'=>VERSION,'checked_nodes'=>count($paths),'warnings'=>array_values($site->warnings+$r->warnings)];
    } else {
        if ($opts['--output']===null) { throw new Failure('--output is required.'); }
        $report=build($site,$opts['--output'],$opts['--replace'],$opts['--strict']);
    }
    echo json_encode($report,JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)."\n";
    return 0;
}
function headersCommon(): void
{
    header('X-Content-Type-Options: nosniff'); header('Referrer-Policy: no-referrer');
    header('Content-Security-Policy: '.csp(true));
    header('X-Frame-Options: DENY'); header('Cache-Control: no-cache');
}
function requestString(string $key,string $default=''): string
{
    return array_key_exists($key,$_GET)?stringValue($_GET[$key],'query parameter',4096):$default;
}
function notModified(string $etag,?int $mtime=null): bool
{
    header('ETag: '.$etag);
    if ($mtime!==null) { header('Last-Modified: '.gmdate('D, d M Y H:i:s',$mtime).' GMT'); }
    $header=$_SERVER['HTTP_IF_NONE_MATCH']??null;
    if ($header!==null) {
        foreach(explode(',',$header) as $candidate) { $candidate=trim($candidate); if ($candidate==='*' || preg_replace('/^W\//','',$candidate)===$etag) { http_response_code(304); return true; } }
        return false;
    }
    $since=$_SERVER['HTTP_IF_MODIFIED_SINCE']??''; $time=$since!==''?strtotime($since):false;
    if ($mtime!==null && $time!==false && $time>=$mtime) { http_response_code(304); return true; }
    return false;
}
function sendText(string $body,string $mime,bool $head): void
{
    header('Content-Type: '.$mime);
    if (notModified('"'.hash('sha256',$body).'"')) { return; }
    header('Content-Length: '.strlen($body)); if (!$head) { echo $body; }
}
function sendRaw(Site $site,string $p,bool $head): void
{
    $f=$site->fs($p); $raw=$site->rawInfo($p); $size=filesize($f); $mtime=filemtime($f); $etag='"'.$site->checksum($p).'"';
    header('Content-Type: '.$raw['mime']); header('Accept-Ranges: bytes');
    $ascii=preg_replace('/[^a-zA-Z0-9._ -]/','_',basename($p))??'download';
    header('Content-Disposition: '.($raw['attachment']?'attachment':'inline').'; filename="'.$ascii.'"; filename*=UTF-8\'\''.rawurlencode(basename($p)));
    if (notModified($etag,$mtime)) { return; }
    $start=0; $end=$size-1; $range=$head?'':($_SERVER['HTTP_RANGE']??''); $ifRange=$_SERVER['HTTP_IF_RANGE']??'';
    if ($ifRange!=='' && $ifRange!==$etag) {
        $time=strtotime($ifRange); if ($time===false || $time<$mtime) { $range=''; }
    }
    // Support one byte range. A multi-range request falls back to the complete representation.
    if ($range!=='' && !str_contains($range,',') && preg_match('/^bytes=(\d*)-(\d*)$/',$range,$m)) {
        if ($m[1]==='' && $m[2]!=='') { $start=max(0,$size-(int)$m[2]); }
        elseif ($m[1]!=='') { $start=(int)$m[1]; if ($m[2]!=='') { $end=min($end,(int)$m[2]); } }
        if (($m[1]==='' && $m[2]==='') || $start>=$size || $start>$end || ($m[1]==='' && (int)$m[2]===0)) {
            http_response_code(416); header('Content-Range: bytes */'.$size); header('Content-Length: 0'); return;
        }
        http_response_code(206); header('Content-Range: bytes '.$start.'-'.$end.'/'.$size);
    }
    $length=max(0,$end-$start+1); header('Content-Length: '.$length);
    if (!$head && $length>0) {
        $h=fopen($f,'rb'); if ($h===false) { throw new Failure('Cannot open file.',500); }
        try { if ($start && fseek($h,$start)!==0) { throw new Failure('Cannot seek file.',500); } while ($length>0 && !feof($h)) { $chunk=fread($h,min($length,65536)); if ($chunk===false || $chunk==='') { break; } echo $chunk; $length-=strlen($chunk); } } finally { fclose($h); }
    }
}
function web(): void
{
    $method=$_SERVER['REQUEST_METHOD']??'GET'; $head=$method==='HEAD';
    ini_set('display_errors','0');
    headersCommon();
    try {
        if (!in_array($method,['GET','HEAD'],true)) { header('Allow: GET, HEAD'); throw new Failure('Only GET and HEAD are supported.',405); }
        // This same file can be used as the PHP development-server router.
        // Never return false to expose arbitrary files under its working directory.
        $script=basename(__FILE__);
        $uriPath=parse_url($_SERVER['REQUEST_URI']??'/',PHP_URL_PATH);
        $requestBase=basename(is_string($uriPath)?rawurldecode($uriPath):'/');
        $directoryRequest = PHP_SAPI!=='cli-server' && is_string($uriPath) && $uriPath===rtrim(str_replace('\\','/',dirname($_SERVER['SCRIPT_NAME']??'/'.$script)),'/.').'/';
        if (!$directoryRequest && $requestBase!=='' && $requestBase!=='/' && $requestBase!==$script) { throw new Failure('Not found.',404); }
        $site=new Site(defaultContent()); $r=new Renderer($site,false,$script);
        $allowed=['p','index','raw','q','tags','tag','kind','filter_tag','sort','page','recent','feed','sitemap'];
        if (array_diff(array_keys($_GET),$allowed)) { throw new Failure('Unknown query parameter.'); }
        $p=validPath(requestString('p')); $index=requestString('index'); $raw=requestString('raw'); $q=requestString('q');
        $tags=requestString('tags'); $tag=requestString('tag'); $recent=requestString('recent'); $feed=requestString('feed'); $sitemap=requestString('sitemap');
        foreach([$index,$raw,$tags,$recent,$sitemap] as $flag) { if (!in_array($flag,['','1'],true)) { throw new Failure('Invalid request.'); } }
        if (!in_array($feed,['','atom','rss'],true)) { throw new Failure('Invalid feed.'); }
        $modes=($index==='1'?1:0)+($raw==='1'?1:0)+($tags==='1'?1:0)+($tag!==''?1:0)+($recent==='1'?1:0)+($feed!==''?1:0)+($sitemap==='1'?1:0);
        if ($modes>1 || ($p!=='' && $modes && $raw!=='1') || ($q!=='' && $index!=='1')) { throw new Failure('Invalid request.'); }
        $pageValue=requestString('page','1');
        if (!preg_match('/^[1-9][0-9]{0,5}$/',$pageValue) || (int)$pageValue>100000) { throw new Failure('Invalid page.'); }
        $number=(int)$pageValue;
        $o=searchOptions(['kind'=>requestString('kind'),'tag'=>requestString('filter_tag'),'sort'=>requestString('sort','relevance'),'page'=>$number]);
        if ($index!=='1' && (isset($_GET['kind']) || isset($_GET['filter_tag']) || isset($_GET['sort']) || ($modes && isset($_GET['page'])))) { throw new Failure('Search options require the site index.'); }
        if (strlen($q)>800 || preg_match_all('/./us',$q)>200) { throw new Failure('Search query is too long.'); }
        if (strlen($tag)>80 || !utf8($tag)) { throw new Failure('Invalid tag.'); }
        if ($raw==='1') { sendRaw($site,$p,$head); return; }
        if ($feed!=='' || $sitemap==='1') {
            $type=$sitemap==='1'?'sitemap':$feed; $mime=$type==='atom'?'application/atom+xml':($type==='rss'?'application/rss+xml':'application/xml');
            sendText($r->xmlOutput($type),$mime.'; charset=utf-8',$head); return;
        }
        $html=$index==='1'?$r->index($q,$o):($tags==='1'?$r->tagsIndex():($tag!==''?$r->tagPage($tag):($recent==='1'?$r->recent():$r->page($p,$number))));
        sendText($html,'text/html; charset=utf-8',$head);
    } catch (\Throwable $e) {
        $status=$e instanceof Failure?$e->status:500;
        if (!headers_sent()) { foreach(['Content-Length','Content-Range','ETag','Last-Modified','Content-Disposition'] as $h) { header_remove($h); } http_response_code($status); header('Content-Type: text/html; charset=utf-8'); header('Cache-Control: no-store'); }
        if ($status>=500) { error_log('Gopher HTTP: '.$e->getMessage()); }
        $message=$status>=500?'The site could not be rendered. Ask the administrator to run the content check command.':$e->getMessage();
        if (!$head) { echo '<!doctype html><html lang="en"><meta charset="utf-8"><title>Error '.$status.'</title><h1>Error '.$status.'</h1><p>'.esc($message).'</p><p>Use your browser\'s Back command to return.</p></html>'; }
    }
}
if (!defined('GOPHER_HTTP_LIBRARY')) {
    if (PHP_VERSION_ID<80200) { if(PHP_SAPI==='cli'){fwrite(STDERR,"PHP 8.2 or newer is required.\n");exit(1);}http_response_code(503);exit('PHP 8.2 or newer is required.'); }
    if (PHP_SAPI==='cli') {
        try { exit(cli($argv)); }
        catch (\Throwable $e) { fwrite(STDERR,'Error: '.$e->getMessage()."\n"); exit(1); }
    }
    web();
}
