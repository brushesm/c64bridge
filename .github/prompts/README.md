## Copilot Prompt Modes

These files define repo-local prompt entry points.

Shared guidance lives in `AGENTS.md`, `CLAUDE.md`, and `.github/copilot-instructions.md`.
Execution logic lives only in `.github/skills/*/SKILL.md`.

## Prompts vs Skills

Prompts in this folder decide when and why a workflow should run.

Skills in `.github/skills/` define how the workflow executes: MCP tool choice, sequencing,
validation, and safety constraints.

Keep prompt files short, intent-shaped, and routing-only. If a prompt starts describing tool
calls or step-by-step execution, move that content into the matching skill.
