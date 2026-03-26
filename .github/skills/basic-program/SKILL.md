---
name: basic-program
description: Execute bespoke Commodore BASIC v2 programs through c64bridge.
---

## Intent

Use this skill when the user needs a custom BASIC program rather than a one-call demo.

## Inputs

- Desired behavior, inputs, and expected output.
- Target backend or backend preference.
- Whether current machine state must be preserved.

## Execution

1. If the request is only a quick visible greeting or smoke test, delegate to `.github/skills/cross-platform-demo/SKILL.md` instead of generating new BASIC.
2. If the request already pins a backend and asks for a tiny static BASIC program, use the fast path:
	- skip README lookups, MCP schema inspection, and `c64_rag` retrieval;
	- generate uppercase, line-numbered BASIC immediately;
	- select the requested backend first when needed;
	- execute with `c64_program` using `op: "upload_run_basic"`.
3. Clarify missing requirements before generating code when the request is not already specific enough to execute.
4. Consult `c64://specs/basic` and `c64://context/bootstrap` only when syntax or workflow constraints matter.
5. Generate uppercase, line-numbered BASIC.
6. When the user wants to visibly watch VICE render the machine boot or program output, prefer a visible VICE session with warp disabled and execute with `c64_program` using `op: "upload_run_basic"` only after selecting the `vice` backend.
7. In that visible VICE case, do not immediately follow the run with `read_screen` or `wait_for_text` unless the user explicitly asks for machine verification after the visible output has rendered.
8. Use `c64_rag` with `op: "basic"` only when targeted BASIC examples are needed.

## Validation

1. For normal non-visual runs, call `c64_memory` with `op: "read_screen"` after execution.
2. For visible VICE runs, prefer user-visible confirmation first and only do monitor-based reads after the screen has clearly rendered or when the user asks for explicit verification.
3. Use `c64_memory` with `op: "read"` around the BASIC program area only when tokenization or memory placement needs verification.
4. Summarize expected versus observed output.

## Safety

- Confirm before reset, reboot, or other disruptive recovery actions.
- Preserve existing machine state when the user requests it.

## Escalation

- Switch to `.github/skills/assembly-program/SKILL.md` when performance, raster timing, or direct register control becomes the primary need.
