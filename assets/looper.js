(() => {
  'use strict';
  if (!window.looperConfig || window.looperForEtch) return;
  const Q = window.LooperQuery, config = window.looperConfig;
  let state = freshDraft(), content = null, output = null, loadSequence = 0, previewSequence = 0, busy = false, fieldSequence = 0;
  const admin = document.getElementById('looper-admin');
  const host = document.createElement('div'); host.id = 'looper-for-etch';
  const shadow = host.attachShadow({ mode: 'open' });
  const sheet = document.createElement('link'); sheet.rel = 'stylesheet';
  sheet.href = config.styles || new URL('looper.css', document.currentScript.src).href;
  shadow.append(sheet);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const shell = el('section', 'shell'); shell.setAttribute('aria-labelledby', 'lfe-title'); shadow.append(shell);
  const pendingPreferences=new Set();
  let trigger, previousFocus, closeSettingsPopover=()=>{};
  if (admin) admin.append(host);
  else {
    document.body.append(host); host.hidden = true;
    shell.setAttribute('role', 'dialog'); shell.setAttribute('aria-modal', 'false');
    // Etch's extension toolbar API puts Looper alongside the builder's own tools.
    let attempts = 0;
    const toolbarTimer = setInterval(() => {
      const bar = window.etchControls?.builder?.settingsBar?.bottom;
      if (typeof bar?.addBefore !== 'function') { if (++attempts > 240) clearInterval(toolbarTimer); return; }
      try {
        const container = document.querySelector('.settings-bar__section.bottom');
        const decorate = () => {
          const toolbar = document.querySelector('.settings-bar__section.bottom');
          trigger = toolbar?.querySelector('[data-icon="mdi:all-inclusive"]')?.closest('button') || [...(toolbar?.querySelectorAll('button') || [])].find(b => b.querySelector('path')?.getAttribute('d')?.startsWith('M18.6 6.62'));
          if (!trigger) return false;
          trigger.setAttribute('aria-label', 'Looper for Etch');
          trigger.setAttribute('aria-expanded', String(!host.hidden));
          return true;
        };
        const observer = container ? new MutationObserver(() => { if (decorate()) observer.disconnect(); }) : null;
        observer?.observe(container, { childList: true, subtree: true });
        bar.addBefore({ id: 'looper-for-etch-toolbar', icon: 'mdi:all-inclusive', tooltip: 'Looper for Etch', callback: () => host.hidden ? open() : close() });
        if (decorate()) observer?.disconnect();
        let labelAttempts = 0;
        const labelTimer = setInterval(() => { if (decorate() || ++labelAttempts > 240) { clearInterval(labelTimer); observer?.disconnect(); } }, 250);
        clearInterval(toolbarTimer);
      } catch (_) { if (++attempts > 240) clearInterval(toolbarTimer); }
    }, 250);
  }
  let backgroundState = [], backgroundObserver, bodyOverflow = '', viewport, pendingFocus;
  function isolateBackground() {
    if (admin || backgroundState.length) return;
    bodyOverflow = document.body.style.overflow;
    const toolbar=document.querySelector('.settings-bar');
    const isolate=node=>{
      if(node===host||node===toolbar||node.nodeType!==1)return;
      if(toolbar&&node.contains(toolbar)){[...node.children].forEach(isolate);return;}
      if(!backgroundState.some(([old])=>old===node)){backgroundState.push([node,node.inert]);node.inert=true;}
    };
    [...document.body.children].forEach(isolate);
    backgroundObserver=new MutationObserver(records=>records.flatMap(r=>[...r.addedNodes]).filter(n=>n.parentElement===document.body).forEach(isolate));
    backgroundObserver.observe(document.body,{childList:true});document.body.style.overflow='hidden';
  }
  // Native toolbar actions remain available and retain their normal event handling.
  document.addEventListener('click',event=>{
    if(admin||host.hidden)return;
    const toolbar=event.target instanceof Element?event.target.closest('.settings-bar'):null;
    if(toolbar&&!(trigger&&trigger.contains(event.target)))close(false);
  },true);
  function open() { if(busy)return; if(!savedLoopsLoading)loadSavedLoops(); previousFocus=document.activeElement; host.hidden=false; isolateBackground(); trigger?.setAttribute('aria-expanded','true'); render(); shadow.querySelector('button,input')?.focus(); }
  function close(restoreFocus=true) { closeSettingsPopover(false);host.hidden=true; backgroundObserver?.disconnect(); backgroundState.forEach(([n,inert])=>{n.inert=inert;}); backgroundState=[]; if(!admin)document.body.style.overflow=bodyOverflow; trigger?.setAttribute('aria-expanded','false'); if(restoreFocus)(trigger||previousFocus)?.focus(); }
  shadow.addEventListener('keydown',event=>{
    if(admin)return;
    if(event.key==='Escape'){event.preventDefault();if(shadow.querySelector('.settings-trigger[aria-expanded="true"]'))closeSettingsPopover(true);else close();event.stopPropagation();}
    if(event.key==='Tab'&&!document.querySelector('.settings-bar')){
      const nodes=[...shadow.querySelectorAll('button,input,select,textarea,summary,a[href],[tabindex="0"]')].filter(n=>!n.disabled&&!n.closest('[hidden],[inert]')&&n.getClientRects().length&&(!n.closest('details:not([open])')||n.tagName==='SUMMARY'));
      const first=nodes[0],last=nodes.at(-1),focused=shadow.activeElement;
      if(event.shiftKey&&focused===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&focused===last){event.preventDefault();first?.focus();}
    }
  });
  function button(text, handler, cls = '') { const b = el('button', cls, text); if (text.startsWith('Remove ')) b.classList.add('remove-action'); b.type = 'button'; b.addEventListener('click', handler); return b; }
  function input(value, change, type = 'text') { const n = el('input'); n.type = type; n.value = value; n.addEventListener('input', () => change(n.value)); return n; }
  function select(options, value, change) {
    const n = el('select'); options.forEach(option => { const [v, label] = Array.isArray(option) ? option : [option, option]; const o = el('option', '', label); o.value = v; n.append(o); });
    if(value!==undefined&&!options.some(option=>(Array.isArray(option)?option[0]:option)===value)){const o=el('option','',String(value));o.value=value;n.append(o);}
    n.value = value; n.addEventListener('change', () => change(n.value)); return n;
  }
  function parameterTooltip(node,key){if(key){node.title='WordPress argument: '+key+(Q.catalog?.[state.source==='main-query'?'wp-query':state.source]?.[key]?.help?'\n'+Q.catalog[state.source==='main-query'?'wp-query':state.source][key].help:'');node.dataset.queryParameter=key;}return node;}
  function fieldParameter(label){
    const names={'Count':state.source==='wp-users'||state.source==='wp-terms'?'number':'posts_per_page','Sort by':'orderby','Sort order':'order','Status':'post_status','Content type':'post_type','Search text':state.source==='wp-users'||state.source==='wp-terms'?'search':'s','Filter term names':'search','Author ID':'author','Include post IDs':'post__in','Exclude post IDs':'post__not_in','Parent post ID':'post_parent','Parent ID':'parent','File type / MIME type':'post_mime_type','Empty terms':'hide_empty','Page':'paged','Field key':'meta_query[].key','Value type':'meta_query[].type','Match rules in this group':'relation','Match date rules':'date_query.relation','Date field':'date_query[].column','Include boundary dates':'date_query[].inclusive'};
    return names[label];
  }
  function field(label, control) { const wrap=el('label','field');if(!control.id)control.id='lfe-control-'+(++fieldSequence);wrap.htmlFor=control.id;const text=el('span','',label),parameter=fieldParameter(label);if(parameter){parameterTooltip(text,parameter);parameterTooltip(control,parameter);}wrap.append(text,control);return wrap; }
  function check(label, value, handler) { const n = input('', () => {}, 'checkbox'); n.checked = value; n.addEventListener('change', () => handler(n.checked)); return field(label, n); }
  async function request(path,body){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await fetch(config.api+path,{signal:controller.signal,cache:'no-store',credentials:'same-origin',headers:{'X-WP-Nonce':config.nonce,...(body?{'Content-Type':'application/json'}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{})});
      let data;try{data=await response.json();}catch(_){throw Error('WordPress returned an unexpected response. Check your login and any cache or security rules affecting REST requests.');}
      if(!response.ok)throw Error(data.message||'WordPress could not complete the request.');return data;
    }catch(error){if(error.name==='AbortError')throw Error('The request took too long. Use Refresh loops to try again.');throw error;}
    finally{clearTimeout(timer);}
  }
  let message, code, summary, preview, resultStatus, saveButton, actionSelect, actionHint, previewButton;
  let editorGeneration=0,startOverButton;
  let nativeSaveConfirm,nativeSaveOperation=null;
  let actionMode = 'definition', selectedLoopId = '', loopChooser, loadLoopButton, loopChoicesSignature = '';
  let loadingLoop = false, checkingLoops = false, loopLoader, loopLoaderHint, loopDiagnostics;
  const loopContentCache = new Map();
  let savedLoops={}, savedLoopsError='', savedLoopsLoading=false, savedLoopsLoaded=false, runtimeLoopsReady=false;
  function notify(text, error = false) {
    [message].filter(Boolean).forEach(n => { if (n.textContent !== text) n.textContent = text; n.className = 'notice' + (error ? ' error' : ''); });
    shadow.querySelectorAll('.field-error').forEach(n => n.remove());
    shadow.querySelectorAll('[aria-invalid]').forEach(n => { n.removeAttribute('aria-invalid'); n.removeAttribute('aria-describedby'); });
    if (error) {
      let target;
      if (/count/i.test(text)) target = shadow.querySelector('[aria-label="Count value"]');
      else if (/offset/i.test(text)) target = shadow.querySelector('[aria-label="Offset value"]');
      else if (/choose a taxonomy/i.test(text)) target = shadow.querySelector('[aria-label="Taxonomy value"]');
      else if (/name and a key|loop key/i.test(text)) target = [...shadow.querySelectorAll('label')].find(n => n.querySelector('span')?.textContent === (state.name.trim() ? 'Loop key' : 'Loop name'))?.querySelector('input');
      if (target) {
        if(target.closest('details'))target.closest('details').open=true;
        target.setAttribute('aria-invalid','true'); target.setAttribute('aria-describedby','lfe-inline-error');
        const inline = el('span','field-error',text); inline.id = 'lfe-inline-error'; target.parentElement.append(inline);
      }
    }
  }
  function restoreFormFocus(previous, scroll, details) {
    const keys = new Map();
    shadow.querySelectorAll('button,input,select,textarea,summary,[tabindex="0"]').forEach(n => {
      const name = n.dataset.tabKey || n.getAttribute('aria-label') || n.closest('label')?.querySelector('span')?.textContent || n.textContent || n.type;
      const base = n.tagName + ':' + name, count = keys.get(base) || 0; keys.set(base, count + 1);
      n.dataset.focusKey = base + ':' + count;
    });
    shadow.querySelectorAll('details').forEach(n => { if (details.has(n.dataset.section||n.querySelector('summary')?.textContent)) n.open = true; });
    if (viewport) viewport.scrollTop = scroll;
    if (previous) {
      const target = [...shadow.querySelectorAll('[data-focus-key]')].find(n => n.dataset.focusKey === previous && !n.disabled && !n.closest('[hidden]'));
      if (target) { target.focus({ preventScroll: true }); pendingFocus = null; }
    }
  }
  function freshDraft(){return {...Q.initial(),name:'',key:'',keyMode:'auto'};}
  let keyInput,keyHelp,keyResetButton;
  function generatedKey(){
    if(!state.name.trim())return '';
    const words=String(state.name).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/([A-Z]+)([A-Z][a-z])/g,'$1 $2').replace(/([a-z0-9])([A-Z])/g,'$1 $2').match(/[a-zA-Z0-9]+/g)||['loop'];
    let base=words.map((word,i)=>i?word[0].toUpperCase()+word.slice(1).toLowerCase():word.toLowerCase()).join('');
    if(!/^[a-z]/.test(base))base='loop'+base;base=base.slice(0,60);
    const keys=new Set(Object.values(allLoops()).map(loop=>loop.key));let candidate=base,suffix=2;while(keys.has(candidate))candidate=base+suffix++;return candidate;
  }
  function refreshKey(){
    if(state.keyMode==='auto')state.key=generatedKey();
    if(keyInput?.isConnected&&keyInput.value!==state.key)keyInput.value=state.key;
    if(keyHelp?.isConnected)keyHelp.textContent=state.keyMode==='saved'?'Existing key retained. Changing it creates a separate query.':state.keyMode==='manual'?(state.savedKey?'Custom key. Saving creates or updates the query with this key.':'Custom key. Choose Generate key to derive an unused key from the name.'):'A unique camelCase key is generated from the name. Edit it to override.';
    if(keyResetButton?.isConnected){keyResetButton.hidden=state.keyMode!=='manual';keyResetButton.textContent=state.savedKey?'Restore saved key':'Generate key';}
  }
  function queryIdentity(){
    const identity=el('div','identity'),fields=el('div','grid');identity.hidden=config.directActions!==true;
    const nameInput=input(state.name,v=>{state.name=v;changed();});nameInput.placeholder='Name this loop';fields.append(field('Loop name',nameInput));
    keyInput=input(state.key,v=>{state.keyMode='manual';state.key=v;changed();});keyInput.placeholder='Generated from name';keyInput.setAttribute('aria-describedby','lfe-key-help');fields.append(field('Loop key',keyInput));identity.append(fields);
    const info=el('div','key-info');keyHelp=el('p','hint key-help');keyHelp.id='lfe-key-help';
    keyResetButton=button(state.savedKey?'Restore saved key':'Generate key',()=>{if(state.savedKey){state.keyMode='saved';state.key=state.savedKey;}else state.keyMode='auto';changed();},'quiet');
    info.append(keyHelp,keyResetButton);identity.append(info);return identity;
  }
  const queryOptionGroups={
    'wp-query':{
      query:[['Selection','post_type p page_id attachment_id name pagename title post__in post__not_in post_name__in post_parent post_parent__in post_parent__not_in menu_order'],['Authors','author author_name author__in author__not_in'],['Search','s search_columns exact sentence'],['Pagination','paged page nopaging posts_per_archive_page']],
      tax:[['Category and tag shortcuts','cat category_name category__in category__not_in category__and tag tag_id tag__in tag__not_in tag__and tag_slug__in tag_slug__and']],
      meta:[['Single-field settings','meta_key meta_value meta_compare meta_compare_key meta_type meta_type_key']],
      dates:[['Exact publication date','year monthnum w day hour minute second m']],
      more:[['Post visibility and comments','ignore_sticky_posts has_password post_password perm comment_count comment_status ping_status comments_per_page'],['Query execution','no_found_rows cache_results update_post_meta_cache update_post_term_cache update_menu_item_cache lazy_load_term_meta suppress_filters fields']]
    },
    'wp-terms':{
      query:[['Term selection','include exclude exclude_tree object_ids term_taxonomy_id name slug'],['Hierarchy','child_of hierarchical childless pad_counts get'],['Text matching','name__like description__like']],
      meta:[['Single-field settings','meta_key meta_value meta_compare meta_compare_key meta_type meta_type_key']],
      more:[['Query execution','cache_results update_term_meta_cache cache_domain fields']]
    },
    'wp-users':{
      query:[['User selection','include exclude login__in login__not_in nicename__in nicename__not_in'],['Roles and capabilities','role__in role__not_in capability capability__in capability__not_in has_published_posts who blog_id'],['Search fields','search_columns']],
      meta:[['Single-field settings','meta_key meta_value meta_compare meta_compare_key meta_type meta_type_key']],
      more:[['Query execution','count_total cache_results fields']]
    }
  };
  const friendlyOptionNames={posts_per_page:'Count',number:'Count',orderby:'Sort by',order:'Sort order',post_status:'Status',offset:'Offset',paged:'Page',page:'Front-page page',s:'Search text',search:'Search text',author:'Author IDs',post__in:'Include post IDs',post__not_in:'Exclude post IDs',post_parent:'Parent post ID',post_mime_type:'File type / MIME type',hide_empty:'Hide empty terms',parent:'Parent ID',name:'Post slug',taxonomy:'Taxonomy',meta_key:'Field key',meta_value:'Field value',meta_compare:'Value comparison',meta_compare_key:'Key comparison',meta_type:'Value type',meta_type_key:'Key type',fields:'Record format'};
  const sortNames={date:'Published date',modified:'Modified date',title:'Title',menu_order:'Menu order',rand:'Random',ID:'ID',author:'Author',name:'Slug',parent:'Parent ID',type:'Post type',comment_count:'Comment count',meta_value:'Field value',meta_value_num:'Numeric field value',post__in:'Included ID order',post_name__in:'Included slug order',post_parent__in:'Included parent order',none:'No ordering',collection_order:'Collection order',relevance:'Search relevance',display_name:'Display name',user_login:'Login',user_nicename:'User slug',user_email:'Email',user_url:'Website',user_registered:'Registration date',post_count:'Published post count',include:'Included ID order',login__in:'Included login order',nicename__in:'Included slug order',term_id:'Term ID',term_group:'Term group',slug:'Slug',description:'Description',count:'Post count',term_order:'Term order',slug__in:'Included slug order'};
  const sourceCatalog=()=>Q.catalog[state.source==='main-query'?'wp-query':state.source];
  function sourceOptions(){return state.source==='wp-users'?state.userOptions:state.source==='wp-terms'?state.termOptions:state.options;}
  function optionName(key){if(key==='post_type')return state.source==='wp-query'?'Additional content types':'Content type';if(key==='name'&&state.source==='wp-terms')return 'Term names';return friendlyOptionNames[key]||sourceCatalog()[key]?.label||key.replace(/_/g,' ');}
  function optionDefault(key){
    if(key==='post_type')return state.source==='wp-query'?[state.postType]:'post';
    if(['posts_per_page','number','posts_per_archive_page','comments_per_page'].includes(key))return 6;
    if(['paged','page','p','page_id','attachment_id','day','monthnum','w'].includes(key))return 1;
    if(key==='year')return new Date().getFullYear();
    if(key==='m')return Number(String(new Date().getFullYear())+String(new Date().getMonth()+1).padStart(2,'0'));
    const type=sourceCatalog()[key]?.type;
    if(type==='bool')return ['cache_results','update_post_meta_cache','update_post_term_cache','update_term_meta_cache','lazy_load_term_meta','hierarchical'].includes(key);
    if(type==='number'||type==='comparison')return 0;
    if(type==='recordFields')return 'all';if(type==='published')return true;
    if(key==='meta_compare'||key==='meta_compare_key')return '=';if(key==='meta_type')return 'CHAR';if(key==='meta_type_key')return 'BINARY';
    return '';
  }
  function migrateFormOptions(){
    state.advanced||=[];
    if(state.source==='wp-query'){
      for(const[field,key,convert]of [['search','s',v=>v],['include','post__in',v=>v.split(',').map(n=>Number(n.trim()))],['exclude','post__not_in',v=>v.split(',').map(n=>Number(n.trim()))],['author','author',v=>/^\d+$/.test(v)?Number(v):v],['sortMetaKey','meta_key',v=>v]]){
        const value=state[field];if(value!==undefined&&String(value).trim()&&!state.advanced.some(row=>row.key===key))state.advanced.push({key,value:convert(String(value)),parameter:false});state[field]='';
      }
      if(state.attachmentMime?.trim()&&!state.advanced.some(row=>row.key==='post_mime_type'))state.advanced.push({key:'post_mime_type',value:state.attachmentMime,parameter:false});state.attachmentMime='';
      if(state.attachmentParent?.enabled&&!state.advanced.some(row=>row.key==='post_parent'))state.advanced.push({key:'post_parent',...state.attachmentParent,param:'parent'});state.attachmentParent={enabled:false,value:0,parameter:false};
      if(state.ignoreSticky&&!state.advanced.some(row=>row.key==='ignore_sticky_posts'))state.advanced.push({key:'ignore_sticky_posts',value:true,parameter:false});state.ignoreSticky=false;
    }
    if(state.source==='wp-terms'&&state.termSearch?.trim()){if(!state.advanced.some(row=>row.key==='search'))state.advanced.push({key:'search',value:state.termSearch,parameter:false});state.termSearch='';}
  }
  function optionState(key){const extra=state.advanced?.find(row=>row.key===key);if(extra)return {enabled:true,...extra};const basic=sourceOptions()[key];return basic?{...basic}:{enabled:false,value:optionDefault(key),parameter:false};}
  function optionWrite(key,patch){
    state.advanced||=[];const index=state.advanced.findIndex(row=>row.key===key),basic=sourceOptions()[key];
    if(patch.enabled===false){if(index>=0)state.advanced.splice(index,1);if(basic)basic.enabled=false;return;}
    const old=optionState(key),next={...old,...patch};
    const compound=next.value!==null&&typeof next.value==='object';
    if(index<0&&basic&&!compound){Object.assign(basic,next);return;}
    if(basic)basic.enabled=false;
    if(index>=0)Object.assign(state.advanced[index],next);else state.advanced.push({key,...next});
    if(key==='taxonomy')state.termOptions.taxonomy.value=Array.isArray(next.value)?next.value[0]||'':next.value;
  }
  function optionParam(key,row){return row.param||(state.source==='wp-terms'?Q.termBasics[key]?.param:state.source==='wp-users'?state.userOptions[key]?.param:Q.basics[key]?.param)||key.replace(/_+([a-z])/g,(_,c)=>c.toUpperCase());}
  function argumentAllowed(key,row){return !(row.value&&typeof row.value==='object')&&!['ids','strings','recordFields'].includes(sourceCatalog()[key]?.type)&&!(key==='post_type'&&state.source==='wp-query')||(['role','taxonomy','post_status'].includes(key)&&!Array.isArray(row.value));}
  function optionChoices(key){
    if(key==='post_type')return [['any','All public content types'],...content.postTypes.map(t=>[t.name,t.label])];
    if(key==='post_status')return [...content.statuses.map(t=>[t.name,t.label]),...['inherit','trash','any'].filter(v=>!content.statuses.some(t=>t.name===v)).map(v=>[v,v==='inherit'?'Inherit':v==='trash'?'Trash':'Any eligible status'])];
    if(key==='taxonomy')return content.allTaxonomies.map(t=>[t.name,t.label]);
    if(key==='role')return [['','All roles'],...(content.roles||[]).map(t=>[t.name,t.label])];
    if(key==='orderby'){
      const source=state.source==='main-query'?'wp-query':state.source,fields=Q.sortFields[source].filter(v=>v!=='collection_order'||state.postType==='attachment');
      const names=[];const walk=rows=>rows.forEach(row=>row.rules?walk(row.rules):row.name&&names.push(row.name));walk(state.meta||[]);
      return [...new Set([...fields,...names])].map(v=>[v,source==='wp-terms'&&v==='name'?'Name':sortNames[v]||v]);
    }
    if(key==='order')return [['DESC','Descending'],['ASC','Ascending']];
    if(['meta_compare','meta_compare_key'].includes(key))return ['=','!=','>','>=','<','<=','LIKE','NOT LIKE','IN','NOT IN','BETWEEN','NOT BETWEEN','EXISTS','NOT EXISTS','REGEXP','NOT REGEXP','RLIKE'];
    if(key==='meta_type_key')return [['','Default'],['BINARY','Case-sensitive']];
    if(['comment_status','ping_status'].includes(key))return [['open','Open'],['closed','Closed']];
    if(key==='perm')return [['readable','Readable'],['editable','Editable']];
    if(key==='fields')return [['all','Full records'],...(state.source==='wp-users'?[['all_with_meta','Full records with metadata']]:state.source==='wp-terms'?[['all_with_object_id','Full records with object IDs']]:[['','Default full records']])];
    if(key==='get')return [['','Normal restrictions'],['all','Ignore ancestry and empty-term restrictions']];
    if(key==='who')return [['','All users'],['authors','Authors']];
    return null;
  }
  function optionValueControl(key,row,commit){
    const spec=sourceCatalog()[key],wrap=el('div','option-value'),choices=optionChoices(key);let control;
    const update=value=>commit({value});
    if(key==='orderby'&&row.value&&typeof row.value==='object'){
      const list=Array.isArray(row.value)?row.value.map(v=>typeof v==='string'?{field:v,direction:optionState('order').value||'ASC'}:v):Object.entries(row.value).map(([field,direction])=>({field,direction}));
      list.forEach((rule,i)=>{const line=el('div','sort-line'),sort=select(choices,rule.field,v=>{list[i].field=v;commit({value:list,sortList:false},false);}),direction=select([['ASC','Ascending'],['DESC','Descending']],rule.direction,v=>{list[i].direction=v;commit({value:list,sortList:false},false);});sort.setAttribute('aria-label','Sort field '+(i+1));direction.setAttribute('aria-label','Sort direction '+(i+1));parameterTooltip(sort,'orderby');parameterTooltip(direction,'orderby');line.append(sort,direction,button('Remove sort '+(i+1),()=>{const next=list.filter((_,n)=>n!==i);commit({value:next,sortList:false});},'quiet'));wrap.append(line);});
      wrap.append(button('Add sort field',()=>commit({value:[...list,{field:'ID',direction:'ASC'}],sortList:false})));return wrap;
    }
    if(choices&&['post_type','post_status','role','taxonomy'].includes(key)&&Array.isArray(row.value)){
      const selected=row.value.map(String),list=el('div','option-choices');
      for(const[value,label]of choices){if(value==='any'||value==='')continue;const fixed=key==='post_type'&&state.source==='wp-query'&&value===state.postType;const choice=check(label,selected.includes(value)||fixed,on=>{let values=selected.filter(v=>v!==value);if(on)values.push(value);if(key==='post_type'&&state.source==='wp-query'&&!values.includes(state.postType))values.unshift(state.postType);commit({value:values,array:true});});choice.querySelector('input').disabled=fixed;list.append(choice);}
      wrap.append(list);if(!(key==='post_type'&&state.source==='wp-query'))wrap.append(button('Use a single value',()=>commit({value:selected[0]||optionDefault(key),array:false}),'quiet'));return wrap;
    }
    if(spec.type==='comparison'){
      const current=row.value&&typeof row.value==='object'?row.value:{value:row.value,compare:'='},line=el('div','grid');
      const number=input(current.value,v=>commit({value:current.compare==='='&&typeof row.value!=='object'?Number(v):{...current,value:Number(v)}},false),'number'),compare=select(['=','!=','>','>=','<','<='],current.compare,v=>commit({value:{...current,compare:v}}));number.setAttribute('aria-label','Comment count value');compare.setAttribute('aria-label','Comment count comparison');line.append(number,compare);wrap.append(line);return wrap;
    }
    if(spec.type==='published'){
      const mode=Array.isArray(row.value)?'types':String(row.value),choice=select([['true','With published posts'],['false','No restriction'],['types','Specific content types']],mode,v=>commit({value:v==='types'?['post']:v==='true'}));choice.setAttribute('aria-label',optionName(key)+' value');wrap.append(choice);
      if(Array.isArray(row.value)){const list=input(row.value.join(', '),v=>commit({value:v.split(',').map(s=>s.trim()).filter(Boolean)},false));list.setAttribute('aria-label','Published content types');wrap.append(list);}return wrap;
    }
    const value=Array.isArray(row.value)?row.value.join(', '):row.value;
    if(choices)control=select(choices,value,v=>update(spec.type==='number'?Number(v):v));
    else if(spec.type==='bool')control=select([['true','Yes'],['false','No']],String([true,1,'1','true'].includes(row.value)),v=>update(v==='true'));
    else control=input(value??'',v=>commit({value:v},false),spec.type==='number'?'number':'text');
    control.setAttribute('aria-label',optionName(key)+' value');parameterTooltip(control,key);wrap.append(control);
    if(key==='orderby'&&state.source!=='wp-terms'){const add=button('Add sort field',()=>commit({value:[{field:row.value,direction:optionState('order').value||'DESC'},{field:'ID',direction:'ASC'}],parameter:false,sortList:false}),'quiet');add.disabled=!!row.parameter;add.title='Turn off the sort-field argument to configure multiple sort fields.';wrap.append(add);}
    if(['post_status','role','taxonomy'].includes(key)||key==='post_type'&&state.source==='main-query'){const multi=button('Use multiple values',()=>commit({value:[row.value],array:true,parameter:false}),'quiet');multi.disabled=!!row.parameter;multi.title='Multiple values use a fixed list; Etch does not provide array defaults.';wrap.append(multi);}
    if(spec.type==='multi')wrap.append(check('Multiple values',!!row.array,v=>commit({array:v,parameter:false})));
    if(spec.type==='ids'||spec.type==='strings')control.placeholder='Separate values with commas';
    if(key==='meta_key'){
      const id='lfe-option-fields-'+(++fieldSequence),list=el('datalist');list.id=id;(content.fields||[]).forEach(f=>{const o=el('option','',f.label);o.value=f.key;list.append(o);});control.setAttribute('list',id);wrap.append(list);
    }
    return wrap;
  }
  function optionRow(key,{required=false}={}){
    const current=optionState(key),row=el('div','option-row');row.dataset.optionKey=key;
    const enabled=parameterTooltip(check(optionName(key),required||current.enabled,on=>{optionWrite(key,{enabled:on});render();}),key);enabled.querySelector('input').disabled=required;parameterTooltip(enabled.querySelector('input'),key);row.append(enabled);
    const value=optionValueControl(key,current,(patch,rebuild=true)=>{optionWrite(key,patch);if(rebuild)render();else changed();});
    const allowed=argumentAllowed(key,current),parameter=allowed?check(current.param&&current.param!==optionParam(key,{})?'Argument ($'+current.param+')':'Argument',!!current.parameter,on=>{optionWrite(key,{parameter:on,param:optionParam(key,current)});render();}):el('span','fixed-option');
    if(allowed){parameter.querySelector('input').disabled=!current.enabled&&!required;parameter.querySelector('input').setAttribute('aria-label',optionName(key)+' as argument');parameterTooltip(parameter.querySelector('input'),key);}else parameter.setAttribute('aria-hidden','true');
    value.querySelectorAll('input,select,button').forEach(n=>{if(!current.enabled&&!required)n.disabled=true;});row.append(value,parameter);return row;
  }
  const wpQueryDocs='https://developer.wordpress.org/reference/classes/wp_query/';
  const wpTermDocs='https://developer.wordpress.org/reference/classes/wp_term_query/__construct/';
  const wpUserDocs='https://developer.wordpress.org/reference/classes/wp_user_query/prepare_query/';
  function settingHelp(topic,text,url){
    const wrap=el('div','setting-help');if(text)wrap.append(el('p','hint',text));
    const link=el('a','','WordPress reference ↗');link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.setAttribute('aria-label',topic+' — WordPress reference, opens in a new tab');wrap.append(link);return wrap;
  }
  function sourceDocs(){return state.source==='wp-users'?wpUserDocs:state.source==='wp-terms'?wpTermDocs:wpQueryDocs;}
  function advancedHelp(title){
    const post=['wp-query','main-query'].includes(state.source);
    const descriptions={
      'Selection':'Match exact post IDs, titles, slugs, or parent relationships. These restrictions combine with the other filters.',
      'Authors':'Match the authors assigned to posts. Include or exclude authors by their WordPress user IDs, or match an author’s URL slug.',
      'Search':post?'Search post titles, excerpts, and content. Search fields limits the columns searched; exact terms and phrase matching change how the text is compared.':'Choose the identity fields searched by the user Search text option.',
      'Pagination':'Choose a result page or skip results. An explicit offset takes precedence over page-based pagination.',
      'Post visibility and comments':'Filter by password protection, permission mode, or stored comment counts.',
      'Query execution':'These settings control caching, metadata loading, filters, or total counts. Most do not change which records match. Usually leave them unchecked unless you need to change WordPress defaults.',
      'Term selection':'Match term IDs, names, slugs, or the post IDs that terms are assigned to. A nonempty include list takes precedence over exclusions.',
      'Hierarchy':'Match term ancestry, direct descendants, or terms with no children. Hierarchy options depend on the taxonomy and may be ignored when multiple taxonomies are queried.',
      'Text matching':'Match part of a term’s name or description.',
      'User selection':'Include or exclude exact user IDs, logins, or URL slugs.',
      'Roles and capabilities':'Check stored user roles or capabilities, or require published posts. Required roles must all match; “Any” options accept at least one. These checks do not evaluate every permission calculated by plugins.',
      'Search fields':'Choose which identity fields are searched by Search text in the Query tab.'
    };
    const anchors={'Selection':'post-page-parameters','Authors':'author-parameters','Search':'search-parameters','Pagination':'pagination-parameters','Post visibility and comments':'password-parameters','Query execution':'caching-parameters'};
    return settingHelp(title,descriptions[title]||'',sourceDocs()+(post?'#'+(anchors[title]||'parameters'):'#parameters'));
  }
  function activeTaxonomyShortcuts(){
    if(!['wp-query','main-query'].includes(state.source))return [];
    return queryOptionGroups['wp-query'].tax.flatMap(([,keys])=>keys.split(' ')).filter(key=>optionState(key).enabled);
  }
  function savedTaxonomySettings(){
    const keys=activeTaxonomyShortcuts();if(!keys.length)return null;
    const section=el('section','card saved-taxonomy-settings');section.append(el('h2','','Saved category and tag settings'),el('p','hint','This query already uses these WordPress shortcuts. They are kept as saved. Add new conditions with the taxonomy filters above; both sets apply together.'));keys.forEach(key=>section.append(optionRow(key)));return section;
  }
  function activeDateParts(){
    if(!['wp-query','main-query'].includes(state.source))return [];
    return queryOptionGroups['wp-query'].dates.flatMap(([,keys])=>keys.split(' ')).filter(key=>optionState(key).enabled);
  }
  function savedDateSettings(){
    const keys=activeDateParts();if(!keys.length)return null;
    const section=el('section','card saved-date-settings');section.append(el('h2','','Saved date settings'),el('p','hint','This query already uses these publication-date arguments. They are kept as saved. Add new conditions with the date filters above; both sets apply together.'));keys.forEach(key=>section.append(optionRow(key)));return section;
  }
  function metaSettingKeys(){return queryOptionGroups[state.source==='main-query'?'wp-query':state.source].meta.flatMap(([,keys])=>keys.split(' '));}
  function metaSettings(){
    const section=el('section','card meta-settings');section.append(el('h2','','Single-field settings'),el('p','hint','Filter or sort by one meta key. Use the grouped filters above for combined conditions. Checked settings here also apply to the query.'));section.append(settingHelp('Meta comparisons and types','Comparisons test stored keys or values. Value type controls whether WordPress compares them as text, numbers, or dates.','https://developer.wordpress.org/reference/classes/wp_meta_query/__construct/#parameters'));metaSettingKeys().forEach(key=>section.append(optionRow(key)));return section;
  }
  function advancedGroups(){
    const source=state.source==='main-query'?'wp-query':state.source;
    const groups=Object.entries(queryOptionGroups[source]).filter(([tab])=>!['tax','dates','meta'].includes(tab)).flatMap(([tab,items])=>items.filter(([title])=>title!=='Query execution').map(([title,keys])=>({id:tab+'-'+title.toLowerCase().replace(/[^a-z]+/g,'-'),title,keys:keys.split(' ').filter(key=>key!=='blog_id'&&!['ignore_sticky_posts','fields','perm','comments_per_page','comment_status','ping_status','pad_counts','get','who'].includes(key))})));
    if(['wp-query','main-query'].includes(state.source)){
      const selection=groups.find(g=>g.title==='Selection');
      if(state.source==='wp-query'&&state.postType==='attachment')selection.keys=selection.keys.filter(k=>k!=='post_parent');
      else selection.keys.push('post_mime_type');
    }
    return groups;
  }
  function renderAdvancedOptions(panel){
    const groups=advancedGroups(),labels={'Post visibility and comments':'Visibility','Query execution':'Execution','Term selection':'Selection','Roles and capabilities':'Roles','Search fields':'Search','Text matching':'Text matching'};
    if(!groups.some(g=>g.id===activeAdvancedTab))activeAdvancedTab=groups[0].id;
    panel.append(el('p','hint','Choose which records appear and how they are ordered. Filters from every tab apply together.'));
    const list=el('div','query-tabs advanced-tabs');list.setAttribute('role','tablist');list.setAttribute('aria-label','Advanced query settings');
    const controls={},panels={};
    function activate(id,focus=false){activeAdvancedTab=id;for(const key of Object.keys(controls)){const selected=key===id;controls[key].setAttribute('aria-selected',String(selected));controls[key].tabIndex=selected?0:-1;panels[key].hidden=!selected;}if(focus)controls[id].focus({preventScroll:true});}
    for(const group of groups){
      const label=labels[group.title]||group.title,count=group.keys.filter(key=>optionState(key).enabled).length;
      const control=button(label,()=>activate(group.id,true),'query-tab');control.id='lfe-advanced-tab-'+group.id;control.dataset.advancedTab=group.id;control.setAttribute('role','tab');control.setAttribute('aria-controls','lfe-advanced-panel-'+group.id);
      if(count){control.append(el('span','tab-count',String(count)));control.setAttribute('aria-label',label+', '+count+' active settings');}
      const section=el('section','advanced-panel');section.id='lfe-advanced-panel-'+group.id;section.setAttribute('role','tabpanel');section.setAttribute('aria-labelledby',control.id);section.append(el('h2','',group.title));
      if(group.title==='Selection'&&state.source==='wp-query')section.append(el('p','hint','Additional content types are combined with the content type selected above.'));
      section.append(advancedHelp(group.title));group.keys.forEach(key=>section.append(optionRow(key)));
      controls[group.id]=control;panels[group.id]=section;list.append(control);
      control.addEventListener('keydown',event=>{const index=groups.findIndex(g=>g.id===group.id);let next;if(event.key==='ArrowRight')next=groups[(index+1)%groups.length].id;else if(event.key==='ArrowLeft')next=groups[(index-1+groups.length)%groups.length].id;else if(event.key==='Home')next=groups[0].id;else if(event.key==='End')next=groups.at(-1).id;if(next){event.preventDefault();event.stopPropagation();activate(next,true);}});
    }
    panel.append(list,...Object.values(panels));activate(activeAdvancedTab);
  }
  function renderSourceOptions(form,sourceRow){
    if(state.source==='wp-query'){
      sourceRow.append(field('Content type',select(content.postTypes.map(t=>[t.name,t.label]),state.postType,async value=>{
        const previous=state.postType;state.postType=value;const extra=state.advanced.find(row=>row.key==='post_type');if(extra&&Array.isArray(extra.value))extra.value=[value,...extra.value.filter(v=>v!==value&&v!==previous)];
        state.options.post_status={enabled:true,value:value==='attachment'?'inherit':'publish',parameter:false};state.attachmentMime='';state.attachmentParent={enabled:false,value:0,parameter:false};state.tax=[];state.meta=[];content=null;output=null;render();await loadContent();
      })));
    }
    const panels=createQueryTabs(form),base=el('section','card');base.append(el('h2','',state.source==='main-query'?'Archive and search results':state.source==='wp-users'?'WordPress users':state.source==='wp-terms'?'Taxonomy terms query':'Query options'));
    base.append(el('p','hint','Include an option to set a value. Make it an argument to reuse the loop with different values. Lists and grouped settings use fixed values.'));
    if(state.source==='main-query')base.append(el('p','hint','Leave options unchecked to inherit the archive or search query and its pagination. Preview in the matching template.'));
    const keys=state.source==='wp-users'?['number','orderby','order','offset','paged','role','search']:state.source==='wp-terms'?['taxonomy','number','orderby','order','offset','hide_empty','parent','search']:['posts_per_page','orderby','order','offset','post_status'];
    base.append(settingHelp('Query settings','',sourceDocs()+'#parameters'));
    keys.forEach(key=>base.append(optionRow(key,{required:state.source==='wp-terms'&&key==='taxonomy'})));
    base.append(el('p','hint',state.source==='wp-terms'?'Count 0 returns all terms. Parent 0 selects top-level terms.':state.source==='wp-users'?'Count 0 or -1 returns all users. Offset takes precedence over page-based pagination.':'Count -1 returns all posts. Offset can interfere with pagination.'));panels.query.append(base);
    if(state.source==='wp-query')base.append(check('Exclude current post',!!state.excludeCurrentPost,on=>{state.excludeCurrentPost=on;render();}),el('p','hint','For related content on a single post or page. Insert or apply this loop to connect the current post automatically. Preview uses fixed exclusions only.'));
    if(state.source==='wp-query'&&state.postType==='attachment')panels.query.append(attachmentOptions());
    if(!['wp-users','wp-terms'].includes(state.source)){panels.tax.append(filterGroup('tax'));const saved=savedTaxonomySettings();if(saved)panels.tax.append(saved);}
    panels.meta.append(filterGroup('meta'),metaSettings());if(panels.dates){panels.dates.append(dateOptions());const saved=savedDateSettings();if(saved)panels.dates.append(saved);}
    renderAdvancedOptions(panels.advanced);
    if(['wp-query','main-query'].includes(state.source)){const sticky=el('section','card');sticky.append(el('h2','','Sticky posts'),optionRow('ignore_sticky_posts'));panels.more.append(sticky,facetOptions(),relationshipOptions(),customQueryGuide());}
  }

  function filterStats(rows){return (rows||[]).reduce((total,row)=>{if(row.rules){const nested=filterStats(row.rules);total.groups+=1+nested.groups;total.rules+=nested.rules;}else total.rules++;return total;},{groups:0,rules:0});}
  function changed() {
    cancelNativeSave(false);refreshKey();previewSequence++;preview.replaceChildren();preview.removeAttribute('aria-busy');resultStatus.textContent='Preview is out of date. Run it to see matching content.';
    try {
      output = Q.compile(state); code.textContent = output.php;
      const terms = state.source === 'wp-terms', mainQuery = state.source === 'main-query';
      const type = state.source==='wp-users'?'users':terms ? (content.allTaxonomies.find(t => t.name === state.termOptions.taxonomy.value)?.label || 'terms') : content?.postTypes.find(t => t.name === state.postType)?.label || state.postType;
      const filterCount=filterStats(state.tax).rules+activeTaxonomyShortcuts().length+filterStats(state.meta).rules+filterStats(state.dates).rules+activeDateParts().length;
      const count = terms || state.source==='wp-users' ? output.args.number : output.args.posts_per_page;
      summary.textContent = mainQuery ? 'Current archive or search results · optional overrides' : (count === -1 || (terms && (!count || count === 0)) ? 'All' : count || 'Default number of') + ' ' + type.toLowerCase() + (terms ? ' · terms query' : ' · ' + filterCount + (filterCount === 1 ? ' filter' : ' filters'));
      if(mainQuery)resultStatus.textContent='Preview this loop in an archive or search template in Etch. Its results depend on the current page.';
      notify(apiLimitReason() || 'Query arguments are valid.');
    } catch (error) { output = null; code.textContent = ''; notify(error.message, true); }
    refreshActions();
  }
  let activeQueryTab='query',activeAdvancedTab='';
  function render() {
    closeSettingsPopover(false);const previous=shadow.activeElement?.dataset.focusKey||pendingFocus;pendingFocus=previous;const scroll=viewport?.scrollTop||0;const details=new Set([...shadow.querySelectorAll('details[open]')].map(n=>n.dataset.section||n.querySelector('summary')?.textContent));
    shell.replaceChildren();
    const header = el('header'); const brand = el('div', 'brand'); const mark=el('span','mark','∞');mark.setAttribute('aria-hidden','true');const title=el('h1','','Looper for Etch');title.id='lfe-title';brand.append(mark,title);if(config.version){const version=el('span','version-pill','v'+config.version);version.setAttribute('aria-label','Version '+config.version);brand.append(version);}
    header.append(brand, el('span', 'badge', window.etch?.loops ? 'Etch connected' : 'Query builder'));
    const settings=el('div','looper-settings'),settingsPanel=el('div','settings-panel');
    settingsPanel.id='lfe-settings-panel';settingsPanel.setAttribute('role','dialog');settingsPanel.setAttribute('aria-label','Looper settings');settingsPanel.setAttribute('popover','auto');
    const nativePopover=typeof settingsPanel.showPopover==='function';if(!nativePopover)settingsPanel.hidden=true;
    const settingsTitle=button('Settings',()=>{
      const rect=settingsTitle.getBoundingClientRect();settingsPanel.style.left=Math.max(8,Math.min(rect.right-340,window.innerWidth-348))+'px';settingsPanel.style.top=(rect.bottom+8)+'px';
      if(!nativePopover){settingsPanel.hidden=!settingsPanel.hidden;settingsTitle.setAttribute('aria-expanded',String(!settingsPanel.hidden));}
    },'quiet settings-trigger');
    settingsTitle.setAttribute('aria-haspopup','dialog');settingsTitle.setAttribute('aria-expanded','false');settingsTitle.setAttribute('aria-controls',settingsPanel.id);
    if(nativePopover){settingsTitle.setAttribute('popovertarget',settingsPanel.id);settingsTitle.setAttribute('popovertargetaction','toggle');settingsPanel.addEventListener('toggle',event=>settingsTitle.setAttribute('aria-expanded',String(event.newState==='open')));}
    closeSettingsPopover=focus=>{if(nativePopover){try{settingsPanel.hidePopover();}catch(_){}}else settingsPanel.hidden=true;settingsTitle.setAttribute('aria-expanded','false');if(focus)settingsTitle.focus();};
    settingsPanel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeSettingsPopover(true);}});
    function applyPreference(key,enabled){
      config[key]=enabled;const control=shell.querySelector('[data-preference="'+key+'"]');if(control)control.checked=enabled;
      if(key==='autocomplete')window.LooperAutocomplete?.setEnabled(enabled);
      if(key==='directActions'){cancelNativeSave(false);const actions=shell.querySelector('.actions'),identity=shell.querySelector('.identity');if(actions)actions.hidden=!enabled;if(identity)identity.hidden=!enabled;if(saveButton?.isConnected)refreshActions();}
    }
    function setting(label,key,onMessage,offMessage){
      const preference=check(label,config[key]===true,async enabled=>{
        const checkbox=preference.querySelector('input'),before=config[key]===true;pendingPreferences.add(key);checkbox.disabled=true;applyPreference(key,enabled);
        try{const result=await request('preferences',{[key]:enabled});applyPreference(key,result[key]===true);checkbox.checked=result[key]===true;notify(result[key]?onMessage:offMessage);}
        catch(error){applyPreference(key,before);checkbox.checked=before;notify(error.message,true);}
        finally{pendingPreferences.delete(key);checkbox.disabled=false;const current=shell.querySelector('[data-preference="'+key+'"]');if(current)current.disabled=false;}
      });const checkbox=preference.querySelector('input');checkbox.setAttribute('aria-label',label);checkbox.dataset.preference=key;checkbox.disabled=pendingPreferences.has(key);return preference;
    }
    settingsPanel.append(setting('HTML loop field suggestions','autocomplete','Loop field suggestions enabled in the HTML editor.','Loop field suggestions disabled.'),el('p','hint','Experimental · Suggests sample fields and keys()/values() when you type {loopAlias. in the HTML editor. Empty or missing fields may not appear. Steps aside when another autocomplete menu is open.'),setting('Enable direct Etch actions','directActions','Direct Etch actions enabled.',''),el('p','hint','Show save/update, insert, and apply controls. Use Etch Save when ready. A save-and-reload confirmation saves all current editor changes first. Settings are saved for your user on this site.'));
    settings.append(settingsTitle,settingsPanel);header.append(settings);
    startOverButton=button('Start over',startOver,'quiet');startOverButton.disabled=busy;header.append(startOverButton);
    if (!admin) header.append(button('Close', close, 'quiet'));
    shell.append(header);
    if (!content) { shell.append(el('p', 'loading', 'Reading site content…')); return; }
    const main = el('div', 'layout'), form = el('div', 'form'), aside = el('aside');viewport=main;aside.setAttribute('aria-label','Query output and preview');
    { // Saved-loop discovery works even before the editor API is ready.
      loopLoader=el('div','loop-loader');
      loopChooser=select([['','Choose an existing loop…']],selectedLoopId,v=>{selectedLoopId=v;refreshActions();});
      loadLoopButton=button('Load loop',loadExistingLoop);
      const retry=button('Refresh loops',()=>{loopContentCache.clear();loopChoicesSignature='';loadSavedLoops();});
      loopLoader.append(field('Load existing Etch loop',loopChooser),loadLoopButton,retry);
      loopLoaderHint=el('p','hint','Checking editable loops…');
      loopDiagnostics=el('details','loop-diagnostics');loopDiagnostics.hidden=true;
      form.append(loopLoader,loopLoaderHint,loopDiagnostics);
      loopChoicesSignature='';
    }
    migrateFormOptions();
    const identity=queryIdentity();
    form.append(identity);const sourceRow=el('div','source-selection');form.append(sourceRow);sourceRow.append(field('Loop source', select([['wp-query','Posts, media, and custom post types'], ['wp-terms','Taxonomy terms'], ['wp-users','WordPress users'], ['main-query','Main Query · archive and search']], state.source, v => {
      const wasMain=state.source==='main-query',keyMode=state.keyMode,previousKey=state.key,savedKey=state.savedKey;state.source = v;state.advanced=[];state.dates=[];state.tax=[];state.meta=[];state.relationship.enabled=false;
      if(v==='main-query'){Object.values(state.options).forEach(o=>o.enabled=false);state.name='Archive or search results';state.key='archiveSearch';}
      else if(wasMain){state=Object.assign(Q.initial(),{source:v,postType:state.postType});if(state.postType==='attachment')state.options.post_status.value='inherit';}
      if (['Recent posts','Taxonomy terms','WordPress users'].includes(state.name)) { state.name = v === 'wp-terms' ? 'Taxonomy terms' : v==='wp-users'?'WordPress users':'Recent posts'; state.key = v === 'wp-terms' ? 'taxonomyTerms' : v==='wp-users'?'wordpressUsers':'recentPosts'; }
      state.keyMode=keyMode;state.savedKey=savedKey;if(keyMode!=='auto')state.key=previousKey;refreshKey();render();loadContent();
    })));
    renderSourceOptions(form,sourceRow);
    const top = el('div', 'aside-title'); top.append(el('h2', '', 'Your loop'), el('span', 'live-dot', 'Live output')); aside.append(top);
    summary = el('p', 'query-summary'); aside.append(summary);
    const bar=el('div','code-bar');bar.append(el('span','code-label','PHP query arguments'),button('Copy for Etch',async event=>{
      const control=event.currentTarget;
      if(!output){notify('Fix the query before copying.',true);return;}
      const text=Q.etchBody(output);
      if(!text.trim()){notify('This query has no argument entries to copy. Use Main Query directly in Etch.');return;}
      shadow.querySelector('.etch-copy-fallback')?.remove();
      try{
        await navigator.clipboard.writeText(text);control.textContent='Copied';notify('Argument entries copied. Paste inside Etch’s existing $query_args array. Manual paste does not reload the editor.');
        setTimeout(()=>{if(control.isConnected)control.textContent='Copy for Etch';},1800);
      }catch(_){
        const fallback=el('textarea','etch-copy-fallback');fallback.value=text;fallback.readOnly=true;fallback.setAttribute('aria-label','Query entries to copy into Etch');bar.after(fallback);fallback.focus();fallback.select();notify('Copy the selected entries with your keyboard, then paste inside Etch’s existing $query_args array.');
      }
    }));
    code=el('pre','code');code.tabIndex=0;code.setAttribute('role','region'); code.setAttribute('aria-label', 'Generated query'); aside.append(bar, code, el('p','hint copy-instructions','Copy for Etch omits the $query_args assignment and outer brackets. Paste inside Etch’s existing array. Manual paste does not reload the editor.'));
    message = el('p', 'notice'); message.id='lfe-message';message.setAttribute('role', 'status');message.setAttribute('aria-atomic','true'); message.setAttribute('aria-live', 'polite'); aside.append(message);
    const actions = el('div', 'actions');actions.hidden=config.directActions!==true;
    actionSelect = select([['definition','Save query in Loop Manager'],['create','Insert new loop element'],['bind','Apply query to selected loop']], actionMode, v => { cancelNativeSave(false);actionMode = v; refreshActions(); });
    saveButton = button('Add query to Loop Manager', () => addToEtch(actionMode), 'primary');
    actionHint=el('p','hint');actionHint.id='lfe-action-hint';saveButton.setAttribute('aria-describedby',actionHint.id);
    actionSelect.setAttribute('aria-describedby',actionHint.id);
    nativeSaveConfirm=el('section','native-save-confirm');nativeSaveConfirm.hidden=true;nativeSaveConfirm.setAttribute('aria-label','Save and reload required');actions.append(field('Etch action',actionSelect),actionHint,saveButton,nativeSaveConfirm);aside.append(actions);
    const previewHeader = el('div', 'aside-title preview-header');previewButton=button('Run preview',runPreview);previewHeader.append(el('h2', '', 'Sample record'),previewButton); aside.append(previewHeader);
    resultStatus=el('p','hint');resultStatus.setAttribute('role','status');resultStatus.setAttribute('aria-atomic','true');aside.append(resultStatus);preview=el('div','preview');aside.append(preview);
    if (state.source === 'wp-terms') {
      const fields=el('details','field-reference');fields.append(el('summary','','Term fields for your loop'));
      ['{item.name}','{item.slug}','{item.description}','{item.permalink}','{item.count}'].forEach(f=>fields.append(el('div','field-key',f)));
      aside.append(fields);
    }
    main.append(form, aside); shell.append(main); changed();restoreFormFocus(previous,scroll,details);
  }
  async function startOver(){
    if(busy)return;editorGeneration++;loadSequence++;previewSequence++;
    const refresh=state.postType!=='post'||state.source!=='wp-query';
    state=freshDraft();refreshKey();selectedLoopId='';actionMode='definition';activeQueryTab='query';activeAdvancedTab='';loadingLoop=false;loopChoicesSignature='';pendingFocus=null;
    if(refresh)content=null;render();if(viewport)viewport.scrollTop=0;if(refresh)await loadContent();
    (config.directActions===true?[...shadow.querySelectorAll('label')].find(n=>n.querySelector('span')?.textContent==='Loop name')?.querySelector('input'):shell.querySelector('.source-selection select'))?.focus();
    if(message?.isConnected)notify('New query started. Saved Etch queries have not changed.');
  }
  function dateOptions(rows=state.dates||=[],holder=state,relationKey='dateRelation',depth=0,path=[]){
    const card=el('section',depth?'filter-group-content':'card'),head=el('div','aside-title'+(depth?' group-tools':''));if(!depth)head.append(el('h2','','Date filters'));head.append(button('Add date rule',()=>{rows.push({after:'',before:'',inclusive:true,column:state.source==='wp-users'?'user_registered':'post_date'});render();}));card.append(head);
    if(!depth)card.append(settingHelp('Date filters','Choose which date column to test, then set boundaries or date parts. Include boundary dates makes the comparison inclusive.','https://developer.wordpress.org/reference/classes/wp_date_query/__construct/#parameters'));
    if(!depth)card.append(el('p','hint','Choose calendar dates, or switch a boundary to Relative date. Calendar dates are saved as YYYY-MM-DD. Date filters combine with the other tabs.'));
    if(rows.length)card.append(field('Match date rules',select([['AND','All rules (AND)'],['OR','Any rule (OR)']],holder[relationKey]||'AND',v=>{holder[relationKey]=v;changed();})));
    rows.forEach((row,i)=>{const grouped=Array.isArray(row.rules),number=rows.slice(0,i+1).filter(item=>!!item.rules===grouped).length,groupPath=[...path,number],wrap=el('div',grouped?'rule nested-group':'rule'),head=el('div','aside-title');wrap.dataset.groupDepth=String(depth+1);const label=el(grouped?'h3':'span',grouped?'group-label':'rule-label',grouped?'Group '+groupPath.join('.'):'Rule '+number);if(grouped){label.id='lfe-date-group-'+groupPath.join('-');wrap.setAttribute('role','group');wrap.setAttribute('aria-labelledby',label.id);}head.append(label,button('Remove date '+(grouped?'group '+groupPath.join('.'):'rule '+number),()=>{rows.splice(i,1);render();},'quiet'));wrap.append(head);
      if(grouped)wrap.append(dateOptions(row.rules,row,'relation',depth+1,groupPath));else{
        const grid=el('div','grid');for(const[key,label]of [['after','After'],['before','Before']]){
          const v=row[key],structured=v&&typeof v==='object',mode=row[key+'Mode']||(structured?'structured':v&&!/^\d{4}-\d{2}-\d{2}$/.test(v)?'relative':'calendar'),box=el('div');
          box.append(field(label+' format',select([['calendar','Calendar date'],['relative','Relative date'],...(structured?[['structured','Saved date parts']]:[])],mode,value=>{row[key+'Mode']=value;row[key]='';render();})));
          if(mode==='structured')box.append(el('p','hint',JSON.stringify(v)+' · retained from the saved query. Choose Calendar date to replace it.'));
          else {const control=input(v||'',value=>{row[key]=value;changed();},mode==='calendar'?'date':'text');if(mode==='calendar'){control.min='1000-01-01';control.max='9999-12-31';}else control.placeholder='1 month ago';box.append(field(label,control),el('p','hint',mode==='calendar'?'Saved as YYYY-MM-DD.':'Example: 1 month ago or last Monday. Resolved when the query runs.'));}
          grid.append(box);
        }wrap.append(grid,check('Include boundary dates',row.inclusive!==false,v=>{row.inclusive=v;changed();}));
        const more=el('details');more.append(el('summary','','Date parts and comparison'));
        const columns=state.source==='wp-users'?['user_registered']:['post_date','post_date_gmt','post_modified','post_modified_gmt'];more.append(field('Date field',select(columns,row.column||columns[0],v=>{row.column=v;changed();})),field('Date comparison',select(['=','!=','>','>=','<','<=','IN','NOT IN','BETWEEN','NOT BETWEEN'],row.compare||'=',v=>{row.compare=v;changed();})));
        for(const key of ['year','month','week','day','dayofweek','dayofweek_iso','dayofyear','hour','minute','second'])more.append(field(key.replace(/_/g,' '),input(Array.isArray(row[key])?row[key].join(', '):row[key]??'',v=>{if(v.includes(','))row[key]=v.split(',').map(s=>Number(s.trim()));else row[key]=v;changed();})));
        if(row.name)more.append(field('Rule name',input(row.name,v=>{row.name=v;changed();})));wrap.append(more);
      }card.append(wrap);
    });if(depth<5)card.append(button('Add date group',()=>{rows.push({relation:'OR',rules:[]});render();}));return card;
  }
  function relationshipOptions(){
    const row=state.relationship||={enabled:false,id:'',direction:'from',value:0,parameter:false,param:'relatedID'},card=el('section','card');
    card.hidden=content.relationshipsAvailable===false&&!row.enabled;
    card.append(el('h2','','Meta Box relationship'),el('p','hint','Choose a registered relationship. The direction identifies the side containing the object ID you supply.'),check('Filter by a relationship',row.enabled,v=>{row.enabled=v;render();}));
    if(!row.enabled)return card;
    const relationships=content.relationships||[],selected=relationships.find(item=>item.id===row.id),manual=!relationships.length||row.manual||!!row.id&&!selected;
    if(relationships.length)card.append(field('Registered relationship',select([['','Choose a relationship…'],...relationships.map(item=>[item.id,item.id+' · '+item.from.label+' → '+item.to.label]),[':manual:','Enter an ID manually']],manual?':manual:':row.id,value=>{
      row.manual=value===':manual:';if(!row.manual){row.id=value;const relationship=relationships.find(item=>item.id===value);if(relationship){const from=relationship.from.postTypes.includes(state.postType),to=relationship.to.postTypes.includes(state.postType);if(from&&!to)row.direction='to';else if(to&&!from)row.direction='from';}}render();
    })));
    else card.append(el('p','hint',content.relationshipsAvailable?'No registered relationships were found. You can enter an ID manually.':'Meta Box Relationships is not available. Activate it to discover and run its registered relationships.'));
    if(content.relationshipsError)card.append(el('p','hint',content.relationshipsError));
    if(manual)card.append(field('Relationship ID',input(row.id,v=>{row.id=v;changed();})));
    if(selected&&!manual)card.append(el('p','hint','From: '+selected.from.label+'. To: '+selected.to.label+'.'));
    card.append(field('Supplied ID belongs to',select([['from','From side'+(selected?' · '+selected.from.label:'')],['to','To side'+(selected?' · '+selected.to.label:'')]],row.direction,v=>{row.direction=v;render();})),field('Related object ID',input(row.value,v=>{row.value=v;changed();},'number')),check('Related ID as argument',row.parameter,v=>{row.parameter=v;render();}));
    if(selected&&!manual){const result=selected[row.direction==='from'?'to':'from'];card.append(el('p','hint','Returns '+result.label+' connected to the supplied '+selected[row.direction].label+' ID.'));
      if(state.source!=='main-query'&&result.postTypes.length&&!result.postTypes.includes(state.postType))card.append(el('p','hint','The selected content type is '+state.postType+'. Choose a content type on the returned side of this relationship.'));
    }
    if(row.parameter)card.append(field('Argument name',input(row.param,v=>{row.param=v;changed();})),check('Require a value when calling this loop',row.required,v=>{row.required=v;changed();}));
    card.append(el('p','hint','This list contains Meta Box relationship IDs. ACF and ACPT relationship fields use their own field keys.'));return card;
  }

  function facetOptions(){
    const card=el('section','card facet-options');card.append(el('h2','','Third-party facets'));
    const grid=optionState('wp_grid_builder'),facet=optionState('facetwp');
    card.append(check('Use WP Grid Builder',grid.enabled,on=>{optionWrite('wp_grid_builder',on?{enabled:true,value:grid.value||'wpgb-content-posts',parameter:false}:{enabled:false});render();}));
    if(grid.enabled){
      const selector=input(grid.value,value=>{optionWrite('wp_grid_builder',{value,parameter:false});changed();});selector.placeholder='wpgb-content-posts';
      card.append(field('WP Grid Builder selector',selector),el('p','hint','Use the same selector as a CSS class on the direct parent of the loop and as the grid value in each WP Grid Builder facet shortcode. Enter it without a leading dot.'));
    }
    card.append(check('Enable FacetWP',facet.enabled&&[true,'true'].includes(facet.value),on=>{optionWrite('facetwp',on?{enabled:true,value:'true',parameter:false}:{enabled:false});render();}));
    card.append(el('p','hint','For FacetWP, add facetwp-template to the direct parent of the loop. Place facet shortcodes outside that wrapper. Enable only one FacetWP query per page.'));
    for(const[label,path]of [['WP Grid Builder setup','wp-grid-builder'],['FacetWP setup','facetwp']]){
      const link=el('a','',label);link.href='https://docs.etchwp.com/facets/third-party-facets/'+path;link.target='_blank';link.rel='noopener noreferrer';const help=el('p','hint');help.append(link);card.append(help);
    }
    return card;
  }

  function attachmentOptions(){
    const card=el('section','card');card.append(el('h2','','Media attachments'),el('p','hint','Queries Media Library files using Inherit status. Galleries stored as custom-field arrays are separate dynamic-data loops.'));
    card.append(optionRow('post_mime_type'),optionRow('post_parent'),el('p','hint','Use a parent ID to get files attached to that post. Parent 0 selects unattached files. A parent argument can be supplied from the current post or an outer loop.'));
    return card;
  }
  function createQueryTabs(form) {
    const specs=[['query','Query',0],...(['wp-users','wp-terms'].includes(state.source)?[]:[['tax','Taxonomies',state.tax.length+activeTaxonomyShortcuts().length]]),['meta','Meta data',state.meta.length+metaSettingKeys().filter(key=>optionState(key).enabled).length],...(state.source==='wp-terms'?[]:[['dates','Dates',(state.dates?.length||0)+activeDateParts().length]]),['advanced','Advanced',advancedGroups().reduce((total,g)=>total+g.keys.filter(key=>optionState(key).enabled).length,0)],...(['wp-query','main-query'].includes(state.source)?[['more','More',0]]:[])];
    if(!specs.some(([key])=>key===activeQueryTab))activeQueryTab='query';
    const panels={},controls={},list=el('div','query-tabs');list.style.setProperty('--lfe-tab-count',String(specs.length));list.setAttribute('role','tablist');list.setAttribute('aria-label','Query settings');
    if(activeQueryTab==='tax'&&!content.allTaxonomies.length)activeQueryTab='query';
    function activate(key,focus=false){
      activeQueryTab=key;
      for(const [id,control]of Object.entries(controls)){
        const selected=id===key;control.setAttribute('aria-selected',String(selected));control.tabIndex=selected?0:-1;panels[id].hidden=!selected;
      }
      if(focus)controls[key].focus({preventScroll:true});
    }
    for(const [key,label,count]of specs){
      const control=button(label,()=>activate(key,true),'query-tab');control.id='lfe-tab-'+key;control.dataset.tabKey=key;
      control.setAttribute('role','tab');control.setAttribute('aria-controls','lfe-panel-'+key);
      if(key==='tax'&&!content.allTaxonomies.length){control.disabled=true;control.setAttribute('aria-disabled','true');}
      if(['tax','meta','dates'].includes(key)&&count){const stats=filterStats(state[key]),parts=[];if(key==='meta')stats.rules+=metaSettingKeys().filter(key=>optionState(key).enabled).length;if(key==='tax')stats.rules+=activeTaxonomyShortcuts().length;if(key==='dates')stats.rules+=activeDateParts().length;if(stats.rules)parts.push(stats.rules+(stats.rules===1?' rule':' rules'));if(stats.groups)parts.push(stats.groups+(stats.groups===1?' group':' groups'));control.append(el('span','tab-count',String(stats.rules||stats.groups)));control.setAttribute('aria-label',label+', '+parts.join(', '));}
      if(key==='advanced'&&count){control.append(el('span','tab-count',String(count)));control.setAttribute('aria-label','Advanced, '+count+' active settings');}
      const panel=el('section','query-panel');panel.id='lfe-panel-'+key;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',control.id);
      controls[key]=control;panels[key]=panel;list.append(control);
      control.addEventListener('keydown',event=>{
        const keys=specs.map(([id])=>id).filter(id=>!controls[id].disabled),index=keys.indexOf(key);let next;
        if(event.key==='ArrowRight')next=keys[(index+1)%keys.length];
        else if(event.key==='ArrowLeft')next=keys[(index-1+keys.length)%keys.length];
        else if(event.key==='Home')next=keys[0];else if(event.key==='End')next=keys.at(-1);
        if(next){event.preventDefault();event.stopPropagation();activate(next,true);}
      });
    }
    form.append(list,el('p','tab-help',content.taxonomies.length?'Rules from every tab apply to this loop.':'This content type has no taxonomies. Rules from every tab apply to this loop.'));
    Object.values(panels).forEach(panel=>form.append(panel));activate(activeQueryTab);
    return panels;
  }
  function customQueryGuide(){const guide=el('details','card custom-guide');guide.append(el('summary','','Supported query types'),el('p','hint','Looper builds WordPress post, attachment, term, user, and inherited Main Query loops. Use Dates for date filters and More for third-party facets and Meta Box relationships. Queries that require custom PHP callbacks, SQL, or return only IDs or counts cannot be edited here. JSON and dynamic-data arrays stay in Etch.'));return guide;}
  function metaField(label, value, handler) {
    const id = 'lfe-meta-' + (++fieldSequence), n = input(value, handler); n.setAttribute('list', id);
    const wrap = field(label, n), list = el('datalist'); list.id = id;
    content.fields.forEach(f => { const o = el('option', '', f.label); o.value = f.key; list.append(o); }); wrap.append(list);
    return wrap;
  }
  function filterGroup(kind, rows=state[kind], holder=state, relationKey=kind+'Relation', depth=0, path=[]) {
    const taxonomy = kind === 'tax', card = el('section', depth?'filter-group-content':'card');
    const heading = el('div', 'aside-title'+(depth?' group-tools':'')); if(!depth)heading.append(el('h2', '', taxonomy ? 'Taxonomy filters' : 'Meta data filters'));heading.append(button(taxonomy ? '+ Taxonomy rule' : '+ Field rule', () => {
      if (rows.length >= 12) { notify('Use at most 12 filters per group.', true); return; }
      rows.push(taxonomy ? { taxonomy: content.taxonomies[0]?.name || '', terms: '', operator: 'IN', children: true } : { key: '', compare: '=', value: '', type: 'CHAR' }); render();
    })); card.append(heading);
    if(!depth)card.append(settingHelp(taxonomy?'Taxonomy filters':'Meta data filters',taxonomy?'Test whether content is assigned to the selected terms. IN matches any selected term; AND requires all. EXISTS checks for any assignment in that taxonomy.':'Test stored metadata keys and values. EXISTS checks whether a key is present, even if its value is empty; IN compares against a list.',taxonomy?wpQueryDocs+'#taxonomy-parameters':'https://developer.wordpress.org/reference/classes/wp_meta_query/__construct/#parameters'));
    if (!rows.length) card.append(el('p', 'muted', taxonomy ? 'Filter by categories, tags, or custom taxonomies.' : 'Filter by any stored meta key. Choose a known key or enter one manually.'));
    else {
      card.append(field('Match rules in this group', select([['AND','All rules (AND)'], ['OR','Any rule (OR)']], holder[relationKey]||'AND', v => { holder[relationKey] = v; changed(); })));
      rows.forEach((row, i) => {
        const grouped=Array.isArray(row.rules),number=rows.slice(0,i+1).filter(item=>!!item.rules===grouped).length,groupPath=[...path,number],label=grouped?'Group '+groupPath.join('.'):'Rule '+number;
        const rule=el('div',grouped?'rule nested-group':'rule'),title=el('div','aside-title');rule.dataset.groupDepth=String(depth+1);
        const name=el(grouped?'h3':'span',grouped?'group-label':'rule-label',label);if(grouped){name.id='lfe-'+kind+'-group-'+groupPath.join('-');rule.setAttribute('role','group');rule.setAttribute('aria-labelledby',name.id);}
        title.append(name,button('Remove '+(grouped?(taxonomy?'taxonomy':'meta')+' group '+groupPath.join('.'):(taxonomy?'taxonomy':'field')+' rule '+number),()=>{rows.splice(i,1);[...shadow.querySelectorAll('button')].find(n=>n.textContent===(taxonomy?'+ Taxonomy rule':'+ Field rule'))?.focus({preventScroll:true});render();},'quiet'));rule.append(title);
        if(grouped){rule.append(filterGroup(kind,row.rules,row,'relation',depth+1,groupPath));card.append(rule);return;}
        if(row.name)rule.append(field('Rule name',input(row.name,v=>{row.name=v;changed();})));
        if (taxonomy) {
          rule.append(field('Taxonomy', select([['','Choose taxonomy'], ...([...content.taxonomies,...content.allTaxonomies.filter(t=>!content.taxonomies.some(v=>v.name===t.name))]).map(t => [t.name,t.label])], row.taxonomy, v => { row.taxonomy = v; row.terms = ''; row.field='slug'; render(); })));
          rule.append(field('Operator', select(['IN','NOT IN','AND','EXISTS','NOT EXISTS'], row.operator, v => { row.operator = v; render(); })));
          rule.append(field('Term field',select(['slug','term_id','name','term_taxonomy_id'],row.field||'slug',v=>{row.field=v;row.terms='';render();})));
          if (!['EXISTS','NOT EXISTS'].includes(row.operator)) {
            rule.append(termPicker(row));
            rule.append(check('Include child terms', row.children, v => { row.children = v; changed(); }));
          }
        } else {
          rule.append(metaField('Field key', row.key, v => { row.key = v; changed(); }));
          const pair = el('div','grid'); pair.append(field('Compare', select(['=','!=','>','>=','<','<=','LIKE','NOT LIKE','IN','NOT IN','BETWEEN','NOT BETWEEN','EXISTS','NOT EXISTS','REGEXP','NOT REGEXP','RLIKE'], row.compare, v => { row.compare = v; render(); })), field('Value type', select(['CHAR','NUMERIC','DATE','DATETIME','DECIMAL','SIGNED','UNSIGNED','BINARY','TIME'], row.type, v => { row.type = v; changed(); }))); rule.append(pair);
          if (!['EXISTS','NOT EXISTS'].includes(row.compare)) rule.append(field('Value' + (['IN','NOT IN','BETWEEN','NOT BETWEEN'].includes(row.compare) ? ' · comma-separated' : ''), input(row.value, v => { row.value = v; changed(); })));
        }
        const settings=el('details');settings.append(el('summary','','Advanced rule settings'),field('Named rule',input(row.name||'',v=>{row.name=v||undefined;delete row.queryKey;changed();})));
        if(!taxonomy){settings.append(field('Meta key comparison',select(['','=','!=','IN','NOT IN','LIKE','NOT LIKE','REGEXP','NOT REGEXP','RLIKE','EXISTS','NOT EXISTS'],row.compare_key||'',v=>{row.compare_key=v;changed();})),field('Meta key cast',select(['','BINARY'],row.type_key||'',v=>{row.type_key=v;changed();})),field('Value cast or precision',input(row.type||'CHAR',v=>{row.type=v;changed();})));}
        rule.append(settings);card.append(rule);
      });
    }
    if(depth<5)card.append(button('Add '+(taxonomy?'taxonomy':'meta')+' group',()=>{rows.push({relation:'OR',rules:[]});render();}));
    if (!taxonomy && depth === 0) card.append(el('p','hint','NOT IN only matches posts where the meta key exists. To also include posts without that key, add a NOT EXISTS rule for the same key and set Match rules in this group to Any rule (OR).'));
    if (taxonomy && !content.allTaxonomies.length) card.append(el('p','hint','This content type has no visible taxonomies.'));
    if (!taxonomy && depth===0 && state.tax.length && state.meta.length) card.append(el('p','hint','Posts must match both the taxonomy group and the meta data group.'));
    return card;
  }
  function termPicker(row) {
    const picker = el('div', 'term-picker');
    const taxonomy = content.taxonomies.find(t => t.name === row.taxonomy);
    const termKey=term=>['term_id','term_taxonomy_id'].includes(row.field)?String(row.field==='term_taxonomy_id'?term.taxonomyId||term.id:term.id):row.field==='name'?term.name:term.slug;
    const known = new Map((taxonomy?.terms || []).map(t => [termKey(t), t]));
    const selected = el('div', 'term-selected'); selected.setAttribute('role','group');selected.setAttribute('aria-label', 'Selected terms');
    const search = input('', () => lookup(), 'search'); search.placeholder = 'Type a term name…';
    const results = el('div', 'term-results'); results.setAttribute('role','group');results.setAttribute('aria-label','Term search results');
    const status = el('p', 'hint'); status.setAttribute('role', 'status');status.setAttribute('aria-atomic','true');
    let timer, sequence = 0, choices = (taxonomy?.terms || []).slice(0, 20);
    const values = () => row.terms.split(',').map(s => s.trim()).filter(Boolean);
    function draw() {
      selected.replaceChildren();
      values().forEach(slug => {
        const name = known.get(slug)?.name || slug;
        const chip = button(name + ' ×', () => { row.terms=values().filter(v=>v!==slug).join(', ');draw();changed();search.focus({preventScroll:true});status.textContent=name+' removed.'; }, 'term-chip');
        chip.setAttribute('aria-label', 'Remove ' + name); selected.append(chip);
      });
      if (!values().length) selected.append(el('span', 'hint', 'No terms selected yet.'));
      results.replaceChildren();
      choices.slice(0,6).forEach(term => {
        known.set(termKey(term), term);
        const chosen = values().includes(termKey(term));
        const b = button((chosen ? '✓ ' : '+ ') + term.name, () => {
          row.terms=[...new Set([...values(),termKey(term)])].join(', ');draw();changed();search.focus({preventScroll:true});status.textContent=term.name+' selected.';
        }, 'term-choice');
        b.disabled = chosen; results.append(b);
      });
      if (!choices.length) results.append(el('p','hint','No matching terms. Try another name.'));
    }
    function lookup() {
      clearTimeout(timer); const current = ++sequence;
      status.textContent = 'Searching terms…';
      timer = setTimeout(async () => {
        try {
          const data = await request('terms?post_type=' + encodeURIComponent(state.postType) + '&taxonomy=' + encodeURIComponent(row.taxonomy) + '&search=' + encodeURIComponent(search.value));
          if (current !== sequence || !picker.isConnected) return;
          choices = data.terms; choices.forEach(t => known.set(termKey(t), t)); draw();
          status.textContent = data.limited||data.terms.length>6 ? 'First 6 matches shown. Type more to narrow the results.' : data.terms.length + (data.terms.length === 1 ? ' matching term.' : ' matching terms.');
        } catch (error) { if (current === sequence && picker.isConnected) { status.textContent = error.message; results.replaceChildren(); } }
      }, 250);
    }
    picker.append(selected, field('Find terms by name', search), results, status);
    status.textContent = 'Choose one or more terms. Up to 6 matches shown. Search checks the whole taxonomy.';
    const advanced = el('details', 'manual-terms'); advanced.append(el('summary', '', ['term_id','term_taxonomy_id'].includes(row.field)?'Enter term IDs manually':row.field==='name'?'Enter names manually':'Enter slugs manually'));
    const manual = input(row.terms, v => { row.terms = v; draw(); changed(); }); manual.placeholder = 'news, events';
    advanced.append(field(['term_id','term_taxonomy_id'].includes(row.field)?'Term IDs, separated by commas':row.field==='name'?'Term names, separated by commas':'Term slugs, separated by commas', manual)); picker.append(advanced);
    picker.addEventListener('click', () => { manual.value = row.terms; });
    draw(); return picker;
  }
  function apiLimitReason(){return output?.native.relationship&&content?.relationshipsAvailable===false?'This query requires Meta Box Relationships. Its relationship filter cannot run while that extension is unavailable.':'';}
  async function loadExistingLoop(){
    if(loadingLoop||!selectedLoopId)return;
    const before=JSON.stringify(state),generation=editorGeneration;
    loadingLoop=true;refreshActions();
    try{
      const loop=allLoops()[selectedLoopId];
      if(!loop)throw Error('This loop is no longer available. Choose another loop.');
      const next=Q.loadDefinition(loop);
      
      const discovered=await editableLoopContent(next);if(generation!==editorGeneration)return;
      if(JSON.stringify(state)!==before)throw Error('The form changed while the loop was loading. Load it again when you are ready to replace the form.');
      state={...next,keyMode:'saved',savedKey:next.key};content=discovered;actionMode='definition';activeQueryTab='query';activeAdvancedTab='';render();
      notify(apiLimitReason() || 'Loaded “'+state.name+'”. Edit the form, then use Update query in Loop Manager. Changing the key creates a separate definition.');
      (config.directActions===true?[...shadow.querySelectorAll('label')].find(n=>n.querySelector('span')?.textContent==='Loop name')?.querySelector('input'):shell.querySelector('.source-selection select'))?.focus();
    }catch(error){if(generation===editorGeneration)notify(error.message,true);}
    finally{if(generation===editorGeneration){loadingLoop=false;refreshActions();}}
  }
  async function editableLoopContent(next){
    let discovered;
    if(next.source===state.source&&next.postType===state.postType)discovered=content;
    else {
      if(!loopContentCache.has(next.source+':'+next.postType))loopContentCache.set(next.source+':'+next.postType,request('content?post_type='+encodeURIComponent(next.postType)+'&source='+encodeURIComponent(next.source)).catch(error=>{loopContentCache.delete(next.source+':'+next.postType);throw error;}));
      discovered=await loopContentCache.get(next.source+':'+next.postType);
    }
    if(next.source==='wp-query'&&!discovered.postTypes.some(t=>t.name===next.postType))throw Error('The post type is not available in Looper.');
    if(next.source==='wp-terms'&&!discovered.allTaxonomies.some(t=>t.name===next.termOptions.taxonomy.value))throw Error('The taxonomy is not available in Looper.');
    if(next.tax.some(r=>!r.rules&&!discovered.allTaxonomies.some(t=>t.name===r.taxonomy)))throw Error('A taxonomy is not available for this content type.');
    if(next.source==='wp-query'&&next.options.post_status.enabled&&next.options.post_status.value!=='any'&&!discovered.statuses.some(t=>t.name===next.options.post_status.value))throw Error('The post status is not available in Looper.');
    return discovered;
  }
  function allLoops(){
    try{
      const runtime=window.etch?.loops?.getAll?.();
      if(runtime&&typeof runtime==='object'){
        if(Object.keys(runtime).length)runtimeLoopsReady=true;
        if(runtimeLoopsReady)return runtime;
      }
    }catch(error){savedLoopsError='Etch’s editor query list could not be read: '+error.message;}
    return savedLoops;
  }
  async function loadSavedLoops(){
    if(savedLoopsLoading)return;
    savedLoopsLoading=true;savedLoopsError='';
    try{
      const data=await request('loops');
      if(data.migration?.errors?.length)savedLoopsError=data.migration.errors.length+' older queries could not be migrated safely. Their definitions were kept; inspect the migration backup and resolve these warnings before deactivating. '+data.migration.errors.map(item=>item.id+': '+item.message).join(' ');
      if(!data?.loops||typeof data.loops!=='object')throw Error('The saved query response was not valid.');
      savedLoops=data.loops;savedLoopsLoaded=true;
    }catch(error){savedLoopsError='Saved queries could not be loaded: '+error.message+' Check that Looper’s WordPress REST endpoint is accessible, then use Refresh loops.';}
    finally{savedLoopsLoading=false;loopChoicesSignature='';if(loopChooser?.isConnected)refreshActions();}
  }
  async function refreshLoopChooser(){
    if(!loopChooser)return;
    const entries=Object.entries(allLoops()).filter(([,loop])=>loop.config?.type!=='json');
    const signature=JSON.stringify([savedLoopsError,savedLoopsLoaded,savedLoopsLoading,entries.map(([id,loop])=>[id,loop.name,loop.key,['wp-query','wp-terms','wp-users','main-query'].includes(loop.config?.type)?loop.config:loop.config?.type])]);
    if(signature!==loopChoicesSignature){
      loopChoicesSignature=signature;checkingLoops=true;
      const chooser=loopChooser,loader=loopLoader,hint=loopLoaderHint;
      chooser.disabled=true;loadLoopButton.disabled=true;hint.textContent='Checking editable loops…';
      const checked=await Promise.all(entries.map(async entry=>{
        try {const next=Q.loadDefinition(entry[1]);
          if(next.source==='wp-query'&&!content.postTypes.some(t=>t.name===next.postType))throw Error('The post type is not available in Looper.');
          if(next.source==='wp-terms'&&!content.allTaxonomies.some(t=>t.name===next.termOptions.taxonomy.value))throw Error('The taxonomy is not available in Looper.');
          if(next.tax.some(rule=>!rule.rules&&!content.allTaxonomies.some(t=>t.name===rule.taxonomy)))throw Error('A taxonomy used by this query is not available in Looper.');
          if(next.postType===state.postType)await editableLoopContent(next);
          return {entry};}catch(error){return {entry,reason:error.message};}
      }));
      if(chooser!==loopChooser||signature!==loopChoicesSignature)return;
      const supported=checked.filter(item=>!item.reason).map(item=>item.entry),rejected=checked.filter(item=>item.reason),hidden=rejected.length;
      const choices=[['','Choose an existing loop…'],...supported.sort((a,b)=>(a[1].name||a[1].key).localeCompare(b[1].name||b[1].key)).map(([id,loop])=>[id,(loop.name||loop.key)+' · '+loop.key+(apiLimitReason(Q.compile(Q.loadDefinition(loop)))?' · Copy PHP to save':'')])];
      chooser.replaceChildren(...choices.map(([value,label])=>{const option=el('option','',label);option.value=value;return option;}));
      if(!supported.some(([id])=>id===selectedLoopId))selectedLoopId='';
      chooser.value=selectedLoopId;checkingLoops=false;loader.hidden=false;
      loopDiagnostics.replaceChildren(el('summary','',hidden+' queries cannot be edited here'));loopDiagnostics.hidden=!hidden;
      rejected.forEach(({entry:[id,loop],reason})=>loopDiagnostics.append(el('p','hint',(loop.name||loop.key||id)+': '+reason)));
      hint.textContent=(savedLoopsError?savedLoopsError+' ':savedLoopsLoading?'Reading saved queries… ':'')+(supported.length?'Only supported WordPress queries are listed. JSON data loops are omitted. Loading changes this form only.':'No existing loops can be edited in Looper.')+(hidden?' '+hidden+' '+(hidden===1?'loop is':'loops are')+' hidden because their source, query options, or content are unsupported. Edit those in Etch’s Loop Manager.':'');
    }
    loopChooser.disabled=busy||loadingLoop||checkingLoops||loopChooser.options.length<2;
    loadLoopButton.disabled=busy||loadingLoop||checkingLoops||!loopChooser.value;loadLoopButton.textContent=loadingLoop?'Loading…':'Load loop';
  }
  const stable=(value,parent='')=>value&&typeof value==='object'?(parent==='orderby'&&!Array.isArray(value)?Object.entries(value):Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key],key)]))):value;
  const equal = (a,b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
  function sameDefinition(a,b){if(a.key!==b.key||a.name!==b.name||!!a.global!==!!b.global||a.config?.type!==b.config?.type)return false;try{return equal(Q.compile(Q.loadDefinition(a)).native,Q.compile(Q.loadDefinition(b)).native);}catch(_){return equal(a,b);}}
  function currentDefinition(result=output) {
    const args=Q.apiArgs(result);
    return {key:state.key,name:state.name.trim(),global:state.global,config:{type:result.type,args}};
  }
  function matchingLoop(api) {
    return Object.entries(allLoops()).find(([,loop])=>loop.key===state.key);
  }
  function selectedLoopProblem(api,block){
    if(block?.type!=='etch/loop')return 'Close Looper, select the exact loop element in Etch’s Structure panel or canvas, then reopen Looper.';
    if(block.target)return 'The selected loop uses dynamic data. Apply supports WP Query, WP Terms, WP Users, and Main Query loops, not dynamic-data loops.';
    if(block.loopId){
      const type=api.loops.getAll()[block.loopId]?.config?.type;
      if(!['wp-query','wp-terms','wp-users','main-query'].includes(type))return 'The selected loop uses '+(type==='json'?'JSON':type==='main-query'?'Main Query':'an unsupported source')+'. Apply supports WP Query, WP Terms, WP Users, and Main Query loops.';
    }
    return '';
  }
  function refreshActions() {
    refreshKey();refreshLoopChooser();
    previewButton.disabled=state.source==='main-query';if(startOverButton)startOverButton.disabled=busy;
    const api=window.etch;
    let existing=null,selected=null;
    try {existing=matchingLoop(api);const id=api?.blocks?.getSelectedId();if(id)selected=api.blocks.getJson(id);}catch(_){}
    const selectionProblem=selectedLoopProblem(api,selected);
    let runtimeMissing=false;try{runtimeMissing=!!existing&&!Object.hasOwn(api?.loops?.getAll?.()||{},existing[0]);}catch(_){runtimeMissing=true;}
    const same=!!(existing&&output&&sameDefinition({...existing[1],...currentDefinition()},existing[1]));
    const keyPending=state.keyMode==='auto'&&!savedLoopsLoaded&&!runtimeLoopsReady;
    const enabled=config.directActions===true&&!!output&&!keyPending&&!apiLimitReason()&&!busy&&!loadingLoop&&typeof api?.saveAsync==='function'&&api.environment?.capabilities?.loops!==false;
    const labels={definition:existing?(same?'Query already in Loop Manager':'Update query in Loop Manager'):'Add query to Loop Manager',create:'Insert loop element',bind:'Apply to selected loop'};
    saveButton.textContent=busy?'Working…':labels[actionMode];
    saveButton.disabled=!!nativeSaveOperation||!enabled||runtimeMissing||(actionMode==='definition'&&same)||(actionMode==='create'&&typeof api?.blocks?.create!=='function')||(actionMode==='bind'&&(!!selectionProblem||typeof api?.loops?.setForBlock!=='function'));
    actionSelect.disabled=busy||loadingLoop;
    const help={definition:'Adds or updates the query in Etch’s Loop Manager. It does not add content to the page.'+(state.excludeCurrentPost?' To exclude the current post, use Insert loop element or Apply to selected loop, or set the loop argument $exclude to this.id in Etch.':''),create:'Adds a new loop to the page with starter title and link content, using this query.',bind:'Applies to the exact loop element selected in Etch, including an inner or outer loop. Its content, variable names, and argument overrides are kept. Supports WP Query, WP Terms, WP Users, and Main Query, not JSON.'};
    let detail=help[actionMode];if(keyPending)detail+=' Checking existing query keys before creating a new one. If discovery fails, use Refresh loops.';
    if(existing)detail+=(same?' The existing definition will be reused.':' This key already exists. Updating it changes every loop that uses this definition.');
    if(actionMode==='definition'&&same)detail='This query is already in the Loop Manager. Choose Insert new loop element or Apply query to selected loop to use it.';
    if(actionMode==='bind'){
      const name=selected?.context?.name||api?.loops?.getAll?.()[selected?.loopId]?.name;
      if(name)detail+=' Selected: '+name+'.';
      if(selectionProblem)detail+=' '+selectionProblem;
    }
    if(!api?.loops)detail='The Etch editing API is not available in this editor. You can still load saved queries, preview, and copy PHP. Update Etch to enable direct save and insertion.';
    if(runtimeMissing&&api?.loops)detail+=' This query has been found in WordPress, but Etch has not loaded it into this editor yet. Save any editor changes and reload Etch before updating it.';
    actionHint.textContent=(apiLimitReason()||detail)+' Use Etch Save to keep editor changes. Some settings require confirmation to save and reload. Copy for Etch lets you paste manually without reloading.';
  }
  const pendingActionKey='looper-native-action:'+location.href;
  const loopBinding=block=>Object.fromEntries(['type','loopId','target','itemId','indexId','loopParams'].filter(key=>Object.hasOwn(block||{},key)).map(key=>[key,block[key]]));
  function insertOrBind(api,mode,loopId,type,name,selected,binding){
    const currentPost=type==='wp-query'&&api.loops.getAll?.()[loopId]?.config?.args?.post__not_in?.includes(Q.currentPostParam);
    const params={...(binding?.loopParams||{})};if(currentPost)params['$exclude']='this.id';
    if(mode==='bind'){
      const current=api.blocks.getJson(selected);
      if(!current||!equal(loopBinding(current),binding))throw Error('The selected element changed. Select the intended loop and apply the saved query again.');
      const problem=selectedLoopProblem(api,current);if(problem)throw Error(problem);
      api.loops.setForBlock(selected,{loopId,target:'',itemId:binding.itemId||'item',indexId:binding.indexId||'index',loopParams:params});
    }
    if(mode==='create'){
      const text={type:'etch/text',version:1,context:{},children:[],text:type==='wp-users'?'{item.displayName}':type==='wp-terms'?'{item.name}':'{item.title}'};
      const id=api.blocks.create({type:'etch/loop',version:1,context:{name},children:[{type:'etch/element',version:1,context:{name:'Loop item'},tag:type==='wp-terms'?'div':'article',attributes:{},children:[{type:'etch/element',version:1,context:{},tag:'h2',attributes:{},children:[{type:'etch/element',version:1,context:{},tag:'a',attributes:{href:type==='wp-users'?'{item.userUrl}':type==='wp-terms'?'{item.permalink}':'{item.permalink.relative}'},children:[text]}]}]}],itemId:'item',indexId:'index',loopId,...(currentPost?{loopParams:params}:{})},null);
      api.blocks.select(id);
    }
  }
  function clearContinuation(){try{sessionStorage.removeItem(pendingActionKey);}catch(_){}}
  function cancelNativeSave(focus=false){nativeSaveOperation=null;if(nativeSaveConfirm){nativeSaveConfirm.hidden=true;nativeSaveConfirm.replaceChildren();}if(focus){refreshActions();notify('Cancelled. No editor changes were saved or reloaded.');saveButton.focus();}}
  function offerNativeSave(operation){
    nativeSaveOperation=operation;nativeSaveConfirm.hidden=false;
    const accept=button('Save changes and reload',()=>saveNativeQuery(operation),'primary');
    nativeSaveConfirm.replaceChildren(el('h3','','Save and reload required'),el('p','hint','Etch’s public add/update API cannot safely save every setting in this definition. Looper can save it directly, then reload to refresh Etch’s query list. This saves all current editor changes first. Continue?'),el('p','hint','To avoid reloading, cancel and use Copy for Etch. Paste the copied entries inside Etch’s existing $query_args array in Loop Manager. Manual paste does not require a reload.'),accept,button('Cancel',()=>cancelNativeSave(true)));
    refreshActions();notify('This query requires a reload. Review the save confirmation below.');accept.focus();
  }
  async function addToEtch(mode) {
    const api=window.etch;
    try {
      if(busy)return;if(config.directActions!==true)throw Error('Enable direct Etch actions in Settings before saving, inserting, or applying a query.');cancelNativeSave(false);refreshKey();
      const result=Q.compile(state);
      if(apiLimitReason())throw Error(apiLimitReason());
      if(!state.name.trim())throw Error('Enter a name and a key starting with a letter.');
      const retainedKey=state.savedKey===state.key;
      if(!(retainedKey?/^[a-zA-Z][a-zA-Z0-9_-]*$/:/^[a-zA-Z][a-zA-Z0-9_]*$/).test(state.key))throw Error('Use a camelCase loop key starting with a letter, such as newQuery2. Existing keys can be retained by loading their saved query.');
      let selected=null,binding=null;
      if(mode==='bind'){
        selected=api.blocks.getSelectedId();const block=selected&&api.blocks.getJson(selected);
        const problem=selectedLoopProblem(api,block);if(problem)throw Error(problem);binding=loopBinding(block);
      }
      const draft=currentDefinition(result),existing=matchingLoop(api),original=existing?existing[1]:null;
      const definition={...(original||{}),...draft,config:{...(original?.config||{}),...draft.config}};
      const before=api.loops.getAll(),editing=!existing||!sameDefinition(definition,original);let id=existing?.[0],created=false;
      try{
        // Preserve future/third-party definition properties through native storage.
        if(editing&&original&&(Object.keys(original).some(key=>!['key','name','global','config'].includes(key))||Object.keys(original.config||{}).some(key=>!['type','args'].includes(key))))throw Error('This definition contains additional saved properties.');
        if(!existing){id=api.loops.add(definition);created=true;}
        else if(editing)api.loops.update(id,definition);
        if(!equal(api.loops.getAll()[id],editing?definition:original))throw Error('Etch changed the query settings.');
      }catch(error){
        if(!equal(api.loops.getAll(),before)){
          try{if(created&&id)api.loops.delete(id);else if(existing)api.loops.update(id,original);}catch(_){}
          if(!equal(api.loops.getAll(),before))throw Error('Etch changed the query settings and they could not be restored. Reload the editor without saving before trying again.');
        }
        offerNativeSave({mode,id:existing?.[0]||'looper'+crypto.randomUUID().replace(/-/g,''),definition,draft,expected:original,type:result.type,name:definition.name,selected,binding});return;
      }
      state.savedKey=state.key;if(state.keyMode==='auto')state.keyMode='saved';
      try{insertOrBind(api,mode,id,result.type,definition.name,selected,binding);}
      catch(error){throw Error('The query is in the editor, but the element action failed: '+error.message+' Review it before using Etch Save.');}
      notify((mode==='create'?'Loop element inserted':mode==='bind'?'Query applied to the selected loop':existing?'Query updated in Loop Manager':'Query added to Loop Manager')+'. Use Etch Save to keep these changes.');refreshActions();
    }catch(error){notify(error.message,true);refreshActions();}
  }
  async function saveNativeQuery(operation){
    const api=window.etch;let locked=[],editorSaved=false;
    try{
      if(busy||nativeSaveOperation!==operation)return;
      if(!equal(currentDefinition(),operation.draft))throw Error('The form changed. Review the query and choose the action again.');
      if(operation.mode==='bind'&&(api.blocks.getSelectedId()!==operation.selected||!equal(loopBinding(api.blocks.getJson(operation.selected)),operation.binding)))throw Error('The selected loop changed. Select the intended element and apply the query again.');
      const {mode,id,type,name,selected,binding}=operation;
      const pending={mode,id,type,name,selected,binding,expires:Date.now()+120000};
      sessionStorage.setItem(pendingActionKey,JSON.stringify(pending));clearContinuation();
      cancelNativeSave(false);busy=true;refreshActions();locked=[...shell.querySelectorAll('input,select,button')].filter(node=>node.textContent!=='Close').map(node=>[node,node.disabled]);locked.forEach(([node])=>{node.disabled=true;});notify('Saving Etch editor changes before saving the native query…');
      await api.saveAsync();editorSaved=true;
      const response=await request('native-query',{id,definition:operation.definition,expected:operation.expected});
      if(response.id!==id||!equal(response.definition,operation.definition))throw Error('The native query save could not be verified.');
      sessionStorage.setItem(pendingActionKey,JSON.stringify(pending));notify('Native query saved. Reloading the editor…');location.reload();
    }catch(error){clearContinuation();notify(error.message+(editorSaved?' Current Etch editor changes were saved. Refresh the editor before trying again.':''),true);}
    finally{locked.forEach(([node,disabled])=>{node.disabled=disabled;});busy=false;refreshActions();}
  }
  function resumeNativeAction(){
    let pending;try{pending=JSON.parse(sessionStorage.getItem(pendingActionKey)||'null');sessionStorage.removeItem(pendingActionKey);}catch(_){return;}
    if(!pending||!Number.isFinite(pending.expires)||pending.expires<Date.now()||pending.expires>Date.now()+120000||!['definition','create','bind'].includes(pending.mode)||typeof pending.id!=='string')return;
    let attempts=0;const timer=setInterval(()=>{
      const api=window.etch,loop=api?.loops?.getAll?.()[pending.id];
      if(!loop){if(++attempts<120)return;clearInterval(timer);open();notify('The native query was saved, but Etch has not loaded it. Refresh before inserting or applying it.',true);return;}
      clearInterval(timer);open();
      try{
        insertOrBind(api,pending.mode,pending.id,pending.type,pending.name,pending.selected,pending.binding);
        notify(pending.mode==='definition'?'Native query saved in Etch’s Loop Manager. It works with Looper deactivated.':'Native query saved. '+(pending.mode==='create'?'Loop element inserted.':'Query applied to the selected loop.')+' Review the element, then use Etch Save.');
      }catch(error){notify('The query was saved. '+error.message,true);}
    },250);
  }
  function sampleTree(sample){
    const wrap=el('section','sample-data');wrap.append(el('h3','','Dynamic fields'),el('p','hint','Copy a key to use it inside this loop. Uses item as the loop variable; replace it if your loop uses another name. Expand objects and arrays to see nested values.'));
    const status=el('p','hint');status.setAttribute('role','status');status.setAttribute('aria-atomic','true');
    const body=el('div','sample-fields');const search=input('',()=>draw(), 'search');search.placeholder='Find a field or path';wrap.append(field('Find a dynamic field',search),status,body);
    const pathKey=(parent,key,array)=>array&&/^\d+$/.test(key)?parent+'['+key+']':/^[a-zA-Z_]\w*$/.test(key)?parent+'.'+key:parent+'['+JSON.stringify(key)+']';
    const copyKey=path=>{const text='{'+path+'}',b=button(text,async()=>{try{await navigator.clipboard.writeText(text);status.textContent='Copied '+text;}catch(_){const fallback=input(text,()=>{});fallback.readOnly=true;status.replaceChildren(el('span','','Select and copy this key: '),fallback);fallback.focus();fallback.select();}},'dynamic-key');b.setAttribute('aria-label','Copy '+text);return b;};
    function node(value,path,depth){
      const row=el('div','sample-node');if(value!==null&&typeof value==='object'){
        const entries=Object.entries(value),details=el('details'),summary=el('summary','',path.replace(/^item\.?/,'')+' · '+(Array.isArray(value)?entries.length+' items':entries.length+' fields'));details.append(summary,copyKey(path));if(!Array.isArray(value)){const modifiers=el('div','sample-modifiers');modifiers.append(el('span','hint','Object modifiers: '),copyKey(path+'.keys()'),copyKey(path+'.values()'));modifiers.querySelectorAll('button')[0].title='Copy an expression that returns this object’s field names as an array.';modifiers.querySelectorAll('button')[1].title='Copy an expression that returns this object’s field values as an array.';details.append(modifiers);}let drawn=false;
        details.addEventListener('toggle',()=>{if(!details.open||drawn)return;drawn=true;if(depth>12){details.append(el('p','hint','Deeper fields can be accessed using this parent path.'));return;}for(const[key,child]of entries)details.append(node(child,pathKey(path,key,Array.isArray(value)),depth+1));});row.append(details);
      }else{row.append(copyKey(path),el('span','sample-value',value===null?'null':String(value)===''?'(empty)':String(value).slice(0,180)));}return row;
    }
    function draw(){body.replaceChildren();const query=search.value.toLowerCase().trim();if(!query){for(const[key,v]of Object.entries(sample))body.append(node(v,pathKey('item',key,Array.isArray(sample)),0));status.textContent='One sample record. Select a key to copy it.';return;}let found=0,visited=0;const walk=(value,path,depth)=>{if(depth>12||++visited>10000)return;if(path.toLowerCase().includes(query)&&found<100){body.append(node(value,path,depth));found++;return;}if(value&&typeof value==='object')for(const[key,v]of Object.entries(value))walk(v,pathKey(path,key,Array.isArray(value)),depth+1);};walk(sample,'item',0);status.textContent=found+' matching fields'+(found===100?' shown. Refine your search for more.':'.');}
    draw();return wrap;
  }

  function emptyPreview(result){
    const wrap=el('section','empty-preview'),args=result.args;wrap.append(el('h3','','No matching content'),el('p','hint','Nothing matched the settings below. Preview uses the defaults in this form. Arguments supplied when the loop is used may produce different results.'));
    const valueText=value=>value===null?'Not set':typeof value==='boolean'?(value?'Yes':'No'):Array.isArray(value)?(value.map(valueText).join(', ')||'(empty list)'):value&&typeof value==='object'?Object.entries(value).map(([k,v])=>k+': '+valueText(v)).join('; '):String(value)===''?'(empty)':String(value);
    const source=result.type==='main-query'?'wp-query':result.type,catalog=Q.catalog[source]||{},labels={posts_per_page:'Count',number:'Count',post_type:'Content type',post_status:'Status',orderby:'Sort by',order:'Sort order',offset:'Offset',paged:'Page',s:'Search text',relationship:'Relationship'};
    const label=key=>labels[key]||catalog[key]?.label||key.replace(/_/g,' ');
    const display=(key,value)=>{if(key==='post_type')return (Array.isArray(value)?value:[value]).map(v=>content.postTypes.find(t=>t.name===v)?.label||v).join(', ');if(key==='post_status')return (Array.isArray(value)?value:[value]).map(v=>content.statuses.find(t=>t.name===v)?.label||v).join(', ');if(key==='taxonomy')return (Array.isArray(value)?value:[value]).map(v=>content.allTaxonomies.find(t=>t.name===v)?.label||v).join(', ');return valueText(value);};
    const omitted=new Set(['tax_query','meta_query','date_query','cache_results','no_found_rows','count_total','update_post_meta_cache','update_post_term_cache','update_term_meta_cache','update_menu_item_cache','lazy_load_term_meta','cache_domain','ignore_sticky_posts','suppress_filters']);
    wrap.append(el('h4','','Settings used'));const settings=el('dl','preview-settings');for(const[key,value]of Object.entries(args)){if(omitted.has(key))continue;settings.append(el('dt','',label(key)),el('dd','',display(key,value)));}wrap.append(settings);
    function groupList(group,kind,depth=0){
      const list=el('ul','preview-filter-list'),rules=Object.entries(group||{}).filter(([key])=>key!=='relation');
      for(const[,rule]of rules){const item=el('li');if(rule&&typeof rule==='object'&&(rule.relation||!('key'in rule)&&kind==='meta'||!('taxonomy'in rule)&&kind==='tax'||kind==='date'&&Object.keys(rule).some(k=>/^\d+$/.test(k)))){item.append(el('span','filter-relation',(rule.relation||'AND')==='OR'?'Match any (OR)':'Match all (AND)'));if(depth<8)item.append(groupList(rule,kind,depth+1));}
        else if(kind==='meta'){const compares={'=':'equals','!=':'does not equal','IN':'is one of','NOT IN':'is not one of','EXISTS':'is present','NOT EXISTS':'is missing','LIKE':'contains','NOT LIKE':'does not contain','BETWEEN':'is between','NOT BETWEEN':'is outside'};item.textContent=valueText(rule.key)+' '+(compares[rule.compare||'=']||rule.compare)+(Object.hasOwn(rule,'value')?' '+valueText(rule.value):'');}
        else if(kind==='tax'){const tax=content.allTaxonomies.find(t=>t.name===rule.taxonomy)?.label||rule.taxonomy,operators={IN:'matches any of',AND:'matches all of','NOT IN':'excludes',EXISTS:'has a term','NOT EXISTS':'has no terms'};item.textContent=tax+' '+(operators[rule.operator||'IN']||rule.operator)+(rule.terms?.length?' '+valueText(rule.terms):'');}
        else item.textContent=Object.entries(rule).map(([k,v])=>(k==='after'?'After':k==='before'?'Before':k==='inclusive'?'Include boundaries':k==='column'?'Date field':k)+' '+valueText(v)).join(' · ');
        list.append(item);
      }return list;
    }
    for(const[kind,key,title]of [['tax','tax_query','Taxonomy filters'],['meta','meta_query','Meta data filters'],['date','date_query','Date filters']])if(args[key]){wrap.append(el('h4','',title+' · '+((args[key].relation||'AND')==='OR'?'match any (OR)':'match all (AND)')),groupList(args[key],kind));}
    const defaults=[];function collect(native,literal,path=[]){if(typeof native==='string'){try{const parsed=Q.literal(native);if(parsed.parameter)defaults.push({name:parsed.param,key:path[0],value:literal,required:parsed.required});}catch(_){}}else if(native&&typeof native==='object')for(const[k,v]of Object.entries(native))collect(v,literal?.[k],[...path,k]);}collect(result.native,args);
    if(defaults.length){wrap.append(el('h4','','Argument defaults used'));const values=el('dl','preview-settings'),seen=new Set();for(const item of defaults){const signature=JSON.stringify(item);if(seen.has(signature))continue;seen.add(signature);values.append(el('dt','',label(item.key)+' ($'+item.name+')'),el('dd','',display(item.key,item.value)+(item.required?' · sample value; required when used':'')));}wrap.append(values);}
    const hints=el('ul','preview-suggestions');hints.append(el('li','','Check the content type and status, then broaden one filter at a time.'));
    if(Number(args.offset)>0)hints.append(el('li','','Offset skips '+args.offset+' results. Try 0 to check the first matching record.'));
    if(Number(args.paged)>1||Number(args.page)>1)hints.append(el('li','','Try page 1 to check whether earlier results match.'));
    if(result.type==='wp-terms'&&args.hide_empty)hints.append(el('li','','Hide empty terms is enabled. Include empty terms to check terms without assigned content.'));
    if(args.post_type==='attachment'&&!(Array.isArray(args.post_status)?args.post_status:[args.post_status]).includes('inherit'))hints.append(el('li','','Media attachments normally use Inherit status.'));
    if(args.relationship&&(args.relationship.from===0||args.relationship.to===0))hints.append(el('li','','The related object ID is 0. Try the ID of an actual connected record.'));
    wrap.append(el('h4','','Things to check'),hints);return wrap;
  }

  async function runPreview() {
    try {
      if(state.source==='main-query')throw Error('Preview Main Query in an archive or search template in Etch.');
      if (!output) throw Error('Fix the query before previewing.');
      if(output.native.relationship&&content.relationshipsAvailable===false)throw Error(apiLimitReason());
      const sequence = ++previewSequence,result=output; preview.replaceChildren();preview.setAttribute('aria-busy','true');resultStatus.textContent='Running query…';
      const data = await request('preview', { type: output.type, args: output.args, sample:true }); if (sequence !== previewSequence) return;
      preview.setAttribute('aria-busy','false');resultStatus.textContent=data.posts.length?'One sample record · Uses argument defaults.':'No matching sample record. Uses argument defaults.';
      if (!data.posts.length) preview.append(emptyPreview(result));
      if(data.sample)preview.append(sampleTree(data.sample));else if(data.sampleUnavailable)preview.append(el('p','hint',data.sampleUnavailable));
      data.posts.forEach(post => { const row = el('div','result'); row.append(el('strong','',post.title),el('span','muted',post.detail || '#' + post.id + ' · ' + post.status)); preview.append(row); });
    } catch (error) { preview.setAttribute('aria-busy','false');resultStatus.textContent=error.message;preview.replaceChildren(); }
  }
  async function loadContent() {
    const sequence = ++loadSequence;
    try {
      const data = await request('content?post_type=' + encodeURIComponent(state.postType)+'&source='+encodeURIComponent(state.source));
      if (sequence !== loadSequence) return; content = data; render();
    } catch (error) {
      if (sequence !== loadSequence) return;
      shell.replaceChildren(el('h1','','Looper for Etch'),el('p','error',error.message),button('Retry',loadContent));
    }
  }
  // Drafts live only in this editor session. Discard legacy persisted drafts.
  try{localStorage.removeItem('looper-for-etch:'+location.origin);}catch(_){}
  window.looperForEtch = { open, close }; render(); loadContent();loadSavedLoops();resumeNativeAction();
  setInterval(() => { if (!host.hidden && content && saveButton) refreshActions(); }, 1000);
})();
