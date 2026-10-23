'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {StateStore,cleanState}=require('../core/state.cjs');
test('Alternative profile writes remain isolated from sibling Reader files',()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'tsa-state-'));try{fs.mkdirSync(path.join(root,'ThreadShelf Local Reader'));const old=path.join(root,'ThreadShelf Local Reader','settings.json');fs.writeFileSync(old,'keep byte exact');const store=new StateStore(path.join(root,'ThreadShelf Local Alternative'));store.save({theme:'dark',pins:[{sourceFile:'/secret/a.json',conversationKey:'two',serverUrl:'http://localhost:3000'}]});assert.equal(store.load().theme,'dark');assert.equal(store.load().pins[0].conversationKey,'two');assert.equal(fs.readFileSync(old,'utf8'),'keep byte exact');}finally{fs.rmSync(root,{recursive:true,force:true});}});
test('invalid preferences are constrained, corruption is preserved on load',()=>{assert.equal(cleanState({fontSize:200,theme:'other'}).fontSize,24);assert.equal(cleanState({theme:'other'}).theme,'system');const root=fs.mkdtempSync(path.join(os.tmpdir(),'tsa-bad-'));try{const store=new StateStore(root);fs.writeFileSync(store.file,'broken');assert.equal(store.load().version,1);assert.match(store.error,/could not/);assert.equal(fs.readFileSync(store.file,'utf8'),'broken');}finally{fs.rmSync(root,{recursive:true,force:true});}});
test('persisted settings retain scoped pins, searches and reading position',()=>{const original={pins:[{serverUrl:'http://one:3000',collection:'a',sourceFile:'same',conversationKey:'x'},{serverUrl:'http://two:3000',collection:'a',sourceFile:'same',conversationKey:'x'}],savedSearches:[{name:'Exact',q:'console.log',mode:'keyword',collection:'a'}],positions:{abc:42},showReasoning:true,lineWidth:'wide'};const cleaned=cleanState(original);assert.deepEqual(cleaned.pins,original.pins);assert.deepEqual(cleaned.positions,{abc:42});assert.equal(cleaned.showReasoning,true);});

test('corrupt saved settings block autosave and close-flush writes until explicit closed-profile recovery',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'tsa-protected-'));
  try{
    const store=new StateStore(root), original='{ broken synthetic settings';
    fs.writeFileSync(store.file,original);
    const defaults=store.load();
    assert.equal(defaults.theme,'system');assert.match(store.error,/protect the original/);
    for(const value of [defaults,{...defaults,theme:'dark',pins:[{id:'new-demo-pin'}]}]){
      assert.throws(()=>store.save(value),/Changes stay in this session/);
      assert.equal(fs.readFileSync(store.file,'utf8'),original);
    }
    assert.deepEqual(fs.readdirSync(root),['alternative-state.json']);
    // Moving aside state is an explicit recovery while the application is closed.
    const backup=store.file+'.preserved';fs.renameSync(store.file,backup);
    const restarted=new StateStore(root);assert.equal(restarted.load().theme,'system');
    restarted.save({theme:'dark'});assert.equal(restarted.load().theme,'dark');
    assert.equal(fs.readFileSync(backup,'utf8'),original);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('oversized saved settings remain byte-exact when a default-state flush is attempted',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'tsa-large-state-'));
  try{
    const store=new StateStore(root), original=Buffer.alloc(8*1024*1024+1,0x20);
    fs.writeFileSync(store.file,original);const defaults=store.load();
    assert.match(store.error,/could not be read/);assert.throws(()=>store.save(defaults),/protect the original/);
    assert.deepEqual(fs.readFileSync(store.file),original);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});


test('image preference upgrades existing profiles without changing their identity or saved records',()=>{
 const old={version:1,theme:'dark',pins:[{id:'synthetic-pin',serverUrl:'http://localhost:3000'}],positions:{synthetic:37},savedSearches:[{name:'Example',q:'example'}]};
 const before=JSON.stringify(old),upgraded=cleanState(old);
 assert.equal(upgraded.imageMode,'click');assert.deepEqual(upgraded.pins,old.pins);assert.deepEqual(upgraded.positions,old.positions);assert.deepEqual(upgraded.savedSearches,old.savedSearches);assert.equal(JSON.stringify(old),before);
 for(const value of [undefined,null,'other',true,{}])assert.equal(cleanState({...old,imageMode:value}).imageMode,'click');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'tsa-images-'));try{const store=new StateStore(directory);store.save({...old,imageMode:'auto'});assert.equal(store.load().imageMode,'auto');assert.deepEqual(store.load().positions,old.positions);store.save({...store.load(),imageMode:'click'});assert.equal(store.load().imageMode,'click');}finally{fs.rmSync(directory,{recursive:true,force:true});}
});
