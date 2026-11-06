-- Formula history, owned by the Spring backend: copies of your own formulas, each with a note on what changed and why.
--
--   formulation_versions  one row per saved version: the whole formula as it was (name, profile, target weight and pH, and every ingredient
--                         with its phase and percentage) plus the note. The lines are stored as JSON text.
--
-- A version is a frozen copy, so later edits, and even deleting an ingredient from the library, never change it. The numbers count up per
-- formula and are given by the backend, which locks the formula while it saves; the unique key is the safety net. Deleting a formula or an
-- account deletes its versions. Row-level security is on with no policies: only the backend can read or write this table.
--
-- This replaces the earlier plan in frontend/src/db/fixtures/20261109000000_formula_versions.sql, which was never applied (it relied on
-- Supabase's login and row policies). It also removes save_formulation_contents(): the backend now saves a formula's contents itself.
--
-- Safe to run more than once.

create table if not exists public.formulation_versions (
  id uuid primary key default gen_random_uuid(),
  formulation_id uuid not null references public.formulations (id) on delete cascade,
  user_id uuid not null references public.app_users (id) on delete cascade,
  version_number integer not null,
  note text,
  name text not null,
  profile_id text,
  target_weight_g numeric,
  target_ph numeric,
  -- [{ ingredient_id, inci_name, trade_name, phase, percentage, is_qs }]
  lines text not null default '[]' check (jsonb_typeof(lines::jsonb) = 'array'),
  created_at timestamptz not null default now(),
  unique (formulation_id, version_number)
);
create index if not exists formulation_versions_formulation_idx on public.formulation_versions (formulation_id, version_number desc);

alter table public.formulation_versions enable row level security;

drop function if exists public.save_formulation_contents(uuid, jsonb);
