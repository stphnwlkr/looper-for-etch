const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom'),axe=require('axe-core'),Q=require('../assets/query.js');
const definition=(args,type='wp-query')=>({key:'facetedPosts',name:'Faceted posts',config:{type,args}});
for(const type of ['wp-query','main-query']){
 for(const facetwp of ['true','false',true,false]){
  const args={...(type==='wp-query'?{post_type:'post'}:{}),wp_grid_builder:'wpgb-content-projects',facetwp};
  const result=Q.compile(Q.loadDefinition(definition(args,type)));
  assert.deepEqual(result.native,args);assert.deepEqual(result.args,args);
  assert.match(Q.etchBody(result),/'wp_grid_builder' => 'wpgb-content-projects'/);
  assert.ok(Q.etchBody(result).includes("'facetwp' => "+(typeof facetwp==='string'?"'"+facetwp+"'":facetwp)));
 }
}
for(const value of ['','.wpgb-content-posts','posts','wpgb-content-','wpgb-content-posts other']){
 const state=Q.initial();state.advanced.push({key:'wp_grid_builder',value});assert.throws(()=>Q.compile(state),/selector/);
}
for(const source of ['wp-users','wp-terms']){
 const state=Q.initial();state.source=source;state.termOptions.taxonomy.value='category';state.advanced.push({key:'facetwp',value:'true'});assert.throws(()=>Q.compile(state),/Unsupported option/);
}
const allow=JSON.parse(fs.readFileSync('query-options.json','utf8'));for(const key of ['facetwp','wp_grid_builder']){assert.ok(allow['wp-query'].includes(key));assert.ok(!allow['wp-users'].includes(key));assert.ok(!allow['wp-terms'].includes(key));}
console.log('PASS facet argument types, PHP/copy export, query round trips, selector validation and source restrictions');
const dom=new JSDOM('<!doctype html><html lang="en"><head><title>Facets</title></head><body><div id="looper-admin"></div></body></html>',{url:'http://localhost/',runScripts:'dangerously',pretendToBeVisual:true}),w=dom.window;
w.looperConfig={api:'/fixture/',nonce:'test',version:'test',styles:'test.css'};let request;
const content={postTypes:[{name:'post',label:'Posts'}],taxonomies:[],allTaxonomies:[],fields:[],statuses:[{name:'publish',label:'Published'}],roles:[]};
const saved={facets:definition({post_type:'post',wp_grid_builder:'wpgb-content-saved',facetwp:true})};
w.fetch=async(url,opt)=>({ok:true,json:async()=>{if(opt?.body){request=JSON.parse(opt.body);return {posts:[]};}return url.endsWith('/loops')?{loops:saved}:content;}});
w.eval(fs.readFileSync('assets/query.js','utf8'));w.eval(fs.readFileSync('assets/looper.js','utf8'));
const tick=()=>new Promise(r=>setTimeout(r,0)),root=w.document.getElementById('looper-for-etch').shadowRoot;
const checkbox=label=>{const field=[...root.querySelectorAll('label')].find(n=>n.querySelector('span')?.textContent===label);assert.ok(field,label);return field.querySelector('input[type=checkbox]');};
const button=text=>{const node=[...root.querySelectorAll('button')].find(n=>n.textContent===text);assert.ok(node,text);node.click();};
const preview=async()=>{button('Run preview');await tick();return request.args;};
(async()=>{
 await tick();await tick();root.querySelector('[data-tab-key="more"]').click();
 checkbox('Use WP Grid Builder').click();checkbox('Enable FacetWP').click();
 let args=await preview();assert.equal(args.wp_grid_builder,'wpgb-content-posts');assert.equal(args.facetwp,'true');
 const selector=[...root.querySelectorAll('label')].find(n=>n.querySelector('span')?.textContent==='WP Grid Builder selector').querySelector('input');selector.value='wpgb-content-projects';selector.dispatchEvent(new w.Event('input'));
 args=await preview();assert.equal(args.wp_grid_builder,'wpgb-content-projects');
 w.HTMLCanvasElement.prototype.getContext=()=>null;w.eval(axe.source);const audit=await w.axe.run({include:[w.document.getElementById('looper-for-etch')]},{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']},rules:{'color-contrast':{enabled:false}}});assert.equal(audit.violations.length,0,JSON.stringify(audit.violations.map(v=>v.id)));
 checkbox('Use WP Grid Builder').click();checkbox('Enable FacetWP').click();args=await preview();assert.ok(!('wp_grid_builder'in args));assert.ok(!('facetwp'in args));
 const chooser=root.querySelector('.loop-loader select');chooser.value='facets';chooser.dispatchEvent(new w.Event('change'));button('Load loop');await tick();await tick();
 assert.ok(checkbox('Use WP Grid Builder').checked);assert.ok(checkbox('Enable FacetWP').checked);args=await preview();assert.equal(args.wp_grid_builder,'wpgb-content-saved');assert.equal(args.facetwp,true);
 const source=[...root.querySelectorAll('label')].find(n=>n.querySelector('span')?.textContent==='Loop source').querySelector('select');source.value='wp-users';source.dispatchEvent(new w.Event('change'));await tick();await tick();assert.equal(root.querySelector('.facet-options'),null);args=await preview();assert.ok(!('facetwp'in args));assert.ok(!('wp_grid_builder'in args));
 console.log('PASS facet controls enable, edit, disable and load existing arguments; unrelated sources omit controls; zero accessibility violations');dom.window.close();
})().catch(error=>{console.error(error);dom.window.close();process.exitCode=1;});
