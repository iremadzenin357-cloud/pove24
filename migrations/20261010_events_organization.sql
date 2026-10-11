-- LOCAL ONLY. NOT EXECUTED. Preserve category UUID and all historical listing links.
begin;
do $$
begin
 if exists(select 1 from public.categories where name='ღონისძიებები')
 and exists(select 1 from public.categories where name='ღონისძიებები და ორგანიზება') then
 raise exception 'Both event category names exist; review before merging IDs.';
 end if;
end $$;
update public.categories set name='ღონისძიებები და ორგანიზება' where name='ღონისძიებები';
insert into public.categories(name,is_active) values('ღონისძიებები და ორგანიზება',true) on conflict(name) do nothing;
-- Retire from new choices only; do not delete historical foreign-key targets.
update public.subcategories set is_active=false where category_id=(select id from public.categories where name='ღონისძიებები და ორგანიზება')
 and name in ('ღონისძიების დამხმარე','ქორწილის დამხმარე','სერვირების დამხმარე');
insert into public.subcategories(category_id,name,is_active)
select c.id,s.name,true from public.categories c cross join(values('ფოტოგრაფი'),('დეკორატორი'),('წამყვანი'),('თამადა'),('დიჯეი'),('მიმტანი'))s(name)
where c.name='ღონისძიებები და ორგანიზება'
on conflict(category_id,name) do update set is_active=true;
commit;

