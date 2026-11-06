# One-off SQL scripts

Helper scripts to run by hand in the Supabase SQL editor. They are not migrations and nothing runs them automatically. The real migrations are in [`../../supabase/migrations`](../../supabase/migrations).

| Script | What it does | Changes data? |
|---|---|---|
| `export-schema.sql`, `export-schema-part2.sql` | Print the structure of the `public` schema (tables, keys, indexes, policies, functions, triggers) as JSON, with no row data | No |
| `export-starter-formulas.sql` | Prints the starter formulas that were once created by a database function | No |
| `review-unused-tables.sql` | Lists every table, whether the app uses it, its row count and anything depending on the unused ones. Run it before `20261124000000_drop_unused_tables.sql` | No |
