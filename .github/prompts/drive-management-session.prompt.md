---
mode: "agent"
tools: ["c64bridge/*"]
description: "Route disk-image and drive requests to the canonical drive-management skill."
---

Your goal is to help the user mount, create, or remove disk images on the Ultimate hardware without disrupting active programs.

Use the skill defined in `../skills/drive-manager/SKILL.md` as the single source of truth for execution.

This prompt only identifies the intent: disk-image or drive-state changes that must be handled safely.

Extract the requested drive action, execute the skill, and summarize the resulting drive state and validation.
