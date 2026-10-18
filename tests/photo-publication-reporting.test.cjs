const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('supabase-data.js','utf8');
function setup({signedIn=true,admin=false,fail=false,already=false}={}){
 const calls=[],cache=new Map([['dge-reports',[{id:'local',uuid:'saved',reporterId:'caller',status:'new'}]]]);
 let release;
 const gate=new Promise(resolve=>release=resolve);
 const client={from(table){let op='read';return {select(){return this},eq(){return this},
 insert(row){op='insert';calls.push({table,op,row});return this},update(row){op='update';calls.push({table,op,row});return this},
 async maybeSingle(){return {data:already?{id:'saved'}:null}},
 async single(){await gate;return fail?{error:{message:'synthetic failure'}}:{data:{id:'saved'}}}}}};
 const ctx={client,authUser:signedIn?{id:'caller'}:null,isAdmin:()=>admin,cache,
 lookupProfileId:async id=>id,resolveId:(kind,id)=>`${kind}:${id}`,setCache:(k,v)=>cache.set(k,v),
 run:async p=>{const r=await p;if(r.error)throw Error('failed');return r.data},Date};
 const start=source.indexOf('    async submitReport('),end=source.indexOf('    async saveFormListing(',start);
 const api=vm.runInNewContext('({'+source.slice(start,end)+'})',ctx);
 return {api,calls,cache,release};
}
const input={id:'request',relatedWorker:'listing',photoId:'photo',reason:'inappropriate'};
test('report waits for database confirmation and retains exact worker/photo target',async()=>{
 const x=setup();let done=false;const pending=x.api.submitReport(input).then(()=>done=true);
 await new Promise(setImmediate);assert.equal(done,false);assert.equal(x.cache.get('dge-reports').length,1);
 assert.equal(x.calls[0].row.worker_profile_id,'workers:listing');assert.equal(x.calls[0].row.listing_photo_id,'photo');
 assert.equal(x.calls[0].row.reporter_id,'caller');assert.equal(x.calls[0].row.status,'new');
 x.release();await pending;assert.equal(x.cache.get('dge-reports').length,2);
});
test('failed report is not cached as delivered',async()=>{const x=setup({fail:true});x.release();await assert.rejects(x.api.submitReport(input));assert.equal(x.cache.get('dge-reports').length,1)});
test('unauthenticated report performs no write',async()=>{const x=setup({signedIn:false});await assert.rejects(x.api.submitReport(input));assert.equal(x.calls.length,0)});
test('retry recovers prior confirmed insert without duplication',async()=>{const x=setup({already:true});await x.api.submitReport(input);assert.equal(x.calls.length,0)});
test('administrator can update own report without reinserting',async()=>{const x=setup({admin:true});x.release();await x.api.updateReportStatus('job','local','closed');assert.equal(x.calls[0].op,'update');assert.equal(x.cache.get('dge-reports')[0].status,'closed')});
test('non-admin cannot update report',async()=>{const x=setup();await assert.rejects(x.api.updateReportStatus('job','local','closed'));assert.equal(x.calls.length,0)});
test('failed admin update preserves current status',async()=>{const x=setup({admin:true,fail:true});x.release();await assert.rejects(x.api.updateReportStatus('job','local','closed'));assert.equal(x.cache.get('dge-reports')[0].status,'new')});
test('new migration preserves terminal guards, lock, audit and upload flag',()=>{
 const sql=fs.readFileSync('migrations/20261018_photo_publication_reporting.sql','utf8');
 assert.match(sql,/moderation_status='pending_review' and content_deleted_at is null/);
 assert.match(sql,/for update/);assert.match(sql,/listing_photo_require_worker\(\)/);
 assert.match(sql,/then 'approved' else 'rejected'/);assert.match(sql,/'file_validated'/);assert.match(sql,/'auto_approved'/);
 assert.doesNotMatch(sql,/set uploads_enabled|create policy|drop policy/i);
 assert.match(sql,/photo target mismatch/);assert.match(sql,/owner mismatch/);
 assert.doesNotMatch(sql,/pg_trigger_depth/);assert.match(sql,/current_user = pg_catalog.pg_get_userbyid/);assert.match(sql,/on delete set null/);
 assert.match(sql,/if not public.listing_photo_is_admin\(\)/);
});
test('photo report navigation and moderation reuse remain wired',()=>{
 assert.match(fs.readFileSync('detail-gallery.js','utf8'),/reportPhoto:photos\[selected\].id/);
 assert.match(fs.readFileSync('admin.js','utf8'),/#\/admin\/photos\?photo=/);
 const moderation=fs.readFileSync('photo-moderation.js','utf8');
 assert.match(moderation,/listing_photo_review_one/);assert.match(moderation,/listing_photo_moderate/);
});
test('job report sends job target without a worker reference',async()=>{const x=setup();x.release();await x.api.submitReport({id:'request',relatedJob:'job',reason:'test'});assert.equal(x.calls[0].row.job_post_id,'jobs:job');assert.equal(x.calls[0].row.worker_profile_id,null)});
test('invalid admin status never reaches database',async()=>{const x=setup({admin:true});await assert.rejects(x.api.updateReportStatus('job','local','invalid'));assert.equal(x.calls.length,0)});

// Model tests document the SQL guard, not a substitute for real FK/RLS execution.
function cleanupAllowed({owner=false,oldWorker='w',worker='w',oldPhoto='p',photo='p',workerExists=true,photoExists=true,jobChanged=false,userChanged=false}={}) {
 if(jobChanged||userChanged)return false;
 if(worker===oldWorker&&photo===oldPhoto)return true;
 return owner && (worker===oldWorker||(worker===null&&oldWorker!==null&&!workerExists))
   && (photo===oldPhoto||(photo===null&&oldPhoto!==null&&!photoExists));
}
test('cleanup guard denies nested caller nulling even when parent is hidden by RLS',()=>{
 assert.equal(cleanupAllowed({photo:null,photoExists:false}),false);
 assert.equal(cleanupAllowed({worker:null,workerExists:false}),false);
});
test('cleanup guard denies replacing target even to trusted table owner',()=>{
 assert.equal(cleanupAllowed({owner:true,photo:'another',photoExists:false}),false);
 assert.equal(cleanupAllowed({owner:true,worker:'another',workerExists:false}),false);
 assert.equal(cleanupAllowed({owner:true,jobChanged:true}),false);
 assert.equal(cleanupAllowed({owner:true,userChanged:true}),false);
});
test('cleanup only permits owner-context NULL after real parent deletion',()=>{
 assert.equal(cleanupAllowed({owner:true,photo:null}),false);
 assert.equal(cleanupAllowed({owner:true,worker:null}),false);
 assert.equal(cleanupAllowed({owner:true,photo:null,photoExists:false}),true);
 assert.equal(cleanupAllowed({owner:true,worker:null,workerExists:false}),true);
 assert.equal(cleanupAllowed(),true);
});
test('migration is one-shot and cleanup checks both parent records without RLS bypassing insert',()=>{
 const sql=fs.readFileSync('migrations/20261018_photo_publication_reporting.sql','utf8');
 assert.match(sql,/not exists\(select 1 from public.worker_profiles where id=old.worker_profile_id\)/);
 assert.match(sql,/not exists\(select 1 from public.listing_photos where id=old.listing_photo_id\)/);
 const trigger=sql.split('create function public.validate_report_listing_target()')[1].split('create trigger')[0];
 assert.doesNotMatch(trigger,/security definer/i);
 assert.match(sql,/add column worker_profile_id/);assert.doesNotMatch(sql,/if not exists/i);
 assert.match(sql,/grant select\(worker_profile_id,listing_photo_id\), insert\(worker_profile_id,listing_photo_id\)/);
 assert.doesNotMatch(sql,/grant update/i);
});
