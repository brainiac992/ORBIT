# PM Post-BA Summary — Jira Cloud Integration (Jira → ORBIT)
**Date:** 2026-04-08
**Author:** PM Agent
**Program Brief:** /docs/jira-integration/pm/pm-brief-jira-integration.md
**Requirements Document Reviewed:** /docs/jira-integration/ba/requirements-document.md
**Verdict:** ALIGNED

---

## Scope Alignment

Requirements stay within approved brief scope. Every major deliverable from the brief has a corresponding functional requirement in the RD. The one-way direction (Jira → ORBIT only), API token auth, hard-delete-on-import, soft-delete on ongoing deletions, webhook HMAC validation, 15-minute reconciliation, sync status dashboard, and per-venture controls are all fully represented and specified at sufficient detail for architecture and implementation.

No requirements were removed or downgraded from what was approved.

---

## Coverage Assessment

### Brief Section 5 — In Scope vs. RD Coverage

| Brief Scope Item | RD Coverage | Assessment |
|---|---|---|
| Jira connection setup (URL, email, token, test button, encrypted storage) | FR-001, FR-002, FR-003 | Full |
| Webhook auto-registration vs. manual (was an open question) | FR-004 — resolved as auto-registration on save | Full |
| Initial import — hard delete then bulk create | FR-008 through FR-015 | Full |
| Entity mapping (Venture, Workstream, Milestone, Risk, Issue, Progress Update) | FR-016 through FR-022 | Full |
| Status mapping with configurable override | FR-018, FR-027-UI | Full |
| Ongoing sync via webhook (issue_created, issue_updated, issue_deleted, comment_created) | FR-023, FR-024, FR-025 | Full |
| HMAC webhook validation — mandatory | FR-024 | Full |
| Idempotent webhook processing | FR-026 | Full |
| 15-minute reconciliation job | FR-027 | Full |
| Sync Status Dashboard (RAG, error log, re-sync, wipe-and-reimport) | FR-029 through FR-032 | Full |
| Per-venture sync health visible to PMs | FR-033 | Full |
| Per-venture Jira project key display | FR-034 | Full |
| Sync enable/disable toggle per venture | FR-035 | Full |
| Jira-deleted issues soft-deleted in ORBIT (not hard-deleted) | FR-036 | Full |

All five in-scope groups from the brief are covered. Nothing was dropped.

### Open Questions from Brief Section 9 — Resolution Status

| Question | Resolution in RD |
|---|---|
| Status mapping defaults | Confirmed as To Do → not_started, In Progress → in_progress, Done → complete, everything else → on_hold. Admin override UI included from day one (FR-027-UI). |
| Reconciliation interval configurability | Hardcoded at 15 minutes for v1. Not configurable. Documented in RD Section 12 out-of-scope list. |
| Webhook registration method | Auto-registered by ORBIT via Jira API on credential save (FR-004). PMO admin does not touch Jira webhook settings. |
| Import failure recovery UX | No partial resume. Failure after hard-delete surfaces an error with a "Retry Import" button that re-runs from scratch (FR-010). Decision is explicit. |

All four open questions are answered. None were left open or punted.

---

## Scope Additions in RD Not Explicitly in Brief

The following items appear in the RD but were not named explicitly in the brief. Each is assessed for justification.

**1. Sync System User (FR-028)**
A pre-seeded ORBIT user record (`sync@orbit.internal`) acts as the actor for all audit log entries created by the sync process. Not named in the brief but directly implied by the brief's requirement that sync events write to the existing audit trail. This is an implementation necessity, not scope expansion. Accepted.

**2. Jira-Managed Venture Edit Lock (FR-015)**
Ventures created by import are flagged as Jira-managed and their standard edit UI is disabled. Not stated explicitly in the brief. However, it is a logical consequence of "Jira is the source of truth and ORBIT never pushes back." Allowing PMs to manually edit a synced venture would immediately create drift the brief was designed to eliminate. This is a safety requirement, not drift. Accepted.

**3. Concurrent Import Lock (Edge Case — Section 11)**
If a second import is triggered while one is running, the second is rejected with a clear error. The brief did not specify this scenario. It is a necessary guard against data corruption and is low-complexity. Accepted.

**4. Disconnect Behaviour (FR-007)**
PMO admin can disconnect Jira integration, which deregisters the webhook and clears credentials but does NOT delete synced ventures. The brief scoped the disconnect action implicitly (settings screen) but did not describe the behaviour. The RD's choice to preserve venture data on disconnect is correct and safe. Accepted.

**5. Fourth Database Table — `jira_status_mappings`**
The brief listed three new tables (`jira_connections`, `jira_sync_mappings`, `jira_sync_log`). The RD adds a fourth: `jira_status_mappings`. This table is required to store PMO admin overrides to the status mapping, which the brief explicitly included as a feature. The brief's table list was incomplete, not the RD's fault. The Architect must note that the migration covers four tables, not three.

**6. Encryption Key Environment Variable (`JIRA_ENCRYPTION_KEY`)**
The RD names a new required environment variable for AES-256 encryption of the API token. The brief required encrypted storage but did not name the implementation mechanism. This is an engineering dependency that must be set before the feature can be used. The Architect should flag this in the deployment plan.

None of these additions represent scope drift that requires brief revision or user escalation.

---

## New Risks Surfaced by BA

The following risks appear in the RD that were not in the brief's Risk Register or are materially more specific:

| Risk | Source | Assessment |
|---|---|---|
| Concurrent import trigger creates data corruption | Section 11 edge case | Mitigated by the import lock requirement. Not in brief R-register. Low residual risk. |
| Sync system user not seeded at startup causes application failure | FR-028 / Section 11 | RD requires startup to fail loudly if user is missing. Acceptable mitigation. |
| `JIRA_ENCRYPTION_KEY` not set in Railway environment | Section 13 dependencies | Deployment dependency. Architect must include env var in deployment checklist. |
| Jira issue type "Risk" + priority "Blocker" simultaneously | Section 11 edge case | FR-020 takes precedence (Risk wins over Blocker). Tie-breaking rule is explicit. |

None of these surfaced risks change the initiative scope or require escalation. They are all addressed within the RD itself.

---

## One Genuine Concern for the Architect

The RD specifies the webhook route must be registered BEFORE the global `express.json({ limit: '50kb' })` middleware (FR-023, NFR-006). This is a correct and critical requirement. The Architect must treat this as a hard constraint on server bootstrap order in `server/index.ts`, not a preference. If the global body parser runs first, Jira payloads exceeding 50kb will be rejected with HTTP 413 before HMAC validation runs, silently breaking sync for large events. The middleware registration order must be verified in the implementation plan and in acceptance testing.

---

## Recommendation

**PROCEED to Architect.**

The Requirements Document is complete, internally consistent, and aligned with the approved brief. All open questions are resolved. Scope additions are justified implementation necessities, not drift. The Architect has sufficient detail to produce a system design and implementation plan.

The Architect should note three constraints going into design:
1. Four DB tables are required (brief listed three).
2. Webhook Express route must be registered before global JSON middleware — this is a hard constraint.
3. A new environment variable (`JIRA_ENCRYPTION_KEY`) must be included in the Railway deployment configuration.
