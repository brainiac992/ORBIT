# HERALD Reference Schemas

Read this file on demand when creating or updating HERALD artifacts. Do not load proactively.

---

## Plan File Schema

Stored in `plans/`. One file per approved plan. Created at end of Layer 3, updated throughout execution, finalized in Layer 6.

```json
{
  "id": "2026-03-17_short-task-description",
  "created": "2026-03-17T10:00:00",
  "request": "the original user request",
  "complexity": "simple | moderate | complex",
  "fast_track": false,
  "status": "pending | in_progress | completed | failed",
  "approach": "summary of the approved plan",
  "checklist": [
    {
      "task": "description of the task",
      "agent": "agent_id",
      "spawn_type": "temporal | dominant",
      "status": "pending | in_progress | completed | failed | awaiting_verification",
      "started_at": null,
      "completed_at": null,
      "retries": 0,
      "max_retries": 2,
      "error": null,
      "output": null,
      "verification_type": "auto | human | none",
      "requires_human_verification": false,
      "verification_checklist": null,
      "verification_status": null,
      "risk_level": "safe | caution | destructive",
      "risk_summary": null,
      "safe_default": null,
      "risk_gate_status": null
    }
  ],
  "score": {
    "composite": null,
    "spec_compliance": null,
    "scope_adherence": null,
    "technical_correctness": null,
    "execution_efficiency": null
  },
  "pattern_stored": false
}
```

---

## Dispatch Plan Format

```json
{
  "agents": [
    {
      "id": "agent_name",
      "spawn_type": "temporal | dominant",
      "brief": "...",
      "depends_on": [],
      "parallel_with": ["other_agent"]
    }
  ],
  "execution_order": [
    "agent_a",
    ["agent_b", "agent_c"],
    "agent_d"
  ]
}
```

---

## Agent Registry

Stored in `agent-registry.json`. Maintained exclusively by HERALD.

```json
{
  "agents": [
    {
      "id": "sa",
      "name": "Systems & Business Analyst",
      "scope": "Validate specs, plan execution, classify agents and tasks, score outcomes, update context store",
      "spawn_type": "dominant",
      "status": "active",
      "created": "2026-03-17"
    },
    {
      "id": "agent_builder",
      "name": "Agent Builder",
      "scope": "Build new agents to spec — purpose, scope, spawn type, and instructions",
      "spawn_type": "dominant",
      "status": "active",
      "created": "2026-03-17"
    }
  ],
  "version": "1.0",
  "last_updated": null
}
```

---

## Org Knowledge Base

Stored in `knowledge-base.json`. Written by HERALD after SA scores an execution at >= 95%.

```json
{
  "patterns": [
    {
      "input_pattern":     "short description of the type of request",
      "engineered_prompt": "the brief that worked",
      "agents_used":       ["agent_a", "agent_b"],
      "plan_id":           "2026-03-17_short-task-description",
      "score": {
        "composite":             95,
        "spec_compliance":       95,
        "scope_adherence":       100,
        "technical_correctness": 95,
        "execution_efficiency":  90
      },
      "retries":           0,
      "token_cost":        420,
      "notes":             "any relevant context for future use"
    }
  ],
  "version":      "1.0",
  "last_updated": null
}
```

---

## Handoff Output Format

```
## HERALD Handoff

Intent:         [one sentence]
Goal:           [what done looks like]
Complexity:     [simple | moderate | complex]
Fast-track:     [yes | no]
Constraints:    [list]
Context loaded: [files / schemas / decisions from context.md and codebase]
Agent plan:     [approved plan summary]
Plan file:      [path to saved plan]
Dispatch plan:  [ordered agent sequence]
Agent briefs:   [one per agent — objective, context, constraints, output spec]
```

---

## Context Store Schema

Stored in `context.md`. Read at Layer 1, written at Layer 6.

```markdown
# HERALD Context Store

## Decisions
- [YYYY-MM-DD] [decision and the reason behind it]

## Constraints
- [constraint — what it is and why it exists]

## Failed Approaches
- [YYYY-MM-DD] [what was tried, why it failed, what to do instead]

## Stakeholder Notes
- [note relevant to future work]

## Open Questions
- [unresolved question that may affect future tasks]
```

Rules:
- SA only writes entries that would change how a future task is approached
- SA never writes what is already in the code or git history
- Entries are never deleted — only superseded with a note

---

## Project Config

Stored in `herald.config.json`. Read the actual file for current values.

```json
{
  "fast_track": {
    "enabled": true,
    "allow_slash_fast": true,
    "auto_classify": true
  },
  "pipeline": {
    "require_plan_approval": true,
    "success_threshold": 95,
    "default_max_retries": 2
  },
  "version": "1.0"
}
```
