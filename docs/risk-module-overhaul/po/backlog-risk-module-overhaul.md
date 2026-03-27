# Product Backlog — Risk Module Overhaul + RACI Matrix

**Date:** 2026-03-27
**Author:** PO Agent
**Program Brief:** /docs/risk-module-overhaul/pm/pm-brief-risk-module-overhaul.md
**Requirements Doc:** /docs/risk-module-overhaul/ba/requirements-risk-module-overhaul.md

## MVP Scope Summary

The MVP delivers the quantitative risk scoring engine (likelihood x impact = score 1-25), per-risk weighting, resource-linked ownership, the 5x5 heatmap, enhanced risk list sorting/filtering, and the full data migration of existing risks. Alongside that, it delivers the RACI schema, standalone RACI page with full CRUD, the Plan page compact RACI view, and the venture tab bar update. This boundary was chosen because these capabilities are the core governance gap identified in the PM Brief — without numeric scoring and structured accountability, the platform cannot function as a credible PMO decision-support tool. Dashboard integration, the portfolio-level heatmap, and the user manual are deferred because they depend on the core being stable first and add presentation value rather than functional capability.

## What Is Deferred and Why

| Item | Priority | Rationale |
|---|---|---|
| PM Dashboard risk score integration (FR-DASH-1) | P2 | High value but dependent on risk scoring being stable. Can ship in a fast follow. |
| GM Dashboard risk band breakdown (FR-DASH-2) | P2 | Same dependency. GM currently has read-only visibility via the heatmap. |
| PMO Dashboard portfolio risk summary (FR-DASH-3) | P2 | Requires aggregation logic across ventures. Heatmap per-venture covers the immediate need. |
| Portfolio-level heatmap (FR-HM-6) | P3 | PM Brief marks as stretch. Per-venture heatmap satisfies the primary use case. Build composable so aggregation is easy later. |
| User manual — all modules (FR-MAN-1 through FR-MAN-4) | P3 | Must be authored after all UI is finalized (Phase 7). Cannot start until all other work is complete. |
| User Guide sidebar link (FR-NAV-3) | P3 | Blocked by user manual delivery. No content to link to yet. |

---

## Prioritized Backlog

### P0 — Must Ship

#### [US-001] Risk scoring schema migration — enum to integer
**As a** PM, **I want** risk likelihood and impact stored as integers (1-5) with a computed risk score (1-25), **so that** I can prioritize risks objectively using numeric values instead of vague text labels.

**Acceptance Criteria:**
- Given the existing risks table, when the migration runs, then `probability` enum is replaced by `likelihood` integer (1-5) and `impact` enum is replaced by `impact` integer (1-5)
- Given a risk with likelihood=3 and impact=4, when saved, then `risk_score` is persisted as 12
- Given the migration has run, then no null values exist in likelihood, impact, or risk_score columns
- Edge case: given an existing risk with probability=null (should not occur per schema), when migrated, then default to likelihood=3, impact=3, risk_score=9

**Out of scope:** UI changes (covered by US-003). Dashboard updates.
**Estimated complexity:** L
**Depends on:** none

---

#### [US-002] Risk weight field
**As a** PM, **I want** to assign a weight (1-5) to each risk, **so that** I can indicate which risks are more significant and see a weighted exposure summary for my venture.

**Acceptance Criteria:**
- Given the risk create/edit form, when I set weight to 4, then the value persists and displays on the risk card
- Given a venture with three open risks (scores 10, 15, 20; weights 2, 5, 3), when I view the Risks page header, then weighted exposure displays as `(10*2 + 15*5 + 20*3) / (2+5+3) = 15.5`
- Given all existing risks after migration, when I view any risk, then weight defaults to 3
- Edge case: given a venture with zero open risks, when I view the weighted exposure, then it displays 0 or "N/A" (not a division-by-zero error)

**Out of scope:** Weight normalization across ventures. Portfolio-level weighted exposure.
**Estimated complexity:** M
**Depends on:** US-001

---

#### [US-003] Risk scoring UI — numeric selectors and score display
**As a** PM, **I want** to select likelihood and impact from labeled 1-5 selectors and see the computed score prominently on each risk card, **so that** scoring is intuitive and the result is immediately visible.

**Acceptance Criteria:**
- Given the risk create form, when I open the likelihood selector, then I see five options: 1=Rare, 2=Unlikely, 3=Possible, 4=Likely, 5=Almost Certain
- Given the risk create form, when I open the impact selector, then I see five options: 1=Negligible, 2=Minor, 3=Moderate, 4=Major, 5=Severe
- Given a risk card in the list, when rendered, then the score badge is visible and color-coded by band (1-4 green, 5-8 yellow, 9-12 amber, 13-19 red, 20-25 dark-red)
- Given I change likelihood from 3 to 5 on an existing risk, when I save, then the score recalculates and the color badge updates
- Edge case: given a risk with likelihood=1 and impact=1, when displayed, then score shows "1" with a green badge

**Out of scope:** Heatmap visualization (US-007). Weight display (covered by US-002 form).
**Estimated complexity:** M
**Depends on:** US-001

---

#### [US-004] Risk owner linked to resources
**As a** PM, **I want** to assign a risk owner from my venture's resource list instead of typing a name, **so that** ownership is unambiguous, traceable, and linked to real people.

**Acceptance Criteria:**
- Given the risk create/edit form, when I click the owner field, then a searchable dropdown shows only resources with an active assignment to the current venture
- Given I select "Jane Smith" as owner, when saved, then the risk stores `owner_resource_id` as a foreign key to the resources table
- Given a risk card, when displayed, then the owner shows as the resolved resource name (not an ID)
- Given the owner resource is later deactivated, when I view the risk, then the name still displays but the resource no longer appears in the picker for new assignments
- Edge case: given a risk with no owner assigned, when displayed, then the owner field shows "Unassigned"

**Out of scope:** Escalation path field (US-005). Migration of legacy owner text (US-010).
**Estimated complexity:** M
**Depends on:** US-001

---

#### [US-005] Risk escalation path field
**As a** PM, **I want** to document an escalation path for each risk, **so that** it is clear who to escalate to when a risk materializes or worsens.

**Acceptance Criteria:**
- Given the risk create/edit form, when I enter text in the escalation path field, then it persists on save
- Given a risk card with escalation path populated, when displayed, then the escalation path text is visible
- Given a risk card with no escalation path, when displayed, then no empty field or placeholder clutters the card
- Edge case: given escalation path text exceeding 500 characters, when saved, then it is accepted (text field, no artificial limit)

**Out of scope:** Automated escalation workflow. Escalation notifications.
**Estimated complexity:** S
**Depends on:** US-001

---

#### [US-006] RAG auto-derivation from risk score
**As a** PM, **I want** the RAG rating to auto-calculate from the risk score while still allowing manual override, **so that** RAG is consistent across all risks and I do not have to set it manually.

**Acceptance Criteria:**
- Given a risk with score 3 (and rag_override=false), when saved, then RAG is set to green
- Given a risk with score 10, when saved, then RAG is set to amber
- Given a risk with score 15, when saved, then RAG is set to red
- Given a risk with rag_override=true and RAG manually set to red, when I change the score from 20 to 5, then RAG remains red (override preserved)
- Given a risk with rag_override=true, when I toggle override off, then RAG recalculates from the current score
- Edge case: given the thresholds 1-4=green, 5-12=amber, 13-25=red, when a risk has score exactly 5, then RAG is amber (not green)

**Out of scope:** Custom threshold configuration per venture.
**Estimated complexity:** S
**Depends on:** US-001

---

#### [US-007] 5x5 risk heatmap per venture
**As a** GM, **I want** to see a 5x5 heatmap of risks for each venture, **so that** I can instantly identify where risk is concentrated without reading individual risk entries.

**Acceptance Criteria:**
- Given the venture Risks page, when loaded, then a 5x5 grid renders above the risk list with Likelihood (1-5) on the Y-axis (bottom to top) and Impact (1-5) on the X-axis (left to right)
- Given the grid, when rendered, then cells are color-coded: 1-4 green, 5-8 yellow, 9-12 amber, 13-19 red, 20-25 dark-red using `--risk-*` CSS variables
- Given a cell at position (likelihood=4, impact=3) with 2 open risks, when rendered, then the cell shows a count badge of "2"
- Given I click a cell at (3,4), when clicked, then the risk list below filters to show only risks with likelihood=3 and impact=4
- Given I click the same cell again (or a "clear filter" control), when clicked, then the filter is removed and all risks show
- Edge case: given a venture with zero open risks, when the heatmap renders, then all cells show empty (no badges) and no errors occur

**Out of scope:** Portfolio-level aggregate heatmap (P3). Print/export of heatmap.
**Estimated complexity:** L
**Depends on:** US-001, US-003

---

#### [US-008] Risk list sorting and filtering
**As a** PMO Lead, **I want** to sort the risk list by score, weight, status, owner, and date, and filter by score band, owner, and status, **so that** I can efficiently review and compare risks across ventures.

**Acceptance Criteria:**
- Given the risk list, when loaded, then it is sorted by score descending by default
- Given I click the "Weight" sort control, when clicked, then the list re-sorts by weight
- Given I select the "Red" score band filter, when applied, then only risks with scores 13-19 are shown
- Given I select the "Red" filter and also filter by owner "Jane Smith", when applied, then only red-band risks owned by Jane Smith show (AND logic)
- Given active filters, when rendered, then a visual indicator shows which filters are active
- Edge case: given all filters active with no matching risks, when rendered, then the list shows "No risks match the current filters"

**Out of scope:** Saved filter presets. Export filtered results.
**Estimated complexity:** M
**Depends on:** US-001, US-003, US-004

---

#### [US-009] RACI schema and backend
**As a** PM, **I want** a RACI data model linking workstreams to resources with RACI roles, **so that** accountability assignments are structured, enforced, and queryable.

**Acceptance Criteria:**
- Given the database, when migrated, then a `workstream_raci_assignments` table exists with columns: id (uuid PK), workstream_id (FK), resource_id (FK), raci_role (enum: responsible/accountable/consulted/informed), created_by (FK to users), created_at, updated_at
- Given a unique constraint on (workstream_id, resource_id, raci_role), when a duplicate assignment is inserted, then the database rejects it
- Given a workstream with one Accountable already assigned, when a second Accountable is attempted, then the application returns a validation error: "Only one Accountable is allowed per workstream"
- Given a workstream with no Responsible assigned, when a user attempts to change its status to in_progress, then the transition is blocked with a clear error message
- Given multiple resources assigned as Responsible to one workstream, when queried, then all are returned (no cardinality limit on R, C, or I)
- Edge case: given a workstream is deleted (with cascade), when queried, then all its RACI assignments are also deleted

**Out of scope:** RACI UI (US-011, US-012). Audit trail for RACI (covered by NFR-5 implementation).
**Estimated complexity:** M
**Depends on:** none

---

#### [US-010] Data migration — existing risks to new schema
**As a** PM, **I want** all existing risks migrated to the new numeric scoring model without data loss, **so that** I do not have to re-enter historical risk data.

**Acceptance Criteria:**
- Given existing risks with probability enum values, when migrated, then low=2, medium=3, high=5 for likelihood
- Given existing risks with impact enum values, when migrated, then low=2, medium=3, high=5 for impact
- Given existing risks with free-text owner, when migrated, then fuzzy-matched owners get `owner_resource_id` set and unmatched owners get null FK with original text preserved in `legacy_owner_text`
- Given all migrated risks, when queried, then `risk_score = likelihood * impact` for every row
- Given all migrated risks, when queried, then `weight = 3` for every row
- Given risks with rag_override=false, when migrated, then RAG is recalculated from the new score
- Edge case: given a migration failure, when detected, then a rollback script restores the original state with no data loss

**Out of scope:** Automated backfill of RACI data. Migration of issues/blockers modules.
**Estimated complexity:** L
**Depends on:** US-001, US-004, US-006

---

#### [US-011] RACI standalone page
**As a** PM, **I want** a dedicated RACI page accessible from the venture tab bar, **so that** I can create and manage RACI assignments per workstream in a clear matrix view.

**Acceptance Criteria:**
- Given the venture tab bar, when rendered, then a "RACI" tab appears after Plan and before Gantt, navigating to `/venture/:ventureId/raci`
- Given the RACI page, when loaded, then a matrix displays with workstream rows and R/A/C/I columns, showing assigned resource names in each cell
- Given I am a PM or PMO user, when I click a cell, then a resource picker opens showing only resources actively assigned to this venture
- Given I select a resource in the picker, when confirmed, then the assignment is created and the cell updates
- Given I am a GM, when the page loads, then no add/remove controls are rendered (read-only)
- Edge case: given a venture with zero workstreams, when the RACI page loads, then an empty state message displays: "No workstreams defined. Create workstreams in the Plan page first." with a link to the Plan page

**Out of scope:** Inline editing on the Plan page (US-012). Bulk assignment tools.
**Estimated complexity:** L
**Depends on:** US-009

---

#### [US-012] RACI compact view on Plan page
**As a** PMO Lead, **I want** a compact RACI summary displayed alongside each workstream on the Plan page, **so that** I can see accountability at a glance without navigating to a separate page.

**Acceptance Criteria:**
- Given the Plan page with workstreams, when loaded, then each workstream row shows RACI data inline under R/A/C/I column headers
- Given a workstream with 3 Consulted resources, when rendered, then the compact view shows the first 2 names truncated and indicates overflow (e.g., "+1 more")
- Given the compact view, when I click "Manage RACI" (link or icon), then I navigate to `/venture/:ventureId/raci`
- Given any user role, when viewing the compact RACI on the Plan page, then no inline editing controls are rendered (read-only for all roles on this view)
- Edge case: given a workstream with no RACI assignments, when rendered, then the RACI columns show a dash or "—" placeholder (not blank)

**Out of scope:** Full RACI editing on the Plan page. RACI completeness percentage indicator.
**Estimated complexity:** M
**Depends on:** US-009, US-011

---

### P1 — Should Ship

#### [US-013] Risk card display — all fields
**As a** PMO Lead, **I want** each risk card to display title, score (color-coded), likelihood label, impact label, weight, owner name, RAG indicator, status, and escalated flag, **so that** I can assess any risk at a glance without opening a detail view.

**Acceptance Criteria:**
- Given a risk card in the list, when rendered, then all fields are visible: title, score badge (colored), likelihood label, impact label, weight, owner name (or "Unassigned"), RAG indicator, status, escalated flag
- Given a risk with escalated=true, when rendered, then the escalated flag is visually distinct (icon or badge)
- Edge case: given a risk with all optional fields at default/null values, when rendered, then the card does not break layout

**Out of scope:** Risk detail modal or expanded view redesign.
**Estimated complexity:** M
**Depends on:** US-003, US-004

---

#### [US-014] Dashboard integration — PM, PMO, GM risk summaries
**As a** GM, **I want** my dashboard to show risk counts by score band and the top risk score per venture, **so that** I can assess portfolio risk posture without navigating into each venture.

**Acceptance Criteria:**
- Given the PM Dashboard, when loaded, then it shows the highest risk score and weighted exposure for the venture (replacing the old `openRisksCount`)
- Given the GM Dashboard venture drawer, when opened, then it shows risk count by score band (e.g., "3 red, 5 amber, 2 green") and the top risk score
- Given the PMO Dashboard, when loaded, then a portfolio risk summary row/card shows aggregate risk counts by band across all ventures
- Edge case: given a venture with zero risks, when the dashboard renders, then it shows "No risks" or "0" rather than breaking

**Out of scope:** Drill-down from dashboard to filtered risk list. Trend indicators.
**Estimated complexity:** M
**Depends on:** US-001, US-002, US-003

---

#### [US-015] RACI audit trail
**As a** PMO Lead, **I want** all RACI assignment changes logged to the audit trail, **so that** I can trace who changed accountability assignments and when.

**Acceptance Criteria:**
- Given a RACI assignment is created, when saved, then an audit_trail entry is created with entity_type="workstream_raci_assignment", action="create", and the assignment details
- Given a RACI assignment is deleted, when removed, then an audit_trail entry is created with action="delete" and the removed assignment details
- Edge case: given a bulk reassignment (e.g., removing a resource from all workstreams), when processed, then individual audit entries are created for each assignment change

**Out of scope:** Audit log UI for RACI (uses existing audit trail viewer). Audit diff for RACI role changes (assignments are created/deleted, not updated).
**Estimated complexity:** S
**Depends on:** US-009

---

#### [US-016] RACI — resource removal warning
**As a** PM, **I want** to see a warning on the RACI page when a resource is no longer assigned to the venture, **so that** I know the accountability matrix has stale entries that need attention.

**Acceptance Criteria:**
- Given a resource holds RACI assignments but has been removed from the venture's resource_assignments, when the RACI page loads, then a warning indicator appears next to that resource's name: "Resource X is no longer assigned to this venture"
- Given the warning is displayed, when I click the resource, then I can remove the stale assignment
- Edge case: given multiple stale resources, when the page loads, then all are flagged (not just the first)

**Out of scope:** Automatic removal of stale RACI assignments. Notification/email about stale assignments.
**Estimated complexity:** S
**Depends on:** US-011

---

### P2 — Nice to Have (this release, time permitting)

- **[US-017] CSS variables for risk score bands** — Define `--risk-green`, `--risk-yellow`, `--risk-amber`, `--risk-red`, `--risk-dark-red` in the theme file for consistent color use across heatmap, risk cards, and dashboards.
- **[US-018] RACI completeness indicator** — Show a percentage on the Plan page header: (workstreams with at least one Responsible) / (total workstreams).
- **[US-019] Risk list — "clear all filters" control** — Single button to reset all active filters and sorts to default.

### P3 — Deferred to v2

- **[US-020] Portfolio-level heatmap** — Aggregate heatmap across all ventures on GM/PMO dashboards. Deferred because per-venture heatmap covers the primary use case and portfolio aggregation adds complexity.
- **[US-021] User manual — all modules** — Comprehensive step-by-step guide for every platform module, accessible from within the app. Deferred because it must be authored after all UI changes are finalized (Phase 7 dependency) and represents a significant standalone effort.
- **[US-022] User Guide sidebar link** — Add a "User Guide" link in the sidebar/header. Blocked by the user manual content not yet existing.
- **[US-023] Historical risk score tracking** — Track risk score changes over time for trend analysis. Not requested for this initiative; current-state is sufficient.
- **[US-024] Risk categories/types taxonomy** — Categorize risks as technical, commercial, resource, compliance, etc. Common in PMO practice but not requested. Candidate for future initiative.

---

## Open Decisions

| # | Decision Needed | Impact | Recommendation |
|---|---|---|---|
| OD-1 | Should `risk_score` be a persisted DB column or computed at query time? | Schema design, query complexity | Persisted column. Simpler sorting/filtering queries. Updated on every likelihood/impact write. Negligible sync risk. |
| OD-2 | RACI workstream deletion — cascade or block? | Data integrity behavior | CASCADE delete RACI assignments when workstream is deleted. Assignments have no value without their workstream. |
| OD-3 | User manual format — in-app route, HTML, or PDF? | Implementation approach for Phase 7 | Dedicated `/guide` route rendering markdown. Consistent with SPA architecture. Deferred decision — does not block MVP. |
| OD-4 | Should deprecated PostgreSQL enum types (`risk_probability`) be dropped after migration? | DB hygiene | Drop `risk_probability` enum after confirming no other references. Leave `risk_impact` enum because `issues.severity` still uses it. |
| OD-5 | RAG threshold bands — confirmed as 1-4 green, 5-12 amber, 13-25 red? | Scoring consistency | The BA requirements doc specifies these bands. PM Brief suggested a 5-band approach for the heatmap. The heatmap uses 5 color bands; RAG uses the standard 3-band (green/amber/red). These are separate concerns — no conflict. |

## Notes for Architect

1. **Migration is the riskiest work item.** The enum-to-integer migration (US-001, US-010) should be spiked first. Drizzle ORM may not support declarative enum-to-integer column changes — plan for a raw SQL migration step. Test against a production data snapshot before deployment.

2. **Schema changes are atomic.** The tRPC router input schemas, Drizzle ORM schema, and UI forms must all be updated in the same deployment. There is no backward-compatible intermediate state where the old enum and new integer coexist in the API contract.

3. **RACI schema is independent.** The `workstream_raci_assignments` table (US-009) has no dependency on the risk schema changes. It can be built in parallel with the risk scoring work.

4. **Heatmap must be CSS Grid, not a charting library.** NFR-8 explicitly prohibits D3, Chart.js, or similar. Build with CSS Grid. The 5x5 grid is static — only the cell contents (count badges) and colors are dynamic.

5. **Access control follows existing patterns.** GM = read-only, PMO = full access all ventures, PM = full access own venture. The existing `assertVentureReadAccess` pattern in `server/routers/risks.ts` should be replicated for the RACI router.

6. **Audit trail uses existing infrastructure.** Both risk field changes and RACI assignment changes should use `logAudit`/`logAuditDiff` with entity types `risk` and `workstream_raci_assignment`. No new audit plumbing needed.

7. **New CSS variables needed.** Five `--risk-*` color variables must be added to the existing theme file for heatmap cells and score badges. These should be defined early so all components can reference them.

8. **Weighted exposure formula.** `SUM(risk_score * weight) / SUM(weight)` for open risks only. Handle the zero-risk case (display 0 or N/A, never divide by zero).

9. **Risk score persistence.** Recommend persisted `risk_score` column updated via application logic on every write to likelihood or impact. This simplifies sort/filter queries and avoids computed-column complexity in Drizzle ORM.

10. **RACI resource picker scope.** The picker must query `resource_assignments` filtered by venture ID and active status. Same pattern as the risk owner picker (US-004). Consider extracting a shared `VentureResourcePicker` component.
