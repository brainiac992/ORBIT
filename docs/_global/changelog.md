# ADRES PMO — Changelog

## ADRES PMO Platform v1 — 2026-03-26
**Pipeline Run:** Complete ✅
**Phases Run:** 1 (PM → BA → PO → PM Summary → Architect), 2 (UI Designer + Content Writer), 3 (DB + Backend + Frontend), 4 (QA + Security), 5 (Data Review), 7 (Documentation)
**QA Rounds:** 1
**Visibility:** Organisation-wide

### Delivered
- Web-based PMO platform for ADRES with three role-specific dashboards (GM / PMO / PM)
- Venture lifecycle management: create, edit, archive — with Planning → Active → Complete → Archived lifecycle
- Project plan with workstreams and milestones, baseline vs actual date tracking, auto-overdue detection
- Resource management: internal + external, hours per week allocation, over-allocation warnings at 40 HpW
- Full budget tracking: approved budget (lockable by PMO), actual spend, committed spend, forecast to complete, system-calculated forecast at completion and variance
- Weekly progress updates: structured form with per-workstream status, milestone completions, blockers, decisions needed, narrative
- Risk & issue tracking with RAG auto-derivation, escalation to GM dashboard
- Cross-venture oversight: consolidated escalations, decisions needed, and resource views for PMO
- Progressive disclosure UX: GM sees max 6 data points per venture, PM workspace uses tabs, no cognitive overload

### Technical Notes
- Stack: React 19 + Vite + Tailwind CSS / Node.js + Express + tRPC v11 / Drizzle ORM / PostgreSQL
- Auth: Azure AD SSO (MSAL) — dev mode uses user picker with x-azure-oid header
- All status enums defined once in shared/enums.ts — consistent across DB, API, and frontend
- Budget entries and progress updates are insert-only (immutable audit trail)
- Budget variance and forecast at completion are always derived server-side, never stored
- Progress submit is transactional — all child records created atomically
- Milestone overdue status computed on read, never stored
- RTL-ready CSS tokens and logical properties in place — language toggle is a v2 deliverable

### Security
- Role enforcement at middleware level — PM physically cannot access another venture's data
- Dev auth header only active when NODE_ENV ≠ production
- No delete endpoints exist — archive/soft-close only
- No raw SQL — all queries parameterised via Drizzle ORM
- Production TODO: Azure AD JWT verification, rate limiting, HTTPS enforcement

### Documents
- Program Brief: /docs/adres-pmo-platform/pm/pm-brief-adres-pmo-platform.md
- Requirements: /docs/adres-pmo-platform/ba/requirements-adres-pmo-platform.md
- Backlog: /docs/adres-pmo-platform/po/backlog-adres-pmo-platform.md
- Solution Blueprint: /docs/adres-pmo-platform/architect/blueprint-adres-pmo-platform.md
- UI Specification: /docs/adres-pmo-platform/ui-designer/ui-adres-pmo-platform.md
- Content Spec: /docs/adres-pmo-platform/content-writer/content-adres-pmo-platform.md
- QA Happy Path: /docs/adres-pmo-platform/qa/qa-report-happy-adres-pmo-platform.md
- QA Adversarial: /docs/adres-pmo-platform/qa/qa-report-breaker-adres-pmo-platform.md
- UI Test: /docs/adres-pmo-platform/qa/ui-test-adres-pmo-platform.md
- Security Audit: /docs/adres-pmo-platform/security/security-report-adres-pmo-platform.md
- Data Architecture: /docs/adres-pmo-platform/data/data-report-adres-pmo-platform.md

---
