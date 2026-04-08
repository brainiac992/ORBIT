# Requirements Document — Jira Cloud Integration (Jira → ORBIT)
**Status: Implemented — 2026-04-08**
**Date:** 2026-04-08
**Status:** Draft
**Author:** BA Agent
**Program Brief:** /docs/jira-integration/pm/pm-brief-jira-integration.md

---

## 1. Overview

This initiative integrates ORBIT with Jira Cloud in a strictly one-way direction: Jira is the authoritative source of truth, ORBIT is the live consumer. The integration eliminates manual data entry by PMOs and PMs, which currently consumes 2–4 hours per venture per week.

The integration operates in two modes:

- **Initial Import:** A hard-delete-then-recreate operation that imports all Jira projects as ORBIT ventures, with all child entities mapped per the entity mapping specification below.
- **Ongoing Sync:** An inbound webhook listener that processes Jira change events and a 15-minute reconciliation job that catches any missed webhook events.

ORBIT will never push data to Jira. There is no bidirectional flow.

---

## 2. Organizational Context

ORBIT is operated by ADRES as a PMO platform. PMs currently maintain parallel records in both Jira and ORBIT, causing data staleness within hours of any Jira update. This integration makes that duplication unnecessary. The PMO admin holds administrative responsibility for setting up the connection; PMs and GMs are passive consumers of the synced data.

Existing ORBIT processes affected:

- Venture creation workflow: bypassed for Jira-synced ventures. Ventures are created by the import process, not through the wizard.
- Audit trail: sync-originated creates and updates must write to the existing `audit_trail` table using the established `logAudit` / `logAuditDiff` service.
- All role-based access controls (GM / PMO / PM) remain unchanged and apply to synced ventures identically to manually created ones.

---

## 3. Stakeholders & Users

| Stakeholder | Role | How They Use This | Access Level |
|---|---|---|---|
| PMO Admin | Setup & configuration | Enters API token, runs import, monitors sync dashboard, triggers re-sync | Full access — all sync features |
| Project Manager | Daily user | Reads ORBIT data that reflects Jira; pauses sync per venture | Can view sync status for own ventures; can toggle sync on/off for own ventures |
| General Manager | Visibility consumer | Views portfolio dashboard; sees sync health indicators per venture | View-only — sync health visible, no controls |
| Delivery Team (Jira) | Indirect | No ORBIT access change; their Jira workflow is unchanged | N/A |

---

## 4. Functional Requirements

### 4.1 Connection Setup & Credential Management

**FR-001 — Credential Entry Form**
The system must provide a PMO-only settings screen where the user can enter:
- Jira Cloud instance URL (validated against `*.atlassian.net` pattern)
- Email address (valid email format, max 255 characters)
- API token (treated as a secret; masked in the UI after save; max 500 characters)

**FR-002 — Test Connection**
Before saving credentials, the user must be able to trigger a "Test Connection" action. The system must call the Jira REST API (`GET /rest/api/3/myself`) using the provided credentials and display a clear success or failure result including the Jira account display name on success, or the specific error message on failure (e.g., "401 Unauthorized — check your API token").

**FR-003 — Encrypted Storage**
API token credentials must be stored encrypted at rest in the `jira_connections` table. The plaintext token must never be returned by any API endpoint after the initial save. The email and instance URL may be returned for display.

**FR-004 — Webhook Auto-Registration**
Upon successful credential save, ORBIT must automatically register the Jira webhook via the Jira REST API (`POST /rest/api/3/webhook`). The webhook must subscribe to events: `jira:issue_created`, `jira:issue_updated`, `jira:issue_deleted`, `comment_created`. ORBIT generates and stores the HMAC secret used to validate inbound payloads. The PMO admin must not need to configure webhooks manually in Jira.

**FR-005 — Connection Status Indicator**
The settings screen must display the current connection status: Connected (with the linked Jira account email and instance URL), Disconnected, or Error (with last error message and timestamp).

**FR-006 — Periodic Auth Validation**
The system must perform a lightweight auth validation ping (`GET /rest/api/3/myself`) on every reconciliation cycle (every 15 minutes). If auth fails, the system must set the connection status to Error, write to `jira_sync_log`, and surface an alert on the Sync Status Dashboard. Sync must be halted until the error is resolved.

**FR-007 — Disconnect / Remove Connection**
The PMO admin must be able to disconnect the Jira integration. Disconnecting must: deregister the ORBIT webhook from Jira via API, clear the stored credentials, and stop all sync operations. It must NOT automatically delete synced ventures or their data.

---

### 4.2 Initial Import (Hard-Delete and Bulk Create)

**FR-008 — Import Preview Screen**
Before executing any import, the system must display a preview screen showing:
- Count of existing ORBIT ventures that will be permanently deleted
- Count of existing workstreams, milestones, risks, issues, and progress updates that will be permanently deleted
- Count of Jira projects found (to become ORBIT ventures)
- Count of Jira epics, stories/tasks, risk-type issues, and blocker-priority issues discovered (to be created)
- An explicit warning that this action is irreversible
- A confirmation input or button that requires deliberate user action (not a single accidental click)

**FR-009 — Hard Delete Scope**
When confirmed, the import process must permanently (hard) delete all records from the following ORBIT tables, in dependency order to respect foreign key constraints: `milestone_completions`, `workstream_updates`, `blockers`, `decisions`, `budget_entries`, `budget_forecasts`, `task_dependencies`, `workstream_raci_assignments`, `milestones`, `workstreams`, `resource_assignments`, `progress_updates`, `risks`, `issues`, `approvals`, `audit_trail` (venture-scoped), `artifacts`, `venture_plans`, and `ventures`. The `users`, `resources`, `config_options`, and `jira_connections` tables must NOT be deleted. The `jira_sync_mappings` and `jira_sync_log` tables must be cleared and rebuilt.

**FR-010 — No Empty State on Failure**
If the hard delete executes but the subsequent import fails at any point, the system must NOT leave ORBIT in an empty state. The UI must surface a clear, specific error message and a "Retry Import" button. The retry must re-execute from scratch: re-delete and re-import. There is no partial resume. The system must not silently swallow the failure.

**FR-011 — Jira API Pagination**
The import process must paginate all Jira API calls (using `startAt` / `maxResults` per the Jira REST API spec). Each paginated request must be processed sequentially, not in parallel. The system must handle all pages until all issues are retrieved regardless of project size.

**FR-012 — Import Progress Indicator**
The UI must show a live progress indicator during import: current phase (e.g., "Fetching projects…", "Importing project 3 of 12…", "Creating milestones…") and a count of items processed vs. total discovered. The user must be able to see that the operation is active and not stalled.

**FR-013 — Rate Limit Compliance**
The import process must implement request queuing with exponential backoff. On HTTP 429 responses from the Jira API, the system must wait the duration specified in the `Retry-After` header (or use a default of 10 seconds if the header is absent) before retrying. Projects must be processed sequentially, not in parallel.

**FR-014 — Idempotency via Sync ID Table**
Every imported entity must be recorded in `jira_sync_mappings` with its Jira entity ID and corresponding ORBIT entity ID. On any re-import that is not a fresh wipe, the system must use this table to prevent duplicate creation. A fresh wipe (FR-009) truncates this table before re-importing.

**FR-015 — Jira-Managed Ventures Flagged**
Every venture created by the import process must have `jira_connection_id` and `jira_project_key` populated (via `jira_connections` foreign key in the ventures table, see Data Requirements). These fields indicate the venture is Jira-managed. Jira-managed ventures must not be editable through the standard venture edit UI — the sync is the source of truth.

---

### 4.3 Entity Mapping (Jira → ORBIT)

**FR-016 — Project → Venture Mapping**
Each Jira project must be created as one ORBIT venture. Mapped fields:
- Jira `project.name` → `ventures.name` (max 255 chars; truncate with ellipsis if exceeded)
- Jira `project.description` → `ventures.description`
- Jira `project.key` → stored in `jira_sync_mappings` and on the venture record
- `ventures.startDate` → set to the earliest issue `created` date within the project, or today's date if no issues exist
- `ventures.targetEndDate` → set to the latest issue `dueDate` within the project, or 90 days from today if none exist
- `ventures.status` → derived from Jira project status via status mapping (FR-018)
- `ventures.pmUserId` → set to the ORBIT system user designated as the sync owner (a configurable setting, see FR-028); PMO admin assigns a real PM after import
- `ventures.createdBy` → set to the ORBIT system user designated as the sync owner

**FR-017 — Epic → Workstream Mapping**
Each Jira epic within a project must be created as one ORBIT workstream under the corresponding venture. Mapped fields:
- Jira `epic.summary` → `workstreams.name` (max 255 chars)
- Jira `epic.status.name` → `workstreams.status` via status mapping (FR-018)
- Jira `epic.completionPct` (if available via `aggregateprogress`) → `workstreams.completionPct`
- `workstreams.sortOrder` → assigned sequentially in import order

**FR-018 — Status Mapping**
Default Jira-to-ORBIT status mapping (applies to all entity types):
| Jira Status | ORBIT Status |
|---|---|
| To Do | `not_started` |
| In Progress | `in_progress` |
| Done | `complete` |
| Any unmapped status | `on_hold` |

The PMO admin must be able to view and override this mapping through the Status Mapping configuration UI (FR-027) after the initial import completes. Overrides are stored in a `jira_status_mappings` subtable (see Data Requirements). Unknown statuses encountered during sync must be logged as warnings in `jira_sync_log` with the unmapped status name, then defaulted to `on_hold`.

**FR-019 — Story/Task → Milestone Mapping**
Each Jira story or task (issue type: Story, Task, Sub-task) that is a child of an epic must be created as one ORBIT milestone under the corresponding workstream. Mapped fields:
- Jira `issue.summary` → `milestones.name` (max 255 chars)
- Jira `issue.duedate` → `milestones.dueDate` (if null, set to parent epic's end date; if still null, set to venture `targetEndDate`)
- Jira `issue.status.name` → `milestones.status` via mapping: `complete` → `achieved`, `in_progress` → `upcoming`, `not_started` → `upcoming`, `on_hold` → `deferred` (milestone enum: `upcoming`, `achieved`, `overdue`, `deferred`)
- Jira `issue.resolutiondate` → `milestones.actualCompletionDate` (if resolved)

**FR-020 — Risk Issue → Risk Mapping**
Jira issues where the issue type name is "Risk" OR where the issue has the label `orbit-risk` must be created as ORBIT risks. Mapped fields:
- Jira `issue.summary` → `risks.title` (max 255 chars)
- Jira `issue.description` → `risks.description`
- `risks.likelihood` → defaulted to 3 (medium), cannot be inferred from Jira
- `risks.impact` → defaulted to 3 (medium), cannot be inferred from Jira
- `risks.riskScore` → 9 (3 × 3 default)
- `risks.weight` → defaulted to 3
- `risks.rag` → defaulted to `amber` based on default score
- `risks.status` → mapped from Jira status via FR-018 (Done → `mitigated`, otherwise `open`)
- `risks.createdBy` → sync system user

**FR-021 — Blocker Issue → Issue Mapping**
Jira issues where `priority.name` is "Blocker" (and not already mapped as a Risk per FR-020) must be created as ORBIT issues with `severity = 'blocker'`. Mapped fields:
- Jira `issue.summary` → `issues.title` (max 255 chars)
- Jira `issue.description` → `issues.description`
- `issues.severity` → `blocker`
- `issues.status` → mapped from Jira: Done → `resolved`, In Progress → `in_progress`, anything else → `open`
- `issues.createdBy` → sync system user

**FR-022 — Epic Comment → Progress Update Mapping**
Comments on Jira epics must be imported as ORBIT progress updates against the corresponding venture. Mapped fields:
- Jira `comment.body` → `progressUpdates.narrative` (text, no max enforced — Jira comments can be long)
- Jira `comment.created` → `progressUpdates.submittedAt`
- `progressUpdates.overallStatus` → defaulted to `on_track`
- `progressUpdates.completionPct` → set to workstream `completionPct` at time of import
- `progressUpdates.submittedBy` → sync system user
- `progressUpdates.weekLabel` → derived from comment date: `YYYY-Www` format

---

### 4.4 Ongoing Sync (Webhook Listener + Reconciliation Job)

**FR-023 — Webhook Endpoint**
The system must expose a dedicated HTTP POST endpoint at `/api/jira-webhook` to receive inbound Jira events. This endpoint must:
- Be registered as a raw Express route BEFORE tRPC middleware (so body-parser limits do not apply)
- Accept `application/json` content type with no body size limit (Jira payloads can exceed 50kb)
- Be exempt from the global 200 req/min rate limiter (Jira events are not user traffic)
- Apply its own rate limiter of 500 req/min per IP to prevent abuse
- NOT require ORBIT authentication headers (Jira sends unauthenticated POST requests)

**FR-024 — HMAC Signature Validation**
Every inbound webhook request must be validated using the HMAC-SHA256 secret generated at connection setup (FR-004). The validation must:
- Read the `X-Hub-Signature` header from the request
- Compute HMAC-SHA256 of the raw request body using the stored secret
- Reject with HTTP 401 if the signature does not match
- Reject with HTTP 401 if the header is absent
- Use constant-time comparison to prevent timing attacks

**FR-025 — Webhook Event Processing**
The system must handle the following Jira webhook event types:

| Jira Event | ORBIT Action |
|---|---|
| `jira:issue_created` | Create the corresponding ORBIT entity based on issue type (FR-019 / FR-020 / FR-021) |
| `jira:issue_updated` | Update the corresponding ORBIT entity. If no matching `jira_sync_mappings` record exists, create it (handle out-of-order events). |
| `jira:issue_deleted` | Soft-delete (archive) the corresponding ORBIT entity — do NOT hard-delete |
| `comment_created` | Create a progress update on the parent epic's venture (FR-022) |

Unrecognised event types must be acknowledged (HTTP 200) and logged to `jira_sync_log` at level `info` without processing.

**FR-026 — Webhook Idempotency**
Webhook event processing must be idempotent. If the same Jira event is received twice (Jira may re-deliver on timeout), processing it a second time must produce no change and return HTTP 200. Deduplication must be based on the Jira event `webhookEvent` + `issue.id` + `issue.changelog.id` composite key, checked against `jira_sync_log`.

**FR-027 — Reconciliation Job**
The system must run a background reconciliation job every 15 minutes. The job must:
- For each venture with an active Jira connection and sync enabled: fetch the full current state from Jira for that venture's project
- Compare the Jira state against `jira_sync_mappings`
- Create, update, or soft-delete ORBIT entities to match Jira
- Log a `jira_sync_log` entry on completion (success or error)
- Respect rate limiting (FR-013)
- The 15-minute interval is hardcoded in v1 and is not configurable by users

**FR-028 — Sync System User**
A designated ORBIT user record must exist to represent the sync process as the actor for all audit log entries and created_by fields. This user must be pre-seeded in the database (e.g., `email: sync@orbit.internal`, `role: pmo`, `name: Jira Sync`). All sync-created records must reference this user ID. This user must not be able to authenticate interactively.

---

### 4.5 Sync Status Dashboard

**FR-029 — Global Sync Health Overview**
The Sync Status Dashboard must be accessible to PMO role only (via Settings or a dedicated route). It must display a per-venture health indicator using the RAG colour system (green / amber / red):
- Green: last sync completed successfully within the last 30 minutes
- Amber: last sync completed successfully but more than 30 minutes ago, or minor errors present
- Red: sync has failed or has not completed successfully in the last 2 hours

**FR-030 — Per-Venture Sync Detail**
Clicking a venture in the dashboard must show:
- Jira project key and instance URL
- Last successful sync timestamp
- Last attempted sync timestamp
- Sync status (enabled / disabled)
- Error log: entity type, entity Jira ID, error message, timestamp, retry count

**FR-031 — Manual Re-Sync Button**
Each venture row on the dashboard must have a "Re-Sync" button (PMO only). Clicking it must trigger an immediate reconciliation job for that venture only (same logic as FR-027 but scoped). The button must be disabled while a sync is in progress for that venture.

**FR-032 — Wipe and Reimport All Button**
The dashboard must include a "Wipe and Reimport All" button (PMO only). This button must:
- Display a Risk Gate confirmation dialog in the UI before executing
- The dialog must state: what data will be lost (all ventures and child entities), the safe default (cancel), and the risky alternative (proceed with full reimport)
- Only proceed after explicit confirmation
- Execute the full import flow (FR-008 through FR-014) on confirmation

**FR-033 — Sync Error Visibility for PMs**
On each venture detail page, the PM (for their own venture) and PMO must be able to see:
- Last sync time
- Current sync status (enabled / disabled / error)
- A count of sync errors (if any), with a link to the full error log

GMs see last sync time only — no error details.

---

### 4.6 Per-Venture Sync Controls

**FR-034 — Jira Project Key Display**
Each venture that is Jira-linked must display its Jira project key prominently on the venture overview page. The key must be a link to the Jira project (opens in a new tab).

**FR-035 — Sync Enable/Disable Toggle**
Each Jira-linked venture must have a sync toggle (PMO can toggle any venture; PM can toggle their own venture). Disabling sync must:
- Pause all webhook processing and reconciliation for that venture
- Retain the Jira connection configuration
- Display a visible "Sync Paused" indicator on the venture page
- Resume sync when re-enabled (next reconciliation cycle picks it up)

**FR-036 — Soft-Delete on Ongoing Jira Deletions**
When a Jira issue is deleted after the initial import, the corresponding ORBIT entity must be soft-deleted (archived/status set to a terminal state), not hard-deleted. This is a deliberate safety distinction from the initial import behaviour (FR-009 uses hard delete). Soft-deleted entities remain visible in ORBIT with a visual "Deleted in Jira" indicator.

---

### 4.7 Status Mapping Configuration UI

**FR-027-UI — Status Mapping Override Screen**
The PMO admin must be able to view and edit the Jira-to-ORBIT status mapping via a configuration screen (accessible from the Sync Settings or Config area). The screen must:
- Display all known Jira statuses discovered during the last import/sync
- Show the current mapped ORBIT status for each
- Allow the PMO admin to change the mapping via a dropdown (ORBIT status options: `not_started`, `in_progress`, `complete`, `on_hold`)
- Save overrides to `jira_status_mappings` table (see Data Requirements)
- Apply updated mappings to the next reconciliation cycle — not retroactively to already-synced data

---

## 5. Data Requirements

All new tables are additive. No existing columns or tables are modified.

### 5.1 Table: `jira_connections`

Stores the Jira Cloud credential and connection configuration for the single connected instance.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default random | |
| `instance_url` | `varchar(500)` | not null | e.g., `https://myorg.atlassian.net` |
| `account_email` | `varchar(255)` | not null | Jira account email for the API token |
| `api_token_encrypted` | `text` | not null | AES-256 encrypted token; never returned in API responses |
| `webhook_secret` | `varchar(255)` | not null | HMAC secret for validating inbound webhooks |
| `webhook_id` | `varchar(255)` | nullable | Jira-assigned webhook ID, populated after registration |
| `status` | `varchar(50)` | not null, default `'connected'` | enum-like: `connected`, `error`, `disconnected` |
| `last_validated_at` | `timestamp with tz` | nullable | Timestamp of last successful auth ping |
| `last_error` | `text` | nullable | Last error message from auth ping or sync |
| `created_by` | `uuid` | FK → `users.id`, not null | |
| `created_at` | `timestamp with tz` | not null, default now | |
| `updated_at` | `timestamp with tz` | not null, default now | |

Indexes:
- `jira_connections_status_idx` on `(status)`

Design note: Only one active row is expected per ORBIT deployment (single-instance constraint). Application layer enforces this — no unique constraint on the table to allow for disconnect/reconnect history if needed.

### 5.2 Table: `jira_sync_mappings`

Maps each ORBIT entity to its Jira source entity. Used for idempotency and delta sync.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default random | |
| `connection_id` | `uuid` | FK → `jira_connections.id`, not null | |
| `jira_entity_type` | `varchar(50)` | not null | e.g., `project`, `epic`, `issue`, `comment` |
| `jira_entity_id` | `varchar(255)` | not null | Jira's internal ID (e.g., issue key or numeric ID) |
| `orbit_entity_type` | `varchar(50)` | not null | e.g., `venture`, `workstream`, `milestone`, `risk`, `issue`, `progress_update` |
| `orbit_entity_id` | `uuid` | not null | FK to the ORBIT record |
| `synced_at` | `timestamp with tz` | not null, default now | Last time this entity was synced |
| `sync_hash` | `varchar(64)` | nullable | SHA-256 hash of last synced Jira payload for delta detection |

Indexes:
- `jira_sync_jira_entity_idx` — unique on `(connection_id, jira_entity_type, jira_entity_id)` — enforces idempotency
- `jira_sync_orbit_entity_idx` on `(orbit_entity_type, orbit_entity_id)` — for reverse lookup on webhook events

### 5.3 Table: `jira_sync_log`

Immutable event log for all sync operations (insert-only, never updated).

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default random | |
| `connection_id` | `uuid` | FK → `jira_connections.id`, not null | |
| `venture_id` | `uuid` | FK → `ventures.id`, nullable | null for global operations (e.g., full import) |
| `event_type` | `varchar(100)` | not null | e.g., `import_started`, `import_completed`, `webhook_received`, `reconciliation_started`, `entity_created`, `entity_updated`, `entity_deleted`, `auth_failure`, `rate_limit_hit`, `unknown_status`, `error` |
| `jira_entity_type` | `varchar(50)` | nullable | Populated for entity-level events |
| `jira_entity_id` | `varchar(255)` | nullable | Jira entity key/ID |
| `orbit_entity_type` | `varchar(50)` | nullable | |
| `orbit_entity_id` | `uuid` | nullable | |
| `level` | `varchar(20)` | not null, default `'info'` | `info`, `warning`, `error` |
| `message` | `text` | not null | Human-readable description |
| `payload` | `jsonb` | nullable | Raw Jira payload or error details for debugging |
| `created_at` | `timestamp with tz` | not null, default now | |

Indexes:
- `jira_sync_log_connection_id_idx` on `(connection_id)`
- `jira_sync_log_venture_id_idx` on `(venture_id)`
- `jira_sync_log_created_at_idx` on `(created_at)`
- `jira_sync_log_level_idx` on `(level)` — to filter errors quickly on the dashboard

### 5.4 Table: `jira_status_mappings`

Stores PMO-admin overrides to the default Jira status → ORBIT status mapping.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default random | |
| `connection_id` | `uuid` | FK → `jira_connections.id`, not null | |
| `jira_status_name` | `varchar(255)` | not null | The exact Jira status name (case-sensitive) |
| `orbit_status` | `varchar(50)` | not null | One of: `not_started`, `in_progress`, `complete`, `on_hold` |
| `updated_by` | `uuid` | FK → `users.id`, not null | |
| `updated_at` | `timestamp with tz` | not null, default now | |

Indexes:
- `jira_status_mappings_unique_idx` — unique on `(connection_id, jira_status_name)`

### 5.5 Additive Columns on Existing Tables

The following columns must be added to existing tables. These are the only schema changes to existing tables and are purely additive (nullable, no constraints broken):

**`ventures` table — add:**
| Column | Type | Constraints | Notes |
|---|---|---|---|
| `jira_connection_id` | `uuid` | nullable, FK → `jira_connections.id` | null = not Jira-managed |
| `jira_project_key` | `varchar(50)` | nullable | e.g., `PROJ`, `ORB` |
| `jira_sync_enabled` | `boolean` | not null, default `true` | Only meaningful when `jira_connection_id` is set |

Index: `ventures_jira_connection_id_idx` on `(jira_connection_id)` where `jira_connection_id is not null`.

---

## 6. API Requirements

All new tRPC procedures follow the established pattern: `protectedProcedure` + `requireRole()` middleware. The webhook endpoint is a raw Express route, not tRPC.

### 6.1 tRPC Router: `jira` (new router, added to `appRouter`)

| Procedure | Type | Role | Description |
|---|---|---|---|
| `jira.getConnection` | query | pmo | Returns connection record (excluding `api_token_encrypted` and `webhook_secret`) |
| `jira.testConnection` | mutation | pmo | Tests Jira credentials without saving. Input: `{ instanceUrl, email, apiToken }`. Returns `{ success: boolean, accountName?: string, error?: string }` |
| `jira.saveConnection` | mutation | pmo | Saves credentials (encrypted), registers webhook (FR-004), sets status. Input: `{ instanceUrl, email, apiToken }` |
| `jira.disconnect` | mutation | pmo | Deregisters webhook, clears credentials (FR-007) |
| `jira.getImportPreview` | query | pmo | Returns counts of entities to delete and entities to create from Jira (FR-008). Does not execute any changes. |
| `jira.triggerImport` | mutation | pmo | Triggers full hard-delete + import. Returns job ID for progress polling. |
| `jira.getImportStatus` | query | pmo | Polls import job status: phase, items processed, items total, errors. Input: `{ jobId }` |
| `jira.retryImport` | mutation | pmo | Re-runs the full import from scratch (used by "Retry Import" button on failure) |
| `jira.getSyncDashboard` | query | pmo | Returns per-venture sync health: last sync time, RAG status, error counts |
| `jira.getVentureSyncDetail` | query | pmo, pm | Returns sync log and status for one venture. PM can only query their own venture. Input: `{ ventureId }` |
| `jira.triggerVentureResync` | mutation | pmo | Triggers immediate reconciliation for one venture. Input: `{ ventureId }` |
| `jira.setSyncEnabled` | mutation | pmo, pm | Enables or disables sync for one venture. PM scoped to own venture. Input: `{ ventureId, enabled: boolean }` |
| `jira.getStatusMappings` | query | pmo | Returns all known Jira statuses and their current ORBIT mapping |
| `jira.updateStatusMapping` | mutation | pmo | Updates one Jira status → ORBIT status mapping. Input: `{ jiraStatusName, orbitStatus }` |

### 6.2 Raw Express Route: Webhook Receiver

| Route | Method | Auth | Description |
|---|---|---|---|
| `/api/jira-webhook` | POST | HMAC signature (FR-024) — no ORBIT user auth | Receives Jira webhook events. Validates HMAC, queues event for processing, returns HTTP 200. Must be registered before tRPC middleware and before global `express.json({ limit: '50kb' })` middleware. Uses its own `express.raw({ type: 'application/json' })` to preserve raw body for HMAC validation. |

HTTP response codes from webhook endpoint:
- `200 OK` — event received and queued (or duplicate, discarded)
- `401 Unauthorized` — HMAC validation failed
- `400 Bad Request` — malformed payload (missing required fields)
- `503 Service Unavailable` — sync is globally disabled or connection is in error state

---

## 7. UI Requirements

All UI must use dark theme CSS variables only. No hardcoded hex values. All new screens must be responsive and follow the existing component library patterns.

| Screen / Component | Route (suggested) | Roles with Access | Description |
|---|---|---|---|
| Jira Connection Settings | `/settings/jira` | PMO only | FR-001 through FR-007: credential form, test button, connection status, disconnect button |
| Import Preview Modal | modal over `/settings/jira` | PMO only | FR-008: counts, warning text, confirmation button |
| Import Progress Screen | overlay or dedicated page | PMO only | FR-012: live phase + count display, cancel not available mid-import |
| Import Error Screen | replaces progress on failure | PMO only | FR-010: error message, "Retry Import" button |
| Sync Status Dashboard | `/settings/jira/sync` | PMO only | FR-029 through FR-032: global venture list, RAG indicators, re-sync and wipe buttons |
| Venture Sync Detail Panel | slide-over on dashboard | PMO, PM (own) | FR-030: error log, timestamps |
| Status Mapping Config | `/settings/jira/mappings` | PMO only | FR-027-UI: Jira status list + ORBIT status dropdowns |
| Venture Page — Sync Indicator | inline on venture overview | GM (status only), PM (status + errors), PMO (full) | FR-033, FR-034, FR-035: Jira key link, last sync time, toggle, error count |

---

## 8. Non-Functional Requirements

**NFR-001 — Import Performance**
Initial import must complete in under 5 minutes for up to 500 issues per Jira project. Projects with more issues must still complete (no hard limit), but may exceed 5 minutes.

**NFR-002 — Sync Latency**
A Jira change must be reflected in ORBIT within 60 seconds of the webhook being delivered by Jira (webhook processing latency). This excludes Jira's own delivery latency.

**NFR-003 — Webhook Endpoint Availability**
The webhook endpoint must be available whenever the ORBIT server is running. It must not be gated behind a feature flag that could prevent Jira event receipt.

**NFR-004 — Credential Security**
API token must be encrypted at rest using AES-256 (or equivalent). The plaintext value must never appear in logs, API responses, or error messages. The webhook HMAC secret must also never appear in API responses.

**NFR-005 — No New Frameworks**
Stack is React + tRPC + Drizzle + PostgreSQL + Express. No new frameworks, ORMs, or runtime dependencies without explicit approval. Background job (reconciliation) must use Node.js `setInterval` or a lightweight scheduler — no new job queue infrastructure.

**NFR-006 — Body Size Exemption**
The webhook endpoint is explicitly exempt from the global `express.json({ limit: '50kb' })` middleware. This must be implemented by registering the webhook route before the global JSON middleware in `server/index.ts`.

**NFR-007 — Rate Limiting on Webhook**
The webhook endpoint must have its own rate limiter: 500 req/min per source IP. It is exempt from the global 200 req/min limiter.

**NFR-008 — Zero Silent Failures**
Every sync operation that results in an error must produce a `jira_sync_log` entry at level `error`. No sync failure may go unrecorded.

**NFR-009 — Audit Trail**
All ORBIT entities created or modified by sync must produce `audit_trail` entries using the existing `logAudit` / `logAuditDiff` service. The `changedBy` field must reference the sync system user (FR-028).

**NFR-010 — Additive Schema Only**
No existing table columns may be modified. No existing tables may be dropped. Migrations are additive only.

---

## 9. Governance & Workflow

- The PMO admin is the sole operator of the Jira connection. No other role can configure, connect, disconnect, or trigger a full reimport.
- PMs may toggle sync on/off for their own venture only.
- GMs have no sync controls — view only.
- The "Wipe and Reimport All" action requires an explicit in-UI Risk Gate confirmation (not just a toast prompt) before executing.
- All sync-generated data mutations are recorded in `audit_trail` via the existing audit service.
- The `jira_sync_log` table is immutable (insert-only). No records are ever updated or deleted from it. It is a permanent operational log.

---

## 10. Acceptance Criteria

| Requirement | Acceptance Criterion |
|---|---|
| FR-001 | A PMO admin can submit the credential form with a valid `*.atlassian.net` URL, email, and token. Non-PMO users cannot access the settings screen. An invalid URL format is rejected client-side before submission. |
| FR-002 | "Test Connection" calls Jira and displays the connected account display name on success. On failure, it displays the specific HTTP status and message from Jira (not a generic error). The test does not persist any data. |
| FR-003 | After saving, querying `jira.getConnection` returns the email and instance URL but NOT the API token or webhook secret. The `api_token_encrypted` column in the database contains a value that is not the plaintext token. |
| FR-004 | After saving credentials, querying the Jira webhook list via the Jira API confirms a webhook is registered pointing to the ORBIT `/api/jira-webhook` endpoint, subscribed to the four required event types. |
| FR-008 | The preview screen shows correct counts matching the actual Jira state. The import does not begin until the user takes an explicit confirmation action. |
| FR-009 | After a confirmed import, the `ventures`, `workstreams`, `milestones`, `risks`, `issues`, `progress_updates` tables contain only records created by the import process. No pre-import data remains. |
| FR-010 | When the import process is interrupted after hard delete but before completion (simulated), the UI shows an error message and a "Retry Import" button. ORBIT is not left with zero ventures visible to users (the retry re-runs the full process). |
| FR-014 | Running the import twice in non-wipe mode does not create duplicate ventures, workstreams, or milestones. Record counts match the Jira record counts. |
| FR-015 | A venture created by import has `jira_connection_id` and `jira_project_key` populated. The standard venture edit form is disabled or read-only for Jira-managed ventures. |
| FR-018 | A Jira issue with status "In Progress" is imported as an ORBIT entity with status `in_progress`. A Jira issue with an unmapped status (e.g., "Backlog") is imported as `on_hold` and a warning entry exists in `jira_sync_log`. |
| FR-023 | A POST to `/api/jira-webhook` with a payload exceeding 50kb is accepted (not rejected with 413). A POST without a valid HMAC signature is rejected with 401. |
| FR-024 | A request to `/api/jira-webhook` with an incorrect `X-Hub-Signature` header returns HTTP 401. A request with a correct signature returns HTTP 200. |
| FR-025 | Creating an issue in Jira (type: Story, under an epic) results in a new ORBIT milestone appearing within 60 seconds. Deleting a Jira issue results in the ORBIT entity being soft-deleted (not hard-deleted), and a "Deleted in Jira" indicator appears on the venture. |
| FR-026 | Sending the same webhook payload twice results in exactly one ORBIT entity update (not two). The second delivery returns HTTP 200. |
| FR-027 | The reconciliation job runs every 15 minutes. A Jira change made immediately after a webhook is processed is also reflected after the next reconciliation cycle runs, with no duplicate records created. |
| FR-029 | The Sync Dashboard shows green for a venture synced within the last 30 minutes, amber for 30–120 minutes, and red for over 120 minutes or a failed sync. |
| FR-031 | Clicking "Re-Sync" for a venture triggers a reconciliation within 10 seconds. The button is disabled while the sync is in progress. |
| FR-032 | Clicking "Wipe and Reimport All" shows a Risk Gate modal. Cancelling the modal makes no changes. Confirming executes the full import. |
| FR-035 | Disabling sync for a venture via the toggle causes subsequent Jira changes to that project to NOT be reflected in ORBIT. Re-enabling sync causes the next reconciliation to resume. |
| NFR-004 | `strings` / `grep` on the database dump for the plaintext API token value returns no matches outside the encrypted column. |

---

## 11. Edge Cases & Error Scenarios

| Scenario | Required System Behaviour |
|---|---|
| Jira returns HTTP 429 during import | Apply exponential backoff starting at the `Retry-After` value (default 10s). Log to `jira_sync_log` at `warning`. Continue import after backoff. Do not abort the import. |
| Jira returns HTTP 401 during sync | Set connection status to `error`. Log to `jira_sync_log` at `error`. Surface alert on Sync Dashboard. Halt all sync operations until PMO admin re-authenticates. |
| Webhook arrives for a Jira entity not in `jira_sync_mappings` | Treat as a new entity. Attempt to create it. Log at `info`. |
| Webhook arrives for a deleted ORBIT entity | Log at `info`, discard. Do not attempt to re-create. |
| Jira status name unknown (no mapping exists) | Map to `on_hold`. Log to `jira_sync_log` at `warning` with the unmapped status name. |
| Jira `duedate` is null on a story/task | Use parent epic's end date. If also null, use venture `targetEndDate`. If also null, use 90 days from today. |
| Epic has no child issues | Create the workstream with `completionPct = 0` and `status = not_started`. |
| Import fails after hard delete | Do not leave ORBIT empty. Surface error + "Retry Import" button. The retry re-executes from scratch (re-delete + re-import). |
| Webhook payload exceeds 50kb | Accepted (FR-023). The raw body parser on the webhook route has no size limit. |
| Two simultaneous import triggers | The second trigger must be rejected with a clear error: "An import is already in progress." Only one import may run at a time. A lock flag on `jira_connections` enforces this. |
| Jira project with no issues | Import creates the venture with derived start/end dates (today and 90 days from today). No child entities created. Logged at `info`. |
| ORBIT user designated as sync owner does not exist | Application startup must fail with a clear error if the sync system user is not seeded. |
| Jira issue is both type "Risk" and priority "Blocker" | FR-020 takes precedence. The issue is created as an ORBIT Risk, not an Issue. |

---

## 12. Out of Scope

The following are explicitly excluded from this initiative:

1. **ORBIT → Jira push** — Jira is read-only. No ORBIT action writes data to Jira.
2. **OAuth 2.0 authentication** — API token (Basic Auth) only in v1.
3. **Jira Server / Data Center** — Jira Cloud only.
4. **Confluence, sprints, time tracking, custom fields** — not mapped.
5. **Multi-Jira-instance support** — single Jira Cloud instance per ORBIT deployment.
6. **Bidirectional conflict resolution** — not applicable; Jira always wins.
7. **Jira permissions or user/role sync** — ORBIT roles remain manually managed.
8. **Configurable reconciliation interval** — hardcoded at 15 minutes; not a user setting.
9. **Budget, resource assignments, or RACI data from Jira** — Jira has no equivalent; these ORBIT fields must be populated manually post-import.
10. **Historical closed issues from before integration** — all statuses are imported (including Done), but there is no special historical backdating of ORBIT records.
11. **Selective project import** — all Jira projects are imported. Per-project import selection is not supported in v1.
12. **Rollback** — there is no automated rollback of the hard-delete. The retry mechanism re-imports; it does not restore pre-import data.

---

## 13. Dependencies

| Dependency | Owner | Risk |
|---|---|---|
| Active Jira Cloud instance with API access | ADRES / PMO admin | PMO admin must generate API token before setup can begin |
| ORBIT Railway deployment stable HTTPS URL | Engineering | Required for Jira webhook callbacks. Already confirmed in place. |
| Encryption key management | Engineering | AES-256 key for API token encryption must be present as an environment variable (`JIRA_ENCRYPTION_KEY`). Must be set before the connection settings screen is used. |
| Sync system user seeded in DB | Engineering | Must be present on startup before any sync can run (FR-028) |
| Existing `audit_trail` service (`logAudit`, `logAuditDiff`) | Engineering | Sync uses this existing service. No changes to the service itself required. |
| New DB migration | Engineering | Four new tables (`jira_connections`, `jira_sync_mappings`, `jira_sync_log`, `jira_status_mappings`) and three additive columns on `ventures`. Drizzle migration required. Must be reviewed for destructive patterns before deployment. |

---

## 14. Open Questions

None. All questions from the Program Brief have been answered by the PMO Lead and are incorporated above.

The following items from `context.md` are now resolved by this document:
- OAuth vs API token → **API token (Basic Auth), v1 only**
- Delete propagation policy → **Initial import: hard delete. Ongoing deletes: soft delete (archive).**
- Can two ventures map to same Jira project → **No. One Jira project maps to exactly one ORBIT venture. Enforced via unique index on `jira_sync_mappings (connection_id, jira_entity_type, jira_entity_id)`.**
- Import historical closed issues or active only → **All statuses imported, including Done (no filtering).**
- Sync all Jira comments or only tagged ones → **All comments on Epics are imported as progress updates (no tagging required).**

---

## Database Design (DB Agent)
**Date:** 2026-04-08

### New Tables

| Table | Purpose | Key Fields |
|-------|---------|-----------|
| `jira_connections` | Stores the Jira Cloud credential and webhook configuration for the connected instance | `instance_url`, `account_email`, `api_token_encrypted`, `webhook_secret`, `webhook_id`, `status`, `import_lock`, `last_validated_at`, `created_by` |
| `jira_sync_mappings` | Bidirectional mapping between ORBIT entity UUIDs and Jira entity IDs; used for idempotency and delta detection | `connection_id`, `jira_entity_type`, `jira_entity_id`, `orbit_entity_type`, `orbit_entity_id`, `sync_hash`, `synced_at` |
| `jira_sync_log` | Append-only operational event log covering webhook events, reconciliation cycles, and import runs | `connection_id`, `venture_id`, `event_type`, `jira_entity_type`, `jira_entity_id`, `level`, `message`, `payload` |
| `jira_status_mappings` | PMO-configurable map from Jira status name strings to ORBIT status strings | `connection_id`, `jira_status_name`, `orbit_status`, `updated_by` |

### Modified Tables

| Table | Change |
|-------|--------|
| `ventures` | Added `jira_connection_id uuid` (nullable FK → `jira_connections.id`), `jira_project_key varchar(50)` (nullable), `jira_sync_enabled boolean not null default true` |
| `workstreams` | Added `deleted_in_jira boolean not null default false` |
| `milestones` | Added `deleted_in_jira boolean not null default false` |
| `risks` | Added `deleted_in_jira boolean not null default false` |
| `issues` | Added `deleted_in_jira boolean not null default false` |

All changes are additive only. No existing column was modified, renamed, or dropped.

### Indexes Added

| Index | Table | Columns | Optimises |
|-------|-------|---------|-----------|
| `jira_connections_status_idx` | `jira_connections` | `(status)` | Connection status filter on reconciliation cycle and dashboard queries |
| `ventures_jira_connection_id_idx` | `ventures` | `(jira_connection_id)` | Lookup of all ventures for a given Jira connection; used by import and sync routines |
| `jira_sync_jira_entity_idx` | `jira_sync_mappings` | `(connection_id, jira_entity_type, jira_entity_id)` | Unique; enforces idempotency — prevents duplicate ORBIT entity creation per Jira entity |
| `jira_sync_orbit_entity_idx` | `jira_sync_mappings` | `(orbit_entity_type, orbit_entity_id)` | Reverse lookup: find the Jira entity ID for any ORBIT record (used by webhook processor) |
| `jira_sync_log_connection_id_idx` | `jira_sync_log` | `(connection_id)` | Filters all log entries for the active connection on the Sync Dashboard |
| `jira_sync_log_venture_id_idx` | `jira_sync_log` | `(venture_id)` | Venture Sync Detail Panel — fetches log entries scoped to one venture |
| `jira_sync_log_created_at_idx` | `jira_sync_log` | `(created_at)` | Time-range queries for recent sync activity and log pruning |
| `jira_sync_log_level_idx` | `jira_sync_log` | `(level)` | Error-only log filters on the Sync Dashboard |
| `jira_status_mappings_unique_idx` | `jira_status_mappings` | `(connection_id, jira_status_name)` | Unique; prevents duplicate mapping rows per Jira status name per connection |

### Relationships

| FK Column | References | Business Meaning |
|-----------|-----------|-----------------|
| `jira_connections.created_by` | `users.id` | Records which PMO admin set up the connection |
| `ventures.jira_connection_id` | `jira_connections.id` | Identifies a venture as Jira-managed; null = manually created |
| `jira_sync_mappings.connection_id` | `jira_connections.id` | Scopes mappings to a specific Jira instance |
| `jira_sync_log.connection_id` | `jira_connections.id` | Scopes log entries to a specific Jira instance |
| `jira_sync_log.venture_id` | `ventures.id` | Nullable; set when an event is attributable to a specific venture |
| `jira_status_mappings.connection_id` | `jira_connections.id` | Scopes status mappings to a specific Jira instance |
| `jira_status_mappings.updated_by` | `users.id` | Audit trail for which PMO admin last changed a status mapping |

### Data Patterns Applied

**Declaration order:** `jira_connections` is declared before `ventures` in `schema.ts` so that the FK reference `jiraConnectionId → jira_connections.id` resolves at module load time without a forward-reference issue.

**Audit fields:** `jira_connections` carries `created_by`, `created_at`, `updated_at`. `jira_status_mappings` carries `updated_by`, `updated_at`. `jira_sync_log` is insert-only (no `updated_at` by design — it is an immutable event record).

**Soft-delete pattern for Jira deletions:** `deleted_in_jira` boolean (default `false`) on `workstreams`, `milestones`, `risks`, and `issues`. When Jira deletes an entity, ORBIT sets this flag rather than hard-deleting, preserving historical data and audit trail continuity. The existing `audit_trail` records the change.

**Append-only log:** `jira_sync_log` is declared insert-only by convention. No application code may issue UPDATE or DELETE against this table.

**No new enums for Jira status values:** Jira status strings are plain `varchar` throughout (`jira_status_name`, `orbit_status`). This avoids schema churn as the PMO maps new Jira statuses. ORBIT application logic validates `orbit_status` values at the service layer.

**Sync system user sentinel:** `azureOid = 'sync-system-001'` is a non-guessable, non-Azure value. The auth middleware must continue to exclude non-Azure OIDs from interactive login. The user is upserted at seed time and is stable across restarts.

**`import_lock` flag:** `jira_connections.import_lock` (boolean, default `false`) is the concurrency guard for the hard-delete + import operation. The application sets it to `true` at import start and `false` on completion or failure. The second simultaneous import trigger reads this flag and rejects with an error.

### Migration Notes

Migration is executed by `drizzle-kit push --force` called from `server/db/startup.ts` on every deploy. All new columns on existing tables are nullable or carry a server-side default, so no data migration or backfill is required. No rows in any existing table are touched by this migration.

Deployment script audit result (HERALD Layer 5 requirement): the startup script contains only `drizzle-kit push --force`. No `DROP TABLE`, `DROP DATABASE`, `TRUNCATE`, `migrate reset`, or equivalent destructive DDL was found. This migration is safe to deploy without a pre-deploy backup gate.

### Seed / Fixture Data

**File:** `D:/PMO/server/db/seed.ts`

The sync system user upsert logic is added at the top of the `seed()` function, before any other inserts. It checks for an existing row with `azureOid = 'sync-system-001'` and only inserts if absent, making the seed idempotent. Fields seeded:

| Field | Value |
|-------|-------|
| `azure_oid` | `sync-system-001` |
| `email` | `sync@orbit.internal` |
| `name` | `Jira Sync` |
| `role` | `pmo` |

No seed data is inserted for `jira_connections`, `jira_sync_mappings`, `jira_sync_log`, or `jira_status_mappings` — these tables are populated at runtime by the integration setup flow and cannot be seeded with meaningful values without a live Jira instance.

---

## API Specification (Backend Agent)
**Date:** 2026-04-08

### Endpoints

#### POST /api/jira-webhook
- **Auth:** HMAC-SHA256 via X-Hub-Signature header (constant-time compare). No ORBIT user auth.
- **Body parser:** express.raw({ type: 'application/json' }) — no size limit
- **Rate limiter:** 500 req/min per IP (separate from global 200/min limiter)
- **Purpose:** Receives Jira webhook events. Validates HMAC, processes entity updates async, always responds 200.
- **Body:** Raw JSON from Jira: { webhookEvent, issue, comment?, changelog? }
- **Response:** { success: true } on valid signature
- **Errors:** 401 (missing/invalid HMAC), 400 (empty/malformed body), 503 (no active connection)
- **Critical:** MUST be registered before app.use(express.json({ limit: '50kb' })) in server/index.ts

#### tRPC: jira.getConnection
- **Auth:** Required | Role: pmo
- **Purpose:** Returns current Jira connection metadata. Never returns encrypted token or webhook secret.
- **Response:** { id, instanceUrl, accountEmail, status, lastValidatedAt, lastError, webhookId, importLock }
- **Errors:** 401, 403

#### tRPC: jira.testConnection
- **Auth:** Required | Role: pmo
- **Purpose:** Tests credentials without saving. Calls GET /rest/api/3/myself.
- **Body:** { instanceUrl, email, apiToken }
- **Response:** { success: boolean, accountName?: string, error?: string }
- **Errors:** 400, 401, 403

#### tRPC: jira.saveConnection
- **Auth:** Required | Role: pmo
- **Purpose:** Tests credentials, encrypts token (AES-256-GCM), registers webhook, saves connection.
- **Body:** { instanceUrl: string (*.atlassian.net), email, apiToken }
- **Response:** { connectionId: string }
- **Errors:** 400 (test fails or validation), 401, 403

#### tRPC: jira.disconnect
- **Auth:** Required | Role: pmo
- **Purpose:** Deregisters webhook from Jira, clears credentials, marks connection disconnected. Venture data preserved.
- **Response:** { success: boolean }
- **Errors:** 401, 403, 404 (no connection)

#### tRPC: jira.getImportPreview
- **Auth:** Required | Role: pmo
- **Purpose:** Read-only. Scans Jira and ORBIT to return entity counts for the preview screen. No side effects.
- **Response:** { toDelete: { ventures, workstreams, milestones, risks, issues, progressUpdates }, toCreate: { projects, epics, stories, riskIssues, blockerIssues } }
- **Errors:** 400, 401, 403, 404

#### tRPC: jira.triggerImport
- **Auth:** Required | Role: pmo
- **Purpose:** Starts async full import. Returns immediately with jobId for polling.
- **Response:** { jobId: string, status: "queued", estimatedSeconds: number }
- **Errors:** 401, 403, 404, 409 (import already in progress)

#### tRPC: jira.getImportStatus
- **Auth:** Required | Role: pmo
- **Purpose:** Polls import job progress.
- **Body:** { jobId: string }
- **Response:** { jobId, phase, processed, total, errors: string[], completedAt?, failed? }
- **Errors:** 401, 403, 404 (job not found)

#### tRPC: jira.retryImport
- **Auth:** Required | Role: pmo
- **Purpose:** Releases stale lock and triggers fresh full import. Used by Retry Import button.
- **Response:** { jobId: string, status: "queued", estimatedSeconds: number }
- **Errors:** 401, 403, 404

#### tRPC: jira.getSyncDashboard
- **Auth:** Required | Role: pmo
- **Purpose:** Per-venture sync health for dashboard (RAG, last sync, error count).
- **Response:** Array<{ ventureId, ventureName, jiraProjectKey, jiraSyncEnabled, lastSyncAt, errorCount, rag: "green"|"amber"|"red" }>
- **Errors:** 401, 403

#### tRPC: jira.getVentureSyncDetail
- **Auth:** Required | Role: pmo (any venture), pm (own venture only)
- **Purpose:** Detailed sync log and status for one venture.
- **Body:** { ventureId, page?, limit? }
- **Response:** { ventureId, jiraProjectKey, jiraSyncEnabled, lastSyncAt, syncLog: SyncLogEntry[], total, page, limit }
- **Errors:** 401, 403, 404

#### tRPC: jira.triggerVentureResync
- **Auth:** Required | Role: pmo
- **Purpose:** Immediate reconciliation for one Jira-linked venture.
- **Body:** { ventureId: string }
- **Response:** { started: boolean }
- **Errors:** 400 (not Jira-linked), 401, 403, 404

#### tRPC: jira.setSyncEnabled
- **Auth:** Required | Role: pmo (any), pm (own only)
- **Purpose:** Toggles jira_sync_enabled per venture.
- **Body:** { ventureId: string, enabled: boolean }
- **Response:** { ventureId, jiraSyncEnabled }
- **Errors:** 400 (not Jira-linked), 401, 403, 404

#### tRPC: jira.getStatusMappings
- **Auth:** Required | Role: pmo
- **Purpose:** Returns all Jira→ORBIT status mappings.
- **Response:** Array<{ id, connectionId, jiraStatusName, orbitStatus, updatedBy, updatedAt }>
- **Errors:** 401, 403

#### tRPC: jira.updateStatusMapping
- **Auth:** Required | Role: pmo
- **Purpose:** Upserts a Jira status→ORBIT status mapping. Applies from next reconciliation.
- **Body:** { jiraStatusName: string, orbitStatus: "not_started"|"in_progress"|"complete"|"on_hold" }
- **Response:** { updated: boolean }
- **Errors:** 400, 401, 403, 404

#### tRPC: jira.getProjects
- **Auth:** Required | Role: pmo
- **Purpose:** Lists all Jira projects on the connected instance.
- **Response:** Array<{ id, key, name, description }>
- **Errors:** 401, 403, 412 (no connected instance)

#### tRPC: jira.getLog
- **Auth:** Required | Role: pmo
- **Purpose:** Paginated sync log with optional level and venture filters.
- **Body:** { page?, limit?, level?: "info"|"warning"|"error", ventureId? }
- **Response:** { data: SyncLogEntry[], total, page, limit }
- **Errors:** 401, 403

---

### Scheduled Jobs

**Jira Reconciliation Job**
- Schedule: every 15 minutes (setInterval in server/services/jiraReconciliation.ts)
- Started: from app.listen() callback in server/index.ts via startReconciliationJob()
- Steps: auth ping → per-venture issue fetch (last 20 min window) → hash comparison → entity update/create/soft-delete → sync log entry
- Exports: startReconciliationJob(), stopReconciliationJob()

---

### Business Logic Notes

- Risk score always computed as likelihood x impact (defaults 3x3=9 for imported risks)
- RAG for imported risks defaults to amber (score 9 is in the 5-12 amber band)
- Venture completionPct stays 0 after import — existing dashboard query recalculates it
- Milestone status is a two-step translation: Jira status → workstream status → milestone enum
- Import lock is in-DB (jira_connections.import_lock) — released in finally block
- Sync hash is deterministic djb2 over key fields — zero DB writes for unchanged issues during reconciliation
- CRITICAL webhook order: registerJiraWebhookRoute(app) at line 48 of server/index.ts is BEFORE app.use(express.json({ limit: '50kb' })) at line 50
- Sync system user uses sentinel azureOid: 'sync-system-001' — never matches real Azure AD OID
- Echo loop prevention: webhook checks for orbit_sync_source property on Jira issue (safety net; ORBIT never writes to Jira)

---

### Unit Tests
- File: D:/PMO/server/services/__tests__/jira.test.ts
- Tests written: 67
- All passing: yes

Coverage: encryption round-trip, IV randomness, missing/short key errors, malformed/tampered ciphertext; status mapping defaults/overrides/fallbacks; milestone status translation all states; issue classification (Story/Task/Sub-task/Risk/orbit-risk label/Blocker/Bug/Epic); venture mapper name truncation; workstream mapper completionPct clamping; milestone mapper null duedate fallback; risk mapper defaults and Done->mitigated; issue mapper Done->resolved/In Progress->in_progress/other->open; progress update mapper ADF extraction/week label/null body/clamping; sync hash determinism and change detection; HMAC validation valid/tampered; instance URL pattern 4 valid/5 invalid; ADF edge cases; isoDateOnly null/undefined; import status unknown jobId.

---

## Frontend Implementation (Frontend Agent)
**Date:** 2026-04-08

### New Screens / Components

| File | What it renders |
|------|----------------|
| `client/src/pages/JiraSettingsPage.tsx` | Jira connection settings page (`/settings/jira`). Shows credential form (URL, email, API token), Test Connection button with inline success/error feedback, Save & Connect button (requires passing test first). When connected: shows connected state card with masked credentials, Disconnect button with confirmation inline, links to Import and Sync Dashboard. PMO-only role guard. |
| `client/src/pages/JiraImportPage.tsx` | Three-step import flow (`/settings/jira/import`). Step 1 Preview: entity counts to be deleted (red) and created (green), destructive warning banner, `CONFIRM` text confirmation gate, Confirm and Import button. Step 2 Progress: live progress bar polling `jira.getImportStatus` every 3 seconds, current phase text, item counts. Step 3 Complete: venture/workstream/milestone counts created, navigation links. Error step: specific error message, Retry Import button. PMO-only. |
| `client/src/pages/JiraSyncDashboard.tsx` | Sync dashboard (`/settings/jira/sync`). Global connection status card, three KPI cards (green/amber/red venture counts), filter buttons, table of all Jira-linked ventures with sync health dot, last-synced timestamp, error count, Re-sync per-row button. Click row expands inline sync log (last 50 entries). Wipe & Reimport All button with inline confirm gate. PMO-only. |
| `client/src/pages/JiraStatusMappingsPage.tsx` | Status mapping config (`/settings/jira/mappings`). Table of all discovered Jira status names with inline dropdown to select ORBIT status. Saves on each change. Shows "Default" badge for auto-detected defaults. PMO-only. |
| `client/src/components/JiraSyncPanel.tsx` | Role-aware sync panel for venture detail pages. GM sees last-synced timestamp only. PM sees health indicator, last-synced, error count. PMO sees all + sync toggle + "View sync log" link. Rendered above Plan content in ProjectPlan page. |
| `client/src/components/JiraManagedBanner.tsx` | Blue info banner shown inside venture edit forms when the venture is Jira-managed. Tells user fields are read-only, links to Jira project. Consumed by ProjectPlanPage. |
| `client/src/components/JiraSyncBadge.tsx` | Tiny inline sync health dot for venture cards/list rows. Green = synced <1 hour, amber = 1–6 hours, red = >6 hours or error. Tooltip shows last-synced label. Consumed by PMODashboard venture table. |

### New Hooks

| File | Data fetched |
|------|-------------|
| `client/src/hooks/useJira.ts` | Thin wrappers around `trpc.jira.*` queries. Exports: `useJiraConnection`, `useSyncDashboard`, `useVentureSyncDetail`, `useImportStatus` (polls every 3s while enabled). Also exports pure utility functions `minutesSince`, `syncHealthClass`, `syncHealthLabel` used across all Jira UI components. |

### Routes Added

| Route | Component | Role |
|-------|-----------|------|
| `/settings/jira` | `JiraSettingsPage` | PMO only |
| `/settings/jira/import` | `JiraImportPage` | PMO only |
| `/settings/jira/sync` | `JiraSyncDashboard` | PMO only |
| `/settings/jira/mappings` | `JiraStatusMappingsPage` | PMO only |

All four routes redirect non-PMO users via the existing `RoleRedirect` component.

### Reused Components

- `Button`, `Input`, `FormField`, `Select`, `Modal` — from `client/src/components/Modal.tsx`
- `StatusBadge`, `KpiCard`, `HealthDot` — from `client/src/components/StatusBadge.tsx`
- `useAuth` — from `client/src/lib/auth.js`
- `trpc` — from `client/src/lib/trpc.ts`
- `formatDate`, `formatDateTime` — from `client/src/lib/format.ts`

### Shell Navigation

Added `JiraNavSection` component inside `Shell.tsx` (PMO only). Appears after main nav items, before the Ventures list. Shows a collapsible "Jira Integration" section with four sub-items: Connection, Import, Sync Dashboard, Status Mappings. Auto-expands when any `/settings/jira/*` route is active.

### Export Implementation

N/A — no export requirement specified for Jira screens in the UI requirements or BA document.

### Venture-Level Integrations

- **ProjectPlanPage** (`client/src/pages/ProjectPlan.tsx`): Fetches `ventures.get` to read `jiraProjectKey` and `jiraConnectionId`. Shows `JiraSyncPanel` at the top (all roles, data varies by role). Shows `JiraManagedBanner` when venture is Jira-managed (PM/PMO). Disables "Add Workstream", workstream edit, and "Add Milestone" buttons when `isJiraManaged`.
- **PMODashboard** (`client/src/pages/PMODashboard.tsx`): Adds `JiraSyncBadge` inline in the venture name cell for any venture with `jiraProjectKey` set.

### Test Files

| File | Coverage |
|------|---------|
| `tests/jira/syncHealth.test.ts` | Unit tests for `minutesSince`, `syncHealthClass`, `syncHealthLabel`. 25 test cases covering null inputs, boundary conditions (59m/61m/359m boundaries), error flag override, label formatting (just now / Xm ago / Xh ago / Xd ago). |
| `tests/jira/jiraPages.test.ts` | Logic unit tests for: role guard authorization (PMO/PM/GM), import confirmation guard (`CONFIRM` exact match, case-sensitive, no trailing spaces), progress percentage formula (0/50/100/rounding), connection status derivation (connected/error/disconnected), Jira URL validation (4 valid, 6 invalid patterns), sync badge colour derivation (independent verification of health logic). 116 total tests across all test files, all passing. |

### Implementation Notes

1. **API response shape assumptions**: The `jira.getImportStatus` response assumes fields `phase`, `itemsProcessed`, `itemsTotal`, `currentPhase`, `venturesCreated`, `worksreamsCreated`, `milestonesCreated`, `errorMessage`. The `jira.getSyncDashboard` response assumes `{ ventures: VentureSyncRow[] }`. The `jira.getVentureSyncDetail` response assumes `{ logs, lastSyncedAt, lastAttemptAt, syncEnabled, hasError, errorCount }`. These align with the API spec in section 6 of this document. If the backend response shapes differ, update the type casts in `JiraSyncDashboard.tsx` and `JiraSyncPanel.tsx`.

2. **`jiraLastSyncedAt` and `jiraHasError` on PMO dashboard**: The `PMODashboard` reads `v.jiraProjectKey`, `v.jiraLastSyncedAt`, and `v.jiraHasError` from the venture objects returned by `trpc.dashboard.pmo`. These fields will need to be added to the pmo dashboard query response by the backend if not already present. Without them, the sync badge renders as red (no data).

3. **`instanceUrl` in JiraSyncPanel**: The panel receives `instanceUrl` as a prop to construct the Jira project URL. For now the `ProjectPlanPage` passes `null` since it doesn't fetch the connection separately. The panel degrades gracefully — the project key is shown as plain text rather than a link. To enable the link, pass `connection.instanceUrl` from a `useJiraConnection()` call.

4. **`toImport` field name in preview**: The `JiraImportPage` uses `preview.toImport.projects/epics/stories/risks/blockers`. The backend spec shows `toCreate: { projects, epics, stories, riskIssues, blockerIssues }`. If the backend uses `toCreate`, update the field names in `JiraImportPage.tsx` line references to `toDelete`/`toCreate`.

5. **No new npm packages**: Implementation uses only the existing React + tRPC + React Router stack. No additional dependencies.

6. **Accessibility**: All interactive elements have `aria-label` or `aria-describedby`. Role-based visibility is enforced both at the route level (redirect) and at the component level (conditional render). Status indicators use text labels alongside colour dots (not colour-only). Progress bar uses `role="progressbar"` with `aria-valuenow/min/max`.

---

## Phase 4 QA Fix Notes (Backend Agent)
**Date:** 2026-04-08

### Fixes Applied

All critical and high severity findings from the QA-Breaker report have been resolved. Medium severity findings in scope have also been fixed.

#### Fix 1 — Partial import failure marks job failed (`jiraImport.ts`)
After the per-project loop, if `job.errors.length > 0`, a `level: 'error'` sync log is written, `lastError` is updated on the connection, `job.failed = true` is set, and the job phase becomes `'Failed — partial import'`. The error is re-thrown so the outer catch releases the lock. A partial state is never reported as `'Complete'`.

#### Fix 2 — Atomic import lock prevents TOCTOU race (`jiraImport.ts`)
The two-step read-then-write lock pattern has been replaced with a single atomic `UPDATE jira_connections SET import_lock=true WHERE id=:id AND import_lock=false RETURNING id`. If 0 rows are returned, another import holds the lock and the caller throws immediately. The router-level pre-check is retained as a fast-path UX guard but is no longer the source of truth.

#### Fix 3 — Reconciliation blocked during active import (`jiraReconciliation.ts`)
At the top of `reconcileConnection`, after loading the connection, `conn.importLock` is checked. If true, a warning is logged and the function returns without processing.

#### Fix 4 — Empty webhook secret always rejects (`jiraWebhook.ts`)
`validateHmacSignature` now guards at entry: `if (!secret || secret.length === 0) return false`. This runs before any HMAC computation.

#### Fix 5 — Webhook secret stored encrypted (`jira.ts` + `jiraWebhook.ts`)
`saveConnection` generates the plaintext secret, passes it to Jira's `registerWebhook`, then encrypts it via `encryptToken` before storing in `webhookSecret` column. The webhook handler decrypts with `decryptToken` before HMAC validation; decryption failure returns 503.

#### Fix 6 — Webhook body limited to 2 MB (`jiraWebhook.ts`)
`express.raw({ type: 'application/json', limit: '2mb' })` is applied to the webhook route. Jira payloads are never legitimately larger.

#### Fix 7 — `getVentureSyncDetail` requires `pmo` or `pm` role (`jira.ts`)
`.use(requireRole('pmo', 'pm'))` middleware added. Manual GM check in body removed.

#### Fix 8 — `setSyncEnabled` requires `pmo` or `pm` role (`jira.ts`)
`.use(requireRole('pmo', 'pm'))` middleware added. Manual GM check in body removed.

#### Fix 9 — `isoDateOnly` validates output format (`jiraMappers.ts`)
Three-stage logic: (1) exact ISO date string pass-through, (2) slice first 10 chars if they match `/^\d{4}-\d{2}-\d{2}$/`, (3) fallback to `new Date(input).toISOString().slice(0,10)` with a regex re-check. Returns `null` on all failures. Non-ISO dates are logged as warnings.

#### Fix 10 — JQL project keys double-quoted (`jiraClient.ts` + `jiraReconciliation.ts`)
All JQL strings now use `project="${projectKey}"`. Applied in `getProjectIssues`, `getEpics` in `jiraClient.ts`, and the reconciliation JQL in `jiraReconciliation.ts`.

#### Fix 11 — Reconciliation fetches all pages (`jiraReconciliation.ts`)
The single-page `maxResults=100` fetch is replaced with a `while (recentIssues.length < fetchTotal)` pagination loop matching the pattern in `jiraClient.getProjectIssues`.

#### Fix 12 — `applyIssueUpdate` respects soft-deleted flag (`jiraReconciliation.ts`)
Every `UPDATE` in `applyIssueUpdate` now includes `AND deleted_in_jira=false` via Drizzle's `and(eq(entity.id, id), eq(entity.deletedInJira, false))`. Soft-deleted entities cannot be resurrected by late-arriving update events.

#### Fix 13 — Null summary returns `'(Untitled)'` (`jiraMappers.ts`)
`truncate` now accepts a third `fallback` parameter (default `''`). All entity name/title fields pass `'(Untitled)'` as the fallback.

#### Fix 14 — Description truncation uses correct max length (`jiraMappers.ts`)
`mapProjectToVenture` now calls `truncate(project.description, 2000)` instead of `truncate(project.description, undefined as any)`. The `text` DB column has no enforced max; 2000 chars is a safe practical ceiling.

#### Fix 15 — Never-synced ventures show amber RAG (`jira.ts getSyncDashboard`)
`lastSyncMs === 0` is detected before the minutes calculation. These ventures receive `rag: 'amber'` and `neverSynced: true` in the response. They are never treated as stale/red.

#### Fix 16 — `handleIssueUpdated` checks `jiraSyncEnabled` (`jiraWebhook.ts`)
Before calling `applyIssueUpdate`, the venture's `jiraSyncEnabled` field is fetched and checked. If `false`, the update is logged at `info` level and skipped.

#### Medium — Whitespace API token rejected (`jira.ts`)
`apiTokenSchema` now includes `.refine((s) => s.trim().length > 0)`.

### Test Results
- File: `server/services/__tests__/jira-breaker.test.ts`
- Tests updated to reflect fixed behaviour (bug-documenting assertions corrected)
- Tests passing: 91 / 91
