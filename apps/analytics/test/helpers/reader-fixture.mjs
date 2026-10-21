/** Public, entirely synthetic Reader 3.1.0 storage fixture. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { encodeBuffer, encodeFile } from '../../src/core/codec.mjs';
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export const id=()=>randomUUID().replaceAll('-','');
const stableJSON=value=>Array.isArray(value)?`[${value.map(stableJSON).join(',')}]`:value&&typeof value==='object'?`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stableJSON(value[key])}`).join(',')}}`:JSON.stringify(value);
export async function fixture(directory,{profile='7z',provider='openai',readingSentinel='EXCLUDED-READING-SENTINEL',sourceName='Reader profile árvíz'}={}){
  const source=path.join(directory,sourceName),root=path.join(source,'local-storage-v2'),epoch=id();for(const sub of ['snapshots','objects',`records/${epoch}`])await fs.mkdir(path.join(root,sub),{recursive:true});
  const pack=async value=>{const bytes=Buffer.from(JSON.stringify(value)),encoded=encodeBuffer(bytes,profile),object={bytes:bytes.length,sha256:hash(bytes),packedBytes:encoded.length,packedSha256:hash(encoded),codec:profile};object.file=`${object.sha256}.${object.packedSha256}.${profile==='7z'?'7z':'zip'}`;await fs.writeFile(path.join(root,'objects',object.file),encoded);return {bytes:bytes.length,blocks:[object]};};
  const document={provider,title:'Synthetic conversation',conversationKey:'synthetic-native-id',raw:{mapping:{node:{message:{author:{role:'user'},content:{content_type:'text',parts:['One synthetic question']}}}}},turns:[{user:'One synthetic question',ai:'One synthetic answer',turn_index:0}]};
  const ref={format:'threadshelf-content-v2',version:1,turnCount:1,header:await pack(Object.fromEntries(Object.entries(document).filter(([key])=>key!=='turns'))),groups:[{first:0,count:1,blob:await pack(document.turns)}]};
  const catalog=path.join(directory,'synthetic-catalog.sqlite'),db=new DatabaseSync(catalog);db.exec(`
    CREATE TABLE metadata(key TEXT PRIMARY KEY,value);INSERT INTO metadata VALUES('revision',1),('archiveIdentity','synthetic-archive');
    CREATE TABLE collections(id TEXT PRIMARY KEY,name TEXT,created_at TEXT,updated_at TEXT);
    CREATE TABLE conversations(id TEXT PRIMARY KEY,collection_id TEXT,source_identity_json TEXT,collection TEXT,provider TEXT,source_file TEXT,conversation_key TEXT,title TEXT,turn_count INTEGER,last_turn_at TEXT,content_hash TEXT,content_ref TEXT,created_at TEXT,updated_at TEXT);
    CREATE TABLE applied_operations(op_id TEXT PRIMARY KEY,revision INTEGER,result_json TEXT);
    PRAGMA application_id=1414745170;PRAGMA user_version=3;`);
  db.prepare('INSERT INTO collections VALUES(?,?,?,?)').run('collection-one','Mixed collection','2026-01-01','2026-01-01');db.prepare('INSERT INTO conversations VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('local-one','collection-one',JSON.stringify({kind:'native',provider,key:document.conversationKey}),'Mixed collection',provider,'synthetic.json',document.conversationKey,document.title,1,null,hash(stableJSON(document)),JSON.stringify(ref),'2026-01-01','2026-01-01');
  db.prepare('INSERT INTO applied_operations VALUES(?,?,?)').run('prior-op',1,JSON.stringify({copyBookmarks:true,excludedTestSentinel:readingSentinel}));db.close();
  const snapshotFile=`${id()}.${profile==='7z'?'7z':'zip'}`;await encodeFile(catalog,path.join(root,'snapshots',snapshotFile),{profile,maxBytes:1024*1024});
  let pointer={format:'threadshelf-local-storage-v2',version:2,epoch,sequence:0,file:snapshotFile,sha256:hash(await fs.readFile(path.join(root,'snapshots',snapshotFile))),profile,logicalBytes:(await fs.stat(catalog)).size,createdAt:'2026-01-01T00:00:00Z',reading:{positions:{private:readingSentinel},bookmarks:[{text:readingSentinel}],recent:[readingSentinel]}};
  let head={format:pointer.format,version:2,epoch,sequence:0,id:null,recordHash:null};
  const envelope=value=>JSON.stringify({value,sha256:hash(JSON.stringify(value))});
  const publish=async()=>{const tmp=path.join(root,'current.json.part');await fs.writeFile(tmp,envelope(pointer));await fs.rename(tmp,path.join(root,'current.json'));};
  await publish();await fs.writeFile(path.join(root,'records',epoch,'head.json'),envelope(head));
  for(const name of ['settings.json','interface.json','appearance.json','layout.json','reading-v2.json'])await fs.writeFile(path.join(source,name),readingSentinel);await fs.mkdir(path.join(source,'activity-v1'));await fs.writeFile(path.join(source,'activity-v1','private.sqlite'),readingSentinel);await fs.mkdir(path.join(source,'search'));await fs.writeFile(path.join(source,'search','private-index'),readingSentinel);
  return {source,root,epoch,ref,document,get pointer(){return pointer;},get head(){return head;},async updateReading(){pointer={...pointer,reading:{positions:{next:readingSentinel+'-new'},bookmarks:[],recent:[]}};await publish();},async republishGeneration(){const newFile=`${id()}.${profile==='7z'?'7z':'zip'}`;await fs.copyFile(path.join(root,'snapshots',pointer.file),path.join(root,'snapshots',newFile));pointer={...pointer,file:newFile};await publish();},async append(record){const sequence=head.sequence+1,recordId=id(),bytes=gzipSync(JSON.stringify({version:2,epoch,sequence,id:recordId,sha256:hash(JSON.stringify(record)),record})),name=`${String(sequence).padStart(16,'0')}-${recordId}.json.gz`;await fs.writeFile(path.join(root,'records',epoch,name),bytes);head={...head,sequence,id:recordId,recordHash:hash(bytes)};const tmp=path.join(root,'records',epoch,'head.json.part');await fs.writeFile(tmp,envelope(head));await fs.rename(tmp,path.join(root,'records',epoch,'head.json'));return name;},async corruptPointer(){await fs.writeFile(path.join(root,'current.json'),JSON.stringify({value:pointer,sha256:'0'.repeat(64)}));}};
}
