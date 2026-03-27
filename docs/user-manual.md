# ORBIT Platform User Manual

**ADRES PMO Platform**
Version 1.0 | Last updated: 2026-03-27

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Roles and Permissions](#2-roles-and-permissions)
3. [Dashboards](#3-dashboards)
4. [Venture Management](#4-venture-management)
5. [Project Plan](#5-project-plan)
6. [RACI Matrix](#6-raci-matrix)
7. [Gantt Chart](#7-gantt-chart)
8. [Resources](#8-resources)
9. [Budget](#9-budget)
10. [Progress Updates](#10-progress-updates)
11. [Risks](#11-risks)
12. [Issues and Blockers](#12-issues-and-blockers)
13. [Activity Log](#13-activity-log)
14. [Approvals](#14-approvals)
15. [Configuration](#15-configuration)

---

## 1. Getting Started

### 1.1 What is ORBIT?

ORBIT is the ADRES Project Management Office (PMO) platform. It provides a centralized workspace for managing ventures (projects) across their full lifecycle: planning, resource allocation, budgeting, risk management, progress tracking, and executive reporting.

### 1.2 Logging In

ORBIT uses role-based access. In the current development environment, the login screen presents a list of pre-configured users.

**Steps:**

1. Open the application in your web browser.
2. The login screen displays the ORBIT logo and a list of available users.
3. Each user card shows the user's **name**, **role** (GM, PMO, or PM), and a short description of the role's focus area.
4. Click the card for the user you wish to log in as.
5. You will be redirected to the appropriate dashboard for your role.

**Role descriptions on the login screen:**

| Role | Description |
|------|-------------|
| GM   | Portfolio health at a glance |
| PMO  | Cross-venture oversight |
| PM   | Venture workspace |

### 1.3 Navigation Overview

After logging in, the interface consists of two areas:

- **Sidebar (left):** Contains the ORBIT logo, role-specific navigation links, a ventures list (for PMO and PM roles), and the user profile section with a Sign Out button.
- **Main content area (right):** Displays the currently selected page.

**Sidebar navigation items by role:**

| Role | Menu Items |
|------|------------|
| GM   | Portfolio |
| PMO  | Dashboard, Approvals, Activity, Configuration |
| PM   | Overview, Activity |

**Venture sidebar (PMO and PM only):**

Below the main navigation, the sidebar shows a "Ventures" section. Each venture name can be expanded to reveal seven module tabs:

- Plan
- RACI
- Gantt
- Resources
- Budget
- Progress
- Risks

Click any tab to navigate directly to that module for the selected venture.

### 1.4 Signing Out

1. Locate the user profile section at the bottom of the sidebar.
2. Your name and role are displayed alongside an avatar initial.
3. Click the **Sign Out** button below your profile.
4. You will be returned to the login screen.

---

## 2. Roles and Permissions

ORBIT supports three roles. Each role has a distinct scope of access and capabilities.

### 2.1 General Manager (GM)

**Purpose:** Executive-level portfolio oversight. Read-only access to all venture data.

| Capability | Access |
|------------|--------|
| Dashboard | Portfolio Health (read-only) |
| Venture modules | View all modules (Plan, Gantt, Budget, Risks, etc.) |
| Create/edit data | No. The GM cannot create ventures, add workstreams, log risks, or make any modifications. |
| Sidebar ventures | Not shown. The GM accesses ventures through the portfolio dashboard. |

### 2.2 PMO Lead

**Purpose:** Cross-venture management and oversight. Full administrative access.

| Capability | Access |
|------------|--------|
| Dashboard | Venture Oversight with tabs for Ventures, Escalations, Decisions, Blockers, Resources |
| Create ventures | Yes |
| Manage resources | Create new resources and assign them to ventures |
| Set approved budget | Yes (one-time lock) |
| Approvals | Review and approve/reject pending requests |
| Configuration | Manage system dropdown options (role titles, departments, venture types, etc.) |
| Activity feed | View across all ventures |
| All venture modules | Full read and write access |

### 2.3 Project Manager (PM)

**Purpose:** Day-to-day management of an assigned venture.

| Capability | Access |
|------------|--------|
| Dashboard | Venture Overview for their assigned venture |
| Venture modules | Full access to Plan, RACI, Gantt, Budget, Progress, Risks for their venture |
| Weekly updates | Submit weekly progress reports |
| Log risks/issues/blockers | Yes |
| Log spend entries | Yes |
| Create resources | No (PMO only) |
| Approvals | No access |
| Configuration | No access |
| Activity feed | View for their venture |

---

## 3. Dashboards

### 3.1 GM Dashboard — Portfolio Health

**What it does:** Provides an executive snapshot of all active ventures in a single view.

**Who can access:** GM only.

**Page layout:**

1. **KPI strip** at the top with five summary cards:
   - **Active** — total number of active ventures
   - **On Track** — ventures with on-track health (shown in green)
   - **At Risk** — ventures with at-risk health (shown in amber)
   - **Off Track** — ventures with off-track health (shown in red)
   - **Budget** — total approved budget across all ventures, with forecast shown below

2. **Venture cards** displayed in a grid (up to 3 columns). Each card shows:
   - Venture name
   - Assigned PM name
   - Progress ring with completion percentage
   - Health indicator dot (green/amber/red)
   - Budget status badge
   - Escalation count (if any, displayed as a red pulse badge)

3. **Venture detail drawer** — click any venture card to open a slide-out panel on the right side showing:
   - Venture name and PM
   - Large progress ring and percentage
   - Health status
   - Latest weekly update (week label and narrative)
   - Budget summary (approved, forecast, status)
   - Risk counts (open and escalated)

**Tips:**
- Click the same venture card again to close the drawer.
- Escalation badges pulse to draw attention to ventures needing immediate action.

### 3.2 PMO Dashboard — Venture Oversight

**What it does:** Central hub for managing all ventures, reviewing escalations, pending decisions, blockers, and resource allocation.

**Who can access:** PMO only.

**Page layout:**

1. **Header** with title "Venture Oversight" and two action buttons:
   - **Export CSV** — exports portfolio data to CSV format
   - **Create Venture** — opens the new venture form

2. **KPI row** with four cards:
   - Active Ventures (count)
   - Escalations (count, red if > 0)
   - Decisions Pending (count, amber if > 0)
   - Open Blockers (count, red if > 0)

3. **Tab bar** with five tabs:
   - **Ventures** — table listing all ventures with columns: Name, PM, Health, Progress (bar + percentage), Last Updated (with stale warning if outdated)
   - **Escalations** — list of escalated risks and issues across all ventures, each tagged by type (Risk/Issue)
   - **Decisions** — list of pending decisions with a Resolve button for each
   - **Blockers** — list of open blockers with a Resolve button for each
   - **Resources** — cross-venture resource allocation table showing Name, Type, Role, and allocation bar (with over-allocation warnings)

**Steps to create a venture:**

1. Click the **Create Venture** button.
2. Fill in the required fields:
   - **Venture Name** (required) — e.g., "DARI.AE"
   - **Description** (optional)
   - **Venture Type** — select from dropdown or choose "Custom..." to type a custom value
   - **Assigned PM** (required) — enter the PM's user UUID
   - **Start Date** (required)
   - **Target End Date** (optional, defaults to start date if empty)
3. Click **Create Venture**.

**Tips:**
- Click any row in the Ventures table to navigate directly to that venture's Project Plan.
- Badge counts on the Escalations, Decisions, and Blockers tabs help you prioritize attention.

### 3.3 PM Dashboard — Venture Overview

**What it does:** Provides the assigned PM with a focused view of their venture's health, key metrics, and quick navigation to all modules.

**Who can access:** PM only. If no venture is assigned, a "No Venture Assigned" message is shown.

**Page layout:**

1. **Header** showing venture name, health dot, last updated date, and export buttons (Export CSV, Print PDF).

2. **KPI cards** (four across):
   - Completion percentage with progress ring
   - Health status
   - Open Risks count
   - Blockers count

3. **Open blockers alert** — if blockers exist, a red-tinted panel lists them with individual Resolve buttons.

4. **Latest Update** section showing the most recent weekly update (week label and narrative text).

5. **Quick navigation grid** with six cards linking to:
   - Project Plan
   - Gantt Chart
   - Budget
   - Resources
   - Risks & Issues
   - Progress History

6. **Log This Week's Update** — a prominent full-width button at the bottom linking to the weekly update form.

**Tips:**
- The blockers panel pulses to draw attention when blockers exist.
- Use Export CSV for data extraction and Print PDF for stakeholder reporting.

---

## 4. Venture Management

### 4.1 What is a Venture?

A venture is the top-level entity in ORBIT, representing a project or initiative. All planning, budgeting, resource allocation, and risk management is scoped to a venture.

### 4.2 Creating a Venture

**Who can do this:** PMO only.

See the steps under [PMO Dashboard](#32-pmo-dashboard--venture-oversight) above.

### 4.3 Navigating Venture Modules

**For PMO and PM users:**

1. Locate the **Ventures** section in the left sidebar.
2. Click a venture name to expand its module list.
3. Click any module tab (Plan, RACI, Gantt, Resources, Budget, Progress, Risks) to open it.

The currently active venture and tab are highlighted in the sidebar. Only one venture can be expanded at a time. Navigating into a venture auto-expands it.

---

## 5. Project Plan

**What it does:** Defines the work breakdown structure for a venture through workstreams and milestones.

**Who can access:** All roles can view. PMO and PM can create and edit.

### 5.1 Viewing the Project Plan

The plan page displays a list of workstreams as collapsible cards. Each card shows:

- Workstream name
- Baseline dates (start to end)
- Actual dates (if set)
- RACI badges — compact inline badges showing R (Responsible), A (Accountable), C (Consulted), I (Informed) assignments with resource names. A clickable "RACI" link navigates to the full RACI Matrix page.
- Status badge (Not Started, In Progress, Complete, On Hold)
- Completion percentage with progress bar

Click any workstream to expand it and see its milestones.

### 5.2 Adding a Workstream

1. Click the **Add Workstream** button at the top of the plan page.
2. Fill in:
   - **Name** (required) — e.g., "Customer Migration"
   - **Baseline Start** (optional) — planned start date
   - **Baseline End** (optional) — planned end date
3. Click **Add Workstream**.

### 5.3 Editing a Workstream

1. Click a workstream to expand it.
2. Click the **Edit Workstream** button in the toolbar.
3. Modify any of the following fields:
   - **Status** — Not Started, In Progress, Complete, On Hold
   - **Completion %** — 0 to 100
   - **Actual Start** — when work actually began
   - **Actual End** — when work actually finished
4. Click **Save**.

### 5.4 Adding a Milestone

1. Expand the target workstream.
2. Click the **Add Milestone** button.
3. Fill in:
   - **Name** (required) — e.g., "UAT Complete"
   - **Due Date** (required)
   - **Notes** (optional)
4. Click **Add Milestone**.

### 5.5 Managing Milestones

Each milestone displays:

- Status icon: circle (upcoming), checkmark (achieved), or warning (overdue)
- Milestone name
- Due date
- Actual completion date (if achieved)
- Status badge

**Actions (PMO and PM only):**

- **Complete** — marks the milestone as achieved with today's date
- **Defer** — marks the milestone as deferred

**Tips:**
- Build workstreams before setting up RACI assignments or viewing the Gantt chart.
- Keep completion percentages updated weekly for accurate dashboard reporting.

---

## 6. RACI Matrix

**What it does:** Provides a dedicated page for assigning Responsible, Accountable, Consulted, and Informed roles to resources for each workstream.

**Who can access:** All roles can view. PMO and PM can create and remove assignments.

### 6.1 Understanding RACI

| Letter | Role | Meaning | Rule |
|--------|------|---------|------|
| R | Responsible | Does the work | Multiple allowed per workstream |
| A | Accountable | Owns the outcome, makes final decisions | Maximum 1 per workstream |
| C | Consulted | Provides input, two-way communication | Multiple allowed |
| I | Informed | Kept in the loop, one-way communication | Multiple allowed |

### 6.2 Color Coding

| Role | Color |
|------|-------|
| Responsible | Indigo/blue |
| Accountable | Red |
| Consulted | Amber/yellow |
| Informed | Gray |

### 6.3 Viewing the Matrix

The RACI page displays a table with:
- **Rows:** One row per workstream
- **Columns:** Workstream name, R, A, C, I

Each cell shows badges with resource names. An exclamation mark (!) appears next to any resource that is no longer assigned to the venture.

A legend at the top shows all four RACI roles with their color-coded badges.

### 6.4 Adding a RACI Assignment

1. Navigate to the RACI page for the venture.
2. Find the workstream row and the desired role column.
3. Click the **+ Add** link in the cell.
4. A dropdown appears listing all resources assigned to the venture (resources not already assigned to that role are shown).
5. Select a resource from the dropdown.
6. Click **OK** to confirm the assignment.

**Important:** The Accountable column enforces a maximum of 1 assignment per workstream. If an Accountable is already assigned, the "+ Add" link is hidden and "Max 1" is displayed instead. Remove the existing assignment first to change it.

### 6.5 Removing a RACI Assignment

1. Locate the badge for the assignment you want to remove.
2. Click the **x** button on the right side of the badge.
3. The assignment is removed immediately.

**Tips:**
- Workstreams must be created on the Plan page before RACI can be assigned.
- RACI badges also appear inline on the Project Plan page for quick reference.
- If the RACI page shows "No workstreams defined," use the "Go to Plan" button to create workstreams first.

---

## 7. Gantt Chart

**What it does:** Displays a visual timeline of all workstreams and milestones, showing durations, progress, and key dates.

**Who can access:** All roles (read-only view).

### 7.1 Chart Layout

The Gantt chart is split into two sections:

- **Left panel (labels):** Lists workstream names with completion percentages. Workstreams with milestones have an expand/collapse toggle.
- **Right panel (timeline):** Shows horizontal bars for workstreams and diamond markers for milestones, positioned according to their dates.

### 7.2 Zoom Controls

Two zoom levels are available via toggle buttons in the top right:

| Zoom Level | Column Width | Best For |
|------------|-------------|----------|
| **Week** | Wider columns, one per week (labeled W1, W2, etc.) | Detailed short-term view |
| **Month** | Narrower columns, one per month (labeled "Jan 26", "Feb 26", etc.) | High-level long-term view |

### 7.3 Reading the Chart

**Workstream bars:**

| Color | Status |
|-------|--------|
| Indigo/blue | In Progress |
| Emerald/green | Complete |
| Gray | Not Started |
| Amber | On Hold |

Each bar has a lighter overlay showing the completion percentage.

**Milestone diamonds:**

| Color | Status |
|-------|--------|
| Blue | Upcoming |
| Green | Achieved |
| Amber | Overdue |
| Gray | Deferred |

**Today line:** A vertical red line with a "Today" label marks the current date.

### 7.4 Collapsing Workstreams

Click the expand/collapse arrow next to a workstream name in the left panel to show or hide its milestones.

**Tips:**
- The chart automatically buffers 30 days beyond the venture end date for visibility.
- If the chart shows "No Plan Data," add workstreams and milestones on the Plan page first.
- Scroll horizontally to see the full timeline if it extends beyond the visible area.

---

## 8. Resources

**What it does:** Manages the directory of people (internal and external) and their allocation to ventures.

**Who can access:** All roles can view. PMO can create resources and assign them to ventures.

### 8.1 Viewing Resources

The resources page shows a table with columns:

| Column | Description |
|--------|-------------|
| Name | Resource's full name |
| Type | Badge showing Internal or External |
| Role | Job title or role |
| HpW | Hours per week allocated to this venture |
| Start | Assignment start date |
| End | Assignment end date, or "Ongoing" |

### 8.2 Creating a New Resource (PMO Only)

1. Click the **New Resource** button.
2. Fill in the form:
   - **Name** (required) — full name of the person
   - **Type** — Internal or External
   - **Role / Title** — select from the dropdown or choose "Custom..." for a free-text entry
   - **Department** (internal only) — select from dropdown or custom
   - **Company** (external only) — the vendor/consulting company name
3. Click **Create Resource**.

### 8.3 Assigning a Resource to a Venture (PMO Only)

1. Click the **Assign Resource** button.
2. Fill in:
   - **Resource** (required) — select from the directory of all resources
   - **Hours per Week** (required) — e.g., 20
   - **Start Date** (required)
   - **End Date** (optional) — leave blank for ongoing assignments
3. Click **Assign**.

### 8.4 Cross-Venture Allocation View

On the PMO Dashboard under the **Resources** tab, a summary table shows all resources across ventures with:
- Name, type, role
- Allocation bar (based on 40h/week baseline)
- Total hours per week
- Over-allocation warnings (red bar and "Over" badge when exceeding 40h/week)

**Tips:**
- Create resources in the directory before assigning them to ventures.
- Resources must be assigned to a venture before they can be used in RACI assignments.
- Monitor the PMO Dashboard Resources tab to detect over-allocation early.

---

## 9. Budget

**What it does:** Tracks the financial status of a venture including approved budget, actual spend, forecasts, and variance analysis.

**Who can access:** All roles can view. PMO can set the approved budget. PMO and PM can log spend entries and update forecasts.

### 9.1 Budget Summary

The budget page shows three summary tiles:

| Tile | Description |
|------|-------------|
| **Approved Budget** | The total approved amount (in AED). PMO can set this once; it becomes locked after approval. |
| **Forecast at Completion** | Projected total cost when the venture is complete. |
| **Variance** | Difference between approved budget and forecast. Green (positive) means under budget; red (negative) means over budget. Includes a status badge. |

### 9.2 Setting the Approved Budget (PMO Only)

1. On the budget page, click **Set Approved Budget** (only visible when the budget has not been locked).
2. Enter the amount in AED.
3. Click **Approve & Lock Budget**.

**Warning:** Once set, the approved budget cannot be changed. This is a one-time action.

### 9.3 Category Breakdown

A bar chart section shows spend broken down by four categories:

| Category | Description |
|----------|-------------|
| People | Staff and contractor costs |
| Technology | Software, hardware, infrastructure |
| Vendors | Third-party vendor services |
| Other | Miscellaneous costs |

Each bar is proportional to the highest spending category.

### 9.4 Logging a Spend Entry

1. Click **Log Spend Entry**.
2. Fill in the form:
   - **Type** — Actual Spend, Committed (PO raised), or Correction
   - **Amount (AED)** (required)
   - **Date** (required)
   - **Category** (required) — People, Technology, Vendors, or Other
   - **Description** (required) — e.g., "March contractor fee"
   - **Vendor** (optional) — e.g., "Acme Consulting"
3. Click **Log Entry**.

**Important:** Spend entries cannot be edited after submission. To correct an error, log a new entry with type "Correction."

### 9.5 Updating the Forecast

1. Click **Update Forecast**.
2. Enter the estimated remaining spend (Forecast to Complete) in AED.
3. Click **Update Forecast**.

The Forecast at Completion is automatically calculated as actual spend to date plus the forecast to complete.

### 9.6 Spend Log

A table at the bottom of the page lists all spend entries with columns: Date, Type, Category, Description (with vendor), and Amount.

**Tips:**
- Set the approved budget early in the venture lifecycle.
- Use "Committed" type for purchase orders that have been raised but not yet invoiced.
- Review variance regularly and update the forecast when estimates change.

---

## 10. Progress Updates

### 10.1 Progress History Page

**What it does:** Displays a timeline of all weekly progress updates submitted for a venture.

**Who can access:** All roles can view.

Each update is shown as a card on a vertical timeline, including:
- Week label (e.g., "W12 2026")
- Overall health status dot
- Completion percentage
- Submission date
- Narrative text describing what happened
- Next actions (if provided)

### 10.2 Submitting a Weekly Update (PM Only)

**Navigate to:** Click "Log This Week's Update" on the PM Dashboard, or navigate to the venture's weekly update page via the sidebar.

**Steps:**

1. **Overall Status** — select one of:
   - On Track (green)
   - At Risk (amber)
   - Off Track (red)

2. **Overall Completion %** — enter a number from 0 to 100.

3. **What happened this week** (required) — write a narrative summary of progress, setbacks, and changes.

4. **Workstream Updates** — for each workstream, update:
   - Status (Not Started, In Progress, Complete, On Hold)
   - Completion percentage
   The form pre-fills with current values from the plan.

5. **Milestones Completed This Week** — check the box next to any milestones achieved this week. Only open (not yet achieved) milestones are listed. Overdue milestones are highlighted in amber.

6. **Blockers** — type a description and press Enter or click Add. Multiple blockers can be added. These will be surfaced on the PMO Dashboard.

7. **Decisions Needed** — type a description and press Enter or click Add. Multiple decisions can be added. These will appear on the PMO Dashboard's Decisions tab.

8. **Next Week's Actions** — describe planned work for the coming week.

9. Click **Submit Update**.

**Important:** Once submitted, an update cannot be edited. Review all fields carefully before submitting.

**Tips:**
- Submit updates consistently each week for accurate trend reporting.
- Be specific about blockers and decisions needed so PMO can act on them.
- Workstream completion percentages submitted here will update the plan automatically.

---

## 11. Risks

**What it does:** Provides comprehensive risk management with quantitative scoring, weighted exposure calculation, a heatmap visualization, filtering, sorting, RAG rating, owner assignment, and escalation capabilities.

**Who can access:** All roles can view. PMO and PM can create, edit, and manage risks.

### 11.1 Risk Scoring Model

Risks are scored using a 5x5 matrix of **Likelihood** and **Impact**, each rated 1-5.

**Likelihood scale:**

| Score | Label |
|-------|-------|
| 1 | Rare |
| 2 | Unlikely |
| 3 | Possible |
| 4 | Likely |
| 5 | Almost Certain |

**Impact scale:**

| Score | Label |
|-------|-------|
| 1 | Negligible |
| 2 | Minor |
| 3 | Moderate |
| 4 | Major |
| 5 | Severe |

**Risk Score** = Likelihood x Impact (range: 1 to 25)

### 11.2 Score Bands

| Band | Score Range | Color | Label |
|------|-----------|-------|-------|
| Green | 1-4 | Emerald/green | Low |
| Yellow | 5-8 | Yellow | Medium-Low |
| Amber | 9-12 | Amber/orange | Medium |
| Red | 13-19 | Red | High |
| Dark Red | 20-25 | Dark red | Critical |

### 11.3 Weight

Each risk also has a **Weight** (1-5) that influences the weighted exposure calculation. Higher weight means the risk contributes more to the overall exposure score. Default weight is 3.

### 11.4 Risk Summary KPIs

The top of the risks page shows:

- **Total Open** — number of open risks
- **Highest Score** — the highest risk score among open risks (color-coded by severity)
- **Count by Band** — individual cards for each score band showing how many risks fall in each

- **Weighted Exposure** — a badge in the page header showing the overall weighted risk exposure for the venture

### 11.5 Heatmap

The 5x5 heatmap displays risks plotted by Likelihood (Y-axis, 5 at top) and Impact (X-axis, 1 to 5). Each cell shows:

- A background color indicating the score band
- A count of risks in that cell
- Cells with no risks appear at reduced opacity

**Interactive filtering:** Click any heatmap cell to filter the risk list to only show risks with that specific Likelihood and Impact combination. Click again to clear the filter. A "Clear heatmap filter" link appears below the heatmap when a filter is active.

### 11.6 Filter Controls

Below the heatmap, three dropdown filters allow narrowing the risk list:

| Filter | Options |
|--------|---------|
| Status | All Statuses, Open, Mitigated, Closed |
| Band | All Bands, Low (1-4), Med-Low (5-8), Medium (9-12), High (13-19), Critical (20-25) |
| Owner | All Owners, Unassigned, or any specific resource |

A "Clear filters" link appears when any filter is active.

### 11.7 Sort Controls

Risks can be sorted by clicking sort buttons:

- Score, Likelihood, Impact, Weight, RAG, Status, Title
- Click a sort button to sort by that field. Click again to toggle ascending/descending order.
- The active sort field is highlighted, with an arrow indicating direction.

### 11.8 RAG Rating

Each risk has a RAG (Red/Amber/Green) rating. By default, RAG is auto-calculated based on the risk score. However, users can override it:

- **Green** — risk is under control
- **Amber** — risk needs attention
- **Red** — risk is critical

An "(override)" label appears next to any risk where RAG has been manually set.

### 11.9 Risk Cards

Each open risk is displayed as a card with:

- Title
- Score badge (color-coded)
- Status badge (open/mitigated/closed)
- Description
- Detailed metrics: Likelihood (with label), Impact (with label), Weight, Owner name
- RAG badge
- Mitigation plan (if provided)
- Escalation path (if provided)
- Escalation status (red "Escalated" badge if escalated)

**Left border color** indicates RAG: red border for red RAG, amber for amber, green for green.

### 11.10 Logging a New Risk

1. Click the **Log Risk** button (top right).
2. Fill in the form:
   - **Title** (required) — concise name for the risk
   - **Description** (optional) — detailed explanation
   - **Likelihood** — click a value 1-5. Each button shows the numeric score and descriptive label.
   - **Impact** — click a value 1-5. Same selector format.
   - **Weight** — click a value 1-5. Higher = more influence on weighted exposure.
   - A **Score Preview** is shown automatically (Likelihood x Impact).
   - **Override auto RAG** — check this box to manually set the RAG rating instead of using the auto-calculated value. Select Green, Amber, or Red from the dropdown.
   - **Owner** — select a resource from the venture's assigned resources, or leave as "Unassigned"
   - **Escalation Path** — free text describing who to escalate to
   - **Mitigation Plan** — free text describing how the risk will be mitigated
3. Click **Log Risk**.

### 11.11 Editing a Risk

1. Click on any open risk card (the card is clickable for PMO and PM).
2. The risk form opens pre-populated with all current values.
3. Modify any fields.
4. Click **Update Risk**.

### 11.12 Risk Actions

Each open risk card has action buttons at the bottom:

| Action | Description |
|--------|-------------|
| **Escalate** | Flags the risk as escalated. Escalated risks appear on the PMO Dashboard and GM Dashboard. Only shown if not already escalated. |
| **Mark Mitigated** | Changes status to mitigated. Only shown if status is open. |
| **Close** | Changes status to closed. |

### 11.13 Closed and Mitigated Risks

Risks that are closed or mitigated are grouped under a collapsible "Closed / Mitigated Risks" section below the open risks list. Each entry shows the title, score, and status.

**Tips:**
- Use the heatmap to quickly identify clusters of high-scoring risks.
- Assign an owner to every risk for clear accountability.
- Use the weight field to differentiate between risks that have the same score but different real-world significance.
- Override RAG only when quantitative scores do not reflect the true situation (e.g., a low-score risk with disproportionate business impact).
- Escalate risks that require attention from PMO or GM.

---

## 12. Issues and Blockers

### 12.1 Issues

**What it does:** Tracks problems that have already occurred (as opposed to risks, which are potential future problems).

**Who can access:** All roles can view. PMO and PM can create and manage.

**Issue statuses:** Open, In Progress, Resolved

**Logging an Issue:**

1. On the Risks page, scroll to the **Issues** section.
2. Click **Log Issue**.
3. Fill in:
   - **Title** (required)
   - **Description** (optional)
   - **Severity** — Low, Medium, or High
   - **Resolution Plan** (optional) — how the issue will be resolved
   - **Owner** (optional) — who is responsible for resolving it
4. Click **Log Issue**.

**Managing Issues:**

Each issue card shows the title, status, severity, owner, resolution plan, and escalation status. Actions available:

| Action | Description |
|--------|-------------|
| **Escalate** | Flags the issue for PMO/GM attention. Shown only if not already escalated. |
| **In Progress** | Moves an open issue to in-progress status. |
| **Resolve** | Marks the issue as resolved. |

Resolved issues are grouped under a collapsible "Resolved Issues" section.

### 12.2 Blockers

**What it does:** Tracks items that are actively preventing progress on the venture.

**Who can access:** All roles can view. PMO and PM can create and resolve.

**Blocker statuses:** Open, Resolved

**Adding a Blocker:**

1. On the Risks page, scroll to the **Blockers** section.
2. Click **Add Blocker**.
3. Enter a description.
4. Submit the form.

Blockers can also be added during weekly update submission.

**Resolving a Blocker:**

Click the **Resolve** button on the blocker card. The blocker moves to the "Resolved Blockers" collapsible section.

**Where blockers surface:**
- PM Dashboard — open blockers appear in a red alert panel
- PMO Dashboard — open blockers appear in the Blockers tab
- Decisions surfaced via weekly updates appear in the PMO Dashboard Decisions tab

**Tips:**
- Use issues for problems that need tracking and resolution steps.
- Use blockers for items that are actively stopping progress and need immediate attention.
- Escalate issues that cannot be resolved at the PM level.

---

## 13. Activity Log

**What it does:** Provides a chronological audit trail of all changes made across ventures.

**Who can access:** PMO and PM only (not available to GM).

### 13.1 Viewing the Activity Feed

The activity page shows entries grouped by date, with the most recent changes at the top. Each entry displays:

| Element | Description |
|---------|-------------|
| Action icon | Visual indicator of the action type (created, updated, deleted, escalated, resolved, approved, rejected) |
| Action | The type of change, color-coded (green for creates/resolves, blue for updates, red for deletes/escalations/rejections) |
| Entity type | What was changed (e.g., workstream, milestone, risk, budget entry) |
| Field name | Which specific field changed (if applicable) |
| Old value | Previous value (shown with strikethrough) |
| New value | New value |
| Timestamp | Time of the change |

### 13.2 Scope

- **PMO users** see activity across all ventures.
- **PM users** see activity only for their assigned venture.

**Tips:**
- Use the activity feed to audit changes and understand the history of decisions.
- Check activity after receiving escalation notifications to understand context.

---

## 14. Approvals

**What it does:** Provides a workflow for PMO to review and approve or reject pending requests.

**Who can access:** PMO only.

### 14.1 Viewing Pending Approvals

Navigate to **Approvals** in the sidebar. The page lists all pending approval requests. Each card shows:

- Status badge
- Entity type (e.g., "budget entry", "venture")
- Creation date
- Notes (if provided by the requester)

### 14.2 Approving or Rejecting

1. Click **Approve** or **Reject** on the request card.
2. A confirmation modal appears.
3. Optionally add notes for the requester.
4. Click **Approve** or **Reject** to confirm.

When all approvals are cleared, the page shows an "All clear — No pending approvals" message.

**Tips:**
- Check the Approvals page regularly to avoid blocking other users.
- Use notes to explain rejection reasons so the requester can revise and resubmit.

---

## 15. Configuration

**What it does:** Manages the system-wide dropdown options used across the platform.

**Who can access:** PMO only.

### 15.1 Configuration Categories

| Category | Description | Used In |
|----------|-------------|---------|
| Role Titles | Job titles and roles | Resource creation |
| Departments | Internal departments | Resource creation (internal type) |
| Venture Types | Types of ventures | Venture creation |
| Budget Categories | Spending categories | Budget spend entries |
| Resource Types | Resource classification | Resource creation |

### 15.2 Viewing Options

Each category is displayed as a collapsible panel. Click the category header to expand or collapse it. The header shows the category name and the count of configured options.

When expanded, a table displays each option with columns: Label, Value, Order, Active (toggle switch), and Actions.

### 15.3 Adding an Option

1. Expand the target category.
2. Click **+ Add Option** at the bottom.
3. Fill in:
   - **Label** (required) — the display text shown in dropdowns
   - **Value** — the stored value (auto-fills from label if left blank)
   - **Order** — sort position (numeric, lower numbers appear first)
4. Click **Add**.

### 15.4 Editing an Option

1. Click **Edit** on the option row.
2. Modify the Label, Value, or Order fields.
3. Click **Save**.

### 15.5 Toggling Active/Inactive

Click the toggle switch in the Active column. Inactive options are not shown in dropdowns but remain in the system for historical data integrity.

### 15.6 Deleting an Option

1. Click **Delete** on the option row.
2. A confirmation prompt appears.
3. Click **Confirm** to permanently remove the option, or **Cancel** to abort.

### 15.7 Seeding Defaults

If any categories are empty, a **Seed Defaults** button appears in the page header. Click it to populate all empty categories with a standard set of options.

**Tips:**
- Configure dropdowns before creating resources and ventures so that users have consistent options available.
- Use the Active toggle to retire options without losing historical data.
- Sort order controls the position of options in dropdown menus across the platform.

---

## Appendix: Keyboard Shortcuts and Quick Actions

| Action | How |
|--------|-----|
| Navigate modules | Click sidebar tabs |
| Expand/collapse workstream | Click workstream row (Plan, Gantt) |
| Filter risks by heatmap cell | Click heatmap cell |
| Clear heatmap filter | Click "Clear heatmap filter" link |
| Add blocker in weekly update | Type and press Enter |
| Add decision in weekly update | Type and press Enter |

---

*End of ORBIT Platform User Manual*
