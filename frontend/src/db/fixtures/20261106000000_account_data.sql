-- Self-service data export and account deletion (privacy policy: "access", "portability", "erasure").
--
-- Both functions find a user's data by looking for the column that links a row to a person, so they keep working
-- as tables are added. A table counts as the user's own when it has one of user_id, recipient_id, author_id or
-- owner_id (checked in that order), or is the profiles table (keyed by id). Tables that hang off one of those
-- tables (phases of a formulation, checks of a batch...) are included through their parent.

-- The tables that hold a user's own rows, and the column that says whose they are
create or replace function public.account_owned_tables()
returns table (table_name text, owner_column text)
language sql stable security invoker set search_path = ''
as $$
  select distinct on (c.table_name) c.table_name::text, c.column_name::text
  from information_schema.columns c
  join information_schema.tables t
    on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
  where c.table_schema = 'public'
    and (c.column_name in ('user_id', 'recipient_id', 'author_id', 'owner_id')
         or (c.table_name = 'profiles' and c.column_name = 'id'))
  order by c.table_name,
           array_position(array['user_id', 'recipient_id', 'author_id', 'owner_id', 'id'], c.column_name::text)
$$;

-- Everything the signed-in user owns, as one JSON document. Runs with the caller's rights, so row level
-- security applies on top of the filter below.
create or replace function public.export_my_data()
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  result jsonb := '{}'::jsonb;
  t record;
  rows jsonb;
begin
  if uid is null then
    raise exception 'You must be signed in to export your data' using errcode = '28000';
  end if;

  for t in select * from public.account_owned_tables() order by 1 loop
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x where x.%I = $1',
      t.table_name, t.owner_column
    ) into rows using uid;
    result := result || jsonb_build_object(t.table_name, rows);
  end loop;

  -- Tables without an owner column of their own, reached through the table they belong to
  for t in
    select v.child, v.fk, v.parent, v.pk, o.owner_column
    from (values
      ('formulation_phases', 'formulation_id', 'formulations', 'id'),
      ('formulation_ingredients', 'formulation_id', 'formulations', 'id'),
      ('post_snapshots', 'post_id', 'community_posts', 'id'),
      ('batch_ingredients', 'batch_id', 'batches', 'id'),
      ('batch_checks', 'batch_id', 'batches', 'id'),
      ('batch_stash_usage', 'batch_id', 'batches', 'id')
    ) as v(child, fk, parent, pk)
    join public.account_owned_tables() o on o.table_name = v.parent
    where to_regclass('public.' || quote_ident(v.child)) is not null
      and not jsonb_exists(result, v.child)
      and exists (
        select 1 from information_schema.columns c
        where c.table_schema = 'public' and c.table_name = v.child and c.column_name = v.fk)
    order by v.child
  loop
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x where x.%I in (select p.%I from public.%I p where p.%I = $1)',
      t.child, t.fk, t.pk, t.parent, t.owner_column
    ) into rows using uid;
    result := result || jsonb_build_object(t.child, rows);
  end loop;

  return jsonb_build_object(
    'exported_at', now(),
    'account', jsonb_build_object('id', uid, 'email', auth.jwt() ->> 'email'),
    'data', result
  );
end;
$$;

-- Permanently deletes the signed-in user: their rows, then the login itself. All or nothing: if anything in the
-- way cannot be removed, the whole thing is rolled back and nothing is lost.
create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  t record;
  blocked int;
begin
  if uid is null then
    raise exception 'You must be signed in to delete your account' using errcode = '28000';
  end if;

  -- A table can be blocked by rows in another table that still point at it. Removing the others first frees it
  -- up, so go round a few times.
  for pass in 1..5 loop
    blocked := 0;
    for t in select * from public.account_owned_tables() loop
      begin
        execute format('delete from public.%I where %I = $1', t.table_name, t.owner_column) using uid;
      exception when foreign_key_violation then
        blocked := blocked + 1;
      end;
    end loop;
    exit when blocked = 0;
  end loop;

  -- Anything that points at the login with "on delete cascade" goes with it
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.account_owned_tables() from public, anon;
revoke all on function public.export_my_data() from public, anon;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.account_owned_tables() to authenticated;
grant execute on function public.export_my_data() to authenticated;
grant execute on function public.delete_my_account() to authenticated;
