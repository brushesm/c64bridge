---
name: hello-world
description: Run the fastest greeting or smoke-test path across VICE and C64U.
---

## Intent

Use this skill when the user wants the shortest hello-world, greeting, or smoke-test workflow.

## Inputs

- Target backends: `vice`, `c64u`, or both.
- Optional greeting text or message template.

## Execution

1. Execute `c64_program` with `op: "cross_platform_greeting"`.
2. Pass `platforms` only when the user pins a backend or wants a subset of the configured backends.
3. Pass `messageTemplate` only when the default greeting is not sufficient.
4. On local machines with a graphical session, assume VICE should render in a real visible emulator window. Only expect Xvfb or other headless behavior in CI or when no framebuffer/display session exists.
5. Do not re-read README sections, MCP manifests, or BASIC references before executing unless the request is ambiguous or the workflow fails.
6. Fall back to `.github/skills/basic-program/SKILL.md` only when the user needs custom BASIC logic beyond a static greeting.

## Validation

1. Trust the workflow's structured verification first.
2. For local visible VICE runs, treat the emulator window as the primary confirmation and summarize any reported text matches or screenshot artifacts.
3. Fall back to manual `read_screen` checks only when the user asks for explicit verification or the workflow fails.

## Safety

- Warn if a running session may be overwritten by the demo.
- Do not add manual reset steps unless the workflow fails and the user confirms recovery actions.