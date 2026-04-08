# QA Report — Jira Integration (Happy Path)
**Date:** 2026-04-08
**QA Round:** 1
**Agent:** QA-Happy
**Verdict:** FAIL

---

## Acceptance Criteria Results (FR-by-FR)

| FR | Description | Result | Notes |
|----|-------------|--------|-------|
| FR-001 | Credential entry form: URL (*.atlassian.net), email, token (masked) | PASS | JiraSettingsPage renders all three fields; token field uses `type="password"`; URL validated server-side against `*.atlassian.net` regex |
| FR-002 | Test Connection before save; display account name on success or specific error | PASS | `jira.testConnection` mutation calls `/rest/api/3/myself`; 401/403/other codes return distinct messages; account name shown in success banner |
| FR-003 | API token encrypted at rest; plaintext never returned in API response | PASS | `encryptToken` called before insert; `stripSensitiveFields` removes `apiTokenEncrypted` and `webhookSecret` from `getConnection` response |
| FR-004 | Webhook auto-registered on save; subscribes to 4 events; HMAC secret generated | PASS | `registerWebhook` POSTs to `/rest/api/3/webhook` with all 4 events; `randomBytes(32)` generates secret; non-blocking on failure |
| FR-005 | Connection status indicator: Connected/Disconnected/Error with email, URL, last error | PASS | Status card shows correct state; `lastError` shown in error state; `lastValidatedAt` displayed |
| FR-006 | Periodic auth ping on every reconciliation; halts sync on failure; writes log | PASS | `reconcileConnection` calls `testConnection`, sets status='error', writes `jiraSyncLog`, returns early |
| FR-007 | Disconnect: deregister webhook, clear credentials, do NOT delete venture data | PASS | `deregisterWebhook` called; `apiTokenEncrypted` and `webhookSecret` cleared to `''`; `ventures` table untouched |
| FR-008 | Import preview screen: counts to delete + to create, irreversible warning, CONFIRM input | PARTIAL | Preview shows all required counts. **FAIL:** UI accesses `preview.toImport.projects/epics/stories/risks/blockers` but backend `getImportPreview` returns `toCreate.projects/epics/stories/riskIssues/blockerIssues` — field name mismatch causes NaN/undefined in preview counts |
| FR-009 | Hard delete in FK order; do NOT delete users, resources, config_options, jira_connections | PASS | Deletion order in `hardDeleteAllVentureData` is correct; users/jira_connections not deleted |
| FR-010 | On import failure: UI shows error + Retry button; retry re-runs from scratch | PASS | `runFullImport` catches errors, writes log, re-throws; `retryImport` releases lock then re-triggers; error step renders Retry button |
| FR-011 | Paginate all Jira API calls (startAt/maxResults); process sequentially | PASS | `getProjects`, `getEpics`, `getIssueComments` paginate internally; `getProjectIssues` paginated in caller loop sequentially |
| FR-012 | Live progress indicator: current phase, count processed vs total | PARTIAL | `ImportStatus.phase`, `processed`, `total` fields exist and update. **FAIL:** UI reads `importStatus.currentPhase`, `importStatus.itemsProcessed`, `importStatus.itemsTotal` but backend `ImportStatus` interface exports `phase`, `processed`, `total` — field name mismatch; progress bar will always show 0% |
| FR-013 | Rate limit compliance: 429 → Retry-After header or 10s default; exponential backoff | PASS | `jiraFetch` handles 429; reads `Retry-After` header; applies `DEFAULT_RETRY_AFTER_MS * Math.pow(2, attempt)` backoff; max 3 retries |
| FR-014 | Idempotency via jira_sync_mappings; fresh wipe clears table | PASS | `clearSyncDataForConnection` deletes mappings before import; `onConflictDoUpdate` on re-import |
| FR-015 | Jira-managed ventures have jiraConnectionId + jiraProjectKey populated | PASS | `mapProjectToVenture` sets both fields; `setupStep: 999` marks as bypass |
| FR-016 | Project → Venture: name, description, key, startDate (earliest created), targetEndDate (latest due), status, pmUserId=syncUser | PASS | All fields mapped correctly in `mapProjectToVenture`; startDate/targetEndDate computed by scanning all issues |
| FR-017 | Epic → Workstream: summary, status (via mapping), completionPct, sortOrder | PASS | `mapEpicToWorkstream` maps all fields; `aggregateprogress.percent` used for completionPct; sortOrder incremented sequentially |
| FR-018 | Default status mapping: To Do→not_started, In Progress→in_progress, Done→complete, unknown→on_hold + warning log | PARTIAL | Default map correct. Unknown statuses return `on_hold` with `wasUnmapped: true` flag — but **FAIL:** the import loop never checks `wasUnmapped` to write the required warning to `jira_sync_log`; unmapped statuses are silently swallowed |
| FR-019 | Story/Task → Milestone: summary, dueDate (fallback chain), status via mapping→milestone enum, resolutiondate | PASS | `mapIssueToMilestone` implements full fallback chain; `workstreamStatusToMilestoneStatus` converts correctly |
| FR-020 | Risk issue (type=Risk OR label=orbit-risk) → Risk: defaults 3/3/9/amber, status from Jira | PASS | `classifyIssue` checks type and label; `mapIssueToRisk` sets all required defaults |
| FR-021 | Blocker priority → ORBIT Issue with severity=blocker; status mapped | PASS | `classifyIssue` checks priority=blocker; `mapIssueToIssue` sets severity='blocker'; status mapped |
| FR-022 | Epic comments → Progress updates: narrative, submittedAt, weekLabel YYYY-Www, completionPct | PASS | `mapCommentToProgressUpdate` maps all fields; `weekLabel` uses ISO week calculation; ADF body extracted |
| FR-023 | Webhook endpoint at /api/jira-webhook; no body size limit; own rate limiter; no ORBIT auth; before tRPC | PARTIAL | Implementation correct. **CANNOT VERIFY** from code alone: whether `registerJiraWebhookRoute` is called before `express.json()` in `server/index.ts` — this is the critical NFR-006 dependency |
| FR-024 | HMAC-SHA256 validation; X-Hub-Signature header; constant-time comparison; reject 401 if missing or invalid | PASS | `validateHmacSignature` uses `timingSafeEqual`; missing header returns 401; invalid signature returns 401 |
| FR-025 | Handle issue_created, issue_updated, issue_deleted, comment_created; unknown events → 200 + info log | PASS | All 4 handlers implemented; default case in switch logs at `info` and returns 200 |
| FR-026 | Webhook idempotency: duplicate event (same webhookEvent+issue.id+changelog.id) → no change + 200 | PASS | `isDuplicateEvent` checks composite key in jira_sync_log; `recordEventDeduplicationKey` stores key after first processing |
| FR-027 | Reconciliation job every 15 minutes; auth ping; create/update/soft-delete; log completion | PASS | `setInterval` at 15min; auth ping before each run; `handleNewIssueFromWebhook`, `applyIssueUpdate`, `softDeleteOrbitEntity` all implemented |
| FR-027-UI | Status mapping config screen: display known statuses, dropdown to change, save to jira_status_mappings | FAIL | `jira.getStatusMappings` and `jira.updateStatusMapping` endpoints exist. **NO UI PAGE FOUND** for `/settings/jira/mappings` — `JiraSettingsPage` and `JiraSyncDashboard` do not render a status mapping configuration screen. The BA spec requires this screen. |
| FR-028 | Sync system user pre-seeded; all sync records reference it; cannot authenticate interactively | PASS | `getSyncUserId` looks up `azureOid = 'sync-system-001'`; used for all `createdBy`/`changedBy` fields |
| FR-029 | Sync Status Dashboard: PMO only; per-venture RAG (green=<30m, amber=>30m, red=>2h or error) | PARTIAL | Backend RAG logic: red if `minutesSinceSync > 120` or errors+>120min; amber if `minutesSinceSync > 30`. **FAIL:** frontend `syncHealthClass` uses different thresholds: green=≤60m, amber=≤360m, red=>360m or error — contradicts the spec (green must be ≤30m, red must be >2h) |
| FR-030 | Per-venture detail: Jira project key, instance URL, last sync, last attempt, sync status, error log | PARTIAL | Detail panel shows last sync, sync status, and log. **FAIL:** `getVentureSyncDetail` returns `syncLog` but VentureSyncDetail UI accesses `data.logs` — field name mismatch causing empty log display. Also: "last attempted sync" timestamp is not returned by the backend (only `lastSyncAt` = last success) |
| FR-031 | Manual Re-Sync button per venture (PMO only); disabled during sync | PASS | Re-sync button present; `disabled={resyncPending || !venture.syncEnabled}`; `triggerVentureResync` is PMO-only |
| FR-032 | Wipe and Reimport button with Risk Gate dialog: states what is lost, safe default=cancel | PARTIAL | Confirmation dialog exists. **FAIL:** the spec requires the dialog to "state what data will be lost (all ventures and child entities), the safe default (cancel), and the risky alternative (proceed)." The implementation only shows "This deletes all venture data. Continue?" — it does not name the risky alternative or explicitly state the safe default as required by the Risk Gate spec |
| FR-033 | PM sees last sync time, sync status, error count for own venture; GM sees last sync time only | PARTIAL | `getVentureSyncDetail` correctly gates GM to empty syncLog. **FAIL:** no UI component on the venture overview page renders this information (FR-033 requires it inline on the venture overview, not just on the sync dashboard) |
| FR-034 | Jira project key displayed on venture overview; link to Jira project opens in new tab | FAIL | No venture overview page component was found or modified in the reviewed code to display `jiraProjectKey` as a linked field |
| FR-035 | Sync enable/disable toggle; PM can toggle own; PMO any; shows "Sync Paused" indicator | PARTIAL | Toggle is implemented in `setSyncEnabled` (correctly scoped). Paused indicator shows on sync dashboard. **FAIL:** no "Sync Paused" indicator implemented on the venture overview page itself (FR-035 requires it on the venture page) |
| FR-036 | Soft-delete on Jira issue deletion; entity shows "Deleted in Jira" indicator | PARTIAL | `softDeleteOrbitEntity` sets `deletedInJira: true` on entity tables. **FAIL:** no UI component renders a "Deleted in Jira" visual indicator on affected entities |

---

## Data Accuracy Results

| Calculation / Metric | Input | Expected | Actual | Result |
|---------------------|-------|----------|--------|--------|
| Venture startDate | Issues with earliest `created` = 2025-01-15 | `2025-01-15` | `isoDateOnly(iss.fields.created)` slice(0,10) — correct | PASS |
| Venture targetEndDate | All issue duedates null | Today + 90 days | `daysFromToday(90)` | PASS |
| Risk defaults | Any risk issue | likelihood=3, impact=3, score=9, rag=amber | Hardcoded in `mapIssueToRisk` | PASS |
| Milestone status | Jira status="Done" | `achieved` | complete→achieved via `workstreamStatusToMilestoneStatus` | PASS |
| Milestone status | Jira status="In Progress" | `upcoming` | in_progress→upcoming | PASS |
| Milestone status | Jira status="on_hold" | `deferred` | on_hold→deferred | PASS |
| WeekLabel | comment.created = "2026-04-08T10:00:00Z" | `2026-W15` | djb2 hash used for syncHash — weekLabel is separate, uses UTC calculation | PASS |
| RAG: green threshold (frontend) | Last sync 31 minutes ago, no error | amber (spec) | green (useJira.ts: green = ≤60m) | FAIL |
| RAG: amber threshold (frontend) | Last sync 90 minutes ago, no error | amber (spec: 30m-2h = amber) | green still (≤60m = green in code) | FAIL |
| Sync hash | Same issue payload | Identical 8-char hex | djb2 integer hash, truncated to 32-bit — collision probability higher than SHA-256, but deterministic | WARNING |
| Import preview fields | Backend returns `toCreate.riskIssues` | UI shows correct risk count | UI reads `toImport.risks` — undefined | FAIL |
| Import progress % | processed=50, total=100 | 50% bar shown | UI reads `itemsProcessed`/`itemsTotal` vs backend `processed`/`total` — always 0% | FAIL |

---

## Issues Found

### BLOCKER 1: Import Preview Field Name Mismatch — Preview Counts Always Blank

- Location: `client/src/pages/JiraImportPage.tsx` lines 145-150 vs `server/services/jiraImport.ts` line 641-657
- Problem: The backend `getImportPreview` returns `{ toDelete: {...}, toCreate: { projects, epics, stories, riskIssues, blockerIssues } }`. The UI reads `preview.toImport.projects`, `preview.toImport.epics`, `preview.toImport.stories`, `preview.toImport.risks`, `preview.toImport.blockers`. The top-level key is `toCreate` not `toImport`, and the leaf keys differ (`riskIssues` vs `risks`, `blockerIssues` vs `blockers`). All "to import" counts will render as `undefined` (displayed as `NaN` or blank).
- Expected: User sees accurate counts of Jira entities to be imported (projects, epics, stories, risks, blockers)
- Fix: Either rename backend return keys to match UI (`toImport.risks`, `toImport.blockers`), or update UI to match backend (`toCreate.riskIssues`, `toCreate.blockerIssues`)

### BLOCKER 2: Import Progress Bar Always Shows 0% — Field Name Mismatch

- Location: `client/src/pages/JiraImportPage.tsx` lines 207-210 vs `server/services/jiraImport.ts` lines 65-73
- Problem: The `ImportStatus` interface exports `phase`, `processed`, `total`. The import page reads `importStatus.currentPhase`, `importStatus.itemsProcessed`, `importStatus.itemsTotal`. All three are undefined. The progress bar renders 0% for the entire import duration. The phase text always shows "Initialising…". The completion detection on line 74 checks `importStatus.phase === 'complete'` (correctly), but line 83 checks `importStatus.phase === 'error'` when the field is set to `'Failed'` — completion detection also broken.
- Expected: Live phase label and percentage shown during import
- Fix: Update UI field references: `currentPhase` → `phase`, `itemsProcessed` → `processed`, `itemsTotal` → `total`. Also fix completion check: `'error'` → `'Failed'`

### BLOCKER 3: Sync Dashboard Data Shape Mismatch — Venture List Always Empty

- Location: `client/src/pages/JiraSyncDashboard.tsx` line 74 vs `server/routers/jira.ts` lines 298-370
- Problem: Backend `getSyncDashboard` returns an array directly (not an object). UI does `data?.ventures ?? []`. Since `data` is an array, `data.ventures` is `undefined`, and the venture list always renders empty.
- Expected: Sync dashboard displays all Jira-linked ventures with their health status
- Fix: Either (a) backend wraps return in `{ ventures: [...] }`, or (b) UI removes `.ventures` accessor: `data ?? []`

### BLOCKER 4: Venture Sync Detail — syncLog Field Mismatch

- Location: `client/src/pages/JiraSyncDashboard.tsx` line 364 vs `server/routers/jira.ts` lines 416-463
- Problem: Backend `getVentureSyncDetail` returns `{ syncLog: [...] }` but UI reads `data.logs`. Log entries are never displayed.
- Expected: Sync log entries visible in expanded venture detail panel
- Fix: Change UI reference from `data.logs` to `data.syncLog`

### BLOCKER 5: FR-027-UI — Status Mapping Configuration Screen Missing

- Location: No file found at any route `/settings/jira/mappings` or equivalent
- Problem: The BA spec requires a UI screen where the PMO admin can view and edit Jira→ORBIT status mappings. The tRPC endpoints (`jira.getStatusMappings`, `jira.updateStatusMapping`) are implemented. No corresponding React page exists in the reviewed files.
- Expected: PMO admin can navigate to a screen listing all known Jira statuses and change their mapped ORBIT status via a dropdown
- Fix: Create a `JiraStatusMappingsPage` component and register it on the `/settings/jira/mappings` route

### BLOCKER 6: FR-034, FR-033, FR-035, FR-036 — Venture Overview Page Not Updated

- Location: No venture overview page component was provided for review; none of the reviewed files modify a venture overview page
- Problem: FR-034 (Jira project key link on venture overview), FR-033 (sync error count/status for PMs on venture page), FR-035 (Sync Paused indicator on venture page), and FR-036 ("Deleted in Jira" indicator on entities) all require modifications to existing venture-facing UI. None of these modifications appear in the implementation.
- Expected: Venture overview page shows `jiraProjectKey` as a clickable Jira link, last sync time, sync toggle, error count for PMs/PMOs, and "Deleted in Jira" badge on soft-deleted entities
- Fix: Update the venture overview/detail page component to render Jira metadata when `jiraConnectionId` is set; add "Deleted in Jira" badge to milestone/risk/issue list components

### WARNING 1: FR-029/FR-032 — Frontend RAG Thresholds Contradict Specification

- Location: `client/src/hooks/useJira.ts` lines 46-53
- Problem: Spec says green = last sync <30m, amber = 30m-2h, red = >2h or error. Frontend `syncHealthClass` uses: green = ≤60m, amber = ≤360m (6h), red = >360m. The backend router uses the correct thresholds (30m / 120m). The frontend overrides with looser thresholds, meaning ventures will show green up to 60 minutes (double the spec limit) and amber up to 6 hours (triple the spec limit).
- Expected: Green means synced within last 30 minutes
- Fix: Change `useJira.ts` thresholds to: green = `mins <= 30`, amber = `mins <= 120`, red = otherwise

### WARNING 2: FR-018 — Unmapped Jira Status Warning Not Written to Sync Log During Import

- Location: `server/services/jiraImport.ts` lines 413-469 (issue classification loop)
- Problem: `mapJiraStatus` returns `wasUnmapped: true` for unknown statuses, but the import loop calls mappers indirectly through `mapIssueToMilestone`, `mapIssueToRisk`, `mapIssueToIssue` — none of which surface `wasUnmapped` back to the caller, and the caller never writes a warning log for unknown statuses. Reconciliation similarly does not log unmapped status warnings.
- Expected: Unknown Jira statuses logged as warnings in jira_sync_log per FR-018
- Fix: Expose `wasUnmapped` from mapper return types and write `writeSyncLog` at `warning` level when encountered

### WARNING 3: FR-032 — Wipe & Reimport Risk Gate Dialog Insufficient

- Location: `client/src/pages/JiraSyncDashboard.tsx` lines 98-113
- Problem: The spec Risk Gate requires stating: (1) what will be lost, (2) safe default (cancel), (3) risky alternative (proceed with reimport). The dialog only shows "This deletes all venture data. Continue?" with Yes/Cancel. It does not explicitly name the risky alternative or describe the safe default as specified.
- Expected: Risk Gate dialog matches spec: "All ventures, workstreams, milestones, risks, and issues will be permanently deleted. Safe default: Cancel. Risky alternative: Proceed with full reimport."
- Fix: Expand dialog copy to match Risk Gate specification

### WARNING 4: Sync Hash Quality — djb2 Not SHA-256

- Location: `server/services/jiraMappers.ts` lines 366-385
- Problem: `computeSyncHash` uses a djb2 integer hash producing an 8-character hex string. The function comment says "SHA-256-like" and the data requirement specifies `sync_hash varchar(64)` (SHA-256 length). djb2 has a much higher collision rate. Two different Jira payloads may produce the same hash, causing missed updates.
- Expected: True SHA-256 hash (64 hex chars) using Node.js crypto
- Fix: Replace djb2 with `crypto.createHash('sha256').update(payload).digest('hex')`

### WARNING 5: FR-030 — "Last Attempted Sync" Not Returned by Backend

- Location: `server/routers/jira.ts` lines 440-463; `client/src/pages/JiraSyncDashboard.tsx` line 373
- Problem: `getVentureSyncDetail` returns `lastSyncAt` (last successful sync only). FR-030 requires also displaying the "last attempted sync timestamp." The UI attempts to read `data.lastAttemptAt` but the field does not exist in the backend response.
- Expected: Both last successful sync and last attempted sync timestamps displayed
- Fix: Add `lastAttemptAt` query to `getVentureSyncDetail` (latest log entry regardless of level)

---

## Passed Checks

- FR-001: Credential form with all three fields and correct validation
- FR-002: Test Connection with account name and specific error messages
- FR-003: Token encrypted before insert; `stripSensitiveFields` never leaks token or HMAC secret
- FR-004: Webhook registration with all 4 event types on save
- FR-005: Connection status card with all three states
- FR-006: Auth ping on every reconciliation cycle; error state set; sync halted
- FR-007: Disconnect deregisters webhook and clears credentials without deleting venture data
- FR-009: Hard delete in correct FK order; protected tables excluded
- FR-010: Error path writes log, re-throws; Retry button present and functional
- FR-011: Pagination implemented for projects, epics, issues, comments; sequential processing
- FR-013: 429 rate limit handling with Retry-After header and exponential backoff
- FR-014: Sync mappings cleared before import; `onConflictDoUpdate` for idempotency
- FR-015: `jiraConnectionId` and `jiraProjectKey` populated on all imported ventures
- FR-016: Full project→venture mapping including date derivation logic
- FR-017: Epic→workstream mapping with completionPct from aggregateprogress
- FR-019: Story/task→milestone with full dueDate fallback chain and milestone status enum
- FR-020: Risk classification by type name and label; correct defaults
- FR-021: Blocker priority classification; severity=blocker; status mapping
- FR-022: Epic comments→progress updates with ADF extraction and weekLabel
- FR-024: HMAC-SHA256 with constant-time comparison; 401 on missing or invalid signature
- FR-025: All 4 event handlers implemented; unrecognised events logged at info and acknowledged
- FR-026: Idempotency via composite key deduplication in jira_sync_log
- FR-027: Reconciliation at correct 15-minute interval; covers auth ping, create/update/soft-delete
- FR-028: Sync system user used consistently across import, reconciliation, and webhook
- FR-031: Re-sync button per venture; disabled correctly during sync and when paused
- NFR-004: Token never returned in API responses; webhook secret stripped from `getConnection`
- NFR-005: No new frameworks; `setInterval` used for reconciliation
- NFR-007: Webhook rate limiter at 500 req/min separate from global limiter
- NFR-008: All error paths write to jira_sync_log (with one exception noted in WARNING 2)
- NFR-009: `logAudit` called for venture creates during import; sync user referenced
- Role enforcement: PMO-only gates on all admin procedures; PM scoped correctly in `getVentureSyncDetail` and `setSyncEnabled`; GM returns empty sync log

---

## NFR Verification

| NFR | Requirement | Assessment |
|-----|-------------|------------|
| NFR-001 | Import < 5 min for 500 issues | Pagination batch size = 100 issues/request; projects processed sequentially; 500 issues = 5 API calls; within 5-minute budget assuming <1s/call. PASS (by design) |
| NFR-002 | Sync latency < 60s | Webhook returns 200 immediately, processes async. Processing is sequential DB operations — no queue. Latency depends on DB load but is designed to be subsecond for typical payloads. PASS (design-compliant) |
| NFR-003 | Webhook available while server running | Route registered via `registerJiraWebhookRoute`; no feature flag. Cannot verify registration order in server/index.ts without reading that file |
| NFR-004 | AES-256 token encryption; secret never in responses | `encryptToken` called; `stripSensitiveFields` used; PASS |
| NFR-005 | No new frameworks; setInterval for reconciliation | PASS |
| NFR-006 | Webhook exempt from 50kb body limit | `express.raw({ type: 'application/json' })` with no limit used. Cannot verify registration order without server/index.ts |
| NFR-007 | 500 req/min rate limiter on webhook | `webhookLimiter` configured at 500/min. PASS |
| NFR-008 | Zero silent failures | WARNING 2: unmapped status during import not logged. Otherwise PASS |

---

## Verdict Justification

**6 BLOCKERS found.** The implementation is substantially complete but has critical data contract mismatches between backend and frontend that break core user-facing flows:

1. Import preview counts are entirely blank (field name mismatch — `toImport` vs `toCreate`)
2. Import progress bar is always 0% and completion detection is broken (field name mismatch)
3. Sync dashboard venture list is always empty (`data.ventures` vs direct array return)
4. Sync log entries never display in the detail panel (`data.logs` vs `data.syncLog`)
5. Status mapping configuration UI is completely absent
6. Venture overview page has no Jira metadata — FR-034, FR-033, FR-035 (venture page variants), FR-036 visual indicator all unimplemented

The backend logic (import orchestration, webhook processing, reconciliation, role enforcement, encryption) is well-implemented and largely specification-compliant. The blockers are predominantly frontend/contract gaps rather than business logic errors.

---

❌ QA HAPPY PATH: FAIL
Blockers found: 6
Warnings found: 5
Report: /docs/jira-integration/qa/qahappy-report.md
Dev agents must fix all 6 blockers before re-testing.
