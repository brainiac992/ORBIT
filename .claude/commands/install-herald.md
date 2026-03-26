Install HERALD into the current project by cloning the herald-of-rivia repository and copying all required files.

Run the following steps:

1. Clone the Herald repo into a temporary directory:
```
git clone https://github.com/brainiac992/herald-of-rivia.git /tmp/herald-install
```

2. Copy all Herald files into the current project:
- `CLAUDE.md` → project root
- `herald.config.json` → project root
- `agent-registry.json` → project root
- `knowledge-base.json` → project root
- `domain-library.md` → project root
- `.claude/commands/brainstorm.md` → `.claude/commands/`
- `.claude/commands/score.md` → `.claude/commands/`
- `.claude/hooks/herald-safety.sh` → `.claude/hooks/`
- `.claude/hooks/deployment-audit.sh` → `.claude/hooks/`
- `.claude/settings.json` → `.claude/` (merge with existing if present — do not overwrite existing hooks, only add Herald's PreToolUse Bash hook if not already there)

3. Create a `plans/` directory if it does not exist.

4. Remove the temporary clone at `/tmp/herald-install`.

5. Confirm to the user:
```
HERALD installed successfully.

Files added:
  CLAUDE.md               — orchestration spec
  herald.config.json      — pipeline configuration
  agent-registry.json     — agent registry
  knowledge-base.json     — pattern store (empty)
  domain-library.md       — domain constraint library
  .claude/commands/       — /brainstorm and /score commands
  .claude/hooks/          — safety and deployment audit hooks
  plans/                  — plan file directory (empty)

HERALD is now active in this project.
Restart or start a new Claude Code session to activate.
```
