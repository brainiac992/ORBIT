# Product Backlog — ADRES PMO Platform
**Date:** 2026-03-26
**Author:** PO Agent
**Program Brief:** /docs/adres-pmo-platform/pm/pm-brief-adres-pmo-platform.md
**Requirements Doc:** /docs/adres-pmo-platform/ba/requirements-adres-pmo-platform.md

---

## MVP Scope Summary

V1 ships the complete core loop: a PM can log into their venture workspace, update their plan, log resources, record spend, submit a weekly progress update, and track risks. The PMO sees everything across all ventures. The GM sees a clean portfolio health view. SSO handles auth throughout. Nothing is deferred that would prevent any of these three roles from doing their primary job.

Budget tracking is included in full — approved budget, actuals, forecast, and system-calculated variance. Resource management is allocation-level (HpW + assignment), not timesheet.

---

## What Is Deferred and Why

| Deferred Item | Reason |
|---|---|
| JIRA/Confluence integration | Explicitly scoped to v2 — data entry is manual in v1 |
| Automated reminders / notifications | Not blocking core workflow — PMs are responsible for updates |
| PDF/Excel exports | Useful but not blocking any role's primary job |
| Mobile app | Desktop-first is sufficient for current user base |
| Multi-currency budgets | Single currency assumed — low risk for current ventures |
| File/document attachments | Not raised as a need — v2 candidate |
| PMO updating on behalf of PM | Open question — deferring until confirmed |

---

## Prioritised Backlog

---

### P0 — Must Ship

---

#### [US-001] SSO Login
**As a** GM, PMO, or PM,
**I want to** log in using my ADRES credentials (SSO),
**so that** I don't manage a separate password and access is tied to my existing identity.

**Acceptance Criteria:**
- Given I navigate to the app, when I click "Sign in with ADRES", then I am redirected to the SSO provider
- Given I authenticate successfully, when I return to the app, then I am logged in and my role is applied automatically
- Given SSO is unavailable, when I try to log in, then I see "Authentication service unavailable — contact IT" and no fallback login form is shown
- Given I have no assigned role, when I authenticate, then I see "Access not configured — contact PMO" and cannot proceed

**Out of scope:** Manual username/password login, self-registration
**Complexity:** M
**Depends on:** ADRES SSO endpoint access

---

#### [US-002] GM Portfolio Health Dashboard
**As a** General Manager,
**I want to** see the health of all active ventures on one screen,
**so that** I can identify what needs my attention in under 10 seconds without scrolling.

**Acceptance Criteria:**
- Given I log in as GM, when the dashboard loads, then I see a summary bar (total ventures, count On Track / At Risk / Off Track, total budget vs forecast)
- Given there are active ventures, when the page loads, then each venture appears as a card showing: name, PM, health status (colour-coded), % complete, budget status, and escalation count
- Given I click a venture card, when the detail opens, then I see: latest progress narrative, next 2 milestones, open risks count, and budget variance — nothing else
- Given no ventures are active, when I open the dashboard, then I see "No active ventures" — no broken layout
- Given a venture has open escalations, when it appears on the dashboard, then the escalation count is visually distinct (not buried)

**Out of scope:** Editing any data, seeing full project plans, seeing individual spend entries
**Complexity:** M
**Depends on:** US-001, US-005, US-010, US-015

---

#### [US-003] PMO Cross-Venture Dashboard
**As a** PMO lead,
**I want to** see all ventures in one sortable view with health, progress, budget, and staleness signals,
**so that** I can identify problems across the portfolio without opening each venture individually.

**Acceptance Criteria:**
- Given I log in as PMO, when the dashboard loads, then I see all ventures in a table sortable by: health status, % complete, last updated date, budget variance, open risks count
- Given a venture has not been updated in more than 7 days, when it appears in the table, then it is visually flagged as stale
- Given I click a venture row, when it opens, then I see the full venture workspace (all tabs)
- Given there are open escalations or decisions needed across ventures, when I view the dashboard, then I see a consolidated panel listing all of them — not scattered across individual venture views
- Given a resource is over-allocated (total HpW across ventures exceeds a threshold), when I view the resource section, then I see a warning indicator on that resource

**Out of scope:** Editing venture ownership or dates from this view
**Complexity:** M
**Depends on:** US-001, US-005, US-006, US-010, US-015

---

#### [US-004] PM Venture Workspace
**As a** PM,
**I want to** see my venture workspace with tabs for plan, resources, budget, progress, and risks,
**so that** everything I need to manage my venture is in one place.

**Acceptance Criteria:**
- Given I log in as PM, when the dashboard loads, then I see only my venture — no other ventures are visible or accessible
- Given I am on the Overview tab, when the page loads, then I see: health status, % complete, next 2 upcoming milestones, open blockers count, and budget status at a glance
- Given I am on the Overview tab, when I click "Log this week's update", then the progress update form opens
- Given I navigate to any other venture's URL directly, when the page loads, then I receive a 403 error — not filtered or empty data
- Given my venture has no updates yet, when I open the Overview, then I see "No updates logged yet" — no crash

**Out of scope:** Viewing other ventures, changing venture ownership, adding/removing resources
**Complexity:** S
**Depends on:** US-001, US-005

---

#### [US-005] Venture Creation & Management
**As a** PMO lead,
**I want to** create and manage ventures in the system,
**so that** each venture has a canonical record that the PM and GM can reference.

**Acceptance Criteria:**
- Given I am PMO, when I create a venture, then I must provide: name, description, start date, target end date, PM assignment, and venture type — all required
- Given I create a venture, when it is saved, then its status is set to "Planning" and it is visible in the PMO dashboard immediately
- Given I edit a venture's PM assignment, when I save, then the new PM can access the venture workspace and the previous PM loses access
- Given I archive a venture, when it is archived, then it no longer appears in active dashboards but all its data is retained and accessible via an "Archived" filter
- Given I attempt to delete a venture, then the system does not offer a delete option — only archive

**Out of scope:** PM creating their own ventures
**Complexity:** S
**Depends on:** US-001

---

#### [US-006] Project Plan — Workstreams & Milestones
**As a** PM,
**I want to** define workstreams and milestones for my venture,
**so that** my project plan is visible in the system and can be tracked against baseline dates.

**Acceptance Criteria:**
- Given I open the Project Plan tab, when I add a workstream, then I must provide: name, owner (from resource list), baseline start, baseline end — actual dates are optional at creation
- Given I view the project plan, when workstreams are listed, then I see baseline vs actual dates side-by-side for each row
- Given a workstream has milestones, when I view them, then each shows: name, due date, status, and actual completion date if achieved
- Given a milestone's due date has passed and status is not "Achieved", when the plan loads, then its status is automatically shown as "Overdue" without PM action
- Given I update a workstream's completion %, when I save, then the updated % is reflected in the Overview tab immediately

**Out of scope:** Auto-calculating completion % from milestones (manual in v1), Gantt chart view
**Complexity:** M
**Depends on:** US-004, US-005

---

#### [US-007] Weekly Progress Update
**As a** PM,
**I want to** submit a structured weekly progress update for my venture,
**so that** PMO and GM always have a current view of what's happening without chasing me for reports.

**Acceptance Criteria:**
- Given I click "Log this week's update", when the form opens, then it contains: overall status, % complete, narrative summary, per-workstream status, milestone completions (multi-select), blockers, decisions needed, and next week's actions
- Given I submit an update, when it is saved, then it is stored as an immutable snapshot — I cannot edit it after submission
- Given I submit an update, when it is saved, then the venture's "last updated" timestamp updates immediately on the PMO dashboard
- Given I log an update for a past date, when I submit, then it is accepted — the system records submission time, not the week it covers
- Given the PMO views a venture's update history, when they open it, then all historical updates appear in reverse chronological order

**Out of scope:** Editing submitted updates, automated weekly prompts
**Complexity:** M
**Depends on:** US-004, US-006

---

#### [US-008] Budget Tracking
**As a** PM,
**I want to** log actual spend and forecast to complete for my venture,
**so that** PMO and GM can see whether we are within budget without asking me for spreadsheets.

**Acceptance Criteria:**
- Given PMO sets the approved budget, when it is saved, then PMs cannot edit the approved figure — only PMO can
- Given I log a spend entry, when I save it, then I must provide: amount, date, category (People / Technology / Vendors / Other), description — all required
- Given a spend entry is saved, when I view the budget tab, then there is no edit button on saved entries — corrections require a new entry
- Given I update my forecast to complete, when I save, then the system recalculates forecast at completion (actual + forecast) and budget variance (approved − forecast at completion) automatically
- Given forecast at completion is within 10% of approved budget, when the budget status displays, then it shows "At Risk" — not "Within Budget"
- Given forecast at completion exceeds approved budget, when the budget status displays, then it shows "Over Budget" — the entry is still saved (not blocked)

**Out of scope:** Multi-currency, purchase order workflow, invoice management
**Complexity:** M
**Depends on:** US-004, US-005

---

#### [US-009] Resource Management
**As a** PMO lead,
**I want to** maintain a resource directory and assign resources to ventures with HpW allocations,
**so that** I can see who is working on what and identify over-allocation before it becomes a problem.

**Acceptance Criteria:**
- Given I create a resource, when I save, then I must provide: name, type (Internal/External), role/title, and department or company depending on type
- Given I assign a resource to a venture, when I save, then I must provide: HpW allocation, assignment start date — end date is optional
- Given a resource is assigned to multiple ventures, when I view the resource directory, then I see their total HpW across all active assignments
- Given a PM views the Resources tab of their venture, when they open it, then they see their assigned resources and HpW allocations — no edit controls
- Given an assignment ends (end date passes), when I view the resource, then the assignment is shown as historical — the resource record is not deleted

**Out of scope:** Timesheet tracking, PM adding/removing resources from their venture
**Complexity:** M
**Depends on:** US-001, US-005

---

#### [US-010] Risk & Issue Tracking
**As a** PM,
**I want to** log risks and issues against my venture,
**so that** they are visible to PMO and can be escalated to the GM when needed.

**Acceptance Criteria:**
- Given I log a risk, when I save, then I must provide: title, probability, impact, and mitigation plan — RAG is derived automatically (High/High = Red, etc.)
- Given I log an issue, when I save, then I must provide: title, severity, and resolution plan
- Given PMO or PM marks a risk or issue as escalated, when the GM opens their dashboard, then the escalation count on the venture card increases and the item appears in the venture detail view
- Given I close a risk or issue, when it is closed, then it moves to a "Closed" history list — it does not disappear
- Given PMO views their dashboard, when they look at the escalations panel, then all open escalations across all ventures appear in one list

**Out of scope:** Automated RAG scoring beyond probability × impact matrix
**Complexity:** M
**Depends on:** US-004, US-005

---

### P1 — Should Ship

---

#### [US-011] Over-Allocation Warning
**As a** PMO lead,
**I want to** see a warning when a resource's total HpW allocation exceeds their available capacity,
**so that** I catch over-commitment before it affects delivery.

**Acceptance Criteria:**
- Given a resource's total HpW across active ventures exceeds 40 HpW, when I view the resource directory or assign them to a new venture, then I see a warning — the assignment is not blocked
- Given I dismiss the warning, when I save the assignment, then it proceeds normally

**Complexity:** S | **Depends on:** US-009

---

#### [US-012] Venture Health History
**As a** PMO lead,
**I want to** see how a venture's health status has changed over time,
**so that** I can spot a venture that keeps flipping between At Risk and On Track.

**Acceptance Criteria:**
- Given a venture has multiple progress updates, when I view its history, then I see health status per update in a simple timeline (date → status)
- Given I view the GM venture detail, when it loads, then I see a small trend indicator (3 most recent statuses) alongside the current health

**Complexity:** S | **Depends on:** US-007

---

#### [US-013] Decisions Needed — Consolidated View
**As a** PMO lead,
**I want to** see all open decisions needed across all ventures in one place,
**so that** nothing requiring a decision gets buried inside an individual venture.

**Acceptance Criteria:**
- Given a PM logs a "decision needed" in their weekly update, when PMO views the consolidated decisions panel, then it appears with venture name, date logged, and description
- Given a decision is resolved, when PMO or PM marks it resolved, then it moves to closed — not deleted

**Complexity:** S | **Depends on:** US-007

---

#### [US-014] Archived Venture Access
**As a** PMO lead,
**I want to** access archived venture data,
**so that** historical ventures remain auditable and referenceable.

**Acceptance Criteria:**
- Given I apply an "Archived" filter on the PMO dashboard, when it loads, then all archived ventures appear with their full data intact
- Given I open an archived venture, when it loads, then all data is read-only — no edits possible

**Complexity:** S | **Depends on:** US-005

---

### P2 — Nice to Have (this release, time permitting)

- **[US-015] Budget spend by category chart** — Visual breakdown of spend per category on the budget tab. Simple bar or donut chart alongside the table.
- **[US-016] Milestone calendar view** — A calendar showing all upcoming milestones across a venture's workstreams. Single venture only.
- **[US-017] PMO can update on behalf of PM** — Allow PMO to submit a progress update on behalf of a PM with a note indicating who logged it.

---

### P3 — Deferred to v2

- **[US-018] JIRA integration** — Pull workstream/milestone status automatically from JIRA project data
- **[US-019] Confluence integration** — Link venture documentation pages
- **[US-020] Automated progress reminders** — Email or in-app reminder to PM when no update logged in 5+ days
- **[US-021] PDF/Excel export** — Export venture status report or portfolio view
- **[US-022] Mobile application**
- **[US-023] Client/external stakeholder portal**

---

## Open Decisions

- Currency for budget module — single currency assumed, awaiting PMO confirmation
- PMO logging on behalf of PM — deferred as P2 pending confirmation (US-017)

## Notes for Architect

- Resource model must support many-to-many (resource ↔ venture) with HpW and date range on the join
- Progress updates are append-only (immutable after submission) — design schema accordingly
- Spend entries are immutable — no update path, only insert
- SSO integration is a hard dependency — auth module must be built before any role-gated screen
- Budget variance and forecast at completion are derived fields — calculate server-side, never store as editable columns
- Over-allocation threshold (40 HpW) should be configurable by PMO, not hardcoded
- All status enums must be consistent across the entire data model — define once, reuse everywhere
