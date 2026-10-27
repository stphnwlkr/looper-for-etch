const {JSDOM,VirtualConsole}=require('jsdom');
const axe=require('axe-core');
const fs=require('node:fs'),assert=require('node:assert/strict');
const copy=v=>JSON.parse(JSON.stringify(v));
const content={postTypes:[{name:'post',label:'Posts'},{name:'page',label:'Pages'}],taxonomies:[],allTaxonomies:[],fields:[],statuses:[{name:'publish',label:'Published'},{name:'draft',label:'Draft'}]};
const loops={},blocks={};let selected=null,serial=0,failSave=false,failRequest=false,conflict=false,saves=0,writes=0,apiSupport=false,clipboard="";
const tick=(ms=0)=>new Promise(r=>setTimeout(r,ms));
function fixture(pending){
 const dom=new JSDOM('<!doctype html><html lang="en"><head><title>Looper</title></head><body></body></html>',{url:'http://localhost:8881/?etch=magic&post_id=6554',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:new VirtualConsole()});
 const w=dom.window;w.navigator.clipboard={writeText:async value=>{clipboard=value;}};w.looperConfig={api:'http://localhost:8881/fixture/',styles:'/fixture.css',nonce:'fixture',directActions:true};
 w.etchControls={builder:{settingsBar:{bottom:{addBefore(){}}}}};
 w.etch={environment:{capabilities:{loops:true}},saveAsync:async()=>{saves++;if(failSave)throw Error('Editor save failed');},loops:{getAll:()=>copy(loops),add(value){if(!apiSupport)throw Error('Unsupported query shape');const id='loop'+(++serial);loops[id]=copy(value);return id;},update(id,value){if(!apiSupport)throw Error('Unsupported query shape');loops[id]=copy(value);},delete(id){delete loops[id];},setForBlock(id,value){blocks[id]={...blocks[id],...value};}},blocks:{getSelectedId:()=>selected,getJson:id=>blocks[id]?copy(blocks[id]):null,create(value){const id='block'+(++serial);blocks[id]=copy(value);return id;},select:id=>{selected=id;}}};
 w.fetch=async(url,options)=>{
  if(url.endsWith('/native-query')){
   if(failRequest)throw Error('Network save failed');
   const body=JSON.parse(options.body);assert.ok(saves>0,'Editor saved before native write');writes++;
   assert.deepEqual(body.expected,loops[body.id]||null,'Expected original query supplied');
   if(conflict)return {ok:false,json:async()=>({message:'This query changed since it was loaded.'})};
   loops[body.id]={...(loops[body.id]||{}),...body.definition,config:{...(loops[body.id]?.config||{}),...body.definition.config}};return {ok:true,json:async()=>({id:body.id,definition:copy(loops[body.id])})};
  }
  return {ok:true,json:async()=>url.endsWith('/loops')?{loops:copy(loops)}:content};
 };
 const key='looper-native-action:'+w.location.href;if(pending)w.sessionStorage.setItem(key,pending);
 w.eval(fs.readFileSync('assets/query.js','utf8'));w.eval(fs.readFileSync('assets/looper.js','utf8'));
 const root=w.document.getElementById('looper-for-etch').shadowRoot;
 return {w,dom,root,key};
}
const field=(f,label)=>[...f.root.querySelectorAll('label')].find(n=>n.querySelector('span')?.textContent===label)?.querySelector('input,select');
function change(f,node,value){node.value=value;node.dispatchEvent(new f.w.Event(node.tagName==='SELECT'?'change':'input'));}
async function ready(f){await tick();await tick();f.w.looperForEtch.open();}
const run=async f=>{const beforeSaves=saves,beforeWrites=writes;f.root.querySelector('.actions .primary').click();await tick();const confirm=f.root.querySelector('.native-save-confirm:not([hidden]) button');if(confirm){assert.equal(saves,beforeSaves,'No editor save before confirmation');assert.equal(writes,beforeWrites,'No native write before confirmation');confirm.click();}await tick();await tick();};
async function reload(f){const pending=f.w.sessionStorage.getItem(f.key);assert.ok(pending,'One-shot continuation saved');f.dom.window.close();const next=fixture(pending);await tick(300);return next;}
(async()=>{
 apiSupport=true;let direct=fixture();await ready(direct);change(direct,field(direct,'Loop name'),'Direct native query');await run(direct);const directId=Object.keys(loops)[0];assert.ok(directId);assert.equal(saves,0);assert.equal(writes,0);assert.equal(direct.w.sessionStorage.getItem(direct.key),null);assert.match(direct.root.querySelector('.notice').textContent,/Use Etch Save/);
 change(direct,direct.root.querySelector('[aria-label="Count value"]'),'8');await run(direct);assert.equal(loops[directId].config.args.posts_per_page,8);change(direct,field(direct,'Etch action'),'create');await run(direct);assert.equal(Object.keys(blocks).length,1);assert.equal(saves,0);assert.equal(writes,0);[...direct.root.querySelectorAll('button')].find(n=>n.textContent==='Copy for Etch').click();await tick();assert.ok(!clipboard.includes('$query_args'));assert.match(clipboard,/'posts_per_page' => 8/);assert.ok(!clipboard.endsWith('];'));console.log('PASS accepted native add/update/insert actions require no reload, autosave or confirmation; Copy for Etch copies entries only');direct.dom.window.close();Object.keys(loops).forEach(k=>delete loops[k]);Object.keys(blocks).forEach(k=>delete blocks[k]);selected=null;apiSupport=false;
 let f=fixture();await ready(f);change(f,field(f,'Loop name'),'Native articles');f.root.querySelector('.actions .primary').click();await tick();assert.equal(saves,0);assert.equal(writes,0);assert.equal(f.root.querySelector('.native-save-confirm').hidden,false);f.w.HTMLCanvasElement.prototype.getContext=()=>null;f.w.eval(axe.source);const access=await f.w.axe.run({include:[f.w.document.getElementById('looper-for-etch')]},{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']},rules:{'color-contrast':{enabled:false}}});assert.equal(access.violations.length,0,'Reload confirmation accessibility');[...f.root.querySelectorAll('.native-save-confirm button')].find(n=>n.textContent==='Cancel').click();assert.equal(f.root.querySelector('.native-save-confirm').hidden,true);assert.equal(field(f,'Loop name').value,'Native articles');console.log('PASS cancel leaves the form and Etch unchanged without saving or reloading');await run(f);
 assert.equal(Object.keys(loops).length,1);assert.equal(Object.keys(blocks).length,0);assert.equal(saves,1);assert.ok(!JSON.stringify(loops).includes('_looper_etch_'));
 f=await reload(f);assert.match(f.root.querySelector('.notice').textContent,/works with Looper deactivated/);assert.equal(field(f,'Loop name').value,'');assert.equal(f.w.sessionStorage.getItem(f.key),null);console.log('PASS native save persists query after editor save; refresh clears draft and consumes continuation');
 const id=Object.keys(loops)[0];loops[id].custom='future attribute';loops[id].config.futureFlag=true;
 const load=async()=>{f.root.querySelector('[aria-label="Count value"]').dispatchEvent(new f.w.Event('input'));await tick();await tick();const chooser=field(f,'Load existing Etch loop');change(f,chooser,id);[...f.root.querySelectorAll('button')].find(n=>n.textContent==='Load loop').click();await tick();await tick();};
 await load();change(f,f.root.querySelector('[aria-label="Count value"]'),'9');await run(f);assert.equal(loops[id].config.args.posts_per_page,9);assert.equal(loops[id].custom,'future attribute');assert.equal(Object.keys(loops).length,1);f=await reload(f);console.log('PASS update preserves query ID and unknown attributes');
 await load();change(f,field(f,'Etch action'),'create');await run(f);assert.equal(f.w.sessionStorage.getItem(f.key),null);assert.equal(Object.keys(blocks).length,1);assert.equal(blocks[selected].loopId,id);console.log('PASS inserting an unchanged native query needs no reload');
 blocks[selected].itemId='country';blocks[selected].indexId='position';blocks[selected].loopParams={'$count':2};const children=copy(blocks[selected].children);const outer={type:'etch/loop',loopId:id,itemId:'outer',children:[{id:selected}]};blocks.parent=copy(outer);
 await load();change(f,field(f,'Etch action'),'bind');await run(f);assert.equal(f.w.sessionStorage.getItem(f.key),null);assert.equal(blocks[selected].itemId,'country');assert.deepEqual(copy(blocks[selected].loopParams),{'$count':2});assert.deepEqual(copy(blocks[selected].children),children);assert.deepEqual(blocks.parent,outer);console.log('PASS applying preserves inner-loop content, argument overrides and outer loop');
 await load();change(f,f.root.querySelector('[aria-label="Count value"]'),'12');const before=copy(loops),beforeWrites=writes;failSave=true;await run(f);assert.equal(writes,beforeWrites);assert.deepEqual(loops,before);assert.match(f.root.querySelector('.notice').textContent,/Editor save failed/);assert.equal(f.w.sessionStorage.getItem(f.key),null);failSave=false;
 conflict=true;await run(f);assert.deepEqual(loops,before);assert.match(f.root.querySelector('.notice').textContent,/changed since/);conflict=false;failRequest=true;await run(f);assert.deepEqual(loops,before);assert.equal(f.w.sessionStorage.getItem(f.key),null);failRequest=false;console.log('PASS failed editor save, server conflict and failed request leave no pending insertion');
 change(f,field(f,'Etch action'),'create');await run(f);f=await reload(f);assert.equal(Object.keys(blocks).length,3);assert.equal(blocks[selected].loopId,id);console.log('PASS a confirmed changed query resumes insertion exactly once after reload');
 blocks.json={type:'etch/loop',loopId:'json',children:[]};loops.json={key:'json',name:'JSON',config:{type:'json',data:[]}};selected='json';change(f,field(f,'Etch action'),'bind');assert.equal(f.root.querySelector('.actions .primary').disabled,true);assert.match(f.root.querySelector('#lfe-action-hint').textContent,/JSON/);console.log('PASS JSON and dynamic-data loops remain outside query actions');
 f.dom.window.close();
 const expired=fixture(JSON.stringify({id,mode:'create',expires:Date.now()-1}));await tick(300);assert.equal(Object.keys(blocks).length,4);assert.equal(expired.w.sessionStorage.getItem(expired.key),null);expired.dom.window.close();console.log('PASS expired continuation cannot insert an element');
})().catch(e=>{console.error(e);process.exitCode=1;process.exit();});
