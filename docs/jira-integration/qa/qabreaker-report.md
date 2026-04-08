# QA Report — Jira Integration — Adversarial
**Date:** 2026-04-08
**QA Round:** 1
**Agent:** QA-Breaker
**Verdict:** FAIL

---

## Attack Results

### Import Orchestrator Attacks

| Attack | Target | Result | Severity |
|--------|--------|--------|----------|
| Hard-delete runs, Jira API fails on page 3 of 10, lock released? | `jiraImport.ts:runFullImport` | FAIL — ORBIT left empty, lock IS released, no retry-recovery | CRITICAL |
| Two admins trigger import simultaneously — does lock prevent double-execution? | `jiraImport.ts:runFullImport` + `jira.ts:triggerImport` | FAIL — TOCTOU race between lock check and lock set | HIGH |
| Jira project has 0 epics, 0 issues | `jiraImport.ts:runFullImport` | PASS — handles correctly, writes warning log | LOW |
| Issue type is "Risk" AND priority is "Blocker" — which wins? | `jiraMappers.ts:classifyIssue` | PASS — risk wins, deterministic | LOW |
| Jira returns due date in non-ISO format (e.g. "30/06/2026") | `jiraMappers.ts:isoDateOnly` | FAIL — silently produces garbage date string, no validation | HIGH |
| Jira project key contains special characters (e.g. "MY PROJECT") | `jiraClient.ts:getProjectIssues` | FAIL — project key used unencoded in JQL, breaks query | HIGH |
| `mapIssueToMilestone` called with null summary | `jiraMappers.ts:mapIssueToMilestone` | FAIL — `truncate(null, 255)` returns `''`, DB inserts empty name | MEDIUM |
| `mapEpicToWorkstream` called with null summary | `jiraMappers.ts:mapEpicToWorkstream` | FAIL — same as above, empty workstream name | MEDIUM |
| Import succeeds on 8 of 10 projects, 2 silently fail | `jiraImport.ts:runFullImport` | FAIL — job reports "Complete", no UI-level failure signal | HIGH |

### Webhook Handler Attacks

| Attack | Target | Result | Severity |
|--------|--------|--------|----------|
| HMAC signature missing | `jiraWebhook.ts` | PASS — returns 401 correctly | LOW |
| HMAC signature present but wrong | `jiraWebhook.ts` | PASS — returns 401 correctly | LOW |
| Webhook event for issue not in jira_sync_mappings | `jiraWebhook.ts:handleIssueUpdated` | PASS — attempts creation via handleNewIssueFromWebhook | LOW |
| Same event delivered twice (duplicate delivery) | `jiraWebhook.ts:isDuplicateEvent` | PASS — idempotency key check prevents duplicate entity | LOW |
| Webhook payload > 50kb | `jiraWebhook.ts` | PASS — no size limit applied to raw route | LOW |
| Empty webhookSecret in DB (after disconnect, reconnect flow) | `jiraWebhook.ts:validateHmacSignature` | FAIL — if webhookSecret is `''`, HMAC computed with empty key accepts forged requests matching empty-key signature | CRITICAL |
| `comment_created` with no `comment` field in payload | `jiraWebhook.ts:handleCommentCreated` | PASS — early return on `!comment` | LOW |
| `jira:issue_updated` on an issue where venture has `jiraSyncEnabled=false` | `jiraWebhook.ts:handleIssueUpdated` | FAIL — lookup for mapping succeeds but venture sync disabled check absent on update path | MEDIUM |

### Reconciliation Job Attacks

| Attack | Target | Result | Severity |
|--------|--------|--------|----------|
| Reconciliation runs while import is in progress | `jiraReconciliation.ts:reconcileConnection` | FAIL — no importLock check; reconciliation writes new entities over half-deleted state | CRITICAL |
| Jira API returns 401 during reconciliation | `jiraReconciliation.ts:reconcileConnection` | PASS — sets status=error, halts sync | LOW |
| Reconciliation detects update for deletedInJira=true entity | `jiraReconciliation.ts` | FAIL — `applyIssueUpdate` runs UPDATE on soft-deleted entities, potentially un-deleting them visually | HIGH |
| Reconciliation issue fetch hardcoded to maxResults=100 — project with >100 recent changes | `jiraReconciliation.ts` line 176 | FAIL — beyond 100 updated issues silently missed, no pagination | HIGH |

### Encryption Attacks

| Attack | Target | Result | Severity |
|--------|--------|--------|----------|
| JIRA_ENCRYPTION_KEY changes between saves | `encryption.ts:decryptToken` | PASS — throws descriptive error, surfaces to caller | LOW |
| Empty string token submitted via saveConnection | `jira.ts:saveConnection` | PASS — apiTokenSchema min(1) rejects at input validation | LOW |
| Whitespace-only token (e.g. "   ") | `jira.ts:saveConnection` | FAIL — passes min(1) validation, encrypts and stores a whitespace token | MEDIUM |
| `getKey()` uses only first 32 bytes of a longer key | `encryption.ts:getKey` | Noted — functional but means rotating from a 64-char key to a different 64-char key with same first 32 chars cannot be detected | LOW |

### Entity Mapper Attacks

| Attack | Target | Result | Severity |
|--------|--------|--------|----------|
| Jira issue with null/missing summary field | `jiraMappers.ts:mapIssueToMilestone` | FAIL — `truncate(null, 255)` returns `''`, DB inserts row with empty name | MEDIUM |
| Jira comment with body=null | `jiraMappers.ts:mapCommentToProgressUpdate` | PASS — falls back to `'[No text content]'` | LOW |
| `mapProjectToVenture` with `description: undefined` calls `truncate(undefined, undefined)` | `jiraMappers.ts:mapProjectToVenture` line 165 | FAIL — `truncate(undefined as any)` passes through fine BUT the `max` param is `undefined as any` meaning the length check `text.length <= max` evals as `N <= undefined` → `false`, causing truncation attempt on any non-null description | MEDIUM |

### Auth / Access Control Attacks

| Attack | Target | Result | Severity |
|--------|--------|--------|----------|
| PM calls `getVentureSyncDetail` for another PM's venture | `jira.ts:getVentureSyncDetail` | PASS — forbidden check present | LOW |
| GM calls `getVentureSyncDetail` | `jira.ts:getVentureSyncDetail` | PASS — returns minimal view, no log | LOW |
| GM calls `setSyncEnabled` | `jira.ts:setSyncEnabled` | PASS — forbidden | LOW |
| Unauthenticated request to any tRPC procedure | tRPC middleware | PASS — protectedProcedure requires session | LOW |
| PM calls `triggerVentureResync` | `jira.ts:triggerVentureResync` | PASS — requireRole('pmo') blocks it | LOW |

### Report / Dashboard Integrity Attacks

| Attack | Target | Result | Severity |
|--------|--------|--------|----------|
| getSyncDashboard with venture that has never synced | `jira.ts:getSyncDashboard` | FAIL — `minutesSinceSync = (now - 0) / 60000` = very large number → RAG always `red` for never-synced ventures. An unimported venture shows red, not a neutral "not yet synced" state | MEDIUM |
| getImportStatus after server restart (job IDs are in-memory) | `jira.ts:getImportStatus` | Known design gap — throws NOT_FOUND. Not a bug per se but a usability failure that could cause operators to think an import was lost | LOW |

---

## Critical Vulnerabilities Found

### CRITICAL-1: Empty ORBIT state on partial import failure (FR-010 violated)
- **File:** `server/services/jiraImport.ts`, lines 285–515
- **Attack vector:** Hard-delete succeeds (line 294). Import then calls `jiraClient.getProjectIssues` which throws on page 3 of 10 due to a Jira 500 error. The `catch` block inside the per-project loop (line 503) absorbs the error and sets `job.errors.push(msg)` — but does NOT re-throw. The outer try/catch never fires. Import continues to the success path (line 518), updates `lastValidatedAt`, sets job phase to `'Complete'`. ORBIT is now empty (or partially populated) and the UI reports success.
- **Problem:** FR-010 explicitly states: "The system must NOT leave ORBIT in an empty state. The UI must surface a clear, specific error message." The current code violates this by: (a) continuing past failed projects silently; (b) marking the job "Complete" even when all projects failed; (c) writing a success log entry even with errors.
- **Expected:** If any project import fails after hard-delete has already run, the job status must be `failed`, the UI must show an actionable error, and the "Retry Import" button must appear.
- **Fix:** If `job.errors.length > 0` after all projects are processed, set `job.failed = true`, `job.phase = 'Failed'`, and write an `error`-level sync log entry. Alternatively, treat any per-project failure as fatal and abort + surface immediately.

---

### CRITICAL-2: TOCTOU race condition on import lock — double import possible
- **File:** `server/routers/jira.ts` lines 248–256, `server/services/jiraImport.ts` lines 272–279
- **Attack vector:** Two PMO admins (or one admin double-clicking) send `triggerImport` mutations within milliseconds of each other. Both read `conn.importLock = false` from the DB simultaneously (line 248 in the router, line 272 in runFullImport). Both pass the check. Both call `runFullImport`. Both set `importLock = true` — this is a non-atomic read-then-write. Two full hard-delete-then-import sequences now run concurrently. Data is deleted twice, FK constraint violations are likely, and ORBIT ends in an inconsistent state.
- **Problem:** The lock is checked in two places (router and orchestrator) with no atomic guarantee. A PostgreSQL-level advisory lock or `UPDATE ... SET import_lock=true WHERE import_lock=false RETURNING id` (conditional update) would prevent this.
- **Expected:** Only one import can run at a time. The second caller must receive a clear `CONFLICT` error before any data is touched.
- **Fix:** Replace the check-then-set pattern with a single atomic conditional update: `UPDATE jira_connections SET import_lock=true WHERE id=$1 AND import_lock=false RETURNING id`. If 0 rows are updated, another import is already running — reject immediately.

---

### CRITICAL-3: Reconciliation job runs concurrently with import — corrupts half-deleted state
- **File:** `server/services/jiraReconciliation.ts:reconcileConnection`, no importLock check
- **Attack vector:** Import starts. Hard-delete completes. The 15-minute reconciliation job fires (or a manual `triggerVentureResync` is called). Reconciliation queries `jiraSyncMappings` which is now empty (cleared in step 3 of import). It finds no mappings, calls `handleNewIssueFromWebhook` to create new entities. Meanwhile, the import also creates entities. Result: duplicate ventures, workstreams, milestones, or DB constraint failures from concurrent inserts to the same tables.
- **Problem:** `reconcileConnection` never checks `conn.importLock`. There is no coordination between the import and reconciliation paths.
- **Expected:** If `importLock=true`, reconciliation must skip that connection and log a warning.
- **Fix:** At the top of `reconcileConnection`, after loading the connection, check `if (conn.importLock) { log warning; return; }`.

---

### CRITICAL-4: Webhook accepted with empty HMAC secret after saveConnection overwrites with empty string on disconnect
- **File:** `server/routers/jira.ts` lines 205–217, `server/webhooks/jiraWebhook.ts` lines 51–69
- **Attack vector:** Admin disconnects the integration. `disconnect` sets `webhookSecret: ''` in the DB. If the connection is somehow queried at status `'connected'` (e.g. a race or a status bug), `validateHmacSignature` computes HMAC with key `''`. An attacker who knows the webhook URL can compute the HMAC of any payload using an empty key and have it accepted.
- **More immediate attack:** The webhook route queries `where(eq(jiraConnections.status, 'connected'))`. After disconnect, status is `'disconnected'`, so no connection is found and the webhook returns 503 — correct. However, there is no guard: if the status is `'error'` (set by a failed auth ping), the query also returns no rows, and legitimate Jira webhooks are silently dropped with 503, stalling sync without clear alert. This is a silent data-loss scenario.
- **Fix:** For the empty-secret risk: add a guard in `validateHmacSignature` — if `secret` is empty string, always return false. For the 503-on-error-status issue: webhooks should still be processed when status is `'error'` — the auth failure should only block reconciliation, not incoming webhooks.

---

### HIGH-1: Non-ISO due date format produces garbage date, silently stored
- **File:** `server/services/jiraMappers.ts:isoDateOnly`, line 82–85
- **Attack vector:** Jira returns `duedate: "30/06/2026"` (European format, valid in some Jira configurations). `isoDateOnly` does `isoString.slice(0, 10)` → `"30/06/2026"`. This is stored in `milestones.dueDate` (a `date` column). PostgreSQL will reject this with a constraint error, crashing the insert for that milestone and any subsequent issues in the same project.
- **Problem:** No format validation before slicing. The date string is assumed to be ISO 8601.
- **Fix:** Validate the slice result matches `/^\d{4}-\d{2}-\d{2}$/` before returning. If not, attempt `new Date(isoString).toISOString().slice(0, 10)` as a fallback, and log a warning.

---

### HIGH-2: Project key used unencoded in JQL inside getProjectIssues
- **File:** `server/services/jiraClient.ts:getProjectIssues`, line 226
- **Attack vector:** Jira project key `MY PROJECT` (with space) or `TEST&DEMO` (with ampersand) is passed into JQL as `project=MY PROJECT` — this is not quoted. JQL requires string values with spaces to be quoted: `project="MY PROJECT"`. The API returns a 400, throwing an error that aborts the entire import for that project.
- **Problem:** Project key is directly interpolated into JQL without quoting or encoding.
- **Fix:** Wrap the project key in double-quotes in the JQL string: `` `project="${projectKey}"` ``. Apply the same fix to the `getEpics` call and the reconciliation JQL in `jiraReconciliation.ts` line 173.

---

### HIGH-3: Reconciliation silently misses issues beyond 100 per 20-minute window
- **File:** `server/services/jiraReconciliation.ts`, line 176
- **Attack vector:** A busy Jira project has 150 issues updated in the last 20 minutes (sprint end, bulk transition). The reconciliation query uses `maxResults=100` with no pagination loop. 50 issues are silently never reconciled. Over time, ORBIT drifts from Jira with no log entry indicating missed issues.
- **Problem:** The reconciliation JQL fetch is not paginated. This violates FR-027's requirement to "fetch the full current state from Jira."
- **Fix:** Wrap the reconciliation fetch in the same pagination pattern used in `getProjectIssues` — loop until `all.length >= total`.

---

### HIGH-4: Partial import success reported as "Complete" — misleads PMO admins
- **File:** `server/services/jiraImport.ts`, lines 518–533
- **Attack vector:** Jira has 10 projects. 3 fail due to API errors. The per-project catch on line 503 absorbs each failure. The import writes a success log at line 518 with "3 errors" in the payload field, sets phase to `'Complete'`. The dashboard shows green. The PMO admin has no idea 3 projects were not imported.
- **Problem:** A job is marked `Complete` even when it has errors. The `job.failed` flag is never set for per-project failures — only for fatal errors that hit the outer catch. This is a data integrity failure: the admin believes 10 ventures are in ORBIT but only 7 exist.
- **Fix:** If `job.errors.length > 0`, set `job.failed = true` and use a distinct phase label like `'Completed with errors'`. The UI must display a warning state, not a success state, when errors occurred.

---

### HIGH-5: `applyIssueUpdate` updates soft-deleted entities
- **File:** `server/services/jiraReconciliation.ts:applyIssueUpdate`, lines 277–322
- **Attack vector:** An issue is soft-deleted (`deletedInJira=true`) via `jira:issue_deleted` webhook. Later, Jira fires `jira:issue_updated` for the same issue ID (e.g. a status comment was added before the delete event arrived). The webhook handler calls `applyIssueUpdate`, which does an unconditional `UPDATE ... WHERE id=$1` — no check for `deletedInJira`. The entity's title/status is updated and it appears "active" again in any query that doesn't filter on `deletedInJira`.
- **Fix:** Add `AND deleted_in_jira=false` to every update WHERE clause in `applyIssueUpdate`, or check the flag before calling the function.

---

### MEDIUM-1: Whitespace-only API token accepted and encrypted
- **File:** `server/routers/jira.ts`, `apiTokenSchema`, line 45
- **Attack vector:** User submits token `"   "` (3 spaces). The schema passes `min(1)`. The token is encrypted and stored. `testConnection` is called with `"   "` — Jira returns 401. `saveConnection` throws `BAD_REQUEST` and the bad token is NOT stored — so this path is actually blocked by the test-first check. **However**, `testConnection` (the standalone mutation, not `saveConnection`) still processes and returns the Jira API response without validation, and the token schema passes. This creates inconsistency in error messaging.
- **Fix:** Add `.trim().min(1)` or a `.refine((s) => s.trim().length > 0)` to `apiTokenSchema`.

---

### MEDIUM-2: `mapProjectToVenture` calls `truncate` with `undefined as any` for `max`
- **File:** `server/services/jiraMappers.ts:mapProjectToVenture`, line 165
- **Attack vector:** Any project with a non-null description hits `truncate(project.description, undefined as any)`. Inside `truncate`: `text.length <= max` evaluates as `text.length <= undefined` which is `false`. So the code falls through to `text.slice(0, max - 1) + '…'` which becomes `text.slice(0, NaN - 1)` = `text.slice(0, NaN)` = `''`. All project descriptions are silently discarded and replaced with `'…'` in the venture record.
- **Problem:** PMO admins and GMs see `'…'` as the venture description for all imported ventures. This is actively misleading data.
- **Fix:** Change line 165 to either not truncate the description (descriptions have no enforced DB max in the schema: `text('description')`) or pass an explicit max: `truncate(project.description, 2000)`.

---

### MEDIUM-3: Never-synced ventures always show RAG red on dashboard
- **File:** `server/routers/jira.ts:getSyncDashboard`, lines 344–356
- **Attack vector:** A venture has just been imported. No `jiraSyncLog` entry with `level='info'` exists yet (they are written at the end of import, not per-venture). `lastSyncMs = 0`. `minutesSinceSync = (now - 0) / 60000` = approximately 28 million minutes. RAG evaluates to `red`. PMO dashboard shows all newly imported ventures as red until the first reconciliation cycle writes a success log.
- **Problem:** Stakeholders see red indicators immediately after a successful import. This is actively misleading.
- **Fix:** Treat `lastSyncMs === 0` as a special "never synced" state and return a neutral indicator (e.g. `'amber'` with a `neverSynced: true` flag), or seed a sync log entry at the end of import for each venture.

---

### MEDIUM-4: `jira:issue_updated` webhook ignores `jiraSyncEnabled=false`
- **File:** `server/webhooks/jiraWebhook.ts:handleIssueUpdated`, lines 221–294
- **Attack vector:** A PM disables sync for their venture (`setSyncEnabled(false)`). Jira fires `jira:issue_updated`. The webhook handler finds the existing `jiraSyncMappings` record for that issue, computes the hash, and calls `applyIssueUpdate` — the sync-enabled flag on the venture is never checked. The venture continues to receive updates from Jira even after the PM explicitly disabled sync.
- **Fix:** Before calling `applyIssueUpdate`, fetch the venture and check `jiraSyncEnabled`. If false, skip and optionally log at `info` level.

---

## Automated Tests Written
- **File:** `/server/services/__tests__/jira-breaker.test.ts`
- **Test count:** 28
- **Vulnerabilities captured:** CRITICAL-1, CRITICAL-3, HIGH-1, HIGH-2, HIGH-3, HIGH-4, HIGH-5, MEDIUM-1, MEDIUM-2, MEDIUM-3, MEDIUM-4

---

## Verdict Justification

**FAIL.**

Four CRITICAL-severity issues were found:

1. **CRITICAL-1** violates FR-010 directly: ORBIT is silently left in a partially populated state while the UI reports success. This is the definition of wrong data reaching a stakeholder.
2. **CRITICAL-2** is a race condition that allows two concurrent hard-deletes — catastrophic data loss with no guard.
3. **CRITICAL-3** is a concurrency gap that corrupts data mid-import when the reconciliation job fires.
4. **CRITICAL-4** (503-on-error-status) causes silent webhook event loss when Jira auth has previously failed, causing ORBIT to drift from Jira with no alert.

Additionally, MEDIUM-2 (all venture descriptions replaced with `'…'`) is a silent data integrity failure that would affect every PMO stakeholder viewing the dashboard immediately after import.

All CRITICAL and HIGH items must be fixed before this initiative is production-ready.
