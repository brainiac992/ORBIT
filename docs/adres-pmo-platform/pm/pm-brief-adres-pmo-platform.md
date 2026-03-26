# Program Brief — ADRES PMO Platform
**Date:** 2026-03-26
**Status:** Approved ✅
**Author:** PM Agent
**Organisation:** ADRES (Abu Dhabi Real Estate)

---

## 1. Executive Summary

Build a web-based PMO platform for ADRES that gives project managers a clean workspace to create and manage ventures, and gives the General Manager and PMO lead a clear, uncluttered view of portfolio health. The system replaces the current dense reporting format (see /Sources screenshots) with a progressive disclosure model — show what matters most first, let users drill in when they want more.

---

## 2. Problem Statement

ADRES currently tracks project performance through dense, all-on-one-page reports (see reference screenshots) that pack 40+ data points onto a single view. The cognitive load is too high — PMs, PMO, and the GM see everything at once with no hierarchy of importance. The result: critical signals (overdue milestones, budget overruns, escalations) compete with routine operational detail and get missed.

There is no centralised system for project managers to create projects, maintain project plans, manage resources, or log progress. Everything is currently manual and report-driven.

---

## 3. Stakeholders

| Stakeholder | Role | Primary Need |
|---|---|---|
| General Manager | Executive consumer | Portfolio health at a glance — are we on track? What needs my attention? |
| PMO Lead | System owner + consumer | Cross-venture visibility, escalation management, governance |
| Project Managers (3–7) | Primary users | Create and manage their venture — plan, resources, progress updates |
| Ventures | Subjects of tracking | 3–7 active ventures at any given time |

---

## 4. Success Metrics

- A GM can see the health of all ventures in under 10 seconds without scrolling
- A PM can log a weekly progress update in under 5 minutes
- No dashboard view contains more information than a user needs for their role
- PMO lead can identify any at-risk venture and its top blocker without clicking more than twice

---

## 5. Scope — v1

**In scope:**
- Venture (project) creation and management
- Project plan — milestones, phases, key dates
- Resource management — assign people to ventures, track allocation
- Progress logging — weekly updates, status (On Track / At Risk / Off Track), completion %
- Dashboards — GM view (portfolio health), PMO view (cross-venture detail), PM view (my venture)
- Risk and issue tracking per venture
- Role-based access — GM, PMO, PM roles with appropriate views

**Out of scope for v1:**
- JIRA integration (deferred to v2)
- Confluence integration (deferred to v2)
- ~~Budget and financial tracking~~ — **confirmed IN scope for v1**
- Mobile app (web responsive is acceptable)
- External stakeholder / client portal

---

## 6. Constraints

- Must be a web application
- No technology stack restrictions
- No hard deadline specified — velocity over deadline
- Scale: 3–7 ventures, ~5–10 users — not enterprise scale, keep it lean

---

## 7. Design Principle (Non-Negotiable)

**Progressive disclosure over data density.** Every view shows the minimum needed for that role's decisions. Detail is one click away, never forced on screen. The GM landing page shows health tiles only. The PM workspace shows only their venture. No view replicates the cognitive load of the reference screenshots.

---

## 8. Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| GM's actual needs differ from "portfolio health" assumption | 🟡 Medium | PM Summary flags this — confirm with GM before Architect commits to dashboard design |
| Scope creep into JIRA integration mid-build | 🟡 Medium | v2 gate is explicit in scope — any integration request is formally deferred |
| "Intuitive" is subjective — risk of rework after GM sees first build | 🟠 High | UI-Designer produces wireframes for GM review before any frontend build begins |
| 3–7 ventures today could grow — data model must not be designed for exactly 7 | 🟢 Low | DB-Agent designs for growth, not current headcount |

---

## 9. Open Questions for BA

- Should budget / financial tracking be part of v1 or explicitly deferred?
- What is the weekly reporting cadence — do PMs push updates, or does the system remind them?
- Are ventures cross-functional (multiple PMs per venture) or one PM owns one venture?
- What does "resource management" mean at ADRES — headcount allocation, or also external vendors/contractors?
- Is there an existing user directory (Active Directory, SSO) or do we build standalone auth?
- What data from the reference screenshots is actually useful vs what is noise?

---

## 10. v2 Backlog (Pre-committed deferrals)

- JIRA integration — pull project data automatically
- Confluence integration — link documentation to ventures
- Budget / financial tracking (if confirmed out of v1 scope)
- Client-facing portal
- Mobile application
