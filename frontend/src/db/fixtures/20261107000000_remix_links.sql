-- "Remixed from" links.
--
--   formulations.cloned_from_formulation_id  the formula this one was copied from (your own copy via Clone)
--   formulations.remixed_from_post_id        the community recipe this one started as (Clone to Studio),
--                                            kept when the formula is cloned again
--   community_posts.remixed_from_post_id     the recipe a shared post is a remix of
--
-- Every link is "on delete set null": deleting the original never deletes or blocks a copy, the copy just
-- loses the link. (Display names are deliberately not copied, so deleting an account leaves nothing of it behind.)

alter table public.formulations
  add column if not exists cloned_from_formulation_id uuid references public.formulations (id) on delete set null,
  add column if not exists remixed_from_post_id uuid references public.community_posts (id) on delete set null;

alter table public.community_posts
  add column if not exists remixed_from_post_id uuid references public.community_posts (id) on delete set null;

-- A recipe cannot be a remix of itself
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'community_posts_no_self_remix') then
    alter table public.community_posts
      add constraint community_posts_no_self_remix check (remixed_from_post_id is distinct from id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'formulations_no_self_clone') then
    alter table public.formulations
      add constraint formulations_no_self_clone check (cloned_from_formulation_id is distinct from id);
  end if;
end $$;

-- "Remixes of this recipe" lists, and fast "set null" when an original is deleted
create index if not exists community_posts_remixed_from_idx on public.community_posts (remixed_from_post_id) where remixed_from_post_id is not null;
create index if not exists formulations_remixed_from_post_idx on public.formulations (remixed_from_post_id) where remixed_from_post_id is not null;
create index if not exists formulations_cloned_from_idx on public.formulations (cloned_from_formulation_id) where cloned_from_formulation_id is not null;
