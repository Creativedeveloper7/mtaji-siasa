-- M-Taji Siasa durable store.
-- PostgreSQL 14+.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/mtaji-siasa.sql
--
-- This script creates the tables and data functions behind the in-memory
-- repositories in src/server. It does not load src/data. Seed rows are applied
-- later by the SQL repository, so the TypeScript seed stays the sample data.
--
-- Sessions stay in the HttpOnly HMAC cookie (src/server/auth/session.ts).
-- Password checks stay in src/server/auth/password.ts (scrypt). This database
-- stores the hash and never a plaintext password.
-- Role gates (who may write) stay in src/server/* /service.ts. These functions
-- persist the records those services have already accepted.
--
-- Delete behavior that is stricter than the memory adapter, on purpose:
--   deleting a leader is refused while a product, campaign, or poster still
--   points at that leader. Clear those rows first.
--   deleting a project is refused while a timelapse still points at it.
--   deleting a creative is refused while a campaign still lists it.
--   deleting a campaign also deletes its policy reviews.

BEGIN;

CREATE SCHEMA IF NOT EXISTS mtaji;
SET search_path TO mtaji, public;

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

CREATE TABLE users (
  id text PRIMARY KEY,
  seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL DEFAULT '',
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('citizen', 'leader', 'aspirant', 'organization', 'admin')),
  created_at text NOT NULL,
  leader_id text
);

CREATE UNIQUE INDEX users_email_lower ON users (lower(email));

-- ---------------------------------------------------------------------------
-- Civic content
-- ---------------------------------------------------------------------------

CREATE TABLE leaders (
  id text PRIMARY KEY,
  seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  honorific text NOT NULL DEFAULT '',
  position text NOT NULL DEFAULT '',
  type text NOT NULL CHECK (type IN ('elected', 'aspirant')),
  county text NOT NULL DEFAULT '',
  constituency text,
  ward text,
  photo text NOT NULL DEFAULT '',
  cover_image text,
  short_bio text NOT NULL DEFAULT '',
  bio text NOT NULL DEFAULT '',
  social_x text,
  social_instagram text,
  social_facebook text,
  social_tiktok text,
  social_whatsapp text,
  social_website text,
  vision_statement text,
  vision_expected_impact_present boolean NOT NULL DEFAULT false
);

CREATE TABLE projects (
  id text PRIMARY KEY,
  seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('infrastructure', 'non-infrastructure')),
  subcategory text NOT NULL DEFAULT '',
  location text NOT NULL DEFAULT '',
  county text NOT NULL DEFAULT '',
  status text NOT NULL CHECK (status IN ('planned', 'in-progress', 'completed', 'on-hold')),
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  image text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  start_date text NOT NULL DEFAULT '',
  expected_completion text NOT NULL DEFAULT '',
  center_lat numeric NOT NULL,
  center_lng numeric NOT NULL,
  boundary jsonb
);

CREATE TABLE milestones (
  id text PRIMARY KEY,
  seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  number integer NOT NULL,
  date text NOT NULL DEFAULT '',
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL CHECK (status IN ('completed', 'current', 'upcoming')),
  image text
);

CREATE INDEX milestones_project ON milestones (project_id, position, number);

CREATE TABLE opportunities (
  id text PRIMARY KEY,
  seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  category text NOT NULL CHECK (category IN ('jobs', 'tenders', 'training', 'funding', 'youth', 'business', 'other')),
  location text NOT NULL DEFAULT '',
  county text NOT NULL DEFAULT '',
  deadline text NOT NULL DEFAULT '',
  eligibility text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  image text,
  project_id text REFERENCES projects (id) ON DELETE SET NULL,
  leader_id text,
  status text CHECK (status IS NULL OR status IN ('open', 'closing-soon', 'closed')),
  opening_date text,
  organization text,
  application_url text
);

CREATE INDEX opportunities_leader ON opportunities (leader_id);
CREATE INDEX opportunities_project ON opportunities (project_id);

CREATE TABLE media_items (
  id text PRIMARY KEY,
  seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  category text NOT NULL CHECK (category IN ('news', 'project-updates', 'leader-updates', 'videos', 'stories')),
  type text NOT NULL CHECK (type IN ('image', 'video', 'article')),
  image text NOT NULL DEFAULT '',
  date text NOT NULL DEFAULT '',
  excerpt text NOT NULL DEFAULT '',
  body text,
  video_url text,
  leader_id text,
  project_id text REFERENCES projects (id) ON DELETE SET NULL,
  updated_at text,
  author text
);

CREATE INDEX media_leader ON media_items (leader_id);
CREATE INDEX media_project ON media_items (project_id);

CREATE TABLE polls (
  id text PRIMARY KEY,
  seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  slug text NOT NULL UNIQUE,
  question text NOT NULL,
  closing_date text NOT NULL DEFAULT '',
  leader_id text,
  participation_count integer NOT NULL DEFAULT 0 CHECK (participation_count >= 0)
);

CREATE INDEX polls_leader ON polls (leader_id);

CREATE TABLE poll_options (
  id text PRIMARY KEY,
  poll_id text NOT NULL REFERENCES polls (id) ON DELETE CASCADE,
  position integer NOT NULL,
  label text NOT NULL,
  votes integer NOT NULL DEFAULT 0 CHECK (votes >= 0)
);

CREATE INDEX poll_options_poll ON poll_options (poll_id, position);

CREATE TABLE products (
  id text PRIMARY KEY,
  seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  price numeric(14, 2) NOT NULL CHECK (price >= 0),
  currency text NOT NULL DEFAULT 'KES',
  image text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  stock integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  leader_id text NOT NULL
);

CREATE INDEX products_leader ON products (leader_id);

-- Ordered string lists: achievements, manifesto lines, benefits, requirements, steps.
CREATE TABLE list_items (
  owner_kind text NOT NULL,
  owner_id text NOT NULL,
  list_name text NOT NULL,
  position integer NOT NULL,
  value text NOT NULL,
  PRIMARY KEY (owner_kind, owner_id, list_name, position)
);

CREATE TABLE proposed_projects (
  id text PRIMARY KEY,
  leader_id text NOT NULL REFERENCES leaders (id) ON DELETE CASCADE,
  position integer NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  location text NOT NULL DEFAULT '',
  category text NOT NULL CHECK (category IN ('infrastructure', 'non-infrastructure')),
  simulation_image text NOT NULL DEFAULT '',
  expected_impact text NOT NULL DEFAULT ''
);

CREATE INDEX proposed_projects_leader ON proposed_projects (leader_id, position);

-- Parent id arrays. Singular foreign keys on the child are stored as well,
-- because the app writes both (for example opportunity.leaderId and leader.opportunityIds).
CREATE TABLE project_leaders (
  project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  leader_id text NOT NULL REFERENCES leaders (id) ON DELETE CASCADE,
  project_position integer NOT NULL DEFAULT 0,
  leader_position integer NOT NULL DEFAULT 0,
  PRIMARY KEY (project_id, leader_id)
);

CREATE INDEX project_leaders_leader ON project_leaders (leader_id, leader_position);

CREATE TABLE leader_opportunities (
  leader_id text NOT NULL REFERENCES leaders (id) ON DELETE CASCADE,
  opportunity_id text NOT NULL REFERENCES opportunities (id) ON DELETE CASCADE,
  position integer NOT NULL,
  PRIMARY KEY (leader_id, opportunity_id)
);

CREATE TABLE leader_media (
  leader_id text NOT NULL REFERENCES leaders (id) ON DELETE CASCADE,
  media_id text NOT NULL REFERENCES media_items (id) ON DELETE CASCADE,
  position integer NOT NULL,
  PRIMARY KEY (leader_id, media_id)
);

CREATE TABLE leader_polls (
  leader_id text NOT NULL REFERENCES leaders (id) ON DELETE CASCADE,
  poll_id text NOT NULL REFERENCES polls (id) ON DELETE CASCADE,
  position integer NOT NULL,
  PRIMARY KEY (leader_id, poll_id)
);

CREATE TABLE leader_products (
  leader_id text NOT NULL REFERENCES leaders (id) ON DELETE CASCADE,
  product_id text NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  position integer NOT NULL,
  PRIMARY KEY (leader_id, product_id)
);

CREATE TABLE project_opportunities (
  project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  opportunity_id text NOT NULL REFERENCES opportunities (id) ON DELETE CASCADE,
  position integer NOT NULL,
  PRIMARY KEY (project_id, opportunity_id)
);

CREATE TABLE project_media (
  project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  media_id text NOT NULL REFERENCES media_items (id) ON DELETE CASCADE,
  position integer NOT NULL,
  PRIMARY KEY (project_id, media_id)
);

CREATE TABLE opportunity_related_media (
  opportunity_id text NOT NULL REFERENCES opportunities (id) ON DELETE CASCADE,
  media_id text NOT NULL REFERENCES media_items (id) ON DELETE CASCADE,
  position integer NOT NULL,
  PRIMARY KEY (opportunity_id, media_id)
);

CREATE TABLE media_related_opportunities (
  media_id text NOT NULL REFERENCES media_items (id) ON DELETE CASCADE,
  opportunity_id text NOT NULL REFERENCES opportunities (id) ON DELETE CASCADE,
  position integer NOT NULL,
  PRIMARY KEY (media_id, opportunity_id)
);

CREATE TABLE media_related_media (
  media_id text NOT NULL REFERENCES media_items (id) ON DELETE CASCADE,
  related_media_id text NOT NULL REFERENCES media_items (id) ON DELETE CASCADE,
  position integer NOT NULL,
  PRIMARY KEY (media_id, related_media_id),
  CHECK (media_id <> related_media_id)
);

ALTER TABLE opportunities
  ADD CONSTRAINT opportunities_leader_fk
  FOREIGN KEY (leader_id) REFERENCES leaders (id) ON DELETE SET NULL;

ALTER TABLE media_items
  ADD CONSTRAINT media_leader_fk
  FOREIGN KEY (leader_id) REFERENCES leaders (id) ON DELETE SET NULL;

ALTER TABLE polls
  ADD CONSTRAINT polls_leader_fk
  FOREIGN KEY (leader_id) REFERENCES leaders (id) ON DELETE SET NULL;

ALTER TABLE products
  ADD CONSTRAINT products_leader_fk
  FOREIGN KEY (leader_id) REFERENCES leaders (id) ON DELETE RESTRICT;

ALTER TABLE users
  ADD CONSTRAINT users_leader_fk
  FOREIGN KEY (leader_id) REFERENCES leaders (id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Adly
-- ---------------------------------------------------------------------------

CREATE TABLE campaigns (
  id text PRIMARY KEY,
  seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  objective text NOT NULL CHECK (objective IN (
    'awareness', 'reach', 'engagement', 'traffic', 'leads', 'community-support', 'project-visibility'
  )),
  status text NOT NULL CHECK (status IN ('draft', 'in-review', 'active', 'paused', 'completed')),
  leader_id text NOT NULL REFERENCES leaders (id) ON DELETE RESTRICT,
  project_id text REFERENCES projects (id) ON DELETE SET NULL,
  target_country text NOT NULL DEFAULT 'Kenya',
  target_county text,
  target_constituency text,
  target_ward text,
  target_radius_km numeric,
  target_lat numeric,
  target_lng numeric,
  start_date text NOT NULL DEFAULT '',
  end_date text NOT NULL DEFAULT '',
  budget numeric(14, 2) NOT NULL DEFAULT 0 CHECK (budget >= 0),
  currency text NOT NULL DEFAULT 'KES',
  spend numeric(14, 2) NOT NULL DEFAULT 0,
  reach numeric(14, 2) NOT NULL DEFAULT 0,
  impressions numeric(14, 2) NOT NULL DEFAULT 0,
  engagement numeric(14, 2) NOT NULL DEFAULT 0,
  ctr numeric(8, 4) NOT NULL DEFAULT 0,
  conversions numeric(14, 2) NOT NULL DEFAULT 0,
  performance_currency text NOT NULL DEFAULT 'KES',
  policy_review_id text,
  created_at text NOT NULL
);

CREATE INDEX campaigns_leader ON campaigns (leader_id);

CREATE TABLE creatives (
  id text PRIMARY KEY,
  seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  name text NOT NULL,
  headline text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  cta text NOT NULL DEFAULT '',
  image text NOT NULL DEFAULT '',
  spend numeric(14, 2),
  reach numeric(14, 2),
  impressions numeric(14, 2),
  engagement numeric(14, 2),
  ctr numeric(8, 4),
  conversions numeric(14, 2),
  performance_currency text
);

CREATE TABLE policy_reviews (
  id text PRIMARY KEY,
  seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  campaign_id text NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('passed', 'review', 'needs-attention')),
  disclaimer text NOT NULL DEFAULT '',
  reviewed_at text NOT NULL
);

CREATE UNIQUE INDEX policy_reviews_campaign ON policy_reviews (campaign_id, id);

CREATE TABLE policy_checks (
  id text PRIMARY KEY,
  review_id text NOT NULL REFERENCES policy_reviews (id) ON DELETE CASCADE,
  position integer NOT NULL,
  label text NOT NULL,
  status text NOT NULL CHECK (status IN ('passed', 'review', 'needs-attention')),
  note text NOT NULL DEFAULT ''
);

CREATE INDEX policy_checks_review ON policy_checks (review_id, position);

CREATE TABLE posters (
  id text PRIMARY KEY,
  seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  name text NOT NULL,
  leader_id text NOT NULL REFERENCES leaders (id) ON DELETE RESTRICT,
  project_id text REFERENCES projects (id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN (
    'campaign', 'development-project', 'event', 'community-message', 'manifesto', 'announcement', 'achievement'
  )),
  format text NOT NULL CHECK (format IN ('1080x1350', '1080x1080', '1920x1080')),
  headline text NOT NULL DEFAULT '',
  supporting text NOT NULL DEFAULT '',
  cta text NOT NULL DEFAULT '',
  date text,
  location text,
  portrait text,
  project_image text,
  logo text,
  selected_concept_id text,
  created_at text NOT NULL
);

CREATE INDEX posters_leader ON posters (leader_id);

CREATE TABLE poster_concepts (
  id text PRIMARY KEY,
  poster_id text NOT NULL REFERENCES posters (id) ON DELETE CASCADE,
  position integer NOT NULL,
  label text NOT NULL,
  layout text NOT NULL CHECK (layout IN ('hero-left', 'hero-full', 'split', 'minimal')),
  accent text NOT NULL DEFAULT '#e5b12a'
);

CREATE INDEX poster_concepts_poster ON poster_concepts (poster_id, position);

CREATE TABLE timelapses (
  id text PRIMARY KEY,
  seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  name text NOT NULL,
  project_id text NOT NULL REFERENCES projects (id) ON DELETE RESTRICT,
  location text NOT NULL DEFAULT '',
  start_date text NOT NULL DEFAULT '',
  end_date text NOT NULL DEFAULT '',
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  aspect text NOT NULL CHECK (aspect IN ('16:9', '9:16', '1:1')),
  captions_enabled boolean NOT NULL DEFAULT true,
  branding_enabled boolean NOT NULL DEFAULT true,
  created_at text NOT NULL
);

CREATE INDEX timelapses_project ON timelapses (project_id);

CREATE TABLE timelapse_media (
  id text PRIMARY KEY,
  timelapse_id text NOT NULL REFERENCES timelapses (id) ON DELETE CASCADE,
  position integer NOT NULL,
  type text NOT NULL CHECK (type IN ('image', 'video', 'drone', 'satellite')),
  url text NOT NULL,
  caption text NOT NULL DEFAULT '',
  captured_at text NOT NULL,
  phase text NOT NULL CHECK (phase IN ('before', 'during', 'after'))
);

CREATE INDEX timelapse_media_parent ON timelapse_media (timelapse_id, position);

CREATE TABLE simulations (
  id text PRIMARY KEY,
  seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  development_type text NOT NULL CHECK (development_type IN (
    'hospital', 'road', 'housing', 'water', 'market', 'sports', 'industrial', 'transport', 'school', 'other'
  )),
  location_label text NOT NULL DEFAULT '',
  lat numeric NOT NULL,
  lng numeric NOT NULL,
  expected_outcome text NOT NULL DEFAULT '',
  style text NOT NULL CHECK (style IN ('photoreal', 'architectural', 'conceptual')),
  before_image text NOT NULL DEFAULT '',
  after_image text NOT NULL DEFAULT '',
  leader_id text REFERENCES leaders (id) ON DELETE SET NULL,
  project_id text REFERENCES projects (id) ON DELETE SET NULL,
  is_ai_simulation boolean NOT NULL DEFAULT true CHECK (is_ai_simulation),
  created_at text NOT NULL
);

CREATE INDEX simulations_leader ON simulations (leader_id);

CREATE TABLE insights (
  id text PRIMARY KEY,
  seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  tone text NOT NULL CHECK (tone IN ('positive', 'neutral', 'attention')),
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  related_campaign_id text REFERENCES campaigns (id) ON DELETE SET NULL,
  related_creative_id text REFERENCES creatives (id) ON DELETE SET NULL
);

CREATE TABLE campaign_platforms (
  campaign_id text NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('meta', 'instagram', 'facebook', 'whatsapp', 'tiktok', 'google', 'x')),
  position integer NOT NULL,
  PRIMARY KEY (campaign_id, platform)
);

CREATE TABLE campaign_creatives (
  campaign_id text NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
  creative_id text NOT NULL REFERENCES creatives (id) ON DELETE RESTRICT,
  position integer NOT NULL,
  PRIMARY KEY (campaign_id, creative_id)
);

CREATE TABLE creative_platforms (
  creative_id text NOT NULL REFERENCES creatives (id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('meta', 'instagram', 'facebook', 'whatsapp', 'tiktok', 'google', 'x')),
  position integer NOT NULL,
  PRIMARY KEY (creative_id, platform)
);

CREATE TABLE timelapse_milestones (
  timelapse_id text NOT NULL REFERENCES timelapses (id) ON DELETE CASCADE,
  milestone_id text NOT NULL REFERENCES milestones (id) ON DELETE CASCADE,
  position integer NOT NULL,
  PRIMARY KEY (timelapse_id, milestone_id)
);

-- ---------------------------------------------------------------------------
-- Wallet and engagement
-- ---------------------------------------------------------------------------

CREATE TABLE wallets (
  leader_id text PRIMARY KEY REFERENCES leaders (id) ON DELETE CASCADE,
  crowdfunding numeric(14, 2) NOT NULL DEFAULT 185000 CHECK (crowdfunding >= 0),
  merchandise numeric(14, 2) NOT NULL DEFAULT 62400 CHECK (merchandise >= 0),
  donations numeric(14, 2) NOT NULL DEFAULT 41000 CHECK (donations >= 0),
  transfers numeric(14, 2) NOT NULL DEFAULT 15000 CHECK (transfers >= 0),
  last_top_up_at text,
  last_withdrawal_at text
);

CREATE TABLE wallet_movements (
  id text PRIMARY KEY,
  seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  leader_id text NOT NULL REFERENCES wallets (leader_id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('top-up', 'withdrawal')),
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  source text CHECK (source IS NULL OR source IN ('mpesa', 'bank', 'card', 'crowdfunding', 'merchandise')),
  status text NOT NULL DEFAULT 'recorded' CHECK (status = 'recorded'),
  created_at text NOT NULL
);

CREATE INDEX wallet_movements_leader ON wallet_movements (leader_id, seq DESC);

-- A row exists after the first save, including a save of an empty list.
CREATE TABLE saved_opportunity_lists (
  user_id text PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE saved_opportunities (
  user_id text NOT NULL REFERENCES saved_opportunity_lists (user_id) ON DELETE CASCADE,
  opportunity_id text NOT NULL REFERENCES opportunities (id) ON DELETE CASCADE,
  position integer NOT NULL,
  PRIMARY KEY (user_id, opportunity_id)
);

CREATE TABLE adly_interest_leads (
  id text PRIMARY KEY,
  seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  organization text NOT NULL DEFAULT '',
  role text NOT NULL CHECK (role IN ('Politician', 'Aspirant', 'Campaign Team', 'Organization', 'Other')),
  created_at text NOT NULL
);

CREATE TABLE adly_interest_topics (
  lead_id text NOT NULL REFERENCES adly_interest_leads (id) ON DELETE CASCADE,
  position integer NOT NULL,
  topic text NOT NULL CHECK (topic IN (
    'Advertising', 'Campaign Posters', 'Project Timelapses', 'AI Simulations', 'Campaign Analytics', 'Other'
  )),
  PRIMARY KEY (lead_id, topic)
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE FUNCTION texts(p_kind text, p_owner text, p_list text)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = mtaji, public
AS $$
  SELECT COALESCE(
    (
      SELECT jsonb_agg(value ORDER BY position)
      FROM list_items
      WHERE owner_kind = p_kind AND owner_id = p_owner AND list_name = p_list
    ),
    '[]'::jsonb
  );
$$;

CREATE FUNCTION put_texts(p_kind text, p_owner text, p_list text, p_items jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path = mtaji, public
AS $$
BEGIN
  DELETE FROM list_items
  WHERE owner_kind = p_kind AND owner_id = p_owner AND list_name = p_list;
  INSERT INTO list_items (owner_kind, owner_id, list_name, position, value)
  SELECT p_kind, p_owner, p_list, ordinality::integer, value
  FROM jsonb_array_elements_text(COALESCE(p_items, '[]'::jsonb)) WITH ORDINALITY
  WHERE value <> '';
END;
$$;

CREATE FUNCTION linked_ids(
  p_table text,
  p_owner_col text,
  p_owner_id text,
  p_item_col text,
  p_position_col text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = mtaji, public
AS $$
DECLARE
  result jsonb;
BEGIN
  EXECUTE format(
    'SELECT COALESCE(jsonb_agg(%I ORDER BY %I), ''[]''::jsonb) FROM mtaji.%I WHERE %I = $1',
    p_item_col, p_position_col, p_table, p_owner_col
  )
  INTO result
  USING p_owner_id;
  RETURN result;
END;
$$;

-- Replace one owner's ordered links. Missing ids fail on the foreign key.
CREATE FUNCTION sync_ordered_link(
  p_table text,
  p_owner_col text,
  p_owner_id text,
  p_item_col text,
  p_position_col text,
  p_ids jsonb
)
RETURNS void
LANGUAGE plpgsql
SET search_path = mtaji, public
AS $$
BEGIN
  EXECUTE format(
    'DELETE FROM mtaji.%I WHERE %I = $1 AND %I NOT IN (SELECT value FROM jsonb_array_elements_text($2) WHERE value <> '''')',
    p_table, p_owner_col, p_item_col
  )
  USING p_owner_id, COALESCE(p_ids, '[]'::jsonb);

  EXECUTE format(
    'INSERT INTO mtaji.%I (%I, %I, %I)
     SELECT $1, value, ordinality::integer
     FROM jsonb_array_elements_text($2) WITH ORDINALITY
     WHERE value <> ''''
     ON CONFLICT (%I, %I) DO UPDATE SET %I = EXCLUDED.%I',
    p_table, p_owner_col, p_item_col, p_position_col,
    p_owner_col, p_item_col, p_position_col, p_position_col
  )
  USING p_owner_id, COALESCE(p_ids, '[]'::jsonb);
END;
$$;

CREATE FUNCTION performance_json(
  p_spend numeric,
  p_reach numeric,
  p_impressions numeric,
  p_engagement numeric,
  p_ctr numeric,
  p_conversions numeric,
  p_currency text
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'spend', p_spend,
    'reach', p_reach,
    'impressions', p_impressions,
    'engagement', p_engagement,
    'ctr', p_ctr,
    'conversions', p_conversions,
    'currency', p_currency
  );
$$;

CREATE FUNCTION require_id(doc jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  found text := NULLIF(doc->>'id', '');
BEGIN
  IF found IS NULL THEN
    RAISE EXCEPTION 'id is required';
  END IF;
  RETURN found;
END;
$$;

-- ---------------------------------------------------------------------------
-- Documents. Keys match the TypeScript types.
-- ---------------------------------------------------------------------------

CREATE FUNCTION leader_document(p_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = mtaji, public
AS $$
DECLARE
  row leaders%ROWTYPE;
  vision jsonb;
  manifesto jsonb;
  priorities jsonb;
  impacts jsonb;
  proposed jsonb;
BEGIN
  SELECT * INTO row FROM leaders WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  manifesto := texts('leader', p_id, 'manifesto');
  priorities := texts('leader', p_id, 'priorities');
  impacts := texts('leader', p_id, 'expectedImpact');
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', id,
      'title', title,
      'description', description,
      'location', location,
      'category', category,
      'simulationImage', simulation_image,
      'expectedImpact', expected_impact
    ) ORDER BY position
  ), '[]'::jsonb)
  INTO proposed
  FROM proposed_projects
  WHERE leader_id = p_id;

  IF row.vision_statement IS NOT NULL OR manifesto <> '[]'::jsonb OR priorities <> '[]'::jsonb
     OR impacts <> '[]'::jsonb OR proposed <> '[]'::jsonb THEN
    vision := jsonb_build_object(
      'statement', COALESCE(row.vision_statement, ''),
      'manifesto', manifesto,
      'priorities', priorities,
      'proposedProjects', proposed,
      'expectedImpact', impacts
    );
  END IF;

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'id', row.id,
    'slug', row.slug,
    'name', row.name,
    'honorific', row.honorific,
    'position', row.position,
    'type', row.type,
    'county', row.county,
    'constituency', row.constituency,
    'ward', row.ward,
    'photo', row.photo,
    'coverImage', row.cover_image,
    'shortBio', row.short_bio,
    'bio', row.bio,
    'achievements', texts('leader', p_id, 'achievements'),
    'social', jsonb_strip_nulls(jsonb_build_object(
      'x', row.social_x,
      'instagram', row.social_instagram,
      'facebook', row.social_facebook,
      'tiktok', row.social_tiktok,
      'whatsapp', row.social_whatsapp,
      'website', row.social_website
    )),
    'projectIds', (
      SELECT COALESCE(jsonb_agg(project_id ORDER BY leader_position), '[]'::jsonb)
      FROM project_leaders WHERE leader_id = p_id
    ),
    'opportunityIds', linked_ids('leader_opportunities', 'leader_id', p_id, 'opportunity_id', 'position'),
    'mediaIds', linked_ids('leader_media', 'leader_id', p_id, 'media_id', 'position'),
    'pollIds', linked_ids('leader_polls', 'leader_id', p_id, 'poll_id', 'position'),
    'productIds', linked_ids('leader_products', 'leader_id', p_id, 'product_id', 'position'),
    'vision', vision
  ));
END;
$$;

CREATE FUNCTION project_document(p_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = mtaji, public
AS $$
DECLARE
  row projects%ROWTYPE;
  geo jsonb;
BEGIN
  SELECT * INTO row FROM projects WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  geo := jsonb_strip_nulls(jsonb_build_object(
    'center', jsonb_build_object('lat', row.center_lat, 'lng', row.center_lng),
    'boundary', row.boundary
  ));
  RETURN jsonb_build_object(
    'id', row.id,
    'slug', row.slug,
    'name', row.name,
    'category', row.category,
    'subcategory', row.subcategory,
    'location', row.location,
    'county', row.county,
    'status', row.status,
    'progress', row.progress,
    'image', row.image,
    'description', row.description,
    'startDate', row.start_date,
    'expectedCompletion', row.expected_completion,
    'leaderIds', (
      SELECT COALESCE(jsonb_agg(leader_id ORDER BY project_position, leader_position), '[]'::jsonb)
      FROM project_leaders WHERE project_id = p_id
    ),
    'geo', geo,
    'milestoneIds', (
      SELECT COALESCE(jsonb_agg(id ORDER BY position, number, seq), '[]'::jsonb)
      FROM milestones WHERE project_id = p_id
    ),
    'opportunityIds', linked_ids('project_opportunities', 'project_id', p_id, 'opportunity_id', 'position'),
    'mediaIds', linked_ids('project_media', 'project_id', p_id, 'media_id', 'position')
  );
END;
$$;

CREATE FUNCTION milestone_document(p_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = mtaji, public
AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'id', id,
    'projectId', project_id,
    'number', number,
    'date', date,
    'title', title,
    'description', description,
    'status', status,
    'image', image
  ))
  FROM milestones
  WHERE id = p_id;
$$;

CREATE FUNCTION opportunity_document(p_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = mtaji, public
AS $$
DECLARE
  row opportunities%ROWTYPE;
BEGIN
  SELECT * INTO row FROM opportunities WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_strip_nulls(jsonb_build_object(
    'id', row.id,
    'slug', row.slug,
    'title', row.title,
    'category', row.category,
    'location', row.location,
    'county', row.county,
    'deadline', row.deadline,
    'eligibility', row.eligibility,
    'description', row.description,
    'image', row.image,
    'projectId', row.project_id,
    'leaderId', row.leader_id,
    'status', row.status,
    'openingDate', row.opening_date,
    'benefits', texts('opportunity', p_id, 'benefits'),
    'requirements', texts('opportunity', p_id, 'requirements'),
    'applicationSteps', texts('opportunity', p_id, 'applicationSteps'),
    'organization', row.organization,
    'applicationUrl', row.application_url,
    'relatedMediaIds', linked_ids('opportunity_related_media', 'opportunity_id', p_id, 'media_id', 'position')
  ));
END;
$$;

CREATE FUNCTION media_document(p_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = mtaji, public
AS $$
DECLARE
  row media_items%ROWTYPE;
BEGIN
  SELECT * INTO row FROM media_items WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_strip_nulls(jsonb_build_object(
    'id', row.id,
    'slug', row.slug,
    'title', row.title,
    'category', row.category,
    'type', row.type,
    'image', row.image,
    'date', row.date,
    'excerpt', row.excerpt,
    'body', row.body,
    'videoUrl', row.video_url,
    'leaderId', row.leader_id,
    'projectId', row.project_id,
    'updatedAt', row.updated_at,
    'author', row.author,
    'relatedOpportunityIds', linked_ids('media_related_opportunities', 'media_id', p_id, 'opportunity_id', 'position'),
    'relatedMediaIds', linked_ids('media_related_media', 'media_id', p_id, 'related_media_id', 'position')
  ));
END;
$$;

CREATE FUNCTION poll_document(p_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = mtaji, public
AS $$
DECLARE
  row polls%ROWTYPE;
  options jsonb;
BEGIN
  SELECT * INTO row FROM polls WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('id', id, 'label', label, 'votes', votes) ORDER BY position
  ), '[]'::jsonb)
  INTO options
  FROM poll_options
  WHERE poll_id = p_id;
  RETURN jsonb_strip_nulls(jsonb_build_object(
    'id', row.id,
    'slug', row.slug,
    'question', row.question,
    'options', options,
    'closingDate', row.closing_date,
    'leaderId', row.leader_id,
    'participationCount', row.participation_count
  ));
END;
$$;

CREATE FUNCTION product_document(p_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = mtaji, public
AS $$
  SELECT jsonb_build_object(
    'id', id,
    'slug', slug,
    'name', name,
    'price', price,
    'currency', currency,
    'image', image,
    'description', description,
    'stock', stock,
    'leaderId', leader_id
  )
  FROM products
  WHERE id = p_id;
$$;

CREATE FUNCTION user_document(p_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = mtaji, public
AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'id', id,
    'fullName', full_name,
    'email', email,
    'phone', phone,
    'role', role,
    'createdAt', created_at,
    'leaderId', leader_id
  ))
  FROM users
  WHERE id = p_id;
$$;

CREATE FUNCTION campaign_document(p_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = mtaji, public
AS $$
DECLARE
  row campaigns%ROWTYPE;
  center jsonb;
BEGIN
  SELECT * INTO row FROM campaigns WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF row.target_lat IS NOT NULL AND row.target_lng IS NOT NULL THEN
    center := jsonb_build_object('lat', row.target_lat, 'lng', row.target_lng);
  END IF;
  RETURN jsonb_strip_nulls(jsonb_build_object(
    'id', row.id,
    'slug', row.slug,
    'name', row.name,
    'objective', row.objective,
    'status', row.status,
    'platformIds', linked_ids('campaign_platforms', 'campaign_id', p_id, 'platform', 'position'),
    'leaderId', row.leader_id,
    'projectId', row.project_id,
    'targeting', jsonb_strip_nulls(jsonb_build_object(
      'country', row.target_country,
      'county', row.target_county,
      'constituency', row.target_constituency,
      'ward', row.target_ward,
      'radiusKm', row.target_radius_km,
      'center', center
    )),
    'startDate', row.start_date,
    'endDate', row.end_date,
    'budget', row.budget,
    'currency', row.currency,
    'creativeIds', linked_ids('campaign_creatives', 'campaign_id', p_id, 'creative_id', 'position'),
    'performance', performance_json(row.spend, row.reach, row.impressions, row.engagement, row.ctr, row.conversions, row.performance_currency),
    'policyReviewId', row.policy_review_id,
    'createdAt', row.created_at
  ));
END;
$$;

CREATE FUNCTION creative_document(p_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = mtaji, public
AS $$
DECLARE
  row creatives%ROWTYPE;
  performance jsonb;
BEGIN
  SELECT * INTO row FROM creatives WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF row.spend IS NOT NULL THEN
    performance := performance_json(
      row.spend, row.reach, row.impressions, row.engagement, row.ctr, row.conversions,
      COALESCE(row.performance_currency, 'KES')
    );
  END IF;
  RETURN jsonb_strip_nulls(jsonb_build_object(
    'id', row.id,
    'name', row.name,
    'headline', row.headline,
    'body', row.body,
    'cta', row.cta,
    'image', row.image,
    'platformIds', linked_ids('creative_platforms', 'creative_id', p_id, 'platform', 'position'),
    'performance', performance
  ));
END;
$$;

CREATE FUNCTION policy_review_document(p_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = mtaji, public
AS $$
DECLARE
  row policy_reviews%ROWTYPE;
  checks jsonb;
BEGIN
  SELECT * INTO row FROM policy_reviews WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('id', id, 'label', label, 'status', status, 'note', note) ORDER BY position
  ), '[]'::jsonb)
  INTO checks
  FROM policy_checks
  WHERE review_id = p_id;
  RETURN jsonb_build_object(
    'id', row.id,
    'campaignId', row.campaign_id,
    'status', row.status,
    'checks', checks,
    'disclaimer', row.disclaimer,
    'reviewedAt', row.reviewed_at
  );
END;
$$;

CREATE FUNCTION poster_document(p_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = mtaji, public
AS $$
DECLARE
  row posters%ROWTYPE;
  concepts jsonb;
BEGIN
  SELECT * INTO row FROM posters WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('id', id, 'label', label, 'layout', layout, 'accent', accent) ORDER BY position
  ), '[]'::jsonb)
  INTO concepts
  FROM poster_concepts
  WHERE poster_id = p_id;
  RETURN jsonb_strip_nulls(jsonb_build_object(
    'id', row.id,
    'name', row.name,
    'leaderId', row.leader_id,
    'projectId', row.project_id,
    'type', row.type,
    'format', row.format,
    'headline', row.headline,
    'supporting', row.supporting,
    'cta', row.cta,
    'date', row.date,
    'location', row.location,
    'portrait', row.portrait,
    'projectImage', row.project_image,
    'logo', row.logo,
    'concepts', concepts,
    'selectedConceptId', row.selected_concept_id,
    'createdAt', row.created_at
  ));
END;
$$;

CREATE FUNCTION timelapse_document(p_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = mtaji, public
AS $$
DECLARE
  row timelapses%ROWTYPE;
  media jsonb;
BEGIN
  SELECT * INTO row FROM timelapses WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', id,
      'type', type,
      'url', url,
      'caption', caption,
      'capturedAt', captured_at,
      'phase', phase,
      'order', position
    ) ORDER BY position
  ), '[]'::jsonb)
  INTO media
  FROM timelapse_media
  WHERE timelapse_id = p_id;
  RETURN jsonb_build_object(
    'id', row.id,
    'name', row.name,
    'projectId', row.project_id,
    'location', row.location,
    'startDate', row.start_date,
    'endDate', row.end_date,
    'progress', row.progress,
    'aspect', row.aspect,
    'media', media,
    'milestones', texts('timelapse', p_id, 'milestones'),
    'captionsEnabled', row.captions_enabled,
    'brandingEnabled', row.branding_enabled,
    'createdAt', row.created_at
  );
END;
$$;

CREATE FUNCTION simulation_document(p_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = mtaji, public
AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'id', id,
    'title', title,
    'description', description,
    'developmentType', development_type,
    'locationLabel', location_label,
    'geo', jsonb_build_object('lat', lat, 'lng', lng),
    'expectedOutcome', expected_outcome,
    'style', style,
    'beforeImage', before_image,
    'afterImage', after_image,
    'leaderId', leader_id,
    'projectId', project_id,
    'createdAt', created_at,
    'isAiSimulation', true
  ))
  FROM simulations
  WHERE id = p_id;
$$;

CREATE FUNCTION insight_document(p_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = mtaji, public
AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'id', id,
    'tone', tone,
    'title', title,
    'body', body,
    'relatedCampaignId', related_campaign_id,
    'relatedCreativeId', related_creative_id
  ))
  FROM insights
  WHERE id = p_id;
$$;

-- ---------------------------------------------------------------------------
-- Users. password_hash is the scrypt string from src/server/auth/password.ts.
-- Pass NULL for password_hash on update to leave the current hash in place.
-- ---------------------------------------------------------------------------

CREATE FUNCTION list_users()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = mtaji, public
AS $$
  SELECT COALESCE(jsonb_agg(user_document(id) ORDER BY seq), '[]'::jsonb) FROM users;
$$;

CREATE FUNCTION user_by_email(p_email text)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = mtaji, public
AS $$
  SELECT user_document(id) FROM users WHERE lower(email) = lower(p_email);
$$;

CREATE FUNCTION user_password_hash(p_email text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = mtaji, public
AS $$
  SELECT password_hash FROM users WHERE lower(email) = lower(p_email);
$$;

CREATE FUNCTION upsert_user(doc jsonb, p_password_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = mtaji, public
AS $$
DECLARE
  uid text := require_id(doc);
BEGIN
  INSERT INTO users (id, full_name, email, phone, password_hash, role, created_at, leader_id)
  VALUES (
    uid,
    COALESCE(doc->>'fullName', ''),
    COALESCE(doc->>'email', ''),
    COALESCE(doc->>'phone', ''),
    COALESCE(p_password_hash, ''),
    COALESCE(doc->>'role', 'citizen'),
    COALESCE(doc->>'createdAt', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
    NULLIF(doc->>'leaderId', '')
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    phone = EXCLUDED.phone,
    password_hash = COALESCE(NULLIF(p_password_hash, ''), users.password_hash),
    role = EXCLUDED.role,
    created_at = COALESCE(NULLIF(EXCLUDED.created_at, ''), users.created_at),
    leader_id = EXCLUDED.leader_id;
  IF p_password_hash IS NULL AND NOT EXISTS (SELECT 1 FROM users WHERE id = uid AND password_hash <> '') THEN
    RAISE EXCEPTION 'password hash is required';
  END IF;
  RETURN user_document(uid);
END;
$$;

CREATE FUNCTION set_user_password(p_id text, p_password_hash text)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = mtaji, public
AS $$
BEGIN
  IF p_password_hash IS NULL OR p_password_hash = '' THEN
    RAISE EXCEPTION 'password hash is required';
  END IF;
  UPDATE users SET password_hash = p_password_hash WHERE id = p_id;
  RETURN FOUND;
END;
$$;

CREATE FUNCTION delete_user(p_id text)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = mtaji, public
AS $$
BEGIN
  DELETE FROM users WHERE id = p_id;
  RETURN FOUND;
END;
$$;

-- ---------------------------------------------------------------------------
-- Civic writes
-- ---------------------------------------------------------------------------

CREATE FUNCTION sync_leader_projects(p_leader_id text, p_ids jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path = mtaji, public
AS $$
BEGIN
  DELETE FROM project_leaders pl
  WHERE pl.leader_id = p_leader_id
    AND pl.project_id NOT IN (
      SELECT value FROM jsonb_array_elements_text(COALESCE(p_ids, '[]'::jsonb)) WHERE value <> ''
    );
  INSERT INTO project_leaders (project_id, leader_id, leader_position, project_position)
  SELECT
    incoming.value,
    p_leader_id,
    incoming.ordinality::integer,
    COALESCE(
      existing.project_position,
      (SELECT COALESCE(MAX(project_position), 0) + 1 FROM project_leaders x WHERE x.project_id = incoming.value)
    )
  FROM jsonb_array_elements_text(COALESCE(p_ids, '[]'::jsonb)) WITH ORDINALITY AS incoming(value, ordinality)
  LEFT JOIN project_leaders existing
    ON existing.project_id = incoming.value AND existing.leader_id = p_leader_id
  WHERE incoming.value <> ''
  ON CONFLICT (project_id, leader_id) DO UPDATE
  SET leader_position = EXCLUDED.leader_position;
END;
$$;

CREATE FUNCTION sync_project_leaders(p_project_id text, p_ids jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path = mtaji, public
AS $$
BEGIN
  DELETE FROM project_leaders pl
  WHERE pl.project_id = p_project_id
    AND pl.leader_id NOT IN (
      SELECT value FROM jsonb_array_elements_text(COALESCE(p_ids, '[]'::jsonb)) WHERE value <> ''
    );
  INSERT INTO project_leaders (project_id, leader_id, project_position, leader_position)
  SELECT
    p_project_id,
    incoming.value,
    incoming.ordinality::integer,
    COALESCE(
      existing.leader_position,
      (SELECT COALESCE(MAX(leader_position), 0) + 1 FROM project_leaders x WHERE x.leader_id = incoming.value)
    )
  FROM jsonb_array_elements_text(COALESCE(p_ids, '[]'::jsonb)) WITH ORDINALITY AS incoming(value, ordinality)
  LEFT JOIN project_leaders existing
    ON existing.project_id = p_project_id AND existing.leader_id = incoming.value
  WHERE incoming.value <> ''
  ON CONFLICT (project_id, leader_id) DO UPDATE
  SET project_position = EXCLUDED.project_position;
END;
$$;

CREATE FUNCTION upsert_leader(doc jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = mtaji, public
AS $$
DECLARE
  lid text := require_id(doc);
  social jsonb := COALESCE(doc->'social', '{}'::jsonb);
  vision jsonb := doc->'vision';
  item jsonb;
  pos integer := 0;
BEGIN
  INSERT INTO leaders (
    id, slug, name, honorific, position, type, county, constituency, ward,
    photo, cover_image, short_bio, bio,
    social_x, social_instagram, social_facebook, social_tiktok, social_whatsapp, social_website,
    vision_statement
  )
  VALUES (
    lid,
    COALESCE(NULLIF(doc->>'slug', ''), lid),
    COALESCE(doc->>'name', ''),
    COALESCE(doc->>'honorific', ''),
    COALESCE(doc->>'position', ''),
    COALESCE(doc->>'type', 'elected'),
    COALESCE(doc->>'county', ''),
    NULLIF(doc->>'constituency', ''),
    NULLIF(doc->>'ward', ''),
    COALESCE(doc->>'photo', ''),
    NULLIF(doc->>'coverImage', ''),
    COALESCE(doc->>'shortBio', ''),
    COALESCE(doc->>'bio', ''),
    NULLIF(social->>'x', ''),
    NULLIF(social->>'instagram', ''),
    NULLIF(social->>'facebook', ''),
    NULLIF(social->>'tiktok', ''),
    NULLIF(social->>'whatsapp', ''),
    NULLIF(social->>'website', ''),
    CASE WHEN vision IS NULL THEN NULL ELSE COALESCE(vision->>'statement', '') END
  )
  ON CONFLICT (id) DO UPDATE SET
    slug = EXCLUDED.slug,
    name = EXCLUDED.name,
    honorific = EXCLUDED.honorific,
    position = EXCLUDED.position,
    type = EXCLUDED.type,
    county = EXCLUDED.county,
    constituency = EXCLUDED.constituency,
    ward = EXCLUDED.ward,
    photo = EXCLUDED.photo,
    cover_image = EXCLUDED.cover_image,
    short_bio = EXCLUDED.short_bio,
    bio = EXCLUDED.bio,
    social_x = EXCLUDED.social_x,
    social_instagram = EXCLUDED.social_instagram,
    social_facebook = EXCLUDED.social_facebook,
    social_tiktok = EXCLUDED.social_tiktok,
    social_whatsapp = EXCLUDED.social_whatsapp,
    social_website = EXCLUDED.social_website,
    vision_statement = EXCLUDED.vision_statement;

  PERFORM put_texts('leader', lid, 'achievements', doc->'achievements');
  IF vision IS NULL THEN
    PERFORM put_texts('leader', lid, 'manifesto', '[]'::jsonb);
    PERFORM put_texts('leader', lid, 'priorities', '[]'::jsonb);
    PERFORM put_texts('leader', lid, 'expectedImpact', '[]'::jsonb);
    DELETE FROM proposed_projects WHERE leader_id = lid;
  ELSE
    PERFORM put_texts('leader', lid, 'manifesto', vision->'manifesto');
    PERFORM put_texts('leader', lid, 'priorities', vision->'priorities');
    PERFORM put_texts('leader', lid, 'expectedImpact', vision->'expectedImpact');
    DELETE FROM proposed_projects WHERE leader_id = lid;
    FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(vision->'proposedProjects', '[]'::jsonb))
    LOOP
      pos := pos + 1;
      INSERT INTO proposed_projects (
        id, leader_id, position, title, description, location, category, simulation_image, expected_impact
      )
      VALUES (
        COALESCE(NULLIF(item->>'id', ''), lid || '-proposal-' || pos::text),
        lid,
        pos,
        COALESCE(item->>'title', ''),
        COALESCE(item->>'description', ''),
        COALESCE(item->>'location', ''),
        CASE
          WHEN item->>'category' IN ('infrastructure', 'non-infrastructure') THEN item->>'category'
          ELSE 'infrastructure'
        END,
        COALESCE(item->>'simulationImage', ''),
        COALESCE(item->>'expectedImpact', '')
      );
    END LOOP;
  END IF;

  IF doc ? 'projectIds' THEN
    PERFORM sync_leader_projects(lid, doc->'projectIds');
  END IF;
  IF doc ? 'opportunityIds' THEN
    PERFORM sync_ordered_link('leader_opportunities', 'leader_id', lid, 'opportunity_id', 'position', doc->'opportunityIds');
  END IF;
  IF doc ? 'mediaIds' THEN
    PERFORM sync_ordered_link('leader_media', 'leader_id', lid, 'media_id', 'position', doc->'mediaIds');
  END IF;
  IF doc ? 'pollIds' THEN
    PERFORM sync_ordered_link('leader_polls', 'leader_id', lid, 'poll_id', 'position', doc->'pollIds');
  END IF;
  IF doc ? 'productIds' THEN
    PERFORM sync_ordered_link('leader_products', 'leader_id', lid, 'product_id', 'position', doc->'productIds');
  END IF;
  RETURN leader_document(lid);
END;
$$;

CREATE FUNCTION delete_leader(p_id text)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = mtaji, public
AS $$
BEGIN
  DELETE FROM list_items WHERE owner_kind = 'leader' AND owner_id = p_id;
  DELETE FROM leaders WHERE id = p_id;
  RETURN FOUND;
END;
$$;

CREATE FUNCTION upsert_project(doc jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = mtaji, public
AS $$
DECLARE
  pid text := require_id(doc);
  geo jsonb := COALESCE(doc->'geo', '{}'::jsonb);
  center jsonb := COALESCE(geo->'center', '{}'::jsonb);
  item text;
  pos integer := 0;
BEGIN
  IF center->>'lat' IS NULL OR center->>'lng' IS NULL THEN
    RAISE EXCEPTION 'Project coordinates must be numbers.';
  END IF;
  INSERT INTO projects (
    id, slug, name, category, subcategory, location, county, status, progress, image,
    description, start_date, expected_completion, center_lat, center_lng, boundary
  )
  VALUES (
    pid,
    COALESCE(NULLIF(doc->>'slug', ''), pid),
    COALESCE(doc->>'name', ''),
    COALESCE(doc->>'category', 'infrastructure'),
    COALESCE(doc->>'subcategory', ''),
    COALESCE(doc->>'location', ''),
    COALESCE(doc->>'county', ''),
    COALESCE(doc->>'status', 'planned'),
    COALESCE((doc->>'progress')::integer, 0),
    COALESCE(doc->>'image', ''),
    COALESCE(doc->>'description', ''),
    COALESCE(doc->>'startDate', ''),
    COALESCE(doc->>'expectedCompletion', ''),
    (center->>'lat')::numeric,
    (center->>'lng')::numeric,
    geo->'boundary'
  )
  ON CONFLICT (id) DO UPDATE SET
    slug = EXCLUDED.slug,
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    subcategory = EXCLUDED.subcategory,
    location = EXCLUDED.location,
    county = EXCLUDED.county,
    status = EXCLUDED.status,
    progress = EXCLUDED.progress,
    image = EXCLUDED.image,
    description = EXCLUDED.description,
    start_date = EXCLUDED.start_date,
    expected_completion = EXCLUDED.expected_completion,
    center_lat = EXCLUDED.center_lat,
    center_lng = EXCLUDED.center_lng,
    boundary = EXCLUDED.boundary;

  IF doc ? 'leaderIds' THEN
    PERFORM sync_project_leaders(pid, doc->'leaderIds');
  END IF;
  IF doc ? 'opportunityIds' THEN
    PERFORM sync_ordered_link('project_opportunities', 'project_id', pid, 'opportunity_id', 'position', doc->'opportunityIds');
  END IF;
  IF doc ? 'mediaIds' THEN
    PERFORM sync_ordered_link('project_media', 'project_id', pid, 'media_id', 'position', doc->'mediaIds');
  END IF;
  IF doc ? 'milestoneIds' THEN
    FOR item IN SELECT value FROM jsonb_array_elements_text(doc->'milestoneIds')
    LOOP
      pos := pos + 1;
      UPDATE milestones SET position = pos WHERE id = item AND project_id = pid;
    END LOOP;
  END IF;
  RETURN project_document(pid);
END;
$$;

CREATE FUNCTION delete_project(p_id text)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = mtaji, public
AS $$
BEGIN
  DELETE FROM milestones WHERE project_id = p_id;
  DELETE FROM projects WHERE id = p_id;
  RETURN FOUND;
END;
$$;

CREATE FUNCTION upsert_milestone(doc jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = mtaji, public
AS $$
DECLARE
  mid text := require_id(doc);
BEGIN
  IF NULLIF(doc->>'projectId', '') IS NULL THEN
    RAISE EXCEPTION 'Milestone projectId is required.';
  END IF;
  INSERT INTO milestones (id, project_id, position, number, date, title, description, status, image)
  VALUES (
    mid,
    doc->>'projectId',
    COALESCE((doc->>'number')::integer, 0),
    COALESCE((doc->>'number')::integer, 0),
    COALESCE(doc->>'date', ''),
    COALESCE(doc->>'title', ''),
    COALESCE(doc->>'description', ''),
    COALESCE(doc->>'status', 'upcoming'),
    NULLIF(doc->>'image', '')
  )
  ON CONFLICT (id) DO UPDATE SET
    project_id = EXCLUDED.project_id,
    position = EXCLUDED.position,
    number = EXCLUDED.number,
    date = EXCLUDED.date,
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    status = EXCLUDED.status,
    image = EXCLUDED.image;
  RETURN milestone_document(mid);
END;
$$;

CREATE FUNCTION delete_milestone(p_id text)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = mtaji, public
AS $$
BEGIN
  DELETE FROM milestones WHERE id = p_id;
  RETURN FOUND;
END;
$$;

CREATE FUNCTION upsert_opportunity(doc jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = mtaji, public
AS $$
DECLARE
  oid text := require_id(doc);
BEGIN
  INSERT INTO opportunities (
    id, slug, title, category, location, county, deadline, eligibility, description, image,
    project_id, leader_id, status, opening_date, organization, application_url
  )
  VALUES (
    oid,
    COALESCE(NULLIF(doc->>'slug', ''), oid),
    COALESCE(doc->>'title', ''),
    COALESCE(doc->>'category', 'other'),
    COALESCE(doc->>'location', ''),
    COALESCE(doc->>'county', ''),
    COALESCE(doc->>'deadline', ''),
    COALESCE(doc->>'eligibility', ''),
    COALESCE(doc->>'description', ''),
    NULLIF(doc->>'image', ''),
    NULLIF(doc->>'projectId', ''),
    NULLIF(doc->>'leaderId', ''),
    NULLIF(doc->>'status', ''),
    NULLIF(doc->>'openingDate', ''),
    NULLIF(doc->>'organization', ''),
    NULLIF(doc->>'applicationUrl', '')
  )
  ON CONFLICT (id) DO UPDATE SET
    slug = EXCLUDED.slug,
    title = EXCLUDED.title,
    category = EXCLUDED.category,
    location = EXCLUDED.location,
    county = EXCLUDED.county,
    deadline = EXCLUDED.deadline,
    eligibility = EXCLUDED.eligibility,
    description = EXCLUDED.description,
    image = EXCLUDED.image,
    project_id = EXCLUDED.project_id,
    leader_id = EXCLUDED.leader_id,
    status = EXCLUDED.status,
    opening_date = EXCLUDED.opening_date,
    organization = EXCLUDED.organization,
    application_url = EXCLUDED.application_url;
  PERFORM put_texts('opportunity', oid, 'benefits', doc->'benefits');
  PERFORM put_texts('opportunity', oid, 'requirements', doc->'requirements');
  PERFORM put_texts('opportunity', oid, 'applicationSteps', doc->'applicationSteps');
  IF doc ? 'relatedMediaIds' THEN
    PERFORM sync_ordered_link('opportunity_related_media', 'opportunity_id', oid, 'media_id', 'position', doc->'relatedMediaIds');
  END IF;
  RETURN opportunity_document(oid);
END;
$$;

CREATE FUNCTION delete_opportunity(p_id text)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = mtaji, public
AS $$
BEGIN
  DELETE FROM list_items WHERE owner_kind = 'opportunity' AND owner_id = p_id;
  DELETE FROM opportunities WHERE id = p_id;
  RETURN FOUND;
END;
$$;

CREATE FUNCTION upsert_media(doc jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = mtaji, public
AS $$
DECLARE
  mid text := require_id(doc);
BEGIN
  INSERT INTO media_items (
    id, slug, title, category, type, image, date, excerpt, body, video_url,
    leader_id, project_id, updated_at, author
  )
  VALUES (
    mid,
    COALESCE(NULLIF(doc->>'slug', ''), mid),
    COALESCE(doc->>'title', ''),
    COALESCE(doc->>'category', 'news'),
    COALESCE(doc->>'type', 'article'),
    COALESCE(doc->>'image', ''),
    COALESCE(doc->>'date', ''),
    COALESCE(doc->>'excerpt', ''),
    NULLIF(doc->>'body', ''),
    NULLIF(doc->>'videoUrl', ''),
    NULLIF(doc->>'leaderId', ''),
    NULLIF(doc->>'projectId', ''),
    NULLIF(doc->>'updatedAt', ''),
    NULLIF(doc->>'author', '')
  )
  ON CONFLICT (id) DO UPDATE SET
    slug = EXCLUDED.slug,
    title = EXCLUDED.title,
    category = EXCLUDED.category,
    type = EXCLUDED.type,
    image = EXCLUDED.image,
    date = EXCLUDED.date,
    excerpt = EXCLUDED.excerpt,
    body = EXCLUDED.body,
    video_url = EXCLUDED.video_url,
    leader_id = EXCLUDED.leader_id,
    project_id = EXCLUDED.project_id,
    updated_at = EXCLUDED.updated_at,
    author = EXCLUDED.author;
  IF doc ? 'relatedOpportunityIds' THEN
    PERFORM sync_ordered_link('media_related_opportunities', 'media_id', mid, 'opportunity_id', 'position', doc->'relatedOpportunityIds');
  END IF;
  IF doc ? 'relatedMediaIds' THEN
    PERFORM sync_ordered_link('media_related_media', 'media_id', mid, 'related_media_id', 'position', doc->'relatedMediaIds');
  END IF;
  RETURN media_document(mid);
END;
$$;

CREATE FUNCTION delete_media(p_id text)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = mtaji, public
AS $$
BEGIN
  DELETE FROM media_items WHERE id = p_id;
  RETURN FOUND;
END;
$$;

CREATE FUNCTION upsert_poll(doc jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = mtaji, public
AS $$
DECLARE
  pid text := require_id(doc);
  item jsonb;
  pos integer := 0;
BEGIN
  INSERT INTO polls (id, slug, question, closing_date, leader_id, participation_count)
  VALUES (
    pid,
    COALESCE(NULLIF(doc->>'slug', ''), pid),
    COALESCE(doc->>'question', ''),
    COALESCE(doc->>'closingDate', ''),
    NULLIF(doc->>'leaderId', ''),
    COALESCE((doc->>'participationCount')::integer, 0)
  )
  ON CONFLICT (id) DO UPDATE SET
    slug = EXCLUDED.slug,
    question = EXCLUDED.question,
    closing_date = EXCLUDED.closing_date,
    leader_id = EXCLUDED.leader_id,
    participation_count = EXCLUDED.participation_count;
  DELETE FROM poll_options WHERE poll_id = pid;
  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(doc->'options', '[]'::jsonb))
  LOOP
    pos := pos + 1;
    INSERT INTO poll_options (id, poll_id, position, label, votes)
    VALUES (
      COALESCE(NULLIF(item->>'id', ''), pid || '-opt-' || pos::text),
      pid,
      pos,
      COALESCE(item->>'label', ''),
      COALESCE((item->>'votes')::integer, 0)
    );
  END LOOP;
  RETURN poll_document(pid);
END;
$$;

CREATE FUNCTION delete_poll(p_id text)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = mtaji, public
AS $$
BEGIN
  DELETE FROM polls WHERE id = p_id;
  RETURN FOUND;
END;
$$;

CREATE FUNCTION upsert_product(doc jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = mtaji, public
AS $$
DECLARE
  pid text := require_id(doc);
BEGIN
  IF NULLIF(doc->>'leaderId', '') IS NULL THEN
    RAISE EXCEPTION 'Product leaderId is required.';
  END IF;
  INSERT INTO products (id, slug, name, price, currency, image, description, stock, leader_id)
  VALUES (
    pid,
    COALESCE(NULLIF(doc->>'slug', ''), pid),
    COALESCE(doc->>'name', ''),
    COALESCE((doc->>'price')::numeric, 0),
    COALESCE(NULLIF(doc->>'currency', ''), 'KES'),
    COALESCE(doc->>'image', ''),
    COALESCE(doc->>'description', ''),
    COALESCE((doc->>'stock')::integer, 0),
    doc->>'leaderId'
  )
  ON CONFLICT (id) DO UPDATE SET
    slug = EXCLUDED.slug,
    name = EXCLUDED.name,
    price = EXCLUDED.price,
    currency = EXCLUDED.currency,
    image = EXCLUDED.image,
    description = EXCLUDED.description,
    stock = EXCLUDED.stock,
    leader_id = EXCLUDED.leader_id;
  RETURN product_document(pid);
END;
$$;

CREATE FUNCTION delete_product(p_id text)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = mtaji, public
AS $$
BEGIN
  DELETE FROM products WHERE id = p_id;
  RETURN FOUND;
END;
$$;

CREATE FUNCTION content_snapshot()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = mtaji, public
AS $$
  SELECT jsonb_build_object(
    'leaders', COALESCE((SELECT jsonb_agg(leader_document(id) ORDER BY seq) FROM leaders), '[]'::jsonb),
    'projects', COALESCE((SELECT jsonb_agg(project_document(id) ORDER BY seq) FROM projects), '[]'::jsonb),
    'milestones', COALESCE((SELECT jsonb_agg(milestone_document(id) ORDER BY seq) FROM milestones), '[]'::jsonb),
    'opportunities', COALESCE((SELECT jsonb_agg(opportunity_document(id) ORDER BY seq) FROM opportunities), '[]'::jsonb),
    'media', COALESCE((SELECT jsonb_agg(media_document(id) ORDER BY seq) FROM media_items), '[]'::jsonb),
    'polls', COALESCE((SELECT jsonb_agg(poll_document(id) ORDER BY seq) FROM polls), '[]'::jsonb),
    'products', COALESCE((SELECT jsonb_agg(product_document(id) ORDER BY seq) FROM products), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------------
-- Adly writes
-- ---------------------------------------------------------------------------

CREATE FUNCTION upsert_creative(doc jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = mtaji, public
AS $$
DECLARE
  cid text := require_id(doc);
  performance jsonb := doc->'performance';
BEGIN
  INSERT INTO creatives (
    id, name, headline, body, cta, image,
    spend, reach, impressions, engagement, ctr, conversions, performance_currency
  )
  VALUES (
    cid,
    COALESCE(doc->>'name', ''),
    COALESCE(doc->>'headline', ''),
    COALESCE(doc->>'body', ''),
    COALESCE(doc->>'cta', ''),
    COALESCE(doc->>'image', ''),
    CASE WHEN performance IS NULL THEN NULL ELSE (performance->>'spend')::numeric END,
    CASE WHEN performance IS NULL THEN NULL ELSE (performance->>'reach')::numeric END,
    CASE WHEN performance IS NULL THEN NULL ELSE (performance->>'impressions')::numeric END,
    CASE WHEN performance IS NULL THEN NULL ELSE (performance->>'engagement')::numeric END,
    CASE WHEN performance IS NULL THEN NULL ELSE (performance->>'ctr')::numeric END,
    CASE WHEN performance IS NULL THEN NULL ELSE (performance->>'conversions')::numeric END,
    CASE WHEN performance IS NULL THEN NULL ELSE COALESCE(performance->>'currency', 'KES') END
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    headline = EXCLUDED.headline,
    body = EXCLUDED.body,
    cta = EXCLUDED.cta,
    image = EXCLUDED.image,
    spend = EXCLUDED.spend,
    reach = EXCLUDED.reach,
    impressions = EXCLUDED.impressions,
    engagement = EXCLUDED.engagement,
    ctr = EXCLUDED.ctr,
    conversions = EXCLUDED.conversions,
    performance_currency = EXCLUDED.performance_currency;
  IF doc ? 'platformIds' THEN
    PERFORM sync_ordered_link('creative_platforms', 'creative_id', cid, 'platform', 'position', doc->'platformIds');
  END IF;
  RETURN creative_document(cid);
END;
$$;

CREATE FUNCTION delete_creative(p_id text)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = mtaji, public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM campaign_creatives WHERE creative_id = p_id) THEN
    RAISE EXCEPTION 'Detach this creative from its campaigns before deleting it.';
  END IF;
  DELETE FROM creatives WHERE id = p_id;
  RETURN FOUND;
END;
$$;

CREATE FUNCTION upsert_campaign(doc jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = mtaji, public
AS $$
DECLARE
  cid text := require_id(doc);
  targeting jsonb := COALESCE(doc->'targeting', '{}'::jsonb);
  performance jsonb := COALESCE(doc->'performance', '{}'::jsonb);
  center jsonb := targeting->'center';
BEGIN
  IF NULLIF(doc->>'leaderId', '') IS NULL THEN
    RAISE EXCEPTION 'Campaign leaderId is required.';
  END IF;
  INSERT INTO campaigns (
    id, slug, name, objective, status, leader_id, project_id,
    target_country, target_county, target_constituency, target_ward, target_radius_km, target_lat, target_lng,
    start_date, end_date, budget, currency,
    spend, reach, impressions, engagement, ctr, conversions, performance_currency,
    policy_review_id, created_at
  )
  VALUES (
    cid,
    COALESCE(NULLIF(doc->>'slug', ''), cid),
    COALESCE(doc->>'name', ''),
    COALESCE(doc->>'objective', 'awareness'),
    COALESCE(doc->>'status', 'draft'),
    doc->>'leaderId',
    NULLIF(doc->>'projectId', ''),
    COALESCE(NULLIF(targeting->>'country', ''), 'Kenya'),
    NULLIF(targeting->>'county', ''),
    NULLIF(targeting->>'constituency', ''),
    NULLIF(targeting->>'ward', ''),
    NULLIF(targeting->>'radiusKm', '')::numeric,
    CASE WHEN center IS NULL THEN NULL ELSE NULLIF(center->>'lat', '')::numeric END,
    CASE WHEN center IS NULL THEN NULL ELSE NULLIF(center->>'lng', '')::numeric END,
    COALESCE(doc->>'startDate', ''),
    COALESCE(doc->>'endDate', ''),
    COALESCE((doc->>'budget')::numeric, 0),
    COALESCE(NULLIF(doc->>'currency', ''), 'KES'),
    COALESCE((performance->>'spend')::numeric, 0),
    COALESCE((performance->>'reach')::numeric, 0),
    COALESCE((performance->>'impressions')::numeric, 0),
    COALESCE((performance->>'engagement')::numeric, 0),
    COALESCE((performance->>'ctr')::numeric, 0),
    COALESCE((performance->>'conversions')::numeric, 0),
    COALESCE(NULLIF(performance->>'currency', ''), 'KES'),
    NULLIF(doc->>'policyReviewId', ''),
    COALESCE(doc->>'createdAt', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
  )
  ON CONFLICT (id) DO UPDATE SET
    slug = EXCLUDED.slug,
    name = EXCLUDED.name,
    objective = EXCLUDED.objective,
    status = EXCLUDED.status,
    leader_id = EXCLUDED.leader_id,
    project_id = EXCLUDED.project_id,
    target_country = EXCLUDED.target_country,
    target_county = EXCLUDED.target_county,
    target_constituency = EXCLUDED.target_constituency,
    target_ward = EXCLUDED.target_ward,
    target_radius_km = EXCLUDED.target_radius_km,
    target_lat = EXCLUDED.target_lat,
    target_lng = EXCLUDED.target_lng,
    start_date = EXCLUDED.start_date,
    end_date = EXCLUDED.end_date,
    budget = EXCLUDED.budget,
    currency = EXCLUDED.currency,
    spend = EXCLUDED.spend,
    reach = EXCLUDED.reach,
    impressions = EXCLUDED.impressions,
    engagement = EXCLUDED.engagement,
    ctr = EXCLUDED.ctr,
    conversions = EXCLUDED.conversions,
    performance_currency = EXCLUDED.performance_currency,
    policy_review_id = EXCLUDED.policy_review_id,
    created_at = EXCLUDED.created_at;
  IF doc ? 'platformIds' THEN
    PERFORM sync_ordered_link('campaign_platforms', 'campaign_id', cid, 'platform', 'position', doc->'platformIds');
  END IF;
  IF doc ? 'creativeIds' THEN
    PERFORM sync_ordered_link('campaign_creatives', 'campaign_id', cid, 'creative_id', 'position', doc->'creativeIds');
  END IF;
  RETURN campaign_document(cid);
END;
$$;

CREATE FUNCTION delete_campaign(p_id text)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = mtaji, public
AS $$
BEGIN
  DELETE FROM campaigns WHERE id = p_id;
  RETURN FOUND;
END;
$$;

CREATE FUNCTION upsert_policy_review(doc jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = mtaji, public
AS $$
DECLARE
  rid text := require_id(doc);
  item jsonb;
  pos integer := 0;
BEGIN
  IF NULLIF(doc->>'campaignId', '') IS NULL THEN
    RAISE EXCEPTION 'Policy review campaign was not found.';
  END IF;
  INSERT INTO policy_reviews (id, campaign_id, status, disclaimer, reviewed_at)
  VALUES (
    rid,
    doc->>'campaignId',
    COALESCE(doc->>'status', 'review'),
    COALESCE(doc->>'disclaimer', ''),
    COALESCE(doc->>'reviewedAt', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
  )
  ON CONFLICT (id) DO UPDATE SET
    campaign_id = EXCLUDED.campaign_id,
    status = EXCLUDED.status,
    disclaimer = EXCLUDED.disclaimer,
    reviewed_at = EXCLUDED.reviewed_at;
  DELETE FROM policy_checks WHERE review_id = rid;
  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(doc->'checks', '[]'::jsonb))
  LOOP
    pos := pos + 1;
    INSERT INTO policy_checks (id, review_id, position, label, status, note)
    VALUES (
      COALESCE(NULLIF(item->>'id', ''), rid || '-chk-' || pos::text),
      rid,
      pos,
      COALESCE(item->>'label', ''),
      COALESCE(item->>'status', 'review'),
      COALESCE(item->>'note', '')
    );
  END LOOP;
  UPDATE campaigns SET policy_review_id = rid WHERE id = doc->>'campaignId';
  RETURN policy_review_document(rid);
END;
$$;

CREATE FUNCTION delete_policy_review(p_id text)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = mtaji, public
AS $$
BEGIN
  UPDATE campaigns SET policy_review_id = NULL WHERE policy_review_id = p_id;
  DELETE FROM policy_reviews WHERE id = p_id;
  RETURN FOUND;
END;
$$;

CREATE FUNCTION upsert_poster(doc jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = mtaji, public
AS $$
DECLARE
  pid text := require_id(doc);
  item jsonb;
  pos integer := 0;
BEGIN
  IF NULLIF(doc->>'leaderId', '') IS NULL THEN
    RAISE EXCEPTION 'Poster leaderId is required.';
  END IF;
  INSERT INTO posters (
    id, name, leader_id, project_id, type, format, headline, supporting, cta,
    date, location, portrait, project_image, logo, selected_concept_id, created_at
  )
  VALUES (
    pid,
    COALESCE(doc->>'name', ''),
    doc->>'leaderId',
    NULLIF(doc->>'projectId', ''),
    COALESCE(doc->>'type', 'campaign'),
    COALESCE(doc->>'format', '1080x1350'),
    COALESCE(doc->>'headline', ''),
    COALESCE(doc->>'supporting', ''),
    COALESCE(doc->>'cta', ''),
    NULLIF(doc->>'date', ''),
    NULLIF(doc->>'location', ''),
    NULLIF(doc->>'portrait', ''),
    NULLIF(doc->>'projectImage', ''),
    NULLIF(doc->>'logo', ''),
    NULLIF(doc->>'selectedConceptId', ''),
    COALESCE(doc->>'createdAt', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    leader_id = EXCLUDED.leader_id,
    project_id = EXCLUDED.project_id,
    type = EXCLUDED.type,
    format = EXCLUDED.format,
    headline = EXCLUDED.headline,
    supporting = EXCLUDED.supporting,
    cta = EXCLUDED.cta,
    date = EXCLUDED.date,
    location = EXCLUDED.location,
    portrait = EXCLUDED.portrait,
    project_image = EXCLUDED.project_image,
    logo = EXCLUDED.logo,
    selected_concept_id = EXCLUDED.selected_concept_id,
    created_at = EXCLUDED.created_at;
  DELETE FROM poster_concepts WHERE poster_id = pid;
  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(doc->'concepts', '[]'::jsonb))
  LOOP
    pos := pos + 1;
    INSERT INTO poster_concepts (id, poster_id, position, label, layout, accent)
    VALUES (
      COALESCE(NULLIF(item->>'id', ''), pid || '-cpt-' || pos::text),
      pid,
      pos,
      COALESCE(item->>'label', ''),
      COALESCE(item->>'layout', 'hero-full'),
      COALESCE(NULLIF(item->>'accent', ''), '#e5b12a')
    );
  END LOOP;
  RETURN poster_document(pid);
END;
$$;

CREATE FUNCTION delete_poster(p_id text)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = mtaji, public
AS $$
BEGIN
  DELETE FROM posters WHERE id = p_id;
  RETURN FOUND;
END;
$$;

CREATE FUNCTION upsert_timelapse(doc jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = mtaji, public
AS $$
DECLARE
  tid text := require_id(doc);
  item jsonb;
  pos integer := 0;
BEGIN
  IF NULLIF(doc->>'projectId', '') IS NULL THEN
    RAISE EXCEPTION 'Timelapse projectId is required.';
  END IF;
  INSERT INTO timelapses (
    id, name, project_id, location, start_date, end_date, progress, aspect,
    captions_enabled, branding_enabled, created_at
  )
  VALUES (
    tid,
    COALESCE(doc->>'name', ''),
    doc->>'projectId',
    COALESCE(doc->>'location', ''),
    COALESCE(doc->>'startDate', ''),
    COALESCE(doc->>'endDate', ''),
    COALESCE((doc->>'progress')::integer, 0),
    COALESCE(doc->>'aspect', '16:9'),
    COALESCE((doc->>'captionsEnabled')::boolean, true),
    COALESCE((doc->>'brandingEnabled')::boolean, true),
    COALESCE(doc->>'createdAt', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    project_id = EXCLUDED.project_id,
    location = EXCLUDED.location,
    start_date = EXCLUDED.start_date,
    end_date = EXCLUDED.end_date,
    progress = EXCLUDED.progress,
    aspect = EXCLUDED.aspect,
    captions_enabled = EXCLUDED.captions_enabled,
    branding_enabled = EXCLUDED.branding_enabled,
    created_at = EXCLUDED.created_at;
  DELETE FROM timelapse_media WHERE timelapse_id = tid;
  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(doc->'media', '[]'::jsonb))
  LOOP
    pos := pos + 1;
    INSERT INTO timelapse_media (id, timelapse_id, position, type, url, caption, captured_at, phase)
    VALUES (
      COALESCE(NULLIF(item->>'id', ''), tid || '-med-' || pos::text),
      tid,
      COALESCE((item->>'order')::integer, pos),
      COALESCE(item->>'type', 'image'),
      COALESCE(item->>'url', ''),
      COALESCE(item->>'caption', ''),
      COALESCE(item->>'capturedAt', ''),
      COALESCE(item->>'phase', 'during')
    );
  END LOOP;
  IF doc ? 'milestones' THEN
    PERFORM put_texts('timelapse', tid, 'milestones', doc->'milestones');
  END IF;
  RETURN timelapse_document(tid);
END;
$$;

CREATE FUNCTION delete_timelapse(p_id text)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = mtaji, public
AS $$
BEGIN
  DELETE FROM timelapses WHERE id = p_id;
  RETURN FOUND;
END;
$$;

CREATE FUNCTION upsert_simulation(doc jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = mtaji, public
AS $$
DECLARE
  sid text := require_id(doc);
  geo jsonb := COALESCE(doc->'geo', '{}'::jsonb);
BEGIN
  IF geo->>'lat' IS NULL OR geo->>'lng' IS NULL THEN
    RAISE EXCEPTION 'Simulation coordinates must be numbers.';
  END IF;
  INSERT INTO simulations (
    id, title, description, development_type, location_label, lat, lng, expected_outcome,
    style, before_image, after_image, leader_id, project_id, created_at
  )
  VALUES (
    sid,
    COALESCE(doc->>'title', ''),
    COALESCE(doc->>'description', ''),
    COALESCE(doc->>'developmentType', 'other'),
    COALESCE(doc->>'locationLabel', ''),
    (geo->>'lat')::numeric,
    (geo->>'lng')::numeric,
    COALESCE(doc->>'expectedOutcome', ''),
    COALESCE(doc->>'style', 'conceptual'),
    COALESCE(doc->>'beforeImage', ''),
    COALESCE(doc->>'afterImage', ''),
    NULLIF(doc->>'leaderId', ''),
    NULLIF(doc->>'projectId', ''),
    COALESCE(doc->>'createdAt', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
  )
  ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    development_type = EXCLUDED.development_type,
    location_label = EXCLUDED.location_label,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    expected_outcome = EXCLUDED.expected_outcome,
    style = EXCLUDED.style,
    before_image = EXCLUDED.before_image,
    after_image = EXCLUDED.after_image,
    leader_id = EXCLUDED.leader_id,
    project_id = EXCLUDED.project_id,
    created_at = EXCLUDED.created_at;
  RETURN simulation_document(sid);
END;
$$;

CREATE FUNCTION delete_simulation(p_id text)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = mtaji, public
AS $$
BEGIN
  DELETE FROM simulations WHERE id = p_id;
  RETURN FOUND;
END;
$$;

CREATE FUNCTION upsert_insight(doc jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = mtaji, public
AS $$
DECLARE
  iid text := require_id(doc);
BEGIN
  INSERT INTO insights (id, tone, title, body, related_campaign_id, related_creative_id)
  VALUES (
    iid,
    COALESCE(doc->>'tone', 'neutral'),
    COALESCE(doc->>'title', ''),
    COALESCE(doc->>'body', ''),
    NULLIF(doc->>'relatedCampaignId', ''),
    NULLIF(doc->>'relatedCreativeId', '')
  )
  ON CONFLICT (id) DO UPDATE SET
    tone = EXCLUDED.tone,
    title = EXCLUDED.title,
    body = EXCLUDED.body,
    related_campaign_id = EXCLUDED.related_campaign_id,
    related_creative_id = EXCLUDED.related_creative_id;
  RETURN insight_document(iid);
END;
$$;

CREATE FUNCTION delete_insight(p_id text)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = mtaji, public
AS $$
BEGIN
  DELETE FROM insights WHERE id = p_id;
  RETURN FOUND;
END;
$$;

CREATE FUNCTION adly_snapshot()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = mtaji, public
AS $$
  SELECT jsonb_build_object(
    'campaigns', COALESCE((SELECT jsonb_agg(campaign_document(id) ORDER BY seq) FROM campaigns), '[]'::jsonb),
    'creatives', COALESCE((SELECT jsonb_agg(creative_document(id) ORDER BY seq) FROM creatives), '[]'::jsonb),
    'policyReviews', COALESCE((SELECT jsonb_agg(policy_review_document(id) ORDER BY seq) FROM policy_reviews), '[]'::jsonb),
    'posters', COALESCE((SELECT jsonb_agg(poster_document(id) ORDER BY seq) FROM posters), '[]'::jsonb),
    'timelapses', COALESCE((SELECT jsonb_agg(timelapse_document(id) ORDER BY seq) FROM timelapses), '[]'::jsonb),
    'simulations', COALESCE((SELECT jsonb_agg(simulation_document(id) ORDER BY seq) FROM simulations), '[]'::jsonb),
    'insights', COALESCE((SELECT jsonb_agg(insight_document(id) ORDER BY seq) FROM insights), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------------
-- Wallet. A missing row reads back as the default balances and is not stored
-- until a top-up, withdrawal, or save. Top-ups credit transfers.
-- Withdrawals draw transfers, then merchandise, then donations, then crowdfunding.
-- ---------------------------------------------------------------------------

CREATE FUNCTION wallet_document(p_leader_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = mtaji, public
AS $$
DECLARE
  row wallets%ROWTYPE;
  moves jsonb;
BEGIN
  SELECT * INTO row FROM wallets WHERE leader_id = p_leader_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'leaderId', p_leader_id,
      'sources', jsonb_build_object(
        'crowdfunding', 185000,
        'merchandise', 62400,
        'donations', 41000,
        'transfers', 15000
      ),
      'movements', '[]'::jsonb
    );
  END IF;
  SELECT COALESCE(jsonb_agg(
    jsonb_strip_nulls(jsonb_build_object(
      'id', id,
      'kind', kind,
      'amount', amount,
      'source', source,
      'status', status,
      'createdAt', created_at
    )) ORDER BY seq DESC
  ), '[]'::jsonb)
  INTO moves
  FROM wallet_movements
  WHERE leader_id = p_leader_id;
  RETURN jsonb_strip_nulls(jsonb_build_object(
    'leaderId', row.leader_id,
    'sources', jsonb_build_object(
      'crowdfunding', row.crowdfunding,
      'merchandise', row.merchandise,
      'donations', row.donations,
      'transfers', row.transfers
    ),
    'lastTopUpAt', row.last_top_up_at,
    'lastWithdrawalAt', row.last_withdrawal_at,
    'movements', moves
  ));
END;
$$;

CREATE FUNCTION ensure_wallet(p_leader_id text)
RETURNS void
LANGUAGE plpgsql
SET search_path = mtaji, public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM leaders WHERE id = p_leader_id) THEN
    RAISE EXCEPTION 'Leader not found.';
  END IF;
  INSERT INTO wallets (leader_id) VALUES (p_leader_id) ON CONFLICT (leader_id) DO NOTHING;
END;
$$;

CREATE FUNCTION top_up_wallet(
  p_leader_id text,
  p_amount numeric,
  p_source text,
  p_movement_id text,
  p_created_at text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = mtaji, public
AS $$
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Enter a valid top-up amount.';
  END IF;
  IF p_source IS NULL OR p_source NOT IN ('mpesa', 'bank', 'card', 'crowdfunding', 'merchandise') THEN
    RAISE EXCEPTION 'Choose a top-up source.';
  END IF;
  PERFORM ensure_wallet(p_leader_id);
  UPDATE wallets
  SET transfers = transfers + p_amount,
      last_top_up_at = p_created_at
  WHERE leader_id = p_leader_id;
  INSERT INTO wallet_movements (id, leader_id, kind, amount, source, status, created_at)
  VALUES (p_movement_id, p_leader_id, 'top-up', p_amount, p_source, 'recorded', p_created_at);
  RETURN wallet_document(p_leader_id);
END;
$$;

CREATE FUNCTION withdraw_wallet(
  p_leader_id text,
  p_amount numeric,
  p_movement_id text,
  p_created_at text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = mtaji, public
AS $$
DECLARE
  row wallets%ROWTYPE;
  remaining numeric;
  take numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Enter a valid withdrawal amount.';
  END IF;
  PERFORM ensure_wallet(p_leader_id);
  SELECT * INTO row FROM wallets WHERE leader_id = p_leader_id FOR UPDATE;
  IF p_amount > row.crowdfunding + row.merchandise + row.donations + row.transfers THEN
    RAISE EXCEPTION 'Amount exceeds available balance.';
  END IF;
  remaining := p_amount;
  take := LEAST(row.transfers, remaining);
  row.transfers := row.transfers - take;
  remaining := remaining - take;
  take := LEAST(row.merchandise, remaining);
  row.merchandise := row.merchandise - take;
  remaining := remaining - take;
  take := LEAST(row.donations, remaining);
  row.donations := row.donations - take;
  remaining := remaining - take;
  take := LEAST(row.crowdfunding, remaining);
  row.crowdfunding := row.crowdfunding - take;
  UPDATE wallets
  SET crowdfunding = row.crowdfunding,
      merchandise = row.merchandise,
      donations = row.donations,
      transfers = row.transfers,
      last_withdrawal_at = p_created_at
  WHERE leader_id = p_leader_id;
  INSERT INTO wallet_movements (id, leader_id, kind, amount, source, status, created_at)
  VALUES (p_movement_id, p_leader_id, 'withdrawal', p_amount, NULL, 'recorded', p_created_at);
  RETURN wallet_document(p_leader_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- Engagement
-- ---------------------------------------------------------------------------

CREATE FUNCTION saved_opportunity_ids(p_user_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = mtaji, public
AS $$
  SELECT COALESCE(
    (
      SELECT jsonb_agg(opportunity_id ORDER BY position)
      FROM saved_opportunities
      WHERE user_id = p_user_id
    ),
    '[]'::jsonb
  );
$$;

CREATE FUNCTION set_saved_opportunities(p_user_id text, p_ids jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = mtaji, public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Sign in required.';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(COALESCE(p_ids, '[]'::jsonb)) AS incoming(value)
    WHERE incoming.value <> ''
      AND NOT EXISTS (SELECT 1 FROM opportunities WHERE id = incoming.value)
  ) THEN
    RAISE EXCEPTION 'Unknown opportunity.';
  END IF;
  INSERT INTO saved_opportunity_lists (user_id) VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;
  DELETE FROM saved_opportunities WHERE user_id = p_user_id;
  INSERT INTO saved_opportunities (user_id, opportunity_id, position)
  SELECT p_user_id, value, MIN(ordinality)::integer
  FROM jsonb_array_elements_text(COALESCE(p_ids, '[]'::jsonb)) WITH ORDINALITY AS incoming(value, ordinality)
  WHERE value <> ''
  GROUP BY value;
  RETURN saved_opportunity_ids(p_user_id);
END;
$$;

CREATE FUNCTION add_adly_interest(doc jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = mtaji, public
AS $$
DECLARE
  lid text := NULLIF(doc->>'id', '');
  topic text;
  pos integer := 0;
  email text := COALESCE(doc->>'email', '');
BEGIN
  IF COALESCE(doc->>'fullName', '') = '' OR email = '' OR COALESCE(doc->>'phone', '') = '' THEN
    RAISE EXCEPTION 'Name, email, and phone are required.';
  END IF;
  IF position('@' IN email) = 0 OR left(email, 1) = '@' OR right(email, 1) = '@' THEN
    RAISE EXCEPTION 'Enter a valid email address.';
  END IF;
  IF COALESCE(doc->>'role', '') NOT IN ('Politician', 'Aspirant', 'Campaign Team', 'Organization', 'Other') THEN
    RAISE EXCEPTION 'Choose a role.';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(COALESCE(doc->'interests', '[]'::jsonb)) AS incoming(value)
    WHERE incoming.value NOT IN (
      'Advertising', 'Campaign Posters', 'Project Timelapses', 'AI Simulations', 'Campaign Analytics', 'Other'
    )
  ) THEN
    RAISE EXCEPTION 'Choose interests from the Adly list.';
  END IF;
  IF lid IS NULL THEN
    lid := 'lead-' || substr(md5(random()::text || clock_timestamp()::text), 1, 10);
  END IF;
  INSERT INTO adly_interest_leads (id, full_name, email, phone, organization, role, created_at)
  VALUES (
    lid,
    doc->>'fullName',
    email,
    doc->>'phone',
    COALESCE(doc->>'organization', ''),
    doc->>'role',
    COALESCE(doc->>'createdAt', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
  );
  FOR topic IN SELECT value FROM jsonb_array_elements_text(COALESCE(doc->'interests', '[]'::jsonb))
  LOOP
    pos := pos + 1;
    INSERT INTO adly_interest_topics (lead_id, position, topic) VALUES (lid, pos, topic);
  END LOOP;
  RETURN jsonb_build_object(
    'id', lid,
    'fullName', doc->>'fullName',
    'email', email,
    'phone', doc->>'phone',
    'organization', COALESCE(doc->>'organization', ''),
    'role', doc->>'role',
    'interests', COALESCE(doc->'interests', '[]'::jsonb),
    'createdAt', (SELECT created_at FROM adly_interest_leads WHERE id = lid)
  );
END;
$$;

CREATE FUNCTION list_adly_interests()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = mtaji, public
AS $$
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', lead.id,
      'fullName', lead.full_name,
      'email', lead.email,
      'phone', lead.phone,
      'organization', lead.organization,
      'role', lead.role,
      'interests', COALESCE(
        (SELECT jsonb_agg(topic ORDER BY position) FROM adly_interest_topics WHERE lead_id = lead.id),
        '[]'::jsonb
      ),
      'createdAt', lead.created_at
    ) ORDER BY lead.seq DESC
  ), '[]'::jsonb)
  FROM adly_interest_leads lead;
$$;

-- ---------------------------------------------------------------------------
-- Counts and runtime cleanup. This does not restore the TypeScript seed.
-- ---------------------------------------------------------------------------

CREATE FUNCTION counts()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = mtaji, public
AS $$
  SELECT jsonb_build_object(
    'users', (SELECT count(*) FROM users),
    'leaders', (SELECT count(*) FROM leaders),
    'projects', (SELECT count(*) FROM projects),
    'milestones', (SELECT count(*) FROM milestones),
    'opportunities', (SELECT count(*) FROM opportunities),
    'media', (SELECT count(*) FROM media_items),
    'polls', (SELECT count(*) FROM polls),
    'products', (SELECT count(*) FROM products),
    'campaigns', (SELECT count(*) FROM campaigns),
    'creatives', (SELECT count(*) FROM creatives),
    'policyReviews', (SELECT count(*) FROM policy_reviews),
    'posters', (SELECT count(*) FROM posters),
    'timelapses', (SELECT count(*) FROM timelapses),
    'simulations', (SELECT count(*) FROM simulations),
    'insights', (SELECT count(*) FROM insights),
    'wallets', (SELECT count(*) FROM wallets),
    'savedOpportunityLists', (SELECT count(*) FROM saved_opportunity_lists),
    'adlyInterests', (SELECT count(*) FROM adly_interest_leads)
  );
$$;

CREATE FUNCTION clear_runtime_data()
RETURNS void
LANGUAGE plpgsql
SET search_path = mtaji, public
AS $$
BEGIN
  DELETE FROM wallet_movements;
  DELETE FROM wallets;
  DELETE FROM saved_opportunities;
  DELETE FROM saved_opportunity_lists;
  DELETE FROM adly_interest_topics;
  DELETE FROM adly_interest_leads;
END;
$$;

COMMENT ON SCHEMA mtaji IS
  'M-Taji Siasa store. Documents returned by *_document() match the TypeScript entities. Role checks stay in src/server.';

COMMIT;
