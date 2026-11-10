(function(){
'use strict';
const tr=value=>value;
/** Desktop-only coordinator: untrusted HTML never enters this renderer's DOM. */
class HtmlPreviewClient {
  constructor(container) {
    this.container=container;this.active=new Map();this.external=true;this.pending=false;this.dead=false;
    this.schedule=()=>{if(!this.active.size)return;if(!this.pending&&!this.dead){this.pending=true;requestAnimationFrame(()=>{this.pending=false;this.update();});}};
    window.addEventListener('resize',this.schedule);
    document.addEventListener('scroll',this.schedule,true);
    this.observer=new MutationObserver(this.schedule);this.observer.observe(document.body,{attributes:true,childList:true,subtree:true,attributeFilter:['class','style','hidden','open']});
    this.unsubscribe=window.alternative?.onHtmlPreviewEvent?.(event=>{const item=this.active.get(event.id);if(!item)return;if(event.state==='error'){item.notice=event.message;this.close(item.pre,event.message);}else if(event.state==='closed')this.close(item.pre);});
  }
  setExternalResources(enabled){const value=enabled!==false;if(value!==this.external){this.external=value;this.closeAll();}}
  geometry(node) {
    let area={left:0,top:0,right:innerWidth,bottom:innerHeight};
    for(let ancestor=node.parentElement;ancestor;ancestor=ancestor.parentElement){const style=getComputedStyle(ancestor);if(/(?:auto|scroll|hidden|clip)/.test(style.overflow+style.overflowX+style.overflowY)){const r=ancestor.getBoundingClientRect();area={left:Math.max(area.left,r.left),top:Math.max(area.top,r.top),right:Math.min(area.right,r.right),bottom:Math.min(area.bottom,r.bottom)};}}
    const rect=node.getBoundingClientRect(),fits=rect.left>=area.left-1&&rect.top>=area.top-1&&rect.right<=area.right+1&&rect.bottom<=area.bottom+1&&rect.width>1&&rect.height>1;
    const points=[[rect.left+3,rect.top+3],[rect.right-3,rect.top+3],[rect.left+3,rect.bottom-3],[rect.right-3,rect.bottom-3],[rect.left+rect.width/2,rect.top+rect.height/2]];
    const uncovered=fits&&points.every(([x,y])=>{const hit=document.elementFromPoint(x,y);return hit&&(hit===node||node.contains(hit));});
    return {bounds:{x:Math.max(0,Math.round(rect.left)),y:Math.max(0,Math.round(rect.top)),width:Math.max(1,Math.round(rect.width)),height:Math.max(1,Math.round(rect.height))},visible:uncovered,area};
  }
  size(node){let available=Math.min(innerHeight-160,this.container.clientHeight-100);for(let ancestor=this.container.parentElement;ancestor;ancestor=ancestor.parentElement){const style=getComputedStyle(ancestor);if(/(?:auto|scroll)/.test(style.overflowY)){available=Math.min(available,ancestor.clientHeight-100);break;}}const height=Math.max(100,Math.min(320,available))+'px';if(node.style.height!==height)node.style.height=height;}
  async toggle(pre) {
    const existing=[...this.active.values()].find(item=>item.pre===pre);if(existing){this.close(pre);return;}
    const code=pre.querySelector('code'),node=pre.querySelector('.tsa-html-preview'),toggle=pre.querySelector('[data-toggle-html]');if(!code||!node||!toggle)return;
    if(!window.alternative?.htmlPreview){node.hidden=false;node.textContent=tr('HTML previews are available in the desktop application.');return;}
    const id='html-'+crypto.randomUUID(),item={id,pre,node,code,toggle};this.active.set(id,item);
    node.textContent=tr('Scroll the preview fully into view.');node.hidden=false;code.hidden=true;code.parentElement.hidden=true;toggle.textContent=tr('Code');toggle.setAttribute('aria-pressed','true');
    this.size(node);node.scrollIntoView({block:'center',inline:'nearest'});
    try {
      const geometry=this.geometry(node);
      await window.alternative.htmlPreview('html.preview.open',{id,source:code.dataset.originalCode??code.textContent??'',language:pre.dataset.htmlFence||'',external:this.external,...geometry});
      if(!this.active.has(id)||this.dead){await window.alternative.htmlPreview('html.preview.close',{id});return;}
      this.schedule();
    }catch(error){this.close(pre,String(error?.message||error));}
  }
  update(){for(const item of this.active.values()){if(!item.pre.isConnected){this.close(item.pre);continue;}this.size(item.node);const value=this.geometry(item.node),key=JSON.stringify(value);if(item.last===key)continue;item.last=key;void window.alternative.htmlPreview('html.preview.update',{id:item.id,...value}).catch(()=>this.close(item.pre));}}
  close(pre,message='') {
    const item=[...this.active.values()].find(item=>item.pre===pre);if(!item)return;this.active.delete(item.id);
    item.code.hidden=false;item.code.parentElement.hidden=false;item.node.hidden=!message;item.node.textContent=message;item.toggle.textContent=tr('Render');item.toggle.setAttribute('aria-pressed','false');
    void window.alternative?.htmlPreview('html.preview.close',{id:item.id}).catch(()=>{});
  }
  closeAll(){for(const item of [...this.active.values()])this.close(item.pre);void window.alternative?.htmlPreview('html.preview.closeAll').catch(()=>{});}
  destroy(){this.dead=true;this.closeAll();this.observer.disconnect();window.removeEventListener('resize',this.schedule);document.removeEventListener('scroll',this.schedule,true);this.unsubscribe?.();}
}

window.TSAHtmlPreviewClient=HtmlPreviewClient;
})();
