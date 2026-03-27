# Security Audit — Risk Module Overhaul + RACI Matrix
**Date:** 2026-03-27
**Round:** 1
**Agent:** Security-Agent
**Verdict:** FAIL

---

## Critical Vulnerabilities

### CRITICAL-1: Production JWT verification not implemented — all auth bypassed in production
- **Type:** Authentication bypass
- **Location:** `server/context.ts:33-36`
- **Attack vector:** In production (`NODE_ENV=production` and `DEV_AUTH` not set), the JWT verification block is a TODO comment. The `azureOid` variable is never set from the token, so `user` remains `null`. This means either (a) no one can authenticate in production (denial of service), or (b) if the dev auth path is accidentally enabled via `DEV_AUTH=true` in production, any caller can impersonate any user by setting the `x-azure-oid` header to any Azure OID.
- **Evidence:**
  ```typescript
  if (isDev) {
    azureOid = req.headers['x-azure-oid'] as string | undefined;
  } else {
    // TODO: Implement MSAL JWT verification
  }
  ```
- **PMO Risk:** Complete authentication collapse. Any user (or external attacker) could read or manipulate all venture data, risks, RACI assignments, budgets, and escalations. Total confidentiality and integrity failure.
- **Fix:** Implement Azure AD JWT verification using `@azure/msal-node` or `jwks-rsa` + `jsonwebtoken`. Validate `iss`, `aud`, `exp`, and extract `oid` from verified claims. Remove the `DEV_AUTH` environment variable escape hatch entirely, or gate it behind an additional compile-time flag that cannot exist in production builds.

### CRITICAL-2: Dev auth header trust allows full impersonation
- **Type:** Authentication bypass / Privilege escalation
- **Location:** `server/context.ts:29-31`
- **Attack vector:** When `isDev` is true (which includes `DEV_AUTH=true` in production), any HTTP client can set the `x-azure-oid` header to any value and authenticate as any user, including PMO and GM roles. There is no validation that the Bearer token is legitimate.
- **Evidence:**
  ```typescript
  const isDev = process.env.NODE_ENV !== 'production' || process.env.DEV_AUTH === 'true';
  // ...
  azureOid = req.headers['x-azure-oid'] as string | undefined;
  ```
- **PMO Risk:** An attacker who can reach the server (even on a "dev" deployment accessible to stakeholders) can impersonate any user — including PMO admins — and read all venture data, modify risks, escalate/close items, and alter RACI assignments.
- **Fix:** (1) Remove `DEV_AUTH` as a production escape hatch. (2) In dev mode, still validate the bearer token format or use a fixed dev secret. (3) Log all dev-mode auth bypasses.

---

## High Severity

### HIGH-1: Hardcoded dev token in client code ships to all environments
- **Type:** Credential exposure
- **Location:** `client/src/lib/trpc.ts:15`
- **Attack vector:** The client always sends `Authorization: Bearer dev-token` regardless of environment. This token is visible to anyone who inspects the JavaScript bundle. Combined with CRITICAL-2, an attacker knows the exact bearer token format used.
- **Evidence:**
  ```typescript
  headers: () => ({
    Authorization: `Bearer dev-token`,
    'x-azure-oid': azureOid,
  }),
  ```
- **PMO Risk:** Credential leakage in production bundles. Anyone inspecting the JS bundle sees the auth mechanism and can replicate it.
- **Fix:** Replace with MSAL.js token acquisition (`acquireTokenSilent`). In dev mode, use a conditional import or environment-gated dev token. Never ship hardcoded tokens in production bundles.

### HIGH-2: Unbounded text fields in risk/issue mutations — denial of service vector
- **Type:** Input validation gap / DoS
- **Location:** `server/routers/risks.ts:55,60,62,100,106,108,250,252,253,277`
- **Attack vector:** Multiple `z.string().optional()` fields have no `.max()` constraint: `description`, `mitigationPlan`, `escalationPath`, `impactDescription`, `resolutionPlan`. An attacker can submit multi-megabyte strings, inflating database storage and potentially causing OOM on query or render.
- **Evidence:**
  ```typescript
  description: z.string().optional(),        // no max
  mitigationPlan: z.string().optional(),     // no max
  escalationPath: z.string().optional(),     // no max
  ```
- **PMO Risk:** Storage exhaustion, degraded performance, potential service disruption during a critical board-reporting window.
- **Fix:** Add `.max(5000)` (or appropriate limit) to all text fields. For `description` fields, `.max(10000)` is reasonable. For `escalationPath`, `.max(2000)`.

### HIGH-3: RACI bulkUpdate array has no size limit — denial of service
- **Type:** Input validation gap / DoS
- **Location:** `server/routers/raci.ts:184`
- **Attack vector:** The `assignments` array in `bulkUpdate` has no `.max()` constraint. An attacker can send millions of assignment objects in a single request, causing the server to attempt a massive INSERT and exhaust memory or database connections.
- **Evidence:**
  ```typescript
  assignments: z.array(z.object({
    resourceId: z.string().uuid(),
    raciRole: z.enum(RACI_ROLE),
  })),  // no .max()
  ```
- **PMO Risk:** Server crash during bulk operations could take down the PMO dashboard for all users.
- **Fix:** Add `.max(500)` (or a reasonable upper bound based on expected workstream size) to the array schema.

### HIGH-4: Missing audit trail on createBlocker, resolveBlocker, and resolveDecision
- **Type:** Audit gap
- **Location:** `server/routers/risks.ts:341-358` (createBlocker), `server/routers/risks.ts:383-397` (resolveBlocker), `server/routers/risks.ts:399-413` (resolveDecision)
- **Attack vector:** A malicious PM could create blockers to manipulate project status reporting or resolve blockers/decisions without any audit record. There is no way to trace who created standalone blockers or who resolved blockers/decisions after the fact.
- **Evidence:**
  ```typescript
  // createBlocker — no logAudit call
  const [blocker] = await ctx.db.insert(blockers).values({...}).returning();
  return blocker;  // no audit
  ```
- **PMO Risk:** Governance gap — blockers and decisions affect venture health reporting and executive dashboards. Without audit trail, manipulation is undetectable.
- **Fix:** Add `logAudit()` calls to `createBlocker`, `resolveBlocker`, and `resolveDecision` mutations, consistent with the pattern used in `createRisk`, `createIssue`, etc.

---

## Medium Severity

### MEDIUM-1: RACI bulkUpdate delete-and-reinsert is not wrapped in a transaction
- **Type:** Data integrity
- **Location:** `server/routers/raci.ts:206-226`
- **Attack vector:** The bulk update deletes all existing assignments, then inserts new ones. If the insert fails (e.g., constraint violation, database error), the workstream loses all RACI assignments with no recovery. This is a non-atomic operation.
- **Evidence:**
  ```typescript
  await ctx.db.delete(workstreamRaciAssignments)
    .where(eq(workstreamRaciAssignments.workstreamId, input.workstreamId));
  // If next line fails, all assignments are gone
  const inserted = await ctx.db.insert(workstreamRaciAssignments).values(values).returning();
  ```
- **PMO Risk:** RACI data loss during bulk operations — workstream accountability could vanish without trace.
- **Fix:** Wrap the delete + insert in a database transaction using `ctx.db.transaction()`.

### MEDIUM-2: blocker description field has no max length
- **Type:** Input validation gap
- **Location:** `server/routers/risks.ts:344`
- **Attack vector:** `description: z.string().min(1)` has no upper bound. Same DoS vector as HIGH-2 but limited to a single field on a less-critical entity.
- **Evidence:**
  ```typescript
  description: z.string().min(1),  // no .max()
  ```
- **PMO Risk:** Minor storage/performance risk.
- **Fix:** Add `.max(5000)` to the description field.

### MEDIUM-3: `assertVentureReadAccess` uses `ctx: any` — no type safety on user object
- **Type:** Type safety gap
- **Location:** `server/routers/risks.ts:10`, `server/routers/raci.ts:11`
- **Attack vector:** The `any` type on `ctx` means TypeScript cannot catch cases where `ctx.user` is null or `ctx.user.role` is missing. If middleware ordering changes, this could silently pass null users through authorization checks.
- **Evidence:**
  ```typescript
  async function assertVentureReadAccess(ctx: any, ventureId: string) {
  ```
- **PMO Risk:** Future refactoring could introduce authorization bypass without compiler warning.
- **Fix:** Type `ctx` as `{ db: typeof db; user: AuthUser }` (the authenticated context shape).

### MEDIUM-4: `allEscalations` endpoint exposes all venture data to GM role
- **Type:** Over-fetching / Data exposure
- **Location:** `server/routers/risks.ts:312-326`
- **Attack vector:** The `allEscalations` endpoint returns full risk/issue objects (including descriptions, mitigation plans, owner details) for all ventures. GM role has read access here via `requireRole('gm', 'pmo')`, which is intentional, but the `select()` returns all columns — potentially including `legacyOwnerText` and `escalationPath` that may not be relevant for the GM dashboard view.
- **Evidence:**
  ```typescript
  const escalatedRisks = await ctx.db.select().from(risks).where(eq(risks.escalated, true));
  ```
- **PMO Risk:** GM sees more data fields than needed for their dashboard role. Low exploitability but violates least-privilege on data shape.
- **Fix:** Use explicit column selection (`.select({ id, title, riskScore, rag, ventureId, status })`) to return only what the escalation dashboard needs.

---

## Low Severity

### LOW-1: Duplicate `assertVentureReadAccess` function across routers
- **Type:** Maintainability / Security consistency risk
- **Location:** `server/routers/risks.ts:10-17`, `server/routers/raci.ts:11-18`
- **Attack vector:** No direct exploit, but divergent copies of authorization logic increase the chance that a future fix to one is not applied to the other.
- **Fix:** Extract to a shared utility (e.g., `server/services/auth.ts`).

---

## Passed Checks

1. **All endpoints use `protectedProcedure`** — Confirmed. Every endpoint in `risks.ts` and `raci.ts` uses `protectedProcedure`. No `publicProcedure` usage found in either router.
2. **GM role cannot create/update/delete** — Confirmed. All mutation endpoints (`createRisk`, `updateRisk`, `createIssue`, `updateIssue`, `createBlocker`, `resolveBlocker`, `resolveDecision`, `raci.assign`, `raci.remove`, `raci.bulkUpdate`) check `ctx.user.role === 'gm'` and throw FORBIDDEN.
3. **PM venture scoping** — Confirmed. All endpoints call `assertVentureReadAccess()` which checks `venture.pmUserId !== ctx.user.id` for PM role. PM cannot access other ventures.
4. **Integer bounds (1-5)** — Confirmed. `likelihood`, `impact`, and `weight` all use `z.number().int().min(1).max(5)`. Database-level CHECK constraints also enforce this.
5. **SQL injection resistance** — Confirmed. All queries use Drizzle ORM parameterized queries (`eq()`, `and()`, `inArray()`). No raw SQL string concatenation found in any router.
6. **No XSS vectors** — Confirmed. No `dangerouslySetInnerHTML`, `innerHTML`, or `v-html` usage found anywhere in the client codebase. All user-supplied text is rendered via React JSX text interpolation (`{risk.title}`, `{risk.description}`, etc.), which auto-escapes.
7. **Migration is transactional** — Confirmed. The migration script wraps all operations in `BEGIN; ... COMMIT;`. Partial state on failure is prevented.
8. **RACI bulk update privilege escalation** — Confirmed. `bulkUpdate` validates `raciRole` against the `RACI_ROLE` enum via Zod. Only valid RACI roles (`responsible`, `accountable`, `consulted`, `informed`) can be assigned. The `createdBy` is always set from `ctx.user.id`, not from user input. One-accountable rule is enforced.
9. **RACI enum and unique constraint** — Confirmed. Database-level `UNIQUE(workstream_id, resource_id, raci_role)` prevents duplicate assignments. Application catches constraint violations gracefully.
10. **Audit trail on risk/issue mutations** — Confirmed for risks and issues. `createRisk`, `updateRisk`, `createIssue`, `updateIssue` all log to audit trail with field-level diff tracking.
11. **Cross-venture endpoints role-restricted** — Confirmed. `allEscalations` requires `gm` or `pmo`. `allOpenDecisions` and `allOpenBlockers` require `pmo` only.

---

## Verdict Justification

**FAIL** — 2 CRITICAL and 4 HIGH findings.

The two CRITICAL findings relate to authentication: JWT verification is not implemented for production, and the dev-mode auth bypass can be enabled in production via an environment variable. These are deployment-blocking issues.

The HIGH findings cover hardcoded credentials in client bundles, unbounded input validation enabling DoS, missing array size limits on bulk operations, and audit trail gaps on blocker/decision mutations.

All authorization checks (role enforcement, venture scoping) are correctly implemented at the application layer, but they depend on authentication working correctly — which it currently does not in production.

---

SECURITY AUDIT: FAIL
Critical: 2 | High: 4 | Medium: 4 | Low: 1
Report: /docs/risk-module-overhaul/qa/security-audit-risk-module-overhaul.md
Dev agents must fix all CRITICAL and HIGH findings before proceeding.
