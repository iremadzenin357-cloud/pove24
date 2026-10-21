const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('supabase-data.js','utf8');
function harness(){
 let fail=false,empty=false,gate=null;
 const calls=[];
 const ctx={optionalRows:async(table,columns,required)=>{
  calls.push({table,required});if(gate)await gate;if(fail)throw Error('private backend details');if(empty)return [];
  return table==='categories'?[
   {id:'home-id',name:'სახლის საქმეები',is_active:true},
   {id:'event-id',name:'ღონისძიებები',is_active:true},
   {id:'computer-id',name:'ონლაინ / კომპიუტერული',is_active:true}
  ]:[{id:'clean-id',category_id:'home-id',name:'სახლის დალაგება',is_active:true}];
 },console};
 vm.createContext(ctx);
 vm.runInContext("const categoryIds=new Map(),subcategoryIds=new Map();let categoryLoadState='idle',categoryLoadPromise=null;",ctx);
 vm.runInContext(source.slice(source.indexOf('  function categoryAvailability('),source.indexOf('  async function load(onPrimaryReady)')),ctx);
 vm.runInContext(source.slice(source.indexOf('  function validateCategorySelections('),source.indexOf('  async function upsertJob(')),ctx);
 vm.runInContext(source.slice(source.indexOf('  async function replaceCategories('),source.indexOf('  async function lookupProfileId(')),ctx);
 ctx.run=async p=>p;
 const writes=[];ctx.client={from:table=>({delete:()=>({eq:async(fk,id)=>writes.push({table,fk,id})}),insert:async rows=>writes.push({table,rows})})};
 return {ctx,calls,writes,fail:v=>fail=v,empty:v=>empty=v,gate:p=>gate=p};
}
test('loaded catalog resolves existing UUIDs and known display aliases',async()=>{
 const h=harness();await h.ctx.ensureCategoryCatalog();
 assert.equal(h.ctx.categoryAvailability('ღონისძიებები და ორგანიზება').available,true);
 assert.equal(h.ctx.categoryAvailability('კომპიუტერული მომსახურება').available,true);
 await h.ctx.replaceCategories('worker_profile_categories','worker_profile_id','worker-id',[{main:'სახლის საქმეები',sub:'სახლის დალაგება'}]);
 const row=h.writes[1].rows[0];assert.equal(row.category_id,'home-id');assert.equal(row.subcategory_id,'clean-id');assert.equal(row.worker_profile_id,'worker-id');
 assert.deepEqual(h.calls.map(c=>c.table),['categories','subcategories']);assert.ok(h.calls.every(c=>c.required));
});
test('missing frontend-only category is named, not described as empty Supabase',async()=>{
 const h=harness();await h.ctx.ensureCategoryCatalog();
 for(const main of ['სილამაზე და თავის მოვლა','დიზაინი და ციფრული მომსახურება']){
  assert.throws(()=>h.ctx.validateCategorySelections([{main}]),e=>e.message.includes(main)&&!e.message.includes('Supabase'));
  await assert.rejects(h.ctx.replaceCategories('worker_profile_categories','worker_profile_id','worker-id',[{main}]));
 }assert.equal(h.writes.length,0);
});
test('loading, empty success, and genuine load failure have different errors; retry works',async()=>{
 const h=harness();let release;h.gate(new Promise(r=>release=r));const pending=h.ctx.ensureCategoryCatalog();
 assert.equal(h.ctx.ensureCategoryCatalog(),pending);
 assert.throws(()=>h.ctx.validateCategorySelections([{main:'სახლის საქმეები'}]),/იტვირთება/);
 release();h.gate(null);await pending;
 h.fail(true);await assert.rejects(h.ctx.ensureCategoryCatalog(true),/ჩატვირთვა ვერ მოხერხდა/);
 assert.equal(h.ctx.categoryAvailability('სახლის საქმეები').available,false);
 assert.throws(()=>h.ctx.validateCategorySelections([{main:'სახლის საქმეები'}]),/ჩატვირთვა ვერ მოხერხდა/);
 h.fail(false);h.empty(true);await h.ctx.ensureCategoryCatalog();
 assert.throws(()=>h.ctx.validateCategorySelections([{main:'სახლის საქმეები'}]),/ხელმისაწვდომი კატეგორიები ვერ მოიძებნა/);
 h.empty(false);await h.ctx.ensureCategoryCatalog();assert.equal(h.ctx.categoryAvailability('სახლის საქმეები').available,true);
});
test('subcategory cannot be linked using a different parent UUID',async()=>{
 const h=harness();await h.ctx.ensureCategoryCatalog();
 assert.throws(()=>h.ctx.validateCategorySelections([{main:'კომპიუტერული მომსახურება',sub:'სახლის დალაგება'}]),/ქვეკატეგორია/);
 assert.equal(h.ctx.categoryAvailability('კომპიუტერული მომსახურება','სახლის დალაგება').available,false);
});
test('posting menus disable missing choices but search menus remain unchanged',()=>{
 const s=fs.readFileSync('schedule.js','utf8'),a=s.indexOf('// Posting options stay visible'),b=s.indexOf("document.addEventListener('click',event=>{",a);
 const make=(main)=>({dataset:{catOpen:main},disabled:false,setAttribute(){},append(){}});
 let buttons=[make('valid'),make('missing')],posting=true;
 const widget={closest:()=>posting,querySelectorAll:()=>buttons};
 const context={renderCategoryMenu(){},window:{Pove24Store:{categoryAvailability:main=>({state:'ready',available:main==='valid'})}},document:{createElement:()=>({})}};
 vm.createContext(context);vm.runInContext(s.slice(a,b),context);
 context.renderCategoryMenu(widget);assert.equal(buttons[0].disabled,false);assert.equal(buttons[1].disabled,true);
 posting=false;buttons=[make('missing')];context.renderCategoryMenu(widget);assert.equal(buttons[0].disabled,false);
});
