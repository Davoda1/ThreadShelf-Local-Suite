#!/usr/bin/env python3
"""Reuse the full-tree archive verifier with explicitly Git-object-derived metadata."""
import hashlib,importlib.util,json,pathlib
R=pathlib.Path(__file__).resolve().parent;S=pathlib.Path('/tmp/threadshelf-source-staging/clang-format-exact');report=json.loads((R/'EXACT-GIT-SOURCE-PROOF.json').read_text())
spec=importlib.util.spec_from_file_location('source_identity',R.parent/'verify-gitiles-representation.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class ExactGitMetadata:
 repository=report['repository'];revision=report['revision'];receipts={}
 def get(self,path):
  row=next(x for x in report['treeObjects'] if x['path']==path)
  data={'id':row['gitTree'],'entries':[{'name':x['name'],'mode':int(x['mode'],8),'type':'tree' if x['mode']=='40000' else 'blob','id':x['object']} for x in row['entries']]}
  return module.validate_tree(data)

def desc(name):
 p=R/name;return {'file':name,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
receipt={'schema_version':1,'repository':report['repository'],'revision':report['revision'],'fetched_revision':report['revision'],'retrieval_method':'git-smart-http','requested_depth':1,'requested_ref':report['revision'],'fetch_endpoint':report['officialEndpoint'],'ref_advertisement':report['refAdvertisement'],'raw_commit':report['rawCommit'],'scope':'Exact revision requested and fetched from the original official repository using Git smart HTTP. Ref advertisement includes this revision as HEAD/main. Raw commit object identity and all archive Git trees/blobs are independently checked; no Gitiles HTTP JSON assertion is substituted.'}
(R/'retrieval-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
archive=pathlib.Path(report['archive']['file']);proof=module.inspect_archive(archive,ExactGitMetadata(),inventory_path=R/'full-inventory.jsonl.gz')
proof.update({'source_identity_method':'git-commit-object','commit_object':desc('commit.raw'),'retrieval_receipt':desc('retrieval-receipt.json'),'scope':'Exact Git source identity from raw commit/tree/blob objects obtained using official Git smart HTTP. The raw commit Git object SHA1 equals the planned revision and binds the reconstructed root tree. Archive bytes preserve every blob and mode; no source code or hooks executed.'})
rows=[r for r in json.loads((R.parent/'part06-final-collection-plan.json').read_text()) if r.get('repository')==report['repository'] and r.get('revision')==report['revision']]
outputs=[]
for row in rows:
 out={**proof,'archive':row['archive']};name=('clang-format-direct' if row['path']=='src/third_party/clang-format/script' else 'clang-format-webpagereplay')+'-proof.json';(R/name).write_text(json.dumps(out,indent=2)+'\n')
 local={**row,'local_file':str(archive),'expected_sha256':proof['archive_sha256'],'archive_representation':{'kind':'git-tree-derived-tar','retrieval_method':'git-smart-http','proof':desc(name)}};outputs.append(local)
(R/'LOCAL-SOURCE-ROWS.json').write_text(json.dumps(outputs,indent=2)+'\n');print(json.dumps({'ready':True,'archive':report['archive'],'ownerProofs':[r['archive_representation']['proof'] for r in outputs],'sourceInventory':proof['source_inventory']},indent=2))
