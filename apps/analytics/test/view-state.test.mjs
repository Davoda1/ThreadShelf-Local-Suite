import test from 'node:test';
import assert from 'node:assert/strict';
import {captureViewState,restoreViewState,describeViewNode,findViewNode} from '../src/ui/view-state.mjs';

// A small DOM-interface fixture keeps these identity/state tests independent
// from a browser dependency. Native GUI tests cover actual geometry and focus.
class Node {
  constructor(tag,attributes={},children=[]){this.nodeType=1;this.tagName=tag.toUpperCase();this.attributes={...attributes};this.children=[];this.scrollTop=0;this.scrollLeft=0;this.value='';this.checked=false;this.selected=false;this.open=false;this.multiple=false;this.selectionStart=null;this.selectionEnd=null;this.selectionDirection='none';this.focusCalls=[];this.append(...children);}
  get id(){return this.getAttribute('id')||'';}
  get type(){return this.getAttribute('type')||(this.tagName==='INPUT'?'text':'');}
  get options(){return this.children.filter(node=>node.tagName==='OPTION');}
  get form(){for(let parent=this.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='FORM')return parent;return null;}
  getAttribute(name){return Object.hasOwn(this.attributes,name)?this.attributes[name]:null;}
  append(...nodes){for(const node of nodes){node.parentNode=this;node.parentElement=this;this.children.push(node);node.attachDocument(this.ownerDocument);}}
  attachDocument(document){this.ownerDocument=document;for(const node of this.children)node.attachDocument(document);}
  contains(node){for(let current=node;current;current=current.parentNode)if(current===this)return true;return false;}
  matches(selector){return selector.split(',').some(raw=>{
    const value=raw.trim();if(value==='*')return true;
    if(value.startsWith('#'))return this.id===value.slice(1);
    if(value==='form input'||value==='form select'||value==='form textarea')return this.tagName===value.split(' ')[1].toUpperCase()&&!!this.form;
    if(value==='.code-block pre')return this.tagName==='PRE'&&this.parentElement?.matches('.code-block');
    if(value.startsWith('.'))return (this.getAttribute('class')||'').split(/\s+/).includes(value.slice(1));
    const match=/^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(value);
    if(match)return this.getAttribute(match[1])!==null&&(match[2]===undefined||this.getAttribute(match[1])===match[2]);
    return this.tagName===value.toUpperCase();
  });}
  querySelectorAll(selector){const found=[];const visit=node=>{for(const child of node.children){if(child.matches(selector))found.push(child);visit(child);}};visit(this);return found;}
  focus(options){this.focusCalls.push(options);this.ownerDocument.activeElement=this;this.onFocus?.(options);}
  setSelectionRange(start,end,direction){this.selectionStart=start;this.selectionEnd=end;this.selectionDirection=direction;}
}
class Document extends Node {
  constructor(body){super('document');this.nodeType=9;this.ownerDocument=this;this.replace(body);}
  replace(body){this.children=[];this.body=body;this.append(body);this.activeElement=body;}
}
const node=(tag,attrs,children)=>new Node(tag,attrs,children);
function view(context='workspace:overview'){
  const field=node('input',{name:'draft',type:'text'}),check=node('input',{name:'includeEvidence',type:'checkbox'}),form=node('form',{id:'filters-form'},[field,check]);
  const details=node('details',{'data-view-key':'details:exact-table'},[form]);
  const table=node('div',{class:'table-wrap','data-view-key':'table:exact'});
  const content=node('div',{id:'workspace-scroll'},[node('section',{'data-view-key':'card:one'},[details,table])]);
  const nav=node('nav',{class:'navigation'}),search=node('input',{'data-quick':'search'}),quick=node('select',{'data-quick':'range'});
  const app=node('main',{'data-view-context':context},[nav,search,quick,content]);
  return {body:node('body',{},[app]),app,content,nav,field,check,form,details,table,search,quick};
}

test('full replacement retains independent pane axes, open details, drafts, caret and focus in order',()=>{
  const before=view(),document=new Document(before.body);
  before.content.scrollTop=417;before.nav.scrollTop=19;before.table.scrollTop=53;before.table.scrollLeft=88;before.details.open=true;
  before.field.value='uncommitted draft';before.check.checked=true;before.search.value='unfinished search';before.field.selectionStart=2;before.field.selectionEnd=7;before.field.selectionDirection='backward';before.field.focus();
  const snapshot=captureViewState(document.body),after=view();document.replace(after.body);
  after.field.onFocus=options=>{assert.equal(options.preventScroll,true);assert.equal(after.details.open,true);assert.equal(after.field.value,'uncommitted draft');assert.equal(after.content.scrollTop,0,'pane positions restore after focus');};
  restoreViewState(document.body,snapshot);
  assert.equal(after.content.scrollTop,417);assert.equal(after.nav.scrollTop,19);assert.equal(after.table.scrollTop,53);assert.equal(after.table.scrollLeft,88);assert.equal(after.check.checked,true);assert.equal(after.search.value,'unfinished search');assert.strictEqual(document.activeElement,after.field);assert.deepEqual([after.field.selectionStart,after.field.selectionEnd,after.field.selectionDirection],[2,7,'backward']);
});

test('changed workspace context never receives old positions, private-evidence opt-in or input drafts',()=>{
  const before=view(),document=new Document(before.body);before.field.value='old alias';before.check.checked=true;before.details.open=true;before.content.scrollTop=800;before.field.focus();
  const snapshot=captureViewState(document.body),after=view('workspace:content');document.replace(after.body);restoreViewState(document.body,snapshot);
  assert.equal(after.field.value,'');assert.equal(after.check.checked,false);assert.equal(after.details.open,false);assert.equal(after.content.scrollTop,0);assert.strictEqual(document.activeElement,after.body);
});

test('semantic opener identity survives inserted siblings; vanished named controls are not replaced by index',()=>{
  const before=view(),document=new Document(before.body),opener=node('button',{'data-action':'show','data-source':'original'});before.form.append(opener);
  const descriptor=describeViewNode(opener,document.body),after=view();document.replace(after.body);
  const sibling=node('button',{'data-action':'other'}),replacement=node('button',{'data-action':'show','data-source':'original'});after.form.append(sibling,replacement);
  assert.strictEqual(findViewNode(document.body,descriptor),replacement);
  replacement.attributes['data-source']='different';assert.equal(findViewNode(document.body,descriptor),null);
});

test('drafts:false preserves geometry and focus without reviving an explicit form reset or toolbar selection',()=>{
  const before=view(),document=new Document(before.body);before.field.value='old';before.check.checked=true;before.quick.value='year';before.content.scrollTop=60;before.field.focus();
  const snapshot=captureViewState(document.body),after=view();document.replace(after.body);after.field.value='reset';after.quick.value='all';restoreViewState(document.body,snapshot,{drafts:false});
  assert.equal(after.field.value,'reset');assert.equal(after.check.checked,false);assert.equal(after.quick.value,'all');assert.equal(after.content.scrollTop,60);assert.strictEqual(document.activeElement,after.field);
  assert(!snapshot.drafts.some(item=>item.node.attributes['data-quick']==='range'),'toolbar selects are not form drafts');
});

test('multiple selects and same-name radio/check values preserve their distinct choices',()=>{
  const build=()=>{const options=['a','b','c'].map(value=>{const option=node('option');option.value=value;return option;});const select=node('select',{name:'models'},options);select.multiple=true;const radios=['a','b'].map(value=>node('input',{name:'choice',type:'radio',value}));const checks=['a','b'].map(value=>node('input',{name:'flags',type:'checkbox',value}));const form=node('form',{id:'draft-form'},[select,...radios,...checks]);return {body:node('body',{},[node('div',{'data-view-context':'dialog:filters','data-view-key':'form:filters'},[form])]),select,radios,checks};};
  const before=build(),document=new Document(before.body);before.select.options[0].selected=true;before.select.options[2].selected=true;before.radios[1].checked=true;before.checks[0].checked=true;
  const snapshot=captureViewState(document.body),after=build();document.replace(after.body);restoreViewState(document.body,snapshot);
  assert.deepEqual(after.select.options.map(option=>option.selected),[true,false,true]);assert.deepEqual(after.radios.map(input=>input.checked),[false,true]);assert.deepEqual(after.checks.map(input=>input.checked),[true,false]);
});
