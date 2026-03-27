# Requirements Document — Risk Module Overhaul + RACI Matrix

**Date:** 2026-03-27
**Status:** Draft
**Author:** BA Agent
**Program Brief:** /docs/risk-module-overhaul/pm/pm-brief-risk-module-overhaul.md

---

## 1. Overview

This initiative replaces the qualitative risk module (low/medium/high enums) with a quantitative scoring model (Likelihood 1-5 x Impact 1-5 = Score 1-25), adds per-risk weighting, introduces a 5x5 heatmap visualization, and migrates the free-text owner field to a resource foreign key. Separately, it introduces a RACI matrix at the workstream level — a new `workstream_raci_assignments` table, a standalone RACI page accessible from the venture tab bar, and a compact RACI summary embedded in the Plan page. A comprehensive user manual covering all platform modules is delivered as the final phase.

The combined effect: risk management becomes a quantitative decision-support tool with clear ownership, and workstream accountability becomes structured and auditable.

---

## 2. Organizational Context

The current risk module captures risks with text-based probability/impact enums (`low`, `medium`, `high`), a free-text owner field, and a manually-set RAG rating. This makes cross-venture risk comparison unreliable and prevents objective prioritization. The platform has no workstream accountability matrix — there is no structured way to record who is Responsible, Accountable, Consulted, or Informed per workstream.

These are standard PMO capabilities. Their absence reduces the platform's credibility as a governance tool for the GM and PMO Lead. The existing audit trail infrastructure (`audit_trail` table, `logAudit`/`logAuditDiff` services) supports tracking changes to both risk fields and new RACI assignments without additional audit plumbing.

The platform uses React + tRPC + Drizzle ORM + PostgreSQL + Tailwind CSS. The venture tab bar (`Shell.tsx` `ventureTabs` array) currently has: Plan, Gantt, Resources, Budget, Progress, Risks. The RACI page will be added as a new tab. Routes are defined in `App.tsx` under `/venture/:ventureId/`.

---

## 3. Stakeholders & Users

| Stakeholder | Role | How They Use This | Access Level |
|---|---|---|---|
| General Manager (GM) | Executive sponsor | Views heatmap to assess risk concentration per venture. Views RACI to see accountability. No data entry. | Read-only on all risk and RACI data |
| PMO Lead | Portfolio governance | Compares risk scores and weighted exposure across ventures. Reviews RACI completeness. Edits risks and RACI across all ventures. | Full read/write on all ventures |
| Project Manager (PM) | Day-to-day operator | Scores risks, assigns owners and weights, manages mitigation plans. Creates and manages RACI assignments for own venture's workstreams. | Full read/write on own venture only |

**Access control rules (existing pattern):**
- GM: `user.role === 'gm'` — read-only, no create/update/delete mutations
- PMO: `user.role === 'pmo'` — full access to all ventures
- PM: `user.role === 'pm'` — full access only where `venture.pmUserId === user.id` (enforced by existing `assertVentureReadAccess` in `server/routers/risks.ts`)

---

## 4. Functional Requirements

### Risk Scoring

| ID | Requirement | Acceptance Criteria |
|---|---|---|
| FR-RS-1 | Replace `probability` enum (low/medium/high) with an integer field `likelihood` (1-5). | Column type is `integer`, constrained 1-5. Old enum column is removed after migration. |
| FR-RS-2 | Replace `impact` enum (low/medium/high) with an integer field `impact` (1-5). | Column type is `integer`, constrained 1-5. Old enum column is removed after migration. |
| FR-RS-3 | Compute `risk_score` as `likelihood * impact` (range 1-25). Stored as a persisted column or computed at application level. | Every risk record has an accurate `risk_score` value equal to `likelihood * impact`. |
| FR-RS-4 | Display labeled 1-5 selectors for likelihood and impact in the risk create/edit form. Labels: 1=Rare/Negligible, 2=Unlikely/Minor, 3=Possible/Moderate, 4=Likely/Major, 5=Almost Certain/Severe. | Form renders five options per dimension with correct labels. Selected value persists on save. |
| FR-RS-5 | Display the computed risk score prominently on each risk card, color-coded by score band. | Score is visible on every risk card. Color matches the band thresholds defined in FR-HM-2. |

### Risk Weighting

| ID | Requirement | Acceptance Criteria |
|---|---|---|
| FR-RW-1 | Add a `weight` integer field (1-5) per risk, default 3. Represents relative importance. | Column exists, constrained 1-5, defaults to 3. |
| FR-RW-2 | Display a weight input (1-5 selector) on the risk create/edit form. | Weight is selectable and persists on save. |
| FR-RW-3 | Calculate and display a **weighted risk exposure** summary per venture: `SUM(risk_score * weight) / SUM(weight)` for all open risks. | Summary value is displayed on the Risks page header area. Value recalculates when any risk's score, weight, or status changes. |

### Risk Owner & Escalation

| ID | Requirement | Acceptance Criteria |
|---|---|---|
| FR-RO-1 | Replace the free-text `owner` varchar field with `owner_resource_id` as a nullable foreign key to `resources.id`. | Column references `resources(id)`. Existing free-text values are migrated (see FR-MIG-3). |
| FR-RO-2 | The risk create/edit form presents a searchable dropdown of resources assigned to the venture (via `resource_assignments` table, active resources only). | Dropdown shows only resources with an active assignment to the current venture. |
| FR-RO-3 | Display the resource name (resolved from the FK) on risk cards and list views instead of raw text. | Owner shows as a resolved name, not an ID or raw string. |
| FR-RO-4 | Add an `escalation_path` text field to the risks table. | Column exists. Editable in the risk form. Displayed on risk detail/card when populated. |
| FR-RO-5 | Retain the existing `escalated` boolean flag and escalation behavior. | No regression in escalation toggle functionality. |

### RAG Rating

| ID | Requirement | Acceptance Criteria |
|---|---|---|
| FR-RAG-1 | Auto-derive RAG from `risk_score`: 1-4 = green, 5-12 = amber, 13-25 = red. | RAG is set automatically on create and on score change. Derived value matches the threshold table. |
| FR-RAG-2 | Retain `rag_override` boolean. When true, the user-set RAG persists regardless of score changes. | Manual RAG override is preserved across score edits. Override flag is togglable in the form. |
| FR-RAG-3 | Update the existing `deriveRag` function in `shared/enums.ts` to accept numeric likelihood/impact and return RAG based on the computed score. | Function signature changes. All call sites updated. Unit-testable. |

### 5x5 Heatmap

| ID | Requirement | Acceptance Criteria |
|---|---|---|
| FR-HM-1 | Render a 5x5 grid with Likelihood (1-5) on the Y-axis (bottom to top) and Impact (1-5) on the X-axis (left to right). | Grid renders 25 cells with correct axis labels. |
| FR-HM-2 | Color-code cells by inherent risk score using five zones: 1-4 green (`--risk-green`), 5-8 yellow (`--risk-yellow`), 9-12 amber (`--risk-amber`), 13-19 red (`--risk-red`), 20-25 dark-red (`--risk-dark-red`). | Each cell background matches the correct zone color. New CSS variables are defined in the design system. |
| FR-HM-3 | Display a count badge in each cell showing the number of open risks at that likelihood/impact intersection. | Badge shows correct count. Empty cells show no badge or "0" (design decision for Architect). |
| FR-HM-4 | Clicking a heatmap cell filters the risk list below to show only risks at that likelihood/impact combination. | Click filters list. Clicking again (or a "clear filter" control) removes the filter. |
| FR-HM-5 | Heatmap is rendered per venture on the Risks page. | Heatmap appears above the risk list on the venture Risks page. |
| FR-HM-6 | (Stretch) Portfolio-level heatmap on GM and PMO dashboards aggregating all ventures. | Aggregate counts across all ventures. Cell click navigates to filtered view or expands detail. |

### Risk List Enhancements

| ID | Requirement | Acceptance Criteria |
|---|---|---|
| FR-RL-1 | Risk list is sortable by: score (default, descending), weight, status, owner name, created date. | Column headers or sort controls allow toggling sort. Default sort is score descending. |
| FR-RL-2 | Risk list is filterable by: score band (green/yellow/amber/red/dark-red), owner, status. | Filter controls are present. Filters combine (AND logic). Active filters are visually indicated. |
| FR-RL-3 | Risk cards display: title, score (with color badge), likelihood label, impact label, weight, owner name, RAG indicator, status, escalated flag. | All fields visible on each risk card. |

### RACI Matrix — Schema & Data

| ID | Requirement | Acceptance Criteria |
|---|---|---|
| FR-RACI-1 | Create a `workstream_raci_assignments` table with columns: `id` (uuid PK), `workstream_id` (FK to workstreams), `resource_id` (FK to resources), `raci_role` (enum: responsible, accountable, consulted, informed), `created_by` (FK to users), `created_at`, `updated_at`. | Table exists with all columns and correct FK constraints. |
| FR-RACI-2 | Add a unique constraint on `(workstream_id, resource_id, raci_role)` to prevent duplicate assignments. | Duplicate insert is rejected at DB level. |
| FR-RACI-3 | Enforce: at most one resource with `accountable` role per workstream. | Application-level validation rejects a second Accountable assignment. Clear error message returned. |
| FR-RACI-4 | Enforce: at least one resource with `responsible` role per workstream before the workstream can be marked `in_progress` or `complete`. | Validation fires on workstream status transition. Workstreams without a Responsible cannot advance. Workstreams can exist in `not_started` without a Responsible. |
| FR-RACI-5 | Multiple resources may hold the `responsible` role for one workstream. | No cardinality constraint on Responsible. |
| FR-RACI-6 | Multiple resources may hold `consulted` or `informed` roles per workstream. | No cardinality constraint on Consulted or Informed. |

### RACI Matrix — Standalone Page

| ID | Requirement | Acceptance Criteria |
|---|---|---|
| FR-RACI-7 | Add a "RACI" tab to the venture tab bar (in `Shell.tsx` `ventureTabs`), positioned after Plan and before Gantt. Route: `/venture/:ventureId/raci`. | Tab is visible, navigates to the RACI page. |
| FR-RACI-8 | The RACI page displays a matrix: rows = workstreams, columns = R, A, C, I. Each cell shows assigned resource name(s). | Matrix renders with all venture workstreams as rows and four RACI columns. |
| FR-RACI-9 | PM and PMO users can add/remove RACI assignments via inline controls (dropdown or popover to select a resource, per cell). | Click on a cell opens a resource picker scoped to venture-assigned, active resources. Selecting a resource creates the assignment. Removing clears it. |
| FR-RACI-10 | GM users see the RACI page as read-only. No add/remove controls are rendered. | GM role cannot trigger any mutation. UI shows data only. |
| FR-RACI-11 | Empty state: if no workstreams exist, show a message directing the user to create workstreams on the Plan page first. | Empty state message renders with a link/button to the Plan page. |
| FR-RACI-12 | Resource picker only shows resources with an active `resource_assignments` entry for the current venture. | Resources not assigned to this venture do not appear in the picker. |

### RACI Matrix — Plan Page Compact View

| ID | Requirement | Acceptance Criteria |
|---|---|---|
| FR-RACI-13 | The Plan page (`ProjectPlanPage`) displays a compact RACI summary for each workstream row. | Each workstream row shows RACI data inline. |
| FR-RACI-14 | Compact view format: show resource initials or short names under R/A/C/I column headers, truncated if more than 2 resources per role. | Compact, does not break the plan layout. Overflow handled gracefully. |
| FR-RACI-15 | Compact view links to the full RACI page for editing. A "Manage RACI" link or icon navigates to `/venture/:ventureId/raci`. | Link is present and navigates correctly. |
| FR-RACI-16 | Compact view is read-only for all roles (editing happens on the standalone RACI page). | No inline editing controls on the Plan page compact view. |

### Data Migration

| ID | Requirement | Acceptance Criteria |
|---|---|---|
| FR-MIG-1 | Migrate existing `probability` enum values to `likelihood` integers: low=2, medium=3, high=5. | All existing rows have correct integer values after migration. No nulls. |
| FR-MIG-2 | Migrate existing `impact` enum values to `impact` integers: low=2, medium=3, high=5. | All existing rows have correct integer values after migration. No nulls. |
| FR-MIG-3 | Migrate existing `owner` varchar values: attempt fuzzy match to `resources.name` within the venture's resource assignments. Unmatched values are logged and `owner_resource_id` is set to null, with the original text preserved in a `legacy_owner_text` field. | Matched owners have correct FK. Unmatched owners have null FK and original text preserved. Migration log produced. |
| FR-MIG-4 | Compute and populate `risk_score` for all migrated risks. | Every risk has `risk_score = likelihood * impact` after migration. |
| FR-MIG-5 | Set default `weight = 3` for all existing risks. | All existing risks have weight 3 after migration. |
| FR-MIG-6 | Recalculate RAG for all migrated risks (unless `rag_override = true`). | Non-overridden risks have RAG matching the new score-based derivation. Overridden risks retain their existing RAG. |
| FR-MIG-7 | Migration is non-destructive. Must be tested against a production data snapshot before deployment. Backup is mandatory before execution. | Rollback script exists. Backup confirmed before deploy. |

### Dashboard Integration

| ID | Requirement | Acceptance Criteria |
|---|---|---|
| FR-DASH-1 | PM Dashboard: replace `openRisksCount` with **highest risk score** and **weighted exposure** for the venture. | Dashboard shows numeric score values, color-coded. |
| FR-DASH-2 | GM Dashboard: replace the simple "Open: N / Escalated: N" risk summary per venture with **risk count by score band** (e.g., "3 red, 5 amber, 2 green") and **top risk score**. | Drawer section shows band breakdown and highest score. |
| FR-DASH-3 | PMO Dashboard: add a **portfolio risk summary** row or card showing aggregate risk counts by band across all ventures. | Summary is visible on the PMO dashboard. |

### User Manual

| ID | Requirement | Acceptance Criteria |
|---|---|---|
| FR-MAN-1 | Comprehensive user manual covering all platform modules: Dashboard, Plan, Gantt, Resources, Budget, Progress, Risks, RACI, Issues, Blockers, Approvals, Configuration, Activity. | Every module has a section with step-by-step instructions. |
| FR-MAN-2 | Manual is accessible from within the application via a help icon or "User Guide" link. | Link/icon is visible in the Shell (sidebar or header). Clicking opens the manual. |
| FR-MAN-3 | Manual is authored after all UI features are finalized (Phase 7). | Manual content reflects the final state of the UI including all changes from this initiative. |
| FR-MAN-4 | Manual includes screenshots or annotated UI descriptions for each module. | Visual aids are present for key workflows. |

### Sidebar / Navigation

| ID | Requirement | Acceptance Criteria |
|---|---|---|
| FR-NAV-1 | Add "RACI" to `ventureTabs` in `Shell.tsx`, positioned after "Plan" (index 1). | Tab renders in correct position for all roles. |
| FR-NAV-2 | Add route `/venture/:ventureId/raci` in `App.tsx` pointing to the new RACI page component. | Route resolves. Component renders. |
| FR-NAV-3 | Add a "User Guide" or help link in the sidebar footer or header area (below user profile). | Link is visible and opens the user manual. |

---

## 5. Reporting & Data Requirements

- **Data sources:**
  - `risks` table (modified schema) — likelihood, impact, risk_score, weight, owner_resource_id, escalation_path
  - `resources` table — name, roleTitle, active status
  - `resource_assignments` table — venture-scoped resource membership
  - `workstreams` table — workstream list per venture
  - `workstream_raci_assignments` table (new) — RACI mappings
  - `audit_trail` table — change tracking for risk and RACI mutations

- **Metrics / KPIs:**
  - Per-risk: risk score (1-25), weight (1-5)
  - Per-venture: weighted risk exposure (`SUM(score * weight) / SUM(weight)` for open risks), risk count by score band, highest risk score, RACI completeness percentage (workstreams with at least Responsible assigned / total workstreams)
  - Portfolio (stretch): aggregate risk band distribution across all ventures

- **Reporting cadence:** Live / real-time (dashboard updates on data change via tRPC query invalidation)

- **Format:** In-app dashboard cards, heatmap visualization, RACI matrix table, sortable/filterable risk list

---

## 6. Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR-1 | **Performance:** Heatmap and risk list must render within 500ms for ventures with up to 100 risks. RACI matrix must render within 500ms for ventures with up to 50 workstreams and 200 assignments. |
| NFR-2 | **Dark theme:** All new UI components must use existing design system CSS variables (`--surface-0`, `--surface-1`, `--text-0`, `--text-2`, `--text-3`, `--accent`, `--border`, etc.). No hardcoded light-theme colors. |
| NFR-3 | **New CSS variables:** Define `--risk-green`, `--risk-yellow`, `--risk-amber`, `--risk-red`, `--risk-dark-red` for heatmap cell colors within the existing theme file. |
| NFR-4 | **Responsive:** All new pages must be usable at 1024px viewport width minimum. No mobile-specific layouts required. |
| NFR-5 | **Audit trail:** All create/update/delete operations on risks (including new fields) and RACI assignments must produce `audit_trail` entries using the existing `logAudit`/`logAuditDiff` services. |
| NFR-6 | **Data integrity:** Foreign key constraints enforced at DB level. Application-level validation matches DB constraints (fail fast before hitting DB). |
| NFR-7 | **Backward compatibility:** API changes must not break existing clients during migration. If enum fields are removed, the tRPC router input schemas must be updated atomically with the migration. |
| NFR-8 | **No new frameworks:** No new UI frameworks or major dependencies. Heatmap must be built with CSS Grid or a lightweight approach. No D3, Chart.js, or similar heavy libraries for the heatmap. |

---

## 7. Governance & Workflow

- **Risk mutations:** PM and PMO roles can create, update, and delete risks. GM is read-only. This follows the existing pattern in `server/routers/risks.ts` (`assertVentureReadAccess` + GM check).
- **RACI mutations:** Same access pattern — PM (own venture) and PMO (all ventures) can create/update/delete assignments. GM is read-only.
- **Audit trail:** All risk field changes and RACI assignment changes are logged to `audit_trail` with entity type, field name, old value, new value, and changed-by user. This uses the existing `logAuditDiff` pattern.
- **Approval workflow:** No approval workflow is required for risk or RACI changes. Direct edits are acceptable (consistent with current risk module behavior).
- **Migration approval:** Schema migration requires manual confirmation before execution against production (Risk Gate per HERALD protocol).

---

## 8. Acceptance Criteria

### Risk Module
1. A new risk can be created with likelihood (1-5), impact (1-5), weight (1-5), and owner (selected from venture resources). Risk score is computed and displayed.
2. Editing likelihood or impact recalculates the score and auto-updates RAG (unless overridden).
3. The 5x5 heatmap renders with correct color zones and accurate risk counts per cell. Clicking a cell filters the list.
4. The risk list sorts by score (descending) by default and can be sorted by weight, status, owner, and date.
5. The risk list can be filtered by score band, owner, and status. Filters combine with AND logic.
6. Weighted risk exposure is displayed per venture and updates in real-time.
7. All existing risks are migrated with correct integer scores, weight defaults, and owner FK mappings (where matchable).
8. Dashboard cards on PM, PMO, and GM dashboards reflect the new scoring data.

### RACI Matrix
9. The RACI tab appears in the venture tab bar after Plan.
10. The standalone RACI page displays a workstream-by-RACI-role matrix with correct data.
11. PM/PMO can add and remove RACI assignments. GM sees read-only.
12. At most one Accountable per workstream is enforced. Attempting a second returns a clear error.
13. Workstreams cannot transition to `in_progress` or `complete` without at least one Responsible.
14. The Plan page compact RACI view shows assignments inline per workstream and links to the full RACI page.
15. Empty states are handled: no workstreams shows a prompt; no assignments shows placeholder text.

### User Manual
16. Manual is accessible from within the app via a persistent link.
17. Manual covers every module with step-by-step instructions.
18. Manual is authored after all UI changes are complete.

---

## 9. Edge Cases & Error Scenarios

| Scenario | Expected Behavior |
|---|---|
| Risk created with likelihood=1, impact=1 (minimum score) | Score=1, RAG=green. Heatmap cell (1,1) increments. |
| Risk created with likelihood=5, impact=5 (maximum score) | Score=25, RAG=red. Heatmap cell (5,5) increments. |
| Owner resource is deactivated after assignment | Risk retains the FK. Owner name still displays (resource name lookup). Resource no longer appears in the picker for new assignments. |
| Owner resource is deleted from venture assignments | Risk retains the FK (resource still exists, just unassigned from venture). Owner name still displays. Resource no longer appears in picker. |
| Risk owner field is null | Display "Unassigned" in the owner column. No errors. |
| RACI: attempt to assign a second Accountable to a workstream | Mutation returns a validation error. UI displays: "Only one Accountable is allowed per workstream." |
| RACI: workstream is deleted while RACI assignments exist | Cascade delete RACI assignments (FK with ON DELETE CASCADE) or block deletion with a clear error. Architect to decide cascade vs. protect. |
| RACI: resource is removed from venture while holding RACI assignments | RACI assignments remain (referential integrity preserved — resource still exists). Surface a warning on the RACI page: "Resource X is no longer assigned to this venture." |
| Migration: existing risk has owner text that matches no resource | `owner_resource_id` set to null. `legacy_owner_text` preserves original value. Migration log records the unmatched entry. |
| Migration: existing risk has null probability or impact | Should not occur (columns are NOT NULL in current schema). If encountered, default to likelihood=3, impact=3. |
| Heatmap: venture has zero open risks | Heatmap renders with all cells showing zero/empty. No errors. |
| Heatmap cell click with zero risks | Filter applies but list shows "No risks match this filter." |
| RACI page: venture has zero workstreams | Empty state message: "No workstreams defined. Create workstreams in the Plan page first." with link. |
| Weight set to boundary values (1 or 5) | Accepted. Weighted exposure recalculates correctly. |
| Concurrent edits: two users edit the same risk simultaneously | Last write wins (existing pattern). Audit trail captures both changes. No optimistic locking required for this initiative. |

---

## 10. Out of Scope

- Monte Carlo simulation or probabilistic risk modeling
- Risk interdependency mapping (risk-to-risk causal relationships)
- External risk data feeds or third-party integrations
- Per-risk RACI assignments (RACI is a workstream-level tool only)
- Automated risk scoring suggestions or AI-based risk assessment
- Mobile-specific layouts (responsive design at 1024px+ is sufficient)
- Notification or email alerts for risk threshold breaches
- Changes to the Issues or Blockers sub-modules (beyond shared component updates)
- Optimistic locking or conflict resolution for concurrent edits
- Risk categories/types taxonomy (common in PMO practice but not requested — candidate for future initiative)
- Historical risk score trend tracking over time (current-state is sufficient for this initiative)

---

## 11. Dependencies

| Dependency | Type | Status | Risk |
|---|---|---|---|
| `resources` table and `resource_assignments` table | Data | Exists | Resources must be populated and assigned to ventures for owner picker and RACI picker to be useful. |
| `workstreams` table | Data | Exists | Workstreams must exist before RACI assignments can be created. |
| `risks` table, `risksRouter` tRPC routes | Code | Exists — will be modified | All current API consumers (RisksPage, dashboards) must be updated atomically with schema changes. |
| `Shell.tsx` venture tabs, `App.tsx` routes | Code | Exists — will be modified | New RACI tab and route must be added. |
| `shared/enums.ts` — `RISK_PROBABILITY`, `RISK_IMPACT`, `deriveRag` | Code | Exists — will be replaced | Enum constants replaced with numeric scales. `deriveRag` rewritten for numeric input. All import sites updated. |
| `audit_trail` table and `logAudit`/`logAuditDiff` services | Code | Exists | Used as-is for risk and RACI audit logging. Entity types: `risk`, `workstream_raci_assignment`. |
| Drizzle ORM migration tooling (`drizzle-kit`) | Tooling | Exists | Must support enum-to-integer column migration. May require a raw SQL migration step if Drizzle cannot express the type change declaratively. |
| Design system CSS variables | Code | Exists | Five new `--risk-*` color variables needed. Must be added to the existing theme definition. |
| All modules stable (for user manual) | Process | Pending | User manual (Phase 7) cannot be authored until all UI changes from all phases are complete and finalized. |

---

## 12. Open Questions

| # | Question | Impact | Suggested Resolution |
|---|---|---|---|
| OQ-1 | Should `risk_score` be a persisted DB column or computed at application/query level? Persisted is simpler for sorting/filtering but requires keeping it in sync. | Schema design | Recommend persisted column, updated via application logic on every likelihood/impact write. Simpler queries, negligible sync risk given single-writer pattern. |
| OQ-2 | Should the portfolio-level heatmap (FR-HM-6) be included in this initiative or deferred? | Scope | PM Brief marks it as stretch. Recommend deferring to keep scope focused. Build the per-venture heatmap composable so portfolio aggregation is easy to add later. |
| OQ-3 | RACI: should deleting a workstream cascade-delete its RACI assignments, or should deletion be blocked if assignments exist? | Data integrity | Recommend CASCADE. RACI assignments have no independent value without their workstream. Cascade is the standard pattern for join tables. |
| OQ-4 | What format should the user manual take — in-app route, external HTML, or PDF? | UX / implementation | PM Brief says "accessible from within the application." Recommend a dedicated `/guide` route rendering markdown content, consistent with the app's SPA architecture. |
| OQ-5 | Should the `riskImpactEnum` used by the `issues` table (`severity` column) also be migrated to integer, or left as-is? | Schema scope | Recommend leaving issues severity as-is. It is out of scope per PM Brief. Migrating it would expand scope into the Issues module. |
| OQ-6 | Should the deprecated `risk_probability` and `risk_impact` PostgreSQL enum types be dropped from the database after migration, or left dormant? | DB hygiene | Recommend dropping after confirming no other tables reference them. `issues.severity` uses `riskImpactEnum` — this blocks dropping `risk_impact` enum. Leave `risk_impact` enum. Drop `risk_probability` enum only. |
