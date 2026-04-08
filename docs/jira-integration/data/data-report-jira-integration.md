# Data Architecture Report — Jira Cloud Integration (Jira → ORBIT)
**Date:** 2026-04-08
**Agent:** Data-Agent
**Verdict:** NEEDS CHANGES

---

## Data Model Assessment

The schema additions for the Jira integration are structurally sound as a first pass. The four new tables (`jira_connections`, `jira_sync_mappings`, `jira_sync_log`, `jira_status_mappings`) are additive, do not modify existing columns, and carry proper foreign keys to `users`, `ventures`, and each other. Financial fields use `numeric`, timestamps carry `withTimezone: true`, and the immutable log table is correctly insert-only in practice.

Two critical correctness issues were found: a hash collision risk that will cause missed updates to go silently undetected, and a `jira_sync_mappings` unique constraint that does not cover the `orbit_entity_id` direction, leaving the door open to two Jira issues mapping to the same ORBIT record. Both have direct PMO impact. Several advisory issues follow.

---

## Integrity Issues

### CRITICAL — Sync hash algorithm produces 32-bit collisions; changed Jira entities will not be updated

**Location:** `server/services/jiraMappers.ts` — `computeSyncHash()`

**Problem:** The function is named and documented as producing a "SHA-256-like hash" and the `sync_hash` column is `varchar(64)` (sized for a 64-character hex SHA-256 output). The actual implementation is a 32-bit djb2 integer cast to hex, producing an 8-character string. With 2^32 possible values, the birthday-problem collision probability across a typical import of hundreds of issues is non-trivial. More critically: the hash is used as the sole change-detection gate in reconciliation — if two distinct Jira issue states hash to the same 8-character value, the reconciliation job will see `mapping.syncHash === newHash`, skip the update, and the ORBIT entity will silently drift from Jira. The PMO will never know; no log entry is written.

**PMO Risk:** ORBIT data silently diverges from Jira. Risks, milestones, and workstream statuses shown on venture dashboards are stale. The PMO makes decisions on incorrect data with no indication anything is wrong.

**Fix:** Replace the djb2 implementation with the Node.js `crypto` module's `createHash('sha256')`, producing a 64-character hex output that actually fits the column. The function signature and callers do not change.

```typescript
// server/services/jiraMappers.ts — replace computeSyncHash()
import { createHash } from 'crypto';

export function computeSyncHash(issue: JiraIssue): string {
  const payload = JSON.stringify({
    summary: issue.fields.summary,
    status: issue.fields.status?.name,
    duedate: issue.fields.duedate,
    resolutiondate: issue.fields.resolutiondate,
    priority: issue.fields.priority?.name,
    labels: issue.fields.labels?.sort(),
    updated: issue.fields.updated,
  });
  return createHash('sha256').update(payload).digest('hex');
}
```

---

### CRITICAL — `jira_sync_mappings` has no unique constraint on `orbit_entity_id`; a Jira entity reclassification during re-sync can produce two mappings to the same ORBIT record

**Location:** `server/db/schema.ts` — `jiraSyncMappings` table

**Problem:** The unique index `jira_sync_jira_entity_idx` covers `(connection_id, jira_entity_type, jira_entity_id)`, which prevents one Jira entity from being mapped twice. It does not prevent a single ORBIT entity from being the target of two different Jira entities. This can happen when:
1. An issue is initially classified as a `risk` and a mapping row is written.
2. The issue is re-classified (e.g., the `orbit-risk` label is added to a second Jira issue) and a second mapping is written pointing to the same `orbitEntityId`.
3. Reconciliation now updates the ORBIT risk from two different sources, last-write-wins, with no conflict detected.

The `jira_sync_orbit_entity_idx` is a non-unique index, so the database does not prevent this.

**PMO Risk:** An ORBIT risk or milestone silently receives conflicting updates from two different Jira issues. The PMO sees status flicker on the venture dashboard with no error log entry.

**Fix:** Add a unique index on `(orbit_entity_type, orbit_entity_id)` to the `jira_sync_mappings` table.

```typescript
// server/db/schema.ts — add to jiraSyncMappings table() callback:
uniqueIndex('jira_sync_orbit_entity_unique_idx').on(
  table.orbitEntityType, table.orbitEntityId
),
```

---

### WARNING — `jiraConnections.status` is a free-text `varchar(50)`, not a DB enum; invalid status values can be written silently

**Location:** `server/db/schema.ts` — `jiraConnections` table, `status` column

**Problem:** The connection status cycles through `'connected'`, `'error'`, and `'disconnected'`. These are asserted only in application code. A bug, typo, or future developer writing an ad-hoc update could insert any string. The reconciliation job filters `where eq(jiraConnections.status, 'connected')` — a misspelled status means the connection is silently dropped from reconciliation with no error.

**Fix (advisory):** Convert to a pgEnum (`jiraConnectionStatusEnum`) matching the other enum patterns in the schema. This is a migration, not a destructive change.

---

### WARNING — `jira_sync_log.level` is a free-text `varchar(20)`, not a DB enum

**Location:** `server/db/schema.ts` — `jiraSyncLog` table, `level` column

**Problem:** Dashboard queries filter on `eq(jiraSyncLog.level, 'error')` and `eq(jiraSyncLog.level, 'info')`. If any code path writes a non-standard level string (e.g., `'warn'` instead of `'warning'`), those entries are invisible to dashboard queries. RAG calculations in `getSyncDashboard` would silently under-count errors.

**Fix (advisory):** Convert to a pgEnum (`syncLogLevelEnum`). Alternatively enforce this at the application boundary using a TypeScript union type — which already exists in `writeSyncLog` function signatures. The risk is low given consistent call sites, but worth formalising.

---

### WARNING — `hardDeleteAllVentureData()` omits `jiraSyncMappings` and `jiraSyncLog` for other connections

**Location:** `server/services/jiraImport.ts` — `hardDeleteAllVentureData()` and `clearSyncDataForConnection()`

**Problem:** `hardDeleteAllVentureData()` deletes all venture child data globally. Then `clearSyncDataForConnection()` deletes sync mappings and log only for the triggering connection ID. If a second Jira connection ever exists (even historically), its orphaned sync log entries pointing to now-deleted venture IDs remain. The `jira_sync_log.venture_id` FK is nullable so this does not cause a DB constraint violation, but those rows are ghost data — they will appear in log queries filtered by the old connection ID and confuse the PMO dashboard. The requirements (FR-009) state both tables "must be cleared and rebuilt" without connection scope restriction.

**Fix:** After `hardDeleteAllVentureData()`, also clear all rows from `jira_sync_mappings` and `jira_sync_log` unconditionally (not scoped to the connection), then re-populate for the current connection. This matches the stated "wipe then rebuild" intent.

---

### WARNING — `getSyncDashboard` RAG logic treats paused ventures identically to active ones; no distinction between "never synced" and "sync paused"

**Location:** `server/routers/jira.ts` — `getSyncDashboard`

**Problem:** The RAG calculation correctly distinguishes `neverSynced` (returned in the payload) but assigns `amber` to both never-synced ventures and paused ventures (`jiraSyncEnabled: false`). The PMO dashboard will show a paused venture as `amber` — the same colour as a venture with stale sync. A PMO admin has no way to distinguish "intentionally paused" from "stale by oversight" at a glance.

**Fix:** In the RAG logic, check `jiraSyncEnabled === false` first and return a distinct status (e.g., `'paused'`) or at minimum set `rag = 'amber'` with a distinct `syncPaused: true` flag in the returned object, so the UI can render a "Paused" badge instead of an amber sync indicator.

---

### WARNING — `jiraSyncLog` has no composite index on `(connection_id, venture_id, level)`, causing full scans on dashboard aggregation at scale

**Location:** `server/db/schema.ts` — `jiraSyncLog` table

**Problem:** `getSyncDashboard` issues two queries per venture: one for the last info-level log entry and one for the count of error-level entries. With individual indexes on `connection_id`, `venture_id`, `level`, and `created_at`, PostgreSQL can satisfy the sorted last-entry query efficiently. However, the error `COUNT` query (`WHERE connection_id = X AND venture_id = Y AND level = 'error'`) cannot use a single index covering all three predicates. As `jira_sync_log` grows (it is immutable and append-only), this query degrades. At 50 ventures × 96 reconciliation cycles/day × 365 days = 1.75M rows/year, the COUNT query becomes a full sequential scan of the filtered partition.

**Fix:** Add a composite index:
```typescript
index('jira_sync_log_conn_venture_level_idx').on(
  table.connectionId, table.ventureId, table.level
),
```

---

## KPI & Calculation Review

| KPI / Metric | Formula Correct | Edge Cases Handled | Notes |
|---|---|---|---|
| RAG — green | `minutesSinceSync <= 30` | Yes — threshold is clear | Correct per FR-029 |
| RAG — amber | `30 < minutesSinceSync <= 120` | Partially — `neverSynced` returns amber but is not distinct from paused | See WARNING above |
| RAG — red | `minutesSinceSync > 120` OR `errors > 0 AND minutesSinceSync > 120` | Bug: the `errors > 0` branch and the plain `> 120` branch both produce `red` — the `errors > 0` condition is redundant and does not make red fire earlier | Logic is correct in outcome but the first `if` branch is dead code — the second `else if (minutesSinceSync > 120)` already catches all `> 120` cases regardless of error count. Does not affect output but signals the intended "red earlier if errors exist" logic was not implemented |
| `errorCount` | COUNT of log rows at level `error` per venture | Counts all-time errors, not windowed | All-time error count will grow indefinitely. A venture with 1 error 6 months ago will always show `errorCount > 0`, keeping it amber forever even if sync is healthy. Consider a 24-hour or last-N-cycles window |
| `completionPct` on progress updates | Taken from `workstreamCompletionPct` at import time | Correct — documented in FR-022 | Value is a snapshot; will not update when workstream completion changes later |
| Risk score | `3 × 3 = 9`, default `amber` | Correct per FR-020 defaults | No calculation — all defaults. PMO must update manually |
| Week label | ISO week from UTC date | Correct UTC usage | djb2 hash bug (above) affects delta detection, not this calculation |
| `sync_hash` | Intended as SHA-256 64-char hex | CRITICAL: is 8-char djb2 hex — collision-prone | See CRITICAL issue above |

---

## Reporting Accuracy Assessment

**Historical reporting:** The `jira_sync_log` is insert-only and correctly timestamped with `withTimezone: true`. Point-in-time reconstruction of sync events is possible. However, ORBIT entity tables do not store a history of field values — only the current state. If a workstream status changes from `in_progress` to `complete` via reconciliation, the previous state is gone. This is consistent with the rest of the ORBIT schema (same pattern on `workstreams`, `milestones`, etc.) and is not a regression introduced by this integration.

**Period-based reporting:** No new time-series or snapshot tables are introduced. Sync health reporting is purely current-state. If the PMO needs to answer "what was the sync error rate last month?" the raw data exists in `jira_sync_log` but no aggregation surface is provided. This is acceptable for v1 but noted for future BI readiness.

**Double-counting risk:** Progress updates created from Jira comments (`mapCommentToProgressUpdate`) are attached to the venture, not to a specific workstream. Multiple epics per project each produce their own set of progress updates, all against the same `ventureId`. A query for `COUNT(progress_updates) WHERE venture_id = X` will count all comment-derived updates from all epics without double-counting (correct). However, the `completionPct` field on these updates is the workstream's completion at import time — there is no mechanism to keep it aligned as workstream completion changes. This is a data freshness gap, not a double-counting bug.

**Sync pause accuracy:** When `jiraSyncEnabled = false`, reconciliation correctly skips the venture. Any Jira changes during the paused period will not be reflected. When sync is re-enabled, the next reconciliation cycle uses a 20-minute window — meaning changes made during the pause period (which could be hours or days long) will never be fetched. There is no catch-up mechanism. This is a functional gap against FR-035 ("resume sync when re-enabled — next reconciliation cycle picks it up"), which implies full catch-up. At the data level, the schema supports a catch-up query (fetch all issues updated since `jiraSyncEnabled` was last set to false), but the reconciliation code uses a fixed 20-minute window unconditionally.

---

## Consistency Findings

1. **`status` column pattern:** All other entity tables use `pgEnum` for status fields. `jiraConnections.status` and `jiraSyncLog.level` use `varchar`. This breaks the codebase's established pattern and means these fields are not type-safe at the DB layer.

2. **Soft delete pattern:** `deletedInJira` is applied correctly to `workstreams`, `milestones`, `risks`, and `issues`. It is absent from `ventures` — which is correct since ventures are hard-deleted on reimport and there is no per-venture deletion event from Jira (projects are not individually deleted; reimport is the mechanism).

3. **`createdBy` / `updatedBy` audit fields:** The new Jira tables follow existing conventions correctly. `jiraConnections` has `createdBy`. `jiraStatusMappings` has `updatedBy`. `jiraSyncLog` has neither (correct — it is a system log, not a user-authored record). `jiraSyncMappings` has neither (acceptable — it is a system-managed index table).

4. **`import_lock` column:** Named `importLock` (camelCase in ORM, `import_lock` in DB). This matches the established naming convention for boolean flags (`budgetLocked`, `ragOverride`, etc.). Consistent.

5. **FK cascade behaviour:** None of the new Jira tables define `onDelete` behaviour. If a `jira_connections` row is deleted, all `jira_sync_mappings`, `jira_sync_log`, and `jira_status_mappings` rows referencing it become orphans — PostgreSQL will reject the delete with a FK violation. The `disconnect` mutation does not delete the `jira_connections` row (it sets `status = 'disconnected'` and clears credentials), so this is not currently reachable. If a hard-delete path is ever added, this will need cascade rules.

---

## Scalability Notes

**`jira_sync_log` growth:** This table is immutable and append-only with no archival mechanism. At 15-minute reconciliation intervals, each active venture generates at minimum 2 log rows per cycle (start + completion message), plus one row per reconciled entity. At 20 ventures × (2 base + 10 entity rows) × 96 cycles/day = ~23,000 rows/day. At 1 year: ~8.4M rows. The `created_at` index supports time-range queries. Without partitioning or archival, table scans for dashboard aggregations will degrade past ~10M rows. Recommend a log retention policy at 90 days with a scheduled purge, or PostgreSQL table partitioning by month on `created_at`.

**`getSyncDashboard` N+1 pattern:** For each venture, two separate queries are issued (last success + error count). With 50 ventures this is 100 queries per dashboard load. This will become a UI latency issue as venture count grows. A single aggregated query with `GROUP BY venture_id` would reduce this to 1–2 queries total.

**`jira_sync_mappings` reverse lookup:** The non-unique index on `(orbit_entity_type, orbit_entity_id)` supports webhook lookups where the ORBIT entity is known. Once the unique constraint recommended above is added, this index effectively becomes unique and query performance is optimal.

**Missing partial index:** The requirements specify a partial index `WHERE jira_connection_id IS NOT NULL` on `ventures(jira_connection_id)`. The schema implements a full index instead. For a system with relatively few Jira-managed ventures versus total ventures, the partial index is more efficient. Low priority — switch to partial index on next migration pass.

---

## PMO Analytics Opportunities

**Current capabilities this data enables:**
- Per-venture sync health (RAG) in near-real-time
- Full audit trail of every entity created or updated by Jira sync
- Historical sync log queryable by level, venture, time range
- Idempotent re-runs via sync hash comparison

**Gaps for future BI integration:**
- No snapshot table for sync health over time — a BI tool cannot show "sync error rate trend over 30 days" without scanning the full log
- No aggregation of `jira_sync_log` by `event_type` — hard to answer "how many issues were reconciled last week" without a summary table
- `jiraSyncLog.payload` is `jsonb` — Tableau and Power BI can query this but it requires custom SQL; a materialized summary view would improve ergonomics
- `computeSyncHash` (once fixed) enables change frequency analysis per entity — "which workstreams change most often in Jira" — but no surface exists for this yet

**Recommended summary view (low cost, high value):**
```sql
CREATE MATERIALIZED VIEW jira_sync_health_daily AS
SELECT
  connection_id,
  venture_id,
  date_trunc('day', created_at) AS day,
  level,
  COUNT(*) AS event_count
FROM jira_sync_log
GROUP BY 1, 2, 3, 4;
```
Refresh nightly. Enables dashboard trend charts without scanning the full log table.

---

## Recommended Additions

| Priority | Item | Rationale |
|---|---|---|
| Critical | Replace djb2 hash with `crypto.createHash('sha256')` in `computeSyncHash()` | Collision-prone hash will cause missed updates |
| Critical | Add `uniqueIndex` on `(orbit_entity_type, orbit_entity_id)` in `jira_sync_mappings` | Prevents two Jira issues mapping to same ORBIT entity |
| Advisory | Convert `jiraConnections.status` to pgEnum | Type safety, pattern consistency |
| Advisory | Convert `jiraSyncLog.level` to pgEnum | Type safety, dashboard query correctness |
| Advisory | Add composite index `(connection_id, venture_id, level)` on `jira_sync_log` | Dashboard COUNT query performance at scale |
| Advisory | Add `syncPaused: boolean` field to `getSyncDashboard` response | PMO needs to distinguish paused from stale |
| Advisory | Window the `errorCount` query to last 24 hours or last N cycles | All-time count will permanently flag resolved issues |
| Advisory | Add sync catch-up logic when re-enabling a paused venture | FR-035 implies full catch-up; current 20-minute window misses pause period |
| Advisory | Define log retention policy (90-day purge or partition by month) | Prevents `jira_sync_log` from degrading at scale |

---

## Verdict Justification

Two critical issues are present:

1. The sync hash collision risk is a silent correctness failure. It will not cause errors or crashes — it will cause the reconciliation job to silently skip changed entities, producing stale PMO data with no alert. The column is sized for SHA-256 but the implementation is a 32-bit integer hash. This is a direct contradiction between the stated design and the code.

2. The missing unique constraint on `(orbit_entity_type, orbit_entity_id)` in `jira_sync_mappings` allows two Jira entities to silently compete to update the same ORBIT record. The existing non-unique index provides no protection.

Both fixes are isolated, low-risk code changes. DB-Agent must apply them before the integration goes to production.
