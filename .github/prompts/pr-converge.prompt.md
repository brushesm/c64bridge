---
description: Converge a pull request to merge-ready state
---

# Pull Request Convergence

Bring the current pull request to a **merge-ready state**.

Use the skill defined in `../skills/pr-converge/SKILL.md` as the single source of truth for execution.

This prompt only identifies the intent: bringing the current pull request to merge-ready state.

Execute the skill, keep iterating until convergence criteria are satisfied, and summarize fixes, validation, and CI status.
