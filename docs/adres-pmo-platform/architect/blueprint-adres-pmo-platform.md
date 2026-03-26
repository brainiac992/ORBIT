# Solution Blueprint — ADRES PMO Platform
**Date:** 2026-03-26
**Author:** Architect Agent
**Program Brief:** /docs/adres-pmo-platform/pm/pm-brief-adres-pmo-platform.md
**Requirements Doc:** /docs/adres-pmo-platform/ba/requirements-adres-pmo-platform.md
**Backlog:** /docs/adres-pmo-platform/po/backlog-adres-pmo-platform.md
**Status:** Approved for Implementation

---

## 1. Solution Overview

A Node.js + React web application. Three-role system (GM / PMO / PM) authenticated via ADRES SSO (Azure AD / OAuth 2.0). Each role lands on a purpose-built dashboard. PMs manage one venture. PMO sees everything. GM sees portfolio health only.

Progressive disclosure is enforced at the architecture level — role-scoped API responses, not client-side filtering. A PM's token cannot fetch another venture's data regardless of what the frontend does.

---

## 2. Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| Frontend | React 19 + Vite + Tailwind CSS | Fast, modern, no framework lock-in |
| Backend | Node.js + Express + tRPC v11 | Type-safe API layer, consistent with PMO agent tooling |
| ORM | Drizzle ORM | Lightweight, type-safe, migration-first |
| Database | PostgreSQL | Better suited than MySQL for append-only audit patterns and JSON columns |
| Auth | Azure AD SSO via MSAL (OAuth 2.0 + JWT) | ADRES uses Active Directory — MSAL is the standard library |
| Deployment | Railway (or any Node host) | Simple, no DevOps overhead for a 3–7 venture scale system |
| State management | TanStack Query (React Query) | Server state, caching, loading/error states out of the box |

---

## 3. System Architecture

```
Browser (React SPA)
    │
    │  HTTPS
    ▼
Express + tRPC API Server
    │
    ├── Auth middleware (MSAL JWT verification)
    ├── Role middleware (GM / PMO / PM enforcement)
    │
    ├── Venture router
    ├── Workstream router
    ├── Milestone router
    ├── Resource router
    ├── Progress router
    ├── Budget router
    └── Risk/Issue router
    │
    ▼
Drizzle ORM
    │
    ▼
PostgreSQL
```

All API routes are tRPC procedures. Role enforcement happens in middleware — not in business logic. A PM calling a venture query for a venture they don't own gets a 403 before the query runs.

---

## 4. Data Model

### Core Entities

#### `users`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| azure_oid | varchar(255) UNIQUE | Azure AD Object ID — the SSO identity anchor |
| email | varchar(255) UNIQUE | |
| name | varchar(255) | |
| role | enum('gm','pmo','pm') | Set by PMO on first login or pre-provisioned |
| active | boolean | Default true |
| created_at | timestamptz | |
| updated_at | timestamptz | |

#### `ventures`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | varchar(255) NOT NULL | |
| description | text | |
| venture_type | varchar(100) | |
| pm_user_id | uuid FK → users | One PM per venture |
| status | enum('planning','active','on_hold','complete','archived') | |
| health | enum('on_track','at_risk','off_track','complete') | Set by PM in weekly update |
| start_date | date | |
| target_end_date | date | |
| completion_pct | integer | 0–100, updated via progress updates |
| approved_budget | numeric(15,2) | AED. Set by PMO, locked after first set |
| budget_locked | boolean | Default false. True once PMO sets approved budget |
| created_by | uuid FK → users | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

#### `workstreams`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| venture_id | uuid FK → ventures | |
| name | varchar(255) NOT NULL | |
| owner_resource_id | uuid FK → resources | nullable |
| baseline_start | date | |
| baseline_end | date | |
| actual_start | date | nullable |
| actual_end | date | nullable |
| status | enum('not_started','in_progress','complete','on_hold') | |
| completion_pct | integer | 0–100, manual |
| sort_order | integer | For display ordering |
| created_at | timestamptz | |
| updated_at | timestamptz | |

#### `milestones`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| workstream_id | uuid FK → workstreams | |
| name | varchar(255) NOT NULL | |
| due_date | date NOT NULL | |
| actual_completion_date | date | nullable |
| status | enum('upcoming','achieved','overdue','deferred') | |
| notes | text | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

> **Overdue logic:** `status` is stored as entered. A computed field in the query layer (not the DB) returns `overdue` when `due_date < today AND status != 'achieved'`. The DB stores what the PM set; the API always applies the overdue override on read.

#### `resources`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | varchar(255) NOT NULL | |
| type | enum('internal','external') | |
| role_title | varchar(255) | |
| department | varchar(255) | nullable — internal only |
| company | varchar(255) | nullable — external only |
| active | boolean | Default true |
| created_at | timestamptz | |
| updated_at | timestamptz | |

#### `resource_assignments`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| resource_id | uuid FK → resources | |
| venture_id | uuid FK → ventures | |
| hours_per_week | numeric(5,1) NOT NULL | |
| start_date | date NOT NULL | |
| end_date | date | nullable — open-ended assignments allowed |
| created_by | uuid FK → users | |
| created_at | timestamptz | |

> Many-to-many between resources and ventures, with HpW and dates on the join. Historical assignments are never deleted.

#### `progress_updates`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| venture_id | uuid FK → ventures | |
| submitted_by | uuid FK → users | |
| submitted_at | timestamptz NOT NULL | |
| week_label | varchar(20) | e.g. "W13 2026" — PM-entered or auto-derived |
| overall_status | enum('on_track','at_risk','off_track') | |
| completion_pct | integer | 0–100 |
| narrative | text NOT NULL | |
| next_actions | text | |

> **Immutable:** No update path on this table. Insert only. Application layer enforces this — no UPDATE statement is ever issued.

#### `workstream_updates`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| progress_update_id | uuid FK → progress_updates | |
| workstream_id | uuid FK → workstreams | |
| status | enum('not_started','in_progress','complete','on_hold') | |
| completion_pct | integer | |
| notes | text | |

#### `milestone_completions`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| progress_update_id | uuid FK → progress_updates | |
| milestone_id | uuid FK → milestones | |
| completed_at | date | |

#### `blockers`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| progress_update_id | uuid FK → progress_updates | |
| venture_id | uuid FK → ventures | |
| description | text NOT NULL | |
| status | enum('open','resolved') | Default 'open' |
| resolved_at | timestamptz | nullable |
| resolved_by | uuid FK → users | nullable |

#### `decisions`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| progress_update_id | uuid FK → progress_updates | |
| venture_id | uuid FK → ventures | |
| description | text NOT NULL | |
| status | enum('open','resolved') | Default 'open' |
| resolved_at | timestamptz | nullable |
| resolved_by | uuid FK → users | nullable |

#### `budget_entries`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| venture_id | uuid FK → ventures | |
| entry_type | enum('actual','committed','correction') | |
| amount | numeric(15,2) NOT NULL | AED |
| entry_date | date NOT NULL | |
| category | enum('people','technology','vendors','other') | |
| description | text NOT NULL | |
| vendor | varchar(255) | nullable |
| created_by | uuid FK → users | |
| created_at | timestamptz | |

> **Immutable:** Insert only. Corrections use `entry_type = 'correction'` with a negative amount. No UPDATE or DELETE ever issued on this table.

#### `budget_forecasts`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| venture_id | uuid FK → ventures | |
| forecast_to_complete | numeric(15,2) NOT NULL | AED — PM estimate |
| created_by | uuid FK → users | |
| created_at | timestamptz | |

> Forecast history is preserved. The latest record per venture is the active forecast. Forecast at completion and variance are always derived: never stored.

#### `risks`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| venture_id | uuid FK → ventures | |
| title | varchar(255) NOT NULL | |
| description | text | |
| probability | enum('low','medium','high') | |
| impact | enum('low','medium','high') | |
| rag | enum('green','amber','red') | Derived from probability × impact matrix. Can be overridden. |
| rag_override | boolean | Default false |
| mitigation_plan | text | |
| owner | varchar(255) | Free text — resource name or external person |
| status | enum('open','mitigated','closed') | |
| escalated | boolean | Default false |
| created_by | uuid FK → users | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

#### `issues`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| venture_id | uuid FK → ventures | |
| title | varchar(255) NOT NULL | |
| description | text | |
| severity | enum('low','medium','high') | |
| impact_description | text | |
| resolution_plan | text | |
| owner | varchar(255) | |
| status | enum('open','in_progress','resolved') | |
| escalated | boolean | Default false |
| created_by | uuid FK → users | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

---

## 5. Derived / Computed Values (Never Stored)

These are always calculated server-side on read. Never stored as columns.

| Value | Formula |
|---|---|
| Forecast at completion | SUM(actual budget_entries) + SUM(committed budget_entries) + latest forecast_to_complete |
| Budget variance | approved_budget − forecast_at_completion |
| Budget status | variance > 0 and > 10% of approved → Within Budget; variance within 10% → At Risk; variance < 0 → Over Budget |
| Milestone overdue | due_date < today AND status != 'achieved' |
| Resource total HpW | SUM(hours_per_week) across active assignments (end_date IS NULL OR end_date >= today) |
| RAG (auto) | High/High → Red; High/Med or Med/High → Amber; else Green |

---

## 6. API Contracts (tRPC Routers)

### Auth
- `auth.me` — returns current user profile + role
- `auth.provision` — PMO only: set role for a user after first SSO login

### Ventures
- `ventures.list` — PMO: all ventures. PM: their venture only (enforced by middleware)
- `ventures.get(id)` — role-scoped
- `ventures.create(input)` — PMO only
- `ventures.update(id, input)` — PMO: all fields. PM: status, health, completion_pct only
- `ventures.archive(id)` — PMO only
- `ventures.portfolioSummary` — GM + PMO: aggregated health counts + budget totals

### Workstreams
- `workstreams.list(ventureId)` — role-scoped to venture
- `workstreams.create(input)` — PM (own venture) + PMO
- `workstreams.update(id, input)` — PM (own venture) + PMO

### Milestones
- `milestones.list(workstreamId)` — role-scoped
- `milestones.create(input)` — PM + PMO
- `milestones.update(id, input)` — PM + PMO

### Resources
- `resources.list` — PMO only (full directory). PM: `resources.listForVenture(ventureId)`
- `resources.create(input)` — PMO only
- `resources.assign(input)` — PMO only
- `resources.allocationSummary` — PMO only: all resources with total HpW

### Progress
- `progress.submit(input)` — PM (own venture) only
- `progress.list(ventureId)` — PM (own) + PMO
- `progress.latest(ventureId)` — GM + PMO + PM

### Budget
- `budget.setBudget(ventureId, amount)` — PMO only. Locks approved_budget.
- `budget.logEntry(input)` — PM (own venture) + PMO
- `budget.updateForecast(ventureId, amount)` — PM (own venture) + PMO
- `budget.summary(ventureId)` — all roles (role-scoped)

### Risks & Issues
- `risks.list(ventureId)` — role-scoped
- `risks.create(input)` — PM + PMO
- `risks.update(id, input)` — PM (own) + PMO
- `risks.escalate(id)` — PM + PMO
- `issues.list/create/update/escalate` — same pattern

### Dashboards
- `dashboard.gm` — GM + PMO: portfolio health cards + summary bar
- `dashboard.pmo` — PMO only: full cross-venture table + escalations + decisions + resource warnings
- `dashboard.pm` — PM only: their venture overview

---

## 7. Auth Architecture (Azure AD SSO)

```
1. User clicks "Sign in with ADRES"
2. Frontend redirects to Azure AD (MSAL)
3. Azure AD authenticates, returns JWT
4. Frontend sends JWT with every API request (Authorization: Bearer)
5. API middleware verifies JWT signature against Azure AD JWKS
6. Middleware extracts azure_oid, looks up user in DB
7. If user not in DB → 401 with "Access not configured — contact PMO"
8. If user in DB → attaches user + role to request context
9. Role middleware enforces access on every procedure
```

PMO pre-provisions users (sets their role) before first login. Self-registration is not supported.

---

## 8. Frontend Architecture

### Routes
```
/                       → redirect based on role
/dashboard/gm           → GM portfolio health
/dashboard/pmo          → PMO cross-venture view
/dashboard/pm           → PM venture workspace
/venture/:id/plan       → Project plan tab
/venture/:id/resources  → Resources tab
/venture/:id/budget     → Budget tab
/venture/:id/progress   → Progress history tab
/venture/:id/risks      → Risks & Issues tab
/venture/:id/update     → Weekly update form
/admin/users            → PMO user management
/admin/resources        → PMO resource directory
```

### Component Architecture
```
App
├── AuthProvider (MSAL context)
├── RoleGuard (redirects to correct dashboard by role)
│
├── GMDashboard
│   ├── PortfolioSummaryBar
│   ├── VentureHealthCard (×N)
│   └── VentureDetailDrawer (read-only)
│
├── PMODashboard
│   ├── VentureTable (sortable)
│   ├── EscalationsPanel
│   ├── DecisionsPanel
│   └── ResourceAllocationWarnings
│
├── PMWorkspace
│   ├── VentureOverview
│   ├── ProjectPlanTab
│   │   ├── WorkstreamRow (×N)
│   │   └── MilestoneList
│   ├── ResourcesTab
│   ├── BudgetTab
│   │   ├── BudgetSummaryCard
│   │   └── SpendEntryList
│   ├── ProgressTab
│   │   └── UpdateCard (×N, read-only history)
│   └── RisksTab
│       ├── RiskCard (×N)
│       └── IssueCard (×N)
│
└── WeeklyUpdateForm
    ├── StatusSelector
    ├── NarrativeInput
    ├── WorkstreamUpdateList
    ├── MilestoneCompletionPicker
    ├── BlockerList
    ├── DecisionList
    └── NextActionsInput
```

### Progressive Disclosure — Enforced Design Rules
- GM landing: health cards only. No tables. No numbers except % complete and escalation count.
- GM venture detail: one drawer, maximum 6 data points. No nested navigation.
- PMO table: sortable rows. Detail opens in a full venture workspace view, not a drawer.
- PM overview: maximum 4 KPI tiles + 2 upcoming milestones + 1 CTA button.
- No view has more than one primary action visible at a time.

---

## 9. Key Flows (Sequence)

### PM submits weekly update
```
PM clicks "Log this week's update"
→ WeeklyUpdateForm loads with current workstreams and open milestones pre-populated
→ PM fills in status, narrative, workstream updates, milestone completions, blockers, decisions
→ PM submits → tRPC progress.submit
→ Server: creates progress_update, workstream_updates, milestone_completions, blockers, decisions in a transaction
→ Server: updates venture.health and venture.completion_pct from submitted values
→ Server: updates venture.updated_at
→ Response: success
→ Frontend: navigates back to PM workspace overview, shows updated status
```

### PMO sets approved budget
```
PMO opens venture budget tab → clicks "Set Approved Budget"
→ Enters total amount (AED) and category breakdown
→ tRPC budget.setBudget
→ Server: sets ventures.approved_budget + ventures.budget_locked = true
→ Server: rejects any future PMO call to setBudget (idempotent lock)
→ Frontend: "Set Budget" button replaced with "Approved: AED X" read-only display
```

### GM views at-risk venture
```
GM lands on /dashboard/gm
→ dashboard.gm query: fetches all active ventures with health, pct, budget status, escalation count
→ PortfolioSummaryBar renders: 5 active / 3 on track / 1 at risk / 1 off track
→ GM clicks At Risk venture card
→ VentureDetailDrawer opens: latest narrative, next 2 milestones, open escalations, budget variance
→ GM reads context, closes drawer — no further navigation available
```

---

## 10. Scalability Notes

- At 3–7 ventures and ~10 users, performance is not a concern. Design for correctness, not scale.
- No caching layer needed in v1. TanStack Query handles client-side caching adequately.
- Append-only tables (progress_updates, budget_entries) will grow linearly — not a concern at this scale. Add pagination if/when needed.
- Over-allocation check is a simple SUM query. No denormalisation needed.

---

## 11. Agent Instructions

### DB-Agent must:
- Use PostgreSQL with Drizzle ORM
- Implement all tables exactly as specified in Section 4
- Use uuid_generate_v4() for all primary keys
- Apply `NOT NULL` constraints as specified — do not add nullable where schema says NOT NULL
- Create indexes on: ventures.pm_user_id, ventures.status, resource_assignments.resource_id, resource_assignments.venture_id, progress_updates.venture_id, budget_entries.venture_id, risks.venture_id, risks.escalated, issues.venture_id, issues.escalated
- Seed the DB with 2 sample ventures (DARI.AE, ADREC) with realistic placeholder data for development
- Currency: AED throughout — store as numeric(15,2), never float

### Backend-Agent must:
- Implement all tRPC routers from Section 6
- Role enforcement via middleware — not inline in procedures
- Overdue milestone logic applied on every milestones.list query — never stored
- Derived budget values (forecast at completion, variance, status) calculated in the budget service layer — never stored
- progress.submit must be a database transaction: progress_update + all child records created atomically or not at all
- budget.setBudget must check budget_locked before executing — return a clear error if already locked
- All immutable tables (progress_updates, budget_entries): no update or delete procedures — do not implement them
- Over-allocation threshold default: 40 HpW — read from config, not hardcoded

### Frontend-Agent must:
- Implement RoleGuard — redirect to correct dashboard based on role on every route
- GM route (/dashboard/gm) renders nothing from PM or PMO components — purpose-built components only
- WeeklyUpdateForm pre-populates workstreams from the venture's workstream list — PM does not re-type them
- Budget tab: no edit button on any saved budget_entry row — correction entry button only
- All status indicators use consistent colour tokens: On Track → green, At Risk → amber, Off Track → red, Complete → blue — defined in a single tokens file, never hardcoded inline
- Progressive disclosure: GM detail drawer must not exceed 6 data points. Enforce this in code review, not just design.

---

## 12. Red Flags — Do Not Do

- Do not store forecast_at_completion or budget_variance as columns — always derive on read
- Do not implement UPDATE on progress_updates or budget_entries — these tables are insert-only
- Do not filter ventures client-side for PM role — the API must return only the PM's venture
- Do not hardcode role checks in procedure bodies — all role enforcement through middleware
- Do not implement a delete endpoint for any entity — archive or soft-close only
- Do not use float for any monetary value — numeric(15,2) only

---

## 13. Decisions Made

| Decision | Choice | Rationale |
|---|---|---|
| Database | PostgreSQL over MySQL | Append-only audit patterns, cleaner enum support, better for derived aggregations |
| API layer | tRPC | Type-safe end-to-end, no REST boilerplate, consistent error handling |
| Auth | MSAL + Azure AD | ADRES already uses AD — no new identity system needed |
| Overdue milestone | Computed on read, not stored | Stored status would go stale; computed is always accurate |
| Budget immutability | Insert-only + correction entries | Full audit trail, no data loss from edits |
| Over-allocation threshold | Config-driven (default 40 HpW) | PMO may want to adjust — don't hardcode organisational policy |
| Currency | AED, numeric(15,2) | Confirmed by user. Single currency, no conversion needed in v1 |
| Locales | English + Arabic only | Hebrew explicitly excluded. All UI copy and content must be EN + AR. RTL layout required for Arabic. |

---

## 14. Phase Declaration

| Phase | Required | Reason |
|---|---|---|
| Phase 2 — UI Design | ✅ Yes | Multiple role-specific dashboards, progressive disclosure UX requires spec before build |
| Phase 3 — Build | ✅ Yes | Full stack system |
| Phase 4 — QA | ✅ Yes | Role isolation and data immutability must be verified |
| Phase 5 — Data Review | ✅ Yes | Append-only tables and derived financials need data architecture sign-off |
| Phase 6 — Comms | Optional | Internal PMO tool — stakeholder comms at PMO discretion |
| Phase 7 — Docs | ✅ Yes | Always |
| Phase 8 — Post-Launch | ✅ Yes | SSO integration and role routing must be verified in production |
