# Lessons Learned — ADRES PMO Platform
**Date:** 2026-03-26
**Author:** DOC-Agent

## What Worked Well
- Progressive disclosure as a non-negotiable design principle prevented scope creep into complex dashboard features
- Running BA + PO in sequence produced clean, prioritised user stories with clear acceptance criteria — reduced ambiguity for all downstream agents
- The PO explicitly cutting JIRA/Confluence from v1 kept scope manageable and allowed the build to focus on the core user workflow
- Shared enums in a single file (shared/enums.ts) eliminated status terminology inconsistencies across all layers

## What Was Difficult
- Determining the right level of budget tracking detail — "full budget tracking" needed BA probing to define precisely (approved/actual/committed/forecast/variance)
- The TrpcWrapper stale auth bug was subtle — only manifested when switching between users, which wouldn't happen in production SSO but broke the dev workflow entirely
- The dev auth approach (x-azure-oid header) needed an explicit NODE_ENV guard — easy to miss in development and catastrophic in production

## Decisions Made
- PostgreSQL over MySQL — append-only audit patterns and financial precision suited Postgres better
- tRPC over REST — type-safety end-to-end reduced API surface area bugs to zero
- Insert-only tables for budget and progress — immutability at the DB design level, not just API layer
- Overdue milestones computed on read rather than stored — always accurate, no stale data risk
- Budget approved amount locked after first set by PMO — prevents accidental changes after project is underway

## Would Do Differently
- Wire up RTL language toggle in Phase 3 instead of deferring to "v2-ready" — the CSS foundation is there but the UX toggle isn't, which will be additional frontend work later
- Add a dedicated admin page for creating ventures during Phase 3 — currently only possible through the PMO dashboard flow

## Recommendations for Future Initiatives
- When building multi-role dashboards, define the "max data points per screen" rule before UI design starts — it prevents the conversation about "can we add one more thing" that leads to cognitive overload
- For financial data, always use numeric/decimal types and derive aggregates server-side — never store calculated values or use float
- When building dev auth shortcuts, always wrap them in `NODE_ENV !== 'production'` from the first commit — not as a QA fix later
