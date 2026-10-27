-- REVIEW ONLY: execute only after separate approval and role-based integration tests.
-- Read-only SECURITY INVOKER RPC: existing table/column grants and RLS still apply.
begin;
create function public.pove_listing_candidates_v1(
  p_kind text, p_page bigint default 1, p_size integer default 12,
  p_sort text default 'newest', p_city text default '', p_payment text default '',
  p_active_only boolean default false, p_id text default null
) returns jsonb language plpgsql stable security invoker set search_path = '' as $fn$
begin
  if p_kind = 'capabilities' then return '{"version":1}'::jsonb; end if;
  if p_kind not in ('jobs','workers','home') or p_page < 1 or p_page > 90071992547409
    or p_size < 1 or p_size > 100 or p_sort not in ('newest','oldest','price-asc','price-desc')
    or length(p_city) > 200 or length(coalesce(p_id,'')) > 200
    or p_payment not in ('','all','daily','hourly','fixed','negotiable')
    or p_kind is null or p_page is null or p_size is null or p_sort is null
    or p_city is null or p_payment is null then
    raise exception 'Invalid listing query parameters' using errcode = '22023';
  end if;
  return (
    with source as (
      select 'jobs'::text kind, j.id, j.owner_id, j.legacy_id::text legacy_id,
        j.created_at, j.updated_at, j.status::text status, j.city,
        j.payment_type::text payment_type, coalesce(j.payment_min,j.payment_amount) price,
        jsonb_build_object('title',j.title,'description',j.description,'date',coalesce(j.work_date::text,''),
          'dateEnd',coalesce(j.work_date_end::text,''),'dateMode',j.date_mode,
          'start',coalesce(j.start_time::text,''),'startTime',coalesce(j.start_time::text,''),
          'end',coalesce(j.end_time::text,''),'endTime',coalesce(j.end_time::text,''),
          'duration',coalesce(j.duration,''),'paymentType',j.payment_type,
          'pay',j.payment_amount,'paymentAmount',j.payment_amount,'paymentMin',j.payment_min,
          'paymentMax',j.payment_max,'name',j.display_name,'isUrgent',j.is_urgent,
          'area',coalesce(j.area,''),'district',coalesce(j.area,''),'posted','ახლახან') fields
      from public.job_posts j where p_kind in ('jobs','home')
      union all
      select 'workers',w.id,w.owner_id,w.legacy_id::text,w.created_at,w.updated_at,w.status::text,w.city,
        w.payment_type::text,w.pay,
        jsonb_build_object('name',w.display_name,'area',coalesce(w.area,''),'district',coalesce(w.area,''),
          'hasExperience',w.has_experience,'experienceDuration',coalesce(w.experience_duration,''),
          'exp',coalesce(w.experience_duration,''),'paymentType',w.payment_type,'pay',w.pay,
          'availability',w.availability,'offer',w.offer,'about',w.about,'avatarUrl',coalesce(w.avatar_path,''))
      from public.worker_profiles w where p_kind in ('workers','home')
    ), filtered as materialized (
      select * from source s where
        (not (p_active_only or p_kind='home')
          or (s.kind='jobs' and s.status='active')
          or (s.kind='workers' and s.status='published'))
        and (p_id is null or s.id::text=p_id or s.legacy_id=p_id)
        and (p_city='' or strpos(lower(coalesce(s.city,'')),lower(p_city))>0)
        and (p_payment in ('','all') or coalesce(s.payment_type,'daily')=p_payment)
    ), totals as (select count(*) n from filtered), bounds as (
      select n, greatest(1,least(p_page,greatest(1,ceil(n::numeric/p_size)::bigint))) page from totals
    ), selected as (
      select s.*, row_number() over (order by
        case when p_kind='jobs' then case s.status when 'active' then 0 when 'completed' then 1 else 2 end else 0 end,
        case when p_sort='price-asc' then s.price end asc nulls last,
        case when p_sort='price-desc' then s.price end desc nulls last,
        case when p_sort='oldest' then s.created_at end asc nulls first,
        case when p_sort='newest' then s.created_at end desc nulls last,
        s.kind asc,s.id asc) ordinal
      from filtered s
      order by ordinal offset (select (page-1)*p_size from bounds) limit p_size
    ), enriched as (
      select s.ordinal, s.kind, s.fields || jsonb_build_object(
        'id',coalesce(s.legacy_id,s.id::text),'uuid',s.id,'legacyId',s.legacy_id,'owner',s.owner_id,
        'createdAt',coalesce(extract(epoch from s.created_at)*1000,0),
        'updatedAt',coalesce(extract(epoch from coalesce(s.updated_at,s.created_at))*1000,0),
        'city',s.city,'status',s.status,'phone','',
        'categorySelections',links.items,'category',coalesce(links.items->0->>'main',''),
        'subcategory',coalesce(links.items->0->>'sub',''),
        'skills',coalesce((select jsonb_agg(coalesce(nullif(e->>'sub',''),e->>'main')) from jsonb_array_elements(links.items) e),'[]'::jsonb)
      ) item from selected s
      cross join lateral (
        select coalesce(jsonb_agg(jsonb_build_object('main',
          case c.name when 'ღონისძიებები' then 'ღონისძიებები და ორგანიზება'
            when 'ონლაინ / კომპიუტერული' then 'კომპიუტერული მომსახურება' else c.name end,
          'sub',case when c.name='მიტანა და გადაადგილება' and sc.name='მანქანით დახმარება'
            then 'მძღოლით/მანქანით დახმარება' else coalesce(sc.name,'') end)), '[]'::jsonb) items
        from (
          select category_id,subcategory_id from public.job_post_categories where s.kind='jobs' and job_post_id=s.id
          union all
          select category_id,subcategory_id from public.worker_profile_categories where s.kind='workers' and worker_profile_id=s.id
        ) l join public.categories c on c.id=l.category_id
        left join public.subcategories sc on sc.id=l.subcategory_id
      ) links
    ) select jsonb_build_object('rows',coalesce((select jsonb_agg(item || jsonb_build_object('_kind',kind) order by ordinal) from enriched),'[]'::jsonb),
      'total',n,'page',page,'pages',ceil(n::numeric/p_size),'size',p_size) from bounds
  );
end;
$fn$;
revoke all on function public.pove_listing_candidates_v1(text,bigint,integer,text,text,text,boolean,text) from public;
grant execute on function public.pove_listing_candidates_v1(text,bigint,integer,text,text,text,boolean,text) to anon,authenticated;
commit;
