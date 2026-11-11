import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ApplicationService } from '../src/core/service.mjs';

test('incremental import preserves checkpoint reserves and refreshes growing catalogs without rescanning bodies',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'reader-space-growth-'));
  t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const sqlite=pages=>({prepare:sql=>({get:()=>sql.includes('page_count')?{page_count:pages}:{page_size:4096}})});
  const service=Object.create(ApplicationService.prototype);
  service.dataDir=directory;service.storage={workingDir:directory};
  service.store={db:sqlite(128),contentDir:directory,contentReferences(){throw Error('Must reuse the metadata inventory');}};
  service.operation={space:{catalogBytes:4096,uniqueExpandedContentBytes:8192,uniqueCompressedContentBytes:1024,
    additionalCatalogBytes:262144,conversationCount:1,objectCount:1,logicalContentBytes:8192,sizeSource:'catalog-metadata'}};
  let result=await service.checkImportWriteSpace(16384,new AbortController().signal);
  assert.equal(result.catalogBytes,128*4096);
  assert.equal(result.additionalCatalogBytes,262144,'retain reserve even if the search database is not open');
  assert.equal(result.budget.workingBytes,2*(128*4096+262144));
  service.searcher={_db:sqlite(256)};
  result=await service.checkImportWriteSpace(16384,new AbortController().signal);
  assert.equal(result.additionalCatalogBytes,256*4096,'refresh the search catalog when it grows');
  assert.equal(result.budget.workingBytes,2*((128+256)*4096));
});

test('import reserves unopened vector snapshots and closed legacy catalogs including their WAL',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'reader-space-vector-'));
  t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const mib=1024**2,service=Object.create(ApplicationService.prototype);
  service.dataDir=directory;service.onProgress=()=>{};service.operation={};
  service.storage={workingDir:directory,vectorPath:path.join(directory,'vectors.sqlite'),pointer:{vectors:{logicalBytes:2*mib}}};
  service.store={contentDir:directory,contentReferences:()=>[],db:{prepare:sql=>({get:()=>sql.includes('page_count')?{page_count:4}:{page_size:4096}})}};
  let result=await service.importSpace(new AbortController().signal);
  assert.equal(result.additionalCatalogBytes,2*mib,'reserve lazy snapshot expansion before cleanup');
  assert.equal(result.budget.workingBytes,2*(16384+2*mib));
  await fs.writeFile(service.storage.vectorPath,Buffer.alloc(3*mib));
  await fs.writeFile(`${service.storage.vectorPath}-wal`,Buffer.alloc(mib/2));
  result=await service.checkImportWriteSpace(16384,new AbortController().signal);
  assert.equal(result.additionalCatalogBytes,3.5*mib,'closed legacy catalog and WAL are budgeted without opening the index');
  await fs.rm(service.storage.vectorPath);await fs.rm(`${service.storage.vectorPath}-wal`);
  service.storage.pointer.vectors.logicalBytes=mib;
  result=await service.checkImportWriteSpace(16384,new AbortController().signal);
  assert.equal(result.additionalCatalogBytes,2*mib,'retain the initial snapshot reserve');
});
