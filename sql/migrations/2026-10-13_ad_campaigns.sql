-- M-Taji Siasa upgrade: paid ad campaigns on X and Google Ads, funded by the wallet.
--
-- Run ONCE in the Supabase SQL Editor after 2026-10-12_applications_gallery_project_links.sql.
-- Keeps all existing rows and is safe to run again.

BEGIN;

SET search_path TO mtaji, public;

-- ---------------------------------------------------------------------------
-- 1. Wallet: ad payments and refunds, with a note and a link to the campaign
-- ---------------------------------------------------------------------------

ALTER TABLE wallet_movements DROP CONSTRAINT IF EXISTS wallet_movements_kind_check;
ALTER TABLE wallet_movements
  ADD CONSTRAINT wallet_movements_kind_check
  CHECK (kind IN ('top-up', 'withdrawal', 'ad-spend', 'ad-refund'));

ALTER TABLE wallet_movements ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE wallet_movements ADD COLUMN IF NOT EXISTS reference text;

-- ---------------------------------------------------------------------------
-- 2. Ad campaigns. The full campaign (copy, keywords, per-network results) is
--    kept as a document; the columns below are what we filter and report on.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ad_campaigns (
  id text PRIMARY KEY,
  seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  leader_id text NOT NULL REFERENCES leaders (id) ON DELETE CASCADE,
  project_id text REFERENCES projects (id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN (
    'pending_approval', 'launching', 'active', 'paused', 'completed', 'failed', 'rejected', 'stopped'
  )),
  budget_kes numeric(14, 2) NOT NULL CHECK (budget_kes > 0),
  refunded_kes numeric(14, 2) NOT NULL DEFAULT 0 CHECK (refunded_kes >= 0),
  created_at text NOT NULL,
  updated_at text NOT NULL,
  doc jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS ad_campaigns_leader ON ad_campaigns (leader_id, seq DESC);
CREATE INDEX IF NOT EXISTS ad_campaigns_status ON ad_campaigns (status);

CREATE OR REPLACE FUNCTION ad_campaign_document(p_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = mtaji, public
AS $$
  SELECT doc FROM ad_campaigns WHERE id = p_id;
$$;

CREATE OR REPLACE FUNCTION list_ad_campaigns()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = mtaji, public
AS $$
  SELECT COALESCE(jsonb_agg(doc ORDER BY seq DESC), '[]'::jsonb) FROM ad_campaigns;
$$;

CREATE OR REPLACE FUNCTION upsert_ad_campaign(doc jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = mtaji, public
AS $$
DECLARE
  cid text := require_id(doc);
BEGIN
  IF NULLIF(doc->>'leaderId', '') IS NULL THEN
    RAISE EXCEPTION 'Ad campaign leaderId is required.';
  END IF;
  INSERT INTO ad_campaigns (
    id, leader_id, project_id, status, budget_kes, refunded_kes, created_at, updated_at, doc
  )
  VALUES (
    cid,
    doc->>'leaderId',
    NULLIF(doc->>'projectId', ''),
    doc->>'status',
    (doc->>'budgetKes')::numeric,
    COALESCE((doc->>'refundedKes')::numeric, 0),
    doc->>'createdAt',
    doc->>'updatedAt',
    doc
  )
  ON CONFLICT (id) DO UPDATE SET
    project_id = EXCLUDED.project_id,
    status = EXCLUDED.status,
    budget_kes = EXCLUDED.budget_kes,
    refunded_kes = EXCLUDED.refunded_kes,
    updated_at = EXCLUDED.updated_at,
    doc = EXCLUDED.doc;
  RETURN ad_campaign_document(cid);
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Counts and cleanup include campaigns
-- ---------------------------------------------------------------------------

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
    'applications', (SELECT count(*) FROM opportunity_applications),
    'adCampaigns', (SELECT count(*) FROM ad_campaigns)
  );
$$;

CREATE OR REPLACE FUNCTION clear_runtime_data()
RETURNS void
LANGUAGE plpgsql
SET search_path = mtaji, public
AS $$
BEGIN
  DELETE FROM ad_campaigns;
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
-- 4. Same API lockdown as the previous upgrade, covering the new objects
-- ---------------------------------------------------------------------------

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
ALTER TABLE ad_campaigns ENABLE ROW LEVEL SECURITY;

COMMIT;

NOTIFY pgrst, 'reload schema';
