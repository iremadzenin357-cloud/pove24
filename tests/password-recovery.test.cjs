const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');

function harness(origin='https://pove24.vercel.app',session={user:{id:'synthetic'}}){
 const events={},calls=[],app={innerHTML:''},message={replaceChildren(n){this.text=n.textContent}},button={disabled:false,isConnected:true};
 let callback;
 const auth={
  onAuthStateChange(fn){callback=fn},
  async resetPasswordForEmail(email,options){calls.push({email,...options});return {error:null}},
  async getSession(){return {data:{session},error:null}},
  async updateUser(value){calls.push(value);return {error:null}}
 };
 const location={origin,pathname:'/',hash:'#/login'};
 const context={console,location,URLSearchParams,setTimeout:fn=>fn(),sessionStorage:{getItem(){return null},removeItem(){}},
  history:{replaceState(_state,_title,url){location.hash=url.slice(url.indexOf('#'))}},
  FormData:class {constructor(form){this.form=form} get(name){return this.form[name]}},
  document:{addEventListener(type,fn){(events[type]??=[]).push(fn)},querySelector(){return {value:'person@example.test'}},
   getElementById(id){return id==='app'?app:message},createElement(){return {}}},
  pove24Supabase:{auth},Pove24Store:{refreshSession:async()=>{},accountRef:()=>null},routeView(){app.innerHTML='ordinary page'}
 };
 context.window=context;
 vm.runInNewContext(read('supabase-auth.js'),context);
 const event=(selector,form=button)=>({target:{closest:s=>s===selector?form:null},preventDefault(){},stopImmediatePropagation(){}});
 return {context,auth,app,message,calls,button,async request(){await events.click[0](event('[data-auth-recovery]'))},
  recovery(){callback('PASSWORD_RECOVERY',session)},async save(password){const form={password,querySelector:()=>button};await events.submit[0](event('[data-password-reset]',form))}};
}

for(const origin of ['https://pove24.vercel.app','https://pove24-oca06qdcj-pove24.vercel.app','http://127.0.0.1:4173']){
 test(`recovery redirects to current origin and existing hash route: ${origin}`,async()=>{
  const h=harness(origin);await h.request();assert.equal(h.calls[0].redirectTo,origin+'/#/login?recovery=1');assert.equal(h.button.disabled,false);
 });
}
test('early recovery event survives boot and renders after hydration',async()=>{
 const h=harness();h.recovery();assert.equal(h.app.innerHTML,'');await h.context.Pove24Auth.ready();
 assert.match(h.app.innerHTML,/data-password-reset/);assert.equal(h.context.location.hash,'#/login?recovery=1');
 h.context.routeView();assert.match(h.app.innerHTML,/data-password-reset/);
});
test('valid recovery session can set password and go to dashboard',async()=>{
 const h=harness();h.recovery();await h.context.Pove24Auth.ready();await h.save('synthetic-password');
 assert.equal(h.calls[0].password,'synthetic-password');assert.equal(h.context.location.hash,'#/dashboard');assert.equal(h.context.pove24RecoveryPending,false);
});
test('missing recovery session cannot update password',async()=>{
 const h=harness(undefined,null);h.context.location.hash='#/login?recovery=1';await h.context.Pove24Auth.ready();await h.save('synthetic-password');
 assert.equal(h.calls.length,0);assert.ok(h.message.text);assert.doesNotMatch(h.app.innerHTML,/data-password-reset/);
});
test('weak password and update failure keep recovery available',async()=>{
 const h=harness();h.recovery();await h.context.Pove24Auth.ready();await h.save('short');assert.equal(h.calls.length,0);
 h.auth.updateUser=async()=>({error:{message:'test failure'}});await h.save('synthetic-password');
 assert.equal(h.context.location.hash,'#/login?recovery=1');assert.equal(h.message.text,'test failure');assert.equal(h.button.disabled,false);
});
test('email transport rejection restores button and displays error',async()=>{
 const h=harness();h.auth.resetPasswordForEmail=async()=>{throw new Error('test transport')};await h.request();assert.equal(h.button.disabled,false);assert.equal(h.message.text,'test transport');
});
test('client captures PASSWORD_RECOVERY before store initialization',()=>{
 let capture;const context={POVE24_SUPABASE_CONFIG:{url:'https://example.test',publishableKey:'synthetic'},supabase:{createClient(_u,_k,options){assert.equal(options.auth.detectSessionInUrl,true);return {auth:{onAuthStateChange(fn){capture=fn}}}}}};context.window=context;
 vm.runInNewContext(read('supabase-client.js'),context);capture('PASSWORD_RECOVERY');assert.equal(context.pove24RecoveryPending,true);capture('SIGNED_OUT');assert.equal(context.pove24RecoveryPending,false);
 const boot=read('bootstrap.js');assert.ok(boot.indexOf('Pove24Auth?.ready()')>boot.lastIndexOf('Pove24AppBridge?.hydrate()'));
});
