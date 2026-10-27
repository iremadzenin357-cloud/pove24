const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {create}=require('../listing-query-core.js');
const read=name=>fs.readFileSync(name,'utf8');
function predicates(values={}){
 const form={querySelectorAll:()=>[]};
 class FormData{get(k){const v=values[k];return Array.isArray(v)?v[0]:v??null;}getAll(k){const v=values[k];return Array.isArray(v)?v:v?[v]:[];}}
 const context={window:{},document:{getElementById:()=>form},FormData,categoryGroups:{},scheduleDateFilter:()=>values.dateFilter||null,
 scheduleToday:()=> '2026-10-22',localISO:d=>d.toISOString().slice(0,10),plusDays:(d,n)=>new Date(+d+n*86400000),console};
 vm.createContext(context);
 const geo=read('geo-ui.js'),schedule=read('schedule.js');
 vm.runInContext(geo.slice(geo.indexOf('Object.assign(categoryGroups,{'),geo.indexOf('const legacyJobCategories=')),context);
 for(const name of ['categoryFilterMatch','workerMatchesCategory','districtSelectionMatches']){
  const line=geo.split('\n').find(s=>s.startsWith('function '+name+'('));vm.runInContext(line,context);
 }
 const a=geo.indexOf('const singleCategoryFilterMatch='),b=geo.indexOf('updateWorkers=function()',a);
 vm.runInContext(geo.slice(a,b),context);
 for(const name of ['payKind','payValue','inferredDuration'])vm.runInContext(schedule.split('\n').find(s=>s.startsWith('const '+name+'=')),context);
 for(const name of ['paymentMatches','dateMatches'])vm.runInContext(schedule.split('\n').find(s=>s.startsWith('function '+name+'(')),context);
 vm.runInContext(read('listing-search-ui.js'),context);
 return context.window.PoveSearchUI;
}
function rpcClient(rows){
 const calls=[];let missing=false;
 return {calls,missing:v=>missing=v,from(){throw Error('No full-table reads allowed');},async rpc(name,args){
  calls.push(args);if(missing)return {error:{code:'PGRST202'}};
  if(args.p_kind==='capabilities')return {data:{version:1}};
  const filtered=rows.filter(r=>(!args.p_city||r.city.includes(args.p_city))&&(!args.p_payment||args.p_payment==='all'||(r.paymentType||'daily')===args.p_payment));
  const total=filtered.length,size=args.p_size,page=Math.max(1,Math.min(args.p_page,Math.ceil(total/size)||1));
  return {data:{rows:filtered.slice((page-1)*size,page*size),total,size,page,pages:Math.ceil(total/size)}};
 }};
}
const state={page:1,sort:'newest',paymentType:null};
const job={id:'j1',_kind:'jobs',status:'active',city:'თბილისი',area:'',category:'ადამიანების დახმარება',subcategory:'',title:'მოხუცის მოვლა',description:'სანდო დამხმარე',paymentType:'daily',pay:50,paymentAmount:50,date:'2026-10-22',start:'09:00',end:'17:00'};
test('old category aliases and inferred text use the original production predicates',()=>{
 const p=predicates({category:['ადამიანების დახმარება'],subcategory:['ხანდაზმულის დახმარება/მოვლა']}).prepare('jobs',state);
 assert.equal(p.residual,true);assert.equal(p.matches(job),true);assert.equal(p.matches({...job,category:'სხვა',title:'სხვა სამუშაო'}),false);
 const computer=predicates({category:['ონლაინ / კომპიუტერული']}).prepare('jobs',state);
 assert.equal(computer.matches({...job,category:'კომპიუტერული მომსახურება'}),true);
});
test('multiple category selections remain OR, including legacy worker skills',()=>{
 const p=predicates({workerCategory:['სხვა','ადამიანების დახმარება'],workerCategorySubcategory:['','ბავშვზე ზრუნვა / ძიძა']}).prepare('workers',state);
 assert.equal(p.matches({category:'ძიძა',skills:['ძიძა'],pay:40}),true);
});
test('job date duration and range rules differ intentionally from worker negotiable pay',()=>{
 const p=predicates({min:'60',duration:'4-8',dateFilter:{mode:'today'}}).prepare('jobs',state);
 assert.equal(p.matches({...job,paymentMax:80}),true);
 assert.equal(p.matches({...job,paymentMax:80,paymentType:'negotiable'}),false);
 assert.equal(p.matches({...job,paymentMax:80,date:'2026-10-23'}),false);
 const w=predicates({workerMinPay:'60',workerMaxPay:'70'}).prepare('workers',state);
 assert.equal(w.matches({pay:null,paymentType:'negotiable'}),true);
 assert.equal(w.matches({pay:50,paymentType:'daily'}),false);
});
test('blank/whitespace worker districts retain legacy wildcard behavior',()=>{
 const p=predicates({workerArea:'ვაკე'}).prepare('workers',state);
 assert.equal(p.matches({area:'   '}),true);assert.equal(p.matches({area:'საბურთალო'}),false);
});
test('legacy-compatible search counts matches beyond 1000 without a global array',async()=>{
 const rows=Array.from({length:1350},(_,i)=>({...job,id:'j'+i,title:i>=1200?'მოხუცის მოვლა':'სხვა სამუშაო',category:i>=1200?'ადამიანების დახმარება':'სხვა'}));
 const client=rpcClient(rows),repo=create(client);
 const p=predicates({category:['ადამიანების დახმარება']}).prepare('jobs',{...state,page:12});
 const result=await repo.compatiblePage(p.request,p.matches,p.residual);
 assert.equal(result.total,150);assert.equal(result.pages,13);assert.equal(result.rows[0].id,'j1332');
 assert.equal(client.calls.length,14);assert.ok(client.calls.every(c=>c.p_size===100));
});
test('simple search uses a single paginated RPC and zero client predicate evaluations',async()=>{
 const client=rpcClient(Array.from({length:1201},(_,i)=>({...job,id:'j'+i}))),repo=create(client);
 const p=predicates({city:'თბილისი'}).prepare('jobs',{...state,page:101});
 assert.equal(p.residual,false);
 const r=await repo.compatiblePage(p.request,()=>{throw Error('must not locally filter a server page');},false);
 assert.equal(client.calls.length,1);assert.equal(r.total,1201);assert.equal(r.rows[0].id,'j1200');
});
test('empty residual search and clamping the last matching page are accurate',async()=>{
 const repo=create(rpcClient(Array.from({length:205},(_,i)=>({...job,id:'j'+i}))));
 const empty=await repo.compatiblePage({kind:'jobs',page:4,size:12},()=>false,true);assert.equal(empty.total,0);assert.deepEqual(empty.rows,[]);assert.equal(empty.page,1);
 const last=await repo.compatiblePage({kind:'jobs',page:99,size:12},r=>Number(r.id.slice(1))<14,true);
 assert.equal(last.page,2);assert.equal(last.rows.length,2);assert.equal(last.rows[0].id,'j12');
});
test('missing migration is the only supported legacy fallback; query failures are not empty success',async()=>{
 const client=rpcClient([]),repo=create(client);client.missing(true);assert.equal(await repo.available(),false);
 client.rpc=async()=>({error:{code:'42501'}});await assert.rejects(repo.available(),/unavailable/);
});
test('RPC schema is invoker-only, counts before LIMIT and never returns full raw rows',()=>{
 const sql=read('migrations/20261023_listing_candidates.sql');
 assert.match(sql,/stable security invoker set search_path = ''/i);
 assert.doesNotMatch(sql,/security definer|to_jsonb\(|select\s+\*\s+from\s+public\./i);
 assert.match(sql,/count\(\*\) n from filtered/);assert.match(sql,/limit p_size/);
 assert.match(sql,/when 'active' then 0 when 'completed' then 1/);
 assert.match(sql,/'phone',''/);assert.match(sql,/from public;/);
});
test('stale residual scans stop before reading further batches',async()=>{
 const client=rpcClient(Array.from({length:250},()=>job)),repo=create(client);let active=true;
 await assert.rejects(repo.compatiblePage({kind:'jobs'},()=>{active=false;return true;},true,()=>active),/invalidated/);
 assert.equal(client.calls.length,1);
});
test('search controller debounces input, discards stale results, and paints server page metadata',async()=>{
 const source=read('listing-pagination.js'),a=source.indexOf('  const remote='),b=source.indexOf('  function render(kind)',a);
 const timers=new Map(),requests=[],resolvers=[],painted=[];let nextTimer=0,filter='first';
 const host={isConnected:true,setAttribute(){},removeAttribute(){}};
 const context={state:{jobs:{page:101}},hostFor:()=>host,notify:()=>{},render:kind=>painted.push(kind),
 setTimeout:fn=>{timers.set(++nextTimer,fn);return nextTimer;},clearTimeout:id=>timers.delete(id),
 window:{Pove24Store:{pagedListings:true,listingQueries:{compatiblePage:request=>{requests.push(request);return new Promise(resolve=>resolvers.push(resolve));}},rememberListingRows:async rows=>rows},
 PoveSearchUI:{prepare:()=>({key:filter,request:{kind:'jobs',page:101},matches:()=>true,residual:false}),paint:(kind,result)=>painted.push(result)}}};
 vm.createContext(context);vm.runInContext(source.slice(a,b),context);
 assert.equal(context.remoteResult('jobs',host),false);
 const first=[...timers.values()].at(-1)();
 filter='second';context.remoteResult('jobs',host);const second=[...timers.values()].at(-1)();
 resolvers[0]({rows:[{id:'stale'}],total:2000,page:101,pages:167});await first;assert.equal(painted.length,0);
 resolvers[1]({rows:[{id:'fresh'}],total:2001,page:101,pages:167});await second;
 const result=context.remoteResult('jobs',host);assert.equal(result.total,2001);assert.equal(result.rows[0].id,'fresh');assert.equal(requests.length,2);
});
test('actual UI painter uses returned rows/count and does not filter a partial global cache',()=>{
 const host={innerHTML:''},form={querySelectorAll:()=>[]};
 const context={window:{},document:{getElementById:id=>id==='jobResults'?host:null},jobs:[],saved:[],get:()=>[],
 jobCard:row=>'<article>'+row.id+'</article>',workerCard:row=>row.id,esc:s=>s,syncSiteFilterSelect(){},activeFilterMarkup:()=>''};
 vm.createContext(context);vm.runInContext(read('listing-search-ui.js'),context);
 context.window.PoveSearchUI.paint('jobs',{rows:[{id:'beyond1000',status:'completed'}],total:1350},{form,filters:{categories:[]}});
 assert.match(host.innerHTML,/<strong>1350<\/strong>/);assert.match(host.innerHTML,/beyond1000/);
});
test('details, route guard and homepage are connected without enabling global search snapshots',()=>{
 const store=read('supabase-data.js'),boot=read('bootstrap.js'),home=read('home-listing-types.js');
 assert.match(boot,/listing-query-core\.js/);assert.match(boot,/listing-search-ui\.js/);assert.match(boot,/listing-route-data\.js/);
 assert.match(store,/limited \? \[\] : optionalRows\('job_posts'/);
 assert.match(store,/rpcPage\(\{kind,id:decodeURIComponent/);
 assert.match(home,/rpcPage\(\{kind:'home',page,size:12\}\)/);
 assert.match(home,/insertAdjacentHTML\('beforeend',markup\)/);
 assert.match(read('listing-route-data.js'),/ensureLegacyListings\(\)/);
});
