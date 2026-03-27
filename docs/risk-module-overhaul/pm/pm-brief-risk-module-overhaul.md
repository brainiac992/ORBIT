# Program Brief — Risk Module Overhaul + RACI Matrix

**Date:** 2026-03-27
**Status:** Awaiting Approval
**Author:** PM Agent
**Initiative slug:** `risk-module-raci-matrix`

## 1. Executive Summary

This initiative delivers two distinct but related features: (1) a comprehensive risk module overhaul with numeric scoring (Likelihood x Impact, 1-25 scale), per-risk weighting, and a 5x5 heatmap visualization; and (2) a standalone RACI matrix tool applied at the workstream level, with a compact view embedded in the Plan page and a full dedicated RACI page accessible from the sidebar. The overhaul also includes a full user manual covering every platform module, delivered as the final phase. Together these features transform risk management from a qualitative logging exercise into a quantitative decision-support tool, and add structured accountability tracking per workstream across the portfolio.

## 2. Problem / Opportunity Statement

The current risk module is qualitative and shallow, and the platform lacks any workstream-level accountability matrix. Specific gaps:

- **No numeric scoring.** Probability and impact are captured as low/medium/high text enums with no numeric values. There is no computed risk score, making it impossible to rank or prioritize risks objectively.
- **No risk weighting.** All risks are treated as equally important regardless of their relative significance to the project.
- **No workstream accountability matrix.** There is no RACI matrix for workstreams. The platform has no structured way to define who is Responsible, Accountable, Consulted, or Informed for each workstream.
- **Risk owner is unstructured.** The risk owner field is a free-text string with no link to the resources table. Risks need a proper single-owner field and an escalation path, but NOT a per-risk RACI matrix (RACI is a workstream-level tool, not a risk-level tool).
- **No heatmap.** There is no visual representation of risk distribution across likelihood and impact dimensions. GM and PMO users lack a portfolio-level view of risk concentration.
- **No user manual.** The platform has no user-facing documentation. New users have no reference for how to use any module.

These gaps are experienced daily by all three user roles (GM, PMO, PM) and reduce the platform's value as a decision-support tool for portfolio governance.

## 3. Stakeholders

| Stakeholder | Role | Interest / Expectation |
|---|---|---|
| General Manager (GM) | Executive sponsor, read-only consumer | Portfolio-level risk visibility via heatmap. Workstream RACI visibility to see who is accountable for what. No data entry burden. |
| PMO Lead | Portfolio governance, cross-venture oversight | Consistent risk scoring across all ventures. RACI enforcement at the workstream level so accountability is traceable. Ability to compare risk posture across the portfolio. |
| Project Manager (PM) | Day-to-day risk owner, primary data entry | Intuitive scoring interface. Ability to assign RACI roles per workstream from the resource list. Clear mitigation tracking. Reduced ambiguity in risk prioritization. |

## 4. Success Metrics

- **SM-1:** Every risk has a numeric score (1-25) computed from Likelihood (1-5) x Impact (1-5) — 100% of new risks, backfill path for existing risks.
- **SM-2:** Every workstream has at least one RACI role assigned (Responsible is mandatory at creation).
- **SM-3:** 5x5 heatmap renders correctly with color-coded zones (green/yellow/amber/red/dark-red) and displays risk counts per cell.
- **SM-4:** Risk weighting is assignable per risk and feeds into a weighted risk exposure summary per venture.
- **SM-5:** User manual covers all platform modules with step-by-step instructions, published and accessible from the application.
- **SM-6:** Existing risks are migrated to the new scoring model without data loss (low=1, medium=3, high=5 default mapping, or user-defined).
- **SM-7:** RACI matrix page is accessible from the sidebar navigation and allows full CRUD of RACI assignments per workstream.
- **SM-8:** Plan page displays a compact/summary RACI view alongside workstreams.

## 5. Scope

**In scope:**

1. **Schema migration** — Replace `risk_probability` (low/medium/high) and `risk_impact` (low/medium/high) enums with integer fields (1-5). Add `risk_score` computed column or application-level calculation. Add `weight` numeric field (0.0-1.0 or 1-10). Retain RAG and RAG override.
2. **Risk owner and escalation** — Replace free-text owner with a proper resource reference (foreign key to resources table). Add escalation path field. The risk module does NOT have a RACI matrix — RACI is a workstream-level tool (see items 3-4).
3. **RACI matrix — standalone page** — New dedicated page accessible from the sidebar navigation. Full RACI management UI: create, edit, delete RACI assignments per workstream. Each assignment links a workstream to a resource with a RACI role enum (responsible/accountable/consulted/informed). Enforce at least one Responsible per workstream. Enforce at most one Accountable per workstream. Resources are drawn from the venture's resources table.
4. **RACI matrix — Plan page compact view** — Summary/compact RACI view embedded in the Plan page alongside workstreams. Read-oriented, showing assignments at a glance. Links to the standalone RACI page for editing.
5. **RACI schema** — New `workstream_raci_assignments` join table linking workstreams to resources with a RACI role enum (responsible/accountable/consulted/informed).
6. **Sidebar navigation** — Add a new nav item for the standalone RACI page.
7. **Risk scoring UI** — Replace dropdowns with 1-5 numeric selectors (with labels: 1=Rare/Negligible, 2=Unlikely/Minor, 3=Possible/Moderate, 4=Likely/Major, 5=Almost Certain/Severe). Display computed score prominently. Color-code by score band.
8. **Risk weighting UI** — Weight input per risk. Weighted exposure summary at venture level.
9. **5x5 Heatmap** — Interactive grid (Likelihood Y-axis, Impact X-axis). Color-coded zones. Clickable cells to filter risk list. Risk count badges per cell. Rendered per venture and (stretch) at portfolio level.
10. **Data migration** — Migrate existing enum values to integers. Provide sensible defaults. No data loss.
11. **Risk list enhancements** — Sortable by score, weight, status. Filterable by score band, owner.
12. **Dashboard integration** — Update PM, PMO, and GM dashboards to reference new risk scores where risks are summarized.
13. **User manual** — Comprehensive step-by-step guide for every platform module (not just risk). Authored as the final deliverable (Phase 7 / DOC-Agent). Accessible from within the application.

**Out of scope:**

- Monte Carlo simulation or probabilistic risk modeling
- Risk interdependency mapping (risk-to-risk relationships)
- External risk data feeds or integrations
- Changes to the Issues or Blockers sub-modules (beyond what is needed for consistency)
- Automated risk scoring suggestions or AI-based risk assessment
- Mobile-specific layouts (responsive is sufficient)
- Notification/email alerts for risk threshold breaches (future initiative)
- Per-risk RACI assignments (RACI is applied at the workstream level, not the risk level)

## 6. Constraints

- **Tech stack:** Must use existing React + tRPC + Drizzle ORM + PostgreSQL + Tailwind CSS stack. No new frameworks or libraries except charting if needed for heatmap (prefer CSS grid or lightweight solution).
- **Schema migration:** Must be backward-compatible. Existing risk data must survive migration. The platform is live — migration must be non-destructive.
- **Design system:** Must use existing dark-theme CSS variables (--surface-0, --text-0, --accent, etc.). No design system changes.
- **Resource table dependency:** RACI assignments reference the existing `resources` table. Resources must be assigned to the venture to appear in the RACI picker.
- **Workstream dependency:** RACI assignments reference workstreams. Workstreams must exist in the plan before RACI can be assigned.
- **Enum deprecation:** The `risk_probability` and `risk_impact` PostgreSQL enums will be deprecated but may need to coexist during migration. Drizzle ORM enum handling must be tested.
- **User manual scope:** Covers all modules, not just risk. This is a significant documentation effort and should be the final phase to capture the final state of the UI.

## 7. Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| Schema migration breaks existing risk data or queries | RED | Write migration with explicit default mappings. Test against production data snapshot. Backup before deploy. |
| Drizzle ORM enum-to-integer migration has edge cases | AMBER | Spike the migration approach early. Test enum deprecation in isolation before full migration. |
| RACI enforcement at workstream level adds friction to plan creation | AMBER | Make only Responsible mandatory. Other roles optional. Pre-populate from venture resource assignments if possible. |
| Heatmap performance with large risk counts | GREEN | Risk counts per venture are typically <50. No performance concern expected. Monitor if portfolio-level heatmap is built. |
| User manual becomes stale if written before features are finalized | AMBER | Schedule manual as final phase (Phase 7). Author after all UI is stable. Include screenshots from final build. |
| Scope creep into Issues/Blockers modules | AMBER | Explicitly out of scope. Only touch Issues/Blockers if a shared component (e.g., StatusBadge) needs an update that affects them. |
| Workstream data may not exist for all ventures | AMBER | RACI page should handle empty state gracefully. Prompt user to create workstreams in the plan before assigning RACI. |

## 8. Priority & Dependencies

**Priority:** High — this is a core governance capability gap. The current module does not meet standard PMO risk management expectations.

**Dependencies:**

- **Existing `resources` table** — must be populated with venture team members before RACI assignments are useful. Verify resource-to-venture assignment data exists.
- **Existing `risks` table and tRPC routes** — the current schema, API routes (`risks.listRisks`, `risks.createRisk`, `risks.updateRisk`), and UI components are the starting point. All must be understood before modification.
- **Existing workstreams / plan data** — RACI assignments are per-workstream. The plan module and workstream data model must be understood and stable before building the RACI schema.
- **Drizzle ORM migration tooling** — confirm `drizzle-kit` supports the enum-to-integer migration path (or plan a raw SQL migration step).
- **Design system variables** — heatmap color zones must be derived from or compatible with the existing theme. May need new CSS variables for score-band colors.
- **All other modules stable** — the user manual (Phase 7) depends on all modules being in their final state.

## 9. User Stories

### Risk Module

- **US-R1:** As a PM, I want to score each risk on a 1-5 Likelihood and 1-5 Impact scale so I can see a computed risk score (1-25) and prioritize objectively.
- **US-R2:** As a PM, I want to assign a weight to each risk so that the venture's weighted risk exposure reflects relative importance.
- **US-R3:** As a PM, I want to assign a single owner (from the resources table) and an escalation path to each risk so accountability is clear and traceable.
- **US-R4:** As a GM, I want to see a 5x5 heatmap of risks per venture so I can quickly identify risk concentration areas.
- **US-R5:** As a PMO Lead, I want to sort and filter the risk list by score, weight, status, and owner so I can review risks efficiently across ventures.
- **US-R6:** As a PM, I want existing risks migrated to the new numeric scoring model with sensible defaults so I do not lose historical data.

### RACI Matrix

- **US-RACI-1:** As a PM, I want a dedicated RACI page accessible from the sidebar so I can create and manage RACI assignments per workstream.
- **US-RACI-2:** As a PM, I want to assign Responsible, Accountable, Consulted, and Informed roles per workstream from the venture's resource list so accountability is structured.
- **US-RACI-3:** As a PM, I want Responsible to be mandatory and Accountable limited to one person per workstream so the matrix follows standard RACI rules.
- **US-RACI-4:** As a PMO Lead, I want to see a compact RACI summary on the Plan page alongside workstreams so I can review accountability at a glance without navigating away.
- **US-RACI-5:** As a GM, I want to view RACI assignments read-only so I understand who is accountable for each workstream without needing to edit anything.

### User Manual

- **US-M1:** As any user, I want a comprehensive user manual accessible from within the application so I can learn how to use every module.

## 10. Open Questions for BA

1. **Score band thresholds** — What are the exact breakpoints for color zones? Suggested: 1-4 green, 5-9 yellow, 10-15 amber, 16-20 red, 21-25 dark-red. Confirm with user.
2. **Weight scale** — Should weight be a decimal (0.0-1.0) or an integer scale (1-10)? How should weights be normalized across a venture's risks?
3. **Existing data migration mapping** — Confirm: low=1, medium=3, high=5? Or low=2, medium=3, high=4? User must decide.
4. **RACI cardinality** — Can multiple resources be Responsible for one workstream, or strictly one? Standard RACI says one Accountable, but Responsible can be shared.
5. **Portfolio heatmap** — Is a cross-venture aggregate heatmap required for GM/PMO dashboards, or is per-venture sufficient for this initiative?
6. **RAG auto-calculation** — Should the RAG rating now be auto-derived from the risk score (e.g., score >= 16 = red), or remain manually set with override?
7. **Risk categories/types** — Should risks be categorizable (technical, commercial, resource, compliance, etc.)? Not in current schema but common in PMO practice.
8. **User manual format** — In-app help panel, standalone HTML/PDF, or a dedicated /docs route within the application? How should it be accessed?
9. **Audit trail impact** — The existing audit_trail table captures field changes. Confirm that RACI assignment changes should also be audited.
10. **Historical score tracking** — Should risk score changes over time be tracked for trend analysis, or is current-state sufficient?
11. **RACI page placement in sidebar** — Where in the sidebar nav order should the RACI page appear? Suggested: after Plan, before Risks.
12. **Plan page compact RACI view** — Should the compact view be a simple table (workstream rows, RACI columns with resource names), or a more visual representation (badges, avatars)?
