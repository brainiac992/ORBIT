# QA Report — Risk Module Overhaul + RACI Matrix — Adversarial
**Date:** 2026-03-27
**QA Round:** 1
**Agent:** QA-Breaker
**Verdict:** FAIL

---

## Critical Vulnerabilities Found

### CRITICAL-01: RACI bulkUpdate race condition — delete-then-insert without transaction
- **Severity:** CRITICAL
- **Location:** `server/routers/raci.ts:205-226` (`bulkUpdate` mutation)
- **Attack vector:** Two users call `bulkUpdate` on the same workstream simultaneously. User A's DELETE completes, then User B's DELETE completes (deleting User A's just-inserted rows), then both INSERTs run — resulting in only User B's assignments surviving, or duplicate constraint violations.
- **Problem:** The delete-all + insert-all pattern has no database transaction wrapping it. The Drizzle `ctx.db` calls are individual statements, not wrapped in `ctx.db.transaction()`. Between the DELETE and INSERT, a concurrent read will see zero assignments.
- **Expected:** Wrap DELETE + INSERT in an explicit database transaction with serializable or at least read-committed isolation.
- **Fix:** Wrap lines 205-226 in `await ctx.db.transaction(async (tx) => { ... })` using `tx` instead of `ctx.db`.

### CRITICAL-02: RACI Accountable check race condition — assign endpoint
- **Severity:** CRITICAL
- **Location:** `server/routers/raci.ts:116-128` (`assign` mutation)
- **Attack vector:** Two users simultaneously assign "accountable" to the same workstream. Both pass the `existing.length > 0` check before either INSERT completes. Both INSERTs succeed because the unique index is on `(workstream_id, resource_id, raci_role)` — if the two resources differ, the unique constraint does NOT prevent two Accountables.
- **Problem:** The business rule "at most 1 Accountable per workstream" is enforced with a SELECT-then-INSERT pattern without a transaction or database-level constraint. The unique index only prevents the same resource+role on the same workstream, not multiple different resources with the "accountable" role.
- **Expected:** Either a partial unique index `CREATE UNIQUE INDEX ON workstream_raci_assignments(workstream_id) WHERE raci_role = 'accountable'` or a serializable transaction around the check+insert.
- **Fix:** Add a partial unique index in the migration: `CREATE UNIQUE INDEX raci_one_accountable_per_ws ON workstream_raci_assignments(workstream_id) WHERE raci_role = 'accountable';` and catch the constraint violation in the application code.

### CRITICAL-03: updateRisk spreads raw `updates` object into SET clause — writes unexpected columns
- **Severity:** CRITICAL
- **Location:** `server/routers/risks.ts:148-154` (`updateRisk` mutation)
- **Attack vector:** The Zod schema for `updateRisk` accepts `ragOverride: z.boolean().optional()`. But then on line 148, `setValues` is built as `{ ...updates, riskScore, rag, ragOverride, updatedAt }`. The `updates` object includes the raw validated input. If `updates.rag` is set (which it is when the user sends a RAG override), the spread includes both `updates.rag` AND the recalculated `rag`. Since the recalculated `rag` comes after `...updates`, it correctly overwrites. However, the `riskScore` from `updates` is NOT in the Zod schema so this is safe — but `updates.likelihood` and `updates.impact` ARE spread into `setValues` separately from the recalculated score. This means `riskScore` could become stale: if a user sends only `likelihood` without `impact`, the spread sets `likelihood` to the new value, and `riskScore` is recalculated correctly. This is actually handled. **However**, the real issue is: `updates` may contain `undefined` values for optional fields, and spreading `undefined` values into a Drizzle SET clause can produce unexpected behavior depending on the Drizzle version — some versions skip undefined, others set NULL.
- **Problem:** Spreading the entire `updates` object (which contains all Zod-parsed fields, some as `undefined`) into the SET clause is fragile. An `undefined` value for a field like `status` could overwrite the existing status with NULL in some Drizzle versions.
- **Expected:** Only include fields that were explicitly provided (not undefined) in the SET clause.
- **Fix:** Filter out undefined values before spreading: `const cleanUpdates = Object.fromEntries(Object.entries(updates).filter(([_, v]) => v !== undefined));` then use `cleanUpdates` instead of `updates`.

---

## High Severity Issues

### HIGH-01: Database schema has no CHECK constraints on risks.likelihood / risks.impact in Drizzle ORM layer
- **Severity:** HIGH
- **Location:** `server/db/schema.ts:247-248` (risks table definition)
- **Attack vector:** The Zod validation on `createRisk` and `updateRisk` properly constrains `likelihood` and `impact` to `z.number().int().min(1).max(5)`. The SQL migration adds CHECK constraints (lines 76-79). However, the Drizzle schema definition itself has no `.check()` or equivalent — meaning any code that bypasses the tRPC router (e.g., direct DB access from a service, a future migration script, or a seed script) can insert out-of-range values.
- **Problem:** Defense in depth is incomplete. The migration adds CHECKs at the DB level, which is correct. But if `drizzle-kit push` or `drizzle-kit generate` is ever used to sync schema, those CHECK constraints will not be regenerated because they are not declared in the Drizzle schema.
- **Expected:** Either document that CHECK constraints are migration-only and must not be overwritten by `drizzle-kit push`, or add Drizzle-level checks if supported.
- **Fix:** Add a comment to `schema.ts` near the risks table: `// CHECK constraints (chk_likelihood, chk_impact, chk_risk_score, chk_weight) are maintained in migration SQL — do not use drizzle-kit push without verifying they are preserved.`

### HIGH-02: Migration — owner text match to resource is deferred to application level but never implemented
- **Severity:** HIGH
- **Location:** `server/db/migrations/risk-module-migration.sql:60-62` (STEP 5)
- **Attack vector:** The migration preserves `legacy_owner_text` from the old `owner` column but explicitly states "FK matching against resources is done at application level." No application code exists that performs this matching — the `owner_resource_id` column is left NULL for all migrated rows.
- **Problem:** After migration, every existing risk shows "Owner: Unassigned" on the frontend, even if the old `owner` text matched a known resource name. This is a data regression visible to all users.
- **Expected:** Either the migration should attempt a best-effort JOIN to match `legacy_owner_text` against `resources.name`, or a post-migration script should be provided.
- **Fix:** Add to the migration (after STEP 5): `UPDATE risks SET owner_resource_id = r.id FROM resources r WHERE LOWER(risks.legacy_owner_text) = LOWER(r.name);`

### HIGH-03: RiskFormModal state initialization uses render-time setState — violates React rules
- **Severity:** HIGH
- **Location:** `client/src/pages/RisksPage.tsx:462-480`
- **Attack vector:** The `RiskFormModal` component calls `setForm()` and `setLastEditId()` directly during render (not inside a `useEffect`). While React may batch these in concurrent mode, this pattern can cause extra re-renders and is a known anti-pattern that triggers warnings in React strict mode.
- **Problem:** Calling `setState` during render is technically allowed for derived state patterns (React docs call this "adjusting state during rendering"), but this specific pattern with two setState calls on different state variables during render risks infinite render loops if the condition is not perfectly stable. If `editRisk` is a new object reference on each render (common with tRPC query results), `editRisk.id !== lastEditId` may remain truthy across renders.
- **Expected:** Use `useEffect` with `editRisk` as dependency, or use a `key` prop on the modal to reset state.
- **Fix:** Replace the render-time state adjustment with: `useEffect(() => { if (open && editRisk) { setForm({...}); } }, [open, editRisk?.id]);`

### HIGH-04: BlockerCard invalidation is too broad — missing ventureId parameter
- **Severity:** HIGH
- **Location:** `client/src/pages/RisksPage.tsx:653`
- **Attack vector:** `utils.risks.listBlockers.invalidate()` is called without a `ventureId` parameter. This invalidates the blocker list for ALL ventures in the query cache, not just the current one. On a PMO dashboard where multiple ventures are loaded, this triggers unnecessary refetches.
- **Problem:** Stale data will not be an issue (it over-invalidates), but it causes unnecessary network requests and potential UI flicker on other cached venture data.
- **Expected:** `utils.risks.listBlockers.invalidate({ ventureId })` — but `ventureId` is not passed as a prop to `BlockerCard`.
- **Fix:** Add `ventureId` prop to `BlockerCard` and use it in the invalidation call.

### HIGH-05: RACI page does not show `removeMut.error` — silent failures on remove
- **Severity:** HIGH
- **Location:** `client/src/pages/RaciPage.tsx:233-237`
- **Attack vector:** The page only displays `assignMut.error`. If `removeMut` fails (e.g., network error, permission error), no error message is shown to the user. The remove appears to do nothing.
- **Problem:** User clicks "x" to remove a RACI assignment, the mutation fails silently. No feedback is given.
- **Expected:** Display errors from both `assignMut` and `removeMut`.
- **Fix:** Add `{removeMut.error && <div className="mt-4 ...">Remove failed: {removeMut.error.message}</div>}` alongside the existing error display.

### HIGH-06: updateRisk — sending rag as first valid RAG value can be confused with falsy check
- **Severity:** HIGH
- **Location:** `server/routers/risks.ts:134`
- **Attack vector:** Line 134: `if (updates.rag)` — this is a truthiness check. If a user explicitly sets `rag: ''` (empty string) or some falsy value, this branch is skipped. More critically, the Zod schema allows `rag: z.enum(RAG_RATING).optional()` — meaning `rag` can be any of `['green', 'amber', 'red']` or `undefined`. But the truthiness check does not distinguish between "user did not send rag" (`undefined`) and "user sent a valid value." Since all three valid values are truthy strings, this works correctly in practice. **However**, this pattern is fragile — if `ragOverride` is sent as `true` without a `rag` value, the ragOverride is set to true but rag remains the old value, creating an inconsistent state where `ragOverride = true` but the RAG was auto-derived.
- **Problem:** A client can send `{ id: "...", ragOverride: true }` without a `rag` field. The code on line 134 skips the `if (updates.rag)` branch, and line 138 also skips because `updates.ragOverride !== false`. The result: `ragOverride` is set to `true` in the database via the spread, but `rag` retains whatever auto-derived value it had.
- **Expected:** If `ragOverride` is being set to `true`, a `rag` value should be required.
- **Fix:** Add validation: `if (updates.ragOverride === true && !updates.rag) throw new TRPCError({ code: 'BAD_REQUEST', message: 'RAG value required when enabling override' });`

---

## Medium Severity Issues

### MEDIUM-01: Heatmap empty state renders a bare 5x5 grid with no explanatory text
- **Severity:** MEDIUM
- **Location:** `client/src/pages/RisksPage.tsx:188-239`
- **Attack vector:** When a venture has zero risks, the heatmap renders a 5x5 grid of transparent cells with no counts. There is no "No risks to display" message inside the heatmap container.
- **Problem:** Users see an empty colored grid with no explanation. The KPI section shows "Total Open: 0" but the heatmap area looks broken.
- **Expected:** Show an overlay or message like "No open risks to display on heatmap" when `heatmapData` is empty.
- **Fix:** Add a conditional check: if `heatmapData?.length === 0`, render an empty-state message inside the heatmap container.

### MEDIUM-02: Summary `weightedExposure` displayed via `getScoreBand()` — but exposure is a weighted average, not a score
- **Severity:** MEDIUM
- **Location:** `client/src/pages/RisksPage.tsx:156`
- **Attack vector:** `getScoreBand(Math.round(summary.weightedExposure))` — the weighted exposure is a weighted average of risk scores (1-25 range). Passing this to `getScoreBand()` is semantically correct for coloring purposes, but `Math.round()` means an exposure of 4.5 becomes 5 (yellow band) while 4.4 becomes 4 (green band). This discontinuity at exactly 4.5 may mislead stakeholders.
- **Problem:** Rounding before band classification creates a cliff edge. A venture with exposure 4.49 shows green; 4.50 shows yellow. The difference in underlying risk is negligible.
- **Expected:** Either use `Math.floor()` for a conservative approach, or display the numeric value without band coloring, or use fractional band boundaries.
- **Fix:** Use `getScoreBand(Math.ceil(summary.weightedExposure))` for a conservative approach (round up = worse band), or leave unrounded and adjust `getScoreBand` to accept floats.

### MEDIUM-03: Migration maps low=1, medium=3, high=5 — skipping 2 and 4 entirely
- **Severity:** MEDIUM
- **Location:** `server/db/migrations/risk-module-migration.sql:31-35, 45-49`
- **Attack vector:** All migrated risks have likelihood and impact values of only 1, 3, or 5. The new UI allows 1-5. This means the heatmap after migration will have gaps — cells at 2 and 4 will have zero risks. Score calculations jump from 1 to 3 to 5, missing the finer granularity the new system supports.
- **Problem:** Not a bug per se, but the uneven distribution may confuse users who see the heatmap for the first time with risks clustered at only 3 of the 5 rows/columns. The risk scores jump: 1, 3, 5, 9, 15, 25 instead of the full 1-25 range.
- **Expected:** Document this mapping choice and optionally provide a "review migrated risks" workflow or notification.
- **Fix:** Cosmetic/documentation. Consider mapping: low=2, medium=3, high=4 for more centered distribution, or accept the current mapping and document it.

### MEDIUM-04: RACI page shows workstreams but no error state for failed queries
- **Severity:** MEDIUM
- **Location:** `client/src/pages/RaciPage.tsx:49-51`
- **Attack vector:** If `trpc.raci.listForVenture.useQuery` or `trpc.workstreams.list.useQuery` returns an error (e.g., network failure, 500), the page shows loading spinner forever (if `isLoading` remains true) or renders with undefined data.
- **Problem:** No error handling for query failures. The page either hangs on "Loading RACI matrix..." or renders with empty data, making it indistinguishable from "no data exists."
- **Expected:** Check `isError` from the query hooks and display an error message.
- **Fix:** Add error states: `const { data: assignments, isLoading, isError, error } = ...` and render an error banner when `isError` is true.

### MEDIUM-05: RisksPage does not handle query errors — blank page on API failure
- **Severity:** MEDIUM
- **Location:** `client/src/pages/RisksPage.tsx:91-96`
- **Attack vector:** Six queries are fired on mount. If any fail, the page either shows "Loading risks..." forever or renders with `undefined` data that is coerced to empty arrays via `?? []`.
- **Problem:** API errors are silently swallowed. Users see an empty risks page with no indication that data failed to load.
- **Expected:** Surface errors from at least the primary queries (`listRisks`, `riskSummary`).
- **Fix:** Destructure `isError` and `error` from the query hooks and display an error banner.

### MEDIUM-06: Risk form does not reset on close without save
- **Severity:** MEDIUM
- **Location:** `client/src/pages/RisksPage.tsx:462-480`
- **Attack vector:** User opens risk form, fills in data, closes without saving, then opens a new risk form. The `lastEditId` logic only resets when transitioning from edit to create. But if the user was in create mode, modified the form, closed, then reopened — the form still shows the previously entered (unsaved) data because the state persists.
- **Problem:** Stale form data appears when re-opening the create form after abandoning unsaved changes.
- **Expected:** Reset form state when the modal closes.
- **Fix:** Add `useEffect(() => { if (!open) { setForm({...defaults}); setLastEditId(null); } }, [open]);`

### MEDIUM-07: `createBlocker` uses `null as any` for `progressUpdateId` — type safety hole
- **Severity:** MEDIUM
- **Location:** `server/routers/risks.ts:352`
- **Attack vector:** `progressUpdateId: null as any` — this bypasses TypeScript's type checking. If the schema ever changes `progressUpdateId` to NOT NULL, this will fail at runtime with a database constraint error rather than being caught at compile time.
- **Problem:** Type safety is deliberately circumvented. The schema correctly allows NULL for `progressUpdateId`, but the `as any` cast hides this from TypeScript.
- **Expected:** The Drizzle schema already has `progressUpdateId` as nullable (no `.notNull()`). The insert should work with just `progressUpdateId: null` without the `as any` cast.
- **Fix:** Remove `as any`: `progressUpdateId: null`.

### MEDIUM-08: RACI `listVentureResources` only returns active resources — stale RACI assignments show "Unknown"
- **Severity:** MEDIUM
- **Location:** `server/routers/raci.ts:254-258`
- **Attack vector:** A resource is deactivated (`active: false`) after being assigned a RACI role. The `listVentureResources` query filters `eq(resources.active, true)`, so the resource dropdown will not show the deactivated resource. However, `listForVenture` on line 72-75 does NOT filter by active status — it resolves all resource names. The result: the RACI matrix correctly shows the deactivated resource's name, but the `resourceActive: false` flag is only used for a warning icon. The dropdown for new assignments correctly excludes inactive resources.
- **Problem:** The behavior is actually correct — inactive resources are shown in existing assignments with a warning but cannot be newly assigned. However, `listForWorkstream` (line 36-38) does not check `resourceActive` and does not return this flag — so a per-workstream view would not show the warning.
- **Expected:** `listForWorkstream` should also return `resourceActive` status.
- **Fix:** Add `active` to the resource select in `listForWorkstream` and return it.

---

## Low Severity Issues

### LOW-01: Duplicated `getScoreBand` function across three files
- **Severity:** LOW
- **Location:** `server/routers/risks.ts:19-25`, `server/routers/dashboard.ts:11-17`, `shared/enums.ts:51-57`
- **Problem:** The same function is defined three times. The `shared/enums.ts` version is the canonical one, but the server routers define their own copies. If score band thresholds ever change, all three must be updated in sync.
- **Fix:** Import from `shared/enums.ts` in both server routers.

### LOW-02: RACI page legend uses hardcoded role list instead of importing from enums
- **Severity:** LOW
- **Location:** `client/src/pages/RaciPage.tsx:97`
- **Problem:** `const roles = ['responsible', 'accountable', 'consulted', 'informed']` is hardcoded. If `RACI_ROLE` in `shared/enums.ts` ever changes, this array must be updated manually.
- **Fix:** Import `RACI_ROLE` from `shared/enums.ts`.

### LOW-03: `assertVentureReadAccess` duplicated between risks.ts and raci.ts
- **Severity:** LOW
- **Location:** `server/routers/risks.ts:10-17`, `server/routers/raci.ts:11-18`
- **Problem:** Identical function defined in two files. If access control logic changes, both must be updated.
- **Fix:** Extract to a shared utility like `server/services/access.ts`.

### LOW-04: Issue `owner` field is free-text string, not a resource FK
- **Severity:** LOW
- **Location:** `server/routers/risks.ts:254`, `server/db/schema.ts:280`
- **Problem:** Risks use `ownerResourceId` (FK to resources table), but Issues still use a free-text `owner` field. This inconsistency means issue owners cannot be resolved to resource records and will not benefit from resource deactivation tracking.
- **Fix:** Future enhancement — add `ownerResourceId` to issues table to match the risks pattern.

---

## Attack Results Summary

### Data Integrity Attacks
| Attack | Target | Result | Severity |
|--------|--------|--------|----------|
| Division by zero on weighted exposure with no risks | `riskSummary` endpoint | Handled — `sumWeight > 0` check on line 227 | N/A |
| Null ownerResourceId handling | `listRisks` endpoint | Handled — null check on line 47 with `?? null` | N/A |
| Race condition on RACI bulkUpdate | `raci.bulkUpdate` | Vulnerable — no transaction | CRITICAL |
| Race condition on Accountable uniqueness | `raci.assign` | Vulnerable — SELECT-then-INSERT without constraint | CRITICAL |
| Stale `riskScore` after partial update | `updateRisk` | Handled — recalculated on lines 120-128 | N/A |
| Two Accountable via concurrent assign | `raci.assign` | Vulnerable — no DB-level constraint | CRITICAL |

### Calculation Edge Cases
| Attack | Target | Result | Severity |
|--------|--------|--------|----------|
| Weighted exposure rounding cliff at band boundary | Frontend `exposureBand` | Vulnerable — Math.round creates discontinuity | MEDIUM |
| Migration value mapping gaps (2, 4 skipped) | Migration SQL | Cosmetic — works but creates sparse heatmap | MEDIUM |
| Score band for score=0 (impossible but testable) | `getScoreBand()` | Returns 'green' — score 0 is below min but handled | N/A |

### Input Attacks
| Attack | Target | Result | Severity |
|--------|--------|--------|----------|
| likelihood=0 or likelihood=6 via API | `createRisk` Zod schema | Handled — `z.number().int().min(1).max(5)` rejects | N/A |
| impact=0 or impact=6 via API | `createRisk` Zod schema | Handled — same validation | N/A |
| weight=0 or weight=6 via API | `createRisk` Zod schema | Handled — `z.number().int().min(1).max(5)` rejects | N/A |
| Empty title | `createRisk` Zod schema | Handled — `z.string().min(1)` rejects | N/A |
| SQL injection via string fields | Drizzle ORM | Handled — parameterized queries | N/A |
| Float values for likelihood | `createRisk` Zod schema | Handled — `z.number().int()` rejects | N/A |
| `ragOverride: true` without `rag` value | `updateRisk` | Vulnerable — inconsistent state | HIGH |
| Extremely long description | `createRisk` | Handled — `text` column has no DB limit, Zod has no max on description (acceptable for text fields) | N/A |

### Auth Attacks
| Attack | Target | Result | Severity |
|--------|--------|--------|----------|
| GM creating risks | `createRisk` | Handled — role check on line 66 | N/A |
| GM modifying RACI | `raci.assign` | Handled — role check on line 113 | N/A |
| PM accessing another PM's venture | `assertVentureReadAccess` | Handled — checks `pmUserId` | N/A |
| Cross-venture RACI access | `raci.listForWorkstream` | Handled — resolves workstream to venture, checks access | N/A |

### Frontend Resilience
| Attack | Target | Result | Severity |
|--------|--------|--------|----------|
| API failure on RisksPage | Multiple queries | Vulnerable — no error state displayed | MEDIUM |
| API failure on RaciPage | Multiple queries | Vulnerable — no error state displayed | MEDIUM |
| Remove RACI assignment failure | `removeMut` error | Vulnerable — error not displayed | HIGH |
| Stale form data after abandon | RiskFormModal | Vulnerable — form not reset on close | MEDIUM |

---

## Automated Tests Written
- File: N/A (read-only audit — no tests written per instructions)
- Test count: 0
- Vulnerabilities captured as tests: 0

---

## Verdict Justification

**FAIL** — 3 CRITICAL findings, 6 HIGH findings, 8 MEDIUM findings, 4 LOW findings.

The two most dangerous issues are:
1. **RACI Accountable uniqueness has no database-level enforcement** (CRITICAL-02) — the business rule "one Accountable per workstream" can be violated under concurrent access because the unique index is on `(workstream_id, resource_id, raci_role)` not on `(workstream_id) WHERE raci_role = 'accountable'`.
2. **RACI bulkUpdate is not transactional** (CRITICAL-01) — the delete-all-then-insert-all pattern without a transaction can result in data loss under concurrent access.
3. **updateRisk spreads raw updates into SET clause** (CRITICAL-03) — while Drizzle likely skips undefined values, this pattern is fragile and depends on ORM implementation details.

All CRITICAL and HIGH issues should be addressed before production deployment.
