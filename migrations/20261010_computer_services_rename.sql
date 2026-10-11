-- LOCAL ONLY: not executed. Rename in place, retaining UUID and existing links.
begin;
do $$ begin
 if exists(select 1 from public.categories where name='ონლაინ / კომპიუტერული')
 and exists(select 1 from public.categories where name='კომპიუტერული მომსახურება') then
 raise exception 'Both category names exist; review IDs before rename.';
 end if;
end $$;
update public.categories set name='კომპიუტერული მომსახურება' where name='ონლაინ / კომპიუტერული';
commit;
