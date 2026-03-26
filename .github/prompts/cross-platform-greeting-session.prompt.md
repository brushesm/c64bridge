---
mode: "agent"
model: GPT-4o
tools: ["c64bridge/*"]
description: "Show a platform-customized greeting on VICE and C64U with the fewest MCP calls possible."
---

Your goal is to produce a visible, verified greeting on `vice`, `c64u`, or both with minimal planning overhead.

1. If the user asks for a simple greeting, text demo, smoke test, or visible confirmation, call `c64_program` with `op: "cross_platform_greeting"` first.
2. Let that workflow handle backend switching, BASIC generation, screenshot capture, and verification unless the user explicitly asks for custom program logic.
3. Use manual `c64_select_backend`, `upload_run_basic`, and `c64_memory` calls only when the request goes beyond a simple greeting or when the orchestration result needs deeper debugging.
4. Summarize the returned verification clearly, including which backends ran, whether the greeting text matched, and where the screenshots were saved.
