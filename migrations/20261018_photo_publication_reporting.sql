-- Apply once after 20261010_listing_photo_infrastructure.sql. Upload flag unchanged.
-- No backfill: historical verified pending photos remain manually reviewable.
begin;
create or replace function public.listing_photo_record_validation(p_id uuid,p_sha256 text,p_valid boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform public.listing_photo_require_worker();
 if p_valid is null or (p_valid and (p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$')) then raise exception 'invalid attestation'; end if;
 perform id from public.listing_photos where id=p_id and state='attached' and moderation_status='pending_review' and content_deleted_at is null
 and public.listing_photo_account_open(owner_id) for update;
 if not found then return; end if;
 if p_valid and not exists(select 1 from storage.objects o join public.listing_photos p on p.storage_path=o.name where p.id=p_id and o.bucket_id='listing-photos') then raise exception 'validated object missing'; end if;
 update public.listing_photos set content_verified_at=case when p_valid then now() else null end,
 content_sha256=case when p_valid then p_sha256 else null end,
 moderation_status=case when p_valid then 'approved' else 'rejected' end,
 review_reason=case when p_valid then '' else 'ფაილის უსაფრთხოების შემოწმება ვერ გაიარა. ატვირთე სხვა ფოტო.' end,
 public_display_enabled=p_valid,reviewed_at=now(),retry_at=now(),retry_count=0 where id=p_id;
 insert into public.listing_photo_reviews(photo_id,decision) values(p_id,case when p_valid then 'file_validated' else 'file_invalid' end);
 if p_valid then insert into public.listing_photo_reviews(photo_id,decision) values(p_id,'auto_approved'); end if;
end $$;

alter table public.reports
 add column worker_profile_id uuid references public.worker_profiles(id) on delete set null,
 add column listing_photo_id uuid references public.listing_photos(id) on delete set null;
create index reports_worker_profile_idx on public.reports(worker_profile_id);
create index reports_listing_photo_idx on public.reports(listing_photo_id);
-- Existing RLS remains authoritative.
grant select(worker_profile_id,listing_photo_id), insert(worker_profile_id,listing_photo_id) on public.reports to authenticated;

-- Invoker target lookup respects the reporter's existing listing and photo SELECT RLS.
create function public.validate_report_listing_target() returns trigger
language plpgsql set search_path='' as $$
declare photo_job uuid; photo_worker uuid; target_owner uuid;
begin
 if TG_OP='UPDATE' then
  -- FK SET NULL cleanup must remain possible. API callers cannot retarget reports.
  if new.job_post_id is not distinct from old.job_post_id
   and new.worker_profile_id is not distinct from old.worker_profile_id
   and new.listing_photo_id is not distinct from old.listing_photo_id
   and new.target_user_id is not distinct from old.target_user_id then return new; end if;
  if pg_trigger_depth()>1 and new.job_post_id is not distinct from old.job_post_id
   and new.target_user_id is not distinct from old.target_user_id
   and (new.worker_profile_id is null or new.worker_profile_id is not distinct from old.worker_profile_id)
   and (new.listing_photo_id is null or new.listing_photo_id is not distinct from old.listing_photo_id) then return new; end if;
  raise exception 'report target is immutable';
 end if;
 if new.listing_photo_id is not null then
  select job_post_id,worker_profile_id into photo_job,photo_worker
   from public.listing_photos where id=new.listing_photo_id and state='attached';
  if not found then raise exception 'photo unavailable'; end if;
  if new.job_post_id is distinct from photo_job or new.worker_profile_id is distinct from photo_worker then raise exception 'photo target mismatch'; end if;
 end if;
 if new.job_post_id is not null and new.worker_profile_id is not null then raise exception 'ambiguous target'; end if;
 if new.worker_profile_id is not null then
  select owner_id into target_owner from public.worker_profiles where id=new.worker_profile_id;
  if not found then raise exception 'listing unavailable'; end if;
 elsif new.job_post_id is not null then
  select owner_id into target_owner from public.job_posts where id=new.job_post_id;
  if not found then raise exception 'listing unavailable'; end if;
 end if;
 if target_owner is not null then
  if new.target_user_id is not null and new.target_user_id<>target_owner then raise exception 'owner mismatch'; end if;
  new.target_user_id=target_owner;
 end if;
 return new;
end $$;
create trigger validate_report_listing_target before insert or update on public.reports
 for each row execute function public.validate_report_listing_target();
revoke all on function public.validate_report_listing_target() from public,anon,authenticated;

create function public.listing_photo_review_one(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not public.listing_photo_is_admin() then raise exception 'admin required'; end if;
 return (select jsonb_build_object('id',id,'storage_path',storage_path,
 'job_post_id',job_post_id,'worker_profile_id',worker_profile_id,
 'moderation_status',moderation_status,'review_reason',review_reason,
 'content_verified_at',content_verified_at,'content_deleted_at',content_deleted_at)
 from public.listing_photos where id=p_id and state='attached');
end $$;
revoke all on function public.listing_photo_review_one(uuid) from public,anon;
grant execute on function public.listing_photo_review_one(uuid) to authenticated;
commit;
