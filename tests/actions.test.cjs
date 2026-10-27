const {JSDOM}=require('jsdom');
const axe=require('axe-core');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const source=path.resolve('assets');
const dom=new JSDOM('<!doctype html><html lang="en"><head><title>Looper audit fixture</title></head><body><main id="background"><button id="before">Editor control</button></main></body></html>',{url:'http://localhost:8881/',runScripts:'dangerously',pretendToBeVisual:true});
const w=dom.window;
w.looperConfig={api:'http://localhost:8881/fixture/',styles:'http://localhost:8881/fixture.css',nonce:'fixture'};
w.etch={loops:{add(){},getAll(){return {}}},blocks:{create(){},getSelectedId(){return null}},environment:{capabilities:{loops:true}}};
let clipboard='';w.navigator.clipboard={writeText:async value=>{clipboard=value;}};
w.etchControls={builder:{settingsBar:{bottom:{addBefore(){}}}}};
const content={postTypes:[{name:'post',label:'Posts'},{name:'page',label:'Pages'}],taxonomies:[{name:'category',label:'Categories',terms:[{slug:'news',name:'News'},{slug:'events',name:'Events'}]}],allTaxonomies:[{name:'category',label:'Categories'},{name:'color-category',label:'Color Categories'}],fields:[{key:'price',label:'Price',type:'number'}],statuses:[{name:'publish',label:'Published'},{name:'draft',label:'Draft'}]};
w.fetch=async url=>({ok:true,json:async()=>url.endsWith('/loops')?{loops:{}}:url.includes('content')?content:url.includes('terms?')?{terms:content.taxonomies[0].terms}:{posts:[{id:1,title:'Example post',status:'publish'}],limited:false}});
const loops={},blocks={};let selected=null,serial=0,stripNext=false,failCreate=false;
const copy=v=>JSON.parse(JSON.stringify(v));
w.etch={environment:{capabilities:{loops:true}},loops:{
 getAll:()=>copy(loops),add(value){const id='loop-'+(++serial);loops[id]=copy(value);return id;},
 update(id,value){loops[id]=copy(value);if(stripNext){delete loops[id].config.args.posts_per_page;stripNext=false;}},delete(id){delete loops[id];},
 setForBlock(id,value){blocks[id]={...blocks[id],...value};}
},blocks:{getSelectedId:()=>selected,getJson:id=>copy(blocks[id]),create(value){if(failCreate)throw Error('Fixture insert failure');const id='block-'+(++serial);blocks[id]=copy(value);return id;},select:id=>{selected=id;},delete:id=>{delete blocks[id];}}};
w.eval(fs.readFileSync(path.join(source,'query.js'),'utf8'));
w.eval(fs.readFileSync(path.join(source,'looper.js'),'utf8'));
w.eval(axe.source);
const host=w.document.getElementById('looper-for-etch'), root=host.shadowRoot;
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const click=(text)=>{const n=[...root.querySelectorAll('button')].find(n=>n.textContent===text);assert.ok(n,'Button '+text);n.click();return n};
const snapshots=[];
const tab=key=>root.querySelector('[role=tab][data-tab-key="'+key+'"]');
async function scan(name){
 const r=await w.axe.run({include:[host]},{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']},rules:{'color-contrast':{enabled:false}}});
 snapshots.push({name,violations:r.violations.map(x=>({id:x.id,impact:x.impact,description:x.description,nodes:x.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),incomplete:r.incomplete.map(x=>({id:x.id,nodes:x.nodes.map(n=>({target:n.target,summary:n.failureSummary,html:n.html}))})),passes:r.passes.length});
}
(async()=>{
 await tick();await tick();w.looperForEtch.open();const loopName=[...root.querySelectorAll('label')].find(n=>n.querySelector('span')?.textContent==='Loop name').querySelector('input');loopName.value='Recent posts';loopName.dispatchEvent(new w.Event('input'));
 const action=()=>[...root.querySelectorAll('label')].find(n=>n.querySelector('span')?.textContent==='Etch action').querySelector('select');
 const mode=value=>{action().value=value;action().dispatchEvent(new w.Event('change'));};
 const run=async()=>{root.querySelector('.actions .primary').click();await tick();};
 await run();assert.equal(Object.keys(loops).length,1);assert.equal(Object.keys(blocks).length,0);assert.equal(root.querySelector('.actions .primary').disabled,true);console.log('PASS definition-only creates no element and disables a repeated add');
 mode('create');await run();assert.equal(Object.keys(loops).length,1);assert.equal(Object.keys(blocks).length,1);assert.equal(blocks[selected].loopId,Object.keys(loops)[0]);console.log('PASS inserting after saving reuses the existing definition');
 const count=root.querySelector('[aria-label="Count value"]');count.value='9';count.dispatchEvent(new w.Event('input'));mode('definition');assert.equal(root.querySelector('.actions .primary').textContent,'Update query in Loop Manager');assert.match(root.querySelector('#lfe-action-hint').textContent,/every loop/);await run();assert.equal(Object.keys(loops).length,1);assert.equal(Object.values(loops)[0].config.args.posts_per_page,9);console.log('PASS changed query updates the same definition with explicit shared-use guidance');
 blocks[selected].itemId='country';blocks[selected].indexId='position';blocks[selected].loopParams={'$count':2};const children=JSON.stringify(blocks[selected].children);mode('bind');await run();assert.equal(blocks[selected].target,'');assert.equal(blocks[selected].itemId,'country');assert.equal(blocks[selected].indexId,'position');assert.deepEqual(blocks[selected].loopParams,{'$count':2});assert.equal(JSON.stringify(blocks[selected].children),children);console.log('PASS applying keeps children, variable names and argument overrides');
 const original=copy(loops);count.value='12';count.dispatchEvent(new w.Event('input'));stripNext=true;mode('definition');await run();assert.deepEqual(loops,original);assert.match(root.querySelector('.notice').textContent,/changed the query arguments/);console.log('PASS API argument loss restores the previous definition');
 count.value='14';count.dispatchEvent(new w.Event('input'));failCreate=true;mode('create');await run();assert.deepEqual(loops,original);assert.equal(Object.keys(blocks).length,1);console.log('PASS failed insertion restores the updated definition');
 const currentSelected=selected;
 loops.jsonSource={key:'json-source',name:'JSON source',config:{type:'json',data:[]}};
 blocks.jsonBlock={type:'etch/loop',loopId:'jsonSource',children:[]};selected='jsonBlock';mode('bind');assert.equal(root.querySelector('.actions .primary').disabled,true);assert.match(root.querySelector('#lfe-action-hint').textContent,/selected loop uses JSON/);console.log('PASS JSON selected loops cannot be rebound');
 delete loops.jsonSource;delete blocks.jsonBlock;
 loops.mainSource={key:'main-source',name:'Main source',config:{type:'main-query',args:{}}};blocks.mainBlock={type:'etch/loop',loopId:'mainSource',children:[]};selected='mainBlock';mode('bind');assert.equal(root.querySelector('.actions .primary').disabled,false);console.log('PASS Main Query selected loops can now be rebound');delete loops.mainSource;delete blocks.mainBlock;
 blocks.dynamicBlock={type:'etch/loop',target:'this.items',children:[]};selected='dynamicBlock';mode('bind');assert.equal(root.querySelector('.actions .primary').disabled,true);console.log('PASS dynamic-data selected loops cannot be rebound');delete blocks.dynamicBlock;
 failCreate=false;count.value='9';count.dispatchEvent(new w.Event('input'));selected=currentSelected;mode('bind');
 const parent={type:'etch/loop',loopId:Object.keys(loops)[0],itemId:'outer',children:[{id:currentSelected}]};blocks.parent=copy(parent);await run();assert.deepEqual(blocks.parent,parent);console.log('PASS applying to an inner loop leaves its parent untouched');delete blocks.parent;
 selected=null;mode('bind');assert.equal(root.querySelector('.actions .primary').disabled,true);console.log('PASS applying requires a selected loop element');
 const chooser=()=>[...root.querySelectorAll('label')].find(n=>n.querySelector('span')?.textContent==='Load existing Etch loop').querySelector('select');
 chooser().value=Object.keys(loops)[0];chooser().dispatchEvent(new w.Event('change'));click('Load loop');await tick();await tick();
 assert.equal(root.querySelector('[aria-label="Count value"]').value,'9');assert.equal(root.querySelector('.actions .primary').textContent,'Query already in Loop Manager');assert.equal(Object.keys(loops).length,1);console.log('PASS loading an existing loop restores the form without changing Etch');
 const previous=root.querySelector('aside .code').textContent;loops.unsupported={...copy(Object.values(loops)[0]),key:'unsupported',config:{type:'wp-query',args:{post_type:'post',relationship:{id:'example'}}}};
 loops.json={key:'json',name:'JSON',config:{type:'json',data:[]}};
 loops.missingTax={key:'missing-tax',name:'Missing taxonomy',config:{type:'wp-query',args:{post_type:'post',tax_query:[{taxonomy:'missing-taxonomy',field:'slug',terms:['red']}]}}};
 loops.termLimit={key:'term-limit',name:'Term limit',config:{type:'wp-terms',args:{taxonomy:'category',number:6}}};
 loops.missingStatus={key:'missing-status',name:'Missing status',config:{type:'wp-query',args:{post_type:'post',post_status:'missing-status'}}};
 root.querySelector('[aria-label="Count value"]').dispatchEvent(new w.Event('input'));await tick();await tick();
 assert.equal(root.querySelector('aside .code').textContent,previous);assert.equal(chooser().options.length,3);assert.match(root.querySelector('.loop-loader+ .hint').textContent,/3 loops are hidden/);console.log('PASS unsupported sources, arguments, taxonomies and statuses are excluded before loading');
 delete loops[Object.keys(loops)[0]];delete loops.termLimit;root.querySelector('[aria-label="Count value"]').dispatchEvent(new w.Event('input'));await tick();await tick();assert.equal(root.querySelector('.loop-loader').hidden,false);assert.match(root.querySelector('.loop-loader+ .hint').textContent,/No existing loops/);console.log('PASS refresh remains available when no editable loops exist');
 tab('tax').click();click('+ Taxonomy rule');click('+ News');mode('definition');await run();const filtered=Object.values(loops).find(loop=>loop.config?.args?.tax_query?.[0]?.taxonomy==='category');assert.ok(Array.isArray(filtered.config.args.tax_query));assert.equal(filtered.config.args.tax_query[0].taxonomy,'category');console.log('PASS direct API actions encode AND taxonomy clauses as an Etch-compatible array');
 w.looperForEtch.close();dom.window.close();
})().catch(e=>{console.error(e);dom.window.close();process.exitCode=1});
