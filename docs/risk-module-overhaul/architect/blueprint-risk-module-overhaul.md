# Solution Blueprint — Risk Module Overhaul + RACI Matrix

**Date:** 2026-03-27
**Author:** Architect Agent
**Program Brief:** /docs/risk-module-overhaul/pm/pm-brief-risk-module-overhaul.md
**Requirements Doc:** /docs/risk-module-overhaul/ba/requirements-risk-module-overhaul.md
**Status:** Approved for Implementation

---

## 1. Solution Overview

This initiative replaces the qualitative risk module with a quantitative scoring engine and introduces a workstream-level RACI matrix. The work decomposes into four streams:

**Stream A — Risk Schema Migration:** Replace `probability` (enum) and `impact` (enum) columns with `likelihood` (integer 1-5) and `impact` (integer 1-5). Add persisted `risk_score` column, `weight` integer column, `owner_resource_id` FK, `escalation_path` text, and `legacy_owner_text` preservation column. Migrate all existing data.

**Stream B — Risk UI Overhaul:** Replace dropdowns with labeled 1-5 selectors, add weight input, add resource-linked owner picker, build the 5x5 heatmap (CSS Grid), add sorting/filtering to the risk list, display computed scores with color-coded badges.

**Stream C — RACI Matrix:** New `workstream_raci_assignments` table, new `raciRouter` tRPC router, new standalone RACI page at `/venture/:ventureId/raci`, compact RACI view on the Plan page, new sidebar tab.

**Stream D — Dashboard Integration:** Update PM, PMO, and GM dashboard queries to surface risk scores, weighted exposure, and score-band breakdowns.

Streams A and C are independent and can be built in parallel. Stream B depends on A. Stream D depends on A and B.

---

## 2. System Impact

### What this touches

| System | Change Type | Details |
|---|---|---|
| `risks` table | **Modified** | 6 columns added, 2 columns replaced (enum to integer), 1 column removed (owner varchar) |
| `shared/enums.ts` | **Modified** | `deriveRag()` rewritten for numeric input. New constants added. `RISK_PROBABILITY` and `RISK_IMPACT` removed. |
| `server/routers/risks.ts` | **Modified** | `createRisk`, `updateRisk`, `listRisks` input/output schemas change. New query for heatmap aggregation. |
| `server/routers/dashboard.ts` | **Modified** | GM, PMO, PM dashboard queries updated for score-based risk summaries. |
| `client/src/pages/RisksPage.tsx` | **Modified** | Full rewrite of risk cards, forms, list; new heatmap component added. |
| `client/src/pages/ProjectPlan.tsx` | **Modified** | Compact RACI columns added to workstream rows. |
| `client/src/components/Shell.tsx` | **Modified** | New "RACI" tab in `ventureTabs` array. |
| `client/src/App.tsx` | **Modified** | New route `/venture/:ventureId/raci`. |
| `server/routers/index.ts` | **Modified** | New `raci` router registered. |
| `client/src/index.css` | **Modified** | 5 new `--risk-*` CSS variables added. |
| `workstream_raci_assignments` table | **New** | New join table. |
| `server/routers/raci.ts` | **New** | New tRPC router. |
| `client/src/pages/RaciPage.tsx` | **New** | New page component. |

### What this does NOT touch

- `issues` table and `riskImpactEnum` — left as-is (issues.severity still uses it)
- `blockers` table — unchanged
- `progressUpdates` — unchanged
- Budget module — unchanged
- Approvals module — unchanged

---

## 3. Data Architecture

### 3.1 Schema Changes to `risks` Table

**Columns to ADD:**

| Column | Type | Constraints | Default | Notes |
|---|---|---|---|---|
| `likelihood` | `integer` | NOT NULL, CHECK 1-5 | none (required) | Replaces `probability` enum |
| `impact` (new integer) | `integer` | NOT NULL, CHECK 1-5 | none (required) | Replaces `impact` enum (same name, different type) |
| `risk_score` | `integer` | NOT NULL, CHECK 1-25 | none (computed) | Persisted as `likelihood * impact`. Updated by application on every write. |
| `weight` | `integer` | NOT NULL, CHECK 1-5 | `3` | Relative importance. |
| `owner_resource_id` | `uuid` | NULLABLE, FK to `resources(id)` ON DELETE SET NULL | null | Replaces free-text `owner`. |
| `escalation_path` | `text` | NULLABLE | null | Free-text escalation instructions. |
| `legacy_owner_text` | `varchar(255)` | NULLABLE | null | Preserves original free-text owner after migration. Only populated during migration. |

**Columns to REMOVE (after migration):**

| Column | Current Type | Notes |
|---|---|---|
| `probability` | `riskProbabilityEnum` | Replaced by `likelihood` integer. |
| `impact` (old enum) | `riskImpactEnum` | Replaced by `impact` integer. |
| `owner` | `varchar(255)` | Replaced by `owner_resource_id` FK. Value preserved in `legacy_owner_text`. |

**Columns UNCHANGED:** `id`, `venture_id`, `title`, `description`, `rag`, `rag_override`, `mitigation_plan`, `status`, `escalated`, `created_by`, `created_at`, `updated_at`.

**New indexes:**

- `risks_risk_score_idx` on `(risk_score)` — supports sort-by-score queries
- `risks_owner_resource_id_idx` on `(owner_resource_id)` — supports owner filter/join

**Enum handling:**

- `riskProbabilityEnum` (`risk_probability` PG type): DROP after migration — no other table references it.
- `riskImpactEnum` (`risk_impact` PG type): KEEP — `issues.severity` column still references it.

### 3.2 New Table: `workstream_raci_assignments`

```
workstream_raci_assignments
  id              uuid        PK, default random
  workstream_id   uuid        FK -> workstreams(id) ON DELETE CASCADE, NOT NULL
  resource_id     uuid        FK -> resources(id) ON DELETE CASCADE, NOT NULL
  raci_role       raci_role   enum('responsible','accountable','consulted','informed'), NOT NULL
  created_by      uuid        FK -> users(id), NOT NULL
  created_at      timestamptz DEFAULT now(), NOT NULL
  updated_at      timestamptz DEFAULT now(), NOT NULL

UNIQUE(workstream_id, resource_id, raci_role)
INDEX(workstream_id)
INDEX(resource_id)
```

**New PG enum:** `raci_role` with values `['responsible', 'accountable', 'consulted', 'informed']`.

**Cascade behavior:** When a workstream is deleted, its RACI assignments cascade-delete. When a resource is deleted, its RACI assignments cascade-delete. This is standard for join tables.

### 3.3 Migration Strategy

The migration MUST be a raw SQL migration file, not a Drizzle declarative push. Drizzle ORM cannot declaratively change a column from enum type to integer type.

**Migration steps (single transaction):**

```sql
-- Step 1: Add new columns
ALTER TABLE risks ADD COLUMN likelihood integer;
ALTER TABLE risks ADD COLUMN risk_score integer;
ALTER TABLE risks ADD COLUMN weight integer NOT NULL DEFAULT 3;
ALTER TABLE risks ADD COLUMN owner_resource_id uuid REFERENCES resources(id) ON DELETE SET NULL;
ALTER TABLE risks ADD COLUMN escalation_path text;
ALTER TABLE risks ADD COLUMN legacy_owner_text varchar(255);

-- Step 2: Migrate data — enum to integer
-- CONFIRMED BY USER: low=1, medium=3, high=5
UPDATE risks SET likelihood = CASE probability
  WHEN 'low' THEN 1 WHEN 'medium' THEN 3 WHEN 'high' THEN 5 END;

-- impact: rename existing enum column, create new integer column
ALTER TABLE risks RENAME COLUMN impact TO impact_old;
ALTER TABLE risks ADD COLUMN impact integer;
UPDATE risks SET impact = CASE impact_old
  WHEN 'low' THEN 1 WHEN 'medium' THEN 3 WHEN 'high' THEN 5 END;

-- Step 3: Compute risk_score
UPDATE risks SET risk_score = likelihood * impact;

-- Step 4: Preserve legacy owner text, attempt FK match
UPDATE risks SET legacy_owner_text = owner;
-- FK matching done by application-level migration script (fuzzy match against resources table)

-- Step 5: Apply NOT NULL constraints
ALTER TABLE risks ALTER COLUMN likelihood SET NOT NULL;
ALTER TABLE risks ALTER COLUMN impact SET NOT NULL;
ALTER TABLE risks ALTER COLUMN risk_score SET NOT NULL;

-- Step 6: Add CHECK constraints
ALTER TABLE risks ADD CONSTRAINT chk_likelihood CHECK (likelihood BETWEEN 1 AND 5);
ALTER TABLE risks ADD CONSTRAINT chk_impact CHECK (impact BETWEEN 1 AND 5);
ALTER TABLE risks ADD CONSTRAINT chk_risk_score CHECK (risk_score BETWEEN 1 AND 25);
ALTER TABLE risks ADD CONSTRAINT chk_weight CHECK (weight BETWEEN 1 AND 5);

-- Step 7: Recalculate RAG for non-overridden risks
UPDATE risks SET rag = CASE
  WHEN risk_score BETWEEN 1 AND 4 THEN 'green'
  WHEN risk_score BETWEEN 5 AND 12 THEN 'amber'
  ELSE 'red'
END
WHERE rag_override = false;

-- Step 8: Drop old columns
ALTER TABLE risks DROP COLUMN probability;
ALTER TABLE risks DROP COLUMN impact_old;
ALTER TABLE risks DROP COLUMN owner;

-- Step 9: Drop unused enum type
DROP TYPE IF EXISTS risk_probability;

-- Step 10: Add indexes
CREATE INDEX risks_risk_score_idx ON risks(risk_score);
CREATE INDEX risks_owner_resource_id_idx ON risks(owner_resource_id);

-- Step 11: Create RACI enum and table
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
```

**Owner FK matching** is done as a separate application-level script (not in the SQL migration) because it requires fuzzy string matching against `resources.name` scoped to the venture's `resource_assignments`. Unmatched owners leave `owner_resource_id` as null with the original text preserved in `legacy_owner_text`.

### 3.4 Drizzle Schema Updates

After migration, `server/db/schema.ts` must reflect the new column definitions:

```typescript
// New enum
export const raciRoleEnum = pgEnum('raci_role', ['responsible', 'accountable', 'consulted', 'informed']);

// Updated risks table
export const risks = pgTable('risks', {
  id: uuid('id').primaryKey().defaultRandom(),
  ventureId: uuid('venture_id').references(() => ventures.id).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  likelihood: integer('likelihood').notNull(),        // 1-5
  impact: integer('impact').notNull(),                 // 1-5
  riskScore: integer('risk_score').notNull(),           // 1-25, persisted
  weight: integer('weight').notNull().default(3),       // 1-5
  rag: ragRatingEnum('rag').notNull(),
  ragOverride: boolean('rag_override').default(false).notNull(),
  mitigationPlan: text('mitigation_plan'),
  ownerResourceId: uuid('owner_resource_id').references(() => resources.id),
  escalationPath: text('escalation_path'),
  legacyOwnerText: varchar('legacy_owner_text', { length: 255 }),
  status: riskStatusEnum('status').default('open').notNull(),
  escalated: boolean('escalated').default(false).notNull(),
  createdBy: uuid('created_by').references(() => users.id).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('risks_venture_id_idx').on(table.ventureId),
  index('risks_escalated_idx').on(table.escalated),
  index('risks_status_idx').on(table.status),
  index('risks_risk_score_idx').on(table.riskScore),
  index('risks_owner_resource_id_idx').on(table.ownerResourceId),
]);

// New RACI table
export const workstreamRaciAssignments = pgTable('workstream_raci_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  workstreamId: uuid('workstream_id').references(() => workstreams.id, { onDelete: 'cascade' }).notNull(),
  resourceId: uuid('resource_id').references(() => resources.id, { onDelete: 'cascade' }).notNull(),
  raciRole: raciRoleEnum('raci_role').notNull(),
  createdBy: uuid('created_by').references(() => users.id).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('raci_workstream_id_idx').on(table.workstreamId),
  index('raci_resource_id_idx').on(table.resourceId),
]);
```

---

## 4. API / Integration Contracts

### 4.1 Modified Router: `risksRouter` (server/routers/risks.ts)

#### `risks.listRisks` (MODIFIED)

**Input:** `{ ventureId: string }` (unchanged)

**Output:** Array of risk objects with new shape:

```typescript
{
  id: string;
  ventureId: string;
  title: string;
  description: string | null;
  likelihood: number;        // 1-5
  impact: number;            // 1-5
  riskScore: number;         // 1-25
  weight: number;            // 1-5
  rag: 'green' | 'amber' | 'red';
  ragOverride: boolean;
  mitigationPlan: string | null;
  ownerResourceId: string | null;
  escalationPath: string | null;
  legacyOwnerText: string | null;
  status: 'open' | 'mitigated' | 'closed';
  escalated: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
```

**Implementation note:** Join with `resources` table to include `ownerName` in the response. Use a left join so null owners return null name.

**Add to output:** `ownerName: string | null` (resolved from `resources.name` via `owner_resource_id`).

#### `risks.createRisk` (MODIFIED)

**Input schema:**

```typescript
z.object({
  ventureId: z.string().uuid(),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  likelihood: z.number().int().min(1).max(5),
  impact: z.number().int().min(1).max(5),
  weight: z.number().int().min(1).max(5).default(3),
  rag: z.enum(RAG_RATING).optional(),          // manual override
  mitigationPlan: z.string().optional(),
  ownerResourceId: z.string().uuid().nullable().optional(),
  escalationPath: z.string().optional(),
})
```

**Logic:**
1. Compute `riskScore = likelihood * impact`
2. If `rag` not provided: auto-derive from `riskScore` using new `deriveRagFromScore(score)`. Set `ragOverride = false`.
3. If `rag` provided: use it. Set `ragOverride = true`.
4. Insert with all fields.
5. Audit log: `entityType: 'risk'`, `action: 'created'`.

#### `risks.updateRisk` (MODIFIED)

**Input schema:**

```typescript
z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  likelihood: z.number().int().min(1).max(5).optional(),
  impact: z.number().int().min(1).max(5).optional(),
  weight: z.number().int().min(1).max(5).optional(),
  rag: z.enum(RAG_RATING).optional(),
  ragOverride: z.boolean().optional(),
  mitigationPlan: z.string().optional(),
  ownerResourceId: z.string().uuid().nullable().optional(),
  escalationPath: z.string().optional(),
  status: z.enum(RISK_STATUS).optional(),
  escalated: z.boolean().optional(),
})
```

**Logic:**
1. Fetch existing risk.
2. If `likelihood` or `impact` changed: recompute `riskScore`.
3. If `ragOverride` explicitly set to `false` OR if score changed and current `ragOverride` is `false`: auto-derive RAG from new score.
4. If `rag` provided explicitly: set `ragOverride = true`.
5. Update, audit via `logAuditDiff`.

#### `risks.riskSummary` (NEW)

**Input:** `{ ventureId: string }`

**Output:**

```typescript
{
  highestScore: number;
  weightedExposure: number;      // SUM(score*weight)/SUM(weight) for open risks
  countByBand: {
    green: number;    // 1-4
    yellow: number;   // 5-8
    amber: number;    // 9-12
    red: number;      // 13-19
    darkRed: number;  // 20-25
  };
  totalOpen: number;
}
```

**Used by:** Dashboard queries, Risks page header.

### 4.2 New Router: `raciRouter` (server/routers/raci.ts)

#### `raci.list`

**Input:** `{ ventureId: string }`

**Output:** Array of assignments joined with workstream name and resource name:

```typescript
{
  id: string;
  workstreamId: string;
  workstreamName: string;
  resourceId: string;
  resourceName: string;
  resourceActive: boolean;         // from resources.active
  isVentureAssigned: boolean;      // whether resource has active resource_assignment for this venture
  raciRole: 'responsible' | 'accountable' | 'consulted' | 'informed';
  createdBy: string;
  createdAt: string;
}
```

**Implementation:** Join `workstream_raci_assignments` with `workstreams` (for name), `resources` (for name and active), and left-join `resource_assignments` (for venture membership check). Filter workstreams by `venture_id`. Access control: `assertVentureReadAccess`.

#### `raci.create`

**Input:**

```typescript
z.object({
  workstreamId: z.string().uuid(),
  resourceId: z.string().uuid(),
  raciRole: z.enum(['responsible', 'accountable', 'consulted', 'informed']),
})
```

**Logic:**
1. Resolve workstream to get `ventureId`. Call `assertVentureReadAccess`.
2. GM check: throw FORBIDDEN.
3. If `raciRole === 'accountable'`: query existing accountable for this workstream. If one exists, throw `BAD_REQUEST` with message "Only one Accountable is allowed per workstream."
4. Insert. Catch unique constraint violation and return friendly error.
5. Audit: `entityType: 'workstream_raci_assignment'`, `action: 'created'`.

#### `raci.delete`

**Input:** `{ id: string }`

**Logic:**
1. Fetch assignment, resolve workstream to get `ventureId`.
2. Access control + GM check.
3. Delete.
4. Audit: `entityType: 'workstream_raci_assignment'`, `action: 'deleted'`.

#### `raci.listVentureResources`

**Input:** `{ ventureId: string }`

**Output:** Array of `{ id, name, roleTitle }` — active resources with an active `resource_assignments` entry for this venture.

**Note:** This query likely already exists in the resources router. If so, reuse it. If not, add it to the RACI router for self-containment.

### 4.3 Modified Router: `dashboardRouter` (server/routers/dashboard.ts)

#### `dashboard.gm` (MODIFIED)

Add to each venture card:
- `topRiskScore: number` — highest `risk_score` among open risks
- `riskCountByBand: { green, yellow, amber, red, darkRed }` — count of open risks per score band

Replace the current `escalationCount` risk portion with these fields. Keep issue escalation count.

#### `dashboard.pmo` (MODIFIED)

Add to each venture row:
- `topRiskScore: number`
- `weightedExposure: number`

Add to the response root:
- `portfolioRiskSummary: { green, yellow, amber, red, darkRed }` — aggregate across all ventures

Replace `openRisksCount` (which currently counts escalated risks, not open risks) with `topRiskScore`.

#### `dashboard.pm` (MODIFIED)

Replace `openRisksCount` with:
- `topRiskScore: number`
- `weightedExposure: number`
- `openRisksCount: number` (keep, but now count actual open risks, not all risks)

### 4.4 Shared Enums Updates (shared/enums.ts)

**Remove:** `RISK_PROBABILITY`, `RISK_IMPACT` constants and types.

**Add:**

```typescript
export const RACI_ROLE = ['responsible', 'accountable', 'consulted', 'informed'] as const;
export type RaciRole = (typeof RACI_ROLE)[number];

export const LIKELIHOOD_LABELS: Record<number, string> = {
  1: 'Rare', 2: 'Unlikely', 3: 'Possible', 4: 'Likely', 5: 'Almost Certain',
};

export const IMPACT_LABELS: Record<number, string> = {
  1: 'Negligible', 2: 'Minor', 3: 'Moderate', 4: 'Major', 5: 'Severe',
};

export const SCORE_BANDS = {
  green:   { min: 1,  max: 4,  label: 'Low' },
  yellow:  { min: 5,  max: 8,  label: 'Medium-Low' },
  amber:   { min: 9,  max: 12, label: 'Medium' },
  red:     { min: 13, max: 19, label: 'High' },
  darkRed: { min: 20, max: 25, label: 'Critical' },
} as const;

export type ScoreBand = keyof typeof SCORE_BANDS;

export function getScoreBand(score: number): ScoreBand {
  if (score <= 4) return 'green';
  if (score <= 8) return 'yellow';
  if (score <= 12) return 'amber';
  if (score <= 19) return 'red';
  return 'darkRed';
}
```

**Replace `deriveRag`:**

```typescript
// OLD: deriveRag(probability: RiskProbability, impact: RiskImpact): RagRating
// NEW: deriveRag accepts numeric score
export function deriveRag(score: number): RagRating {
  if (score <= 4) return 'green';
  if (score <= 12) return 'amber';
  return 'red';
}
```

**Note:** The function signature changes. All call sites in `risks.ts` router must be updated. The old signature is used in `createRisk` and `updateRisk` — both are being rewritten.

---

## 5. UI / Dashboard Architecture

### 5.1 CSS Variables (index.css)

Add to `:root`:

```css
/* Risk score heatmap bands */
--risk-green: #10B981;
--risk-yellow: #EAB308;
--risk-amber: #F59E0B;
--risk-red: #EF4444;
--risk-dark-red: #DC2626;
```

### 5.2 Risks Page Overhaul (RisksPage.tsx)

**Layout (top to bottom):**

1. **Page header:** "Risks" title + "Log Risk" button (PM/PMO only) + weighted exposure badge
2. **Heatmap component** (5x5 CSS Grid) — above the risk list
3. **Filter bar:** Score band pills (green/yellow/amber/red/dark-red), owner dropdown, status dropdown, "Clear filters" link
4. **Sort controls:** Score (default desc), Weight, Owner, Status, Date
5. **Risk list:** Cards with new field layout
6. **Issues section** (unchanged)
7. **Blockers section** (unchanged)

**Heatmap Component (`RiskHeatmap`):**

- 5x5 CSS Grid. Rows = Likelihood 5 (top) to 1 (bottom). Columns = Impact 1 (left) to 5 (right).
- Each cell: background color from `--risk-*` variable based on cell score (row * col). Badge showing count of open risks at that (likelihood, impact) pair.
- Empty cells: show the colored background but no count badge.
- Click handler: sets a `heatmapFilter: { likelihood: number, impact: number } | null` state. When set, risk list filters to matching risks. Clicking again or clicking "Clear" removes filter.
- Axis labels: Y-axis "Likelihood" with 1-5 labels, X-axis "Impact" with 1-5 labels.

**Risk Card (updated):**

- Title (left), Score badge (colored, right)
- Row: Likelihood label + Impact label + Weight badge + Owner name (or "Unassigned") + RAG indicator
- Mitigation plan (if present)
- Escalation path (if present)
- Escalated flag
- Action buttons (PM/PMO only): Escalate, Mitigate, Close

**Create/Edit Risk Form (updated):**

- Title (text input, required)
- Description (textarea)
- Likelihood selector: 5 radio buttons or segmented control, labeled 1=Rare through 5=Almost Certain
- Impact selector: 5 radio buttons or segmented control, labeled 1=Negligible through 5=Severe
- Weight selector: 5 radio buttons, labeled 1-5, default 3
- Owner: searchable dropdown of venture resources (from `raci.listVentureResources` or equivalent resources query). Shows "Unassigned" option.
- Escalation path: text input
- Mitigation plan: textarea
- Score preview: computed inline as likelihood * impact, shown with color badge

**Weighted Exposure Display:**

- In the page header area, show: "Weighted Exposure: X.X" with color coding based on the value mapped to a score band.
- Formula: `SUM(risk_score * weight) / SUM(weight)` for open risks. Computed client-side from the list data.

### 5.3 RACI Page (NEW — RaciPage.tsx)

**Route:** `/venture/:ventureId/raci`

**Layout:**

1. **Page header:** "RACI Matrix" title
2. **Matrix table:**
   - Columns: Workstream Name | R (Responsible) | A (Accountable) | C (Consulted) | I (Informed)
   - Rows: one per workstream, sorted by `sortOrder`
   - Each cell shows resource name(s). If a resource is no longer venture-assigned, show with a warning icon and tooltip "Resource X is no longer assigned to this venture."
   - PM/PMO: click a cell to open an inline resource picker (dropdown/popover). Select a resource to add assignment. Click an "x" next to a name to remove assignment.
   - GM: read-only. No picker controls rendered.
3. **Empty state:** If no workstreams exist: "No workstreams defined. Create workstreams on the Plan page first." with a link to `/venture/:ventureId/plan`.

**Resource picker:**
- Queries active resources assigned to the venture via `resource_assignments`.
- Filters out resources already assigned in that role for that workstream.
- For the Accountable column: if one resource is already assigned, the picker is disabled with tooltip "Only one Accountable allowed. Remove the existing one first."

### 5.4 Plan Page Compact RACI (ProjectPlan.tsx modification)

**Added to `WorkstreamRow`:**

- After the status badge and progress bar, add 4 narrow columns: R | A | C | I
- Each column shows initials of assigned resources (first 2, with "+N more" overflow).
- A small "RACI" link icon at the end navigates to `/venture/:ventureId/raci`.
- All roles see this view. It is always read-only on the Plan page.
- Data source: `raci.list` query, filtered client-side per workstream.

### 5.5 Shell.tsx — Tab Update

**`ventureTabs` array change:**

Insert RACI tab after Plan (index 1):

```typescript
const ventureTabs = [
  { label: 'Plan', icon: '📋', suffix: 'plan' },
  { label: 'RACI', icon: '👤', suffix: 'raci' },       // NEW
  { label: 'Gantt', icon: '📐', suffix: 'gantt' },
  { label: 'Resources', icon: '👥', suffix: 'resources' },
  { label: 'Budget', icon: '💰', suffix: 'budget' },
  { label: 'Progress', icon: '📈', suffix: 'progress' },
  { label: 'Risks', icon: '⚡', suffix: 'risks' },
];
```

### 5.6 App.tsx — Route Addition

Add:

```typescript
<Route path="/venture/:ventureId/raci" element={<RaciPage />} />
```

Import `RaciPage` from `./pages/RaciPage.js`.

### 5.7 Dashboard Updates

**PM Dashboard:** Replace `openRisksCount` display with: "Top Risk: {score} | Exposure: {weightedExposure}" with color coding.

**GM Dashboard:** In each venture card/drawer, replace "Open: N / Escalated: N" with: score band breakdown badges (e.g., "3 red, 5 amber, 2 green") + "Top: {score}".

**PMO Dashboard:** Add a portfolio risk summary row showing aggregate band counts across all ventures. Per-venture rows show `topRiskScore` and `weightedExposure`.

---

## 6. Key Flows

### Flow 1: Create a new risk

1. PM clicks "Log Risk" on Risks page
2. Modal opens with: Title, Description, Likelihood (1-5 selector), Impact (1-5 selector), Weight (1-5, default 3), Owner (resource dropdown), Escalation Path, Mitigation Plan
3. Score preview shows `likelihood * impact` with color badge in real-time
4. PM clicks "Log Risk"
5. Client calls `risks.createRisk` with numeric fields
6. Server computes `riskScore`, derives RAG from score, inserts row, creates audit entry
7. Client invalidates `risks.listRisks` — list and heatmap re-render with new risk

### Flow 2: Heatmap cell click to filter

1. User views Risks page — heatmap renders above the list
2. User clicks cell at (Likelihood=4, Impact=3) — cell highlights, score=12
3. State updates: `heatmapFilter = { likelihood: 4, impact: 3 }`
4. Risk list filters client-side to show only risks matching those values
5. Filter pill appears: "Likelihood: 4, Impact: 3 — Clear"
6. User clicks "Clear" — filter removed, full list restored

### Flow 3: Assign RACI role

1. PM navigates to RACI tab for a venture
2. Matrix renders with workstreams as rows, R/A/C/I as columns
3. PM clicks empty cell in the "R" column for "Customer Migration" workstream
4. Resource picker popover opens showing venture-assigned active resources
5. PM selects "Jane Smith"
6. Client calls `raci.create({ workstreamId, resourceId, raciRole: 'responsible' })`
7. Server validates, inserts, creates audit entry
8. Cell updates to show "Jane Smith"

### Flow 4: Accountable constraint enforcement

1. PM clicks "A" column for a workstream that already has "John Doe" as Accountable
2. Picker is disabled. Tooltip: "Only one Accountable allowed. Remove the existing one first."
3. PM clicks "x" on "John Doe" — calls `raci.delete`
4. Cell clears. PM clicks cell again — picker opens
5. PM selects "Jane Smith" — assignment created

### Flow 5: Data migration

1. DB-Agent runs raw SQL migration inside a transaction
2. `probability` enum values mapped to `likelihood` integers (low=1, medium=3, high=5)
3. `impact` enum values mapped to `impact` integers (low=1, medium=3, high=5)
4. `risk_score` computed as `likelihood * impact` for all rows
5. `weight` set to 3 for all existing rows
6. `legacy_owner_text` populated from `owner` column
7. RAG recalculated for rows where `rag_override = false`
8. Old columns (`probability`, `impact_old`, `owner`) dropped
9. `risk_probability` PG enum type dropped
10. Application-level script attempts fuzzy match of `legacy_owner_text` to `resources.name` within venture scope, sets `owner_resource_id` where matched

---

## 7. Scalability & Maintenance Notes

**Performance:**
- Risk counts per venture are typically < 50. Heatmap aggregation is O(n) client-side — no concern.
- RACI assignments per venture: workstreams (< 20) x resources (< 30) x 4 roles = < 2400 max rows. Single query with joins is sufficient.
- Persisted `risk_score` column enables efficient DB-level sorting and filtering without computed columns.

**Maintenance:**
- Score band thresholds are defined in `shared/enums.ts` as a single source of truth (`SCORE_BANDS`). If thresholds change, update there only.
- RAG derivation from score is also in `shared/enums.ts`. Single function, used server-side.
- Heatmap colors are CSS variables — theme-level change, no component code needed.
- `legacy_owner_text` can be dropped in a future cleanup migration once all ventures have confirmed their owner FK mappings.

**What to watch:**
- If portfolio-level heatmap is added later (FR-HM-6), the `risks.riskSummary` query should be extended to accept an optional `ventureIds` array for batch aggregation, rather than N+1 queries.
- If risk volume exceeds 500 per venture, add server-side pagination to `listRisks`.

---

## 8. Agent Instructions

### DB-Agent must:

1. **Write a raw SQL migration file** (not a Drizzle declarative push) that performs all schema changes in a single transaction. Follow the exact SQL in section 3.3.
2. **Update `server/db/schema.ts`** to match the new table definitions exactly as specified in section 3.4. Remove `riskProbabilityEnum` usage from the risks table. Keep `riskImpactEnum` definition (issues table still uses it). Add `raciRoleEnum` and `workstreamRaciAssignments` table definition.
3. **Remove the `probability` and `impact` (enum) columns** from the Drizzle risks table definition. Replace with `likelihood` and `impact` (integer) columns.
4. **Remove the `owner` varchar column** from the Drizzle risks table definition. Replace with `ownerResourceId` uuid FK.
5. **Add `legacyOwnerText` and `escalationPath`** columns to the Drizzle risks table definition.
6. **Write a rollback SQL script** that reverses the migration (adds back enum columns, drops new columns, restores data from `legacy_owner_text`).
7. **Write an owner-matching script** (TypeScript, run separately) that reads `legacy_owner_text`, queries `resources` joined with `resource_assignments` per venture, does case-insensitive name match, and updates `owner_resource_id` where matched. Logs unmatched entries.
8. **Do NOT drop `risk_impact` enum type** — it is used by `issues.severity`.
9. **DO drop `risk_probability` enum type** — nothing else references it.
10. **Ensure ON DELETE CASCADE** on `workstream_raci_assignments.workstream_id` and `workstream_raci_assignments.resource_id`.
11. **Ensure ON DELETE SET NULL** on `risks.owner_resource_id`.

### Backend-Agent must:

1. **Rewrite `createRisk` and `updateRisk`** input schemas to accept numeric `likelihood`, `impact`, `weight`, `ownerResourceId`, `escalationPath` instead of enum `probability`, `impact`, `owner`. Follow exact schemas in section 4.1.
2. **Compute `riskScore = likelihood * impact`** on every create and on every update where likelihood or impact changes. Persist it to the DB column.
3. **Rewrite RAG auto-derivation:** call `deriveRag(score)` (new signature) when `ragOverride` is false. Preserve override logic exactly as specified.
4. **Add `ownerName` to `listRisks` response** by joining `risks` with `resources` on `owner_resource_id`. Left join so null owners return null name.
5. **Add `risks.riskSummary` query** per section 4.1 — returns highest score, weighted exposure, count by band, total open. Compute weighted exposure as `SUM(risk_score * weight) / SUM(weight)` for open risks. Handle zero-risk case (return 0).
6. **Create `server/routers/raci.ts`** with `list`, `create`, `delete`, `listVentureResources` procedures per section 4.2. Register in `server/routers/index.ts` as `raci: raciRouter`.
7. **Enforce Accountable cardinality** in `raci.create`: query for existing accountable before insert. Return `BAD_REQUEST` if one exists.
8. **Enforce Responsible requirement** on workstream status transition: if workstream update to `in_progress` or `complete` is attempted, check for at least one `responsible` RACI assignment. This means **modifying `workstreamsRouter.update`** to add this check.
9. **Audit all RACI mutations** using `logAudit` with `entityType: 'workstream_raci_assignment'` and actions `'created'` / `'deleted'`. Include `ventureId` from the parent workstream.
10. **Update `dashboard.gm`** to include `topRiskScore` and `riskCountByBand` per venture (section 4.3).
11. **Update `dashboard.pmo`** to include `topRiskScore`, `weightedExposure` per venture, and `portfolioRiskSummary` aggregate (section 4.3).
12. **Update `dashboard.pm`** to include `topRiskScore` and `weightedExposure` (section 4.3).
13. **Update `shared/enums.ts`** per section 4.4: remove `RISK_PROBABILITY`/`RISK_IMPACT`, add `RACI_ROLE`, `LIKELIHOOD_LABELS`, `IMPACT_LABELS`, `SCORE_BANDS`, `getScoreBand()`, rewrite `deriveRag()`.
14. **Remove all imports of `RISK_PROBABILITY` and `RISK_IMPACT`** from `risks.ts` and any other files that reference them.
15. **Do NOT modify the issue create/update routes** — `issues.severity` still uses the old `RISK_IMPACT` enum values. Leave the issue-related code in `risks.ts` untouched except for removing unused imports.

### Frontend-Agent must:

1. **Add 5 CSS variables** to `client/src/index.css` `:root` block per section 5.1.
2. **Rewrite `RisksPage.tsx`** per section 5.2:
   - Build `RiskHeatmap` component using CSS Grid (NO charting libraries).
   - Build filter bar with score-band pills, owner dropdown, status dropdown.
   - Build sort controls for score (default desc), weight, owner, status, date.
   - Update `RiskCard` to show all new fields (score badge, likelihood/impact labels, weight, resolved owner name, escalation path).
   - Update `CreateRiskForm` to use numeric selectors (1-5 with labels), resource dropdown for owner, weight selector, escalation path input, live score preview.
   - Add weighted exposure display in page header.
3. **Create `RaciPage.tsx`** per section 5.3:
   - Matrix table with workstream rows, R/A/C/I columns.
   - Inline resource picker for PM/PMO. Read-only for GM.
   - Stale resource warning indicators.
   - Empty state for no workstreams.
4. **Modify `ProjectPlan.tsx`** per section 5.4:
   - Add compact RACI columns (R/A/C/I) to each `WorkstreamRow`.
   - Show resource initials, truncated with "+N" overflow.
   - Add "RACI" link to navigate to the standalone page.
   - Read-only for all roles on the Plan page.
5. **Modify `Shell.tsx`** per section 5.5: insert RACI tab at index 1 in `ventureTabs`.
6. **Modify `App.tsx`** per section 5.6: add route and import for `RaciPage`.
7. **Update dashboard pages** (PMDashboard, PMODashboard, GMDashboard) to display new risk summary data per section 5.7.
8. **All new components must use existing design system CSS variables** (`--surface-0`, `--text-0`, `--border`, etc.) and the new `--risk-*` variables. NO hardcoded colors. NO light-theme colors.
9. **Heatmap must be pure CSS Grid** — no D3, Chart.js, or other charting libraries.
10. **Resource picker for owner and RACI** should be a shared component `VentureResourcePicker` that queries active venture-assigned resources. Used in both the risk form and the RACI page.

---

## 9. Red Flags

Things the build agents must NOT do:

1. **Do NOT drop `risk_impact` enum type** from the database. `issues.severity` depends on it.
2. **Do NOT use Drizzle `db push`** for the migration. The enum-to-integer conversion requires raw SQL.
3. **Do NOT add a charting library** (D3, Chart.js, Recharts, Nivo, etc.) for the heatmap. CSS Grid only.
4. **Do NOT modify the Issues or Blockers sections** of `RisksPage.tsx` beyond what is needed for layout adjustments from the heatmap addition.
5. **Do NOT create per-risk RACI assignments.** RACI is workstream-level only.
6. **Do NOT introduce optimistic locking** or conflict resolution. Last-write-wins is the existing pattern.
7. **Do NOT add mobile-specific layouts.** Responsive at 1024px+ is sufficient.
8. **Do NOT hardcode colors.** All risk colors go through CSS variables.
9. **Do NOT change the `issues.severity` column** or its enum type.
10. **Do NOT skip the audit trail** for RACI mutations. Both create and delete must be audited.
11. **Do NOT make `owner_resource_id` NOT NULL.** It must be nullable — risks can exist without an assigned owner.
12. **Do NOT make RACI Responsible mandatory at workstream creation.** Only mandatory for status transition to `in_progress` or `complete`.

---

## 10. Decisions Made

| # | Decision | Rationale | Confirmed By |
|---|---|---|---|
| D-1 | Migration mapping: low=1, medium=3, high=5 | User-confirmed mapping. Avoids clustering at minimum score. | User (explicit confirmation) |
| D-2 | `risk_score` is a persisted DB column, not computed | Simpler sort/filter queries. Negligible sync risk with single-writer pattern. Updated in application logic on every write. | Architect |
| D-3 | Weight scale: integer 1-5, default 3 | Simple, matches likelihood/impact scale. No normalization needed within venture. | User (explicit confirmation) |
| D-4 | RACI is per-workstream, NOT per-risk | RACI is an accountability matrix for work items. Risks have a single owner, not a RACI matrix. | User (explicit confirmation) |
| D-5 | Multiple Responsible allowed, at most one Accountable | Standard RACI practice. Enforced at application level. | User (explicit confirmation) |
| D-6 | Workstream deletion cascades RACI assignments | RACI assignments have no independent value without their workstream. Standard join-table pattern. | Architect |
| D-7 | Resource deletion cascades RACI assignments | Same rationale. Resource record deletion (not deactivation) removes assignments. | Architect |
| D-8 | RAG auto-derivation thresholds: 1-4=green, 5-12=amber, 13-25=red (3-band) | Standard RAG. Separate from heatmap's 5-band color coding. | BA Document |
| D-9 | Heatmap color bands: 1-4=green, 5-8=yellow, 9-12=amber, 13-19=red, 20-25=dark-red (5-band) | More granular visual discrimination for heatmap. Does not conflict with 3-band RAG. | BA Document |
| D-10 | Heatmap empty cells show colored background, no count badge | Cleaner visual. Zero-count cells are obvious by absence of badge. | Architect |
| D-11 | Owner FK is ON DELETE SET NULL | If a resource record is deleted, the risk should not be deleted. Owner becomes unassigned. | Architect |
| D-12 | Keep `risk_impact` PG enum, drop only `risk_probability` PG enum | `issues.severity` column still references `risk_impact` enum. Cannot drop. | Architect |
| D-13 | Dashboard integration ships in this release (not deferred) | GM's primary interface is the dashboard. PM Summary recommends inclusion. | User (explicit confirmation) |
| D-14 | User manual is in-scope Phase 7, NOT deferred | PM Brief and user directive include it. PO's P3 deferral overridden. | User (explicit confirmation) |
| D-15 | Raw SQL migration, not Drizzle declarative | Drizzle ORM cannot change column from enum type to integer type declaratively. | Architect |
| D-16 | RACI tab positioned after Plan, before Gantt in sidebar | Natural workflow: define plan, then assign accountability, then view timeline. | BA Document (FR-RACI-7) |

---

## 11. Phase Declaration

- **Phase 2 (UI/Design):** Not required — the UI design is fully specified in this blueprint (heatmap is CSS Grid, forms are standard selectors, RACI is a table). No visual design exploration needed.
- **Phase 3 (Build):** **Required** — DB migration, backend router changes, frontend page builds. Three-agent parallel build (DB-Agent, Backend-Agent, Frontend-Agent).
- **Phase 4 (QA):** **Required** — Migration integrity testing, RACI constraint enforcement, heatmap rendering, dashboard data accuracy, access control verification.
- **Phase 5 (Data Review):** **Required** — Migration produces a data state change. Must verify: no null scores, correct integer mappings, owner FK matches, RAG recalculation accuracy.
- **Phase 6 (Comms):** Not required — internal tooling, no external stakeholder communications needed.
- **Phase 7 (DOC-Agent):** **Required** — User manual covering all platform modules, authored after all UI is stable.
