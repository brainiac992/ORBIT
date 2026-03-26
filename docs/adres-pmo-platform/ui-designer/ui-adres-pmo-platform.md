# UI Specification — ADRES PMO Platform
**Date:** 2026-03-26
**Author:** UI-Designer Agent
**Requirements Doc:** /docs/adres-pmo-platform/ba/requirements-adres-pmo-platform.md
**Blueprint:** /docs/adres-pmo-platform/architect/blueprint-adres-pmo-platform.md

---

## Design Philosophy

**Progressive disclosure, not data density.** The reference screenshots (DARI.AE and ADREC reports) pack ~40 data points on one screen with no hierarchy. This system does the opposite: every screen answers one question. Detail is one click away, never forced.

**Three design rules enforced on every screen:**
1. A screen has one primary purpose — stated in the page title
2. Maximum 6 data points visible before any interaction
3. Colour is a signal, not decoration — every colour means something

---

## 1. Screen List

| Screen | Route | Role | Purpose |
|---|---|---|---|
| Login | /login | All | SSO redirect |
| GM Dashboard | /dashboard/gm | GM | Portfolio health at a glance |
| GM Venture Drawer | /dashboard/gm (drawer) | GM | One venture summary — read only |
| PMO Dashboard | /dashboard/pmo | PMO | Cross-venture oversight |
| PM Workspace — Overview | /dashboard/pm | PM | My venture at a glance |
| PM — Project Plan | /venture/:id/plan | PM, PMO | Workstreams & milestones |
| PM — Resources | /venture/:id/resources | PM (read), PMO (write) | Resource allocation |
| PM — Budget | /venture/:id/budget | PM, PMO | Budget tracking |
| PM — Progress | /venture/:id/progress | PM, PMO | Update history |
| PM — Risks & Issues | /venture/:id/risks | PM, PMO | Risk/issue registry |
| Weekly Update Form | /venture/:id/update | PM | Submit weekly update |
| Admin — Users | /admin/users | PMO | User provisioning |
| Admin — Resources | /admin/resources | PMO | Resource directory |
| Admin — Create Venture | /admin/ventures/new | PMO | New venture form |

---

## 2. Screen Specifications

---

### Screen: Login

- **Route:** /login
- **Access:** All (unauthenticated)
- **Purpose:** Redirect to Azure AD SSO
- **Components:**
  - ADRES logo (centred)
  - "Sign in with ADRES" button (single primary action)
  - Subtitle: "PMO Platform"
- **Empty state:** N/A
- **Error state:** "Authentication service unavailable — contact IT" (no fallback form)
- **Loading state:** Spinner on button after click, while redirect processes

---

### Screen: GM Dashboard

- **Route:** /dashboard/gm
- **Access:** GM (read-only)
- **Purpose:** Answer one question: "Is my portfolio healthy?"

**Layout:**

```
┌─────────────────────────────────────────────────────────────┐
│  ADRES PMO                              [User] [Logout]     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Portfolio Health                                            │
│                                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│  │ 5 Active │ │ 3 On     │ │ 1 At     │ │ 1 Off    │      │
│  │ Ventures │ │ Track    │ │ Risk     │ │ Track    │      │
│  │          │ │   🟢     │ │   🟡     │ │   🔴     │      │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘      │
│                                                             │
│  ┌──────────┐                                               │
│  │ Budget   │  AED 12.5M approved / AED 11.2M forecast     │
│  │ Status   │  ██████████░░ 89% consumed                   │
│  └──────────┘                                               │
│                                                             │
│  ┌─────────────────────────────────────┐                    │
│  │  DARI.AE         Omar S.     🟢    │  72%  AED 2.1M  0│
│  ├─────────────────────────────────────┤                    │
│  │  ADREC Platform   Hannah W.  🟡    │  58%  AED 4.3M  1│
│  ├─────────────────────────────────────┤                    │
│  │  Venture C        Ali K.     🟢    │  91%  AED 1.8M  0│
│  ├─────────────────────────────────────┤                    │
│  │  Venture D        Sarah M.   🔴    │  34%  AED 3.1M  2│
│  └─────────────────────────────────────┘                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Each venture card shows (6 data points max):**
1. Venture name
2. PM name
3. Health indicator (colour dot + status label)
4. Completion % (text + subtle progress bar)
5. Budget status (AED amount + Within/At Risk/Over)
6. Escalation count (number + icon, only if > 0)

**Interaction:**
- Click any venture card → right-side drawer opens with venture summary

**Empty state:** "No active ventures" centred with subtle illustration
**Loading state:** 4 skeleton cards pulsing

---

### Screen: GM Venture Drawer (Right Drawer)

- **Route:** /dashboard/gm (drawer overlay)
- **Access:** GM (read-only)
- **Purpose:** One-level-deeper context on a single venture — max 6 data points

**Layout (drawer, ~400px wide):**

```
┌────────────────────────────┐
│  DARI.AE               ✕  │
│  PM: Omar Shawahneh       │
│  Status: On Track 🟢      │
├────────────────────────────┤
│                            │
│  Latest Update (Week 13)   │
│  "API integration phase    │
│   completed ahead of       │
│   schedule. Customer       │
│   migration workstream     │
│   on track."               │
│                            │
├────────────────────────────┤
│  Upcoming Milestones       │
│  • API v2 Launch  Apr 3    │
│  • UAT Start      Apr 10   │
│                            │
├────────────────────────────┤
│  Budget                    │
│  AED 2.1M approved         │
│  AED 1.8M forecast         │
│  Within Budget ✅           │
│                            │
├────────────────────────────┤
│  Open Risks: 2             │
│  Escalations: 0            │
│                            │
└────────────────────────────┘
```

**Rules:**
- Maximum 6 sections visible without scrolling
- No tables, no detailed data, no editing capability
- No further navigation from this drawer — this is the deepest the GM can go

---

### Screen: PMO Dashboard

- **Route:** /dashboard/pmo
- **Access:** PMO
- **Purpose:** Cross-venture oversight and action queue

**Layout:**

```
┌─────────────────────────────────────────────────────────────┐
│  ADRES PMO                              [User] [Logout]     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [Ventures]  [Escalations (3)]  [Decisions (2)]  [Resources]│
│                                                             │
│  ─── Active Ventures ───────────────────────────────────    │
│                                                             │
│  Name        │ PM      │ Health │ %   │ Budget   │ Updated │
│  ─────────────────────────────────────────────────────────  │
│  DARI.AE     │ Omar S. │ 🟢    │ 72% │ ✅ Within│ 2d ago  │
│  ADREC       │ Hannah  │ 🟡    │ 58% │ ⚠️ Risk │ 1d ago  │
│  Venture C   │ Ali K.  │ 🟢    │ 91% │ ✅ Within│ 3d ago  │
│  Venture D   │ Sarah   │ 🔴    │ 34% │ 🔴 Over │ 9d ago ⚠│
│                                                             │
│  Click any row to open full venture workspace →             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Tabs across the top:**
1. **Ventures** (default) — sortable table of all ventures. Columns: name, PM, health, %, budget status, last updated. Stale ventures (>7 days) get a warning badge next to the date.
2. **Escalations** — consolidated list of all open escalated risks + issues across all ventures. Badge shows count.
3. **Decisions** — all open "decisions needed" across all ventures. Badge shows count.
4. **Resources** — resource allocation view. Shows resource name, type, total HpW, and a warning if over-allocated (>40 HpW).

**Interactions:**
- Click a venture row → navigates to full venture workspace (PM view with all tabs, but PMO has edit rights)
- Sortable columns: click header to sort
- Stale badge: visually distinct (amber text or icon) on the "Updated" column for >7 days

**Empty state:** "No ventures created yet. Create your first venture →"

---

### Screen: PM Workspace — Overview

- **Route:** /dashboard/pm
- **Access:** PM (own venture only)
- **Purpose:** My venture at a glance + quick action

**Layout:**

```
┌─────────────────────────────────────────────────────────────┐
│  ADRES PMO                              [User] [Logout]     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  DARI.AE                                                    │
│                                                             │
│  [Overview]  [Plan]  [Resources]  [Budget]  [Progress]  [Risks]│
│                                                             │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐│
│  │  On Track  │ │  72%       │ │  Budget    │ │  Risks     ││
│  │  🟢        │ │  Complete  │ │  ✅ Within │ │  2 open    ││
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘│
│                                                             │
│  Upcoming Milestones                                        │
│  ┌────────────────────────────────────────────────────┐     │
│  │  API v2 Launch           Apr 3     5 days away     │     │
│  │  UAT Start               Apr 10    12 days away    │     │
│  └────────────────────────────────────────────────────┘     │
│                                                             │
│  Open Blockers: 1                                           │
│  • "Waiting on SSO endpoint from IT — blocking auth dev"    │
│                                                             │
│  ┌──────────────────────────────────────┐                   │
│  │  📝  Log This Week's Update         │                   │
│  └──────────────────────────────────────┘                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Visible on overview (max 6 items):**
1. Health status (tile)
2. Completion % (tile)
3. Budget status (tile)
4. Open risks count (tile)
5. Next 2 upcoming milestones
6. Open blockers (collapsed — just count + latest one)

**Primary CTA:** "Log This Week's Update" — visually prominent, always visible on overview

---

### Screen: PM — Project Plan

- **Route:** /venture/:id/plan
- **Access:** PM (edit own), PMO (edit all)
- **Purpose:** Manage workstreams and milestones with baseline vs actual tracking

**Layout:**

```
Workstreams                               [+ Add Workstream]

  Workstream        │ Owner    │ Baseline      │ Actual        │ Status      │ %
  ──────────────────────────────────────────────────────────────────────────────
  AI Integration    │ Ahmed R. │ Jan 1–Mar 31  │ Jan 5–        │ In Progress │ 65%
    ├ Milestone: Model training complete    Mar 15  ✅ Achieved (Mar 12)
    ├ Milestone: API v2 Launch              Apr 3   ◯ Upcoming
    └ Milestone: Production deploy          Apr 20  ◯ Upcoming

  Customer Migration│ Lina K.  │ Feb 1–Apr 30  │ Feb 3–        │ In Progress │ 40%
    ├ Milestone: Data mapping complete      Mar 10  ⚠ Overdue
    └ Milestone: Migration complete         Apr 30  ◯ Upcoming
```

**Key design details:**
- Workstreams as collapsible rows — milestones nest underneath
- Baseline vs actual dates displayed side by side
- Overdue milestones get amber icon + "Overdue" label (auto-computed)
- Achieved milestones get green check + actual completion date
- Completion % shown as text + small inline progress bar
- "+ Add Workstream" button top-right. "+ Add Milestone" button per workstream (visible on hover/expand)

---

### Screen: PM — Budget

- **Route:** /venture/:id/budget
- **Access:** PM (log entries, update forecast), PMO (set approved budget)
- **Purpose:** Track approved budget, actual spend, forecast, variance

**Layout:**

```
  Budget Summary
  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
  │ Approved         │ │ Forecast at     │ │ Variance         │
  │ AED 2,100,000    │ │ Completion      │ │ AED +300,000     │
  │                  │ │ AED 1,800,000   │ │ Within Budget ✅  │
  └─────────────────┘ └─────────────────┘ └─────────────────┘

  Spend by Category
  ┌──────────────────────────────────────────────────────┐
  │  People       ████████████░░░░░░  AED 680,000 (45%) │
  │  Technology   ██████░░░░░░░░░░░░  AED 340,000 (23%) │
  │  Vendors      ████░░░░░░░░░░░░░░  AED 230,000 (15%) │
  │  Other        ███░░░░░░░░░░░░░░░  AED 150,000 (10%) │
  │  Remaining    ████████░░░░░░░░░░  AED 700,000        │
  └──────────────────────────────────────────────────────┘

  Spend Log                           [+ Log Spend Entry]
  Date      │ Category   │ Description          │ Amount
  ──────────────────────────────────────────────────────────
  Mar 25    │ People     │ March contractor fee  │ AED 45,000
  Mar 20    │ Technology │ Cloud hosting Q1      │ AED 12,500
  ...

  Forecast to Complete          [Update Forecast]
  Current estimate: AED 700,000
  Last updated: Mar 23
```

**Key design details:**
- 3 summary tiles at top: Approved, Forecast at Completion, Variance
- Variance tile colour-coded: green (within), amber (at risk), red (over)
- Category breakdown as horizontal stacked bars — simple, not a chart library dependency
- Spend log is a read-only table. No edit button on any row. Only "+ Log Spend Entry" adds new rows
- Forecast to Complete is a single editable number — not a complex form

---

### Screen: Weekly Update Form

- **Route:** /venture/:id/update
- **Access:** PM only
- **Purpose:** Submit structured weekly progress update

**Design principle: guided form, not a wall of inputs.** The form is divided into clear sections with headers. Each section is immediately visible (not a wizard/stepper — too slow), but visually separated.

**Layout:**

```
  Log Weekly Update — DARI.AE
  Week: W13 (Mar 23–27, 2026)

  ── Overall Status ──────────────────────────────
  ⚪ On Track    ⚪ At Risk    ⚪ Off Track

  Overall Completion: [  72  ] %

  ── What happened this week ─────────────────────
  [                                                ]
  [  Narrative — what progressed, what didn't,     ]
  [  what changed.                                 ]
  [                                                ]

  ── Workstream Updates ──────────────────────────
  (Pre-populated from your project plan)

  AI Integration     │ Status: [In Progress ▾]  │ % [65]
  Customer Migration │ Status: [In Progress ▾]  │ % [40]
  Dashboards & Maps  │ Status: [Not Started ▾]  │ % [ 0]

  ── Milestones Completed ────────────────────────
  ☑ Model training complete (was due Mar 15)
  ☐ Data mapping complete (overdue — due Mar 10)
  ☐ API v2 Launch (due Apr 3)

  ── Blockers ────────────────────────────────────
  [+ Add Blocker]
  • Waiting on SSO endpoint from IT   [Open ▾]

  ── Decisions Needed ────────────────────────────
  [+ Add Decision]
  (none this week)

  ── Next Week's Actions ─────────────────────────
  [                                                ]

  ┌──────────────────────────────────────┐
  │         Submit Update                │
  └──────────────────────────────────────┘

  ⚠ Once submitted, this update cannot be edited.
```

**Key design details:**
- Workstreams are pre-populated from the project plan — PM updates status + % inline, no re-typing
- Milestones shown as checkboxes — PM ticks what was completed this week
- Overdue milestones shown with amber label so PM is reminded
- Blockers and decisions: add one at a time with inline input
- Immutability warning shown above submit button — clear and visible
- Not a wizard (too many clicks) — one scrollable form with clear section dividers

---

### Screen: PM — Risks & Issues

- **Route:** /venture/:id/risks
- **Access:** PM (edit own), PMO (edit all)
- **Purpose:** Log and track risks and issues

**Layout:**

```
  Risks                                    [+ Log Risk]

  ┌──────────────────────────────────────────────────┐
  │  🔴  Vendor contract renewal delay     Open      │
  │      Impact: High  │  Prob: Medium  │  Owner: Ali│
  │      Mitigation: Early engagement with procurement│
  │      [Escalate]  [Close]                         │
  ├──────────────────────────────────────────────────┤
  │  🟡  Resource availability Q2          Open      │
  │      Impact: Medium │  Prob: Medium │  Owner: HR │
  │      ...                                         │
  └──────────────────────────────────────────────────┘

  Closed Risks (2)   [expand to view]

  ──────────────────────────────────────────────────

  Issues                                   [+ Log Issue]

  ┌──────────────────────────────────────────────────┐
  │  SSO endpoint not provided by IT       In Progress│
  │  Severity: High  │  Owner: IT Team               │
  │  Resolution: Escalated to CTO                    │
  │  [Escalate]  [Resolve]                           │
  └──────────────────────────────────────────────────┘

  Resolved Issues (5)  [expand to view]
```

**Key design details:**
- Risks and issues as cards, not table rows — easier to scan
- RAG colour on left border of each card
- Closed/resolved items collapsed by default — expandable, not inline
- Escalate button promotes to GM dashboard visibility
- PMO sees an "Escalated" badge on items already escalated

---

## 3. Navigation & Information Architecture

```
App Shell
├── Top bar: ADRES PMO logo, current user name, role badge, logout
├── Role-based redirect on login → correct dashboard
│
├── GM: /dashboard/gm (no sidebar, no navigation — single page + drawer)
│
├── PMO: /dashboard/pmo
│   ├── Tab: Ventures (default) → click row → /venture/:id/* (full workspace)
│   ├── Tab: Escalations
│   ├── Tab: Decisions
│   ├── Tab: Resources
│   └── Admin menu (top-right): Users, Resources, New Venture
│
└── PM: /dashboard/pm → /venture/:id/* (tabs within workspace)
    ├── Tab: Overview
    ├── Tab: Plan
    ├── Tab: Resources (read-only)
    ├── Tab: Budget
    ├── Tab: Progress
    └── Tab: Risks
```

**Navigation rules:**
- GM has no sidebar and no navigation menu — just the dashboard + drawer. This is intentional.
- PMO has a top-tab navigation on the dashboard + sidebar admin menu
- PM has a tab bar within their venture workspace — no global navigation needed since they only have one venture
- Breadcrumbs: shown on PMO when inside a venture workspace (← Back to Dashboard / Venture Name / Tab)
- No nested navigation deeper than 2 levels anywhere

---

## 4. Colour & Status System

| Token | Colour | Usage |
|---|---|---|
| `--status-on-track` | #22C55E (green) | On Track health, Within Budget |
| `--status-at-risk` | #F59E0B (amber) | At Risk health, budget within 10%, overdue milestones |
| `--status-off-track` | #EF4444 (red) | Off Track health, Over Budget, escalated items |
| `--status-complete` | #3B82F6 (blue) | Completed ventures, achieved milestones |
| `--status-neutral` | #6B7280 (grey) | Not Started, On Hold, deferred |
| `--surface` | #FFFFFF | Cards, panels |
| `--surface-muted` | #F9FAFB | Page background |
| `--text-primary` | #111827 | Headings, KPI values |
| `--text-secondary` | #6B7280 | Labels, meta text |
| `--text-inverse` | #FFFFFF | Text on coloured backgrounds |
| `--border` | #E5E7EB | Card borders, dividers |
| `--accent` | #2563EB | Primary buttons, links |

**Rules:**
- Colour is never the only indicator — always paired with an icon or text label
- Status colours used only for status — never decorative
- All tokens defined in one `tokens.css` file, consumed via CSS custom properties
- RTL: use logical CSS properties (`padding-inline-start`, `text-align: start`) throughout

---

## 5. RTL Support (Arabic)

- All layouts use CSS logical properties — no `left`/`right` in layout code
- Direction set on `<html dir="rtl" lang="ar">` when Arabic is selected
- Language toggle: small EN/AR switcher in top bar, persistent via localStorage
- All text uses `text-align: start` — never `left` or `right`
- Icons that imply direction (arrows, chevrons) flip automatically via CSS `transform: scaleX(-1)` when in RTL
- Numbers and currency values always display LTR even in RTL context (`direction: ltr` on numeric elements)
- No directional words in UI copy ("left panel", "right side") — use neutral terms ("main area", "detail panel")

---

## 6. Responsive Behaviour

- **Desktop (≥1280px):** Full layout as designed
- **Tablet (768–1279px):** Venture table becomes scrollable. GM cards stack 2 per row. Drawers become full-screen overlays.
- **Mobile (<768px):** Not a primary target. Basic readability — single-column stack. No complex interactions redesigned for mobile.

---

## 7. Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| GM drill-down | Right drawer, not new page | One-level-deep principle — GM should not lose context of portfolio |
| PM workspace | Tabs within venture, not sidebar | PM only manages one venture — sidebar is wasted space |
| Weekly update | Single scrollable form, not wizard | Wizard adds clicks; this form has ~6 sections — scrolling is faster |
| Risks & issues | Cards, not table rows | Cards are scannable for status + actions; tables are better for dense comparisons |
| Closed/resolved items | Collapsed by default | Reduces visual noise; historical items are accessible but not competing for attention |
| Budget spend log | No edit button | Immutability is a data integrity requirement — UX must enforce it, not just the API |
| PMO stale warning | Amber text on "Updated" column | Subtle but scannable; no modal or popup — just a visual signal inline |
