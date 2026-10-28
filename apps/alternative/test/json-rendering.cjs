'use strict';
// display-only JSON acceptance. Synthetic fixtures; no remote requests.
const VERSION = require('../package.json').version;
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {pathToFileURL}=require('node:url');
const playwright=require(process.env.PLAYWRIGHT_PATH||'playwright');
const root=path.resolve(__dirname,'..'),appPath=path.resolve(process.env.TSA_APP_PATH||root);
const report={product:'ThreadShelf Local Alternative',version:VERSION,target:process.env.TSA_JSON_TARGET||'source',runtime:process.env.ELECTRON_PATH?'native-linux-electron':'browser',checks:[],layouts:[],requests:[],errors:[],passed:false};
let browser,electron,temporary,page;
async function check(name,fn){const details=await fn();report.checks.push({name,...details});}
async function viewport(width,height){if(electron){await electron.evaluate(({BrowserWindow},v)=>BrowserWindow.getAllWindows()[0].setContentSize(v.width,v.height),{width,height});await page.waitForFunction(v=>innerWidth===v.width&&innerHeight===v.height,{width,height});}else await page.setViewportSize({width,height});}
(async()=>{
 try{
  if(process.env.ELECTRON_PATH){
   temporary=await fs.mkdtemp(path.join(os.tmpdir(),'tsa-json-'));
   const wrapper=path.join(temporary,'main.cjs');
   await fs.writeFile(wrapper,`const e=require('electron');${process.env.TSA_TEST_NO_UNIX_SOCKETS==='1'?'e.app.requestSingleInstanceLock=()=>true;':''}require(${JSON.stringify(path.join(appPath,'main.cjs'))});`);
   electron=await playwright._electron.launch({executablePath:process.env.ELECTRON_PATH,args:['--no-sandbox',wrapper],env:{...process.env,XDG_CONFIG_HOME:path.join(temporary,'config'),XDG_CACHE_HOME:path.join(temporary,'cache')},timeout:30000});page=await electron.firstWindow();
  }else{browser=await playwright.chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});page=await browser.newPage({viewport:{width:1160,height:820},colorScheme:'light'});}
  page.on('pageerror',e=>report.errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))report.requests.push(r.url());});
  if(!electron)await page.goto(process.env.DEMO_PATH?pathToFileURL(process.env.DEMO_PATH).href:pathToFileURL(path.join(appPath,'renderer/index.html')).href);
  await page.waitForSelector('#app[data-ready="true"]');
  if(await page.locator('#welcome-demo').isVisible())await page.click('#welcome-demo');
  await page.waitForSelector('#thread-content .tsa-message');
  await check('Complete application loads the formatter and About identity',async()=>{
   assert.equal(await page.evaluate(()=>typeof TSAJsonResponse.formatJsonResponse),'function');
   await page.click('#settings-button');assert.equal((await page.locator('.about-line strong').textContent()).trim(),VERSION);await page.locator('#settings-dialog .dialog-footer [data-close]').click();
   assert.equal(await page.title(),'ThreadShelf Local Alternative');
   return {nativeTitle:'ThreadShelf Local Alternative',about:VERSION};
  });
  await page.evaluate(()=>{
   // Isolate harness bindings from the demo conversation's previous bindings.
   const old=document.getElementById('thread-content'),node=old.cloneNode(false);old.replaceWith(node);
   window.jsonCopies=[];window.jsonOpened=[];
   window.mountJsonFixture=async(thread,query='')=>{
    window.jsonCleanup?.();window.jsonFixture=thread;window.jsonBefore=JSON.stringify(thread);
    window.jsonRendered=TSAContent.renderThread(thread,{query,showReasoning:true});
    node.innerHTML=jsonRendered.html;window.jsonCleanup=TSAContent.bind(node,{copy:text=>jsonCopies.push(text),openExternal:url=>jsonOpened.push(url),imageMode:'click'});await jsonCleanup.ready;
    document.getElementById('thread-title').textContent='JSON response rendering';document.getElementById('reader-scroll').scrollTop=0;
    return {roles:jsonRendered.messages.map(x=>x.role),code:[...node.querySelectorAll('pre code')].map(e=>e.textContent),highlighted:node.querySelectorAll('code .hljs-attr').length,unchanged:JSON.stringify(thread)===jsonBefore};
   };
  });
  const raw='  {"large":900719925474099312345,"same":1,"same":2,"spelling":1.2300e+04,"value":"alpha"}  ';
  await check('Assistant and reasoning JSON use indented highlighting without changing number tokens or duplicate keys',async()=>{
   const result=await page.evaluate(source=>mountJsonFixture({turns:[{ai:source},{thinking:'[{"value":true},null]'}]},'alpha'),raw);
   assert.deepEqual(result.roles,['assistant','reasoning']);assert.equal(result.code.length,2);assert.ok(result.highlighted>=6);assert.match(result.code[0],/\n  "large": 900719925474099312345,/);assert.equal((result.code[0].match(/"same"/g)||[]).length,2);assert.match(result.code[0],/1\.2300e\+04/);assert.equal(result.unchanged,true);
   assert.equal(await page.locator('.tsa-query-hit').count(),1);
   return {jsonBlocks:result.code.length,sourceUnchanged:result.unchanged,searchMatches:1};
  });
  await check('Copy message preserves the archive while Copy code uses displayed formatting',async()=>{
   await page.locator('[data-copy-message]').first().click();await page.locator('[data-copy-code]').first().click();
   const result=await page.evaluate(()=>({copies:jsonCopies,display:document.querySelector('pre code').textContent,plain:TSAContent.plainText(jsonFixture),messages:TSAContent.normalize(jsonFixture).map(m=>m.content),unchanged:JSON.stringify(jsonFixture)===jsonBefore}));
   assert.equal(result.copies[0],raw);assert.equal(result.copies[1],result.display);assert.notEqual(result.copies[0],result.copies[1]);assert.equal(result.messages[0],raw);assert.ok(result.plain.includes(raw));assert.equal(result.unchanged,true);
   return {messageExact:true,codeMatchesDisplay:true,plainTextExact:true};
  });
  await check('User, tool, system, Markdown, mixed prose and fenced examples keep their prior rendering path',async()=>{
   const data=await page.evaluate(async()=>{
    const json='{"keep":true}';const thread={messages:[{role:'user',content:json},{role:'tool',content:json},{role:'system',content:json},{role:'assistant',content:'Before **bold**\n\n'+json},{role:'assistant',content:'[Read me](https://example.test/)'},{role:'assistant',content:'```json\n'+json+'\n```'},{role:'assistant',content:'    '+json},{role:'assistant',content:'true'}]};
    await mountJsonFixture(thread);
    return [...document.querySelectorAll('#thread-content .tsa-message')].map(e=>({code:e.querySelector('pre code')?.textContent||null,bold:e.querySelector('strong')?.textContent||null,link:e.querySelector('a')?.href||null}));
   });
   assert.equal(data.length,8);for(const i of [0,1,2,3,4,7])assert.equal(data[i].code,null);assert.equal(data[3].bold,'bold');assert.equal(data[4].link,'https://example.test/');assert.equal(data[5].code,'{"keep":true}');assert.equal(data[6].code,'{"keep":true}');
   return {excludedKinds:8};
  });
  await check('Literal HTML, rich widgets, TeX and Markdown inside JSON never execute or render as widgets',async()=>{
   const source=JSON.stringify({html:'<img src="https://example.test/tracker.png" onerror="window.JSON_PWNED=1"><script>window.JSON_PWNED=1</script>',rich:'<box><title>Injected widget</title></box><Chart content={{}} />',math:'$$x^2$$ \\(y\\)',markdown:'![img](https://example.test/tracker.png) [link](https://example.test/)'});
   await page.evaluate(s=>mountJsonFixture({turns:[{ai:s}]}),source);
   const result=await page.evaluate(()=>{const n=document.getElementById('thread-content');return {active:n.querySelectorAll('img,script,iframe,[onerror],.rich-box,.rich-chart,mjx-container,.chatgpt-math-placeholder,a[href]').length,pwned:!!window.JSON_PWNED,text:n.querySelector('code').textContent};});
   assert.equal(result.active,0);assert.equal(result.pwned,false);assert.deepEqual(JSON.parse(result.text),JSON.parse(source));
   return {activePayloadElements:0,sourceValuesPreserved:true};
  });
  await check('Conservative repairs are display-only; truncated JSON stays literal',async()=>{
   const repair='{ "text":"line\nnext", "list":[1,2,], }',broken='{"answer":"unfinished';
   const result=await page.evaluate(async({repair,broken})=>{await mountJsonFixture({turns:[{ai:repair},{ai:broken}]});return {code:[...document.querySelectorAll('#thread-content pre code')].map(e=>e.textContent),source:TSAContent.normalize(jsonFixture).map(m=>m.content)};},{repair,broken});
   assert.deepEqual(JSON.parse(result.code[0]),{text:'line\nnext',list:[1,2]});assert.equal(result.code[1],broken);assert.deepEqual(result.source,[repair,broken]);
   return {displayRepairs:'trailing commas and raw string line break',truncatedExact:true};
  });
  await check('Empty thoughts remain hidden, useful JSON stays visible, and source identities survive normalization',async()=>{
   const result=await page.evaluate(async()=>{
    const hidden=JSON.stringify({content_type:'thoughts',source_analysis_msg_id:'synthetic',thoughts:[{content:'',chunks:[],summary:'Search complete',finished:true}]});
    const useful=JSON.stringify({content_type:'thoughts',source_analysis_msg_id:'useful',thoughts:[{content:'Useful explanation.',chunks:[],summary:'Summary',finished:true}]});
    await mountJsonFixture({turns:[{turnIndex:7,ai:hidden},{turnIndex:8,thinking:hidden},{turnIndex:9,ai:'{"answer":42}'},{turnIndex:10,thinking:useful},{turnIndex:11,user:hidden}]});
    return {visible:jsonRendered.messages.map(m=>({role:m.role,turnIndex:m.turnIndex,content:m.content})),normalized:TSAContent.normalize(jsonFixture).length,metrics:jsonRendered.metrics,blocks:document.querySelectorAll('#thread-content .tsa-code-block').length,hiddenText:document.getElementById('thread-content').textContent.includes('"source_analysis_msg_id": "synthetic"')};
   });
   assert.equal(result.normalized,5);assert.deepEqual(result.visible.map(m=>[m.role,m.turnIndex]),[['assistant',9],['reasoning',10],['user',11]]);assert.equal(result.metrics.messages,3);assert.equal(result.blocks,2);assert.equal(result.hiddenText,false);
   return {storedMessages:5,visibleMessages:3,visibleJsonBlocks:2,preservedTurnIndices:[9,10,11]};
  });
  await check('Raw mapping, messages and server turns produce equivalent JSON displays on the chosen branch',async()=>{
   const result=await page.evaluate(async()=>{
    const content='{"answer":42,"name":"chosen"}';const mapping={current_node:'chosen',mapping:{root:{parent:null,message:null},prompt:{parent:'root',message:{author:{role:'user'},content:{parts:['Prompt']}}},chosen:{parent:'prompt',message:{author:{role:'assistant'},content:{content_type:'text',parts:[content]}}},other:{parent:'prompt',message:{author:{role:'assistant'},content:{parts:['{"other":true}']}}}}};
    const forms=[mapping,{turns:[{user:'Prompt'},{ai:content}]},{messages:[{role:'user',content:'Prompt'},{role:'assistant',content}]}];const displays=[];
    for(const thread of forms){await mountJsonFixture(thread);displays.push({source:jsonRendered.messages.map(m=>m.content),code:document.querySelector('#thread-content code').textContent,unchanged:JSON.stringify(thread)===jsonBefore});}return displays;
   });
   assert.equal(result.length,3);for(const item of result){assert.deepEqual(item.source,['Prompt','{"answer":42,"name":"chosen"}']);assert.equal(item.code,result[0].code);assert.equal(item.unchanged,true);}
   return {inputFormats:3,chosenBranchOnly:true};
  });
  await check('Light and dark JSON palettes fit the actual reading pane at desktop and 680 by 540',async()=>{
   const source=JSON.stringify({large:9007199254740991,title:'A long literal value: '+ 'x'.repeat(220),items:[{label:'first',value:42},{label:'second',value:false}]});
   await page.evaluate(s=>mountJsonFixture({turns:[{ai:s}]}),source);
   for(const theme of ['light','dark'])for(const size of [[1160,820],[680,540]]){
    await viewport(...size);await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const state=await page.evaluate(()=>{const block=document.querySelector('#thread-content .tsa-code-block'),reader=document.getElementById('reader-scroll'),pre=block.querySelector('pre'),rect=block.getBoundingClientRect();return {theme:document.documentElement.dataset.theme,width:innerWidth,height:innerHeight,globalOverflow:document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight,readerOverflow:reader.scrollWidth>reader.clientWidth,codeBackground:getComputedStyle(block).backgroundColor,codeText:getComputedStyle(block).color,preScrollable:pre.scrollWidth>pre.clientWidth,blockWidth:rect.width,readerWidth:reader.clientWidth};});
    assert.equal(state.globalOverflow,false);assert.equal(state.readerOverflow,false);assert.ok(state.blockWidth<=state.readerWidth);assert.equal(state.codeBackground,theme==='dark'?'rgb(30, 30, 30)':'rgb(255, 255, 255)');assert.equal(state.codeText,theme==='dark'?'rgb(212, 212, 212)':'rgb(0, 0, 0)');assert.equal(state.preScrollable,true);report.layouts.push(state);
   }
   return {layouts:report.layouts.length};
  });
  assert.deepEqual(report.requests,[]);assert.deepEqual(report.errors,[]);report.passed=true;
 }finally{if(electron)await electron.close();if(browser)await browser.close();if(temporary)await fs.rm(temporary,{recursive:true,force:true});}
})().catch(error=>{report.failure=error.stack;console.error(error);process.exitCode=1;}).finally(async()=>{const output=process.env.JSON_REPORT||path.join(root,'docs/verification/json-rendering.json');await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,layouts:report.layouts.length,requests:report.requests.length,errors:report.errors,failure:report.failure},null,2));});
