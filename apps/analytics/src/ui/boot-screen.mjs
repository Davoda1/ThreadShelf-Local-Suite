/** The first paint depends only on OS media queries and these static bytes. */
export const BOOT_CSS=`
html.analytics-booting,html.analytics-booting body{margin:0;overflow:hidden!important;background:#fff!important;color:#000!important}
html.analytics-booting #app{visibility:hidden!important;pointer-events:none!important}
#analytics-boot{position:fixed;inset:0;z-index:2147483000;display:grid;place-content:center;justify-items:center;gap:18px;padding:32px;background:#fff!important;color:#000!important;font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;text-align:center;isolation:isolate;overflow:auto;box-sizing:border-box}
#analytics-boot *{box-sizing:border-box}
#analytics-boot .analytics-boot-ring{width:56px;height:56px;border:4px solid currentColor;border-top-color:transparent;border-radius:50%;animation:analytics-boot-spin 1s linear infinite}
#analytics-boot p{margin:0;max-width:40em;color:inherit!important}
#analytics-boot-detail{font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere;max-height:28vh;overflow:auto}
#analytics-boot-retry{min-height:44px;padding:10px 22px;border:1px solid currentColor;border-radius:6px;appearance:none;background:#fff!important;color:#000!important;font:inherit;cursor:pointer}
#analytics-boot-retry:focus-visible{outline:2px solid currentColor;outline-offset:4px}
#analytics-boot [hidden]{display:none!important}
#analytics-boot[data-state="error"] .analytics-boot-ring{display:none}
@keyframes analytics-boot-spin{to{transform:rotate(360deg)}}
@media(prefers-color-scheme:dark){html.analytics-booting,html.analytics-booting body,#analytics-boot{background:#000!important;color:#fff!important}#analytics-boot-retry{background:#000!important;color:#fff!important}}
@media(prefers-reduced-motion:reduce){#analytics-boot .analytics-boot-ring{animation:none}}
`;
export const BOOT_MARKUP='<section id="analytics-boot" data-state="loading" role="status" aria-live="polite" aria-label="ThreadShelf Local Analytics"><span class="analytics-boot-ring" aria-hidden="true"></span><p id="analytics-boot-message">Loading analytics…</p><p id="analytics-boot-detail" hidden></p><button id="analytics-boot-retry" type="button" hidden>Retry</button></section>';

/** Shared desktop build/standalone preview transformation; safe to call twice. */
export function injectBootShell(html){
  if(!/<html\b/i.test(html)||!/<body\b/i.test(html)||!/<head\b/i.test(html))throw new Error('Boot shell requires an HTML document.');
  let output=html.replace(/<html\b([^>]*)>/i,(_all,attributes)=>{if(/\bclass\s*=/i.test(attributes))return `<html${attributes.replace(/\bclass\s*=\s*(["'])(.*?)\1/i,(_match,q,value)=>`class=${q}${value.split(/\s+/).includes('analytics-booting')?value:value+' analytics-booting'}${q}`)}>`;return `<html${attributes} class="analytics-booting">`;});
  if(!/id=["']analytics-boot-css["']/i.test(output))output=output.replace(/<\/head>/i,`<style id="analytics-boot-css">${BOOT_CSS}</style></head>`);
  if(!/id=["']analytics-boot["']/i.test(output))output=output.replace(/<body\b[^>]*>/i,match=>match+BOOT_MARKUP);
  output=output.replace(/<div\b([^>]*\bid=["']app["'][^>]*)>/i,(_all,attributes)=>`<div${attributes}${/\binert\b/.test(attributes)?'':' inert'}${/\baria-hidden\s*=/.test(attributes)?'':' aria-hidden="true"'}>`);
  return output;
}
export function ensureBootShell(){
  document.documentElement.classList.add('analytics-booting');
  if(!document.getElementById('analytics-boot-css')){const style=document.createElement('style');style.id='analytics-boot-css';style.textContent=BOOT_CSS;document.head.append(style);}
  if(!document.getElementById('analytics-boot')){const template=document.createElement('template');template.innerHTML=BOOT_MARKUP;document.body.prepend(template.content);}
  const app=document.getElementById('app');if(app){app.inert=true;app.setAttribute('aria-hidden','true');}
  return {cover:document.getElementById('analytics-boot'),message:document.getElementById('analytics-boot-message'),detail:document.getElementById('analytics-boot-detail'),retry:document.getElementById('analytics-boot-retry')};
}
export function setBootLabels({loading,retry}={}){const nodes=ensureBootShell();if(loading&&nodes.cover.dataset.state!=='error')nodes.message.textContent=loading;if(retry)nodes.retry.textContent=retry;}
export function showBootLoading({loading='Loading analytics…',retry='Retry'}={}){const nodes=ensureBootShell();nodes.cover.dataset.state='loading';nodes.cover.setAttribute('role','status');nodes.message.textContent=loading;nodes.detail.hidden=true;nodes.detail.textContent='';nodes.retry.hidden=true;nodes.retry.textContent=retry;nodes.retry.onclick=null;}
export function showBootFailure({message='Analytics could not start.',detail='',retryLabel='Retry',onRetry}={}){const nodes=ensureBootShell();nodes.cover.dataset.state='error';nodes.cover.setAttribute('role','alert');nodes.message.textContent=message;nodes.detail.textContent=String(detail||'');nodes.detail.hidden=!detail;nodes.retry.textContent=retryLabel;nodes.retry.hidden=typeof onRetry!=='function';nodes.retry.onclick=typeof onRetry==='function'?onRetry:null;if(!nodes.retry.hidden)nodes.retry.focus({preventScroll:true});}
export function revealBootScreen(){document.getElementById('analytics-boot')?.remove();document.documentElement.classList.remove('analytics-booting');const app=document.getElementById('app');if(app){app.inert=false;app.removeAttribute('aria-hidden');}}
