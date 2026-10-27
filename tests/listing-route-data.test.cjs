const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
function fixture(){
 let caller='owner';const waits=[],attrs=new Map();
 const app={innerHTML:'PRIVATE OLD CONTENT',setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k)};
 const pending=()=>new Promise((resolve,reject)=>waits.push({resolve,reject}));
 const c={location:{hash:'#/worker/old'},document:{getElementById:()=>app},
 routeView(){app.innerHTML='CURRENT '+c.location.hash;},render(){},
 window:{Pove24Store:{pagedListings:true,accountRef:()=>caller,ensureListingDetail:pending,ensureLegacyListings:pending},PoveSearchUI:{syncCache(){}}}};
 vm.createContext(c);vm.runInContext(read('listing-route-data.js'),c);
 return {c,app,attrs,waits,guard:c.window.PoveListingRouteGuard,setCaller:value=>{caller=value;}};
}
test('detail clears immediately and failure replaces old content with safe error',async()=>{
 const f=fixture(),p=f.c.routeView();assert.doesNotMatch(f.app.innerHTML,/PRIVATE/);
 assert.equal(f.attrs.get('aria-busy'),'true');await Promise.resolve();
 f.waits[0].reject(Error('sensitive backend response'));await p;
 assert.match(f.app.innerHTML,/საიტთან დაკავშირება ვერ მოხერხდა/);
 assert.doesNotMatch(f.app.innerHTML,/PRIVATE|sensitive/);assert.equal(f.attrs.has('aria-busy'),false);
});
test('successful current detail renders normally',async()=>{
 const f=fixture(),p=f.c.routeView();await Promise.resolve();f.waits[0].resolve();await p;
 assert.equal(f.app.innerHTML,'CURRENT #/worker/old');assert.equal(f.attrs.has('aria-busy'),false);
});
for(const identity of [null,'other-user'])test('auth transition clears and rejects old response: '+identity,async()=>{
 const f=fixture(),p=f.c.routeView();await Promise.resolve();
 const ticket=f.guard.begin();f.setCaller(identity);
 f.waits[0].resolve();await p;assert.doesNotMatch(f.app.innerHTML,/PRIVATE|CURRENT/);
 f.c.location.hash='#/dashboard';assert.equal(f.c.routeView(),undefined);
 assert.equal(f.guard.complete(ticket),true);
 const next=f.c.routeView();await Promise.resolve();f.waits[1].resolve();await next;
 assert.equal(f.app.innerHTML,'CURRENT #/dashboard');
});
test('older navigation success or failure cannot overwrite a newer public page',async()=>{
 for(const failed of [false,true]){
  const f=fixture(),p=f.c.routeView();await Promise.resolve();f.c.location.hash='#/jobs';f.c.routeView();
  if(failed)f.waits[0].reject(Error('offline'));else f.waits[0].resolve();
  await p;assert.equal(f.app.innerHTML,'CURRENT #/jobs');assert.equal(f.attrs.has('aria-busy'),false);
 }
});
test('failed auth refresh stays cleared and obsolete auth completion cannot unlock routes',()=>{
 const f=fixture(),old=f.guard.begin(),latest=f.guard.begin();
 assert.equal(f.guard.complete(old),false);f.guard.fail(old);
 f.guard.fail(latest);assert.match(f.app.innerHTML,/საიტთან დაკავშირება ვერ მოხერხდა/);
 f.c.routeView();assert.doesNotMatch(f.app.innerHTML,/PRIVATE|CURRENT/);
});
test('identity change alone prevents an old response from painting',async()=>{
 const f=fixture(),p=f.c.routeView();await Promise.resolve();f.setCaller('other');f.waits[0].resolve();await p;
 assert.doesNotMatch(f.app.innerHTML,/PRIVATE|CURRENT/);
});
test('auth guard starts before session reads and auth callback deferred refresh',()=>{
 const store=read('supabase-data.js').split('async function refreshSession()')[1].split('function enqueue')[0];
 assert.ok(store.indexOf('routeGuard?.begin()')<store.indexOf('client.auth.getSession()'));
 assert.ok(store.indexOf('routeGuard.complete(ticket)')<store.indexOf('Pove24AppBridge?.hydrate()'));
 assert.match(store,/routeGuard\?\.fail\(ticket\)/);
 const auth=read('supabase-auth.js').split('supabase.auth.onAuthStateChange')[1];
 assert.ok(auth.indexOf('PoveListingRouteGuard?.begin()')<auth.indexOf('setTimeout(() => setCurrentUser()'));
});
