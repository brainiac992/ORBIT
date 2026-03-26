# Requirements Document — ADRES PMO Platform
**Date:** 2026-03-26
**Status:** Complete ✅
**Author:** BA Agent
**Program Brief:** /docs/adres-pmo-platform/pm/pm-brief-adres-pmo-platform.md

---

## 1. Overview

A web-based PMO platform for ADRES that centralises venture tracking, project planning, resource management, budget tracking, and progress reporting. Built around progressive disclosure — each role sees exactly what they need, nothing more. Three tiers of access: GM (portfolio health), PMO (cross-venture oversight), PM (venture workspace).

V1 is fully manual data entry. JIRA/Confluence integration is v2.

---

## 2. Organisational Context

ADRES runs 3–7 active ventures simultaneously. Each venture has one accountable PM. Current reporting is done through dense weekly reports (see /Sources screenshots) that overload users with simultaneous detail. The platform replaces these reports with a structured, role-appropriate digital system.

Known current ventures: DARI.AE, ADREC Property Platform. These serve as reference data for data model validation.

---

## 3. Users & Roles

| Role | Who | Access |
|---|---|---|
| **GM** | General Manager | Read-only. Portfolio health dashboard. Cannot edit any venture data. |
| **PMO** | PMO Lead / PMO team | Full read across all ventures. Can create ventures, manage users, configure the system. Can flag escalations. |
| **PM** | Project Manager | Full read/write on their assigned venture only. Cannot see other ventures. |
| **Resource** | Internal staff / external contractors | No system access. They are tracked as data objects, not users. |

One PM is assigned to exactly one venture. A venture has exactly one PM.

Authentication via ADRES SSO (existing Active Directory). No standalone login credentials.

---

## 4. Functional Requirements

### 4.1 Venture Management

1. PMO can create a new venture with: name, description, start date, target end date, PM assignment, status, and venture type.
2. PMO can edit all venture fields at any time.
3. PM can edit their own venture's description, status, and progress — not ownership or dates (those require PMO).
4. A venture has a lifecycle status: Planning → Active → On Hold → Complete → Archived.
5. Ventures can be archived but never deleted (audit trail preserved).
6. The system displays each venture's current health as: **On Track** / **At Risk** / **Off Track** / **Complete** — set manually by the PM in their weekly update.
7. All ventures are visible to PMO. A PM sees only their venture.

### 4.2 Project Plan

8. Each venture has a project plan composed of workstreams and milestones.
9. A workstream is a major delivery area within a venture (e.g. "AI Integration", "Customer Migration", "API Development").
10. Each workstream has: name, owner (a resource), baseline start date, baseline end date, actual start date, actual end date, status, and completion percentage.
11. A milestone is a key delivery point within a workstream: name, due date, actual completion date, status (Upcoming / Achieved / Overdue / Deferred), and notes.
12. PM can add, edit, and update workstreams and milestones on their venture.
13. The system automatically flags a milestone as Overdue when its due date passes and status is not Achieved.
14. Completion percentage of a workstream is entered manually by the PM (v1). Not auto-calculated.
15. The project plan view shows baseline vs actual dates side-by-side for each workstream.

### 4.3 Resource Management

16. PMO can maintain a resource directory of internal staff and external contractors.
17. Each resource record contains: name, type (Internal / External), role/title, department (if internal), company (if external), and active status.
18. A resource can be assigned to a venture with: hours per week (HpW) allocation and assignment start/end dates.
19. A resource can be assigned to multiple ventures simultaneously.
20. The system shows total HpW allocated per resource across all active ventures — PMO can see if a resource is over-allocated.
21. PM can view the resources assigned to their venture and their HpW allocation. PM cannot add or remove resources (PMO only).
22. When a resource's assignment ends, the record is retained for audit — it is not deleted.

### 4.4 Progress Logging

23. PMs log a weekly progress update per venture containing:
    - Overall venture status (On Track / At Risk / Off Track)
    - Overall completion percentage
    - Narrative summary (free text, what happened this week)
    - Per-workstream status and completion % update
    - Milestone completions this week (multi-select from open milestones)
    - Blockers (free text, one per blocker, flagged as open/resolved)
    - Decisions needed (free text, one per decision, flagged as open/resolved)
    - Actions for next week (free text list)
24. Each weekly update is a snapshot — previous updates are never overwritten (full history preserved).
25. The system shows the date of the last progress update per venture. PMO can see when a venture was last updated.
26. PMO can view the full update history for any venture.
27. The system does not send reminders in v1 — PM is responsible for submitting updates.

### 4.5 Budget Tracking

28. Each venture has a budget record containing:
    - Approved budget (total, set by PMO, locked after approval)
    - Budget breakdown by category: People / Technology / Vendors / Other
    - Actual spend to date (entered by PM or PMO)
    - Committed spend (purchase orders raised, not yet invoiced)
    - Forecast to complete (PM estimate of remaining spend)
    - Forecast at completion (actual + forecast to complete — system calculates)
    - Budget variance (approved minus forecast at completion — system calculates, flags red if negative)
29. PMO can set and lock the approved budget per venture.
30. PM can log actual spend entries: amount, date, category, description, vendor (if applicable).
31. PM can update the forecast to complete at any time.
32. All spend entries are immutable once saved — corrections are made by adding a correction entry, not editing (audit trail).
33. The system displays budget status as: **Within Budget** / **At Risk** (forecast within 10% of approved) / **Over Budget** (forecast exceeds approved).
34. PMO can see budget status across all ventures in the portfolio view.

### 4.6 Risk & Issue Tracking

35. PMs can log risks and issues against their venture.
36. A risk record contains: title, description, probability (Low/Medium/High), impact (Low/Medium/High), RAG rating (auto-derived or manual override), mitigation plan, owner (a resource or free text), and status (Open/Mitigated/Closed).
37. An issue record contains: title, description, severity (Low/Medium/High), impact description, resolution plan, owner, and status (Open/In Progress/Resolved).
38. PMO can see all open risks and issues across all ventures.
39. A risk or issue can be escalated to the GM — escalated items are flagged prominently in the GM dashboard.
40. Closed risks and issues are retained in history.

### 4.7 Dashboards

#### GM Dashboard (portfolio health)
41. Landing page for GM role. Shows all active ventures as health cards.
42. Each venture card shows: venture name, PM name, health status (colour-coded), % complete, budget status, and count of open escalations.
43. GM can click a venture card to see a read-only venture summary (one level deeper — key milestones, open risks, latest progress narrative). Nothing more.
44. No tables, no raw numbers, no operational detail on the GM landing page.
45. A summary bar at the top shows: total active ventures, count On Track, count At Risk, count Off Track, total budget allocated vs total forecast at completion.

#### PMO Dashboard (cross-venture oversight)
46. Shows all ventures in a configurable table/list with sortable columns: health, % complete, last updated, budget variance, open risks, open blockers.
47. PMO can drill into any venture to see full detail (all tabs: plan, resources, budget, updates, risks).
48. Highlights ventures that have not been updated in more than 7 days.
49. Shows resource allocation summary — who is over-allocated across ventures.
50. Shows all open escalations and decisions needed across all ventures in one consolidated view.

#### PM Dashboard (venture workspace)
51. Landing page for PM role shows their venture only.
52. Tabs: Overview / Project Plan / Resources / Budget / Progress / Risks.
53. Overview tab: venture health, % complete, key upcoming milestones (next 2 weeks), open blockers count, budget status at a glance.
54. A "Log this week's update" button is prominent and accessible from the Overview tab.

---

## 5. Non-Functional Requirements

- **Authentication:** ADRES SSO via Active Directory. No separate credentials.
- **Authorisation:** Role enforced server-side. A PM API call for another venture returns 403, not filtered data.
- **Performance:** Dashboard pages load in under 2 seconds at current scale (3–7 ventures, ~10 users).
- **Audit trail:** All data writes (progress updates, spend entries, status changes) are immutable and timestamped with the acting user.
- **Browser support:** Modern browsers (Chrome, Edge, Safari). No IE.
- **Responsive:** Desktop-first. Tablet-readable. Mobile is not a v1 requirement.
- **Data retention:** All records (archived ventures, historical updates, closed risks) are retained indefinitely. Nothing is hard-deleted.

---

## 6. Acceptance Criteria

- A GM can see the health of all ventures on one screen without scrolling on a standard 1080p monitor
- A PM can complete a full weekly update (status, narrative, milestones, blockers, budget entry) in under 5 minutes
- A PMO user can identify the most at-risk venture and its top blocker in under 2 clicks
- SSO login works — no separate username/password required
- A PM attempting to access another venture's data receives a 403 error, not filtered results
- All spend entries are immutable — the UI does not offer an edit button on saved entries
- Milestones past their due date with status ≠ Achieved are automatically shown as Overdue
- Budget forecast at completion and variance are calculated by the system, not entered manually

---

## 7. Edge Cases & Error Scenarios

- **Venture with no updates:** System shows "No updates logged yet" — no crash, no blank state
- **Resource over-allocation:** System warns PMO but does not block the assignment
- **Budget actual > approved:** System flags Over Budget but does not block spend entry
- **PM logs update for past week:** Allowed — update is timestamped with submission time, not forced to current week
- **SSO unavailable:** System shows a clear error "Authentication service unavailable — contact IT" — does not expose a fallback login
- **No active ventures:** GM dashboard shows empty state with message, not a broken layout
- **Milestone due today:** System treats as Overdue only after EOD (midnight), not during the day

---

## 8. Out of Scope — v1

- JIRA integration (v2)
- Confluence integration (v2)
- Automated progress population from JIRA (v2)
- Client-facing / external stakeholder portal
- Mobile application
- Email or push notifications / reminders
- Document/file attachment storage
- Timesheets or detailed time tracking (HpW is allocation only, not timesheet)
- Multi-currency budget tracking — **currency confirmed: AED**
- Reporting exports to PDF or Excel (v2 candidate)

---

## 9. Dependencies

- ADRES Active Directory / SSO endpoint — required before authentication can be built
- Confirmation of single currency assumption for budget module
- Resource directory seed data (existing staff list) — needed for initial setup

---

## 10. Open Questions

- What currency is used for budget tracking? Single currency assumed — confirm.
- Should PMO be able to log progress updates on behalf of a PM (e.g. if PM is absent)?
- Are there any reporting periods that must be preserved (e.g. weekly snapshots that align to a fiscal calendar)?
- Should the GM dashboard show completed/archived ventures, or active only?
