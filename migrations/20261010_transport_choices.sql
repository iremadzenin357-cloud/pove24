-- LOCAL ONLY. Not executed. Retain existing IDs and listing relationships.
begin;
do $$ begin
 if exists(select 1 from public.subcategories s join public.categories c on c.id=s.category_id where c.name='მიტანა და გადაადგილება' and s.name='მანქანით დახმარება')
 and exists(select 1 from public.subcategories s join public.categories c on c.id=s.category_id where c.name='მიტანა და გადაადგილება' and s.name='მძღოლით/მანქანით დახმარება') then
 raise exception 'Both transport subcategory names exist; review IDs before rename.';
 end if;
end $$;
update public.subcategories set name='მძღოლით/მანქანით დახმარება'
where category_id in(select id from public.categories where name='მიტანა და გადაადგილება') and name='მანქანით დახმარება';
update public.subcategories set is_active=false
where category_id in(select id from public.categories where name='მიტანა და გადაადგილება') and name='მძღოლი ერთი დღით';
commit;
