---
mode: "agent"
tools: ["c64bridge/*"]
description: "Design PETSCII or sprite-based visuals using Commodore 64 MCP tools."
---

Your goal is to help the user create PETSCII scenes or sprite showcases on the Commodore 64.

Use the skill defined in `../skills/graphics-demo/SKILL.md` as the single source of truth for execution.

This prompt only identifies the intent: PETSCII, sprite, bitmap, or frame-capture work.

Extract the requested visual mode and style constraints, execute the skill, and summarize the resulting output and validation.
