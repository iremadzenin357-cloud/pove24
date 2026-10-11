// Offline unit/static checks. Not a substitute for PostgreSQL/RLS execution tests.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const core=require('../listing-photos-core.js');
const sql=fs.readFileSync(require.resolve('../migrations/20261010_listing_photo_infrastructure.sql'),'utf8');

test('standalone migration never changes categories or avatar bucket',()=>{
 assert.doesNotMatch(sql,/(?:insert into|update|delete from|alter table)\s+public\.(?:categories|subcategories|job_post_categories|worker_profile_categories)\b/i);
 assert.doesNotMatch(sql,/values\s*\(\s*'profile-photos'/i);
 assert.doesNotMatch(sql,/create or replace|drop (?:table|policy|function)/i);
 assert.match(sql,/Preflight: listing-photos bucket already exists/);
 assert.match(sql,/uploads_enabled boolean not null default false/);
});
test('storage restrictive guards protect against old permissive policies',()=>{
 for(const action of ['select','insert','update','delete'])assert.match(sql,new RegExp('as restrictive for '+action+' to anon,authenticated'));
 assert.match(sql,/false,5242880,array\['image\/webp'\]/);
 assert.doesNotMatch(sql,/grant[^;]*(?:insert|update|delete)[^;]*on public\.listing_photos[^;]*to authenticated/i);
});
test('all definer functions pin the empty search path',()=>{
 const bodies=sql.split(/create function /i).slice(1);
 assert.ok(bodies.length>=15);
 for(const body of bodies){assert.match(body.split('$$')[0],/security (?:definer|invoker) set search_path=''/);}
 assert.match(sql,/listing_photo_can_read\(p_path text\)[\s\S]*?security invoker/);
 assert.match(sql,/revoke all on function %s from public,anon,authenticated,service_role/);
});
test('approval requires server role and decoded file attestation',()=>{
 const moderate=sql.split('create function public.listing_photo_moderate')[1].split('end $$;')[0];
 assert.match(moderate,/not public\.listing_photo_is_admin/);
 assert.match(moderate,/content_verified_at is null or photo.content_sha256 is null/);
 const validation=sql.split('create function public.listing_photo_record_validation')[1].split('end $$;')[0];
 assert.match(validation,/perform public.listing_photo_require_worker\(\)/);
 assert.match(validation,/then 'pending_review' else 'rejected'/);
 assert.match(sql,/approved boolean generated always/);
});
test('ownership, attachment cap, exact order, and account closure enforced in SQL',()=>{
 assert.match(sql,/listing_owner is distinct from auth.uid\(\)/);
 assert.match(sql,/cardinality\(p_selected\)>5/);
 assert.match(sql,/current_ids<>expected_ids/);
 assert.match(sql,/p.owner_id=auth.uid\(\)/);
 assert.match(sql,/position between 0 and 4/);
 assert.match(sql,/listing_photo_account_blocks/);
 assert.match(sql,/hashtextextended\(p_owner::text,0\)/);
 assert.match(sql,/position=s.ordinality-1/);
});
test('cleanup only retires stale pending and never deletes Storage SQL records',()=>{
 assert.match(sql,/for update skip locked/);
 assert.match(sql,/p.state='retired' or p.moderation_status in \('rejected','removed'\)/);
 assert.doesNotMatch(sql,/delete from storage\.objects/i);
 assert.match(sql,/o.created_at<now\(\)-interval '48 hours'/);
});
test('browser cannot delete Storage or metadata through cleanup',async()=>{
 const repo=core.repository(new Proxy({}, {get(){throw Error('browser cleanup touched backend')}}),'owner');
 await repo.cleanup();
});
test('signing uses caller client and short URL lifetime',async()=>{
 let options;
 const client={storage:{from(bucket){assert.equal(bucket,'listing-photos');return {createSignedUrl:async(...args)=>{options=args;return {data:{signedUrl:'https://example.test/photo'},error:null}}}}}};
 assert.equal(await core.repository(client,'owner').preview('path'),'https://example.test/photo');assert.deepEqual(options,['path',60]);
});
test('frontend readiness and moderation are wired without category gating',()=>{
 const frontend=fs.readFileSync(require.resolve('../listing-photos.js'),'utf8');
 assert.match(frontend,/ready\?\.version===1&&ready.uploads_enabled===true/);
 assert.match(frontend,/labels\[item.moderation_status/);
 const admin=fs.readFileSync(require.resolve('../photo-moderation.js'),'utf8');
 assert.match(admin,/listing_photo_moderate/);assert.match(admin,/p_after:after/);
 assert.match(admin,/if\(photo.content_verified_at&&!photo.content_deleted_at/);
});

test('public columns exclude all internal moderation and owner fields',()=>{
 const grant=sql.match(/grant select\(([^)]+)\) on public.listing_photos to anon,authenticated/)[1].split(',');
 assert.deepEqual(grant,['id','storage_path','position','job_post_id','worker_profile_id','state']);
 assert.doesNotMatch(sql,/grant select on public.listing_photos to anon/);
});
test('disabled uploads still permit existing photo removal and ordering',()=>{
 const commit=sql.split('create function public.commit_listing_photos')[1].split('create function public.retire_deleted')[0];
 assert.match(commit,/perform public.listing_photo_require_account/);
 assert.match(commit,/if exists\(select 1 from unnest\(p_selected\) x where not \(x=any\(current_ids\)\)\) then\s+perform public.listing_photo_require_uploads/);
 const frontend=fs.readFileSync(require.resolve('../listing-photos.js'),'utf8');
 assert.match(frontend,/remove.disabled \|\|= !state.photoManageEnabled/);
});
test('durable cleanup survives profile deletion and queues use backoff and leases',()=>{
 assert.match(sql,/owner_id uuid not null, -- Durable cleanup identity/);
 assert.match(sql,/create trigger retire_profile_listing_photos before delete on public.profiles/);
 assert.match(sql,/listing_photo_account_cleanup_status/);
 assert.match(sql,/order by retry_at,id limit 50/);
 assert.match(sql,/x-pove-worker-token/);
 assert.match(sql,/terminal decision: upload a replacement/);
});
