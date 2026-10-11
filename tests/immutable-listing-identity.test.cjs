// Offline tests: real frontend payload generation + a simulated identity guard.
// The simulation is NOT PostgreSQL, RLS, PostgREST or a trigger integration test.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const migrationName='20261011_immutable_listing_identity.sql';
const migration=fs.readFileSync(path.join(__dirname,'../migrations',migrationName),'utf8');
const source=fs.readFileSync(path.join(__dirname,'../supabase-data.js'),'utf8');
const ID='11111111-1111-4111-8111-111111111111';
const OWNER='22222222-2222-4222-8222-222222222222';
const OTHER='33333333-3333-4333-8333-333333333333';
function guard(old,row){
  for(const key of ['id','owner_id'])if(old[key]!==row[key])throw Object.assign(Error('immutable '+key),{code:'23514'});
}
function fixture(kind,{admin=false,existing=true}={}){
  let stored=existing?{id:ID,owner_id:OWNER}:null;
  const calls=[];
  const client={from(table){return {
    update(row){return query('update',row);},
    upsert(row,options){assert.equal(options.onConflict,'id');return query('upsert',row);},
    insert(row){return query('insert',row);}
  };function query(operation,row){
    const q={eq(column,id){assert.equal(column,'id');assert.equal(id,ID);return q;},select(){return q;},async single(){
      calls.push({table,operation,row:{...row}});
      const next={...(stored||{id:ID}),...row};
      if(stored)guard(stored,next);
      stored=next;return {id:stored.id,legacy_id:stored.legacy_id};
    }};return q;
  }}};
  const ctx={client,authUser:{id:admin?OTHER:OWNER},sameUser:x=>x===(admin?OTHER:OWNER),isAdmin:()=>admin,
    validateCategorySelections:()=>{},cache:new Map(),ids:{jobs:new Map(),workers:new Map()},
    stamp:x=>x,timeOnly:x=>x||null,run:x=>x,replaceCategories:async()=>{}};
  vm.createContext(ctx);
  vm.runInContext(source.slice(source.indexOf('  async function saveListing('),source.indexOf('  function validateCategorySelections(')),ctx);
  vm.runInContext(source.slice(source.indexOf('  async function upsertJob('),source.indexOf('  async function replaceCategories(')),ctx);
  return {ctx,calls,get stored(){return stored;},save:row=>kind==='jobs'?ctx.upsertJob(row):ctx.upsertWorker(row)};
}
for(const kind of ['jobs','workers']){
  test(`${kind}: actual edit payload preserves identity while changing content`,async()=>{
    const f=fixture(kind);await f.save({id:'local',uuid:ID,owner:OWNER,title:'edited',offer:'edited',name:'Synthetic',category:'test'});
    assert.equal(f.calls[0].operation,'update');assert.equal(f.calls[0].row.owner_id,OWNER);
    assert.equal('id' in f.calls[0].row,false);assert.equal(f.stored.id,ID);
    assert.equal(f.stored[kind==='jobs'?'title':'offer'],'edited');
  });
  test(`${kind}: pending UUID insert and repeated upsert accept identical identity`,async()=>{
    const f=fixture(kind,{existing:false});
    const row={id:'local',pendingUuid:ID,owner:OWNER,category:'test'};
    await f.save({...row});
    // Simulate retry without the acknowledged UUID mapping, e.g. a lost response.
    f.ctx.ids[kind].clear();
    await f.save({...row});await f.save({...row});
    assert.deepEqual(f.calls.map(x=>x.operation),['upsert','upsert','update']);
    assert.equal(f.stored.id,ID);assert.equal(f.stored.owner_id,OWNER);
  });
  test(`${kind}: admin status edit preserves the original owner's identity`,async()=>{
    const status=kind==='jobs'?'cancelled':'published';
    const f=fixture(kind,{admin:true});await f.save({id:'local',uuid:ID,owner:OWNER,category:'test',status});
    assert.equal(f.stored.owner_id,OWNER);assert.equal(f.stored.status,status);
    // Status enum validity and whether this admin action exists are staging concerns.
  });
  for(const field of ['id','owner_id'])test(`${kind}: simulated direct update rejects changed ${field}`,async()=>{
    const f=fixture(kind);await assert.rejects(f.ctx.saveListing(kind,{[field]:OTHER},ID),{code:'23514'});
    assert.equal(f.stored[field],field==='id'?ID:OWNER);
  });
  test(`${kind}: simulated conflicting upsert cannot transfer owner`,async()=>{
    const f=fixture(kind);await assert.rejects(f.ctx.saveListing(kind,{owner_id:OTHER},null,ID),{code:'23514'});
    assert.equal(f.stored.owner_id,OWNER);
  });
  test(`${kind}: admin and service operation cannot bypass the simulated invariant`,()=>{
    for(const role of ['admin','service_role'])assert.throws(()=>guard({id:ID,owner_id:OWNER},{id:OTHER,owner_id:OWNER,role}),{code:'23514'});
  });
}
test('migration has final-row checks on every update, null-safe and without role bypass',()=>{
  assert.match(migration,/NEW\.id IS DISTINCT FROM OLD\.id/);
  assert.match(migration,/NEW\.owner_id IS DISTINCT FROM OLD\.owner_id/);
  assert.match(migration,/SECURITY INVOKER\s+SET search_path = ''/);
  assert.equal((migration.match(/AFTER UPDATE ON public\./g)||[]).length,2);
  assert.doesNotMatch(migration,/CREATE TRIGGER[\s\S]*?UPDATE OF/);
  assert.doesNotMatch(migration,/auth\.(uid|jwt|role)\(/);
});
test('migration leaves existing policies, table grants, data and photos untouched',()=>{
  const code=migration.replace(/--[^\n]*/g,'');
  assert.doesNotMatch(code,/\b(?:INSERT INTO|DELETE FROM|UPDATE public\.|ALTER TABLE|ALTER POLICY|CREATE POLICY|GRANT|DROP|CREATE OR REPLACE)\b/i);
  assert.equal((code.match(/REVOKE/g)||[]).length,1);
  assert.match(code,/REVOKE ALL ON FUNCTION public\.pove_assert_listing_identity_immutable\(\)/);
  assert.doesNotMatch(code,/listing_photo|storage\./i);
  assert.match(code,/relrowsecurity/);assert.match(code,/conkey=ARRAY\[a.attnum\]/);
});
test('new object names do not collide with existing local SQL, including photo migration',()=>{
  const dir=path.join(__dirname,'../migrations');
  const existing=fs.readdirSync(dir).filter(x=>x.endsWith('.sql')&&x!==migrationName).map(x=>fs.readFileSync(path.join(dir,x),'utf8')).join('\n')
    +fs.readFileSync(path.join(__dirname,'../../supabase-follow-up.sql'),'utf8');
  for(const name of ['pove_assert_listing_identity_immutable','pove_job_posts_identity_immutable','pove_worker_profiles_identity_immutable']){
    assert.ok(!existing.includes(name));assert.ok(migration.includes(name));
  }
});
