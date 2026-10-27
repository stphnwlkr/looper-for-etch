(function (root) {
  'use strict';
  const basics = {
    posts_per_page: { param: 'count', numeric: true },
    orderby: { param: 'orderby' }, order: { param: 'order' },
    offset: { param: 'offset', numeric: true }, post_status: { param: 'status' }
  };
  const termBasics = {
    taxonomy: { param: 'taxonomy' }, number: { param: 'count', numeric: true },
    orderby: { param: 'orderby' }, order: { param: 'order' },
    offset: { param: 'offset', numeric: true }, hide_empty: { param: 'hide_empty', numeric: true },
    parent: { param: 'parent', numeric: true }
  };
  const quote = v => "'" + String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  function php(v, depth = 0, expressions = false) {
    if (v === null) return 'null';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'number') return String(v);
    if (typeof v === 'string') return quote(v);
    const pad = '  '.repeat(depth), child = pad + '  ';
    const entries = Object.entries(v).map(([k, value]) => child + (Array.isArray(v) ? '' : (/^\d+$/.test(k) ? k : quote(k)) + ' => ') + (expressions && depth === 0 && (basics[k] || termBasics[k] || k==='post_parent') && typeof value === 'string' && /^\$\w+ \?\? /.test(value) ? value : php(value, depth + 1, false)));
    return '[\n' + entries.join(',\n') + '\n' + pad + ']';
  }
  function integer(value, label, min, max) {
    const n = Number(value);
    if (String(value).trim() === '' || !Number.isInteger(n) || n < min || n > max || (label === 'Count' && n === 0)) throw Error(label + ' must be a whole number' + (label === 'Count' ? ' of 1 or more, or -1 for all.' : ' between ' + min + ' and ' + max + '.'));
    return n;
  }
  function compile(state) {
    if (state.source === 'wp-terms') return compileTerms(state);
    if (state.source === 'main-query') {
      const clean={...state,source:'wp-query',postType:'post',ignoreSticky:false,search:'',include:'',exclude:'',author:'',tax:[],meta:[],attachmentMime:'',attachmentParent:{enabled:false}};
      const result=compile(clean);delete result.args.post_type;delete result.native.post_type;
      return {...result,type:'main-query',php:'$query_args = '+(Object.keys(result.native).length?php(result.native,0,true):'[]')+';',json:JSON.stringify({type:'main-query',args:result.native},null,2)};
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(state.postType || '')) throw Error('Choose a post type.');
    const args = { post_type: state.postType };
    for (const [key, spec] of Object.entries(basics)) {
      const option = state.options[key];
      if (!option?.enabled) continue;
      args[key] = spec.numeric ? integer(option.value, key === 'offset' ? 'Offset' : 'Count', key === 'offset' ? 0 : -1, 100000) : option.value;
    }
    if (state.search?.trim()) args.s = state.search.trim();
    for (const [field, key] of [['include', 'post__in'], ['exclude', 'post__not_in']]) {
      if (state[field]?.trim()) args[key] = state[field].split(',').map(v => integer(v.trim(), 'Post ID', 1, Number.MAX_SAFE_INTEGER));
    }
    if (state.author?.trim()) args.author = integer(state.author.trim(), 'Author ID', 1, Number.MAX_SAFE_INTEGER);
    if (state.ignoreSticky) args.ignore_sticky_posts = true;
    if (['meta_value', 'meta_value_num'].includes(args.orderby)) {
      if (!state.sortMetaKey?.trim()) throw Error('Choose a field to sort by.');
      args.meta_key = state.sortMetaKey.trim();
    }
    if (state.tax.length > 12 || state.meta.length > 12) throw Error('Use at most 12 filters per group.');
    if (state.tax.length) {
      const group = { relation: state.taxRelation || 'AND' };
      state.tax.forEach((f, i) => {
        if (!f.taxonomy) throw Error('Choose a taxonomy for each filter.');
        const terms = f.terms.split(',').map(s => s.trim()).filter(Boolean);
        if (!terms.length && !['EXISTS', 'NOT EXISTS'].includes(f.operator)) throw Error('Enter at least one term for each taxonomy filter.');
        group[i] = { taxonomy: f.taxonomy, field: f.field || 'slug', terms: f.field==='term_id'?terms.map(v=>integer(v,'Term ID',1,Number.MAX_SAFE_INTEGER)):terms, operator: f.operator, include_children: f.children !== false };
      });
      args.tax_query = group;
    }
    if (state.meta.length) {
      const group = { relation: state.metaRelation || 'AND' };
      state.meta.forEach((f, i) => {
        if (!f.key.trim()) throw Error('Choose a custom field for each filter.');
        const clause = { key: f.key.trim(), compare: f.compare, type: f.type };
        if (!['EXISTS', 'NOT EXISTS'].includes(f.compare)) {
          const list = ['IN', 'NOT IN', 'BETWEEN', 'NOT BETWEEN'].includes(f.compare);
          let value = list ? (Array.isArray(f.value) ? f.value : String(f.value).split(',').map(s => s.trim())) : f.value;
          if (['BETWEEN', 'NOT BETWEEN'].includes(f.compare) && value.length !== 2) throw Error('Between needs two comma-separated values.');
          if (['NUMERIC', 'DECIMAL', 'SIGNED', 'UNSIGNED'].includes(f.type)) {
            const number = v => { if (String(v).trim() === '' || !Number.isFinite(Number(v))) throw Error('Enter a numeric value for ' + f.key + '.'); return Number(v); };
            value = list ? value.map(number) : number(value);
          }
          clause.value = value;
        }
        group[i] = clause;
      });
      args.meta_query = group;
    }
    if(state.postType==='attachment'){
      if(state.attachmentMime?.trim()){if(!/^[a-z0-9.+_-]+(?:\/[a-z0-9.+_-]+)?$/i.test(state.attachmentMime.trim()))throw Error('Enter one media type, such as image or application/pdf.');args.post_mime_type=state.attachmentMime.trim();}
      if(state.attachmentParent?.enabled)args.post_parent=integer(state.attachmentParent.value,'Parent post ID',0,Number.MAX_SAFE_INTEGER);
    }
    const native = JSON.parse(JSON.stringify(args));
    if('post_parent' in native&&state.attachmentParent.parameter)native.post_parent='$parent ?? '+args.post_parent;
    for (const [key, spec] of Object.entries(basics)) {
      if (key in native && state.options[key].parameter) native[key] = '$' + (state.options[key].param || spec.param) + ' ?? ' + (spec.numeric ? args[key] : quote(args[key]));
    }
    return { type: 'wp-query', args, native, php: '$query_args = ' + php(native, 0, true) + ';', json: JSON.stringify({ type: 'wp-query', args: native }, null, 2) };
  }
  function compileTerms(state) {
    const args = {}, native = {};
    if (!/^[a-zA-Z0-9_-]+$/.test(state.termOptions.taxonomy.value || '')) throw Error('Choose a taxonomy.');
    for (const [key, spec] of Object.entries(termBasics)) {
      const option = state.termOptions[key];
      if (!option?.enabled && key !== 'taxonomy') continue;
      args[key] = spec.numeric ? integer(option.value, key === 'number' ? 'Term count' : key, 0, key === 'hide_empty' ? 1 : 100000) : option.value;
      const defaultValue = spec.numeric ? args[key] : quote(args[key]);
      if (key === 'hide_empty') args[key] = args[key] === 1;
      native[key] = option.parameter ? '$' + (option.param || spec.param) + ' ?? ' + defaultValue : args[key];
    }
    if (state.termSearch?.trim()) args.search = native.search = state.termSearch.trim();
    return { type: 'wp-terms', args, native, php: '$query_args = ' + php(native, 0, true) + ';', json: JSON.stringify({ type: 'wp-terms', args: native }, null, 2) };
  }
  function initial() {
    return { source: 'wp-query', attachmentMime:'', attachmentParent:{enabled:false,value:0,parameter:false}, termSearch: '', termOptions: {
      taxonomy: { enabled: true, value: '', parameter: false }, number: { enabled: true, value: 6, parameter: true },
      orderby: { enabled: true, value: 'name', parameter: false }, order: { enabled: true, value: 'ASC', parameter: false },
      offset: { enabled: false, value: 0, parameter: false }, hide_empty: { enabled: true, value: 0, parameter: false },
      parent: { enabled: false, value: 0, parameter: false }
    }, name: 'Recent posts', key: 'recentPosts', postType: 'post', global: true, search: '', include: '', exclude: '', author: '', ignoreSticky: true, sortMetaKey: '', taxRelation: 'AND', metaRelation: 'AND', tax: [], meta: [], options: {
      posts_per_page: { enabled: true, value: 6, parameter: false }, orderby: { enabled: true, value: 'date', parameter: false }, order: { enabled: true, value: 'DESC', parameter: false }, offset: { enabled: false, value: 0, parameter: false }, post_status: { enabled: true, value: 'publish', parameter: false }
    } };
  }
  const galleryKeys=['post_mime_type','post_parent','orderby'];
  const galleryPrefix='_looper_etch_v1_';
  function apiArgs(result){
    const args=JSON.parse(JSON.stringify(result.native));
    for(const key of ['tax_query','meta_query'])if(args[key])args[key]=Object.entries(args[key]).filter(([name])=>name!=='relation').map(([,rule])=>rule);
    if(result.type==='wp-query'&&args.post_type==='attachment'){
      for(const key of galleryKeys){
        if(!(key in args)||(key==='orderby'&&args[key]!=='collection_order'))continue;
        (args.meta_query||=[]).push({key:galleryPrefix+key,value:args[key],compare:'='});
        if(key==='orderby')args.orderby='ID';else delete args[key];
      }
    }
    return args;
  }
  function decodeApiArgs(input){
    const args=JSON.parse(JSON.stringify(input||{}));
    if(args.post_type!=='attachment'||!args.meta_query)return args;
    const remaining={},group=args.meta_query;let found=false,index=0;
    if(group.relation)remaining.relation=group.relation;
    for(const[key,clause]of Object.entries(group)){
      if(key==='relation')continue;
      const option=typeof clause?.key==='string'&&clause.key.startsWith(galleryPrefix)?clause.key.slice(galleryPrefix.length):'';
      if(galleryKeys.includes(option)){args[option]=clause.value;found=true;}
      else remaining[index++]=clause;
    }
    if(found){if(index)args.meta_query=remaining;else delete args.meta_query;}
    return args;
  }
  function loadDefinition(loop) {
    if(loop?.config?.type==='wp-query')loop={...loop,config:{...loop.config,args:decodeApiArgs(loop.config.args)}};
    const fail = detail => { throw Error('This loop cannot be edited safely in Looper: ' + detail + '. Edit it in Etch’s Loop Manager.'); };
    if(loop?.config?.type==='main-query'){
      if(Object.keys(loop.config.args||{}).some(key=>!Object.hasOwn(basics,key)))fail('Main Query supports only the basic overrides in Looper');
      const next=loadDefinition({...loop,config:{type:'wp-query',args:{post_type:'post',...loop.config.args}}});next.source='main-query';return next;
    }
    if (!['wp-query','wp-terms'].includes(loop?.config?.type)) fail('only WP Query and WP Terms sources are supported');
    const state=initial(),args=loop.config.args;
    if(!args||typeof args!=='object'||Array.isArray(args))fail('the query arguments are not a supported object');
    state.source=loop.config.type;state.name=loop.name||loop.key;state.key=loop.key;state.global=!!loop.global;
    const allowedKeys=state.source==='wp-terms'?[...Object.keys(termBasics),'search']:['post_type',...Object.keys(basics),'s','author','post__in','post__not_in','ignore_sticky_posts','meta_key','tax_query','meta_query','post_mime_type','post_parent'];
    const unsupported=Object.keys(args).filter(key=>!allowedKeys.includes(key));if(unsupported.includes('post_offset'))fail('post_offset is not a WordPress query argument; use offset instead');if(unsupported.length)fail('unsupported arguments: '+unsupported.join(', '));
    const specs=state.source==='wp-terms'?termBasics:basics,options=state.source==='wp-terms'?state.termOptions:state.options;
    for(const[key,spec]of Object.entries(specs)){
      options[key].enabled=Object.hasOwn(args,key);options[key].parameter=false;delete options[key].param;
      if(!options[key].enabled)continue;
      let value=args[key];
      if(typeof value==='string'&&value.startsWith('$')){
        const match=value.match(/^\$(\w+)\s*\?\?\s*(.*)$/);
        if(!match)fail('the '+key+' argument uses an unsupported parameter expression');
        const fallback=match[2];
        if(spec.numeric){if(!/^-?\d+$/.test(fallback))fail('the '+key+' argument needs a numeric default');value=Number(fallback);}
        else {const quoted=fallback.match(/^'((?:\\.|[^'\\])*)'$/);if(!quoted)fail('the '+key+' argument needs a quoted default');value=quoted[1].replace(/\\(['\\])/g,'$1');}
        options[key].parameter=true;options[key].param=match[1];
      }
      options[key].value=key==='hide_empty'&&typeof value==='boolean'?(value?1:0):value;
    }
    if(state.source==='wp-terms')state.termSearch=args.search||'';
    else {
      if(typeof args.post_type!=='string')fail('choose a single explicit post type');
      state.postType=args.post_type;
      state.attachmentMime=args.post_mime_type||'';
      if(args.post_parent!==undefined){
        let value=args.post_parent,parameter=false;
        if(typeof value==='string'&&value.startsWith('$')){const match=value.match(/^\$parent \?\? (\d+)$/);if(!match)fail('the parent argument needs $parent with a numeric default');value=Number(match[1]);parameter=true;}
        state.attachmentParent={enabled:true,value,parameter};
      }
      state.ignoreSticky=args.ignore_sticky_posts===true;
      state.search=args.s||'';state.author=args.author===undefined?'':String(args.author);
      state.include=args.post__in?.join(', ')||'';state.exclude=args.post__not_in?.join(', ')||'';state.sortMetaKey=args.meta_key||'';
      for(const[kind,arg]of [['tax','tax_query'],['meta','meta_query']]){
        if(!args[arg])continue;
        const group=args[arg];state[kind+'Relation']=group.relation||'AND';
        if(!['AND','OR'].includes(state[kind+'Relation']))fail(arg+' has an unsupported relation');
        for(const[key,clause]of Object.entries(group)){
          if(key==='relation')continue;
          if(!/^\d+$/.test(key)||!clause||typeof clause!=='object'||clause.relation)fail('nested or named '+arg+' rules are not supported');
          if(kind==='tax'){
            if(!['slug','term_id'].includes(clause.field))fail('taxonomy rules must use term slugs or IDs');
            state.tax.push({taxonomy:clause.taxonomy,field:clause.field,terms:(Array.isArray(clause.terms)?clause.terms:[clause.terms]).filter(v=>v!==undefined).join(', '),operator:clause.operator||'IN',children:clause.include_children!==false});
          }else state.meta.push({key:clause.key,compare:clause.compare||'=',type:clause.type||'CHAR',value:clause.value??''});
        }
      }
    }
    // Reject any argument the form would drop or rewrite, including extension queries.
    const normalize = config => {
      const result=JSON.parse(JSON.stringify(config));
      if(result.type==='wp-query'&&result.args.ignore_sticky_posts===false)delete result.args.ignore_sticky_posts;
      for(const[kind,key]of [['tax','tax_query'],['meta','meta_query']]){
        const group=result.args[key];if(!group)continue;
        if(!Object.keys(group).some(name=>name!=='relation')){delete result.args[key];continue;}
        const normalized={relation:group.relation||'AND'};
        for(const[index,clause]of Object.entries(group)){
          if(index==='relation')continue;
          const item={...clause};
          if(kind==='tax'){
            item.operator??='IN';item.include_children??=true;item.terms=Array.isArray(item.terms)?item.terms:item.terms===undefined?[]:[item.terms];
          }else {item.compare??='=';item.type??='CHAR';}
          normalized[index]=item;
        }
        result.args[key]=normalized;
      }
      const sort=value=>value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sort(value[key])])):value;
      return JSON.stringify(sort(result));
    };
    let result;try{result=compile(state);}catch(error){fail(error.message);}
    if(normalize(loop.config)!==normalize({type:result.type,args:result.native}))fail('some arguments or values are outside the visual builder’s supported options');
    const allowed=state.source==='wp-terms'?['name','slug','term_id','count','description','term_order']:['date','modified','title','menu_order','rand','ID','author','name','comment_count','meta_value','meta_value_num',...(state.postType==='attachment'?['collection_order']:[])];
    if(options.orderby.enabled&&!allowed.includes(options.orderby.value))fail('the sort field is unsupported');
    if(options.order.enabled&&!['ASC','DESC'].includes(options.order.value))fail('the sort direction is unsupported');
    if(state.meta.some(r=>!['=','!=','>','>=','<','<=','LIKE','NOT LIKE','IN','NOT IN','BETWEEN','NOT BETWEEN','EXISTS','NOT EXISTS'].includes(r.compare)||!['CHAR','NUMERIC','DATE','DATETIME','DECIMAL','SIGNED','UNSIGNED','BINARY','TIME'].includes(r.type)))fail('a meta comparison or value type is unsupported');
    if(state.tax.some(r=>!['IN','NOT IN','AND','EXISTS','NOT EXISTS'].includes(r.operator)))fail('a taxonomy operator is unsupported');
    return state;
  }
  // Core query classes that return the object types Etch can hydrate.
  const catalog={};
  function entries(source, type, names){for(const name of names.split(' '))catalog[source][name]={type,label:name.replace(/__/g,' / ').replace(/_/g,' ')};}
  for(const source of ['wp-query','wp-terms','wp-users'])catalog[source]={};
  entries('wp-query','text','post_type post_status s name pagename title author_name category_name tag post_password post_mime_type meta_key meta_value meta_compare meta_compare_key meta_type meta_type_key perm');
  entries('wp-query','number','p page_id post_parent posts_per_page posts_per_archive_page offset paged page author cat tag_id year monthnum w day hour minute second m attachment_id menu_order comment_count');
  entries('wp-query','ids','post__in post__not_in post_name__in post_parent__in post_parent__not_in author__in author__not_in category__in category__not_in category__and tag__in tag__not_in tag__and');
  entries('wp-query','strings','tag_slug__in tag_slug__and search_columns');catalog['wp-query'].post_name__in.type='strings';
  entries('wp-query','bool','ignore_sticky_posts exact sentence nopaging has_password no_found_rows cache_results update_post_meta_cache update_post_term_cache lazy_load_term_meta suppress_filters');
  entries('wp-query','sort','orderby');entries('wp-query','text','order');
  entries('wp-terms','text','taxonomy search name__like description__like meta_key meta_value meta_compare meta_compare_key meta_type meta_type_key order');
  entries('wp-terms','number','number offset parent child_of');
  entries('wp-terms','ids','object_ids include exclude exclude_tree term_taxonomy_id');
  entries('wp-terms','strings','slug name');
  entries('wp-terms','bool','hide_empty hierarchical childless pad_counts get update_term_meta_cache cache_results');catalog['wp-terms'].get.type='text';
  entries('wp-terms','text','orderby cache_domain');
  entries('wp-users','text','role search meta_key meta_value meta_compare meta_compare_key meta_type meta_type_key who order');
  entries('wp-users','number','number offset paged blog_id');
  entries('wp-users','ids','include exclude nicename__in nicename__not_in login__in login__not_in');
  for(const k of ['nicename__in','nicename__not_in','login__in','login__not_in'])catalog['wp-users'][k].type='strings';
  entries('wp-users','strings','role__in role__not_in capability capability__in capability__not_in search_columns');
  entries('wp-users','bool','count_total cache_results');entries('wp-users','sort','orderby');
  catalog['wp-query'].post_type.type=catalog['wp-query'].post_status.type=catalog['wp-terms'].taxonomy.type='strings';
  catalog['wp-users'].role.type='strings';catalog['wp-users'].has_published_posts={type:'published',label:'Has published posts'};
  for(const source of Object.keys(catalog))catalog[source].fields={type:'recordFields',label:'Record fields'};
  entries('wp-query','text','comment_status ping_status');entries('wp-query','number','comments_per_page');entries('wp-query','bool','update_menu_item_cache');
  for(const source of Object.keys(catalog)){catalog[source].meta_key.type=catalog[source].meta_value.type='multi';}
  catalog['wp-query'].author.type=catalog['wp-query'].cat.type=catalog['wp-query'].tag_id.type='text';
  catalog['wp-query'].comment_count.type='comparison';
  const sortFields={
    'wp-query':['date','modified','title','menu_order','rand','ID','author','name','parent','type','comment_count','meta_value','meta_value_num','post__in','post_name__in','post_parent__in','none','relevance','collection_order'],
    'wp-terms':['name','slug','term_group','term_id','description','count','parent','term_order','include','slug__in','meta_value','meta_value_num','none'],
    'wp-users':['ID','display_name','user_login','user_nicename','user_email','user_url','user_registered','post_count','meta_value','meta_value_num','include','login__in','nicename__in']
  };
  const optionHelp={
    post_type:['Content types','Limit results to one or more registered post types, such as post, page, or attachment. Separate several with commas. Use any for all queryable types.'],
    post_status:['Post statuses','Choose which publication states to include. Examples: publish, draft, private, or inherit for media. Separate several with commas; any lets WordPress select its eligible statuses.'],
    posts_per_page:['Posts per page','Maximum posts returned per page. Use -1 for all posts.'],
    number:['Count','Maximum number of results. Terms use 0 for all; users use 0 or -1 for all.'],
    posts_per_archive_page:['Posts on archive pages','Override the count when WordPress treats this query as an archive or search. For ordinary custom queries, use Posts per page.'],
    paged:['Page number','Return a particular page of results, starting at 1. For a Main Query, leave this out to inherit the current archive or search page.'],
    page:['Static front-page page number','WordPress page parameter for a paginated static front page. Most ordinary loops use paged instead.'],
    offset:['Skip results','Skip this many results before returning items. An explicit offset takes precedence over page-based pagination.'],
    orderby:['Sort fields','Choose the sorting field. Posts and users can have several fields with separate directions. Meta sorting requires a meta key or a named meta rule.'],
    order:['Sort direction','ASC sorts ascending; DESC sorts descending. This is the overall direction unless an individual sort field has its own direction.'],
    include:['Include IDs','Return only these term or user IDs. Separate IDs with commas. A nonempty term include list takes precedence over exclude.'],
    exclude:['Exclude IDs','Omit these term or user IDs. Separate IDs with commas.'],
    post__in:['Include post IDs','Return only these post IDs. Separate IDs with commas. An empty list does not restrict posts. Use post__in as Sort by to retain the supplied ID order.'],
    post__not_in:['Exclude post IDs','Omit these post IDs. Separate IDs with commas. WordPress does not combine this with a post__in include list.'],
    post_name__in:['Include post slugs','Return posts matching these slugs. Separate slugs with commas. Use post_name__in sorting to retain their order.'],
    post_parent:['Parent post ID','Return direct children of this post or page. Use 0 for records without a parent. For attachments, this is the post that owns the uploaded file.'],
    post_parent__in:['Include parent IDs','Return records whose direct parent is one of these IDs. Separate IDs with commas.'],
    post_parent__not_in:['Exclude parent IDs','Exclude records whose direct parent is one of these IDs. Separate IDs with commas.'],
    p:['Post ID','Return the post with this exact numeric ID.'],page_id:['Page ID','Return the page with this exact numeric ID.'],attachment_id:['Attachment ID','Return the Media Library attachment with this exact numeric ID.'],
    name:['Name or slug','Posts use an exact post slug. Terms use one or more exact term names.'],pagename:['Page slug or path','Return a page by its slug or hierarchical path, such as company/team.'],title:['Exact post title','Match the complete post title. Use Search text for a keyword search.'],
    author:['Author IDs','Include posts by these author IDs. Separate several IDs with commas. Negative IDs exclude authors.'],author_name:['Author login slug','Match an author by user_nicename, the author URL slug. This is not the displayed author name.'],author__in:['Include authors','Include posts written by any of these numeric user IDs. Separate IDs with commas.'],author__not_in:['Exclude authors','Exclude posts written by these numeric user IDs. Separate IDs with commas.'],
    s:['Post search text','Search post text. Prefix a word with - to exclude it, such as travel -cruise. Search columns controls which fields are searched.'],search:['Search text','Terms search term names and slugs. Users search identity fields and support * wildcards, such as *alex*.'],search_columns:['Search fields','Posts accept post_title, post_excerpt, and post_content. Users accept ID, user_login, user_nicename, user_email, user_url, and display_name. Separate fields with commas.'],exact:['Exact search terms','Match exact words instead of partial words. This modifies post search text.'],sentence:['Search as a phrase','Treat the complete post search text as one phrase instead of separate words.'],
    taxonomy:['Taxonomies','Return terms belonging to these registered taxonomy names. Separate several with commas. This returns terms themselves, rather than posts assigned to terms.'],slug:['Term slugs','Match these exact term slugs. Separate several with commas.'],object_ids:['Terms assigned to objects','Return terms assigned to these post or attachment IDs. Separate IDs with commas.'],term_taxonomy_id:['Term taxonomy IDs','Match the term taxonomy row IDs. These can differ from ordinary term IDs.'],parent:['Direct parent term','Return direct children of this term ID. Use 0 for top-level terms.'],child_of:['Descendants of a term','Return descendants of this term ID at any depth. This is ignored when querying multiple taxonomies.'],exclude_tree:['Exclude term branches','Exclude these term IDs and all their descendants. Separate IDs with commas.'],childless:['Only leaf terms','Return terms that have no children. Applies to hierarchical taxonomies.'],hierarchical:['Consider term descendants','Include a term if it has nonempty descendants, even if the term itself is empty. Works with Hide empty terms.'],hide_empty:['Hide empty terms','Exclude terms that have no assigned content.'],pad_counts:['Include descendant counts','Include the number of objects assigned to descendant terms in each returned term count.'],get:['Term restrictions override','Use all to ignore term ancestry and empty-term restrictions, or leave empty to keep the normal restrictions.'],name__like:['Term name contains','Filter term names using a partial text match.'],description__like:['Term description contains','Filter term descriptions using a partial text match.'],
    role:['Required user roles','Match users with all of these stored roles. Separate several with commas. Use role__in when any listed role is sufficient.'],role__in:['Any of these roles','Match users with at least one listed role, such as editor, author.'],role__not_in:['Exclude user roles','Exclude users with any of these roles. Separate roles with commas.'],capability:['Required capabilities','Match users with all listed stored capabilities. Computed permissions provided through map_meta_cap are not matched.'],capability__in:['Any of these capabilities','Match users with at least one listed stored capability. This queries stored data rather than checking a permission dynamically.'],capability__not_in:['Exclude capabilities','Exclude users with any of these stored capabilities.'],has_published_posts:['Users with published posts','Use true for authors with published posts, false for no restriction, or a comma-separated list of post types to check.'],blog_id:['Multisite site ID','Restrict role and capability matching to this WordPress multisite blog ID. Usually leave this out for the current site.'],who:['User group','The legacy authors value restricts users to authors. Prefer roles or capabilities for new queries.'],nicename__in:['Include user URL slugs','Match users with these user_nicename values. Separate slugs with commas.'],nicename__not_in:['Exclude user URL slugs','Omit users with these user_nicename values. Separate slugs with commas.'],login__in:['Include user logins','Match these exact WordPress login names. Separate logins with commas.'],login__not_in:['Exclude user logins','Omit these exact WordPress login names. Separate logins with commas.'],
    meta_key:['Meta key','The stored metadata key to filter or sort by. For several keys, enable Treat value as a list. Use grouped filters for combined rules.'],meta_value:['Meta value','The value to match for Meta key. Enable Treat value as a list for IN or BETWEEN comparisons. Use grouped filters for combined rules.'],meta_compare:['Meta value comparison','Comparison for Meta value. Examples: =, !=, >, LIKE, IN, BETWEEN, EXISTS, or NOT EXISTS.'],meta_compare_key:['Meta key comparison','Compare the metadata key name itself, rather than its value. For example, LIKE matches part of a key name.'],meta_type:['Meta value cast','How WordPress interprets metadata values for comparison or sorting, such as CHAR, NUMERIC, DATE, or DECIMAL(10,2).'],meta_type_key:['Meta key cast','Use BINARY for case-sensitive key comparisons, or leave empty for the normal key comparison.'],
    ignore_sticky_posts:['Ignore sticky promotion','Prevent WordPress from promoting sticky posts to the start. This does not exclude sticky posts from ordinary matching results.'],nopaging:['Return all posts','Disable post pagination and request all matching posts. This takes precedence over the post count.'],has_password:['Password-protected posts','Yes includes only password-protected posts. No includes only posts without a password. Leave the option out for no password filter.'],post_password:['Exact post password','Match this exact stored post password.'],post_mime_type:['Media MIME type','Filter attachments by a MIME family such as image, video, or audio, or a full type such as application/pdf.'],menu_order:['Exact menu order','Match this numeric menu_order value. To sort by menu order instead, use Sort by.'],comment_count:['Comment count filter','Match a comment count exactly or choose a comparison such as greater than 0.'],comment_status:['Comment status','Filter posts by open or closed comment status.'],ping_status:['Ping status','Filter posts by open or closed ping status.'],comments_per_page:['Comments per page','WordPress comment pagination setting. It does not change the number of post records returned by this loop.'],perm:['Post permission mode','Use readable or editable to apply WordPress permission-aware post status handling for the current visitor.'],
    fields:['Record format','Etch needs full records to expose dynamic fields. Use all; user queries also accept all_with_meta and terms accept all_with_object_id. ID-only or count-only return modes are not supported.'],
    no_found_rows:['Skip total count','Skip the database count used for total pages. Enable only when total-page pagination is not needed.'],count_total:['Count matching users','Calculate the total matching user count. Turn off if only the returned records are needed.'],cache_results:['Cache query results','Use WordPress query caching. Usually leave this at its default unless diagnosing a cache issue.'],update_post_meta_cache:['Prime post meta cache','Preload metadata for matching posts. This changes query performance, not which posts match.'],update_post_term_cache:['Prime post taxonomy cache','Preload taxonomy data for matching posts. This changes performance, not matching results.'],update_term_meta_cache:['Prime term meta cache','Preload metadata for matching terms. Etch may manage its own batch priming.'],lazy_load_term_meta:['Lazy-load term metadata','Let WordPress fetch term metadata in batches when first needed. This does not filter the returned records.'],update_menu_item_cache:['Prime menu item cache','Preload objects referenced by menu items. Useful only when querying navigation menu item posts.'],cache_domain:['Term cache domain','A cache namespace for this term query. Usually leave this at the WordPress default.'],suppress_filters:['Suppress post filters','Disable some WordPress query filters. This can change the behavior of translation, ordering, and other extensions. Preview always runs filters to retain Looper compatibility.']
  };
  for(const[source,specs]of Object.entries(catalog))for(const[key,spec]of Object.entries(specs)){
    const help=optionHelp[key];if(help){spec.label=help[0];spec.help=help[1];continue;}
    if(['year','monthnum','w','day','hour','minute','second','m'].includes(key)){spec.label=({monthnum:'Month',w:'Week of year',m:'Year and month'})[key]||key[0].toUpperCase()+key.slice(1);spec.help=key==='m'?'Match a compact year/month value, such as 202610. Use Date filters for a calendar range.':'Match this part of the publication date. Use Date filters for ranges or modified dates.';}
    else if(key.startsWith('category')||key==='cat'||key.startsWith('tag')){spec.label=key==='cat'?'Category IDs':key.replace(/__/g,' ').replace(/_/g,' ');spec.help='WordPress category or tag shortcut. IDs are numeric; name and slug options use text. “in” matches any, “and” requires all, and “not in” excludes matches. The Taxonomies tab offers term lookup and grouped rules.';}
    else spec.help='An optional WordPress query setting for '+(source==='wp-users'?'users':source==='wp-terms'?'terms':'posts')+'. It changes how records are selected or returned; it is not a database field.';
  }

  const clone=v=>JSON.parse(JSON.stringify(v));
  const specFor=source=>catalog[source==='main-query'?'wp-query':source];
  function literal(v){if(typeof v!=='string'||!v.startsWith('$'))return {value:v};const m=v.match(/^\$([a-zA-Z_]\w*)(?:\s*\?\?\s*(-?\d+(?:\.\d+)?|true|false|'(?:\\.|[^'\\])*'))?$/);if(!m)throw Error('Only a parameter name with a literal default is supported: '+v);let value='';if(m[2]!==undefined){if(m[2][0]==="'")value=m[2].slice(1,-1).replace(/\\(['\\])/g,'$1');else value=m[2]==='true'?true:m[2]==='false'?false:Number(m[2]);}return {value,parameter:true,param:m[1],required:m[2]===undefined};}
  function expression(row,value){if(!row.parameter)return value;if(!/^[a-zA-Z_]\w*$/.test(row.param||''))throw Error('Use a valid argument name.');if(row.required)return '$'+row.param;if(value&&typeof value==='object')throw Error('List and sorting options use literal values. Etch does not support list defaults.');return '$'+row.param+' ?? '+(typeof value==='string'?quote(value):String(value));}
  function expandedPhp(value,depth=0){
    if(typeof value==='string'&&value.startsWith('$')){try{literal(value);return value;}catch(_){return quote(value);}}
    if(!value||typeof value!=='object')return php(value);
    const pad='  '.repeat(depth),items=Object.entries(value).map(([k,v])=>pad+'  '+(Array.isArray(value)?'':(/^\d+$/.test(k)?k:quote(k))+' => ')+expandedPhp(v,depth+1));return items.length?'[\n'+items.join(',\n')+'\n'+pad+']':'[]';
  }
  function parseOption(row,source){
    const spec=specFor(source)[row.key];if(!spec)throw Error('Unsupported option: '+row.key);
    let v=row.value;
    if(spec.type==='number'){if(String(v).trim()===''||!Number.isFinite(Number(v))||!Number.isInteger(Number(v)))throw Error(spec.label+' needs a whole number.');v=Number(v);if(['posts_per_page','number'].includes(row.key)&&v < -1)throw Error('Count must be -1 or a nonnegative whole number.');}
    else if(spec.type==='bool')v=v===true||v==='true'||v===1||v==='1';
    else if(['strings','ids'].includes(spec.type)){v=Array.isArray(v)?v:String(v).split(',').map(s=>s.trim()).filter(Boolean);if(spec.type==='ids')v=v.map(n=>integer(n,spec.label,0,Number.MAX_SAFE_INTEGER));if(['post_type','post_status','taxonomy','role','name'].includes(row.key)&&v.length===1&&!row.array)v=v[0];}
    else if(spec.type==='sort'){
      if(Array.isArray(v)&&v.every(item=>typeof item==='string'))return v;
      if(Array.isArray(v)){const map={};for(const rule of v){if(!rule.field||!['ASC','DESC'].includes(rule.direction))throw Error('Choose a field and direction for each sort rule.');if(Object.hasOwn(map,rule.field))throw Error('Each sort field can appear once.');map[rule.field]=rule.direction;}v=row.sortList?Object.keys(map):map;}
      if(!v||typeof v!=='object')v=String(v||'');
    }else if(spec.type==='multi'){v=Array.isArray(v)?v:row.array?String(v).split(',').map(s=>s.trim()):typeof v==='number'?v:String(v??'');}
    else if(spec.type==='comparison'){if(v&&typeof v==='object'){v={value:integer(v.value,'Comment count',0,Number.MAX_SAFE_INTEGER),compare:v.compare||'='};if(!['=','!=','>','>=','<','<='].includes(v.compare))throw Error('Choose a comment count comparison.');}else v=integer(v,'Comment count',0,Number.MAX_SAFE_INTEGER);}
    else if(spec.type==='recordFields'){v=String(v??'all');if(!['all',...(source==='wp-users'?['all_with_meta']:source==='wp-terms'?['all_with_object_id']:[''])].includes(v))throw Error('Etch loops need full records. Use all for record fields.');}
    else if(spec.type==='published'){if(v==='true'||v===true)v=true;else if(v==='false'||v===false)v=false;else v=Array.isArray(v)?v:String(v).split(',').map(s=>s.trim()).filter(Boolean);}
    else v=typeof v==='number'?v:String(v??'');
    return v;
  }
  function compileFilter(rows,kind,relation='AND',depth=0){
    if(!rows?.length)return null;if(depth>5)throw Error('Use at most six levels of filter groups.');
    if(!['AND','OR'].includes(relation)||rows.length>12)throw Error('Use AND or OR and at most 12 rules per group.');
    const out={relation};rows.forEach((row,i)=>{
      const key=row.queryKey??row.name??i;
      if(row.rules){const group=compileFilter(row.rules,kind,row.relation,depth+1);if(!group)throw Error('Add a rule to each nested group.');out[key]=group;return;}
      if(kind==='meta'){
        const compares=['=','!=','>','>=','<','<=','LIKE','NOT LIKE','IN','NOT IN','BETWEEN','NOT BETWEEN','EXISTS','NOT EXISTS','REGEXP','NOT REGEXP','RLIKE'];
        if(!compares.includes(row.compare||'='))throw Error('Choose a supported meta comparison.');
        const keyValue=Array.isArray(row.key)?row.key:row.compare_key&&['IN','NOT IN'].includes(row.compare_key)?String(row.key).split(',').map(v=>v.trim()).filter(Boolean):String(row.key||'').trim();if(!keyValue||Array.isArray(keyValue)&&!keyValue.length)throw Error('Choose a meta key.');
        const c={key:keyValue,compare:row.compare||'=',type:row.type||'CHAR'};
        if(!/^(CHAR|NUMERIC|BINARY|DATE|DATETIME|DECIMAL(?:\(\d+,\d+\))?|SIGNED|UNSIGNED|TIME)$/.test(c.type))throw Error('Choose a supported meta value type.');
        if(!['EXISTS','NOT EXISTS'].includes(c.compare)){let value=row.value??'';const list=['IN','NOT IN','BETWEEN','NOT BETWEEN'].includes(c.compare);if(list)value=Array.isArray(value)?value:String(value).split(',').map(v=>v.trim());if(['BETWEEN','NOT BETWEEN'].includes(c.compare)&&value.length!==2)throw Error('Between needs two comma-separated values.');if(/^(NUMERIC|DECIMAL|SIGNED|UNSIGNED)/.test(c.type)){const number=v=>{if(String(v).trim()===''||!Number.isFinite(Number(v)))throw Error('Enter a numeric value for '+row.key+'.');return Number(v);};value=list?value.map(number):number(value);}c.value=value;}
        if(row.compare_key){if(!compares.includes(row.compare_key))throw Error('Choose a supported key comparison.');c.compare_key=row.compare_key;}if(row.type_key){if(row.type_key!=='BINARY')throw Error('Meta key casts support BINARY.');c.type_key=row.type_key;}out[key]=c;return;
      }
      const seed=initial();seed[kind]=[{...row}];seed[kind+'Relation']='AND';
      if(kind==='tax'){seed.tax[0].field=row.field==='name'?'slug':row.field==='term_taxonomy_id'?'term_id':row.field;}
      const c=compile(seed).args[kind==='tax'?'tax_query':'meta_query'][0];
      if(kind==='tax'&&row.field)c.field=row.field;
      for(const k of ['compare_key','type_key'])if(row[k])c[k]=row[k];
      out[key]=c;
    });return out;
  }
  function loadFilter(group,kind){return Object.entries(group||{}).filter(([k])=>k!=='relation').map(([name,c])=>{
    if(!c||typeof c!=='object')throw Error('Invalid '+kind+' rule.');
    const allowed=kind==='tax'?['taxonomy','field','terms','operator','include_children']:['key','value','compare','type','compare_key','type_key'];
    if(c.relation||!('key'in c)&&kind==='meta'||!('taxonomy'in c)&&kind==='tax')return {queryKey:name,name:/^\d+$/.test(name)?undefined:name,relation:c.relation||'AND',rules:loadFilter(c,kind)};
    if(Object.keys(c).some(k=>!allowed.includes(k)))throw Error('A filter contains unsupported properties.');
    if(kind==='tax')return {queryKey:name,name:/^\d+$/.test(name)?undefined:name,taxonomy:c.taxonomy,field:c.field||'term_id',terms:(Array.isArray(c.terms)?c.terms:[c.terms]).filter(v=>v!==undefined).join(', '),operator:c.operator||'IN',children:c.include_children!==false};
    return {queryKey:name,name:/^\d+$/.test(name)?undefined:name,key:c.key,value:c.value??'',compare:c.compare||'=',type:c.type||'CHAR',...(c.compare_key?{compare_key:c.compare_key}:{}),...(c.type_key?{type_key:c.type_key}:{})};
  });}
  function dateQuery(rows,relation='AND',depth=0){if(!rows?.length)return null;if(depth>5||rows.length>12)throw Error('Too many date rules or nested groups.');const group={relation};rows.forEach((row,i)=>{
    if(row.rules){const nested=dateQuery(row.rules,row.relation,depth+1);if(!nested)throw Error('Add a rule to each date group.');group[row.queryKey??row.name??i]=nested;return;}
    const allowed=['after','before','year','month','monthnum','week','w','day','dayofweek','dayofweek_iso','dayofyear','hour','minute','second','inclusive','compare','column'];
    const c={};for(const[k,v]of Object.entries(row)){if(['','name','queryKey','afterMode','beforeMode'].includes(k)||v===''||v===undefined)continue;if(!allowed.includes(k))throw Error('Unsupported date setting: '+k);if(['after','before','column','compare'].includes(k)||typeof v==='boolean'||Array.isArray(v)||typeof v==='object')c[k]=v;else c[k]=integer(v,'Date '+k,0,9999);}if(!Object.keys(c).some(k=>!['column','compare','inclusive'].includes(k)))throw Error('Set a date or date part for each date rule.');group[row.queryKey??row.name??i]=c;});return group;}
  function loadDates(group){return Object.entries(group||{}).filter(([k])=>k!=='relation').map(([name,row])=>row.relation||Object.keys(row).some(k=>/^\d+$/.test(k))?{queryKey:name,name:/^\d+$/.test(name)?undefined:name,relation:row.relation||'AND',rules:loadDates(row)}:{...row,queryKey:name,name:/^\d+$/.test(name)?undefined:name});}
  function expandedInitial(){return {...initial(),advanced:[],dates:[],dateRelation:'AND',relationship:{enabled:false,id:'',direction:'from',value:0,parameter:false,param:'relatedID'},userOptions:{number:{enabled:true,value:6,parameter:false,param:'count'},orderby:{enabled:true,value:'display_name',parameter:false,param:'orderby'},order:{enabled:true,value:'ASC',parameter:false,param:'order'},offset:{enabled:false,value:0,parameter:false,param:'offset'},paged:{enabled:false,value:1,parameter:false,param:'paged'},role:{enabled:false,value:'',parameter:false,param:'role'},search:{enabled:false,value:'',parameter:false,param:'search'}}};}
  function expandedCompile(state){
    let r;if(state.source==='wp-users'){r={type:'wp-users',args:{},native:{}};for(const[key,row]of Object.entries(state.userOptions||{})){if(!row.enabled)continue;const value=parseOption({...row,key},state.source);r.args[key]=value;r.native[key]=expression({...row,param:row.param||key},value);}}
    else{
      const clean={...state,tax:[],meta:[],taxRelation:'AND',metaRelation:'AND',sortMetaKey:String(state.advanced?.find(row=>row.key==='meta_key')?.value||state.sortMetaKey||'')};
      r=compile(clean);
    }
    for(const kind of ['tax','meta']){if(kind==='tax'&&['wp-users','wp-terms'].includes(state.source))continue;const group=compileFilter(state[kind],kind,state[kind+'Relation']||'AND');if(group)r.args[kind+'_query']=r.native[kind+'_query']=group;}
    const dates=dateQuery(state.dates,state.dateRelation||'AND');if(dates){if(state.source==='wp-terms')throw Error('Term queries do not support date filters.');r.args.date_query=r.native.date_query=dates;}
    const used=new Set();for(const row of state.advanced||[]){if(used.has(row.key))throw Error('Use each additional option once: '+row.key);used.add(row.key);const value=parseOption(row,state.source);r.args[row.key]=value;r.native[row.key]=expression(row,value);}
    if(state.relationship?.enabled){if(!['wp-query','main-query'].includes(state.source))throw Error('Relationships require a post query.');const row=state.relationship;if(!row.id.trim())throw Error('Enter a registered Meta Box relationship ID.');const value=integer(row.value,'Related object ID',0,Number.MAX_SAFE_INTEGER);r.args.relationship={id:row.id.trim(),[row.direction]:value};r.native.relationship={id:row.id.trim(),[row.direction]:expression(row,value)};}
    if(state.source==='wp-users'&&!Object.keys(r.args).length)r.args.number=r.native.number=6;
    if(JSON.stringify(r.native).length>75000)throw Error('This query is too large. Reduce the number of filter rules.');
    r.php='$query_args = '+expandedPhp(r.native)+';';r.json=JSON.stringify({type:r.type,args:r.native},null,2);return r;
  }
  const v2Prefix='_looper_etch_v2';
  function encode64(v){const s=unescape(encodeURIComponent(JSON.stringify(v)));return (typeof btoa==='function'?btoa(s):Buffer.from(s,'binary').toString('base64')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
  function decode64(s){s=s.replace(/-/g,'+').replace(/_/g,'/');const raw=typeof atob==='function'?atob(s):Buffer.from(s,'base64').toString('binary');return JSON.parse(decodeURIComponent(escape(raw)));}
  function decodeExpanded(input){const a=clone(input||{});if(typeof a.taxonomy==='string'&&a.taxonomy.startsWith(v2Prefix+':'))return decode64(a.taxonomy.split('|')[0].slice(v2Prefix.length+1));const marker=Array.isArray(a.meta_query)&&a.meta_query.find(row=>row.key===v2Prefix);return marker?decode64(marker.value):decodeApiArgs(a);}
  function needsBridge(r){
    const a=r.native;if(r.type==='wp-terms')return Object.keys(a).some(k=>!['taxonomy','orderby','order','hide_empty'].includes(k))||typeof a.hide_empty==='string'||Array.isArray(a.taxonomy)||(!['name','slug','term_group','term_id','description','count'].includes(a.orderby)&&a.orderby!==undefined&&!String(a.orderby).startsWith('$'));
    if(r.type==='wp-users')return true;
    const allowed=['post_type','posts_per_page','offset','paged','page','orderby','order','post_status','ignore_sticky_posts','author','author_name','category','category_name','tag','tax_query','meta_query','s'];
    if(Object.keys(a).some(k=>!allowed.includes(k)))return true;if(Array.isArray(a.post_status)||typeof a.orderby==='object'||a.orderby&&!sortFields['wp-query'].slice(0,6).concat(['author','name','parent','comment_count']).includes(a.orderby)&&!String(a.orderby).startsWith('$'))return true;
    for(const k of ['meta_query','tax_query']){const g=a[k];if(!g)continue;const rules=Object.entries(g).filter(([key])=>key!=='relation').map(([,v])=>v);if(g.relation==='OR'&&rules.length>1||rules.some(c=>c.relation||k==='meta_query'&&(!Object.hasOwn(c,'value')||c.compare_key||c.type_key)||k==='tax_query'&&!['IN','NOT IN','AND'].includes(c.operator)||Object.keys(g).some(name=>name!=='relation'&&!/^\d+$/.test(name))))return true;}
    return false;
  }
  function expandedApiArgs(r){
    // Keep the existing gallery carrier readable and backwards compatible.
    if(!needsBridge(r))return apiArgs(r);
    if(r.type==='wp-query'&&r.native.post_type==='attachment'){const native=clone(r.native);delete native.post_mime_type;delete native.post_parent;if(native.orderby==='collection_order')native.orderby='ID';if(!needsBridge({...r,native}))return apiArgs(r);}
    const payload=encode64(r.native),params=[...JSON.stringify(r.native).matchAll(/\$[a-zA-Z_]\w*(?:\s*\?\?\s*(?:-?\d+(?:\.\d+)?|true|false|'(?:\\.|[^'\\])*'))?/g)].map(m=>m[0]);
    if(r.type==='wp-terms')return {taxonomy:v2Prefix+':'+payload+(params.length?'|'+[...new Set(params)].join('|'):''),orderby:'name',hide_empty:false};
    return {...(r.type==='wp-query'?{post_type:r.native.post_type||'post'}:{}),meta_query:[{key:v2Prefix,value:payload,compare:'='},...[...new Set(params)].map((value,i)=>({key:v2Prefix+'_param_'+i,value,compare:'='}))]};
  }
  function expandedLoad(loop){
    if(!['wp-query','wp-terms','wp-users','main-query'].includes(loop?.config?.type))throw Error('This source is not a WordPress query.');
    const args=decodeExpanded(loop.config.args),source=loop.config.type;if(!args||Array.isArray(args)||typeof args!=='object')throw Error('Invalid query arguments.');
    if('post_offset'in args)throw Error('post_offset is not a WordPress query argument; use offset instead.');
    // Use the original importer for existing simple definitions to preserve every legacy detail.
    try{if(args.post_type==='any')throw Error('Use multi-type controls');const old=loadDefinition({...loop,config:{type:source,args}});return {...expandedInitial(),...old};}catch(_){}
    let state=expandedInitial();state.source=source;state.name=loop.name||loop.key;state.key=loop.key;state.global=!!loop.global;state.ignoreSticky=false;
    Object.values(state.options).forEach(o=>o.enabled=false);Object.values(state.termOptions).forEach(o=>o.enabled=false);Object.values(state.userOptions).forEach(o=>o.enabled=false);
    if(source==='wp-query')state.postType=Array.isArray(args.post_type)?args.post_type[0]:typeof args.post_type==='string'&&!args.post_type.startsWith('$')&&args.post_type!=='any'?args.post_type:'post';
    if(source==='wp-terms'){state.termOptions.taxonomy.enabled=true;state.termOptions.taxonomy.value=Array.isArray(args.taxonomy)?args.taxonomy[0]:literal(args.taxonomy||'').value;}
    for(const[key,v]of Object.entries(args)){
      if(['tax_query','meta_query'].includes(key)){const kind=key==='tax_query'?'tax':'meta';state[kind]=loadFilter(v,kind);state[kind+'Relation']=v.relation||'AND';continue;}
      if(key==='date_query'){state.dates=loadDates(v);state.dateRelation=v.relation||'AND';continue;}
      if(key==='relationship'){if(!v||typeof v!=='object'||!('from'in v)&&!('to'in v))throw Error('A relationship requires from or to.');const dir='from'in v?'from':'to';if(Object.keys(v).some(k=>!['id',dir].includes(k)))throw Error('This relationship has unsupported settings.');state.relationship={enabled:true,id:v.id,direction:dir,...literal(v[dir]),value:literal(v[dir]).required?0:literal(v[dir]).value,param:literal(v[dir]).param||'relatedID'};continue;}
      if(!Object.hasOwn(specFor(source),key))throw Error('This loop cannot be edited safely in Looper: unsupported argument '+key+'. Edit it in Etch’s Loop Manager.');
      if(source==='wp-query'&&key==='post_type'&&typeof v==='string'&&!v.startsWith('$')&&v!=='any')continue;
      if(source==='wp-query'&&key==='ignore_sticky_posts'&&typeof v==='boolean'){state.ignoreSticky=v;continue;}
      const parsed=literal(v),row={key,...parsed};const options=source==='wp-users'?state.userOptions:source==='wp-terms'?state.termOptions:state.options;
      if(options[key]&&(!parsed.value||typeof parsed.value!=='object')&&key!=='taxonomy'){options[key]={enabled:true,...parsed};continue;}
      if(source==='wp-terms'&&key==='taxonomy'&&typeof v==='string'){state.termOptions.taxonomy={enabled:true,...parsed};continue;}
      if(specFor(source)[key].type==='sort'&&v&&typeof v==='object'){row.sortList=Array.isArray(v);row.value=row.sortList?v.map(field=>({field,direction:args.order||'ASC'})):Object.entries(v).map(([field,direction])=>({field,direction}));}
      if(Array.isArray(v))row.array=true;state.advanced.push(row);
    }
    const result=expandedCompile(state);
    // Round-trip through normalized WordPress defaults, refusing silent data loss.
    const canonical=v=>{if(!v||typeof v!=='object')return v;return Object.fromEntries(Object.entries(v).filter(([k])=>k!=='relation'||v[k]!=='AND').sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,canonical(x)]));};
    const normalize=a=>{const b=clone(a);for(const kind of ['tax','meta']){const key=kind+'_query';if(!b[key]||!Object.keys(b[key]).some(k=>k!=='relation')){delete b[key];continue;}const rec=g=>{for(const[k,c]of Object.entries(g)){if(k==='relation')continue;if(c.relation||!('key'in c)&&kind==='meta'||!('taxonomy'in c)&&kind==='tax'){rec(c);continue;}if(kind==='meta'){c.compare??='=';c.type??='CHAR';}else{c.operator??='IN';c.field??='term_id';c.include_children??=true;c.terms=Array.isArray(c.terms)?c.terms:c.terms===undefined?[]:[c.terms];}}};rec(b[key]);}if(b.ignore_sticky_posts===false)delete b.ignore_sticky_posts;return canonical(b);};
    if(JSON.stringify(normalize(args))!==JSON.stringify(normalize(result.native)))throw Error('This loop contains values the visual controls cannot preserve. Edit it in Etch’s Loop Manager.');
    return state;
  }

  const api = { compile:expandedCompile, initial:expandedInitial, loadDefinition:expandedLoad, apiArgs:expandedApiArgs, decodeApiArgs:decodeExpanded, basics, termBasics, catalog, sortFields, needsBridge, literal }; 
  if (typeof module !== 'undefined') module.exports = api;
  root.LooperQuery = api;
})(typeof window !== 'undefined' ? window : globalThis);
