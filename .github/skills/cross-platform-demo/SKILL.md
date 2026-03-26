---
name: cross-platform-demo
description: Run the shortest visible demo path across VICE and C64U.
---

## Intent

Use this skill for quick greetings, smoke tests, and visible confirmation that one or more backends are responding.

## Inputs

- Target backends: `vice`, `c64u`, or both.
- Optional message template when the default greeting is not sufficient.

## Execution

1. Execute `c64_program` with `op: "cross_platform_greeting"`.
2. Pass `platforms` only when the user wants a subset of the configured backends.
3. Pass `messageTemplate` only when the user explicitly wants custom text.

## Validation

1. Trust the workflow's structured verification first.
2. Summarize the reported text match results and screenshot paths.
3. Fall back to `.github/skills/basic-program/SKILL.md` only when the user needs custom program flow beyond a simple greeting.

## Safety

- Warn if a running session may be overwritten by the demo.
- Do not add manual reset steps unless the workflow fails and the user confirms recovery actions.
