const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const core=require('../listing-photos-core.js');

test('adjacent moves preserve all IDs and support arbitrary order',()=>{
 const items=['a','b','c','d','e'].map(id=>({id}));
 assert.equal(core.movePhoto(items,'a',-1),false);
 assert.equal(core.movePhoto(items,'e',1),false);
 assert.equal(core.movePhoto(items,'missing',1),false);
 assert.equal(core.movePhoto(items,'a',2),false);
 core.movePhoto(items,'c',-1);core.movePhoto(items,'a',1);
 assert.deepEqual(items.map(p=>p.id),['c','a','b','d','e']);
 assert.equal(new Set(items.map(p=>p.id)).size,5);
});
for(const kind of ['jobs','workers'])test(`${kind}: adjacent reorder mixed saved/new items commits exact order`,async()=>{
 const state={loaded:true,dirty:true,expected:['a','b'],items:[{id:'a'},{id:'b'},{localId:'c',blob:{}}]};
 core.movePhoto(state.items,'c',-1);
 let order;
 await core.saveWithPhotos({state,kind,row:{uuid:'listing'},saveListing:async(_,row)=>row,
  repo:{stage:async()=>({id:'c'}),commit:async(k,id,expected,ids)=>{assert.equal(k,kind);assert.deepEqual(expected,['a','b']);order=ids;return ids.map(id=>({id}));},cleanup:async()=>{}}});
 assert.deepEqual(order,['a','c','b']);assert.equal(state.dirty,false);
});
test('remove/reorder existing items requires no new upload when uploads disabled',async()=>{
 const state={loaded:true,dirty:true,expected:['a','b','c'],items:[{id:'c'},{id:'a'}]};
 await core.saveWithPhotos({state,kind:'jobs',row:{uuid:'x'},saveListing:async(_,r)=>r,
  repo:{stage:async()=>{throw Error('uploads disabled');},commit:async(_,id,e,ids)=>ids.map(id=>({id})),cleanup:async()=>{}}});
 assert.deepEqual(state.expected,['c','a']);
});
test('session change blocks requests before they are sent',async()=>{
 let calls=0;
 const repo=core.repository({rpc:async()=>{calls++;return {data:[]};}},'A',()=> 'B');
 await assert.rejects(repo.list('jobs','x'));await assert.rejects(repo.commit('jobs','x',[],[]));
 assert.equal(calls,0);
});
test('session switch during reservation cannot upload old user bytes',async()=>{
 let owner='A',uploads=0;
 const repo=core.repository({rpc:async()=>{owner='B';return {data:{storage_path:'A/file',id:'p'}};},
  storage:{from:()=>({upload:async()=>{uploads++;return {data:{}};}})}},'A',()=>owner);
 await assert.rejects(repo.stage({}));assert.equal(uploads,0);
});
test('private preview signatures remain short and no public URL is requested',async()=>{
 let args;
 const repo=core.repository({storage:{from:bucket=>{assert.equal(bucket,'listing-photos');return {
  createSignedUrl:async(...a)=>{args=a;return {data:{signedUrl:'https://synthetic.invalid/image'}};}
 };}}},'owner');
 assert.equal(await repo.preview('path'),'https://synthetic.invalid/image');assert.deepEqual(args,['path',60]);
});
test('optional account deletion integration fails closed and preserves separate files (static)',()=>{
 const sql=fs.readFileSync(require.resolve('../migrations/20261010_listing_photo_infrastructure.sql'),'utf8');
 assert.match(sql,/to_regprocedure\('public.pove_account_deletion_frozen\(uuid\)'\)/);
 assert.match(sql,/if frozen is distinct from false then return false/);
 assert.match(sql,/and public.listing_photo_account_open\(p.owner_id\)/);
 assert.doesNotMatch(sql,/create (?:or replace )?function public\.pove_account_deletion_/i);
});
test('preview URL registry survives manifest replacement and is released on success (static)',()=>{
 const js=fs.readFileSync(require.resolve('../listing-photos.js'),'utf8');
 assert.match(js,/objectUrls:new Set\(\)/);assert.match(js,/state\.objectUrls\.add\(url\)/);
 assert.match(js,/state\.completed=true;\s+releasePreviews\(state\)/);
 assert.match(js,/data-listing-photo-refresh/);
});
test('served CSS includes photo source and preserves account deletion integration',()=>{
 const normalize=text=>text.replace(/\r\n/g,'\n').trim();
 const source=normalize(fs.readFileSync(require.resolve('../listing-photos.css'),'utf8'));
 const bundle=normalize(fs.readFileSync(require.resolve('../site.css'),'utf8'));
 assert.ok(bundle.includes(source));
 const boot=fs.readFileSync(require.resolve('../bootstrap.js'),'utf8');
 const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
 assert.match(boot,/account-deletion\.js\?v=20261011-local-v1/);
 assert.match(html,/account-deletion\.css\?v=20261011-local-v1/);
});
