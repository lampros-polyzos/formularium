-- Starting and undoing a batch is now done by the Spring backend (backend/src/main/java/com/demiurgio/formularium/batches/), in Java, with tests:
-- it takes the grams out of the stash, works out the cost, records the check-ins, and puts the grams back when a batch is undone.
--
-- This removes the database functions that did it. The batch tables and everything in them stay exactly as they are.
-- Apply this together with the backend that replaces them.
--
-- Safe to run more than once.

drop function if exists public.create_batch(uuid, text, text, numeric, numeric, text, jsonb, date, jsonb);
drop function if exists public.create_batch(uuid, text, text, numeric, numeric, text, jsonb, date);
drop function if exists public.void_batch(uuid);
