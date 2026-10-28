const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {create}=require('../listing-query-core');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('identical in-flight RPC reads coalesce but settled results are never cached',async()=>{
 let resolve,calls=0;
 const repo=create({from(){},rpc(){calls++;return new Promise(r=>resolve=r);}});
 const a=repo.rpcPage({kind:'home'}),b=repo.rpcPage({kind:'home'});
 assert.equal(calls,1);resolve({data:{rows:[{id:'one'}],total:1,page:1,pages:1,size:12}});
 const [left,right]=await Promise.all([a,b]);left.rows[0].id='changed';assert.equal(right.rows[0].id,'one');
 const fresh=repo.rpcPage({kind:'home'});assert.equal(calls,2);
 resolve({data:{rows:[],total:0,page:1,pages:0,size:12}});await fresh;
});
test('auth invalidation separates pending RPCs and rejects old responses',async()=>{
 const waits=[];const repo=create({from(){},rpc(){return new Promise(r=>waits.push(r));}});
 const old=repo.rpcPage({kind:'jobs'});const rejected=assert.rejects(old,/invalidated/);
 repo.invalidate();const next=repo.rpcPage({kind:'jobs'});assert.equal(waits.length,2);
 const data={rows:[],total:0,page:1,pages:0,size:12};waits[0]({data});waits[1]({data});await rejected;await next;
});
test('failed coalesced RPC can be retried',async()=>{
 let calls=0;const repo=create({from(){},async rpc(){calls++;return {error:{code:'NETWORK'}};}});
 await assert.rejects(repo.rpcPage({kind:'workers'}));await assert.rejects(repo.rpcPage({kind:'workers'}));assert.equal(calls,2);
});
for(const changed of [false,true])test('metadata reads start together and commit only for the current identity: '+changed,async()=>{
 const source=read('supabase-data.js'),start=source.indexOf('  async function rememberListingRows('),end=source.indexOf('  async function ensureListingDetail',start);
 const pending=[],cache=new Map(),writes=[];
 const c={dataGeneration:0,accountRef:()=>null,uiRef:x=>x,sameUser:()=>false,authUser:null,cache,ids:{jobs:new Map(),workers:new Map()},legacyId:(kind,id)=>id,
 setCache:(k,v)=>{writes.push(k);cache.set(k,v);},run:q=>q,
 client:{from:table=>({select:columns=>({in:()=>new Promise(resolve=>pending.push({table,columns,resolve}))})})}};
 vm.createContext(c);vm.runInContext(source.slice(start,end),c);
 const call=c.rememberListingRows([{_kind:'jobs',id:'j',uuid:'j',owner:'o'},{_kind:'workers',id:'w',uuid:'w',owner:'o'}]);
 assert.equal(pending.length,3);assert.equal(writes.length,0);
 if(changed)c.dataGeneration++;
 pending.forEach(p=>p.resolve([]));
 if(changed){await assert.rejects(call);assert.equal(writes.length,0);}else{assert.equal((await call).length,2);assert.ok(cache.has('dge-jobs'));assert.ok(cache.has('dge-workers'));}
});
test('new page hosts have no debounce delay while same-host filter edits retain 180ms',()=>{
 const source=read('listing-pagination.js'),a=source.indexOf('  const remote='),b=source.indexOf('  function render(kind)',a),delays=[];
 const host={setAttribute(){}};let key='first';
 const c={state:{jobs:{}},setTimeout:(fn,delay)=>{delays.push(delay);return 1;},clearTimeout(){},window:{Pove24Store:{pagedListings:true},PoveSearchUI:{prepare:()=>({key})}}};
 vm.createContext(c);vm.runInContext(source.slice(a,b),c);
 c.remoteResult('jobs',host);key='typing';c.remoteResult('jobs',host);c.remoteResult('jobs',{setAttribute(){}});
 assert.deepEqual(delays,[0,180,0]);
});
