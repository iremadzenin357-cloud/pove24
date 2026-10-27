const {test}=require('node:test');
const assert=require('node:assert/strict');
const {create}=require('../listing-query-core.js');
const fs=require('node:fs');
const path=require('node:path');
const sql=fs.readFileSync(path.join(__dirname,'../migrations/20261023_listing_candidates.sql'),'utf8');
const result={rows:[],total:0,page:1,pages:0,size:12};
function client(reply){return {from(){throw Error('Unexpected table fallback');},rpc:reply};}

// Evaluate only the migration's boolean status predicate on non-null fixtures.
// This is a regression model of that expression, not PostgreSQL/RLS execution.
function statusPredicate(){
 const expression=sql.match(/select \* from source s where\s*([\s\S]*?)\s+and \(p_id/)[1];
 const js=expression.replace(/\bnot\b/g,'!').replace(/\bor\b/g,'||').replace(/\band\b/g,'&&').replace(/=/g,'===');
 return new Function('s','p_kind','p_active_only','return '+js);
}
const statusRows=[
 {kind:'jobs',status:'active'}, {kind:'jobs',status:'completed'},
 {kind:'jobs',status:'candidate_found'}, {kind:'jobs',status:'in_progress'},
 {kind:'jobs',status:'cancelled'}, {kind:'workers',status:'published'},
 {kind:'workers',status:'draft'}, {kind:'workers',status:'suspended'},
 // Cross-kind values must never be accepted as a public homepage status.
 {kind:'workers',status:'active'}, {kind:'jobs',status:'published'}
];

test('homepage status predicate includes active jobs and published workers only',()=>{
 const accepts=statusPredicate();
 for(const activeOnly of [false,true]){
  assert.deepEqual(statusRows.filter(row=>accepts(row,'home',activeOnly)),[statusRows[0],statusRows[5]]);
 }
});

test('explicit active-only RPC reads use the listing kind-specific public status',()=>{
 const accepts=statusPredicate();
 for(const kind of ['jobs','workers']){
  const rows=statusRows.filter(row=>row.kind===kind);
  assert.deepEqual(rows.filter(row=>accepts(row,kind,true)),[kind==='jobs'?statusRows[0]:statusRows[5]]);
 }
});

test('ordinary search/detail retains RLS-visible statuses and job-only ranking',()=>{
 const accepts=statusPredicate();
 for(const row of statusRows)assert.equal(accepts(row,row.kind,false),true);
 assert.match(sql,/case when p_kind='jobs' then case s.status when 'active' then 0 when 'completed' then 1 else 2 end else 0 end/);
 assert.match(sql,/and \(p_id is null or s.id::text=p_id or s.legacy_id=p_id\)/);
});

test('UI RPC arguments match the SQL signature, including ID lookup',async()=>{
 let call;
 const repo=create(client(async(name,args)=>{call={name,args};return {data:result};}));
 await repo.rpcPage({kind:'workers',id:'legacy-worker',city:'თბილისი',paymentType:'daily'});
 assert.equal(call.name,'pove_listing_candidates_v1');
 assert.deepEqual(call.args,{p_kind:'workers',p_page:1,p_size:12,p_sort:'newest',p_city:'თბილისი',p_payment:'daily',p_id:'legacy-worker'});
 for(const arg of Object.keys(call.args))assert.match(sql,new RegExp('\\b'+arg+' (?:text|bigint|integer)'));
 assert.match(sql,/p_active_only boolean default false/);
});

test('capability success does not prove data grants; denied data reads fail closed',async()=>{
 const repo=create(client(async(name,args)=>args.p_kind==='capabilities'
  ?{data:{version:1}}:{error:{code:'42501',message:'sensitive backend detail'}}));
 assert.equal(await repo.available(),true);
 await assert.rejects(repo.rpcPage({kind:'jobs'}),error=>error.message==='Listing query failed');
});

test('missing RPC codes fall back, while network and permission failures do not',async()=>{
 for(const code of ['PGRST202','42883'])assert.equal(await create(client(async()=>({error:{code}}))).available(),false);
 for(const code of ['42501','57014','NETWORK'])await assert.rejects(create(client(async()=>({error:{code}}))).available(),/unavailable/);
 assert.equal(await create(client(async()=>({data:{version:2}}))).available(),false);
});

test('malformed RPC counts and oversized pages are rejected',async()=>{
 for(const bad of [{...result,total:-1},{...result,total:1},{...result,size:100},{...result,rows:Array(13).fill({})}]){
  await assert.rejects(create(client(async()=>({data:bad}))).rpcPage({kind:'jobs'}),/Invalid listing response/);
 }
});

test('account change invalidates an in-flight RPC result',async()=>{
 let finish;
 const repo=create(client(()=>new Promise(resolve=>{finish=resolve;})));
 const pending=repo.rpcPage({kind:'jobs'});repo.invalidate();finish({data:result});
 await assert.rejects(pending,/invalidated/);
});

test('migration is one-shot, invoker-only and does not alter existing tables or policies',()=>{
 assert.match(sql,/create function public\.pove_listing_candidates_v1\(/i);
 assert.doesNotMatch(sql,/create or replace|security definer|execute\s+format|alter table|create policy|drop\s|delete from|insert into|update public\./i);
 assert.match(sql,/security invoker set search_path = ''/i);
 assert.match(sql,/revoke all on function[^;]+from public;/i);
 assert.match(sql,/grant execute on function[^;]+to anon,authenticated;/i);
});
