-- Deleting an account must remove everything that belongs to it.
--
-- Until now a database function (delete_my_account) removed a person's rows table by table before deleting the login. The Spring backend deletes
-- the account row directly, so the database itself has to follow through. Several tables point at the account WITHOUT "on delete cascade"
-- (stash, containers, favourites, starred ingredients, custom ingredients), which makes the deletion fail for anyone who owns data.
--
-- Every foreign key from the app's own tables to app_users that does not say what happens on delete is changed to cascade. Keys that already
-- say (cascade, set null) are left as they are. Each key keeps its "not validated" state, so rows left over from old Supabase accounts are not
-- checked or removed.
--
-- Safe to run more than once.

do $$
declare
  r record;
begin
  for r in
    select c.conrelid::regclass as tbl, c.conname, a.attname, c.convalidated
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
     where c.contype = 'f' and c.confrelid = 'public.app_users'::regclass and array_length(c.conkey, 1) = 1
       and c.confdeltype = 'a'          -- "no action": the deletion is refused while rows still point at the account
       and n.nspname = 'public'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    execute format('alter table %s add constraint %I foreign key (%I) references public.app_users (id) on delete cascade %s',
                   r.tbl, r.conname, r.attname, case when r.convalidated then '' else 'not valid' end);
  end loop;
end $$;
