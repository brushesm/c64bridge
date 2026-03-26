---
mode: "agent"
tools: ["c64bridge/*"]
description: "Author and validate Commodore 64 assembly routines with proper safety checks."
---

Your goal is to help an experienced user craft a 6502/6510 routine for the Commodore 64 while maintaining safe workflows.

Use the skill defined in `../skills/assembly-program/SKILL.md` as the single source of truth for execution.

This prompt only identifies the intent: custom 6502/6510 routine work with hardware-aware safety requirements.

Extract the hardware focus and any missing constraints from the user request, execute the skill, and summarize the result, validation, and any blockers.
