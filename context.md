# HERALD Context Store

## Decisions

- **Risk scoring model:** Likelihood (1-5) x Impact (1-5) = Risk Score (1-25), persisted column. Weight 1-5 per risk. (2026-03-27)
- **RACI matrix:** Per-workstream, NOT per-risk. Two views: standalone page + compact on Plan page. Max 1 Accountable per workstream. (2026-03-27)
- **Migration mapping:** low=1, medium=3, high=5. Confirmed by user. (2026-03-27)
- **Blockers removed:** Merged into issues as severity='blocker'. No separate blockers table/concept. Weekly updates create blocker-severity issues. (2026-03-28)
- **Issues split from Risks:** Issues have their own standalone page. Risks page is purely risk-focused (heatmap, scoring, filters). (2026-03-28)
- **Jira integration approach:** Direct API (not middleware), Jira Cloud only, bidirectional sync. (2026-03-29)
- **Heatmap:** Compact size (~55% of original), 5x5 grid, clickable cells filter risk list. (2026-03-28)
- **Gantt:** Workstreams collapsible/expandable, custom scrollbar, no trailing half-row. (2026-03-27)
- **Sidebar navigation:** Ventures always visible for PMO/PM, expandable/collapsible with module tabs inline. (2026-03-27)
- **Auth:** DEV_AUTH=true fallback restored. Production JWT (MSAL) still TODO — separate initiative needed. (2026-03-27)
- **Decision resolution:** PMO-only (not PM or GM). (2026-03-28)

## Constraints

- Dark theme only — CSS variables, no hardcoded hex colors
- No new frameworks (React + tRPC + Drizzle + PostgreSQL + Express)
- Roles: GM (view-only), PMO (full access), PM (own venture only)
- User manual must be updated after each feature (DOC-Agent, Phase 7)
- HERALD pipeline must be followed for all features — no bypassing
- Security: helmet headers, CORS restricted, rate limiting (200 req/min), 50kb body limit
- All date fields validated as YYYY-MM-DD regex
- All text fields must have .max() length constraints

## Completed Initiatives

- **Risk Module Overhaul + RACI Matrix** (2026-03-27 to 2026-03-28) — Full pipeline. Plan: completed. Score: pending Layer 6.
- **Blocker Removal** (2026-03-28) — Moderate. Blockers merged into issues.
- **Issues Split** (2026-03-28) — Moderate. Standalone Issues page created.
- **Pentest + Security Fixes** (2026-03-28) — 17 findings fixed. 2 critical (auth) remain as separate initiative.
- **Performance Fixes** (2026-03-27) — N+1 queries fixed across 6 routers, 8 indexes added.
- **Gantt/Budget Bug Fixes** (2026-03-27) — Auth restored, error handling added, React hooks order fixed.

## In Progress

- **Jira Cloud Bidirectional Integration** — PM Brief approved pending user confirmation. BA not yet started. Initiative slug: jira-integration.

## Failed Approaches

- **QA audit removing DEV_AUTH=true** (commit 988cc0e) broke all production auth. Reverted. Do not remove DEV_AUTH until MSAL is implemented.
- **useMemo after conditional returns** in GanttPage caused React error #310 (hooks order violation). All hooks must be before any early returns.
- **Full table scans with JS filtering** caused performance degradation. Always use inArray() and DB-level WHERE clauses.

## Stakeholder Notes

- User is PMO Lead role, not highly technical — prefers clear step-by-step guidance
- User wants pipeline followed properly — called out bypass explicitly
- User prefers clean UX — caught "Venture" sidebar being misleading, heatmap too large, last half-row on Gantt

## Open Questions

- Jira integration: OAuth vs API token default?
- Jira integration: Delete propagation policy (bidirectional or soft-delete?)
- Jira integration: Can two ventures map to same Jira project?
- Jira integration: Import historical closed issues or active only?
- Jira integration: Sync all Jira comments or only tagged ones?
- When will MSAL Azure AD authentication be implemented?
