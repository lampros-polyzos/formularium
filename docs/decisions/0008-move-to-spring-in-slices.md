# 0008. Move to Spring one slice at a time

Status: Accepted

Date: 2026-11-06

## Context
Carrying out [0001](0001-postgres-on-supabase-database-only.md) could not be a small step. The browser read about 22 tables straight from Supabase, and the database's policies and functions identified the user through Supabase's login. Data access therefore had to move together with sign-in, and a half-moved app does not work.

## Decision
Work on a branch, in vertical slices, and merge only when the whole app works again. Each slice has Spring endpoints that enforce ownership in Java, a test for every rule, a migration that removes the old database objects (tested on a real Postgres engine), and a frontend module switched to the new endpoints.

| Slice | Migration |
|---|---|
| Accounts, sign-in, refresh tokens | `20261116_spring_owns_auth` |
| Library: ingredients, stash, containers | `20261117_account_delete_cascade` |
| Starter formulas (code, not a trigger) | `20261118_starter_formulas_in_spring` |
| Formulas and version history | `20261119_formula_versions_in_spring` |
| Batches (stash deduction, costs) | `20261120_batches_in_spring` |
| Community, notifications, about a dozen triggers | `20261121_community_in_spring` |
| Data export, account deletion | none |
| Close the door: revoke browser roles | `20261122_close_the_door` |
| Email confirmation and password reset | `20261123_email_verification_and_reset` |
| Drop unused tables (`profiles`, `users`, `reviews`, `ingredient_safety_updates`) | `20261124_drop_unused_tables` |

These migrations are now in [`supabase/migrations-archive/`](../../supabase/migrations-archive), kept for the history and no longer applied: the baseline in [`supabase/migrations`](../../supabase/migrations) replaced them (see the [data model](../data-model.md#migrations)).

## Consequences
- **Good:** each step was small enough to test and review, and no rule was lost: every trigger or policy became a named Java rule with a test.
- **Cost:** the branch was not usable between slices, and the migrations must be applied in order, at the same time as the matching backend is deployed.
- Old rows that belonged to Supabase accounts are kept but orphaned until deleted by hand. Accounts were not imported.
