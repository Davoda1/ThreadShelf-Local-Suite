'use strict';
/** Initialization cannot read data until the static shell has been shown. */
function createBootLifecycle({initialize,onState=()=>{}}){
  let state={phase:'idle',attempt:0,error:null},value,pending,lastError,closed=false,shown=false,show;
  const visible=new Promise(resolve=>{show=resolve;});
  const notify=next=>{state=next;onState({...state});};
  function ready({retry=false}={}){
    if(closed)return Promise.reject(Object.assign(new Error('Application is closing.'),{code:'BOOT_CLOSED'}));
    if(state.phase==='ready')return Promise.resolve(value);
    if(state.phase==='loading')return pending;
    if(state.phase==='error'&&!retry)return Promise.reject(lastError);
    const attempt=state.attempt+1;notify({phase:'loading',attempt,error:null});
    pending=(async()=>{await visible;if(closed)throw Object.assign(new Error('Application is closing.'),{code:'BOOT_CLOSED'});return initialize(attempt);})().then(result=>{value=result;if(!closed)notify({phase:'ready',attempt,error:null});return result;},error=>{lastError=error;if(!closed)notify({phase:'error',attempt,error:{code:error.code||'BOOT_FAILED',message:String(error.message||error).slice(0,1200)}});throw error;});
    // Startup starts in the background. An IPC caller still receives the same
    // rejection, while an early failure cannot become an unhandled rejection.
    pending.catch(()=>{});return pending;
  }
  return {ready,get state(){return {...state};},markShellVisible(){if(!shown){shown=true;show();}},close(){closed=true;show();state={...state,phase:'closed'};}};
}
module.exports={createBootLifecycle};
