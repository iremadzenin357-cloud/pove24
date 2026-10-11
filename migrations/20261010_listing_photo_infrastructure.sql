-- REVIEW ONLY: standalone listing photo infrastructure v1. NEVER executed locally.
-- No category writes; no profile-photos changes; no replacement of existing objects.
-- Run once ONLY after separate security review and isolated staging tests.
begin;

do $$
declare name text;
begin
 foreach name in array array['profiles','job_posts','worker_profiles'] loop
  if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname=name and c.relkind='r' and c.relrowsecurity) then
   raise exception 'Preflight: required ordinary table public.% with RLS is missing',name;
  end if;
 end loop;
 if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='storage' and c.relname='objects' and c.relrowsecurity) then
  raise exception 'Preflight: storage.objects RLS required';
 end if;
 foreach name in array array['listing_photos','listing_photo_settings','listing_photo_account_blocks','listing_photo_reviews','listing_photo_worker_state','listing_photo_orphan_retries'] loop
  if to_regclass('public.'||name) is not null then raise exception 'Preflight: % already exists; compare schemas manually, do not rerun',name; end if;
 end loop;
 if exists(select 1 from storage.buckets where id='listing-photos' or name='listing-photos') then
  raise exception 'Preflight: listing-photos bucket already exists';
 end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
   and (p.proname like 'listing_photo_%' or p.proname in ('reserve_listing_photo','commit_listing_photos','retire_deleted_listing_photos'))) then
  raise exception 'Preflight: photo functions already exist';
 end if;
 if exists(select 1 from pg_policies where schemaname='storage' and policyname like 'pove_lp_%') then
  raise exception 'Preflight: photo Storage policy names already exist';
 end if;
 if exists(select 1 from pg_trigger where tgname in ('retire_job_photos','retire_worker_photos','retire_profile_listing_photos') and not tgisinternal) then
  raise exception 'Preflight: photo trigger names already exist';
 end if;
 if has_schema_privilege('anon','public','CREATE') or has_schema_privilege('authenticated','public','CREATE') then
  raise exception 'Preflight: untrusted roles must not CREATE in public schema';
 end if;
 if not has_column_privilege('anon','public.job_posts','id','SELECT')
 or not has_column_privilege('authenticated','public.job_posts','id','SELECT')
 or not has_column_privilege('anon','public.worker_profiles','id','SELECT')
 or not has_column_privilege('authenticated','public.worker_profiles','id','SELECT') then
  raise exception 'Preflight: caller needs parent id SELECT for invoker RLS checks';
 end if;
end $$;

create table public.listing_photo_settings (
 id boolean primary key default true check(id),
 uploads_enabled boolean not null default false
);
insert into public.listing_photo_settings(id,uploads_enabled) values(true,false);
-- Persistent tombstone prevents concurrent/new photo writes while account deletion runs.
-- Not an account deletion implementation; a trusted account service must orchestrate it.
create table public.listing_photo_account_blocks (owner_id uuid primary key, created_at timestamptz not null default now());
create table public.listing_photo_reviews (
 id bigint generated always as identity primary key,
 photo_id uuid not null,
 actor_id uuid,
 decision text not null,
 created_at timestamptz not null default now()
);
alter table public.listing_photo_settings enable row level security;
alter table public.listing_photo_account_blocks enable row level security;
alter table public.listing_photo_reviews enable row level security;
revoke all on public.listing_photo_settings,public.listing_photo_account_blocks,public.listing_photo_reviews from public,anon,authenticated;
-- Trusted service only. Audit retention must be configured before launch.
revoke all on public.listing_photo_settings from service_role;
grant select on public.listing_photo_settings to service_role;

create table public.listing_photo_worker_state (
 id boolean primary key default true check(id), token uuid, lease_until timestamptz,
 last_success timestamptz
);
insert into public.listing_photo_worker_state(id) values(true);
create table public.listing_photo_orphan_retries (
 storage_path text primary key, retry_count integer not null default 0,
 retry_at timestamptz not null default now()
);
alter table public.listing_photo_worker_state enable row level security;
alter table public.listing_photo_orphan_retries enable row level security;
revoke all on public.listing_photo_worker_state,public.listing_photo_orphan_retries from public,anon,authenticated,service_role;

create table public.listing_photos (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null, -- Durable cleanup identity: intentionally no profile FK; see profile-delete trigger.
 job_post_id uuid references public.job_posts(id) on delete set null,
 worker_profile_id uuid references public.worker_profiles(id) on delete set null,
 storage_path text not null unique,
 state text not null default 'pending' check(state in ('pending','attached','retired')),
 position smallint check(position between 0 and 4),
 moderation_status text not null default 'pending_review' check(moderation_status in ('pending_review','approved','rejected','removed')),
 review_reason text not null default '' check(length(review_reason)<=1000),
 reviewed_at timestamptz,
 content_verified_at timestamptz,
 content_sha256 text check(content_sha256 ~ '^[0-9a-f]{64}$'),
 approved boolean generated always as (moderation_status='approved') stored,
 public_display_enabled boolean not null default false,
 created_at timestamptz not null default now(),
 retired_at timestamptz,
 content_deleted_at timestamptz,
 retry_at timestamptz not null default now(),
 retry_count integer not null default 0,
 constraint listing_photos_public_guard check (not public_display_enabled or
   (moderation_status='approved' and content_verified_at is not null and content_deleted_at is null)),
 constraint listing_photos_relationship check (
   (state='attached' and num_nonnulls(job_post_id,worker_profile_id)=1 and position is not null)
   or (state in ('pending','retired') and job_post_id is null and worker_profile_id is null and position is null)
 ),
 constraint listing_photos_safe_path check(storage_path=owner_id::text||'/'||id::text||'.webp')
);
create index listing_photos_owner_idx on public.listing_photos(owner_id,state);
create index listing_photos_retry_idx on public.listing_photos(retry_at);
create unique index listing_photos_job_slot on public.listing_photos(job_post_id,position) where state='attached';
create unique index listing_photos_worker_slot on public.listing_photos(worker_profile_id,position) where state='attached';

alter table public.listing_photos enable row level security;
revoke all on public.listing_photos from public,anon,authenticated;
grant select(id,storage_path,position,job_post_id,worker_profile_id,state) on public.listing_photos to anon,authenticated;
-- No browser INSERT/UPDATE/DELETE: including retired metadata deletion.

create function public.listing_photo_is_admin() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and coalesce(auth.jwt()->'app_metadata'->>'role','')='admin'
 and exists(select 1 from public.profiles where id=auth.uid() and status='active');
$$;

-- Optional account-deletion integration: safe with either migration order.
-- No account-deletion tables/functions are created or replaced here.
create function public.listing_photo_account_open(p_owner uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare frozen boolean;
begin
 if p_owner is null or not exists(select 1 from public.profiles where id=p_owner and status='active')
 or exists(select 1 from public.listing_photo_account_blocks where owner_id=p_owner) then return false; end if;
 if to_regprocedure('public.pove_account_deletion_frozen(uuid)') is not null then
  execute 'select public.pove_account_deletion_frozen($1)' into frozen using p_owner;
  if frozen is distinct from false then return false; end if;
 end if;
 return true;
end $$;

create function public.listing_photo_require_account() returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.listing_photo_account_open(auth.uid()) then raise exception 'photo account unavailable'; end if;
end $$;

create function public.listing_photo_require_uploads() returns void
language plpgsql security definer set search_path='' as $$
begin
 perform public.listing_photo_require_account();
 if not coalesce((select uploads_enabled from public.listing_photo_settings where id),false) then raise exception 'photo uploads disabled'; end if;
end $$;

create function public.listing_photo_capabilities() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('version',1,'manage_enabled',public.listing_photo_account_open(auth.uid()),
 'uploads_enabled',s.uploads_enabled and public.listing_photo_account_open(auth.uid()))
 from public.listing_photo_settings s where id;
$$;

-- Private metadata is inspected by a narrow definer helper. No parent rows bypass RLS.
create function public.listing_photo_access(p_path text) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('private',public.listing_photo_is_admin() or p.owner_id=auth.uid(),
 'job',p.job_post_id,'worker',p.worker_profile_id,
 'public',p.state='attached' and p.approved and p.public_display_enabled and p.content_verified_at is not null)
 from public.listing_photos p where p.storage_path=p_path and p.state<>'retired'
 and p.moderation_status not in ('rejected','removed') and p.content_deleted_at is null
 and (public.listing_photo_is_admin() or p.owner_id=auth.uid()
      or (p.state='attached' and p.approved and p.public_display_enabled and p.content_verified_at is not null))
 and public.listing_photo_account_open(p.owner_id);
$$;

-- INVOKER is essential: parent SELECTs use the actual caller's existing RLS policies.
create function public.listing_photo_can_read(p_path text) returns boolean
language sql stable security invoker set search_path='' as $$
 select coalesce((a->>'private')::boolean or ((a->>'public')::boolean and (
 exists(select 1 from public.job_posts where id=(a->>'job')::uuid)
 or exists(select 1 from public.worker_profiles where id=(a->>'worker')::uuid))),false)
 from (select public.listing_photo_access(p_path) a) access;
$$;

create function public.listing_photo_can_upload(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select public.listing_photo_account_open(auth.uid())
 and (select uploads_enabled from public.listing_photo_settings where id)
 and exists(select 1 from public.listing_photos p where p.storage_path=p_path
 and p.owner_id=auth.uid() and p.state='pending' and p.created_at>now()-interval '24 hours');
$$;
create policy listing_photos_read on public.listing_photos for select to anon,authenticated
 using(public.listing_photo_can_read(storage_path));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('listing-photos','listing-photos',false,5242880,array['image/webp']);

-- Restrictive guards AND with any existing permissive policies. Other buckets are unaffected.
-- service_role bypasses RLS and must never reach the browser.
create policy pove_lp_read_guard on storage.objects as restrictive for select to anon,authenticated
 using(bucket_id<>'listing-photos' or public.listing_photo_can_read(name));
create policy pove_lp_insert_guard on storage.objects as restrictive for insert to anon,authenticated
 with check(bucket_id<>'listing-photos' or public.listing_photo_can_upload(name));
create policy pove_lp_update_guard on storage.objects as restrictive for update to anon,authenticated
 using(bucket_id<>'listing-photos') with check(bucket_id<>'listing-photos');
create policy pove_lp_delete_guard on storage.objects as restrictive for delete to anon,authenticated
 using(bucket_id<>'listing-photos');
create policy pove_lp_read on storage.objects for select to anon,authenticated
 using(bucket_id='listing-photos' and public.listing_photo_can_read(name));
create policy pove_lp_insert on storage.objects for insert to authenticated
 with check(bucket_id='listing-photos' and public.listing_photo_can_upload(name));

create function public.reserve_listing_photo() returns jsonb
language plpgsql security definer set search_path='' as $$
declare photo_id uuid:=gen_random_uuid(); result public.listing_photos;
begin
 perform public.listing_photo_require_uploads();
 -- Serialize reservations per owner to enforce the pending-upload quota.
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 perform public.listing_photo_require_uploads();
 if (select count(*) from public.listing_photos where owner_id=auth.uid() and state='pending' and created_at>now()-interval '24 hours')>=25 then
  raise exception 'დროებითი ატვირთვების ლიმიტი ამოიწურა. სცადე მოგვიანებით.';
 end if;
 insert into public.listing_photos(id,owner_id,storage_path)
 values(photo_id,auth.uid(),auth.uid()::text||'/'||photo_id::text||'.webp') returning * into result;
 return to_jsonb(result);
end $$;

create function public.listing_photo_manifest(p_kind text,p_listing uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare listing_owner uuid;
begin
 if p_kind='jobs' then select owner_id into listing_owner from public.job_posts where id=p_listing;
 elsif p_kind='workers' then select owner_id into listing_owner from public.worker_profiles where id=p_listing;
 else raise exception 'invalid kind'; end if;
 if auth.uid() is null or listing_owner is distinct from auth.uid() then raise exception 'not owner'; end if;
 return coalesce((select jsonb_agg(to_jsonb(p) order by position) from public.listing_photos p
 where state='attached' and ((p_kind='jobs' and job_post_id=p_listing) or (p_kind='workers' and worker_profile_id=p_listing))),'[]'::jsonb);
end $$;

create function public.commit_listing_photos(p_kind text,p_listing uuid,p_expected uuid[],p_selected uuid[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare listing_owner uuid; current_ids uuid[]; expected_ids uuid[];
begin
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 perform public.listing_photo_require_account();
 -- Parent row lock serializes commits for this listing, including concurrent tabs.
 if p_kind='jobs' then select owner_id into listing_owner from public.job_posts where id=p_listing for update;
 elsif p_kind='workers' then select owner_id into listing_owner from public.worker_profiles where id=p_listing for update;
 else raise exception 'invalid kind'; end if;
 if listing_owner is distinct from auth.uid() then raise exception 'not owner'; end if;
 if p_selected is null or cardinality(p_selected)>5 or array_position(p_selected,null) is not null
 or cardinality(p_selected)<>(select count(distinct x) from unnest(p_selected) x) then raise exception 'invalid photo selection'; end if;
 select coalesce(array_agg(id order by position),'{}'::uuid[]) into current_ids from public.listing_photos
 where state='attached' and ((p_kind='jobs' and job_post_id=p_listing) or (p_kind='workers' and worker_profile_id=p_listing));
 -- Compare the previous ORDER, not only membership: a stale tab must not undo a reorder.
 expected_ids:=coalesce(p_expected,'{}'::uuid[]);
 if current_ids<>expected_ids then raise exception 'ფოტოები სხვა ფანჯარაში შეიცვალა. განაახლე ფორმა.'; end if;
 if exists(select 1 from unnest(p_selected) x where not (x=any(current_ids))) then
  perform public.listing_photo_require_uploads();
 end if;
 -- Also lock pending photos to prevent attaching one upload to two listings.
 perform id from public.listing_photos where id=any(p_selected) order by id for update;
 if (select count(*) from public.listing_photos p where p.id=any(p_selected) and p.owner_id=auth.uid()
 and ((p.state='pending' and p.created_at>now()-interval '24 hours') or p.id=any(current_ids))
 and (p.id=any(current_ids) or exists(select 1 from storage.objects o where o.bucket_id='listing-photos' and o.name=p.storage_path
 and o.metadata->>'mimetype'='image/webp')))<>cardinality(p_selected) then raise exception 'invalid or missing uploaded photo'; end if;
 -- Detach first inside the transaction; unique slots never collide when reordering.
 update public.listing_photos set state='retired',retired_at=now(),retry_at=now(),retry_count=0,job_post_id=null,worker_profile_id=null,position=null
 where id=any(current_ids);
 update public.listing_photos p set state='attached',retired_at=null,
 job_post_id=case when p_kind='jobs' then p_listing else null end,
 worker_profile_id=case when p_kind='workers' then p_listing else null end,position=s.ordinality-1
 from unnest(p_selected) with ordinality s(id,ordinality) where p.id=s.id;
 return public.listing_photo_manifest(p_kind,p_listing);
end $$;

create function public.retire_deleted_listing_photos() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 update public.listing_photos set state='retired',retired_at=now(),job_post_id=null,worker_profile_id=null,position=null
 where (TG_TABLE_NAME='job_posts' and job_post_id=old.id) or (TG_TABLE_NAME='worker_profiles' and worker_profile_id=old.id);
 return old;
end $$;
create trigger retire_job_photos before delete on public.job_posts for each row execute function public.retire_deleted_listing_photos();
create trigger retire_worker_photos before delete on public.worker_profiles for each row execute function public.retire_deleted_listing_photos();


-- Admin queue is keyset-paginated; IDs are returned only to a server-authorized admin.
create function public.listing_photo_review_queue(p_after uuid default null,p_status text default 'pending_review') returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not public.listing_photo_is_admin() then raise exception 'admin required'; end if;
 if p_status not in ('pending_review','approved','rejected','removed') then raise exception 'invalid status'; end if;
 return coalesce((select jsonb_agg(to_jsonb(q) order by id) from (
 select id,storage_path,job_post_id,worker_profile_id,moderation_status,review_reason,content_verified_at,content_deleted_at,created_at
 from public.listing_photos where state='attached' and moderation_status=p_status
 and (p_after is null or id>p_after) order by id limit 50) q),'[]'::jsonb);
end $$;

create function public.listing_photo_moderate(p_id uuid,p_decision text,p_reason text default '') returns void
language plpgsql security definer set search_path='' as $$
declare photo public.listing_photos;
begin
 if not public.listing_photo_is_admin() then raise exception 'admin required'; end if;
 if p_decision is null or p_decision not in ('approved','rejected','removed') or p_reason is null or length(p_reason)>1000 then raise exception 'invalid decision'; end if;
 if p_decision<>'approved' and length(trim(p_reason))=0 then raise exception 'reason required'; end if;
 select * into photo from public.listing_photos where id=p_id for update;
 if not found or photo.state<>'attached' then raise exception 'photo not attached'; end if;
 if photo.moderation_status in ('rejected','removed') then raise exception 'terminal decision: upload a replacement'; end if;
 if p_decision='approved' and (photo.content_deleted_at is not null or photo.content_verified_at is null or photo.content_sha256 is null
 or not exists(select 1 from storage.objects where bucket_id='listing-photos' and name=photo.storage_path)) then
 raise exception 'trusted file validation required'; end if;
 update public.listing_photos set moderation_status=p_decision,public_display_enabled=(p_decision='approved'),
 review_reason=trim(p_reason),reviewed_at=now(),retry_at=now(),retry_count=0 where id=p_id;
 insert into public.listing_photo_reviews(photo_id,actor_id,decision) values(p_id,auth.uid(),p_decision);
end $$;

-- Lease is renewed before each bounded operation; expired processes fail closed.
create function public.listing_photo_worker_lease(p_token uuid,p_action text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' or p_token is null then raise exception 'service required'; end if;
 if p_action='acquire' then
  update public.listing_photo_worker_state set token=p_token,lease_until=clock_timestamp()+interval '180 seconds'
  where id and (lease_until is null or lease_until<clock_timestamp());
 elsif p_action='renew' then
  update public.listing_photo_worker_state set lease_until=clock_timestamp()+interval '180 seconds'
  where id and token=p_token and lease_until>clock_timestamp();
 elsif p_action in ('release','success') then
  update public.listing_photo_worker_state set token=null,lease_until=null,
  last_success=case when p_action='success' then clock_timestamp() else null end
  where id and token=p_token and lease_until>clock_timestamp();
 else raise exception 'invalid lease action'; end if;
 return found;
end $$;

create function public.listing_photo_require_worker() returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' or not exists(select 1 from public.listing_photo_worker_state
 where id and token::text=(current_setting('request.headers',true)::jsonb->>'x-pove-worker-token')
 and lease_until>clock_timestamp()) then raise exception 'active worker lease required'; end if;
end $$;

create function public.listing_photo_retry(p_id uuid,p_path text) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform public.listing_photo_require_worker();
 if p_id is not null then
  update public.listing_photos set retry_count=least(retry_count+1,20),
  retry_at=now()+make_interval(secs=>least(3600,30*power(2,least(retry_count,7)))::double precision)
  where id=p_id and (state='retired' or
   (moderation_status in ('rejected','removed') and content_deleted_at is null) or
   (state='attached' and moderation_status='pending_review' and content_verified_at is null));
 else
  insert into public.listing_photo_orphan_retries(storage_path,retry_count,retry_at)
  values(p_path,1,now()+interval '30 seconds') on conflict(storage_path) do update
  set retry_count=least(listing_photo_orphan_retries.retry_count+1,20),
  retry_at=now()+make_interval(secs=>least(3600,30*power(2,least(listing_photo_orphan_retries.retry_count,7)))::double precision);
 end if;
end $$;

create function public.listing_photo_set_uploads(p_enabled boolean) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' or p_enabled is null then raise exception 'service required'; end if;
 if p_enabled and not exists(select 1 from public.listing_photo_worker_state where id and last_success>now()-interval '5 minutes') then
  raise exception 'recent successful worker cycle required'; end if;
 if p_enabled and (exists(select 1 from public.listing_photos where retry_count>0 and content_deleted_at is null)
 or exists(select 1 from public.listing_photo_orphan_retries)) then raise exception 'resolve photo retry backlog first'; end if;
 update public.listing_photo_settings set uploads_enabled=p_enabled where id;
 if not found then raise exception 'settings row missing'; end if;
 return (select uploads_enabled from public.listing_photo_settings where id);
end $$;

-- Service-only functions: worker validates actual downloaded bytes, never browser assertions.
create function public.listing_photo_validation_batch() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform public.listing_photo_require_worker();
 return coalesce((select jsonb_agg(to_jsonb(q)) from (select id,storage_path from public.listing_photos
 where state='attached' and moderation_status='pending_review' and content_verified_at is null and retry_at<=now()
 order by retry_at,id limit 50) q),'[]'::jsonb);
end $$;

create function public.listing_photo_record_validation(p_id uuid,p_sha256 text,p_valid boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform public.listing_photo_require_worker();
 if p_valid is null or (p_valid and (p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$')) then raise exception 'invalid attestation'; end if;
 perform id from public.listing_photos where id=p_id and state='attached' and moderation_status='pending_review' for update;
 if not found then return; end if;
 update public.listing_photos set content_verified_at=case when p_valid then now() else null end,
 content_sha256=case when p_valid then p_sha256 else null end,
 moderation_status=case when p_valid then 'pending_review' else 'rejected' end,
 review_reason=case when p_valid then '' else 'ფაილის უსაფრთხოების შემოწმება ვერ გაიარა. ატვირთე სხვა ფოტო.' end,
 public_display_enabled=false,retry_at=now(),retry_count=0 where id=p_id;
 insert into public.listing_photo_reviews(photo_id,decision) values(p_id,case when p_valid then 'file_validated' else 'file_invalid' end);
end $$;

create function public.listing_photo_gc_batch() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform public.listing_photo_require_worker();
 -- Locks re-check state; concurrent commit cannot attach a retired upload.
 with stale as (select id from public.listing_photos where state='pending' and created_at<now()-interval '24 hours'
 order by created_at limit 100 for update skip locked)
 update public.listing_photos p set state='retired',retired_at=now(),public_display_enabled=false
 from stale where p.id=stale.id and p.state='pending';
 return coalesce((select jsonb_agg(to_jsonb(q)) from (select id,storage_path from public.listing_photos
 where (state='retired' or moderation_status in ('rejected','removed')) and (state='retired' or content_deleted_at is null) and retry_at<=now()
 order by retry_count,(moderation_status='removed') desc,retry_at,id limit 100) q),'[]'::jsonb);
end $$;

create function public.listing_photo_gc_finish(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform public.listing_photo_require_worker();
 if exists(select 1 from public.listing_photos p join storage.objects o
 on o.bucket_id='listing-photos' and o.name=p.storage_path where p.id=p_id) then
  raise exception 'Storage object still present; retry cleanup';
 end if;
 update public.listing_photos p set content_deleted_at=now(),public_display_enabled=false
 where p.id=p_id and (p.state='retired' or p.moderation_status in ('rejected','removed'))
 and not exists(select 1 from storage.objects o where o.bucket_id='listing-photos' and o.name=p.storage_path);
 delete from public.listing_photos where id=p_id and state='retired' and content_deleted_at is not null;
end $$;

create function public.listing_photo_orphan_batch() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform public.listing_photo_require_worker();
 delete from public.listing_photo_orphan_retries r where not exists(
 select 1 from storage.objects o where o.bucket_id='listing-photos' and o.name=r.storage_path);
 -- A record is reserved BEFORE upload; old unreferenced paths cannot be reattached by a user.
 -- Only our exact canonical namespace. Unknown paths require separate manual investigation.
 return coalesce((select jsonb_agg(to_jsonb(q)) from (select o.name as storage_path from storage.objects o
 where o.bucket_id='listing-photos' and o.created_at<now()-interval '48 hours'
 and o.name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$'
 and not exists(select 1 from public.listing_photos p where p.storage_path=o.name)
 and not exists(select 1 from public.listing_photo_orphan_retries r where r.storage_path=o.name and r.retry_at>now())
 order by coalesce((select r.retry_at from public.listing_photo_orphan_retries r where r.storage_path=o.name),o.created_at),o.name limit 100) q),'[]'::jsonb);
end $$;

create function public.listing_photo_prepare_account_deletion(p_owner uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' or p_owner is null then raise exception 'service and owner required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 insert into public.listing_photo_account_blocks(owner_id) values(p_owner) on conflict do nothing;
 update public.listing_photos set state='retired',retired_at=now(),job_post_id=null,worker_profile_id=null,
 position=null,public_display_enabled=false,retry_at=now(),retry_count=0 where owner_id=p_owner;
end $$;

-- Safety net for a separately authorized profile deletion: durable rows survive until Storage cleanup.
create function public.listing_photo_profile_deleted() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(old.id::text,0));
 insert into public.listing_photo_account_blocks(owner_id) values(old.id) on conflict do nothing;
 update public.listing_photos set state='retired',retired_at=now(),job_post_id=null,worker_profile_id=null,
 position=null,public_display_enabled=false,retry_at=now(),retry_count=0 where owner_id=old.id;
 return old;
end $$;
create trigger retire_profile_listing_photos before delete on public.profiles
 for each row execute function public.listing_photo_profile_deleted();

-- Counts only: no identity/contact data. No Auth/profile deletion is implemented here.
create function public.listing_photo_account_cleanup_status(p_owner uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' or p_owner is null then raise exception 'service required'; end if;
 return jsonb_build_object('blocked',exists(select 1 from public.listing_photo_account_blocks where owner_id=p_owner),
 'records',(select count(*) from public.listing_photos where owner_id=p_owner),
 'objects',(select count(*) from storage.objects where bucket_id='listing-photos' and name like p_owner::text||'/%'));
end $$;

-- Default function ACLs can grant PUBLIC execute. Explicitly revoke on EVERY new function.
do $$
declare f record;
begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and (p.proname like 'listing_photo_%' or p.proname in
 ('reserve_listing_photo','commit_listing_photos','retire_deleted_listing_photos')) loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 end loop;
end $$;
grant execute on function public.listing_photo_access(text),public.listing_photo_is_admin(),public.listing_photo_can_read(text),public.listing_photo_can_upload(text) to anon,authenticated;
grant execute on function public.listing_photo_capabilities(),public.reserve_listing_photo(),public.listing_photo_manifest(text,uuid),
 public.commit_listing_photos(text,uuid,uuid[],uuid[]),public.listing_photo_review_queue(uuid,text),public.listing_photo_moderate(uuid,text,text) to authenticated;
grant execute on function public.listing_photo_validation_batch(),public.listing_photo_record_validation(uuid,text,boolean),
 public.listing_photo_gc_batch(),public.listing_photo_gc_finish(uuid),public.listing_photo_orphan_batch(),
 public.listing_photo_prepare_account_deletion(uuid),public.listing_photo_account_cleanup_status(uuid),
 public.listing_photo_worker_lease(uuid,text),public.listing_photo_retry(uuid,text),public.listing_photo_set_uploads(boolean) to service_role;
commit;
