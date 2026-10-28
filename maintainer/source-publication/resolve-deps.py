#!/usr/bin/env python3
"""Read-only experimental DEPS inventory; never executes DEPS or upstream hooks.

Implements a deliberately narrow AST subset, following the reviewed depot_tools
c61f9e27ffddc07c383f71f05d733fe326b8e216 variable/condition precedence. Any
unsupported syntax fails closed. Output is preparation evidence, not publication.
"""
import ast,base64,hashlib,json,re,string,urllib.request
from collections.abc import Mapping
from pathlib import Path,PurePosixPath
ROOT=Path(__file__).resolve().parent
REPO=ROOT.parent/'ThreadShelf-Local-Suite'
CACHE=ROOT/'deps-inputs'; CACHE.mkdir(exist_ok=True)
class Literal(str): pass
class Formatter(string.Formatter):
 def get_field(self,name,args,kwargs):
  if '.' in name or '[' in name: raise ValueError('Unsafe format field')
  return super().get_field(name,args,kwargs)
FMT=Formatter()
def value(n,variables=None):
 if isinstance(n,ast.Constant):
  return FMT.vformat(n.value,(),variables) if isinstance(n.value,str) and variables is not None else n.value
 if isinstance(n,(ast.List,ast.Tuple)): return [value(x,variables) for x in n.elts]
 if isinstance(n,ast.Dict):
  result={}
  for k,v in zip(n.keys,n.values):
   key=value(k,variables)
   if key in result: raise ValueError('Duplicate dictionary key')
   result[key]=value(v,variables)
  return result
 if isinstance(n,ast.BinOp) and isinstance(n.op,(ast.Add,ast.Mod)):
  a,b=value(n.left,variables),value(n.right,variables)
  return a+b if isinstance(n.op,ast.Add) else a%b
 if isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id in ('Var','Str') and len(n.args)==1 and not n.keywords:
  s=value(n.args[0],variables)
  if not isinstance(s,str): raise ValueError('Var/Str expects string')
  if n.func.id=='Str': return Literal(s)
  return '{'+s+'}' if variables is None else variables[s]
 raise ValueError('Unsupported AST '+ast.dump(n))
def parse(text,parent,builtin):
 assignments={}
 for n in ast.parse(text).body:
  if not isinstance(n,ast.Assign) or len(n.targets)!=1 or not isinstance(n.targets[0],ast.Name): raise ValueError('Non-data DEPS statement')
  name=n.targets[0].id
  if name in assignments: raise ValueError('Duplicate assignment')
  assignments[name]=n.value
 raw=value(assignments.get('vars',ast.Dict(keys=[],values=[])))
 variables={**raw,**builtin}
 variables.update({k:v for k,v in parent.items() if k in variables})
 data={k:value(n,variables) for k,n in assignments.items()}
 effective={**data.get('vars',{}),**parent,**builtin}
 return data,effective
def condition(expr,variables,seen=()):
 def cv(n):
  if isinstance(n,ast.Constant): return n.value
  if isinstance(n,ast.Name):
   if n.id in seen: raise ValueError('Cyclic condition')
   if n.id not in variables: return n.id
   v=variables[n.id]
   return condition(v,variables,seen+(n.id,)) if isinstance(v,str) and not isinstance(v,Literal) else v
  if isinstance(n,ast.Tuple): return tuple(cv(x) for x in n.elts)
  if isinstance(n,ast.BoolOp):
   vs=[cv(x) for x in n.values]
   if any(type(v) is not bool for v in vs): raise ValueError('Nonboolean condition '+expr+repr(vs))
   return all(vs) if isinstance(n.op,ast.And) else any(vs)
  if isinstance(n,ast.UnaryOp) and isinstance(n.op,ast.Not):
   v=cv(n.operand)
   if type(v) is not bool: raise ValueError('Nonboolean not')
   return not v
  if isinstance(n,ast.Compare) and len(n.ops)==1:
   a,b=cv(n.left),cv(n.comparators[0]); op=n.ops[0]
   if isinstance(op,ast.Eq): return a==b
   if isinstance(op,ast.NotEq): return a!=b
   if isinstance(op,ast.In): return a in b
   if isinstance(op,ast.NotIn): return a not in b
  raise ValueError('Unsupported condition '+ast.dump(n))
 return cv(ast.parse(expr,mode='eval').body)
def builtins(target):
 d={f'checkout_{s}':s==target for s in ['android','chromeos','fuchsia','ios','linux','mac','win']}
 d.update({f'checkout_{s}':s=='x64' for s in ['arm','arm64','x86','mips','mips64','ppc','riscv64','s390','x64','loong64']})
 d.update(host_os=Literal(target),host_cpu=Literal('x64'))
 return d
def retrieve(repo,revision,file):
 key=hashlib.sha256((repo+'@'+revision+'/'+file).encode()).hexdigest()[:16]
 target=CACHE/(key+'-'+file.replace('/','__'))
 if repo.startswith('https://github.com/'):
  url=repo.removesuffix('.git').replace('https://github.com/','https://raw.githubusercontent.com/')+'/'+revision+'/'+file
  decode=False
 else:
  url=repo+'/+/'+revision+'/'+file+'?format=TEXT'
  decode=True
 if target.exists():
  record=json.loads(target.with_suffix(target.suffix+'.json').read_text()); content=target.read_bytes()
  if record['url']!=url or record['bytes']!=len(content) or record['sha256']!=hashlib.sha256(content).hexdigest(): raise ValueError('Cached DEPS provenance mismatch')
  return content.decode()
 data=urllib.request.urlopen(url,timeout=40).read()
 if decode: data=base64.b64decode(data)
 target.write_bytes(data)
 target.with_suffix(target.suffix+'.json').write_text(json.dumps({'url':url,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()},indent=2)+'\n')
 return data.decode()
def safe_path(s):
 p=PurePosixPath(s)
 if p.is_absolute() or '..' in p.parts or '\\' in s: raise ValueError('Unsafe checkout path')
 return str(p)
def graph(target):
 records=[]; selected={}; parsed=[]
 queue=[('src/electron','https://github.com/electron/electron.git','45d20ec03000aac41e73b2abdb707936b4f98ed0','DEPS',{},False)]
 while queue:
  path,repo,rev,file,parent,relative=queue.pop(0)
  print(target,path,flush=True)
  if path=='src/electron': text=(REPO/'maintainer/runtime-source-inputs/45.1.0/electron-DEPS').read_text()
  elif path=='src': text=(REPO/'maintainer/runtime-source-inputs/45.1.0/chromium-DEPS').read_text()
  else: text=retrieve(repo,rev,file)
  data,variables=parse(text,parent,builtins(target)); parsed.append({'path':path,'revision':rev,'file':file,'sha256':hashlib.sha256(text.encode()).hexdigest(),'effective_variables':variables,'literal_variables':[k for k,v in variables.items() if isinstance(v,Literal)]})
  rel=path if data.get('use_relative_paths') else str(PurePosixPath(path).parent) if relative else ''
  deps={}
  for k,v in data.get('deps',{}).items(): deps[k]=dict(v) if isinstance(v,Mapping) else {'url':v}
  for os,items in data.get('deps_os',{}).items():
   for k,v in items.items():
    v=dict(v) if isinstance(v,Mapping) else {'url':v}
    c='checkout_'+('linux' if os=='unix' else os)
    if v.get('condition'): c=f'({v["condition"]}) and ({c})'
    if k in deps:
     if deps[k].get('url')!=v.get('url'): raise ValueError('Conflicting deps_os')
     c=f'({deps[k].get("condition","True")}) or ({c})'
    v['condition']=c; deps[k]=v
  for p,v in deps.items():
   p=safe_path(str(PurePosixPath(rel)/p)); c=v.get('condition','True'); outcome=condition(c,variables)
   if type(outcome) is not bool: raise ValueError('Nonboolean final condition '+c)
   row={'path':p,'deps_file':path+'/'+file,'target':target,'condition':c,'enabled':outcome,**v}
   records.append(row)
   if outcome and v.get('url'):
    if p in selected and selected[p]['url']!=v['url']: raise ValueError('Conflicting selected URL '+p)
    selected[p]=row
  for child in data.get('recursedeps',[]):
   p,f=(child,'DEPS') if isinstance(child,str) else child
   p=safe_path(str(PurePosixPath(rel)/p))
   if p not in selected: continue
   r,revision=selected[p]['url'].rsplit('@',1)
   queue.append((p,r,revision,f,variables,bool(data.get('use_relative_paths'))))
 return {'target':target,'parsed':parsed,'dependencies':records,'selected_git':list(selected.values())}
if __name__=='__main__':
 result={'status':'experimental-inventory-not-publication','electron':'45.1.0','targets':[]}
 for target in ['linux','win']:
  result['targets'].append(graph(target)); (ROOT/'deps-45.1-inventory.json').write_text(json.dumps(result,indent=2)+'\n')
 print(json.dumps({x['target']:{'parsed':len(x['parsed']),'rows':len(x['dependencies']),'selected_git':len(x['selected_git'])} for x in result['targets']},indent=2))
