# QA Report — ADRES PMO Platform — Adversarial
**Date:** 2026-03-26
**QA Round:** 1
**Agent:** QA-Breaker
**Verdict:** PASS (issues found and fixed)

## Issues Found & Fixed

### 🔴 BLOCKER (Fixed): TrpcWrapper stale auth
- **Attack:** Login as GM → switch user to PM → all API calls still use GM's azureOid
- **Location:** `client/src/App.tsx:70-72`
- **Problem:** `useState(() => getTrpcClient(...))` captured OID at mount, never updated
- **Fix applied:** Replaced with `useMemo` keyed on `user.azureOid` — trpc client and QueryClient recreated on user change

### 🔴 BLOCKER (Fixed): Dev auth header trusted in production
- **Attack:** Set `x-azure-oid` header manually in production → impersonate any user
- **Location:** `server/context.ts:28`
- **Problem:** No NODE_ENV check — dev auth path ran in all environments
- **Fix applied:** Added `isDev` guard — x-azure-oid only trusted when `NODE_ENV !== 'production'`

### 🟡 WARNING (Fixed): Progress submit not transactional
- **Attack:** Submit weekly update → partial failure → orphaned child records
- **Location:** `server/routers/progress.ts:52-125`
- **Problem:** 6 separate inserts + updates with no transaction wrapper
- **Fix applied:** Wrapped entire submit mutation in `ctx.db.transaction()`

### 🟢 LOW (Fixed): Leftover Vite scaffold files
- **Location:** `client/src/App.css`, `client/src/assets/`
- **Problem:** Dead files from `create vite` — no impact but messy
- **Fix applied:** Deleted

## Attack Vectors Tested (Passed)

| Attack | Target | Result |
|---|---|---|
| PM accesses other venture via URL | Frontend routing | ✅ Redirected to own dashboard |
| PM calls ventures.get with wrong ID | API | ✅ Returns FORBIDDEN |
| GM calls progress.submit | API | ✅ Returns FORBIDDEN (requireRole) |
| Empty narrative in weekly update | API | ✅ Zod rejects — min(1) |
| Negative completionPct | API | ✅ Zod rejects — min(0) |
| completionPct > 100 | API | ✅ Zod rejects — max(100) |
| Budget setBudget called twice | API | ✅ Returns clear error — budget already locked |
| Venture delete attempt | API + UI | ✅ No delete endpoint exists; UI shows only archive |

## Verdict Justification
Three blockers found and fixed in round 1. All adversarial vectors now pass. No remaining critical or high issues.
