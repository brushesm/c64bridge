---
mode: "agent"
tools: ["c64bridge/*"]
description: "Run the fastest hello-world or smoke-test workflow with MCP tooling."
---

Your goal is to run a fast hello-world or greeting workflow on one or more Commodore 64 backends.

Use the skill defined in `../skills/hello-world/SKILL.md` as the single source of truth for execution.

This prompt only identifies the intent: a trivial greeting, smoke test, or hello-world confirmation.

When the request is already backend-pinned and low ambiguity, execute immediately through the skill instead of re-reading general docs.

Extract missing requirements from the user request, execute the skill, and summarize the result and validation.