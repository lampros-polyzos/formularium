-- Baseline schema: the whole `public` schema as it was in production after migration 20261124, so a database can be built from nothing.
--
--   supabase db reset            (local, needs Docker)      or      psql -f supabase/migrations/20261101000000_baseline.sql
--
-- Generated with pg_dump --schema-only --schema=public --no-owner --no-privileges against PostgreSQL 17, then cleaned by hand:
--   * left out: row-level-security POLICIES (they used Supabase's auth.uid(); the design has none, see docs/decisions/0005),
--     and Supabase's own rls_auto_enable() helper. Row-level security itself stays ON for every table.
--   * user_id and reporter_id columns have no DEFAULT auth.uid() (Supabase's function): the backend always sets the owner itself.
--   * post_comments.id uses the built-in gen_random_uuid() instead of the uuid-ossp extension's function.
--   * grants are not dumped; the lock-down at the end removes browser-role access wherever those roles exist (Supabase).
-- Reference data (ingredients, product types) is in the next migration. The migrations that built this schema step by step are kept in
-- supabase/migrations-archive/ for the history; they must NOT be applied on top of this file.

--
-- Name: cost_level; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.cost_level AS ENUM (
    'low',
    'medium',
    'high'
);

--
-- Name: ionic_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ionic_status AS ENUM (
    'non-ionic',
    'anionic',
    'cationic',
    'amphoteric',
    'n/a'
);

--
-- Name: physical_form; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.physical_form AS ENUM (
    'liquid',
    'solid',
    'powder'
);

--
-- Name: solubility_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.solubility_type AS ENUM (
    'water',
    'oil',
    'alcohol',
    'silicone',
    'dispersible'
);

--
-- Name: app_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    password_hash text,
    google_sub text,
    username text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_login_at timestamp with time zone,
    email_verified_at timestamp with time zone
);

--
-- Name: batch_checks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.batch_checks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    batch_id uuid NOT NULL,
    user_id uuid NOT NULL,
    label text NOT NULL,
    due_on date NOT NULL,
    checked_at timestamp with time zone,
    result text,
    observations text[] DEFAULT '{}'::text[] NOT NULL,
    measured_ph numeric,
    notes text,
    CONSTRAINT batch_checks_result_check CHECK (((result IS NULL) OR (result = ANY (ARRAY['good'::text, 'minor'::text, 'failed'::text]))))
);

--
-- Name: batch_ingredients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.batch_ingredients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    batch_id uuid NOT NULL,
    user_id uuid NOT NULL,
    ingredient_id uuid,
    name text NOT NULL,
    inci_name text,
    phase text NOT NULL,
    percentage numeric NOT NULL,
    planned_g numeric NOT NULL,
    actual_g numeric NOT NULL,
    cost numeric,
    cost_estimated boolean DEFAULT false NOT NULL,
    CONSTRAINT batch_ingredients_cost_check CHECK (((cost IS NULL) OR (cost >= (0)::numeric)))
);

--
-- Name: batch_stash_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.batch_stash_usage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    batch_id uuid NOT NULL,
    batch_ingredient_id uuid,
    user_id uuid NOT NULL,
    stash_id uuid,
    grams numeric NOT NULL,
    label text,
    price_per_g numeric,
    CONSTRAINT batch_stash_usage_grams_check CHECK ((grams > (0)::numeric)),
    CONSTRAINT batch_stash_usage_price_per_g_check CHECK (((price_per_g IS NULL) OR (price_per_g >= (0)::numeric)))
);

--
-- Name: batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.batches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    formulation_id uuid,
    name text NOT NULL,
    lot_number text NOT NULL,
    batch_size_g numeric NOT NULL,
    made_on date DEFAULT CURRENT_DATE NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    target_ph numeric,
    measured_ph numeric,
    final_weight_g numeric,
    notes text,
    stash_deducted boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    container_id uuid,
    container_name text,
    container_volume_ml numeric,
    container_count numeric,
    container_unit_price numeric,
    density_g_ml numeric,
    ingredient_cost numeric,
    unpriced_count integer DEFAULT 0 NOT NULL,
    CONSTRAINT batches_batch_size_g_check CHECK ((batch_size_g > (0)::numeric)),
    CONSTRAINT batches_container_count_check CHECK (((container_count IS NULL) OR (container_count > (0)::numeric))),
    CONSTRAINT batches_container_unit_price_check CHECK (((container_unit_price IS NULL) OR (container_unit_price >= (0)::numeric))),
    CONSTRAINT batches_container_volume_ml_check CHECK (((container_volume_ml IS NULL) OR (container_volume_ml > (0)::numeric))),
    CONSTRAINT batches_density_g_ml_check CHECK (((density_g_ml IS NULL) OR (density_g_ml > (0)::numeric))),
    CONSTRAINT batches_final_weight_g_check CHECK (((final_weight_g IS NULL) OR (final_weight_g > (0)::numeric))),
    CONSTRAINT batches_ingredient_cost_check CHECK (((ingredient_cost IS NULL) OR (ingredient_cost >= (0)::numeric))),
    CONSTRAINT batches_status_check CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text, 'discarded'::text, 'voided'::text])))
);

--
-- Name: community_moderators; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_moderators (
    user_id uuid NOT NULL,
    added_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: community_mutes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_mutes (
    user_id uuid NOT NULL,
    muted_user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT community_mutes_check CHECK ((user_id <> muted_user_id))
);

--
-- Name: community_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    author_id uuid,
    title text NOT NULL,
    write_up text,
    tags text[],
    created_at timestamp with time zone DEFAULT now(),
    post_type character varying DEFAULT 'formulation'::character varying,
    development_status character varying,
    profile_name character varying,
    author_name text,
    remixed_from_post_id uuid,
    edited_at timestamp with time zone,
    answered_at timestamp with time zone,
    sources text,
    CONSTRAINT community_posts_development_status_check CHECK (((development_status)::text = ANY ((ARRAY['concept'::character varying, 'in-testing'::character varying, 'stable'::character varying])::text[]))),
    CONSTRAINT community_posts_no_self_remix CHECK ((remixed_from_post_id IS DISTINCT FROM id))
);

--
-- Name: content_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.content_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reporter_id uuid NOT NULL,
    target_type text NOT NULL,
    target_id uuid NOT NULL,
    post_id uuid,
    target_author_id uuid,
    snapshot text,
    reason text NOT NULL,
    details text,
    status text DEFAULT 'open'::text NOT NULL,
    resolved_by uuid,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT content_reports_details_check CHECK (((details IS NULL) OR (char_length(details) <= 1000))),
    CONSTRAINT content_reports_reason_check CHECK ((reason = ANY (ARRAY['dangerous'::text, 'medical'::text, 'spam'::text, 'harassment'::text, 'copied'::text, 'personal'::text, 'other'::text]))),
    CONSTRAINT content_reports_status_check CHECK ((status = ANY (ARRAY['open'::text, 'resolved'::text, 'dismissed'::text]))),
    CONSTRAINT content_reports_target_type_check CHECK ((target_type = ANY (ARRAY['post'::text, 'comment'::text])))
);

--
-- Name: email_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    purpose text NOT NULL,
    token_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    CONSTRAINT email_tokens_purpose_check CHECK ((purpose = ANY (ARRAY['verify'::text, 'reset'::text])))
);

--
-- Name: favorite_ingredients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.favorite_ingredients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    ingredient_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

--
-- Name: formulation_ingredients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.formulation_ingredients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    phase_id uuid,
    ingredient_id uuid,
    percentage numeric(5,2) NOT NULL,
    is_qs boolean DEFAULT false
);

--
-- Name: formulation_phases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.formulation_phases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    formulation_id uuid,
    phase_letter character varying(1) NOT NULL,
    mixing_instruction text
);

--
-- Name: formulation_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.formulation_profiles (
    id text NOT NULL,
    name text NOT NULL,
    category text NOT NULL,
    requires_water boolean DEFAULT false,
    requires_oil boolean DEFAULT false,
    requires_emulsifier boolean DEFAULT false,
    requires_preservative boolean DEFAULT false,
    max_oil_phase_percent numeric(5,2),
    default_ph_min numeric(4,2),
    default_ph_max numeric(4,2)
);

--
-- Name: formulation_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.formulation_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    formulation_id uuid NOT NULL,
    user_id uuid NOT NULL,
    version_number integer NOT NULL,
    note text,
    name text NOT NULL,
    profile_id text,
    target_weight_g numeric,
    target_ph numeric,
    lines text DEFAULT '[]'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT formulation_versions_lines_check CHECK ((jsonb_typeof((lines)::jsonb) = 'array'::text))
);

--
-- Name: formulations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.formulations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    name text NOT NULL,
    target_weight_g numeric(10,2),
    status text DEFAULT 'draft'::text,
    last_validated_at timestamp with time zone,
    profile_id text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    target_ph numeric(4,2),
    target_claims text[] DEFAULT '{}'::text[],
    community_post_id uuid,
    cloned_from_formulation_id uuid,
    remixed_from_post_id uuid,
    CONSTRAINT formulations_no_self_clone CHECK ((cloned_from_formulation_id IS DISTINCT FROM id))
);

--
-- Name: ingredients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ingredients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    inci_name text NOT NULL,
    trade_name text NOT NULL,
    function text,
    min_usage_pct numeric(5,2),
    max_usage_pct numeric(5,2),
    cas_number text,
    solubility public.solubility_type DEFAULT 'water'::public.solubility_type,
    ionic_charge public.ionic_status DEFAULT 'n/a'::public.ionic_status,
    physical_state public.physical_form DEFAULT 'liquid'::public.physical_form,
    optimal_ph_min numeric(4,2),
    optimal_ph_max numeric(4,2),
    max_heating_temp_c integer,
    is_vegan boolean DEFAULT false,
    is_cosmos boolean DEFAULT false,
    cost_category public.cost_level,
    description text,
    common_uses text,
    is_sulfate boolean DEFAULT false,
    is_silicone boolean DEFAULT false,
    is_paraben boolean DEFAULT false,
    is_fragrance boolean DEFAULT false,
    cosmos_compliant boolean DEFAULT false,
    comedogenic_rating smallint,
    user_id uuid,
    default_min_usage numeric DEFAULT 0,
    default_max_usage numeric DEFAULT 100,
    notes text,
    CONSTRAINT ingredients_comedogenic_rating_check CHECK (((comedogenic_rating >= 0) AND (comedogenic_rating <= 5)))
);

--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recipient_id uuid,
    actor_name text,
    post_id uuid,
    type text NOT NULL,
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

--
-- Name: post_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.post_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid,
    user_id uuid,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    author_name text,
    author_id uuid,
    content text
);

--
-- Name: post_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.post_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid,
    formulation_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    release_notes text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

--
-- Name: recipe_ratings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recipe_ratings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid NOT NULL,
    user_id uuid NOT NULL,
    author_name text,
    version integer DEFAULT 1 NOT NULL,
    overall smallint NOT NULL,
    texture smallint,
    stability smallint,
    ease smallint,
    efficacy smallint,
    made_it boolean DEFAULT false NOT NULL,
    skin_type text,
    review text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT recipe_ratings_criteria_require_made_it CHECK ((made_it OR ((texture IS NULL) AND (stability IS NULL) AND (ease IS NULL) AND (efficacy IS NULL) AND (skin_type IS NULL)))),
    CONSTRAINT recipe_ratings_ease_check CHECK (((ease >= 1) AND (ease <= 5))),
    CONSTRAINT recipe_ratings_efficacy_check CHECK (((efficacy >= 1) AND (efficacy <= 5))),
    CONSTRAINT recipe_ratings_overall_check CHECK (((overall >= 1) AND (overall <= 5))),
    CONSTRAINT recipe_ratings_review_check CHECK ((char_length(review) <= 1000)),
    CONSTRAINT recipe_ratings_skin_type_check CHECK ((skin_type = ANY (ARRAY['dry'::text, 'oily'::text, 'combination'::text, 'normal'::text, 'sensitive'::text]))),
    CONSTRAINT recipe_ratings_stability_check CHECK (((stability >= 1) AND (stability <= 5))),
    CONSTRAINT recipe_ratings_texture_check CHECK (((texture >= 1) AND (texture <= 5)))
);

--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refresh_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    family_id uuid NOT NULL,
    token_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    user_agent text
);

--
-- Name: user_containers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_containers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    container_type text NOT NULL,
    material text,
    volume_ml numeric,
    quantity integer DEFAULT 0,
    price_per_unit numeric DEFAULT 0,
    supplier_name text,
    image_url text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    low_stock_threshold integer DEFAULT 0
);

--
-- Name: user_starred_ingredients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_starred_ingredients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    ingredient_id uuid,
    created_at timestamp with time zone DEFAULT now()
);

--
-- Name: user_stash; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_stash (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    ingredient_id uuid NOT NULL,
    supplier_name text,
    batch_lot_number text,
    amount_left_g numeric DEFAULT 0,
    expiration_date date,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    price_per_g numeric DEFAULT 0
);

--
-- Name: app_users app_users_google_sub_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_users
    ADD CONSTRAINT app_users_google_sub_key UNIQUE (google_sub);

--
-- Name: app_users app_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_users
    ADD CONSTRAINT app_users_pkey PRIMARY KEY (id);

--
-- Name: batch_checks batch_checks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batch_checks
    ADD CONSTRAINT batch_checks_pkey PRIMARY KEY (id);

--
-- Name: batch_ingredients batch_ingredients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batch_ingredients
    ADD CONSTRAINT batch_ingredients_pkey PRIMARY KEY (id);

--
-- Name: batch_stash_usage batch_stash_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batch_stash_usage
    ADD CONSTRAINT batch_stash_usage_pkey PRIMARY KEY (id);

--
-- Name: batches batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batches
    ADD CONSTRAINT batches_pkey PRIMARY KEY (id);

--
-- Name: batches batches_user_id_lot_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batches
    ADD CONSTRAINT batches_user_id_lot_number_key UNIQUE (user_id, lot_number);

--
-- Name: community_moderators community_moderators_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_moderators
    ADD CONSTRAINT community_moderators_pkey PRIMARY KEY (user_id);

--
-- Name: community_mutes community_mutes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_mutes
    ADD CONSTRAINT community_mutes_pkey PRIMARY KEY (user_id, muted_user_id);

--
-- Name: community_posts community_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_posts
    ADD CONSTRAINT community_posts_pkey PRIMARY KEY (id);

--
-- Name: community_posts community_posts_sources_length; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.community_posts
    ADD CONSTRAINT community_posts_sources_length CHECK (((sources IS NULL) OR (char_length(sources) <= 2000))) NOT VALID;

--
-- Name: community_posts community_posts_title_length; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.community_posts
    ADD CONSTRAINT community_posts_title_length CHECK (((char_length(title) >= 1) AND (char_length(title) <= 150))) NOT VALID;

--
-- Name: community_posts community_posts_write_up_length; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.community_posts
    ADD CONSTRAINT community_posts_write_up_length CHECK (((write_up IS NULL) OR (char_length(write_up) <= 10000))) NOT VALID;

--
-- Name: content_reports content_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_reports
    ADD CONSTRAINT content_reports_pkey PRIMARY KEY (id);

--
-- Name: content_reports content_reports_reporter_id_target_type_target_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_reports
    ADD CONSTRAINT content_reports_reporter_id_target_type_target_id_key UNIQUE (reporter_id, target_type, target_id);

--
-- Name: email_tokens email_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_tokens
    ADD CONSTRAINT email_tokens_pkey PRIMARY KEY (id);

--
-- Name: email_tokens email_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_tokens
    ADD CONSTRAINT email_tokens_token_hash_key UNIQUE (token_hash);

--
-- Name: favorite_ingredients favorite_ingredients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorite_ingredients
    ADD CONSTRAINT favorite_ingredients_pkey PRIMARY KEY (id);

--
-- Name: favorite_ingredients favorite_ingredients_user_id_ingredient_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorite_ingredients
    ADD CONSTRAINT favorite_ingredients_user_id_ingredient_id_key UNIQUE (user_id, ingredient_id);

--
-- Name: formulation_ingredients formulation_ingredients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formulation_ingredients
    ADD CONSTRAINT formulation_ingredients_pkey PRIMARY KEY (id);

--
-- Name: formulation_phases formulation_phases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formulation_phases
    ADD CONSTRAINT formulation_phases_pkey PRIMARY KEY (id);

--
-- Name: formulation_profiles formulation_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formulation_profiles
    ADD CONSTRAINT formulation_profiles_pkey PRIMARY KEY (id);

--
-- Name: formulation_versions formulation_versions_formulation_id_version_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formulation_versions
    ADD CONSTRAINT formulation_versions_formulation_id_version_number_key UNIQUE (formulation_id, version_number);

--
-- Name: formulation_versions formulation_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formulation_versions
    ADD CONSTRAINT formulation_versions_pkey PRIMARY KEY (id);

--
-- Name: formulations formulations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formulations
    ADD CONSTRAINT formulations_pkey PRIMARY KEY (id);

--
-- Name: ingredients ingredients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingredients
    ADD CONSTRAINT ingredients_pkey PRIMARY KEY (id);

--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);

--
-- Name: post_comments post_comments_body_length; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.post_comments
    ADD CONSTRAINT post_comments_body_length CHECK (((char_length(body) >= 1) AND (char_length(body) <= 2000))) NOT VALID;

--
-- Name: post_comments post_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_comments
    ADD CONSTRAINT post_comments_pkey PRIMARY KEY (id);

--
-- Name: post_snapshots post_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_snapshots
    ADD CONSTRAINT post_snapshots_pkey PRIMARY KEY (id);

--
-- Name: recipe_ratings recipe_ratings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_ratings
    ADD CONSTRAINT recipe_ratings_pkey PRIMARY KEY (id);

--
-- Name: recipe_ratings recipe_ratings_post_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_ratings
    ADD CONSTRAINT recipe_ratings_post_id_user_id_key UNIQUE (post_id, user_id);

--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);

--
-- Name: refresh_tokens refresh_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_hash_key UNIQUE (token_hash);

--
-- Name: ingredients unique_inci_name; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingredients
    ADD CONSTRAINT unique_inci_name UNIQUE (inci_name);

--
-- Name: user_containers user_containers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_containers
    ADD CONSTRAINT user_containers_pkey PRIMARY KEY (id);

--
-- Name: user_starred_ingredients user_starred_ingredients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_starred_ingredients
    ADD CONSTRAINT user_starred_ingredients_pkey PRIMARY KEY (id);

--
-- Name: user_starred_ingredients user_starred_ingredients_user_id_ingredient_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_starred_ingredients
    ADD CONSTRAINT user_starred_ingredients_user_id_ingredient_id_key UNIQUE (user_id, ingredient_id);

--
-- Name: user_stash user_stash_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_stash
    ADD CONSTRAINT user_stash_pkey PRIMARY KEY (id);

--
-- Name: app_users_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX app_users_email_key ON public.app_users USING btree (lower(email));

--
-- Name: app_users_username_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX app_users_username_key ON public.app_users USING btree (lower(username));

--
-- Name: batch_checks_batch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX batch_checks_batch_idx ON public.batch_checks USING btree (batch_id);

--
-- Name: batch_checks_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX batch_checks_due_idx ON public.batch_checks USING btree (user_id, due_on) WHERE (checked_at IS NULL);

--
-- Name: batch_ingredients_batch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX batch_ingredients_batch_idx ON public.batch_ingredients USING btree (batch_id);

--
-- Name: batch_stash_usage_batch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX batch_stash_usage_batch_idx ON public.batch_stash_usage USING btree (batch_id);

--
-- Name: batches_container_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX batches_container_idx ON public.batches USING btree (container_id) WHERE (container_id IS NOT NULL);

--
-- Name: batches_formulation_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX batches_formulation_idx ON public.batches USING btree (formulation_id);

--
-- Name: batches_user_made_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX batches_user_made_idx ON public.batches USING btree (user_id, made_on DESC);

--
-- Name: community_posts_remixed_from_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX community_posts_remixed_from_idx ON public.community_posts USING btree (remixed_from_post_id) WHERE (remixed_from_post_id IS NOT NULL);

--
-- Name: content_reports_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX content_reports_status_idx ON public.content_reports USING btree (status, created_at DESC);

--
-- Name: email_tokens_expires_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_tokens_expires_idx ON public.email_tokens USING btree (expires_at);

--
-- Name: email_tokens_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_tokens_user_idx ON public.email_tokens USING btree (user_id, purpose);

--
-- Name: formulation_versions_formulation_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX formulation_versions_formulation_idx ON public.formulation_versions USING btree (formulation_id, version_number DESC);

--
-- Name: formulations_cloned_from_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX formulations_cloned_from_idx ON public.formulations USING btree (cloned_from_formulation_id) WHERE (cloned_from_formulation_id IS NOT NULL);

--
-- Name: formulations_remixed_from_post_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX formulations_remixed_from_post_idx ON public.formulations USING btree (remixed_from_post_id) WHERE (remixed_from_post_id IS NOT NULL);

--
-- Name: recipe_ratings_post_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX recipe_ratings_post_id_idx ON public.recipe_ratings USING btree (post_id);

--
-- Name: refresh_tokens_family_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX refresh_tokens_family_idx ON public.refresh_tokens USING btree (family_id);

--
-- Name: refresh_tokens_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX refresh_tokens_user_idx ON public.refresh_tokens USING btree (user_id);

--
-- Name: batch_checks batch_checks_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batch_checks
    ADD CONSTRAINT batch_checks_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.batches(id) ON DELETE CASCADE;

--
-- Name: batch_checks batch_checks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batch_checks
    ADD CONSTRAINT batch_checks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE NOT VALID;

--
-- Name: batch_ingredients batch_ingredients_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batch_ingredients
    ADD CONSTRAINT batch_ingredients_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.batches(id) ON DELETE CASCADE;

--
-- Name: batch_ingredients batch_ingredients_ingredient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batch_ingredients
    ADD CONSTRAINT batch_ingredients_ingredient_id_fkey FOREIGN KEY (ingredient_id) REFERENCES public.ingredients(id) ON DELETE SET NULL;

--
-- Name: batch_ingredients batch_ingredients_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batch_ingredients
    ADD CONSTRAINT batch_ingredients_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE NOT VALID;

--
-- Name: batch_stash_usage batch_stash_usage_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batch_stash_usage
    ADD CONSTRAINT batch_stash_usage_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.batches(id) ON DELETE CASCADE;

--
-- Name: batch_stash_usage batch_stash_usage_batch_ingredient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batch_stash_usage
    ADD CONSTRAINT batch_stash_usage_batch_ingredient_id_fkey FOREIGN KEY (batch_ingredient_id) REFERENCES public.batch_ingredients(id) ON DELETE CASCADE;

--
-- Name: batch_stash_usage batch_stash_usage_stash_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batch_stash_usage
    ADD CONSTRAINT batch_stash_usage_stash_id_fkey FOREIGN KEY (stash_id) REFERENCES public.user_stash(id) ON DELETE SET NULL;

--
-- Name: batch_stash_usage batch_stash_usage_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batch_stash_usage
    ADD CONSTRAINT batch_stash_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE NOT VALID;

--
-- Name: batches batches_container_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batches
    ADD CONSTRAINT batches_container_id_fkey FOREIGN KEY (container_id) REFERENCES public.user_containers(id) ON DELETE SET NULL;

--
-- Name: batches batches_formulation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batches
    ADD CONSTRAINT batches_formulation_id_fkey FOREIGN KEY (formulation_id) REFERENCES public.formulations(id) ON DELETE SET NULL;

--
-- Name: batches batches_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batches
    ADD CONSTRAINT batches_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE NOT VALID;

--
-- Name: community_moderators community_moderators_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_moderators
    ADD CONSTRAINT community_moderators_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE NOT VALID;

--
-- Name: community_mutes community_mutes_muted_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_mutes
    ADD CONSTRAINT community_mutes_muted_user_id_fkey FOREIGN KEY (muted_user_id) REFERENCES public.app_users(id) ON DELETE CASCADE NOT VALID;

--
-- Name: community_mutes community_mutes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_mutes
    ADD CONSTRAINT community_mutes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE NOT VALID;

--
-- Name: community_posts community_posts_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_posts
    ADD CONSTRAINT community_posts_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.app_users(id) ON DELETE CASCADE NOT VALID;

--
-- Name: community_posts community_posts_remixed_from_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_posts
    ADD CONSTRAINT community_posts_remixed_from_post_id_fkey FOREIGN KEY (remixed_from_post_id) REFERENCES public.community_posts(id) ON DELETE SET NULL;

--
-- Name: content_reports content_reports_reporter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_reports
    ADD CONSTRAINT content_reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES public.app_users(id) ON DELETE CASCADE NOT VALID;

--
-- Name: content_reports content_reports_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_reports
    ADD CONSTRAINT content_reports_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.app_users(id) ON DELETE SET NULL NOT VALID;

--
-- Name: email_tokens email_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_tokens
    ADD CONSTRAINT email_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;

--
-- Name: favorite_ingredients favorite_ingredients_ingredient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorite_ingredients
    ADD CONSTRAINT favorite_ingredients_ingredient_id_fkey FOREIGN KEY (ingredient_id) REFERENCES public.ingredients(id);

--
-- Name: favorite_ingredients favorite_ingredients_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorite_ingredients
    ADD CONSTRAINT favorite_ingredients_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE NOT VALID;

--
-- Name: formulation_ingredients formulation_ingredients_ingredient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formulation_ingredients
    ADD CONSTRAINT formulation_ingredients_ingredient_id_fkey FOREIGN KEY (ingredient_id) REFERENCES public.ingredients(id);

--
-- Name: formulation_ingredients formulation_ingredients_phase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formulation_ingredients
    ADD CONSTRAINT formulation_ingredients_phase_id_fkey FOREIGN KEY (phase_id) REFERENCES public.formulation_phases(id) ON DELETE CASCADE;

--
-- Name: formulation_phases formulation_phases_formulation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formulation_phases
    ADD CONSTRAINT formulation_phases_formulation_id_fkey FOREIGN KEY (formulation_id) REFERENCES public.formulations(id) ON DELETE CASCADE;

--
-- Name: formulation_versions formulation_versions_formulation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formulation_versions
    ADD CONSTRAINT formulation_versions_formulation_id_fkey FOREIGN KEY (formulation_id) REFERENCES public.formulations(id) ON DELETE CASCADE;

--
-- Name: formulation_versions formulation_versions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formulation_versions
    ADD CONSTRAINT formulation_versions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;

--
-- Name: formulations formulations_cloned_from_formulation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formulations
    ADD CONSTRAINT formulations_cloned_from_formulation_id_fkey FOREIGN KEY (cloned_from_formulation_id) REFERENCES public.formulations(id) ON DELETE SET NULL;

--
-- Name: formulations formulations_community_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formulations
    ADD CONSTRAINT formulations_community_post_id_fkey FOREIGN KEY (community_post_id) REFERENCES public.community_posts(id) ON DELETE SET NULL;

--
-- Name: formulations formulations_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formulations
    ADD CONSTRAINT formulations_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.formulation_profiles(id);

--
-- Name: formulations formulations_remixed_from_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formulations
    ADD CONSTRAINT formulations_remixed_from_post_id_fkey FOREIGN KEY (remixed_from_post_id) REFERENCES public.community_posts(id) ON DELETE SET NULL;

--
-- Name: formulations formulations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formulations
    ADD CONSTRAINT formulations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE NOT VALID;

--
-- Name: ingredients ingredients_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingredients
    ADD CONSTRAINT ingredients_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE NOT VALID;

--
-- Name: notifications notifications_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.community_posts(id) ON DELETE CASCADE;

--
-- Name: notifications notifications_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.app_users(id) ON DELETE CASCADE NOT VALID;

--
-- Name: post_comments post_comments_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_comments
    ADD CONSTRAINT post_comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.app_users(id) ON DELETE CASCADE NOT VALID;

--
-- Name: post_comments post_comments_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_comments
    ADD CONSTRAINT post_comments_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.community_posts(id) ON DELETE CASCADE;

--
-- Name: post_comments post_comments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_comments
    ADD CONSTRAINT post_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE NOT VALID;

--
-- Name: post_snapshots post_snapshots_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_snapshots
    ADD CONSTRAINT post_snapshots_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.community_posts(id) ON DELETE CASCADE;

--
-- Name: recipe_ratings recipe_ratings_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_ratings
    ADD CONSTRAINT recipe_ratings_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.community_posts(id) ON DELETE CASCADE;

--
-- Name: recipe_ratings recipe_ratings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_ratings
    ADD CONSTRAINT recipe_ratings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE NOT VALID;

--
-- Name: refresh_tokens refresh_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;

--
-- Name: user_containers user_containers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_containers
    ADD CONSTRAINT user_containers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE NOT VALID;

--
-- Name: user_starred_ingredients user_starred_ingredients_ingredient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_starred_ingredients
    ADD CONSTRAINT user_starred_ingredients_ingredient_id_fkey FOREIGN KEY (ingredient_id) REFERENCES public.ingredients(id) ON DELETE CASCADE;

--
-- Name: user_starred_ingredients user_starred_ingredients_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_starred_ingredients
    ADD CONSTRAINT user_starred_ingredients_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE NOT VALID;

--
-- Name: user_stash user_stash_ingredient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_stash
    ADD CONSTRAINT user_stash_ingredient_id_fkey FOREIGN KEY (ingredient_id) REFERENCES public.ingredients(id);

--
-- Name: user_stash user_stash_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_stash
    ADD CONSTRAINT user_stash_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE NOT VALID;

--
-- Name: app_users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;

--
-- Name: batch_checks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.batch_checks ENABLE ROW LEVEL SECURITY;

--
-- Name: batch_ingredients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.batch_ingredients ENABLE ROW LEVEL SECURITY;

--
-- Name: batch_stash_usage; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.batch_stash_usage ENABLE ROW LEVEL SECURITY;

--
-- Name: batches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;

--
-- Name: community_moderators; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.community_moderators ENABLE ROW LEVEL SECURITY;

--
-- Name: community_mutes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.community_mutes ENABLE ROW LEVEL SECURITY;

--
-- Name: community_posts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;

--
-- Name: content_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: email_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: favorite_ingredients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.favorite_ingredients ENABLE ROW LEVEL SECURITY;

--
-- Name: formulation_ingredients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.formulation_ingredients ENABLE ROW LEVEL SECURITY;

--
-- Name: formulation_phases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.formulation_phases ENABLE ROW LEVEL SECURITY;

--
-- Name: formulation_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.formulation_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: formulation_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.formulation_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: formulations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.formulations ENABLE ROW LEVEL SECURITY;

--
-- Name: ingredients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: post_comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

--
-- Name: post_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.post_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: recipe_ratings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recipe_ratings ENABLE ROW LEVEL SECURITY;

--
-- Name: refresh_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.refresh_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: user_containers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_containers ENABLE ROW LEVEL SECURITY;

--
-- Name: user_starred_ingredients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_starred_ingredients ENABLE ROW LEVEL SECURITY;

--
-- Name: user_stash; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_stash ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

-- The browser roles (anon, authenticated) exist on Supabase only. They must have no access: the Spring backend, connecting as the owner,
-- is the only thing that talks to the database.
do $$
begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on all tables in schema public from anon, authenticated;
    revoke all on all sequences in schema public from anon, authenticated;
    revoke all on all functions in schema public from anon, authenticated;
    alter default privileges in schema public revoke all on tables from anon, authenticated;
    alter default privileges in schema public revoke all on sequences from anon, authenticated;
    alter default privileges in schema public revoke all on functions from anon, authenticated;
  end if;
end $$;
