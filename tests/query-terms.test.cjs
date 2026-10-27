const assert=require('node:assert/strict');
const {compile,initial}=require('../assets/query.js');
const s=initial();s.source='wp-terms';s.termOptions.taxonomy.value='color-categories';
let q=compile(s);assert.equal(q.type,'wp-terms');assert.equal(q.native.number,'$count ?? 6');assert.equal(q.args.number,6);assert.equal(q.args.hide_empty,false);assert.ok(!('post_type' in q.args));console.log('PASS independent taxonomy term configuration');
for(const o of Object.values(s.termOptions)){o.enabled=true;o.parameter=true}
q=compile(s);assert.equal(q.native.taxonomy,"$taxonomy ?? 'color-categories'");assert.equal(q.native.hide_empty,'$hide_empty ?? 0');assert.equal(q.native.parent,'$parent ?? 0');assert.equal(q.native.order,"$order ?? 'ASC'");console.log('PASS optional term arguments with numeric boolean fallbacks');
s.termOptions.number.value=0;assert.equal(compile(s).args.number,0);s.termOptions.number.value=-1;assert.throws(()=>compile(s));s.termOptions.number.value=6;console.log('PASS term count uses zero for unlimited and rejects negative count');
s.termSearch="$foo ?? system('bad')";assert.ok(compile(s).php.includes("'search' => '$foo ?? system(\\'bad\\')'"));console.log('PASS expression-like term search safely quoted');
s.termOptions.taxonomy.value='';assert.throws(()=>compile(s));console.log('PASS taxonomy selection required');