'use strict';

// Check the workflow navigation against its actual browser script without dependencies.
// Run: node tests/workflow-switch.test.cjs
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const script=fs.readFileSync(__dirname+'/../tag-workflow-switch-v1.js','utf8');

function mount(hash='',initial={}) {
  const byId=new Map(),storage={...initial},events=[];
  class Element {
    constructor(tag){this.tag=tag;this.attributes={};this.listeners={};this.status={textContent:''};this._html='';this.id='';this.className='';}
    setAttribute(name,value){this.attributes[name]=String(value);}
    getAttribute(name){return this.attributes[name]||null;}
    addEventListener(type,callback){this.listeners[type]=callback;}
    click(){assert.ok(this.listeners.click,'Missing click handler for '+this.id);this.listeners.click();}
    querySelector(sel){return sel==='.tag-switch-status'?this.status:null;}
    insertAdjacentElement(_where,other){other._parent=this;}
    set innerHTML(value){
      this._html=value;
      for(const match of value.matchAll(/id="([^"]+)"/g)){
        const child=new Element('control');child.id=match[1];byId.set(child.id,child);
      }
    }
    get innerHTML(){return this._html;}
  }
  const header=new Element('header');
  const document={
    readyState:'complete',body:{dataset:{}},
    getElementById:id=>byId.get(id)||null,
    querySelector:selector=>selector==='main.container > header.brandbar'?header:null,
    createElement:tag=>{const e=new Element(tag);return e;},
    addEventListener(){}
  };
  // The nav is dynamically inserted just below the top brand bar.
  const originalInsert=header.insertAdjacentElement.bind(header);
  header.insertAdjacentElement=(where,element)=>{originalInsert(where,element);byId.set(element.id,element);};
  const sandbox={
    document,window:{location:{hash},dispatchEvent:e=>events.push(e.type)},
    localStorage:{getItem:k=>storage[k]||null,setItem:(k,v)=>{storage[k]=v;}},
    requestAnimationFrame:callback=>callback(),
    setTimeout:callback=>callback(),
    Event:class {constructor(type){this.type=type;}}
  };
  vm.runInNewContext(script,sandbox,{filename:'tag-workflow-switch-v1.js'});
  return {byId,document,storage,events,nav:byId.get('tagWorkflowSwitcher')};
}

{
  const x=mount('',{'tag-load-cell-workflow-v1':'linescale'});
  assert.ok(x.nav,'Switcher should be placed immediately below the brand bar');
  assert.ok(x.nav.innerHTML.indexOf('id="tagWorkflowCrosby"')<x.nav.innerHTML.indexOf('id="tagWorkflowLineScale"'),
    'Crosby must appear first in the top navigation');
  assert.equal(x.document.body.dataset.tagMode,'crosby','Crosby should be the new default');
  assert.equal(x.byId.get('tagWorkflowCrosby').getAttribute('aria-pressed'),'true');
  assert.equal(x.byId.get('tagWorkflowLineScale').getAttribute('aria-pressed'),'false');
  x.byId.get('tagWorkflowLineScale').click();
  assert.equal(x.document.body.dataset.tagMode,'linescale');
  assert.equal(x.storage['tag-load-cell-workflow-v2'],'linescale','New selection should be remembered');
  x.byId.get('tagWorkflowCrosby').click();
  assert.equal(x.document.body.dataset.tagMode,'crosby');
  assert.equal(x.storage['tag-load-cell-workflow-v2'],'crosby');
  assert.ok(x.events.length>0,'Switching should trigger chart resizing');
}
{
  const x=mount('',{'tag-load-cell-workflow-v2':'linescale'});
  assert.equal(x.document.body.dataset.tagMode,'linescale','User-selected workflow should persist');
}
{
  const x=mount('#setup',{'tag-load-cell-workflow-v2':'crosby'});
  assert.equal(x.document.body.dataset.tagMode,'linescale','LineScale device-setup deep links must still work');
}
console.log('Workflow switcher passed: Crosby first/default, manual switching, persistence, and setup deep link.');
