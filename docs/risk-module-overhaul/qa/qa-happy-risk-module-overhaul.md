# QA Report -- Risk Module Overhaul + RACI Matrix -- Happy Path

**Date:** 2026-03-27
**QA Round:** 1
**Agent:** QA-Happy
**Verdict:** FAIL

---

## Acceptance Criteria Results

### Risk Scoring (FR-RS-1 through FR-RS-5)

| Criterion | Result | Notes |
|-----------|--------|-------|
| FR-RS-1: `likelihood` integer 1-5, old enum removed | PASS | `schema.ts` line 247: `likelihood: integer('likelihood').notNull()`. Migration drops `probability` column. CHECK constraint in migration. |
| FR-RS-2: `impact` integer 1-5, old enum removed | PASS | `schema.ts` line 248: `impact: integer('impact').notNull()`. Migration renames old to `impact_old`, creates new integer, drops old. |
| FR-RS-3: `risk_score` = likelihood * impact, persisted | PASS | `schema.ts` line 249: `riskScore: integer('risk_score').notNull()`. Computed in `createRisk` (line 68) and `updateRisk` (line 127). Migration step 4 computes for existing rows. |
| FR-RS-4: Labeled 1-5 selectors in form | PASS | `RisksPage.tsx` `LevelSelector` component renders 5 buttons with correct labels from `LIKELIHOOD_LABELS` and `IMPACT_LABELS` in `shared/enums.ts`. Labels match spec: 1=Rare/Negligible through 5=Almost Certain/Severe. |
| FR-RS-5: Score displayed on risk card, color-coded | PASS | `ScoreBadge` component renders score with `BAND_BG` classes keyed by `getScoreBand()`. |

### Risk Weighting (FR-RW-1 through FR-RW-3)

| Criterion | Result | Notes |
|-----------|--------|-------|
| FR-RW-1: `weight` integer 1-5, default 3 | PASS | `schema.ts` line 250: `weight: integer('weight').notNull().default(3)`. CHECK constraint in migration. |
| FR-RW-2: Weight input 1-5 selector in form | PASS | `RisksPage.tsx` lines 529-546: 5-button selector for weight in risk form. |
| FR-RW-3: Weighted exposure displayed per venture | PASS | `riskSummary` endpoint computes `SUM(score*weight)/SUM(weight)`. RisksPage header displays it with color-coded band badge. Zero-risk case returns 0. |

### Risk Owner & Escalation (FR-RO-1 through FR-RO-5)

| Criterion | Result | Notes |
|-----------|--------|-------|
| FR-RO-1: `owner_resource_id` FK to resources | PASS | `schema.ts` line 254: `ownerResourceId: uuid('owner_resource_id').references(() => resources.id)`. Nullable. |
| FR-RO-2: Searchable dropdown of venture resources | PASS | `RisksPage.tsx` line 577-583: Select dropdown populated from `ventureResources` (fetched via `raci.listVentureResources` which filters by active resources assigned to venture). Note: it is a standard `<Select>`, not a searchable/filterable dropdown -- adequate for happy path but not "searchable" per FR-RO-2. |
| FR-RO-3: Owner name resolved on risk cards | PASS | `listRisks` endpoint resolves `ownerName` from resource FK. RiskCard displays `risk.ownerName ?? 'Unassigned'`. |
| FR-RO-4: `escalation_path` text field | PASS | `schema.ts` line 255. Form input at line 586-587. Displayed on card when populated (line 404). |
| FR-RO-5: `escalated` boolean retained | PASS | Schema unchanged for `escalated`. Toggle works in RiskCard (line 410). Audit logged. |

### RAG Rating (FR-RAG-1 through FR-RAG-3)

| Criterion | Result | Notes |
|-----------|--------|-------|
| FR-RAG-1: Auto-derive RAG from score bands 1-4=green, 5-12=amber, 13-25=red | PASS | `deriveRag()` in `shared/enums.ts` lines 90-95: `score >= 13 -> red`, `score >= 5 -> amber`, else `green`. Matches spec. |
| FR-RAG-2: `rag_override` respected | PASS | `updateRisk` lines 130-146: when `ragOverride=true` and score changes, RAG is not recalculated. When override toggled off, RAG auto-derives. |
| FR-RAG-3: `deriveRag` updated for numeric input | PASS | Function accepts `(likelihood: number, impact: number)` and returns `RagRating`. All call sites use numeric values. |

### 5x5 Heatmap (FR-HM-1 through FR-HM-5)

| Criterion | Result | Notes |
|-----------|--------|-------|
| FR-HM-1: 5x5 grid, Likelihood Y-axis bottom-to-top, Impact X-axis left-to-right | PASS | `RisksPage.tsx` lines 197-215: renders `[5,4,3,2,1]` for rows (top=5, bottom=1) and `[1,2,3,4,5]` for columns. CSS Grid 5 columns. |
| FR-HM-2: Color-coded cells by score bands using `--risk-*` variables | PASS | `getHeatmapCellColor` computes score and maps via `BAND_COLORS` to CSS variables. Five `--risk-*` vars defined in `index.css`. |
| FR-HM-3: Count badge per cell for open risks | PASS | `heatmapData` endpoint filters `status='open'` and groups by likelihood/impact. Count displayed in cell. Empty cells show no badge. |
| FR-HM-4: Click cell filters risk list | PASS | `handleHeatmapClick` toggles `heatmapFilter`. `filteredRisks` filters by matching likelihood/impact. Click again clears. "Clear heatmap filter" link also available. |
| FR-HM-5: Heatmap rendered per venture on Risks page | PASS | Heatmap is above the risk list on the venture Risks page. |

### Risk List Enhancements (FR-RL-1 through FR-RL-3)

| Criterion | Result | Notes |
|-----------|--------|-------|
| FR-RL-1: Sortable by score (default desc), weight, status, owner, date | WARN | Sort controls exist for: Score, Likelihood, Impact, Weight, RAG, Status, Title. **Missing: owner name sort and created date sort** per FR-RL-1. Owner sort is absent because `ownerName` is a resolved field. `createdAt` sort button is absent. |
| FR-RL-2: Filterable by score band, owner, status | FAIL | **No filter controls exist** for score band, owner, or status. The only filtering mechanism is the heatmap cell click (filters by likelihood+impact). FR-RL-2 requires dedicated filter dropdowns for score band, owner, and status with AND logic and visual indicator of active filters. |
| FR-RL-3: Risk cards display all required fields | PASS | RiskCard shows: title, score (color badge), likelihood label, impact label, weight, owner name (or Unassigned), RAG indicator, status, escalated flag, escalation path, mitigation plan. |

### RACI Schema & Data (FR-RACI-1 through FR-RACI-6)

| Criterion | Result | Notes |
|-----------|--------|-------|
| FR-RACI-1: `workstream_raci_assignments` table with correct columns and FKs | PASS | `schema.ts` lines 364-376. All columns present: id (uuid PK), workstream_id (FK cascade), resource_id (FK cascade), raci_role (enum), created_by (FK), created_at, updated_at. |
| FR-RACI-2: Unique constraint on (workstream_id, resource_id, raci_role) | PASS | `schema.ts` line 375: `uniqueIndex('raci_ws_resource_role_idx')`. Migration line 129: `UNIQUE(workstream_id, resource_id, raci_role)`. `raci.ts` catches constraint violation error code `23505`. |
| FR-RACI-3: At most 1 Accountable per workstream enforced | PASS | `raci.ts` lines 116-128: checks for existing accountable before insert. `bulkUpdate` lines 197-203: validates count. Error message matches spec. |
| FR-RACI-4: Responsible required before workstream in_progress/complete | WARN | **No validation found** in `workstreams.update` endpoint or RACI router to block workstream status transitions without a Responsible. This validation is absent from the codebase. Classified as WARN because the workstream router is not in scope of files listed, but the requirement is unmet. |
| FR-RACI-5: Multiple Responsible per workstream | PASS | No cardinality constraint on Responsible. Unique constraint allows same workstream+resource+role but not duplicate combos. |
| FR-RACI-6: Multiple Consulted/Informed per workstream | PASS | Same as above -- no cardinality limit. |

### RACI Standalone Page (FR-RACI-7 through FR-RACI-12)

| Criterion | Result | Notes |
|-----------|--------|-------|
| FR-RACI-7: "RACI" tab in venture tab bar after Plan, before Gantt | PASS | `Shell.tsx` line 24: `{ label: 'RACI', icon: ..., suffix: 'raci' }` at index 1 (after Plan at index 0, before Gantt at index 2). |
| FR-RACI-8: Matrix display with workstream rows, R/A/C/I columns | PASS | `RaciPage.tsx` renders a table with workstream names as rows and 4 RACI role columns with assigned resource names. |
| FR-RACI-9: PM/PMO can add/remove RACI assignments | PASS | `canEdit = !isGM`. Add button opens resource picker per cell. Remove button on badges. `assign` and `remove` mutations used. |
| FR-RACI-10: GM sees read-only | PASS | `isGM` check hides all add/remove controls. Backend enforces with `ctx.user.role === 'gm'` check throwing FORBIDDEN. |
| FR-RACI-11: Empty state when no workstreams | PASS | `RaciPage.tsx` lines 84-95: shows message "No workstreams defined. Create workstreams on the Plan page first." with a "Go to Plan" button. |
| FR-RACI-12: Resource picker scoped to venture-assigned active resources | PASS | `listVentureResources` endpoint filters by `resourceAssignments.ventureId` and `resources.active = true`. Picker uses this data. |

### RACI Compact View on Plan Page (FR-RACI-13 through FR-RACI-16)

| Criterion | Result | Notes |
|-----------|--------|-------|
| FR-RACI-13: Plan page shows compact RACI per workstream | PASS | `ProjectPlan.tsx` builds `raciByWs` lookup and passes to `WorkstreamRow`. RACI data displayed inline on each row. |
| FR-RACI-14: Compact format with truncation | PASS | Lines 100-101: shows first 2 names, then `+N` for overflow. Format: `R: Name1, Name2 +1`. |
| FR-RACI-15: Link to full RACI page | PASS | Line 109: "RACI" link navigates to `/venture/${ventureId}/raci`. However, the link label is "RACI" not "Manage RACI" per spec -- functionally equivalent. |
| FR-RACI-16: Compact view is read-only for all roles | PASS | No inline editing controls on the Plan page compact view. It only displays data and a navigation link. |

### Data Migration (FR-MIG-1 through FR-MIG-7)

| Criterion | Result | Notes |
|-----------|--------|-------|
| FR-MIG-1: probability enum -> likelihood: low=2, medium=3, high=5 | FAIL | **Migration maps low=1, not low=2.** Requirements specify low=2, medium=3, high=5. Migration SQL line 34: `WHEN 'low' THEN 1`. Blueprint also says low=1 (comment says "CONFIRMED BY USER: low=1, medium=3, high=5"). The **requirements document** says low=2. This is a discrepancy. The blueprint overrides with user confirmation of low=1, but the requirements doc says low=2. |
| FR-MIG-2: impact enum -> impact: low=2, medium=3, high=5 | FAIL | Same issue. Migration maps low=1 for impact (line 48). Requirements say low=2. Blueprint says low=1 (user confirmed). |
| FR-MIG-3: Owner FK migration with fuzzy match | WARN | Migration preserves `legacy_owner_text = owner` (line 62). However, the **application-level FK matching** (fuzzy match against resources table) is noted as "done at application level" but no application migration script is present in the reviewed files. The SQL migration only preserves text -- it does not attempt FK resolution. |
| FR-MIG-4: Compute risk_score for all migrated risks | PASS | Migration line 55: `UPDATE risks SET risk_score = likelihood * impact`. |
| FR-MIG-5: Default weight=3 for all existing risks | PASS | Migration line 22: `ADD COLUMN weight integer NOT NULL DEFAULT 3`. |
| FR-MIG-6: Recalculate RAG for non-overridden risks | PASS | Migration lines 86-91: recalculates RAG based on score bands. Respects `rag_override = false`. |
| FR-MIG-7: Non-destructive, rollback script exists | PASS | Migration wrapped in BEGIN/COMMIT. Rollback script included (commented, lines 140-158). |

### Navigation (FR-NAV-1, FR-NAV-2)

| Criterion | Result | Notes |
|-----------|--------|-------|
| FR-NAV-1: RACI tab in ventureTabs after Plan | PASS | `Shell.tsx` line 24. Position is index 1 (Plan=0, RACI=1, Gantt=2). |
| FR-NAV-2: Route `/venture/:ventureId/raci` in App.tsx | PASS | `App.tsx` line 46: `<Route path="/venture/:ventureId/raci" element={<RaciPage />} />`. |

### Dashboard Integration (FR-DASH-1 through FR-DASH-3)

| Criterion | Result | Notes |
|-----------|--------|-------|
| FR-DASH-1: PM Dashboard shows highest risk score and weighted exposure | PASS | `dashboard.ts` PM endpoint returns `topRiskScore` and `weightedExposure` (lines 264-265). |
| FR-DASH-2: GM Dashboard shows risk count by score band and top score | PASS | `dashboard.ts` GM endpoint returns `topRiskScore` and `riskCountByBand` per venture (lines 137-138). |
| FR-DASH-3: PMO Dashboard shows portfolio risk summary | PASS | `dashboard.ts` PMO endpoint computes `portfolioRiskSummary` aggregating all open risks by band (lines 186-192). |

### Risk Export

| Criterion | Result | Notes |
|-----------|--------|-------|
| Export includes new risk fields | PASS | `export.ts` returns all risk fields including `ownerResourceId`, `riskScore`, `likelihood`, `impact`, `weight`. Resolves `ownerName` via FK. |

### Access Control

| Criterion | Result | Notes |
|-----------|--------|-------|
| GM read-only on risk mutations | PASS | `createRisk` and `updateRisk` both check `ctx.user.role === 'gm'` and throw FORBIDDEN. |
| GM read-only on RACI mutations | PASS | `raci.ts` assign, remove, bulkUpdate all check `ctx.user.role === 'gm'` and throw FORBIDDEN. |
| PMO full access all ventures | PASS | `assertVentureReadAccess` only restricts PM (checks pmUserId). GMO/PMO pass through. |
| PM restricted to own venture | PASS | `assertVentureReadAccess` checks `venture.pmUserId !== ctx.user.id` for PM role. Both risks and RACI routers use this. |

### Audit Logging

| Criterion | Result | Notes |
|-----------|--------|-------|
| Risk create audit | PASS | `risks.ts` line 88-91: `logAudit` with entity_type='risk', action='created'. |
| Risk update audit | PASS | `risks.ts` lines 161-178: differential audit for escalation, status change, and general field changes via `logAuditDiff`. |
| Risk delete audit | WARN | **No `deleteRisk` endpoint exists.** The UI only supports status changes (close/mitigate) rather than hard delete. This is acceptable for governance but means FR-MIG-7's rollback and any future delete would lack audit coverage. |
| RACI assign audit | PASS | `raci.ts` line 138-142: `logAudit` with entity_type='workstream_raci_assignment', action='created'. |
| RACI remove audit | PASS | `raci.ts` line 172-176: `logAudit` with entity_type='workstream_raci_assignment', action='deleted'. |
| RACI bulk update audit | PASS | `raci.ts` lines 210-214 and 228-232: `logAudit` with action='updated'. |

### Build

| Criterion | Result | Notes |
|-----------|--------|-------|
| `npm run build` passes | PASS | Vite build completes in 296ms. 177 modules. No errors. One CSS warning (import order) -- cosmetic only. |
| `tsc --noEmit --skipLibCheck` passes | PASS | Zero TypeScript errors. |

---

## Issues Found

### FAIL-1: Risk list filter controls missing (FR-RL-2)
- **Location:** `client/src/pages/RisksPage.tsx`
- **Problem:** No filter dropdowns for score band, owner, or status exist. The only filtering is via heatmap cell clicks (filters by likelihood+impact pair, not by score band). Requirements specify dedicated filter controls for score band, owner, and status with AND logic and visual indicator.
- **Expected:** Filter dropdowns or chips for score band (green/yellow/amber/red/dark-red), owner (from venture resources), and status (open/mitigated/closed). Active filters visually indicated.
- **Fix suggestion:** Add filter state variables and dropdown controls above the risk list. Apply AND logic in the `filteredRisks` useMemo.

### FAIL-2: Migration maps low=1, requirements say low=2 (FR-MIG-1, FR-MIG-2)
- **Location:** `server/db/migrations/risk-module-migration.sql` lines 34, 48
- **Problem:** Migration maps `low -> 1` for both likelihood and impact. The requirements document (FR-MIG-1, FR-MIG-2) specifies `low=2, medium=3, high=5`. The blueprint overrides this with a user-confirmed mapping of `low=1, medium=3, high=5`.
- **Expected:** Mapping matches the agreed specification.
- **Fix suggestion:** Confirm with stakeholders which mapping is correct. If the blueprint's user-confirmed `low=1` is authoritative, update the requirements doc. If requirements are authoritative, update migration and blueprint. This needs a decision, not just a code fix.

### WARN-1: Sort controls missing owner name and created date (FR-RL-1)
- **Location:** `client/src/pages/RisksPage.tsx` lines 244-264
- **Problem:** Sort buttons exist for Score, Likelihood, Impact, Weight, RAG, Status, Title. Missing: owner name sort and created date sort, both required by FR-RL-1.
- **Expected:** Sort by owner name and created date.
- **Fix suggestion:** Add `ownerName` and `createdAt` to the sort controls array. Owner sort will use string comparison on the resolved name.

### WARN-2: Workstream status transition not gated by RACI Responsible (FR-RACI-4)
- **Location:** Not found in `server/routers/raci.ts` or `client/src/pages/ProjectPlan.tsx`
- **Problem:** FR-RACI-4 requires that workstreams cannot transition to `in_progress` or `complete` without at least one Responsible assigned. No validation for this exists in the workstream update endpoint.
- **Expected:** The workstream update mutation checks RACI assignments before allowing status transitions.
- **Fix suggestion:** Add a check in the workstream update endpoint: if new status is `in_progress` or `complete`, query `workstream_raci_assignments` for at least one `responsible` role. If none, return validation error.

### WARN-3: No application-level owner FK migration script (FR-MIG-3)
- **Location:** `server/db/migrations/risk-module-migration.sql`
- **Problem:** The SQL migration preserves `legacy_owner_text` but does not attempt fuzzy matching of owner names to resources. The blueprint says "FK matching done by application-level migration script" but no such script is present in the reviewed files.
- **Expected:** An application script that fuzzy-matches legacy owner text to resource names and sets `owner_resource_id`.
- **Fix suggestion:** Create a one-time migration script (e.g., `server/scripts/migrate-risk-owners.ts`) that reads `legacy_owner_text`, fuzzy-matches against resources in the venture's assignments, and updates `owner_resource_id`. Log unmatched entries.

### WARN-4: Owner resource picker is not searchable (FR-RO-2)
- **Location:** `client/src/pages/RisksPage.tsx` lines 577-583
- **Problem:** FR-RO-2 specifies a "searchable dropdown" for owner selection. The implementation uses a standard `<Select>` element, which is a basic dropdown without search/filter capability.
- **Expected:** A searchable/filterable dropdown (combobox pattern).
- **Fix suggestion:** Replace with a combobox-style component that allows typing to filter the resource list. Given NFR-8 (no new frameworks), implement a simple search-as-you-type pattern with a filtered list.

---

## Passed Checks

1. Risk scoring: likelihood 1-5 x impact 1-5 = score 1-25, persisted -- PASS
2. Risk weight 1-5 with default 3 -- PASS
3. RAG auto-derivation from score bands + ragOverride respected -- PASS
4. Owner is FK to resources, not varchar -- PASS
5. Heatmap endpoint returns correct grouping by likelihood/impact for open risks -- PASS
6. RACI schema: per-workstream, unique constraint, max 1 accountable enforced at app level -- PASS
7. RACI standalone page with matrix view -- PASS
8. Plan page compact RACI badges with truncation and navigation link -- PASS
9. Route `/venture/:ventureId/raci` and RACI nav tab exist in correct position -- PASS
10. Access control: GM read-only enforced on both risk and RACI mutations, PM scoped to own venture, PMO full access -- PASS
11. Audit logging on risk create/update and RACI assign/remove/bulkUpdate -- PASS
12. Build passes: vite build and tsc --noEmit both clean -- PASS
13. Dashboard integration: PM gets topRiskScore + weightedExposure, GM gets riskCountByBand + topRiskScore, PMO gets portfolioRiskSummary -- PASS
14. Export includes new risk fields with resolved owner names -- PASS
15. CSS variables `--risk-green/yellow/amber/red/dark-red` defined in theme -- PASS
16. Score bands and `getScoreBand` consistent across shared/enums.ts, risks.ts, dashboard.ts, RisksPage.tsx -- PASS
17. Heatmap cell click filtering and clear filter functionality -- PASS
18. Risk form: likelihood/impact selectors, weight selector, score preview, RAG override toggle, owner picker, escalation path -- PASS
19. RACI resource removal warning indicator (amber `!` when resource not venture-assigned) -- PASS
20. RACI duplicate assignment constraint handled with clear error message -- PASS
21. Zero-risk edge case: weighted exposure returns 0, heatmap renders empty -- PASS

---

## Verdict Justification

Two FAIL findings and four WARN findings.

**FAIL-1** (missing risk list filters) is a clear gap against FR-RL-2 -- the requirements explicitly call for filter controls by score band, owner, and status with AND logic. The current implementation only supports heatmap-based filtering.

**FAIL-2** (migration mapping discrepancy) needs stakeholder clarification. The blueprint says `low=1` (user-confirmed), the requirements say `low=2`. If the blueprint is authoritative (post-user-confirmation), then the requirements doc needs updating and this becomes a documentation fix rather than a code fix. If requirements are authoritative, the migration SQL and blueprint need correction. Either way, the discrepancy must be resolved before deployment.

**WARN-2** (missing RACI Responsible gate on workstream transitions) is a requirements gap that affects governance. It should be addressed but does not block core functionality.

The remaining WARNs (owner sort/date sort missing, no FK migration script, non-searchable owner picker) are quality gaps that should be fixed but do not break core workflows.
