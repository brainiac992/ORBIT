# Fabrika Agent Pipeline

After HERALD completes its six-layer orchestration and a plan is approved, this domain agent pipeline activates. **These agents always run after HERALD — never before, never in place of it.**

HERALD's SA (Plan Architect) declares which phases are needed at the end of Phase 1. Minimum is Phase 1 + Phase 7. Maximum is all phases in order.

---

## Agent Roster

| Agent | Phase | Role |
|---|---|---|
| PM (brief) | 1 | Product brief, success metrics, scope |
| BA | 1 | Detailed requirements interview, requirements doc |
| PO | 1 | Backlog prioritization, user stories, acceptance criteria, MVP scope |
| PM (summary) | 1 | Post-BA/PO alignment check, scope drift detection |
| Architect | 1 | Technical blueprint (ADR) |
| UI-Designer | 2 | UI spec + React wireframes |
| Content-Writer | 2 | UI copy, labels, messages, translations |
| DB-Agent | 3 | Schema, migrations, seed data |
| Backend-Agent | 3 | API endpoints, business logic |
| Frontend-Agent | 3 | React UI implementation |
| UI-Tester | 4 | Visual, accessibility, RTL, copy |
| QA-Happy | 4 | Happy path + acceptance criteria |
| QA-Breaker | 4 | Edge cases, adversarial inputs |
| Security-Agent | 4 | Auth, permissions, injection, data exposure |
| Data-Agent | 5 | Data integrity, scalability, ERP compat |
| Marketing-Agent | 6 | Customer-facing announcements (optional) |
| Content-Auditor | 6 | Audit copy vs spec; verify EN/AR/HE locales |
| DOC-Agent | 7 | Code comments, changelog, doc finalization |
| Post-Release-Agent | 8 | Production verification after deploy |
| DevOps-Agent | standalone | Deployment readiness |

Agent definitions live in `.claude/agents/`.

---

## Pipeline Order

```
Phase 1 [ALWAYS]:      PM (brief) -> [approve] -> BA -> PO -> PM (summary) -> Architect
Phase 2 [if UI]:       UI-Designer + Content-Writer (parallel)
Phase 3 [as needed]:   DB-Agent -> Backend-Agent -> Frontend-Agent (sequential)
Phase 4 [if Ph3 ran]:  UI-Tester + QA-Happy + QA-Breaker + Security-Agent (parallel)
Phase 5 [if schema]:   Data-Agent
Phase 6 [if public]:   Marketing-Agent + Content-Auditor (parallel)
Phase 7 [ALWAYS]:      DOC-Agent -> Commit + Push
Phase 8 [post-deploy]: Post-Release-Agent
```

---

## Pipeline Rules

- **PM and BA always run first — no exceptions.** No dev, design, or QA agent runs before Phase 1 is complete.
- **Architect declares** which of Phases 2-6 are needed at end of Phase 1.
- Never skip steps. Never run a later phase before earlier phases complete.
- Write all outputs to `/docs`.
- Flag blockers with `BLOCKER:` prefix.
- Fix pre-existing TypeScript/lint errors encountered — no exceptions.
- Translations mandatory for every UI string (EN + AR + HE).
- Design system compliance mandatory — no hardcoded hex values, no Tailwind defaults.
- Be critical, not agreeable.

---

## PMO Pipeline Mode (`"mode": "pmo"`)

When `domain_pipeline.mode` is set to `"pmo"` in `herald.config.json`, the following integration rules apply.

**L3 is replaced by Phase 1.** When `skip_sa_planning: true`, HERALD does not dispatch the SA to produce a plan. Instead, Phase 1 of the domain pipeline IS the planning layer. The PM Brief approval is the plan approval gate — it replaces Herald's Layer 3 user approval checkpoint. HERALD saves the approved PM Brief path as the plan reference in `plans/`.

**Test-First Gate defers to Phase 4.** When `test_first_gate: "defer_to_phase_4"`, HERALD does not enforce the `test_writer -> code_agent -> test_runner` sequence per-task during Phase 3 dispatch. Instead, the Phase 4 agents (QA-Happy, QA-Breaker, UI-Tester, Security-Agent) fulfil this gate as a batch. HERALD treats Phase 4 completion as the test gate passing event.

**Layer 6 fires after Phase 7.** When `feedback_loop_trigger: "phase_7_complete"`, HERALD holds the Feedback Loop until DOC-Agent announces completion. It does not score per-agent or per-phase.

```
HERALD Layer 1 (Intent Engine) — domain detection, context.md loaded, fast-track check
  |
HERALD Layer 2 (Context Harvester) — resume check, relevant files loaded
  |
  [L3 REPLACED] — Phase 1 runs as the planning layer:
  PM (brief) -> [user approves PM Brief = plan approval gate] -> BA -> PO -> PM (summary) -> Architect
  HERALD saves PM Brief path to plans/ as the active plan record
  |
HERALD Layer 4 (Prompt Synthesizer) — scopes briefs for each phase agent
  |
HERALD Layer 5 (Dispatch Router) — safety gates active throughout:
  Phase 2 [if UI]:       UI-Designer + Content-Writer (parallel)
  Phase 3 [as needed]:   DB-Agent -> Backend-Agent -> Frontend-Agent (sequential)
  Phase 4 [if Ph3 ran]:  UI-Tester + QA-Happy + QA-Breaker + Security-Agent (parallel) <- test gate
  Phase 5 [if schema]:   Data-Agent
  Phase 6 [if public]:   Stakeholder-Comms + Content-Auditor (parallel)
  Phase 7 [ALWAYS]:      DOC-Agent -> Commit + Push
  Phase 8 [post-deploy]: Post-Release-Agent
  |
HERALD Layer 6 (Feedback Loop) — fires after Phase 7 complete, scores full pipeline run
  |
  Phase 8 runs independently after deployment — not scored by Layer 6
```

**All other Herald safety gates remain fully active in PMO mode:**
- Risk Gate — fires before any destructive task regardless of phase
- Destructive Pattern Scan — scans all generated artifacts
- Context Checkpoint — fires at 75% token usage
- Failure Protocol — retries and escalations unchanged
- Human Verification Gate — fires for UI/design tasks in Phase 2 and Phase 4
