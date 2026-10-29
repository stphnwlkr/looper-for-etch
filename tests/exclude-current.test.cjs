const assert=require('node:assert/strict'),Q=require('../assets/query.js');
for(const fixed of [[],[12,34]]){
 const state=Q.initial();state.excludeCurrentPost=true;state.exclude=fixed.join(',');
 const result=Q.compile(state);assert.deepEqual(result.args.post__not_in,fixed);assert.deepEqual(result.native.post__not_in,[...fixed,Q.currentPostParam]);
 assert.match(Q.etchBody(result),/\$exclude \?\? 0/);
 const loaded=Q.loadDefinition({key:'related',name:'Related',config:{type:result.type,args:result.native}});assert.equal(loaded.excludeCurrentPost,true);assert.deepEqual(Q.compile(loaded).native,result.native);
 loaded.excludeCurrentPost=false;assert.deepEqual(Q.compile(loaded).native.post__not_in,fixed.length?fixed:undefined);
}
const state=Q.initial();state.excludeCurrentPost=true;state.include='12';assert.throws(()=>Q.compile(state),/Include post IDs/);
for(const source of ['wp-users','wp-terms','main-query']){const s=Q.initial();s.source=source;s.termOptions.taxonomy.value='category';s.excludeCurrentPost=true;assert.ok(!JSON.stringify(Q.compile(s).native).includes(Q.currentPostParam));}
console.log('PASS current post exclusion exports a native argument, preserves fixed IDs on reload/toggle, rejects conflicting includes and stays in post queries');
for(const expression of ['$exc ?? 0','$currentPostID??0','$exclude  ??  0']){
 for(const values of [[expression],[expression,1067],[12,expression,34]]){
  const args={post_type:'repo_snippet',posts_per_page:'$count ?? 4',orderby:'date',order:'DESC',post__not_in:values};
  const original=JSON.stringify(args),loaded=Q.loadDefinition({key:'repoMoreSnippets',name:'Repo / More snippets',config:{type:'wp-query',args}});
  assert.equal(loaded.excludeCurrentPost,true);assert.deepEqual(Q.compile(loaded).native,args);assert.equal(JSON.stringify(args),original,'Import never changes the source definition');
  assert.equal(Q.currentPostArgument(args).name,expression.match(/^\$(\w+)/)[1]);
 }
}
assert.equal(Q.currentPostArgument({post__not_in:[1067]}),null);
assert.equal(Q.currentPostArgument({post__not_in:['$a ?? 0','$b ?? 0']}),null);
console.log('PASS alternate exclusion argument names, spacing and list positions reopen without changing names, values, post types or source definitions');
