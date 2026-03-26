---
mode: "agent"
tools: ["c64bridge/*"]
description: "Plan, write, and validate a Commodore BASIC v2 program with MCP tooling."
---

Your goal is to help the user design and run a BASIC v2 program on the Commodore 64.

Use the skill defined in `../skills/basic-program/SKILL.md` as the single source of truth for execution.

This prompt only identifies the intent: a bespoke Commodore BASIC v2 program rather than a generic quick demo.

If the request collapses to a tiny hello-world or smoke-test program, reroute to `../skills/hello-world/SKILL.md` instead of treating it as bespoke BASIC.

Extract missing requirements from the user request, execute the skill, and summarize the result and validation.
