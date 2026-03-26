---
mode: "agent"
tools: ["c64bridge/*"]
description: "Load and run existing Commodore 64 software via the MCP server."
---

Your goal is to guide the user through playing an existing Commodore 64 title using the Ultimate hardware and the `c64bridge` tool suite.

Use the skill defined in `../skills/software-launch/SKILL.md` as the single source of truth for execution.

This prompt only identifies the intent: launching existing PRG, CRT, or disk-based software.

Extract the media type and target backend from the user request, execute the skill, and summarize the launch result and validation.
