# Solution Blueprint — Jira Cloud Integration (Jira → ORBIT)
**Date:** 2026-04-08
**Author:** Architect Agent
**Program Brief:** /docs/jira-integration/pm/pm-brief-jira-integration.md
**Requirements Doc:** /docs/jira-integration/ba/requirements-document.md
**Status:** Approved for Implementation

---

## 1. Solution Overview

ORBIT gains a one-way Jira Cloud integration. Jira is the authoritative source. ORBIT consumes Jira data in two modes: a hard-delete bulk import (initial and on-demand) and ongoing real-time sync via inbound webhooks with a 15-minute reconciliation job as safety net. ORBIT never writes to Jira.

The integration slots into the existing Express/tRPC/Drizzle architecture without new frameworks. It adds one raw Express route, two tRPC routers, four new DB tables, three additive columns on `ventures`, a Node.js `setInterval` reconciliation job, and a collection of pure service modules for encryption, Jira API calls, entity mapping, and import orchestration.

---

## 2. System Impact

### Systems Touched
- `server/index.ts` — bootstrap order modified; webhook route injected before `express.json()` middleware
- `server/db/schema.ts` — four new tables, three new columns on `ventures`
- `server/db/startup.ts` — sync system user seed and `JIRA_ENCRYPTION_KEY` validation added
- `server/routers/index.ts` — two new routers registered (`jira`, `jiraSync`)
- `client/src/pages/` — three new pages, modifications to venture overview components
- `shared/enums.ts` — no changes required; Jira status is a plain string, not an ORBIT enum

### Dependencies on Existing Code
- `server/services/audit.ts` (`logAudit`, `logAuditDiff`) — consumed by import orchestrator and webhook processor. No modifications to the audit service itself.
- `ventures` table — read-only columns added. Existing venture create/edit procedures gain one validation: reject mutations on Jira-managed ventures.
- `users` table — sync system user inserted using sentinel `azureOid: 'sync-system-001'` (non-guessable, non-Azure value). The `azureOid` column is `notNull()` so a sentinel value is required; the auth layer must exclude this user from interactive login paths.

### What This Replaces / Complements
- Complements: all existing venture, workstream, milestone, risk, issue, and progress update features remain intact. Jira-managed records appear identically to manually created records in all existing views.
- Replaces: manual venture creation workflow for Jira-synced ventures. The setup wizard is bypassed for imported ventures (`setupStep` will be set to the maximum completed step value to indicate no wizard needed).

---

## 3. Data Architecture

### 3.1 New Tables (Drizzle Schema Additions)

All four tables are additive. No existing table is altered except for the three nullable columns on `ventures`.

```typescript
// ── Jira Connections ─────────────────────────────────────────
export const jiraConnections = pgTable('jira_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  instanceUrl: varchar('instance_url', { length: 500 }).notNull(),
  accountEmail: varchar('account_email', { length: 255 }).notNull(),
  apiTokenEncrypted: text('api_token_encrypted').notNull(),
  webhookSecret: varchar('webhook_secret', { length: 255 }).notNull(),
  webhookId: varchar('webhook_id', { length: 255 }),
  status: varchar('status', { length: 50 }).notNull().default('connected'),
  importLock: boolean('import_lock').notNull().default(false),
  lastValidatedAt: timestamp('last_validated_at', { withTimezone: true }),
  lastError: text('last_error'),
  createdBy: uuid('created_by').references(() => users.id).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('jira_connections_status_idx').on(table.status),
]);

// ── Jira Sync Mappings ────────────────────────────────────────
export const jiraSyncMappings = pgTable('jira_sync_mappings', {
  id: uuid('id').primaryKey().defaultRandom(),
  connectionId: uuid('connection_id').references(() => jiraConnections.id).notNull(),
  jiraEntityType: varchar('jira_entity_type', { length: 50 }).notNull(),
  jiraEntityId: varchar('jira_entity_id', { length: 255 }).notNull(),
  orbitEntityType: varchar('orbit_entity_type', { length: 50 }).notNull(),
  orbitEntityId: uuid('orbit_entity_id').notNull(),
  syncedAt: timestamp('synced_at', { withTimezone: true }).defaultNow().notNull(),
  syncHash: varchar('sync_hash', { length: 64 }),
}, (table) => [
  uniqueIndex('jira_sync_jira_entity_idx').on(
    table.connectionId, table.jiraEntityType, table.jiraEntityId
  ),
  index('jira_sync_orbit_entity_idx').on(table.orbitEntityType, table.orbitEntityId),
]);

// ── Jira Sync Log (insert-only) ───────────────────────────────
export const jiraSyncLog = pgTable('jira_sync_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  connectionId: uuid('connection_id').references(() => jiraConnections.id).notNull(),
  ventureId: uuid('venture_id').references(() => ventures.id),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  jiraEntityType: varchar('jira_entity_type', { length: 50 }),
  jiraEntityId: varchar('jira_entity_id', { length: 255 }),
  orbitEntityType: varchar('orbit_entity_type', { length: 50 }),
  orbitEntityId: uuid('orbit_entity_id'),
  level: varchar('level', { length: 20 }).notNull().default('info'),
  message: text('message').notNull(),
  payload: jsonb('payload'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('jira_sync_log_connection_id_idx').on(table.connectionId),
  index('jira_sync_log_venture_id_idx').on(table.ventureId),
  index('jira_sync_log_created_at_idx').on(table.createdAt),
  index('jira_sync_log_level_idx').on(table.level),
]);

// ── Jira Status Mappings ──────────────────────────────────────
export const jiraStatusMappings = pgTable('jira_status_mappings', {
  id: uuid('id').primaryKey().defaultRandom(),
  connectionId: uuid('connection_id').references(() => jiraConnections.id).notNull(),
  jiraStatusName: varchar('jira_status_name', { length: 255 }).notNull(),
  orbitStatus: varchar('orbit_status', { length: 50 }).notNull(),
  updatedBy: uuid('updated_by').references(() => users.id).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('jira_status_mappings_unique_idx').on(table.connectionId, table.jiraStatusName),
]);
```

### 3.2 Additive Columns on `ventures`

Three nullable columns added inline in the `ventures` table definition. No existing column altered.

```typescript
// Add inside the ventures pgTable definition:
jiraConnectionId: uuid('jira_connection_id').references(() => jiraConnections.id),
jiraProjectKey: varchar('jira_project_key', { length: 50 }),
jiraSyncEnabled: boolean('jira_sync_enabled').notNull().default(true),

// Add inside the ventures table index array:
index('ventures_jira_connection_id_idx').on(table.jiraConnectionId),
```

### 3.3 Migration Strategy

Migration is executed via the existing `drizzle-kit push --force` in `server/db/startup.ts`. All new columns are nullable or have defaults — no data migration required. No existing rows are touched. The deployment script audit (grep for DROP/TRUNCATE/migrate reset) must be run before deploy as per HERALD pipeline rules — this migration is additive only and will produce no destructive DDL.

### 3.4 Data Flow

```
Jira Cloud
    │
    │  REST API (HTTPS, Basic Auth)
    ▼
┌─────────────────────────────────────────────────────────┐
│  ORBIT Server (Express)                                 │
│                                                         │
│  POST /api/jira-webhook ◄──── Jira webhook events       │
│  (raw body, HMAC validated, own rate limiter)           │
│           │                                             │
│           ▼                                             │
│  Webhook Dispatcher ──► Entity Mapper ──► DB write      │
│           │                                             │
│  setInterval (15 min)                                   │
│  Reconciliation Job ──► Jira API ──► Delta Compare      │
│           │                        ──► DB write         │
│                                                         │
│  tRPC /api/trpc/jira.*                                  │
│  (PMO-authenticated, encrypted token read)              │
│  Connection CRUD / Import / Sync Dashboard              │
│                                                         │
│  Import Orchestrator (triggered via tRPC)               │
│  Hard Delete ──► Paginated Jira fetch ──► Batch insert  │
└─────────────────────────────────────────────────────────┘
    │
    ▼
PostgreSQL
  jira_connections
  jira_sync_mappings
  jira_sync_log
  jira_status_mappings
  ventures (+ 3 new cols)
  workstreams / milestones / risks / issues / progress_updates
  audit_trail
```

### 3.5 Data Refresh and Latency

- Webhook path: target < 60 seconds from Jira event to ORBIT update (synchronous processing inline; no queue needed at this event volume).
- Reconciliation path: 15-minute fixed interval, catches anything the webhook missed.
- Import path: no latency requirement beyond 5 min for 500 issues per project.

---

## 4. API / Integration Contracts

### 4.1 Raw Express Route — Webhook Receiver

**File:** `server/routes/jiraWebhook.ts`

This file exports a function `registerJiraWebhookRoute(app: Express): void`. It is called from `server/index.ts` before `app.use(express.json(...))`.

```
POST /api/jira-webhook
Body parser:    express.raw({ type: 'application/json' }) — no size limit
Rate limiter:   500 req/min per IP (separate limiter instance, not the global 200/min)
Auth:           HMAC-SHA256 via X-Hub-Signature header (constant-time compare)
ORBIT auth:     None — this route is unauthenticated by design

Response codes:
  200 — accepted (or idempotent duplicate, discarded)
  400 — malformed payload (missing webhookEvent or issue fields)
  401 — HMAC validation failure or missing header
  503 — connection in error state or sync globally disabled
```

**Middleware registration order in `server/index.ts`:**
```
app.use(helmet())
app.use(cors(...))
registerJiraWebhookRoute(app)   ← INSERTED HERE — before express.json()
app.use(express.json({ limit: '50kb' }))
app.use(limiter)
app.get('/api/health', ...)
app.use('/api/trpc', ...)
```

### 4.2 tRPC Router: `jira`

**File:** `server/routers/jira.ts`
**Registered as:** `jira` in `server/routers/index.ts`

All procedures use `protectedProcedure`. PMO-only procedures additionally use `.use(requireRole('pmo'))`.

| Procedure | Type | Role | Input | Returns |
|---|---|---|---|---|
| `jira.getConnection` | query | pmo | — | `{ id, instanceUrl, accountEmail, status, lastValidatedAt, lastError, webhookId }` — no token, no secret |
| `jira.testConnection` | mutation | pmo | `{ instanceUrl, email, apiToken }` | `{ success: boolean, accountName?: string, error?: string }` |
| `jira.saveConnection` | mutation | pmo | `{ instanceUrl, email, apiToken }` | `{ connectionId: string }` — triggers webhook registration |
| `jira.disconnect` | mutation | pmo | — | `{ success: boolean }` — deregisters webhook, clears creds |
| `jira.getImportPreview` | query | pmo | — | `{ toDelete: EntityCounts, toCreate: EntityCounts }` — read-only, no side effects |
| `jira.triggerImport` | mutation | pmo | — | `{ jobId: string }` — sets import lock, begins async orchestration |
| `jira.getImportStatus` | query | pmo | `{ jobId: string }` | `{ phase: string, processed: number, total: number, errors: string[] }` |
| `jira.retryImport` | mutation | pmo | — | `{ jobId: string }` — same as triggerImport but with explicit retry flag |
| `jira.getSyncDashboard` | query | pmo | — | `VentureSyncHealth[]` — per-venture RAG, last sync time, error count |
| `jira.getVentureSyncDetail` | query | pmo, pm | `{ ventureId: string }` | `{ syncLog: SyncLogEntry[], lastSyncAt, status, errorCount }` — PM scoped to own |
| `jira.triggerVentureResync` | mutation | pmo | `{ ventureId: string }` | `{ started: boolean }` |
| `jira.setSyncEnabled` | mutation | pmo, pm | `{ ventureId: string, enabled: boolean }` | `{ ventureId, jiraSyncEnabled }` — PM scoped to own |
| `jira.getStatusMappings` | query | pmo | — | `StatusMapping[]` — all known Jira statuses + current ORBIT mapping |
| `jira.updateStatusMapping` | mutation | pmo | `{ jiraStatusName: string, orbitStatus: string }` | `{ updated: boolean }` |

### 4.3 Jira REST API Calls (outbound from ORBIT)

All calls use Basic Auth: `Buffer.from('email:apiToken').toString('base64')` in the `Authorization` header. Base URL is the stored `instanceUrl`.

| Purpose | Endpoint | When |
|---|---|---|
| Test connection | `GET /rest/api/3/myself` | On testConnection and periodic auth ping |
| Register webhook | `POST /rest/api/3/webhook` | On saveConnection |
| Deregister webhook | `DELETE /rest/api/3/webhook/{webhookId}` | On disconnect |
| List projects | `GET /rest/api/3/project/search?maxResults=50&startAt=N` | On import |
| List epics per project | `GET /rest/api/3/search?jql=project=KEY AND issuetype=Epic&maxResults=50&startAt=N` | On import |
| List issues per project | `GET /rest/api/3/search?jql=project=KEY AND issuetype!=Epic&maxResults=100&startAt=N` | On import |
| List comments on epic | `GET /rest/api/3/issue/{issueIdOrKey}/comment?maxResults=50&startAt=N` | On import |
| Get single issue | `GET /rest/api/3/issue/{issueIdOrKey}` | On webhook upsert for unknown entities |

Rate limit handling: on HTTP 429, read `Retry-After` header (default 10s), wait, then retry. Log to `jira_sync_log` at `warning`. Max 3 retries per request before logging error and skipping the entity.

---

## 5. UI / Dashboard Architecture

### 5.1 New Pages

All pages use dark theme CSS variables only. All follow the existing page layout pattern (`p-6 max-w-5xl mx-auto`).

**Page 1: Jira Connection Settings**
Route: `/settings/jira`
Access: PMO only (redirect non-PMO to `/`)
File: `client/src/pages/JiraSettingsPage.tsx`

Sections:
- Connection status banner (connected/error/disconnected) with account email and instance URL when connected
- Credential form: instance URL input (validated `*.atlassian.net`), email input, API token input (masked, type=password), "Test Connection" button (calls `jira.testConnection` mutation, shows result inline without saving), "Save Connection" button
- On connected state: "Disconnect" button with confirmation modal
- After save: renders Import Preview trigger button ("Run Initial Import")
- Import Preview Modal (inline, not a separate route): entity counts, irreversible warning, type-to-confirm input (`CONFIRM` string), "Proceed with Import" button
- Import Progress Overlay: replaces modal content; shows phase string and processed/total count; no cancel available; on error shows error message + "Retry Import" button

**Page 2: Sync Status Dashboard**
Route: `/settings/jira/sync`
Access: PMO only
File: `client/src/pages/JiraSyncDashboard.tsx`

Sections:
- Header row: "Wipe and Reimport All" button (opens Risk Gate modal before executing)
- Venture health table: columns — Venture Name, Jira Project Key, Last Sync, RAG indicator, Error Count, Re-Sync button, Sync Enabled toggle
- RAG indicator: green dot = synced within 30 min; amber = 30–120 min; red = over 120 min or error
- Clicking a venture row opens a slide-over panel (`JiraVentureSyncDetail`) showing: Jira project key + instance URL link, last successful sync timestamp, last attempted sync timestamp, sync status, error log table (entity type, Jira ID, message, timestamp, retry count)
- "Re-Sync" button per row: disabled while sync in progress for that venture; calls `jira.triggerVentureResync`

**Page 3: Status Mapping Configuration**
Route: `/settings/jira/mappings`
Access: PMO only
File: `client/src/pages/JiraStatusMappingsPage.tsx`

Sections:
- Table of all discovered Jira status names (populated from `jira_status_mappings` + any `warning` log entries with unmapped statuses)
- Per row: Jira status name (read-only), ORBIT status dropdown (`not_started` / `in_progress` / `complete` / `on_hold`), Save button per row
- Note: changes apply from next reconciliation cycle only, not retroactively

### 5.2 Modified Existing Components

**Venture Overview Page (existing)**
- Add Jira sync indicator section (below venture header) when `jira_connection_id` is set:
  - GM: shows "Last synced [timestamp]" only
  - PM (own venture): shows last sync time, sync status badge, error count with link to detail panel, sync toggle
  - PMO: full detail — same as PM + inline slide-over link
- Jira project key displayed as a link: `{jiraProjectKey}` → opens `{instanceUrl}/projects/{jiraProjectKey}` in new tab
- "Deleted in Jira" badge on soft-deleted entities (risks, milestones, workstreams where applicable)

**Venture Edit Form (existing)**
- If `jira_connection_id` is set on the venture, all form fields are read-only
- A lock indicator banner: "This venture is managed by Jira. Edit data in Jira — changes sync automatically."
- Save button is hidden or disabled for Jira-managed ventures

**Venture List / PMO Dashboard (existing)**
- Add sync health badge column: green/amber/red dot with tooltip showing last sync time
- Only shown when a Jira connection exists for the deployment

### 5.3 Access Rules Summary

| Feature | GM | PM | PMO |
|---|---|---|---|
| View Jira settings page | No | No | Yes |
| Test/save/disconnect connection | No | No | Yes |
| View sync dashboard | No | No | Yes |
| Trigger full import / wipe-and-reimport | No | No | Yes |
| Trigger venture re-sync | No | No | Yes |
| View sync detail (own venture) | No | Yes | Yes |
| Toggle sync (own venture) | No | Yes | Yes |
| Toggle sync (any venture) | No | No | Yes |
| Edit status mappings | No | No | Yes |
| View last sync time on venture page | Yes | Yes | Yes |
| View sync error count on venture page | No | Yes (own) | Yes |

---

## 6. Key Flows

### Flow 1: Initial Connection and Import

```
1. PMO admin navigates to /settings/jira
2. Enters instanceUrl, email, apiToken
3. Clicks "Test Connection"
   → ORBIT calls jira.testConnection (no DB write)
   → Calls GET /rest/api/3/myself with provided creds
   → Returns success + account display name, or error string
4. PMO clicks "Save Connection"
   → jira.saveConnection:
     a. Encrypt apiToken with AES-256 using JIRA_ENCRYPTION_KEY
     b. Generate 32-byte random HMAC secret
     c. Insert row into jira_connections (status: 'connected')
     d. Call POST /rest/api/3/webhook with ORBIT webhook URL + HMAC secret
     e. Store returned webhookId on jira_connections row
5. Settings page reloads showing "Connected" status
6. PMO clicks "Run Initial Import"
   → jira.getImportPreview:
     a. Count existing ORBIT ventures, workstreams, milestones, risks, issues, progress_updates
     b. Fetch Jira project list (paginated), count projects, epics, issues, comments
     c. Return counts — no DB writes
7. Import Preview Modal opens showing counts + irreversible warning
8. PMO types "CONFIRM" and clicks "Proceed with Import"
   → jira.triggerImport:
     a. Check importLock — reject if true (concurrent import guard)
     b. Set importLock = true on jira_connections
     c. Begin import orchestrator asynchronously
     d. Return jobId to frontend
9. Frontend polls jira.getImportStatus every 2 seconds
10. Import Orchestrator runs:
    a. Hard delete (in FK dependency order — see FR-009)
    b. Clear jira_sync_mappings
    c. For each Jira project (sequential, paginated):
       - Create venture, write to jira_sync_mappings
       - For each epic: create workstream, write mapping
       - For each story/task under epic: create milestone, write mapping
       - For each risk/blocker issue: create risk/issue, write mapping
       - For each epic comment: create progress_update, write mapping
       - Write audit_trail entries (changedBy = sync system user)
    d. Update phase and count on import status
    e. On completion: set importLock = false, log import_completed
    f. On failure: set importLock = false, log error, leave jobId in error state
11. Frontend shows completion or error state
```

### Flow 2: Webhook Event Processing

```
1. Jira sends POST /api/jira-webhook
2. express.raw() captures raw body (no size limit)
3. HMAC validation:
   a. Read X-Hub-Signature header
   b. Compute HMAC-SHA256 of raw body using stored webhookSecret
   c. Constant-time compare — reject 401 on mismatch or missing header
4. Parse JSON body from raw buffer
5. Check idempotency: compose key = (webhookEvent + issue.id + changelog.id)
   → Query jira_sync_log for prior entry with same composite key
   → If found: return 200, discard
6. Determine event type:
   - jira:issue_created → classify issue type → create ORBIT entity
   - jira:issue_updated → look up jira_sync_mappings → update entity (or create if not found)
   - jira:issue_deleted → look up mapping → soft-delete ORBIT entity
   - comment_created → find parent epic mapping → create progress_update
   - unknown → log at info, return 200
7. Write audit_trail entry (changedBy = sync system user)
8. Write jira_sync_log entry (event_type = webhook_received)
9. Return 200
```

### Flow 3: 15-Minute Reconciliation

```
setInterval runs every 15 minutes:
1. Auth ping: GET /rest/api/3/myself
   → On 401: set connection status = error, log auth_failure, halt
2. For each venture WHERE jira_connection_id IS NOT NULL AND jira_sync_enabled = true:
   a. Log reconciliation_started
   b. Fetch full current Jira state for that project (paginated)
   c. Hash each Jira entity payload (SHA-256)
   d. Compare against jira_sync_mappings.sync_hash:
      - New entity (no mapping): create
      - Changed hash: update
      - Mapping exists but not in Jira result: soft-delete
   e. Update jira_sync_mappings.synced_at and sync_hash
   f. Log reconciliation_completed (or error)
3. Respect rate limiting between projects (sequential, with backoff on 429)
```

---

## 7. New and Modified Files

### New Files
```
server/routes/jiraWebhook.ts          — raw Express webhook route + HMAC validation
server/routers/jira.ts                — all jira.* tRPC procedures
server/services/encryption.ts         — AES-256 encrypt/decrypt for API token
server/services/jiraApiClient.ts      — all outbound Jira REST calls + pagination + backoff
server/services/jiraEntityMapper.ts   — Jira → ORBIT field transformation functions
server/services/importOrchestrator.ts — hard delete + paginated import + lock management
server/services/reconciliationJob.ts  — setInterval job, differential compare, soft-delete
server/services/jiraSyncLogger.ts     — wrapper for jira_sync_log inserts
client/src/pages/JiraSettingsPage.tsx
client/src/pages/JiraSyncDashboard.tsx
client/src/pages/JiraStatusMappingsPage.tsx
client/src/components/JiraVentureSyncDetail.tsx  — slide-over panel
client/src/components/JiraSyncBadge.tsx           — RAG dot with tooltip
```

### Modified Files
```
server/db/schema.ts               — four new tables, three new columns on ventures
server/db/startup.ts              — sync system user seed + JIRA_ENCRYPTION_KEY validation
server/index.ts                   — registerJiraWebhookRoute() call before express.json()
server/routers/index.ts           — import and register jiraRouter
server/routers/ventures.ts        — add Jira-managed read-only guard to update procedure
client/src/App.tsx (or Router)    — three new routes registered
client/src/pages/VentureOverview  — sync indicator section added
client/src/pages/VentureEdit      — Jira-managed lock banner + disabled fields
```

---

## 8. Backend Implementation Plan (Ordered)

The following tasks must be executed in this sequence. Each task is a distinct implementation unit.

**Task B1 — Schema migration**
Add four new tables and three columns to `ventures` in `server/db/schema.ts`. Schema push runs automatically on deploy via `drizzle-kit push`. No manual migration file needed — existing push mechanism handles it. Verify before deploy with the destructive pattern scan from CLAUDE.md.

**Task B2 — Startup: env validation and sync system user seed**
In `server/db/startup.ts`, add:
1. `JIRA_ENCRYPTION_KEY` env var check — throw and exit if absent or shorter than 32 characters.
2. Sync system user upsert: `INSERT INTO users (azure_oid, email, name, role) VALUES ('sync-system-001', 'sync@orbit.internal', 'Jira Sync', 'pmo') ON CONFLICT (email) DO NOTHING`. Role is `pmo` to satisfy `createdBy` constraints on venture inserts. This user must never appear in PM selection dropdowns — filter by `email != 'sync@orbit.internal'` in `ventures.listPMs`.

**Task B3 — Encryption utility**
`server/services/encryption.ts`:
- `encrypt(plaintext: string): string` — AES-256-GCM, returns `iv:authTag:ciphertext` as base64-joined string
- `decrypt(ciphertext: string): string` — inverse
- Key: `Buffer.from(process.env.JIRA_ENCRYPTION_KEY!, 'hex')` (32 bytes from 64-char hex string, or use first 32 bytes of UTF-8 if shorter — document the expectation clearly)
- Never log plaintext values. Function must not throw partial results.

**Task B4 — Jira API client**
`server/services/jiraApiClient.ts`:
- `JiraApiClient` class, constructed with `{ instanceUrl, email, apiToken }` (plaintext at call time — decryption happens in the router before instantiation)
- Methods: `testConnection()`, `registerWebhook(webhookUrl, secret)`, `deregisterWebhook(webhookId)`, `getProjects(startAt)`, `getIssues(projectKey, startAt)`, `getComments(issueKey, startAt)`, `getIssue(issueIdOrKey)`
- All paginated methods return `{ values: T[], total: number, isLast: boolean }`
- Rate limit handling: on 429, wait `Retry-After` (or 10s), retry up to 3 times. Log each wait via `jiraSyncLogger`.

**Task B5 — Sync logger service**
`server/services/jiraSyncLogger.ts`:
- `logSyncEvent(db, params: SyncLogParams): Promise<void>` — insert-only wrapper around `jira_sync_log`
- Accepts all column values; `connectionId` is required; all entity fields are optional
- Used by all other services — never write to `jira_sync_log` directly outside this wrapper

**Task B6 — Entity mapper**
`server/services/jiraEntityMapper.ts`:
- Pure functions, no DB calls. Input: raw Jira API response. Output: ORBIT insert shape.
- `mapProjectToVenture(project, syncUserId, connectionId)` → `VentureInsert`
- `mapEpicToWorkstream(epic, ventureId, sortOrder, statusMapper)` → `WorkstreamInsert`
- `mapIssueToMilestone(issue, workstreamId, ventureFallbackDate, statusMapper)` → `MilestoneInsert`
- `mapIssueToRisk(issue, ventureId, syncUserId)` → `RiskInsert`
- `mapIssueToIssue(issue, ventureId, syncUserId)` → `IssueInsert`
- `mapCommentToProgressUpdate(comment, ventureId, completionPct, syncUserId)` → `ProgressUpdateInsert`
- `resolveStatus(jiraStatusName, statusMappings, fallback)` → ORBIT status string + logs unmapped status
- `classifyIssue(issue)` → `'risk' | 'issue' | 'milestone'` — applies FR-020 precedence (Risk type wins over Blocker priority)

**Task B7 — Import orchestrator**
`server/services/importOrchestrator.ts`:
- `runImport(db, connectionId, jobId): Promise<void>` — async, designed to be called without awaiting from the tRPC mutation
- Maintains an in-memory job state map keyed by `jobId` for status polling
- Step 1: hard delete all venture-scoped data in FK-safe order (see FR-009 for full table list), then truncate `jira_sync_mappings` for this connection
- Step 2: paginate all Jira projects, for each project run the full entity chain, write mappings, call `logAudit` for each created entity
- Step 3: on any unrecoverable error, set importLock = false, write error to job state, write to `jira_sync_log`
- Step 4: on completion, set importLock = false, write `import_completed` log

Hard delete order (must respect FK constraints):
`milestone_completions` → `workstream_updates` → `blockers` → `decisions` → `budget_entries` → `budget_forecasts` → `task_dependencies` → `workstream_raci_assignments` → `milestones` → `workstreams` → `resource_assignments` → `progress_updates` → `risks` → `issues` → `approvals` → `audit_trail` (WHERE venture_id IN (...)) → `artifacts` → `venture_plans` → `ventures`

Note: do NOT delete `jira_connections`, `users`, `resources`, `config_options`.

**Task B8 — Reconciliation job**
`server/services/reconciliationJob.ts`:
- `startReconciliationJob(db): void` — called once at startup, registers `setInterval` at 15 minutes
- Auth ping first: GET /rest/api/3/myself — halt on 401
- For each active synced venture: fetch Jira state, hash each entity, compare to `jira_sync_mappings.sync_hash`, apply diffs
- Soft-delete: for ventures, set `status = 'archived'`; for workstreams, set `status = 'on_hold'`; for milestones, set `status = 'deferred'`; for risks, set `status = 'mitigated'`; for issues, set `status = 'resolved'`. Add a `deleted_in_jira` concept: set a flag or use a convention the frontend can detect (see Genuine Challenge section).
- Per-venture reconciliation is wrapped in try/catch — one venture failure does not abort reconciliation for others

**Task B9 — Webhook route**
`server/routes/jiraWebhook.ts`:
- Export `registerJiraWebhookRoute(app: Express): void`
- Registers: `app.use('/api/jira-webhook', webhookRateLimiter, express.raw({ type: 'application/json' }), webhookHandler)`
- `webhookRateLimiter`: 500 req/min per IP, separate `rateLimit()` instance
- `webhookHandler`: HMAC validation → idempotency check → event dispatch → 200 response
- HMAC: `crypto.createHmac('sha256', storedSecret).update(rawBody).digest('hex')` compared with `timingSafeEqual`
- Idempotency key: `${webhookEvent}_${issue.id}_${changelog?.id ?? 'no-changelog'}`

**Task B10 — tRPC jira router**
`server/routers/jira.ts`:
- All 14 procedures per Section 4.2
- `triggerImport` and `retryImport`: check importLock, set importLock, call `runImport` without `await`, return jobId immediately
- `getImportStatus`: read from in-memory job state map (single-process, single-instance — appropriate for Railway single-dyno deployment)
- `getVentureSyncDetail`: PM role check — if `ctx.user.role === 'pm'` verify `venture.pmUserId === ctx.user.id` before returning
- `setSyncEnabled`: same PM scope check
- API token is never returned from any query. Decrypt token only inside service calls, never surface in response objects.

**Task B11 — Venture edit guard**
In `server/routers/ventures.ts`, the `update` procedure must add: if `venture.jiraConnectionId !== null`, throw `TRPCError({ code: 'FORBIDDEN', message: 'This venture is managed by Jira and cannot be edited manually.' })`.

---

## 9. Frontend Implementation Plan (Ordered)

Frontend work can begin in parallel with backend Tasks B1–B7 against a mocked tRPC client, but final integration requires B10 to be complete.

**Task F1 — Routing**
Register three new routes in the app router. Guard with PMO role check at route level (redirect to `/` if not PMO). Routes: `/settings/jira`, `/settings/jira/sync`, `/settings/jira/mappings`.

**Task F2 — JiraSettingsPage**
Credential form with live test button, save, disconnect, import trigger flow. Import Preview Modal with type-to-confirm. Import Progress Overlay with polling. Import Error state with retry button. All form validations client-side before mutation call.

**Task F3 — JiraSyncDashboard**
Venture health table with RAG dots. "Wipe and Reimport All" button with Risk Gate modal (must state what will be lost, safe default is cancel, risky alternative is confirm). "Re-Sync" button per row (disabled while sync in progress). Slide-over panel component for venture sync detail.

**Task F4 — JiraStatusMappingsPage**
Table of known Jira statuses + ORBIT status dropdowns. Save per row. Empty state if no connection exists.

**Task F5 — Venture overview sync indicator**
Role-conditional sync section on venture detail page. GM sees timestamp only. PM sees timestamp + status badge + error count + toggle. PMO sees all of the above plus link to sync detail slide-over.

**Task F6 — Venture edit lock**
Lock banner and disabled fields when `jira_connection_id` is set. No save button visible. Banner explains data source.

**Task F7 — Venture list sync badge**
Add `JiraSyncBadge` component (green/amber/red dot with tooltip). Render in PMO/GM dashboard venture list when a connection exists. Tooltip: "Last synced [relative time]" or "Sync error — check dashboard".

---

## 10. Phase Order and Parallelization

```
Phase A — Foundation (sequential, no parallelism):
  B1 (schema)
  B2 (startup seed + env validation)
  B3 (encryption utility)
  B5 (sync logger)

Phase B — Core services (can run in parallel after Phase A):
  B4 (Jira API client)     ─┐
  B6 (entity mapper)       ─┤ parallel
  B7 (import orchestrator) ─┘ (depends on B4, B6)

Phase C — Integration layer (after Phase B):
  B8 (reconciliation job)   — depends on B4, B6
  B9 (webhook route)        — depends on B6
  B10 (tRPC router)         — depends on B4, B7, B8, B9
  B11 (venture edit guard)  — standalone, can run after B1

Phase D — Frontend (can begin on F1–F4 structure after B10 spec is final):
  F1 (routing)              — standalone
  F2 (settings page)        ─┐
  F3 (sync dashboard)       ─┤ parallel after F1
  F4 (status mappings)      ─┘
  F5, F6, F7 (venture page modifications) — parallel, after B11

Phase E — Integration testing:
  Full flow tests after B10 + F2 are complete
  Webhook HMAC tests after B9
  Reconciliation job tests after B8
```

---

## 11. Risk and Acceptance Criteria Mapping

### R1 — Jira API Rate Limits (Import Failure from 429)

**Implementation decision:** Sequential project processing (not parallel). Per-request retry with exponential backoff: wait = `Retry-After` header value, or 10s default. Max 3 retries per request. Log each 429 at `warning` in `jira_sync_log`. Do not abort the import on 429 — backoff and continue.

**Acceptance tests:**
- Simulate 429 response mid-import: import continues after backoff delay and completes successfully
- A `jira_sync_log` entry with `level = 'warning'` and `event_type = 'rate_limit_hit'` is present after the simulated 429
- Import with 500+ issues completes within 5 minutes under normal Jira response times
- Projects are processed one at a time — no concurrent Jira API calls

### R2 — Import Failure Recovery (Empty State Risk)

**Implementation decision:** importLock is set before delete begins. On any failure after hard delete, the job state is set to `error` and importLock is released. The UI surfaces the error with a "Retry Import" button. Retry calls `jira.retryImport` which re-runs the full orchestrator (re-delete + re-import) — there is no partial resume. The import job state map persists the error state until the next retry or page reload.

**Acceptance tests:**
- Hard delete completes then import throws at project 3 of 5: UI shows error state with "Retry Import" button; importLock is false; ventures table is empty (expected — not a silent failure)
- Clicking "Retry Import" re-runs the full delete + import and completes successfully
- After a failed import, `jira_sync_log` contains `import_started` and `error` entries; no `import_completed` entry
- Two simultaneous import triggers: the second returns a clear error "An import is already in progress"

### R3 — Webhook Reliability (Missed or Out-of-Order Events)

**Implementation decisions:**
- Idempotency: composite key `(webhookEvent, issue.id, changelog.id)` checked against `jira_sync_log` before processing. Duplicate delivery produces no ORBIT change and returns 200.
- Out-of-order `issue_updated` for an entity not yet in `jira_sync_mappings`: treated as a create, not an error.
- 15-minute reconciliation job catches any webhook that was dropped, delayed, or not delivered.
- HMAC validation blocks any non-Jira POST to the endpoint.

**Acceptance tests:**
- Send the same webhook payload twice: ORBIT entity updated once only; both requests return 200; `jira_sync_log` has one processing entry and one duplicate-discarded entry
- Send `jira:issue_updated` for an issue not in `jira_sync_mappings`: entity is created (not errored); log entry at `info`
- Simulate 5 minutes of webhook downtime, then run reconciliation: all changes made in Jira during downtime appear in ORBIT after reconciliation
- POST to `/api/jira-webhook` with incorrect `X-Hub-Signature`: returns 401; no DB writes occur
- POST with payload exceeding 50kb: returns 200 (not 413); processed normally

---

## 12. Scalability and Maintenance Notes

- **Single Jira instance per deployment:** The `jira_connections` table has no unique constraint but the application enforces a single active connection. If multi-instance support is added later, the unique constraint and all FK relationships will need revision.
- **In-memory import job state:** `getImportStatus` reads from a Node.js in-memory Map. This works correctly for Railway single-dyno deployment. If ORBIT ever runs multiple processes or dynos, job state must be moved to the DB or Redis. Flag this before any horizontal scaling.
- **`jira_sync_log` growth:** This table is insert-only and will grow indefinitely. At significant venture and event volume, implement a retention policy (e.g., archive entries older than 90 days). Not required for v1 but must be planned before the table becomes a performance concern.
- **`sync_hash` for delta detection:** The SHA-256 hash approach in reconciliation avoids unnecessary DB writes for unchanged entities. Ensure the hash is computed from a stable JSON serialization (sorted keys) to prevent false positives from field ordering changes in Jira API responses.
- **`setInterval` and startup timing:** The reconciliation job must be started after the DB connection is confirmed ready. Start it at the end of the startup sequence, after the sync system user seed completes.
- **Jira webhook registration URL:** Uses the Railway public URL. If the deployment URL changes, the registered webhook becomes stale. The disconnect + reconnect flow handles this — document it in the operations runbook.

---

## 13. Genuine Architectural Challenge

**The soft-delete signal problem.**

FR-036 requires that Jira-deleted entities are soft-deleted in ORBIT and display a "Deleted in Jira" indicator. But the existing ORBIT data model has no universal `deleted_in_jira` flag. Each entity table (workstreams, milestones, risks, issues) has its own `status` enum. Setting a terminal status (`on_hold`, `deferred`, `mitigated`, `resolved`) communicates "done" — not "deleted from source system."

A PM viewing a venture with a `deferred` milestone cannot distinguish between "this milestone was intentionally deferred by the PM" and "this milestone was deleted from Jira and ORBIT soft-deleted it." The UX requirement (show a "Deleted in Jira" indicator) cannot be satisfied by status alone.

**Two valid approaches:**

**Option A — Add `deleted_in_jira boolean default false` columns to affected tables.**
The foreign-key-safe additive approach. Requires schema changes to `workstreams`, `milestones`, `risks`, `issues`. Existing queries must be updated to filter or label these records. Clean semantic separation. More migration surface.

**Option B — Use `jira_sync_mappings` as the source of truth for deletion state.**
When an entity is soft-deleted by the sync, write a marker to `jira_sync_mappings` (e.g., a `deleted_at` timestamp column). The frontend queries `jira_sync_mappings` alongside entity data to determine whether to show the "Deleted in Jira" badge. No changes to entity tables. More complex query joins on the frontend path.

**This is a genuine design fork.** Option A is cleaner and more maintainable but requires additive columns on four existing tables (still safe under NFR-010). Option B avoids touching existing entity tables but couples the UI to `jira_sync_mappings` in a way that makes the deleted state harder to reason about in future.

**Recommendation:** Option A. The columns are additive, nullable, and default false — zero risk to existing data. The semantic clarity is worth the minor migration surface. But the implementation team must decide before DB-Agent builds the schema.

---

**DECISION RESOLVED — 2026-04-08**

**Option A chosen.** Add `deleted_in_jira boolean default false` columns to `workstreams`, `milestones`, `risks`, and `issues` tables. DB-Agent must include these four additive columns in the schema build. No further confirmation required before implementation.

---

## 14. Agent Instructions

### DB-Agent must:
- Add all four new tables exactly as specified in Section 3.1 to `server/db/schema.ts`
- Add the three columns to the `ventures` table definition in `server/db/schema.ts`
- Add the `importLock` column to `jira_connections` as specified (boolean, not null, default false) — this was in the PM summary hard constraints and is required for concurrent import guard
- Add `deleted_in_jira boolean default false` columns to `workstreams`, `milestones`, `risks`, and `issues` tables — **decision resolved, Option A confirmed (see Section 13)**
- Export all new tables from `server/db/schema.ts` (they are imported by name in services)
- Run the destructive pattern scan before any deploy: grep `server/db/startup.ts` for DROP/TRUNCATE/migrate reset — none should be present

### Backend-Agent must:
- Implement tasks B1–B11 in the phase order defined in Section 10
- Register `registerJiraWebhookRoute(app)` in `server/index.ts` BEFORE `app.use(express.json({ limit: '50kb' }))` — this is a hard constraint, not optional
- Never return `api_token_encrypted` or `webhook_secret` from any tRPC query response
- Decrypt the API token only at the point of constructing `JiraApiClient` — never store decrypted value in a variable that persists beyond a single request
- Use `crypto.timingSafeEqual` for HMAC comparison — do not use `===`
- Filter `sync@orbit.internal` from `ventures.listPMs` query so the sync user cannot be assigned as a venture PM
- The import orchestrator deletes data in the FK-safe order listed in Task B7 — do not reorder or batch across FK boundaries
- Sentinel `azureOid` for the sync user is `'sync-system-001'` — use this value consistently for upsert conflict detection

### Frontend-Agent must:
- All new pages use dark theme CSS variables only — no hardcoded hex colors
- Import Preview Modal requires a type-to-confirm input (user must type `CONFIRM`) — a single button click is not sufficient
- "Wipe and Reimport All" Risk Gate modal must state: what will be lost (all ventures and child entities), safe default (cancel), risky alternative (confirm and proceed) — matching the HERALD Risk Gate pattern
- "Re-Sync" button must be disabled while `triggerVentureResync` mutation is pending for that venture
- GM role sees last sync time only on venture page — no error details, no toggle
- Jira-managed venture edit form: all inputs read-only, save button hidden, lock banner visible at top of form
- Poll `jira.getImportStatus` at 2-second intervals during import — stop polling on completion or error state

---

## 15. Red Flags

- Do NOT register the Jira webhook route after `express.json()` — this breaks HMAC validation for payloads over 50kb
- Do NOT return `api_token_encrypted` or `webhook_secret` in any API response under any circumstances
- Do NOT allow the import to run in parallel (two simultaneous imports) — importLock must be checked and set atomically before the delete begins
- Do NOT delete `jira_connections`, `users`, `resources`, or `config_options` tables during the hard-delete import phase
- Do NOT use `Math.random()` or timestamp-based values for the HMAC webhook secret — use `crypto.randomBytes(32).toString('hex')`
- Do NOT implement the reconciliation job using a new job queue framework — `setInterval` only, per NFR-005
- Do NOT hard-delete ORBIT entities when a Jira `jira:issue_deleted` webhook arrives — soft-delete only (initial import uses hard delete; ongoing sync uses soft delete)
- Do NOT allow PMs to access `/settings/jira` or `/settings/jira/sync` — PMO only
- Do NOT allow the sync system user (`sync@orbit.internal`) to appear in PM selection dropdowns on the venture form

---

## 16. Decisions Made

| Decision | Choice | Rationale |
|---|---|---|
| Sync direction | Jira → ORBIT only | Approved in brief; ORBIT never writes to Jira |
| Auth method | API token (Basic Auth) | OAuth deferred to v2 per brief |
| Import strategy | Hard delete + reimport (full wipe) | Brief requirement; no partial resume |
| Ongoing delete behavior | Soft delete | Safety distinction from initial import; FR-036 |
| Webhook registration | Auto-registered by ORBIT via Jira API on credential save | Resolved open question; FR-004 |
| Reconciliation interval | 15 minutes, hardcoded | Resolved open question; not user-configurable in v1 |
| Import failure recovery | Re-run from scratch on retry; no partial resume | Resolved open question; FR-010 |
| Status mapping defaults | To Do→not_started, In Progress→in_progress, Done→complete, else→on_hold | Confirmed in PM summary |
| New DB tables | Four (not three as listed in brief) | `jira_status_mappings` added by BA for PMO status override UI |
| Import job state storage | In-memory Map (single-process) | Appropriate for Railway single-dyno; flag for future horizontal scale |
| Reconciliation tech | Node.js setInterval | NFR-005 — no new job queue infrastructure |
| Jira issue classification precedence | Risk type wins over Blocker priority | FR-020; if both, create as Risk not Issue |
| Sync system user role | `pmo` | Required to satisfy `createdBy` FK on venture inserts |
| Soft-delete signal | **RESOLVED** — Option A chosen | Add `deleted_in_jira boolean default false` to `workstreams`, `milestones`, `risks`, `issues` — confirmed 2026-04-08 |

---

## 17. Phase Declaration

- Phase 2 (UI/Design): Required — three new pages, multiple existing page modifications, and a slide-over component require UI design before build
- Phase 3 (Build): Required — full backend and frontend build
- Phase 4 (QA): Required — webhook HMAC, import orchestration, rate limit handling, and role-based access all require explicit QA verification
- Phase 5 (Data Review): Required — four new tables, new columns on ventures, and the import hard-delete scope must be reviewed by a data reviewer before deploy
- Phase 6 (Comms): Required — PMO admin must be informed of the new `JIRA_ENCRYPTION_KEY` env var requirement and the Railway deployment step needed before the feature can be used
