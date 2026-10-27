/* Optional builder-only loop field suggestions. No query or document mutations until selection. */
((root)=>{
  'use strict';
  const blocked=new Set(['__proto__','prototype','constructor']);
  const own=(object,key)=>object!=null&&Object.hasOwn(object,key)&&!blocked.has(String(key));
  const clone=value=>JSON.parse(JSON.stringify(value));
  function pathParts(path){
    const start=/^([A-Za-z_]\w*)/.exec(path);if(!start)return null;
    const parts=[start[1]];let rest=path.slice(start[0].length);
    while(rest){const modifier=/^\.(keys|values)\(\)/.exec(rest);if(modifier){parts.push({modifier:modifier[1]});rest=rest.slice(modifier[0].length);continue;}const m=/^(?:\.([A-Za-z_]\w*)|\[(\d+|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')\])/.exec(rest);if(!m)return null;let key=m[1]??m[2];if(!m[1]&&/^["']/.test(key)){try{key=key[0]==='"'?JSON.parse(key):key.slice(1,-1).replace(/\\(['\\])/g,'$1');}catch(_){return null;}}if(blocked.has(key))return null;parts.push(key);rest=rest.slice(m[0].length);if(parts.length>14)return null;}
    return parts;
  }
  function readPath(samples,path){const parts=pathParts(path);if(!parts||!samples.has(parts[0]))return undefined;let value=samples.get(parts.shift());for(const key of parts){if(key&&typeof key==='object'){if(value&&typeof value==='object'&&!Array.isArray(value))value=key.modifier==='keys'?Object.keys(value).filter(k=>!blocked.has(k)):Object.entries(value).filter(([k])=>!blocked.has(k)).map(([,v])=>v);continue;}if(!own(value,key))return undefined;value=value[key];}return value;}
  function activeExpression(text,pos){
    const before=text.slice(Math.max(0,pos-1500),pos),brace=before.lastIndexOf('{');if(brace<0)return null;
    const expression=before.slice(brace+1);let dot=-1,quote='',depth=0;
    for(let i=0;i<expression.length;i++){const c=expression[i];if(quote){if(c==='\\'){i++;continue;}if(c===quote)quote='';}else if(c==='"'||c==="'")quote=c;else if(c==='[')depth++;else if(c===']')depth--;else if(c==='.'&&!depth)dot=i;}
    if(dot<0||quote||depth)return null;const base=expression.slice(0,dot),partial=expression.slice(dot+1),parts=pathParts(base);
    if(!parts||!/^\w*$/.test(partial))return null;
    return {alias:parts[0],base,partial,from:pos-expression.length,position:pos};
  }
  function loopScopes(text,pos){
    const source=text.slice(0,pos).replace(/<!--[\s\S]*?-->/g,m=>' '.repeat(m.length));const stack=[];let at=0;
    while(at<source.length){const start=source.indexOf('{',at);if(start<0)break;if(source.startsWith('{/loop}',start)){stack.pop();at=start+7;continue;}
      if(!source.startsWith('{#loop ',start)){at=start+1;continue;}
      let end=start+1,depth=1,quote='';for(;end<source.length;end++){const c=source[end];if(quote){if(c==='\\'){end++;continue;}if(c===quote)quote='';}else if(c==='"'||c==="'"||c==='`')quote=c;else if(c==='{')depth++;else if(c==='}'&&!--depth)break;}
      if(depth)break;
      const header=source.slice(start+7,end),match=/^([\s\S]+?)\s+as\s+([A-Za-z_]\w*)(?:\s*,\s*([A-Za-z_]\w*))?(?:\s+[\s\S]*)?$/.exec(header);
      stack.push(match?{source:match[1].trim(),alias:match[2],indexAlias:match[3]}:null);at=end+1;
    }
    return stack.filter(Boolean);
  }
  function ancestors(tree,id){let seen=0;function find(nodes,path){for(const block of nodes||[]){if(++seen>5000)return null;if(block.id===id)return path;const found=find(block.children,[...path,block]);if(found)return found;}return null;}return (find(tree,[])||[]).filter(block=>block.type==='etch/loop').map(block=>({alias:block.itemId||'item',indexAlias:block.indexId,loopId:block.loopId,target:block.target,params:block.loopParams||{}}));}
  function splitArguments(source){let quote='',depth=0,start=0,parts=[];for(let i=0;i<source.length;i++){const c=source[i];if(quote){if(c==='\\'){i++;continue;}if(c===quote)quote='';}else if(c==='"'||c==="'")quote=c;else if('[({'.includes(c))depth++;else if('])}'.includes(c))depth--;else if(c===','&&!depth){parts.push(source.slice(start,i).trim());start=i+1;}}if(quote||depth)throw Error('This loop has arguments that cannot be sampled yet.');parts.push(source.slice(start).trim());return parts.filter(Boolean);}
  function parameterValue(value,samples){
    if(typeof value!=='string')return value;
    const text=value.trim();if(/^"(?:\\.|[^"\\])*"$/.test(text))return JSON.parse(text);if(/^'(?:\\.|[^'\\])*'$/.test(text))return text.slice(1,-1).replace(/\\(['\\])/g,'$1');
    if(/^-?\d+(?:\.\d+)?$/.test(text))return Number(text);if(text==='true'||text==='false')return text==='true';if(text==='null')return null;
    const path=text.startsWith('{')&&text.endsWith('}')?text.slice(1,-1):text;
    if(path.includes('.')||path.includes('[')){const value=readPath(samples,path);if(value===undefined)throw Error('A loop argument depends on data unavailable in this sample.');return value;}
    if(/^[A-Za-z0-9_-]*$/.test(text))return text;
    throw Error('This loop argument cannot be sampled safely.');
  }
  function sourceInfo(source,samples){
    const match=/^([A-Za-z_][\w-]*)(?:\(([\s\S]*)\))?$/.exec(source||'');if(!match)return {target:source};
    const params=Object.create(null);if(match[2]){let positional=0;for(const entry of splitArguments(match[2])){const named=/^\$?([A-Za-z_]\w*)\s*:\s*([\s\S]*)$/.exec(entry),key=named?named[1]:'arg'+(++positional);if(blocked.has(key))throw Error('Unsupported argument name.');params['$'+key]=parameterValue(named?named[2]:entry,samples);}}
    return {key:match[1],params};
  }
  function queryArgs(args,params,Q){
    let nodes=0;function resolve(value,depth=0){if(++nodes>4000||depth>12)throw Error('This query is too large to sample.');if(Array.isArray(value))return value.map(v=>resolve(v,depth+1));if(value&&typeof value==='object'){const out=Object.create(null);for(const[k,v]of Object.entries(value)){if(blocked.has(k))continue;out[k]=resolve(v,depth+1);}return out;}if(typeof value==='string'&&value.startsWith('$')){const parsed=Q.literal(value),name='$'+parsed.param;if(own(params,name))return params[name];if(own(params,parsed.param))return params[parsed.param];if(parsed.required)throw Error('Supply the required '+name+' loop argument before requesting suggestions.');return parsed.value;}return value;}
    return resolve(args);
  }
  function fieldChoices(sample,expression){
    const samples=new Map([[expression.alias,sample]]),value=readPath(samples,expression.base);if(!value||typeof value!=='object')return [];
    const rows=Object.keys(value).filter(key=>!blocked.has(key)&&key.toLowerCase().startsWith(expression.partial.toLowerCase())).slice(0,100).map(key=>{const child=value[key],type=child===null?'empty':Array.isArray(child)?'array':typeof child,path=Array.isArray(value)&&/^\d+$/.test(key)?expression.base+'['+key+']':/^[A-Za-z_]\w*$/.test(key)?expression.base+'.'+key:expression.base+'['+JSON.stringify(key)+']';return {label:key,path,type,expand:child!==null&&typeof child==='object'};}).sort((a,b)=>a.label.localeCompare(b.label,undefined,{numeric:true}));
    if(!Array.isArray(value))for(const modifier of ['keys','values'])if(modifier.startsWith(expression.partial.toLowerCase()))rows.push({label:modifier+'()',path:expression.base+'.'+modifier+'()',type:modifier==='keys'?'field names · array':'field values · array',expand:false});
    return rows;
  }
  const core={activeExpression,loopScopes,ancestors,sourceInfo,queryArgs,readPath,fieldChoices,parameterValue};
  if(typeof module!=='undefined')module.exports=core;
  if(!root.document||!root.looperConfig||root.LooperAutocomplete)return;
  const config=root.looperConfig,Q=root.LooperQuery,document=root.document,cache=new Map(),requests=new Set();let enabled=false,timer,sequence=0,active=null,menu=null,status=null,options=[],selected=0,attributes=null;
  function editorView(content){for(let node=content;node&&node!==document.body;node=node.parentElement){const view=node.cmView?.view||node.cmTile?.view;if(view?.state?.doc&&typeof view.dispatch==='function'&&typeof view.coordsAtPos==='function')return view;}return null;}
  function competingMenu(content){return [...document.querySelectorAll('.ee-autocomplete-list,.cm-tooltip-autocomplete')].some(node=>!node.hidden&&root.getComputedStyle(node).display!=='none'&&node.getClientRects().length&&(node.classList.contains('ee-autocomplete-list')||content.closest('.cm-editor')?.contains(node)));}
  function hide(){if(menu)menu.hidden=true;if(status)status.textContent='';if(active?.content&&attributes&&(!active.content.getAttribute('aria-controls')||active.content.getAttribute('aria-controls')===menu?.id)&&(!active.content.getAttribute('aria-activedescendant')||active.content.getAttribute('aria-activedescendant').startsWith('lfe-completion-'))){for(const[key,value]of attributes){if(value===null)active.content.removeAttribute(key);else active.content.setAttribute(key,value);}}attributes=null;active=null;options=[];}
  function elements(){if(menu)return;menu=document.createElement('div');menu.className='lfe-completions';menu.id='lfe-completions';menu.hidden=true;menu.setAttribute('role','listbox');menu.setAttribute('aria-label','Looper loop fields');document.body.append(menu);status=document.createElement('div');status.className='lfe-autocomplete-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');document.body.append(status);}
  function show(content,view,expression,rows,note){
    hide();if(!enabled||competingMenu(content))return;const rect=view.coordsAtPos(expression.position);if(!rect)return;
    elements();active={content,view,expression};options=rows;selected=0;attributes=['aria-controls','aria-expanded','aria-autocomplete','aria-activedescendant'].map(key=>[key,content.getAttribute(key)]);
    menu.setAttribute('role',rows.length?'listbox':'note');if(rows.length){content.setAttribute('aria-controls',menu.id);content.setAttribute('aria-autocomplete','list');}menu.replaceChildren();
    const heading=document.createElement('div');heading.className='lfe-completions-heading';heading.textContent='Looper · '+expression.base;heading.setAttribute('role','presentation');menu.append(heading);
    if(!rows.length){const empty=document.createElement('div');empty.className='lfe-completions-empty';empty.setAttribute('role','presentation');empty.textContent=note||'No matching fields in this sample.';menu.append(empty);content.removeAttribute('aria-activedescendant');}
    rows.forEach((row,index)=>{const node=document.createElement('div');node.id='lfe-completion-'+index;node.className='lfe-completion';node.setAttribute('role','option');node.setAttribute('aria-selected',String(index===0));const name=document.createElement('span');name.textContent=row.label;const type=document.createElement('span');type.className='lfe-completion-type';type.textContent=row.type+(row.expand?' ›':'');node.append(name,type);node.addEventListener('pointerdown',event=>{event.preventDefault();event.stopPropagation();choose(index);});menu.append(node);});
    if(rows.length)content.setAttribute('aria-activedescendant','lfe-completion-0');menu.hidden=false;
    menu.style.left=Math.max(8,Math.min(rect.left,root.innerWidth-330))+'px';menu.style.maxWidth=Math.max(220,root.innerWidth-16)+'px';menu.style.top=Math.max(8,Math.min(rect.bottom+5,root.innerHeight-menu.offsetHeight-8))+'px';
    status.textContent=rows.length?rows.length+' suggestions. Use arrow keys, Enter to insert, or Escape to dismiss.':note||'No matching fields in this sample.';
  }
  async function sampleRequest(type,args){
    const key=JSON.stringify([type,args]),old=cache.get(key);if(old&&old.until>Date.now())return old.promise;
    if(requests.size>=3)throw Error('Wait for the current loop samples to finish.');if(cache.size>=24)cache.delete(cache.keys().next().value);const controller=new AbortController();requests.add(controller);const timeout=setTimeout(()=>controller.abort(),12000);
    const promise=(async()=>{try{const response=await fetch(config.api+'preview',{method:'POST',credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:{'Content-Type':'application/json','X-WP-Nonce':config.nonce},body:JSON.stringify({type,args,sample:true})});const data=await response.json();if(!response.ok)throw Error(data.message||'A sample could not be loaded.');if(!data.sample)throw Error(data.sampleUnavailable||'No matching sample record. Check this query in Looper.');return data.sample;}finally{clearTimeout(timeout);requests.delete(controller);}})();cache.set(key,{until:Date.now()+60000,promise});return promise;
  }
  async function scopeSample(scope,loops,samples){
    const info=scope.source?sourceInfo(scope.source,samples):{},definition=scope.loopId?loops[scope.loopId]:Object.values(loops).find(loop=>loop.key===info.key);
    let sample;
    if(definition){const type=definition.config?.type;if(type==='json'){let data=definition.config.data;if(typeof data==='string'){try{data=JSON.parse(data);}catch(_){throw Error('This JSON loop has no readable sample.');}}sample=Array.isArray(data)?data[0]:undefined;}
      else{if(type==='main-query')throw Error('Main Query suggestions need archive/search context; this first version cannot sample it here.');if(!['wp-query','wp-users','wp-terms'].includes(type))throw Error('This loop source cannot be sampled here.');const params=Object.create(null);for(const[k,v]of Object.entries(scope.params||{})){if(!blocked.has(k))params[k]=parameterValue(v,samples);}Object.assign(params,info.params||{});const args=queryArgs(definition.config.args||{},params,Q);sample=await sampleRequest(type,args);}
      const target=scope.target;if(target){const nested=readPath(new Map([['record',sample]]),'record.'+target);sample=Array.isArray(nested)?nested[0]:undefined;}
    }else{const value=readPath(samples,scope.target||info.target||scope.source);sample=Array.isArray(value)?value[0]:undefined;}
    if(sample===undefined)throw Error('No sample item is available for this loop.');if(scope.indexAlias)samples.set(scope.indexAlias,0);samples.set(scope.alias,sample);return sample;
  }
  async function update(){
    const ticket=++sequence,content=document.activeElement?.closest?.('.etch-html-editor .cm-content');if(!enabled||!content||competingMenu(content)){hide();return;}
    const view=editorView(content);if(!view||view.state.readOnly){hide();return;}const selection=view.state.selection.main;if(selection.from!==selection.to){hide();return;}const pos=selection.head??selection.from,text=view.state.doc.toString();if(text.length>200000){hide();return;}const expression=activeExpression(text,pos);if(!expression){hide();return;}
    let scopes,loops;
    try{const api=root.etch;loops=api.loops.getAll();scopes=[...ancestors(api.blocks.getTree(),api.blocks.getSelectedId()),...loopScopes(text,pos)];}catch(_){hide();return;}
    const nearest=scopes.map(s=>s.alias).lastIndexOf(expression.alias);if(nearest<0){hide();return;}hide();const samples=new Map();let error;
    for(let i=0;i<=nearest;i++){try{await scopeSample(scopes[i],loops,samples);}catch(problem){samples.delete(scopes[i].alias);if(i===nearest)error=problem.message;}}
    if(!enabled||ticket!==sequence||document.activeElement!==content||view.state.selection.main.head!==pos||view.state.doc.toString()!==text)return;
    show(content,view,expression,error?[]:fieldChoices(samples.get(expression.alias),expression),error);
  }
  function schedule(event){if(event?.target&&!event.target.closest?.('.etch-html-editor .cm-content')){sequence++;hide();return;}if(event?.isComposing||event?.key==='Escape'||active&&['ArrowUp','ArrowDown'].includes(event?.key))return;clearTimeout(timer);timer=setTimeout(()=>update().catch(()=>hide()),180);}
  function choose(index){
    if(!active||!options[index])return;const {view,expression,content}=active,row=options[index],state=view.state,head=state.selection.main.head;const current=activeExpression(state.doc.toString(),head);if(head!==expression.position||!current||current.base!==expression.base||current.partial!==expression.partial){hide();return;}let to=head;const rest=state.doc.sliceString(head);const suffix=/^[A-Za-z0-9_$.[\]"'-]*/.exec(rest)?.[0]||'';to+=suffix.length;if(row.path.endsWith('()')&&state.doc.sliceString(to,to+2)==='()')to+=2;let insert=row.path+(row.expand?'.':'}');if(!row.expand&&state.doc.sliceString(to,to+1)==='}')to++;
    hide();view.dispatch({changes:{from:expression.from,to,insert},selection:{anchor:expression.from+insert.length},userEvent:'input.complete'});view.focus();if(row.expand)schedule();else if(status)status.textContent='Inserted '+row.path+'.';
  }
  function keydown(event){
    if(event.isComposing)return;
    if(event.key==='Escape'){if(active){event.preventDefault();event.stopImmediatePropagation();sequence++;hide();}return;}
    if(!active||event.target!==active.content)return;if(event.defaultPrevented||competingMenu(active.content)){hide();return;}
    if(['ArrowDown','ArrowUp'].includes(event.key)&&options.length){event.preventDefault();event.stopImmediatePropagation();selected=(selected+(event.key==='ArrowDown'?1:-1)+options.length)%options.length;for(const[index,node]of [...menu.querySelectorAll('[role=option]')].entries())node.setAttribute('aria-selected',String(index===selected));active.content.setAttribute('aria-activedescendant','lfe-completion-'+selected);menu.querySelector('#lfe-completion-'+selected)?.scrollIntoView({block:'nearest'});}
    else if(event.key==='Enter'&&options.length){event.preventDefault();event.stopImmediatePropagation();choose(selected);}
  }
  function outside(event){if(!menu?.contains(event.target)&&event.target!==active?.content){sequence++;hide();}}
  function setEnabled(value){
    if(enabled===!!value)return;enabled=!!value;
    const method=enabled?'addEventListener':'removeEventListener';document[method]('input',schedule,true);document[method]('keyup',schedule,true);document[method]('keydown',keydown,true);document[method]('pointerdown',outside,true);root[method]('blur',dismiss);root[method]('resize',dismiss);
    if(!enabled){clearTimeout(timer);sequence++;hide();cache.clear();requests.forEach(controller=>controller.abort());menu?.remove();status?.remove();menu=status=null;}
  }
  function dismiss(){sequence++;hide();}
  root.LooperAutocomplete={setEnabled,isEnabled:()=>enabled,clear:()=>{cache.clear();dismiss();},core};setEnabled(config.autocomplete===true);
})(typeof window!=='undefined'?window:globalThis);
