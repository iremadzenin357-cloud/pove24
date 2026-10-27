const {test}=require('node:test');
const assert=require('node:assert/strict');
const {create,normalize}=require('../listing-query-core.js');
const id=n=>String(n).padStart(8,'0')+'-0000-0000-0000-000000000000';
const row=(n,status='active')=>({id:id(n),status,created_at:'2026-10-01T00:00:00Z',pay:n,city:'თბილისი',area:'ვაკე',payment_type:'daily'});
function mock(tables){
 const calls=[];let fail=false,countMissing=false;
 const client={from(table){const steps=[];let projection,head=false,count=false,start=0,end=Infinity;
  const q={select(c,o={}){projection=c;head=o.head;count=o.count;return q;},eq:(...v)=>add('eq',v),is:(...v)=>add('is',v),gt:(...v)=>add('gt',v),ilike:(...v)=>add('ilike',v),or:(...v)=>add('or',v),order:(...v)=>add('order',v),range(a,b){start=a;end=b;return q;},then(resolve,reject){
   calls.push({table,steps,projection,head,start,end});
   if(fail)return Promise.resolve({error:{message:'private detail'}}).then(resolve,reject);
   let rows=[...(tables[table]||[])];
   for(const [op,args]of steps){const [key,value]=args;
    if(op==='eq'||op==='is')rows=rows.filter(r=>r[key]===value);
    if(op==='gt')rows=rows.filter(r=>r[key]>value);
    if(op==='ilike')rows=rows.filter(r=>String(r[key]||'').includes(value.slice(1,-1).replace(/\\([%_\\])/g,'$1')));
    if(op==='or'){
     if(key==='status.is.null,status.not.in.(active,completed)')rows=rows.filter(r=>!['active','completed'].includes(r.status));
     else if(key==='payment_type.eq.daily,payment_type.is.null')rows=rows.filter(r=>r.payment_type==='daily'||r.payment_type==null);
     else if(key.startsWith('created_at.is.null,')){
      const date=key.match(/created_at.lt."([^"]+)"/)[1],cursor=key.match(/id.gt.([^,)]+)/)[1];
      rows=rows.filter(r=>r.created_at===null||r.created_at<date||r.created_at===date&&r.id>cursor);
     }
    }
   }
   const orders=steps.filter(([op])=>op==='order');
   rows.sort((a,b)=>{for(const [, [key,opt]]of orders){const av=a[key],bv=b[key];if(av===bv)continue;if(av==null)return opt.nullsFirst?-1:1;if(bv==null)return opt.nullsFirst?1:-1;return (av<bv?-1:1)*(opt.ascending?1:-1);}return 0;});
   return Promise.resolve({data:head?null:rows.slice(start,end+1),count:countMissing?null:count?rows.length:null,error:null}).then(resolve,reject);
  }};
  function add(op,args){steps.push([op,args]);return q;}return q;
 }};
 return {client,calls,fail:v=>fail=v,countMissing:v=>countMissing=v};
}
test('page beyond 1000 remains reachable and exact counts are not capped',async()=>{
 const h=mock({worker_profiles:Array.from({length:1237},(_,n)=>row(n))});
 const result=await create(h.client).page({kind:'workers',page:101});
 assert.equal(result.total,1237);assert.equal(result.pages,104);assert.equal(result.rows.length,12);assert.equal(result.rows[0].id,id(1200));
 assert.deepEqual(h.calls.filter(x=>!x.head).map(x=>[x.start,x.end]),[[1200,1211]]);
});
test('job page crossing status boundary keeps active then completed then other',async()=>{
 const h=mock({job_posts:[row(4,'completed'),row(5,'cancelled'),row(1),row(2),row(3,'completed')]});
 const result=await create(h.client).page({kind:'jobs',page:2,size:3});
 assert.deepEqual(result.rows.map(x=>x.status),['completed','cancelled']);assert.equal(result.total,5);
 assert.deepEqual(h.calls.filter(x=>!x.head).map(x=>[x.start,x.end]),[[1,1],[0,0]]);
});
test('empty exact results issue no row reads and retain page one',async()=>{
 const h=mock({});const result=await create(h.client).page({kind:'jobs',page:55});
 assert.equal(result.total,0);assert.equal(result.pages,0);assert.equal(result.page,1);assert.deepEqual(result.rows,[]);assert.ok(h.calls.every(c=>c.head));
});
test('out of range page clamps using the exact filtered count',async()=>{
 const h=mock({worker_profiles:[row(1),row(2)]});const r=await create(h.client).page({kind:'workers',page:9});assert.equal(r.page,1);assert.equal(r.rows.length,2);
});
test('city and payment filters apply to both count and row queries',async()=>{
 const h=mock({worker_profiles:[row(1),{...row(2),city:'ბათუმი'},{...row(3),payment_type:'hourly'}]});
 const result=await create(h.client).page({kind:'workers',filters:{city:'თბილისი',paymentType:'daily'}});
 assert.equal(result.total,1);assert.equal(result.rows[0].id,id(1));assert.ok(h.calls.every(c=>c.steps.some(([op])=>op==='ilike')));
});
test('wildcards in city are literal and values are not interpolated into raw filters',async()=>{
 const h=mock({});await create(h.client).page({kind:'workers',filters:{city:'%,_',area:'"),id.neq.0'}});
 assert.equal(h.calls[0].steps.find(([op])=>op==='ilike')[1][1],'%\\%,\\_%');
 assert.ok(h.calls[0].steps.find(([op])=>op==='or')[1][0].includes('\\"'));
});
test('worker price sorting puts null last and uses UUID tie breaks',async()=>{
 const h=mock({worker_profiles:[{...row(4),pay:null},{...row(2),pay:10},{...row(1),pay:10},row(3)]});
 const r=await create(h.client).page({kind:'workers',sort:'price-asc'});assert.deepEqual(r.rows.map(x=>x.id),[id(3),id(1),id(2),id(4)]);
});
test('unsupported legacy filters and coalesced job price sort fail before network',()=>{
 const h=mock({});const repo=create(h.client);
 for(const filters of [{categories:[{main:'სხვა'}]},{query:'ძიძა'},{date:'today'},{duration:'1-2'},{min:5}])assert.throws(()=>repo.page({kind:'jobs',filters}),/reviewed/);
 assert.throws(()=>repo.page({kind:'jobs',sort:'price-asc'}),/reviewed/);assert.equal(h.calls.length,0);
});
test('invalid pagination and kinds are rejected without requests',()=>{
 for(const input of [{kind:'profiles'},{kind:'jobs',page:-1},{kind:'workers',size:1001},{kind:'jobs',page:Number.MAX_SAFE_INTEGER}])assert.throws(()=>normalize(input));
});
test('in-flight duplicate requests coalesce but settled results are not shared across sessions',async()=>{
 const h=mock({worker_profiles:[row(1)]}),repo=create(h.client),a=repo.page({kind:'workers'}),b=repo.page({kind:'workers'});assert.equal(a,b);await a;
 assert.equal(h.calls.length,2);await repo.page({kind:'workers'});assert.equal(h.calls.length,4);
});
test('query failures never become empty successes and retries work',async()=>{
 const h=mock({}),repo=create(h.client);h.fail(true);await assert.rejects(repo.page({kind:'workers'}),e=>e.message==='Listing query failed');
 h.fail(false);assert.equal((await repo.page({kind:'workers'})).total,0);
 h.countMissing(true);await assert.rejects(repo.page({kind:'workers'}),/exact result count/);
});
test('home is active only, merges both types and fetches bounded batches',async()=>{
 const h=mock({job_posts:[row(1),row(2),row(3,'completed')],worker_profiles:[row(4),row(5)]});const repo=create(h.client);
 const first=await repo.home({size:2});assert.deepEqual(first.rows.map(x=>x.kind),['jobs','jobs']);assert.equal(first.hasMore,true);
 const next=await repo.home({size:2,cursors:first.cursors});assert.deepEqual(next.rows.map(x=>x.row.id),[id(4),id(5)]);assert.equal(next.hasMore,false);
 assert.ok(h.calls.every(c=>c.start===0&&c.end===2));assert.ok(h.calls.every(c=>!c.projection.includes('phone')));
});
test('empty home and malformed cursors',async()=>{
 const h=mock({}),repo=create(h.client);assert.equal((await repo.home()).hasMore,false);
 await assert.rejects(repo.home({cursors:{jobs:{id:'bad',createdAt:null}}}),/cursor/);
});
test('session or write invalidation rejects an outstanding old result',async()=>{
 const h=mock({worker_profiles:[row(1)]}),repo=create(h.client);
 const pending=repo.page({kind:'workers'});repo.invalidate();
 await assert.rejects(pending,/invalidated/);
 assert.equal((await repo.page({kind:'workers'})).total,1);
});
