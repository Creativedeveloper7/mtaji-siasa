-- M-Taji Siasa upgrade: opportunity applications, media galleries,
-- projects that require opportunities, and API hardening.
--
-- Run this ONCE on a database that already has sql/mtaji-siasa.sql applied
-- (Supabase: SQL Editor -> paste -> Run). It keeps every existing row and is
-- safe to run again: tables use IF NOT EXISTS and functions use CREATE OR REPLACE.
--
-- A brand-new database only needs sql/mtaji-siasa.sql, which already contains
-- everything below.

BEGIN;

SET search_path TO mtaji, public;

-- ---------------------------------------------------------------------------
-- 1. Projects can be flagged as needing opportunities (jobs, suppliers, training)
-- ---------------------------------------------------------------------------

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS requires_opportunities boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- 2. Media gallery: several photos per media item. The cover stays in media_items.image.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS media_images (
  media_id text NOT NULL REFERENCES media_items (id) ON DELETE CASCADE,
  position integer NOT NULL,
  url text NOT NULL,
  PRIMARY KEY (media_id, position)
);

-- ---------------------------------------------------------------------------
-- 3. Applications for opportunities
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS opportunity_applications (
  id text PRIMARY KEY,
  seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  opportunity_id text NOT NULL REFERENCES opportunities (id) ON DELETE CASCADE,
  applicant_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL DEFAULT '',
  county text,
  message text NOT NULL DEFAULT '',
  attachment_url text,
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'reviewing', 'shortlisted', 'accepted', 'rejected')),
  review_note text,
  created_at text NOT NULL,
  updated_at text NOT NULL,
  CONSTRAINT applications_one_per_user UNIQUE (opportunity_id, applicant_id)
);

CREATE INDEX IF NOT EXISTS applications_opportunity ON opportunity_applications (opportunity_id, seq DESC);
CREATE INDEX IF NOT EXISTS applications_applicant ON opportunity_applications (applicant_id, seq DESC);

-- ---------------------------------------------------------------------------
-- 4. Functions changed or added by this upgrade
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION project_document(p_id text)
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
    'mediaIds', linked_ids('project_media', 'project_id', p_id, 'media_id', 'position'),
    'requiresOpportunities', row.requires_opportunities
  );
END;
$$;

CREATE OR REPLACE FUNCTION upsert_project(doc jsonb)
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
    description, start_date, expected_completion, center_lat, center_lng, boundary,
    requires_opportunities
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
    geo->'boundary',
    COALESCE((doc->>'requiresOpportunities')::boolean, false)
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
    boundary = EXCLUDED.boundary,
    requires_opportunities = CASE
      WHEN doc ? 'requiresOpportunities' THEN EXCLUDED.requires_opportunities
      ELSE projects.requires_opportunities
    END;

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

CREATE OR REPLACE FUNCTION media_document(p_id text)
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
    'gallery', (
      SELECT COALESCE(jsonb_agg(url ORDER BY position), '[]'::jsonb)
      FROM media_images WHERE media_id = p_id
    ),
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

CREATE OR REPLACE FUNCTION upsert_media(doc jsonb)
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
  IF doc ? 'gallery' THEN
    DELETE FROM media_images WHERE media_id = mid;
    INSERT INTO media_images (media_id, position, url)
    SELECT mid, ordinality::integer, value
    FROM jsonb_array_elements_text(COALESCE(doc->'gallery', '[]'::jsonb)) WITH ORDINALITY
    WHERE value <> '';
  END IF;
  IF doc ? 'relatedOpportunityIds' THEN
    PERFORM sync_ordered_link('media_related_opportunities', 'media_id', mid, 'opportunity_id', 'position', doc->'relatedOpportunityIds');
  END IF;
  IF doc ? 'relatedMediaIds' THEN
    PERFORM sync_ordered_link('media_related_media', 'media_id', mid, 'related_media_id', 'position', doc->'relatedMediaIds');
  END IF;
  RETURN media_document(mid);
END;
$$;

CREATE OR REPLACE FUNCTION application_document(p_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = mtaji, public
AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'id', id,
    'opportunityId', opportunity_id,
    'applicantId', applicant_id,
    'fullName', full_name,
    'email', email,
    'phone', phone,
    'county', county,
    'message', message,
    'attachmentUrl', attachment_url,
    'status', status,
    'reviewNote', review_note,
    'createdAt', created_at,
    'updatedAt', updated_at
  ))
  FROM opportunity_applications
  WHERE id = p_id;
$$;

CREATE OR REPLACE FUNCTION list_applications()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = mtaji, public
AS $$
  SELECT COALESCE(jsonb_agg(application_document(id) ORDER BY seq DESC), '[]'::jsonb)
  FROM opportunity_applications;
$$;

-- Insert or update one application. Status and review note are the only fields
-- that change after submission; the app enforces who may change them.
CREATE OR REPLACE FUNCTION upsert_application(doc jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = mtaji, public
AS $$
DECLARE
  aid text := require_id(doc);
  now_text text := to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
BEGIN
  IF NULLIF(doc->>'opportunityId', '') IS NULL OR NULLIF(doc->>'applicantId', '') IS NULL THEN
    RAISE EXCEPTION 'Application opportunityId and applicantId are required.';
  END IF;
  INSERT INTO opportunity_applications (
    id, opportunity_id, applicant_id, full_name, email, phone, county, message,
    attachment_url, status, review_note, created_at, updated_at
  )
  VALUES (
    aid,
    doc->>'opportunityId',
    doc->>'applicantId',
    COALESCE(doc->>'fullName', ''),
    lower(COALESCE(doc->>'email', '')),
    COALESCE(doc->>'phone', ''),
    NULLIF(doc->>'county', ''),
    COALESCE(doc->>'message', ''),
    NULLIF(doc->>'attachmentUrl', ''),
    COALESCE(NULLIF(doc->>'status', ''), 'submitted'),
    NULLIF(doc->>'reviewNote', ''),
    COALESCE(NULLIF(doc->>'createdAt', ''), now_text),
    COALESCE(NULLIF(doc->>'updatedAt', ''), now_text)
  )
  ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    review_note = EXCLUDED.review_note,
    updated_at = EXCLUDED.updated_at;
  RETURN application_document(aid);
END;
$$;

CREATE OR REPLACE FUNCTION delete_application(p_id text)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = mtaji, public
AS $$
BEGIN
  DELETE FROM opportunity_applications WHERE id = p_id;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION counts()
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
    'adlyInterests', (SELECT count(*) FROM adly_interest_leads),
    'applications', (SELECT count(*) FROM opportunity_applications)
  );
$$;

CREATE OR REPLACE FUNCTION clear_runtime_data()
RETURNS void
LANGUAGE plpgsql
SET search_path = mtaji, public
AS $$
BEGIN
  DELETE FROM opportunity_applications;
  DELETE FROM wallet_movements;
  DELETE FROM wallets;
  DELETE FROM saved_opportunities;
  DELETE FROM saved_opportunity_lists;
  DELETE FROM adly_interest_topics;
  DELETE FROM adly_interest_leads;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. API access. The app talks to this schema only with the service-role key
--    (src/server/supabase/rpc.ts). The public anon key must not be able to read
--    password hashes or call the write functions, so lock the schema to service_role.
-- ---------------------------------------------------------------------------

GRANT USAGE ON SCHEMA mtaji TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA mtaji TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA mtaji TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA mtaji TO service_role;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA mtaji FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA mtaji FROM anon';
    EXECUTE 'REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA mtaji FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA mtaji FROM authenticated';
    EXECUTE 'REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA mtaji FROM authenticated';
  END IF;
END;
$$;

ALTER DEFAULT PRIVILEGES IN SCHEMA mtaji GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA mtaji GRANT EXECUTE ON FUNCTIONS TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA mtaji REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Row level security with no policies: anon/authenticated see nothing,
-- service_role bypasses RLS as before.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'mtaji'
  LOOP
    EXECUTE format('ALTER TABLE mtaji.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END;
$$;

COMMIT;

-- Tell the Supabase REST API (PostgREST) to pick up the new functions now.
NOTIFY pgrst, 'reload schema';
