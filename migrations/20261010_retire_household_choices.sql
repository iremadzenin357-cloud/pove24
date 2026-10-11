-- LOCAL ONLY. Not executed. Retire choices without deleting historical listing links.
begin;
update public.subcategories set is_active=false
where category_id in (select id from public.categories where name='სახლის საქმეები')
and name in ('უთოობა','ტანსაცმლის დალაგება');
commit;
