#!/usr/bin/env python3
"""Cross-check experimental resolver with pinned official depot_tools parser.
Only dependency-free parser error/container imports are supplied locally. No DEPS
or hooks are executed; official parser uses its AST/schema validation.
"""
import importlib,importlib.util,json,sys,types,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT))
sys.modules['gclient_utils']=types.SimpleNamespace(Error=ValueError)
sys.modules['from_third_party']=types.SimpleNamespace(import_module=importlib.import_module)
import gclient_eval
s=importlib.util.spec_from_file_location('resolver',ROOT/'resolve-deps.py'); r=importlib.util.module_from_spec(s); s.loader.exec_module(r)
original=json.loads((ROOT/'deps-45.1-inventory.json').read_text())
def parse(text,parent,builtin):
 d=gclient_eval.Parse(text,'pinned-DEPS',parent,builtin)
 effective={**d.get('vars',{}),**parent,**builtin}
 return d,effective
r.parse=parse
r.condition=gclient_eval.EvaluateCondition
results=[]
for target in ['linux','win']:
 actual=r.graph(target)
 expected=next(x for x in original['targets'] if x['target']==target)

 for item in [actual,expected]:
  for row in item['parsed']:
   row.pop('effective_variables',None); row.pop('literal_variables',None)
  for k in ['dependencies','selected_git']:
   for row in item[k]: row.setdefault('dep_type','git')
 if actual!=expected:
  for a,b in zip(actual['dependencies'],expected['dependencies']):
   if a!=b: print('DIFFERENCE',a,b); break
  raise AssertionError(target+' differs from official parser')
 results.append({'target':target,'dependencies':len(actual['dependencies']),'selected_git':len(actual['selected_git']),'all_rows_equal':True})
report={'passed':True,'depot_tools_revision':'c61f9e27ffddc07c383f71f05d733fe326b8e216','parser_sha256':hashlib.sha256((ROOT/'gclient_eval.py').read_bytes()).hexdigest(),'scope':'Every dependency row and condition compared to official safe AST parser. Graph traversal implements reviewed gclient parent-variable precedence; no downloads/hooks or publication claim.','targets':results}
report['input_sha256'] = {name: hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in ['deps-45.1-inventory.json','resolve-deps.py','gclient_eval.py','schema.py']}
report['deps_inputs'] = [{'file':str(p.relative_to(ROOT)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted((ROOT/'deps-inputs').iterdir()) if p.is_file()]
(ROOT/'deps-upstream-parser-crosscheck.json').write_text(json.dumps(report,indent=2)+'\n'); print(json.dumps(report,indent=2))
