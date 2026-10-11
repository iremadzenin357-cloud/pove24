-- LOCAL / STAGING REVIEW ONLY. Does not enable automated deletion.
-- A reviewed data-retention/schema adapter is mandatory; no FK cascades are assumed.
begin;
do $$
begin
 if to_regclass('public.account_deletion_requests') is not null
 or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname like 'pove_account_deletion_%')
 or exists(select 1 from pg_trigger where tgname='pove_account_deletion_write_guard')
 or exists(select 1 from pg_policies where policyname like 'pove_account_deletion_%') then
  raise exception 'Account deletion objects already exist: review, do not replace';
 end if;
 if has_schema_privilege('anon','public','CREATE')
 or has_schema_privilege('authenticated','public','CREATE') then
  raise exception 'Untrusted public schema CREATE privilege';
 end if;
 if to_regclass('public.profiles') is null or to_regclass('public.job_posts') is null
 or to_regclass('public.worker_profiles') is null or to_regclass('storage.objects') is null then
  raise exception 'Required baseline is missing';
 end if;
end $$;

-- No Auth/Profile FK: request and recovery checkpoints survive account deletion.
create table public.account_deletion_requests (
 owner_id uuid primary key,
 request_id uuid not null unique default gen_random_uuid(),
 status text not null default 'requested'
   check(status in ('requested','verified','processing','data_removed','completed')),
 requested_at timestamptz not null default now(),
 verified_at timestamptz,
 completed_at timestamptz,
 attempt_window timestamptz not null default now(),
 attempts integer not null default 0,
 lease_token uuid,
 lease_until timestamptz,
 retry_needed boolean not null default false
);
alter table public.account_deletion_requests enable row level security;
revoke all on public.account_deletion_requests from public,anon,authenticated,service_role;

create function public.pove_account_deletion_frozen(p_owner uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.account_deletion_requests
 where owner_id=p_owner and status in ('processing','data_removed','completed'));
$$;

create function public.pove_account_deletion_request() returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.account_deletion_requests;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 insert into public.account_deletion_requests(owner_id) values(auth.uid())
 on conflict(owner_id) do nothing;
 select * into r from public.account_deletion_requests where owner_id=auth.uid();
 return jsonb_build_object('request_id',r.request_id,'status',r.status,
 'automatic_ready',to_regprocedure('public.pove_account_deletion_reviewed_cleanup(uuid,boolean)') is not null);
end $$;

-- Prevent stale browser sessions and existing user RPCs from writing after freeze.
-- This intentionally applies to all existing public base tables, including messaging.
create function public.pove_account_deletion_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare link record; subject text;
begin
 if public.pove_account_deletion_frozen(auth.uid()) then
  raise exception 'Account deletion in progress';
 end if;
 if TG_OP='DELETE' then return old; end if;
 -- Also stop another user from adding a new direct account/profile reference
 -- during cleanup. Derive actual FK columns from catalogs; do not guess names.
 if auth.role() is distinct from 'service_role' then
  for link in
   select a.attname from pg_constraint c
   join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
   join pg_attribute target on target.attrelid=c.confrelid and target.attnum=c.confkey[1]
   where c.conrelid=TG_RELID and c.contype='f' and cardinality(c.conkey)=1
   and c.confrelid in ('public.profiles'::regclass,'auth.users'::regclass)
   and target.attname='id' and a.atttypid='uuid'::regtype
  loop
   subject:=to_jsonb(new)->>link.attname;
   if subject is not null and public.pove_account_deletion_frozen(subject::uuid) then
    raise exception 'Referenced account deletion in progress';
   end if;
  end loop;
 end if;
 return new;
end $$;
do $$ declare r record;
begin
 for r in select c.oid::regclass as rel from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind in ('r','p') and not c.relispartition
 and c.relname<>'account_deletion_requests' loop
  execute format('create trigger pove_account_deletion_write_guard before insert or update or delete on %s for each row execute function public.pove_account_deletion_guard()',r.rel);
 end loop;
end $$;

-- Bucket settings remain unchanged. Block new/replacement bytes during cleanup.
create policy pove_account_deletion_storage_insert on storage.objects as restrictive
for insert to authenticated with check (
 not public.pove_account_deletion_frozen(auth.uid()) and
 (bucket_id not in ('profile-photos','listing-photos') or
 not public.pove_account_deletion_frozen(
 case when split_part(name,'/',1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 then split_part(name,'/',1)::uuid else null end))
);
create policy pove_account_deletion_storage_update on storage.objects as restrictive
for update to authenticated using (not public.pove_account_deletion_frozen(auth.uid()))
with check (not public.pove_account_deletion_frozen(auth.uid()) and
 (bucket_id not in ('profile-photos','listing-photos') or
 not public.pove_account_deletion_frozen(
 case when split_part(name,'/',1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 then split_part(name,'/',1)::uuid else null end)));

-- Operator inbox: server-side administrator verification, not frontend role flags.
create function public.pove_account_deletion_inbox(p_after uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin'
 or not exists(select 1 from public.profiles where id=auth.uid() and status='active') then
  raise exception 'Administrator required';
 end if;
 return coalesce((select jsonb_agg(to_jsonb(q) order by request_id) from (
 select request_id,owner_id,status,requested_at,retry_needed from public.account_deletion_requests
 where status<>'completed' and (p_after is null or request_id>p_after)
 order by request_id limit 50) q),'[]'::jsonb);
end $$;

-- Service-only state machine. JWT subject never comes from a browser-supplied ID.
create function public.pove_account_deletion_resume_subject(p_request uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare subject uuid;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service required'; end if;
 select owner_id into subject from public.account_deletion_requests
 where request_id=p_request and status in ('processing','data_removed');
 return subject;
end $$;

create function public.pove_account_deletion_step(p_action text,p_owner uuid,p_token uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.account_deletion_requests; approved boolean;
begin
 if auth.role() is distinct from 'service_role' or p_owner is null then
  raise exception 'Service required';
 end if;
 select * into r from public.account_deletion_requests where owner_id=p_owner for update;
 if not found then raise exception 'Request required'; end if;
 if p_action='attempt' then
  if r.attempt_window<now()-interval '15 minutes' then
   r.attempts:=0; r.attempt_window:=now();
  end if;
  if r.attempts>=5 then raise exception 'Try later'; end if;
  update public.account_deletion_requests set attempts=r.attempts+1,attempt_window=r.attempt_window where owner_id=p_owner;
  return '{}'::jsonb;
 elsif p_action='verify' then
  update public.account_deletion_requests set verified_at=now(),
   status=case when status='requested' then 'verified' else status end where owner_id=p_owner;
  return '{}'::jsonb;
 elsif p_action='claim' then
  if r.status='completed' then return jsonb_build_object('status','completed'); end if;
  if p_token is null or (r.lease_until>clock_timestamp()) then raise exception 'Busy'; end if;
  if r.status in ('requested','verified') then
   if r.verified_at is null or r.verified_at<now()-interval '5 minutes' then raise exception 'Fresh verification required'; end if;
   if to_regprocedure('public.pove_account_deletion_reviewed_cleanup(uuid,boolean)') is null then
    raise exception 'Schema and retention review required';
   end if;
   -- Adapter must inspect current FK/trigger fingerprint, ownership and retention rules.
   execute 'select public.pove_account_deletion_reviewed_cleanup($1,false)' into approved using p_owner;
   if approved is distinct from true then raise exception 'Review required'; end if;
  end if;
  update public.account_deletion_requests set
   status=case when status='data_removed' then status else 'processing' end,
   lease_token=p_token,lease_until=clock_timestamp()+interval '10 minutes',retry_needed=false where owner_id=p_owner
   returning * into r;
  return jsonb_build_object('status',r.status);
 end if;
 if p_token is null or r.lease_token is distinct from p_token
 or r.lease_until<=clock_timestamp() or r.lease_until is null then raise exception 'Lease required'; end if;
 if p_action='renew' then
  update public.account_deletion_requests set lease_until=clock_timestamp()+interval '10 minutes' where owner_id=p_owner;
 elsif p_action='prepare_photos' then
  if to_regclass('public.listing_photos') is not null then
   if to_regprocedure('public.listing_photo_prepare_account_deletion(uuid)') is null then raise exception 'Unsupported photo schema'; end if;
   execute 'select public.listing_photo_prepare_account_deletion($1)' using p_owner;
  end if;
 elsif p_action='files' then
  return coalesce((select jsonb_agg(to_jsonb(q)) from (
   select bucket_id,name from storage.objects o where bucket_id in ('profile-photos','listing-photos')
   and (split_part(name,'/',1)=p_owner::text or coalesce(to_jsonb(o)->>'owner_id',to_jsonb(o)->>'owner')=p_owner::text)
   order by bucket_id,name limit 100) q),'[]'::jsonb);
 elsif p_action='erase_data' then
  if r.status='data_removed' then return '{}'::jsonb; end if;
  if r.status<>'processing' then raise exception 'Invalid phase'; end if;
  if exists(select 1 from storage.objects o where bucket_id in ('profile-photos','listing-photos')
   and (split_part(name,'/',1)=p_owner::text or coalesce(to_jsonb(o)->>'owner_id',to_jsonb(o)->>'owner')=p_owner::text)) then
   raise exception 'Files remain';
  end if;
  execute 'select public.pove_account_deletion_reviewed_cleanup($1,true)' into approved using p_owner;
  if approved is distinct from true or exists(select 1 from public.profiles where id=p_owner)
  or exists(select 1 from public.job_posts where owner_id=p_owner)
  or exists(select 1 from public.worker_profiles where owner_id=p_owner) then raise exception 'Cleanup incomplete'; end if;
  update public.account_deletion_requests set status='data_removed' where owner_id=p_owner;
 elsif p_action='complete' then
  if r.status<>'data_removed' then raise exception 'Data cleanup required'; end if;
  update public.account_deletion_requests set status='completed',completed_at=now(),lease_token=null,lease_until=null,retry_needed=false where owner_id=p_owner;
 elsif p_action='release' then
  update public.account_deletion_requests set lease_token=null,lease_until=null,retry_needed=true where owner_id=p_owner;
 else raise exception 'Unknown action'; end if;
 return '{}'::jsonb;
end $$;

revoke all on function public.pove_account_deletion_request(),public.pove_account_deletion_inbox(uuid),
public.pove_account_deletion_step(text,uuid,uuid),public.pove_account_deletion_guard(),
public.pove_account_deletion_frozen(uuid),public.pove_account_deletion_resume_subject(uuid)
from public,anon,authenticated,service_role;
grant execute on function public.pove_account_deletion_request(),public.pove_account_deletion_inbox(uuid),
public.pove_account_deletion_frozen(uuid) to authenticated;
grant execute on function public.pove_account_deletion_step(text,uuid,uuid),
public.pove_account_deletion_resume_subject(uuid) to service_role;
commit;
