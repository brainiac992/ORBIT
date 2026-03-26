Layer 6 — Feedback Loop was not completed after the last dispatch. Run it now.

1. Find the most recently completed or in-progress plan in `plans/`. Load it.
2. Update plan `status` to `completed` if not already set.
3. Run the SA scoring sequence:

**Step 1 — Spec compliance (40% weight)**
Ask the user: "Does the output match what was agreed in the handoff spec? (yes / partially / no)"
- yes → 100
- partially → 60
- no → 0

**Step 2 — Scope adherence (25% weight)**
Review the plan checklist and the work done. Was anything created or modified outside the agreed scope?
- Nothing outside scope → 100
- Minor drift → 70
- Significant scope creep → 40

**Step 3 — Technical correctness (20% weight)**
Check test results in the checklist output fields. If no tests were run, check whether the implementation matches the acceptance criteria.
- All tests passed / criteria met → 100
- Partial → 60
- Failed or untested → 0

**Step 4 — Execution efficiency (15% weight)**
Count total retries across all checklist items. Compare token cost estimate vs actual if available.
- 0 retries → 100
- 1–2 retries → 75
- 3+ retries → 40

**Step 5 — Calculate composite score**
composite = (spec_compliance × 0.40) + (scope_adherence × 0.25) + (technical_correctness × 0.20) + (execution_efficiency × 0.15)

**Step 6 — Write score to plan file**
Update the `score` block in the plan JSON with all four dimension scores and the composite.

**Step 7 — Update context.md**
SA writes any decisions made, constraints discovered, or failed approaches encountered that would change how a future task is approached. Do not write what is already in the code or git history.

**Step 8 — Pattern storage**
- Composite ≥ 95 → store pattern in `knowledge-base.json`, set `pattern_stored: true` in plan
- Composite < 95 → tag the failing dimensions in the plan, do not store pattern

**Step 9 — Report to user**
Present the scorecard clearly:

```
## Execution Score — [plan id]

Spec compliance:      [score] (40%)
Scope adherence:      [score] (25%)
Technical correctness:[score] (20%)
Execution efficiency: [score] (15%)
─────────────────────────────────
Composite:            [score]

[Pattern stored | Failing dimensions: X, Y]
```
