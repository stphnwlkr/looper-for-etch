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
