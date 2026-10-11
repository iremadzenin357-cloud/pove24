-- REVIEW ONLY. NOT EXECUTED. Requires the existing public.categories,
-- subcategories, job_posts, worker_profiles and profiles schema (UUID ids).
-- Does not change existing listing visibility, timestamps, or account-avatar storage.
begin;

insert into public.categories(name,is_active) values ('სილამაზე და თავის მოვლა',true)
on conflict(name) do update set is_active=true;
insert into public.subcategories(category_id,name,is_active)
select c.id,s.name,true from public.categories c cross join (values
 ('მანიკიური და პედიკიური'),('მაკიაჟი და ვიზაჟი'),('თმის სტილისტი'),
 ('წარბები და წამწამები'),('კოსმეტოლოგია'),('სხვა სილამაზის მომსახურება')
) s(name) where c.name='სილამაზე და თავის მოვლა'
on conflict(category_id,name) do update set is_active=true;

create table public.listing_photos (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.profiles(id),
 job_post_id uuid references public.job_posts(id) on delete set null,
 worker_profile_id uuid references public.worker_profiles(id) on delete set null,
 storage_path text not null unique,
 state text not null default 'pending' check(state in ('pending','attached','retired')),
 position smallint check(position between 0 and 4),
 approved boolean not null default false,
 public_display_enabled boolean not null default false,
 created_at timestamptz not null default now(),
 retired_at timestamptz,
 constraint listing_photos_relationship check (
   (state='attached' and num_nonnulls(job_post_id,worker_profile_id)=1 and position is not null)
   or (state in ('pending','retired') and job_post_id is null and worker_profile_id is null and position is null)
 ),
 constraint listing_photos_safe_path check(storage_path=owner_id::text||'/'||id::text||'.webp')
);
create index listing_photos_owner_idx on public.listing_photos(owner_id,state);
create unique index listing_photos_job_slot on public.listing_photos(job_post_id,position) where state='attached';
create unique index listing_photos_worker_slot on public.listing_photos(worker_profile_id,position) where state='attached';
alter table public.listing_photos enable row level security;
revoke all on public.listing_photos from anon,authenticated;
grant select,delete on public.listing_photos to authenticated;
grant select on public.listing_photos to anon;
create policy listing_photos_owner_read on public.listing_photos for select to authenticated using(owner_id=auth.uid());
create policy listing_photos_retired_delete on public.listing_photos for delete to authenticated using(owner_id=auth.uid() and state='retired');
create policy listing_photos_approved_read on public.listing_photos for select to anon,authenticated using (
 state='attached' and approved and public_display_enabled and (
  exists(select 1 from public.job_posts j where j.id=job_post_id and j.status='active')
  or exists(select 1 from public.worker_profiles w where w.id=worker_profile_id and w.status='published')
 )
);

-- Private bucket: even knowing a URL is insufficient without a read policy/signature.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('listing-photos','listing-photos',false,5242880,array['image/webp']);
create policy listing_photo_upload_reserved on storage.objects for insert to authenticated with check (
 bucket_id='listing-photos' and exists(select 1 from public.listing_photos p
 where p.storage_path=name and p.owner_id=auth.uid() and p.state='pending' and p.created_at>now()-interval '24 hours')
);
-- No UPDATE policy: uploaded objects cannot be overwritten or switched after approval.
create policy listing_photo_owner_read on storage.objects for select to authenticated using (
 bucket_id='listing-photos' and exists(select 1 from public.listing_photos p where p.storage_path=name and p.owner_id=auth.uid())
);
create policy listing_photo_public_approved_read on storage.objects for select to anon,authenticated using (
 bucket_id='listing-photos' and exists(select 1 from public.listing_photos p where p.storage_path=name
 and p.state='attached' and p.approved and p.public_display_enabled and (
 exists(select 1 from public.job_posts j where j.id=p.job_post_id and j.status='active')
 or exists(select 1 from public.worker_profiles w where w.id=p.worker_profile_id and w.status='published')))
);
create policy listing_photo_retired_delete on storage.objects for delete to authenticated using (
 bucket_id='listing-photos' and exists(select 1 from public.listing_photos p where p.storage_path=name and p.owner_id=auth.uid() and p.state='retired')
);

create function public.reserve_listing_photo() returns jsonb
language plpgsql security definer set search_path='' as $$
declare photo_id uuid:=gen_random_uuid(); result public.listing_photos;
begin
 if auth.uid() is null then raise exception 'authentication required'; end if;
 -- Serialize reservations per owner to enforce the pending-upload quota.
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
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
 if auth.uid() is null then raise exception 'authentication required'; end if;
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
 -- Also lock pending photos to prevent attaching one upload to two listings.
 perform id from public.listing_photos where id=any(p_selected) order by id for update;
 if (select count(*) from public.listing_photos p where p.id=any(p_selected) and p.owner_id=auth.uid()
 and (p.state='pending' or p.id=any(current_ids))
 and exists(select 1 from storage.objects o where o.bucket_id='listing-photos' and o.name=p.storage_path
 and o.metadata->>'mimetype'='image/webp'))<>cardinality(p_selected) then raise exception 'invalid or missing uploaded photo'; end if;
 -- Detach first inside the transaction; unique slots never collide when reordering.
 update public.listing_photos set state='retired',retired_at=now(),job_post_id=null,worker_profile_id=null,position=null
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

revoke all on function public.reserve_listing_photo(),public.listing_photo_manifest(text,uuid),public.commit_listing_photos(text,uuid,uuid[],uuid[]),public.retire_deleted_listing_photos() from public,anon,authenticated;
grant execute on function public.reserve_listing_photo(),public.listing_photo_manifest(text,uuid),public.commit_listing_photos(text,uuid,uuid[],uuid[]) to authenticated;
commit;
