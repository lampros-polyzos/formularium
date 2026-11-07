-- Brings the PRODUCTION database in line with the baseline (20261100000000), which describes the design: row-level security ON, no policies,
-- no dependence on Supabase's auth functions. A database built from the baseline already matches, so on it this changes nothing.
-- Safe to run twice.
--
-- Why it is safe: since 20261122 the browser roles (anon, authenticated) have no privileges at all, so none of this was reachable
-- from outside. The backend connects as the owner, which row-level security does not apply to, and always sets the owner id itself.

-- 1. The old row-level-security policies (they call auth.uid()). They were already dead code.
do $$
declare p record;
begin
  for p in select schemaname, tablename, policyname from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

-- 2. Columns that defaulted to the signed-in Supabase user. The backend always writes the owner explicitly.
alter table public.batch_checks        alter column user_id     drop default;
alter table public.batch_ingredients   alter column user_id     drop default;
alter table public.batch_stash_usage   alter column user_id     drop default;
alter table public.batches             alter column user_id     drop default;
alter table public.community_mutes     alter column user_id     drop default;
alter table public.content_reports     alter column reporter_id drop default;

-- 3. The one id that used the uuid-ossp extension; the built-in function does the same
alter table public.post_comments alter column id set default gen_random_uuid();
