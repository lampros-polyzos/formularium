-- The accounts schema for tests (H2 in PostgreSQL mode). Production uses supabase/migrations/20261116000000_spring_owns_auth.sql.
create table if not exists app_users (
  id uuid primary key,
  email varchar(320) not null unique,
  password_hash varchar(100),
  google_sub varchar(100) unique,
  username varchar(40) not null unique,
  created_at timestamp with time zone not null default current_timestamp,
  last_login_at timestamp with time zone
);

create table if not exists refresh_tokens (
  id uuid primary key,
  user_id uuid not null references app_users (id) on delete cascade,
  family_id uuid not null,
  token_hash varchar(100) not null unique,
  created_at timestamp with time zone not null default current_timestamp,
  expires_at timestamp with time zone not null,
  revoked_at timestamp with time zone,
  user_agent varchar(300)
);

-- ---- the library tables (the same columns as production; the enum types are plain text here)
create domain if not exists solubility_type as varchar(20);
create domain if not exists ionic_status as varchar(20);
create domain if not exists physical_form as varchar(20);
create domain if not exists cost_level as varchar(20);

create table if not exists ingredients (
  id uuid primary key,
  inci_name varchar(200) not null unique,
  trade_name varchar(200) not null,
  function varchar(100),
  min_usage_pct numeric,
  max_usage_pct numeric,
  cas_number varchar(100),
  solubility solubility_type default 'water',
  ionic_charge ionic_status default 'n/a',
  physical_state physical_form default 'liquid',
  optimal_ph_min numeric,
  optimal_ph_max numeric,
  max_heating_temp_c integer,
  is_vegan boolean default false,
  is_cosmos boolean default false,
  cost_category cost_level,
  description text,
  common_uses text,
  is_sulfate boolean default false,
  is_silicone boolean default false,
  is_paraben boolean default false,
  is_fragrance boolean default false,
  cosmos_compliant boolean default false,
  comedogenic_rating smallint,
  user_id uuid references app_users (id) on delete cascade,
  default_min_usage numeric default 0,
  default_max_usage numeric default 100,
  notes text
);

create table if not exists user_starred_ingredients (
  id uuid primary key,
  user_id uuid not null references app_users (id) on delete cascade,
  ingredient_id uuid references ingredients (id) on delete cascade,
  created_at timestamp with time zone default current_timestamp,
  unique (user_id, ingredient_id)
);

create table if not exists favorite_ingredients (
  id uuid primary key,
  user_id uuid not null references app_users (id) on delete cascade,
  ingredient_id uuid not null references ingredients (id),
  created_at timestamp with time zone not null default current_timestamp,
  unique (user_id, ingredient_id)
);

create table if not exists user_stash (
  id uuid primary key,
  user_id uuid not null references app_users (id) on delete cascade,
  ingredient_id uuid not null references ingredients (id),
  supplier_name varchar(200),
  batch_lot_number varchar(100),
  amount_left_g numeric default 0,
  expiration_date date,
  notes text,
  created_at timestamp with time zone default current_timestamp,
  price_per_g numeric default 0
);

create table if not exists user_containers (
  id uuid primary key,
  user_id uuid not null references app_users (id) on delete cascade,
  name varchar(200) not null,
  container_type varchar(100) not null,
  material varchar(100),
  volume_ml numeric,
  quantity integer default 0,
  price_per_unit numeric default 0,
  supplier_name varchar(200),
  image_url varchar(2000),
  notes text,
  created_at timestamp with time zone default current_timestamp,
  low_stock_threshold integer default 0
);

-- ---- formulas (only what the starter formulas need)
create table if not exists formulation_profiles (
  id varchar(100) primary key,
  name varchar(200) not null,
  category varchar(100) not null,
  requires_water boolean default false,
  requires_oil boolean default false,
  requires_emulsifier boolean default false,
  requires_preservative boolean default false,
  max_oil_phase_percent numeric,
  default_ph_min numeric,
  default_ph_max numeric
);
merge into formulation_profiles (id, name, category, requires_water, requires_oil, requires_emulsifier, requires_preservative, max_oil_phase_percent, default_ph_min, default_ph_max) key (id) values
  ('body_butter', 'Body Butter', 'Anhydrous', false, true, false, false, 100, null, null),
  ('ow_lotion', 'O/W Lotion or Cream', 'Emulsion', true, true, true, true, 30, 5.0, 6.0),
  ('body_wash', 'Body Wash', 'Surfactant', true, false, false, true, 0, 5.0, 6.5);

create table if not exists community_posts (
  id uuid primary key,
  author_id uuid references app_users (id) on delete cascade,
  title varchar(150) not null
);

create table if not exists formulations (
  id uuid primary key,
  user_id uuid references app_users (id) on delete cascade,
  name varchar(200) not null,
  target_weight_g numeric,
  status varchar(50) default 'draft',
  profile_id varchar(100) references formulation_profiles (id),
  created_at timestamp with time zone not null default current_timestamp,
  target_ph numeric,
  community_post_id uuid references community_posts (id) on delete set null,
  cloned_from_formulation_id uuid references formulations (id) on delete set null,
  remixed_from_post_id uuid references community_posts (id) on delete set null
);

create table if not exists formulation_phases (
  id uuid primary key,
  formulation_id uuid references formulations (id) on delete cascade,
  phase_letter varchar(10) not null
);

create table if not exists formulation_ingredients (
  id uuid primary key,
  phase_id uuid references formulation_phases (id) on delete cascade,
  ingredient_id uuid references ingredients (id),
  percentage numeric not null,
  is_qs boolean default false
);

create table if not exists formulation_versions (
  id uuid primary key,
  formulation_id uuid not null references formulations (id) on delete cascade,
  user_id uuid not null references app_users (id) on delete cascade,
  version_number integer not null,
  note text,
  name varchar(200) not null,
  profile_id varchar(100),
  target_weight_g numeric,
  target_ph numeric,
  lines text not null default '[]',
  created_at timestamp with time zone not null default current_timestamp,
  unique (formulation_id, version_number)
);

-- ---- batches
create table if not exists batches (
  id uuid primary key,
  user_id uuid not null references app_users (id) on delete cascade,
  formulation_id uuid references formulations (id) on delete set null,
  name varchar(200) not null,
  lot_number varchar(60) not null,
  batch_size_g numeric not null check (batch_size_g > 0),
  made_on date not null default current_date,
  status varchar(20) not null default 'active' check (status in ('active', 'archived', 'discarded', 'voided')),
  target_ph numeric,
  measured_ph numeric,
  final_weight_g numeric,
  notes text,
  stash_deducted boolean not null default false,
  created_at timestamp with time zone not null default current_timestamp,
  container_id uuid references user_containers (id) on delete set null,
  container_name varchar(200),
  container_volume_ml numeric,
  container_count numeric,
  container_unit_price numeric,
  density_g_ml numeric,
  ingredient_cost numeric,
  unpriced_count integer not null default 0,
  unique (user_id, lot_number)
);

create table if not exists batch_ingredients (
  id uuid primary key,
  batch_id uuid not null references batches (id) on delete cascade,
  user_id uuid not null references app_users (id) on delete cascade,
  ingredient_id uuid references ingredients (id) on delete set null,
  name varchar(200) not null,
  inci_name varchar(200),
  phase varchar(10) not null,
  percentage numeric not null,
  planned_g numeric not null,
  actual_g numeric not null,
  cost numeric,
  cost_estimated boolean not null default false
);

create table if not exists batch_stash_usage (
  id uuid primary key,
  batch_id uuid not null references batches (id) on delete cascade,
  batch_ingredient_id uuid references batch_ingredients (id) on delete cascade,
  user_id uuid not null references app_users (id) on delete cascade,
  stash_id uuid references user_stash (id) on delete set null,
  grams numeric not null check (grams > 0),
  label varchar(200),
  price_per_g numeric
);

create table if not exists batch_checks (
  id uuid primary key,
  batch_id uuid not null references batches (id) on delete cascade,
  user_id uuid not null references app_users (id) on delete cascade,
  label varchar(100) not null,
  due_on date not null,
  checked_at timestamp with time zone,
  result varchar(10) check (result is null or result in ('good', 'minor', 'failed')),
  observations varchar(60) array not null default array[],
  measured_ph numeric,
  notes text
);
