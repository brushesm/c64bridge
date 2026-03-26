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
2. Clarify missing requirements before generating code.
3. Consult `c64://specs/basic` and `c64://context/bootstrap` when syntax or workflow constraints matter.
4. Generate uppercase, line-numbered BASIC.
5. Execute with `c64_program` using `op: "upload_run_basic"`.
6. Use `c64_rag` with `op: "basic"` only when targeted BASIC examples are needed.

## Validation

1. Call `c64_memory` with `op: "read_screen"` after execution.
2. Use `c64_memory` with `op: "read"` around the BASIC program area when tokenization or memory placement needs verification.
3. Summarize expected versus observed output.

## Safety

- Confirm before reset, reboot, or other disruptive recovery actions.
- Preserve existing machine state when the user requests it.

## Escalation

- Switch to `.github/skills/assembly-program/SKILL.md` when performance, raster timing, or direct register control becomes the primary need.
