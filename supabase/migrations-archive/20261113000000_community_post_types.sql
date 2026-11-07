-- Community post types: "request" becomes "advice" (ask for advice) and "education" becomes "information" (useful information).
--
-- Existing posts are renamed, so nothing is lost. Whichever way post_type is defined in your database is handled:
--   - a Postgres enum:        the two values are renamed in place
--   - text with a CHECK rule: the rule is replaced by one that lists the new names, and the rows are updated
--   - text with no rule:      the rows are updated and no rule is added
-- Safe to run more than once.
--
-- Run this before (or together with) deploying the new app: the new version writes "advice" and "information", which a
-- database that only knows "request" and "education" would refuse. The new app also still reads the old names, so
-- posts keep showing up during the switch.

do $$
declare
  kind text;
  enum_type regtype;
  old_and_new text[][] := array[['request', 'advice'], ['education', 'information']];
  pair text[];
  dropped integer := 0;
  c record;
begin
  select data_type, atttypid::regtype
    into kind, enum_type
    from information_schema.columns col
    join pg_attribute a on a.attrelid = 'public.community_posts'::regclass and a.attname = col.column_name
   where col.table_schema = 'public' and col.table_name = 'community_posts' and col.column_name = 'post_type';

  if kind is null then
    raise exception 'community_posts.post_type was not found';
  end if;

  if kind = 'USER-DEFINED' then
    -- An enum: renaming a value renames it on every row that uses it
    foreach pair slice 1 in array old_and_new loop
      if exists (select 1 from pg_enum e where e.enumtypid = enum_type::oid and e.enumlabel = pair[1])
         and not exists (select 1 from pg_enum e where e.enumtypid = enum_type::oid and e.enumlabel = pair[2]) then
        execute format('alter type %s rename value %L to %L', enum_type, pair[1], pair[2]);
      end if;
    end loop;
  else
    -- Text: let go of any rule that limits the allowed values, rename the rows, then put a rule back with the new names
    for c in
      select conname from pg_constraint
       where conrelid = 'public.community_posts'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%post_type%'
    loop
      execute format('alter table public.community_posts drop constraint %I', c.conname);
      dropped := dropped + 1;
    end loop;

    foreach pair slice 1 in array old_and_new loop
      execute format('update public.community_posts set post_type = %L where post_type = %L', pair[2], pair[1]);
    end loop;

    if dropped > 0 then
      alter table public.community_posts
        add constraint community_posts_post_type_check
        check (post_type in ('formulation', 'discussion', 'advice', 'information'));
    end if;
  end if;
end
$$;
