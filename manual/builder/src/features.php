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
