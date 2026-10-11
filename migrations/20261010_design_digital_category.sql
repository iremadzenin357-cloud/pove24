-- LOCAL PROPOSAL ONLY. Not executed. Existing UUID defaults and unique constraints required:
-- categories(name), subcategories(category_id,name).
-- Additive and rerunnable; never renames, deletes, reactivates or migrates existing records.
begin;
insert into public.categories(name,is_active)
values ('დიზაინი და ციფრული მომსახურება',true)
on conflict(name) do nothing;
insert into public.subcategories(category_id,name,is_active)
select c.id,s.name,true from public.categories c cross join (values
 ('ლოგო და ბრენდინგი'),
 ('გრაფიკული დიზაინი'),
 ('ვიდეომონტაჟი და ანიმაცია'),
 ('ფოტოგრაფია და ფოტორედაქტირება'),
 ('ვებსაიტებისა და აპლიკაციების შექმნა'),
 ('მარკეტინგი და სოციალური ქსელები'),
 ('AI და ციფრული კონტენტი'),
 ('სხვა ციფრული მომსახურება')
) s(name) where c.name='დიზაინი და ციფრული მომსახურება'
on conflict(category_id,name) do nothing;
commit;
