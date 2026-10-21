-- Review only: not executed. Add one subcategory without changing existing rows.
-- Reuses the existing parent UUID and the existing category/name unique key.
begin;
do $nurse_category$
declare
  parent_id uuid;
  parent_active boolean;
begin
  select id, is_active into strict parent_id, parent_active
  from public.categories where name = 'ადამიანების დახმარება';
  if parent_active is distinct from true then
    raise exception 'The existing parent category is inactive; review required.';
  end if;
  if exists (
    select 1 from public.subcategories
    where category_id = parent_id and name = 'ექთანი / მედდა'
      and is_active is distinct from true
  ) then
    raise exception 'The existing nurse subcategory is inactive; review required.';
  end if;
  insert into public.subcategories(category_id, name, is_active)
  values (parent_id, 'ექთანი / მედდა', true)
  on conflict (category_id, name) do nothing;
end;
$nurse_category$;
commit;
