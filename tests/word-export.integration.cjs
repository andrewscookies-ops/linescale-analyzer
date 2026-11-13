'use strict';
// Integration check against the real DOCX npm library and bundled TAG logo.
// Run after npm install --no-save docx@9.5.1
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const docx=require('docx');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'crosby-report-v1.js'),'utf8');
const logo=fs.readFileSync(path.join(root,'assets/tag-logo.base64'),'utf8').trim();
const statusNode={style:{},textContent:''};
const sandbox={
 console,Uint8Array,Buffer,Blob,
 atob:v=>Buffer.from(v,'base64').toString('binary'),
 document:{readyState:'loading',addEventListener(){},getElementById:id=>id==='csStatus'?statusNode:null},
 window:{docx},
 fetch:async url=>{
  assert.equal(url,'assets/tag-logo.base64');
  return {ok:true,text:async()=>logo};
 }
};
vm.createContext(sandbox);
const extra=[
 'graphImages=async tests=>tests.map(()=>globalThis.__png);',
 'download=(blob,name)=>{globalThis.__saved={blob,name};};',
 'globalThis.__crosby={S,project,exportWord};',
 '})();'
].join('\n');
sandbox.__png='data:image/png;base64,'+logo;
assert.match(source,/\}\)\(\);\s*$/);
vm.runInContext(source.replace(/\}\)\(\);\s*$/,extra),sandbox,{filename:'crosby-report-v1.js'});
const api=sandbox.__crosby;
const make=(id,anchor)=>({
 name:'anchor-'+anchor+'.csv',id:String(id),device:'40554',date:'12-November-2026',
 points:[{x:0,y:0},{x:10,y:3075},{x:11,y:3100},{x:20,y:0}],
 duration:20,peak:3100,anchor,title:'Anchor '+anchor,rating:'Pass',
 enabled:true,comments:'',markerManual:true,view:null,
 style:{a:10,b:11,showA:true,showB:true}
});
api.S.tests=[make(1,1),make(2,2)];
api.project.minimum=3000;
(async()=>{
 await api.exportWord('complete');
 const exported=sandbox.__saved;
 assert.ok(exported,'Word exporter failed: '+statusNode.textContent);
 assert.match(exported.name,/\.docx$/);
 const bytes=Buffer.from(await exported.blob.arrayBuffer());
 assert.ok(bytes.length>5000,'Unexpectedly small DOCX');
 assert.equal(bytes.subarray(0,2).toString('utf8'),'PK');
 fs.writeFileSync(process.argv[2]||path.join(root,'word-export-smoke.docx'),bytes);
 console.log('Generated DOCX: '+bytes.length+' bytes');
})().catch(e=>{console.error(e);process.exitCode=1;});