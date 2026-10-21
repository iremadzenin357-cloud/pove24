-- REVIEW ONLY: not executed. Run as the database administrator after approval.
-- Additions only; rerunnable. Preserve names, UUIDs, inactive rows and all links.
-- Requires existing unique keys categories(name), subcategories(category_id,name)
-- and UUID defaults from the existing schema. No photo migrations are required.
begin;

do $catalog_sync$
declare
  item record;
  category_uuid uuid;
  category_active boolean;
  child_name text;
  event_matches integer;
begin
  for item in
    select * from (values
      ('სილამაზე და თავის მოვლა', array[
        'მანიკიური და პედიკიური',
        'მაკიაჟი და ვიზაჟი',
        'თმის სტილისტი',
        'წარბები და წამწამები',
        'კოსმეტოლოგია',
        'სხვა სილამაზის მომსახურება'
      ]::text[], true),
      ('დიზაინი და ციფრული მომსახურება', array[
        'ლოგო და ბრენდინგი',
        'გრაფიკული დიზაინი',
        'ვიდეომონტაჟი და ანიმაცია',
        'ფოტოგრაფია და ფოტორედაქტირება',
        'ვებსაიტებისა და აპლიკაციების შექმნა',
        'მარკეტინგი და სოციალური ქსელები',
        'AI და ციფრული კონტენტი',
        'სხვა ციფრული მომსახურება'
      ]::text[], true),
      ('ღონისძიებები', array[
        'ფოტოგრაფი',
        'დეკორატორი',
        'წამყვანი',
        'თამადა',
        'დიჯეი'
      ]::text[], false)
    ) as wanted(category_name, children, allow_new_category)
  loop
    if item.allow_new_category then
      insert into public.categories(name, is_active)
      values (item.category_name, true)
      on conflict (name) do nothing;

      select c.id, c.is_active into strict category_uuid, category_active
      from public.categories c where c.name = item.category_name;
    else
      -- Reuse the existing event UUID under either known display-name variant.
      -- Never rename it or create a second event category.
      select count(*) into event_matches from public.categories c
      where c.name in ('ღონისძიებები', 'ღონისძიებები და ორგანიზება');
      if event_matches <> 1 then
        raise exception 'Expected exactly one existing event category; found %. Review before synchronization.', event_matches;
      end if;
      select c.id, c.is_active into strict category_uuid, category_active
      from public.categories c
      where c.name in ('ღონისძიებები', 'ღონისძიებები და ორგანიზება');
    end if;

    if category_active is distinct from true then
      raise exception 'Category % exists but is inactive; activation requires separate approval.', item.category_name;
    end if;

    foreach child_name in array item.children loop
      if exists (
        select 1 from public.subcategories s
        where s.category_id = category_uuid and s.name = child_name
          and s.is_active is distinct from true
      ) then
        raise exception 'Subcategory % / % exists but is inactive; activation requires separate approval.', item.category_name, child_name;
      end if;

      insert into public.subcategories(category_id, name, is_active)
      values (category_uuid, child_name, true)
      on conflict (category_id, name) do nothing;
    end loop;
  end loop;
end;
$catalog_sync$;

commit;
