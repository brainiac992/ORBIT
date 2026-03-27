-- Risk Module Overhaul + RACI Matrix Migration
-- Date: 2026-03-27
-- Initiative: risk-module-overhaul
--
-- This migration:
-- 1. Converts risks.probability (enum) and risks.impact (enum) to integer columns
-- 2. Adds risk_score, weight, owner_resource_id, escalation_path, legacy_owner_text
-- 3. Creates workstream_raci_assignments table
-- 4. Drops risk_probability enum (risk_impact kept for issues.severity)
--
-- Mapping: low=1, medium=3, high=5
-- Score bands: 1-4=green, 5-12=amber, 13-25=red

BEGIN;

-- ============================================================
-- STEP 1: Add new columns to risks table
-- ============================================================

ALTER TABLE risks ADD COLUMN likelihood integer;
ALTER TABLE risks ADD COLUMN risk_score integer;
ALTER TABLE risks ADD COLUMN weight integer NOT NULL DEFAULT 3;
ALTER TABLE risks ADD COLUMN owner_resource_id uuid REFERENCES resources(id) ON DELETE SET NULL;
ALTER TABLE risks ADD COLUMN escalation_path text;
ALTER TABLE risks ADD COLUMN legacy_owner_text varchar(255);

-- ============================================================
-- STEP 2: Migrate probability enum -> likelihood integer
-- ============================================================

UPDATE risks SET likelihood = CASE probability
  WHEN 'low' THEN 1
  WHEN 'medium' THEN 3
  WHEN 'high' THEN 5
END;

-- ============================================================
-- STEP 3: Migrate impact enum -> impact integer
-- Rename old enum column, create new integer column
-- ============================================================

ALTER TABLE risks RENAME COLUMN impact TO impact_old;
ALTER TABLE risks ADD COLUMN impact integer;

UPDATE risks SET impact = CASE impact_old
  WHEN 'low' THEN 1
  WHEN 'medium' THEN 3
  WHEN 'high' THEN 5
END;

-- ============================================================
-- STEP 4: Compute risk_score = likelihood * impact
-- ============================================================

UPDATE risks SET risk_score = likelihood * impact;

-- ============================================================
-- STEP 5: Preserve legacy owner text
-- (FK matching against resources is done at application level)
-- ============================================================

UPDATE risks SET legacy_owner_text = owner;

-- ============================================================
-- STEP 6: Apply NOT NULL constraints
-- ============================================================

ALTER TABLE risks ALTER COLUMN likelihood SET NOT NULL;
ALTER TABLE risks ALTER COLUMN impact SET NOT NULL;
ALTER TABLE risks ALTER COLUMN risk_score SET NOT NULL;

-- ============================================================
-- STEP 7: Add CHECK constraints
-- ============================================================

ALTER TABLE risks ADD CONSTRAINT chk_likelihood CHECK (likelihood BETWEEN 1 AND 5);
ALTER TABLE risks ADD CONSTRAINT chk_impact CHECK (impact BETWEEN 1 AND 5);
ALTER TABLE risks ADD CONSTRAINT chk_risk_score CHECK (risk_score BETWEEN 1 AND 25);
ALTER TABLE risks ADD CONSTRAINT chk_weight CHECK (weight BETWEEN 1 AND 5);

-- ============================================================
-- STEP 8: Recalculate RAG for non-overridden risks
-- Score bands: 1-4=green, 5-12=amber, 13-25=red
-- ============================================================

UPDATE risks SET rag = CASE
  WHEN risk_score BETWEEN 1 AND 4 THEN 'green'
  WHEN risk_score BETWEEN 5 AND 12 THEN 'amber'
  ELSE 'red'
END
WHERE rag_override = false;

-- ============================================================
-- STEP 9: Drop old columns
-- ============================================================

ALTER TABLE risks DROP COLUMN probability;
ALTER TABLE risks DROP COLUMN impact_old;
ALTER TABLE risks DROP COLUMN owner;

-- ============================================================
-- STEP 10: Drop unused enum type
-- risk_impact is KEPT because issues.severity depends on it
-- ============================================================

DROP TYPE IF EXISTS risk_probability;

-- ============================================================
-- STEP 11: Add new indexes on risks table
-- ============================================================

CREATE INDEX IF NOT EXISTS risks_risk_score_idx ON risks(risk_score);
CREATE INDEX IF NOT EXISTS risks_owner_resource_id_idx ON risks(owner_resource_id);

-- ============================================================
-- STEP 12: Create RACI enum and table
-- ============================================================

CREATE TYPE raci_role AS ENUM ('responsible', 'accountable', 'consulted', 'informed');

CREATE TABLE workstream_raci_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workstream_id uuid NOT NULL REFERENCES workstreams(id) ON DELETE CASCADE,
  resource_id uuid NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  raci_role raci_role NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workstream_id, resource_id, raci_role)
);

CREATE INDEX raci_workstream_id_idx ON workstream_raci_assignments(workstream_id);
CREATE INDEX raci_resource_id_idx ON workstream_raci_assignments(resource_id);

COMMIT;

-- ============================================================
-- ROLLBACK (run manually if needed — not automatic)
-- ============================================================
-- BEGIN;
-- DROP TABLE IF EXISTS workstream_raci_assignments;
-- DROP TYPE IF EXISTS raci_role;
-- DROP INDEX IF EXISTS risks_risk_score_idx;
-- DROP INDEX IF EXISTS risks_owner_resource_id_idx;
-- ALTER TABLE risks DROP CONSTRAINT IF EXISTS chk_likelihood;
-- ALTER TABLE risks DROP CONSTRAINT IF EXISTS chk_impact;
-- ALTER TABLE risks DROP CONSTRAINT IF EXISTS chk_risk_score;
-- ALTER TABLE risks DROP CONSTRAINT IF EXISTS chk_weight;
-- ALTER TABLE risks DROP COLUMN IF EXISTS likelihood;
-- ALTER TABLE risks DROP COLUMN IF EXISTS risk_score;
-- ALTER TABLE risks DROP COLUMN IF EXISTS weight;
-- ALTER TABLE risks DROP COLUMN IF EXISTS owner_resource_id;
-- ALTER TABLE risks DROP COLUMN IF EXISTS escalation_path;
-- ALTER TABLE risks DROP COLUMN IF EXISTS legacy_owner_text;
-- ALTER TABLE risks ADD COLUMN probability risk_probability; -- would need to recreate enum
-- ALTER TABLE risks ADD COLUMN impact risk_impact;
-- ALTER TABLE risks ADD COLUMN owner varchar(255);
-- COMMIT;
