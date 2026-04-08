# Program Brief — Jira Cloud Integration (Jira → ORBIT)
**Date:** 2026-04-08
**Status:** Completed — 2026-04-08
**Author:** PM Agent
**Revised:** 2026-04-08 — scope narrowed to one-way (Jira → ORBIT), API token auth, hard-delete-and-reimport confirmed

## 1. Executive Summary

ORBIT PMO platform will integrate with Jira Cloud in one direction: Jira is the source of truth, ORBIT is the destination. All Jira projects will be imported as ORBIT ventures. Existing ORBIT data will be hard-deleted before import. Ongoing sync will keep ORBIT updated as Jira changes via inbound webhooks. ORBIT will never push changes back to Jira.

## 2. Problem / Opportunity Statement

PMs spend 2-4 hours per week per venture manually copying Jira epics and stories into ORBIT. ORBIT data goes stale within hours. This integration eliminates manual data entry by making Jira the authoritative source and ORBIT a live consumer of that data.

## 3. Stakeholders

| Stakeholder | Role | Interest / Expectation |
|---|---|---|
| PMO Admin | Setup & Configuration | Enter API token once, trigger import, trust ORBIT reflects Jira |
| Project Manager | Daily User | ORBIT automatically reflects Jira state — no manual entry |
| General Manager | Visibility Consumer | Portfolio dashboards always current |
| Delivery Team (Jira users) | Indirect | No change to their Jira workflow whatsoever |

## 4. Success Metrics

- **Initial import completes in < 5 minutes** for up to 500 issues per project
- **Sync latency < 60 seconds** — a Jira change reflects in ORBIT within one minute via webhook
- **Zero manual data entry** for connected ventures
- **Zero silent data loss** — every sync failure is logged and surfaced
- **All Jira projects imported as ventures** — 100% coverage on initial sync

## 5. Scope

### In Scope

1. **Jira Connection Setup**
   - PMO admin enters: Jira Cloud instance URL (*.atlassian.net), email address, API token
   - "Test connection" button validates credentials against Jira API before saving
   - Credentials stored encrypted at rest, never displayed in cleartext after entry
   - Auth method: API token (Basic Auth — email + token). OAuth deferred.

2. **Initial Import — All Projects**
   - On first connect (or manual re-import trigger): hard-delete ALL existing ORBIT ventures, workstreams, milestones, risks, issues, and progress updates
   - Pull every Jira project → create one ORBIT venture per project
   - Pull all epics, stories/tasks, issues (all statuses, all history — no filtering)
   - Entity mapping:

   | ORBIT Entity | Jira Entity | Notes |
   |---|---|---|
   | Venture | Project | One venture per Jira project |
   | Workstream | Epic | Name, status, completion % |
   | Milestone | Story / Task | Name, due date, status |
   | Risk | Issue (type: Risk or label: orbit-risk) | Falls back to label if no custom type |
   | Issue | Issue (priority: Blocker) | Blocker-priority issues become ORBIT issues |
   | Progress Update | Comment on Epic | Epic comments imported as progress notes |

   - Status mapping: Jira statuses mapped to ORBIT statuses (`not_started`, `in_progress`, `complete`, `on_hold`) — configurable after import if mapping is wrong
   - Import is idempotent via sync ID table — re-running does not create duplicates (except when explicitly triggered as a fresh wipe)
   - Preview screen before hard-delete execution showing: X ventures, Y workstreams, Z milestones to be deleted and recreated

3. **Ongoing Sync (Jira → ORBIT only)**
   - ORBIT exposes a webhook endpoint that receives Jira events: issue-created, issue-updated, issue-deleted, comment-created
   - Webhook secret (HMAC) validation — mandatory, not optional
   - ORBIT processes events and updates corresponding entities
   - Jira issue deleted → ORBIT entity soft-deleted (archived, not hard-deleted — safety measure for ongoing deletes, unlike initial import)
   - Periodic reconciliation job every 15 minutes as safety net for missed webhooks
   - No outbound push: ORBIT never writes to Jira

4. **Sync Status Dashboard**
   - Last successful sync time per venture
   - Error log: entity, error message, timestamp, retry status
   - Global sync health overview (green/amber/red per venture)
   - Manual "re-sync" button per venture
   - Manual "wipe and reimport all" button (PMO only) — fires Risk Gate in UI before executing

5. **Per-Venture Jira Link Visibility**
   - Each venture shows its linked Jira project key
   - Sync enabled/disabled toggle per venture (pause without losing config)

### Out of Scope

- **ORBIT → Jira push** — deferred. Jira is read-only from ORBIT's perspective.
- **OAuth 2.0** — deferred. API token is sufficient for v1.
- **Jira Server / Data Center** — Jira Cloud only
- **Confluence, sprints, time tracking, custom fields** — not mapped
- **Multi-Jira-instance** — single Jira Cloud instance per ORBIT deployment
- **Bidirectional conflict resolution** — not needed; Jira always wins
- **Jira permissions/role sync** — not in scope

## 6. User Stories

### PMO Admin
- As a PMO admin, I want to enter my Jira API token once and test the connection so I know it works before committing.
- As a PMO admin, I want to trigger an initial import that creates one ORBIT venture per Jira project, pulling all data.
- As a PMO admin, I want to see a preview of what will be deleted and created before I confirm the import.
- As a PMO admin, I want a global sync dashboard so I can spot failures before PMs notice them.

### Project Manager
- As a PM, I want ORBIT to automatically reflect changes made in Jira so I never have to manually update ORBIT.
- As a PM, I want to see when my venture last synced and whether there are errors.
- As a PM, I want to pause sync for my venture without losing the Jira link configuration.

### General Manager
- As a GM, I want to know which ventures are Jira-synced and whether their data is current.

## 7. Risk Register

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | **Hard delete is irreversible** — wiping all ORBIT data before import cannot be undone if import fails midway | HIGH | Show explicit preview + confirmation screen. Wrap delete+import in a transaction or use batch markers. If import fails, surface error with retry — do not leave ORBIT in empty state. |
| R2 | **Jira API rate limits** — bulk import of many projects could hit limits (~100 req/10s for Basic Auth) | HIGH | Implement request queuing with exponential backoff. Process projects sequentially, not in parallel. |
| R3 | **Webhook reliability** — Jira webhooks can be delayed, dropped, or out of order | HIGH | 15-minute reconciliation job as safety net. Idempotent webhook processing. |
| R4 | **API token tied to one user** — if that user's account is deactivated, sync breaks silently | MEDIUM | Store the account email alongside the token. Periodic validation ping. Alert PMO admin on auth failure. |
| R5 | **Schema drift** — Jira workflow statuses change after mapping is configured | MEDIUM | Validate mapping on each sync. Queue unknown statuses as errors with clear messages. |
| R6 | **Large Jira projects** — projects with thousands of issues could cause timeout on initial import | MEDIUM | Paginate Jira API calls. Show progress indicator during import. Resume from last successful page on retry. |

## 8. Dependencies

- Active Jira Cloud instance (*.atlassian.net)
- PMO admin generates API token: Atlassian account → Settings → Security → API tokens
- ORBIT Railway deployment exposes stable HTTPS URL for webhook callbacks (already in place)
- New DB tables: `jira_connections`, `jira_sync_mappings`, `jira_sync_log` — additive only
- Existing ORBIT audit trail hooks extended to consume (not emit) sync events

## 9. Open Questions for BA

1. **Status mapping defaults** — propose a default mapping (To Do→not_started, In Progress→in_progress, Done→complete, anything else→on_hold). BA to validate whether this covers the org's Jira workflows or if custom mapping UI is needed from day one.
2. **Reconciliation job configuration** — should the 15-minute interval be configurable by PMO admin, or is it hardcoded for v1?
3. **Webhook registration** — should ORBIT auto-register the Jira webhook via API on connection setup, or does the PMO admin manually create the webhook in Jira settings?
4. **Import failure recovery** — if the hard-delete runs but the import fails at 60%, what is the recovery UX? Re-run from scratch, or resume from last successful batch?
