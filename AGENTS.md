# Agent Integration Guide

LLM-facing reference for using this MCP server. Keep it simple: start the server, discover tools, call them safely.

## Quick Start

1) Install and run

```bash
npm install
npm start
```

On startup the server probes connectivity (REST + zero-page read) and announces it is running on stdio.

2) Configure target (optional)

The server resolves config in this order: `C64BRIDGE_CONFIG` → `./.c64bridge.json` → `~/.c64bridge.json` → defaults (`host=c64u`, `port=80`).

Example:

```json
{ "c64u": { "host": "c64u", "port": 80, "networkPassword": "secret" } }
```

When Ultimate firmware network protection is enabled, `networkPassword` is sent as the `X-Password` header on every REST request.

### Runtime Backend Switching

When both `c64u` and `vice` are configured, the server can keep both backends live at the same time.
Use `c64_select_backend` to switch the active backend without restarting the MCP server.
The `c64://platform/status` resource always reports the currently active backend and the configured backend set.
State the desired backend directly in the prompt when you want to pin execution, for example: `use vice`, `vice: load this PRG`, `use c64u`, or `run this on hardware`.
When using the VS Code `C64` agent, keep the backend request in the same prompt so tool routing can call `c64_select_backend` before backend-specific operations.

3) VS Code Copilot Chat (MCP)

Add to Settings (JSON):

```json
{
  "github.copilot.chat.experimental.mcp": {
    "servers": [
      { "name": "c64bridge", "command": "node", "args": ["./node_modules/c64bridge/dist/index.js"], "type": "stdio" }
    ]
  }
}
```

Keep the server running; tools are discovered automatically in the chat session.

## MCP Discovery & Calling

- Discover tools: use the client’s ListTools. You will see domains like `c64_program`, `c64_memory`, `c64_system`, etc., each with an `op` multiplexing parameter.
- Discover resources/prompts: use ListResources and ListPrompts for knowledge and reusable patterns.
- Call pattern (all tools): pass a JSON object with `op` plus operation‑specific inputs shown by ListTools.

Examples (MCP tool calls; HTTP only for illustration):

```json
// c64_program — upload and run BASIC
{
  "op": "upload_run_basic",
  "program": "10 PRINT \"HELLO\"\n20 GOTO 10"
}
```

```json
// c64_program — fastest dual-backend greeting demo
{
  "op": "cross_platform_greeting"
}
```

```json
// c64_memory — wait for output on the screen (ASCII)
{
  "op": "wait_for_text",
  "pattern": "HELLO"
}
```

```json
// c64_rag — retrieve BASIC or ASM references from local knowledge
{
  "op": "basic",
  "q": "draw a bouncing sprite"
}
```

## Capabilities

- Program runners: `c64_program` (`upload_run_basic`, `upload_run_asm`, `run_prg`, `run_crt`, `bundle_run`, `batch_run`)
- Fast demo workflow: `c64_program` (`cross_platform_greeting`) for one-call greetings on VICE and/or C64U with screenshot capture and verification
- Screen & memory: `c64_memory` (`read`, `write`, `read_screen`, `wait_for_text`)
- System control: `c64_system` (`pause`, `resume`, `reset`, `reboot`, `poweroff`, `menu`, tasks)
- Configuration: `c64_config` (get/set, `batch_update`, `snapshot`, `restore`, `diff`, `shuffle`)
- Drives & files: `c64_disk`, `c64_drive`
- SID / music: `c64_sound` (playback, generate, analyze)
- Graphics: `c64_graphics` (PETSCII, sprites)
- Knowledge & RAG: `c64_rag` (BASIC and ASM lookups)

Tools and parameters are listed dynamically via ListTools.

## Knowledge Resources

Use ListResources to discover built-in knowledge, then read specific URIs to enrich context before coding:

- `c64://specs/basic` — BASIC v2 tokens, syntax, device I/O
- `c64://specs/assembly` — 6510 opcodes, addressing, zero-page strategy
- `c64://specs/vic` — raster timing, sprites, colour RAM, bitmap modes
- `c64://specs/sid` — SID registers, waveforms, ADSR
- `c64://specs/memory-map` — full 64 KB address map
- `c64://docs/basic/pitfalls` — quoting, line length, token pitfalls
- `c64://docs/petscii-style` — readable PETSCII, colour/dither guidance

Pull RAG snippets via `c64_rag` (ops `basic`/`asm`) for targeted examples.

## Expert Workflow (recommended)

- Plan → Run → Verify: generate code, run via `c64_program`, then verify with `c64_memory.read_screen`/`wait_for_text` and optional RAM checks.
- For quick visible confirmations, skip the manual composition and use `c64_program` (`cross_platform_greeting`) first; it performs backend switching, BASIC upload, screenshot capture, and verification internally.
- Prefer stdio transport; only use the HTTP bridge for manual inspection.
- Use `c64_rag` to fetch relevant BASIC/ASM snippets and specs before coding.
- BASIC tips: tokenised keywords, short variable names, careful quoting; keep lines ≤ 2 screen rows; prefer `PRINT` with explicit spacing.
- ASM tips: avoid unstable rasters; use zero page consciously; confirm register maps via `c64://specs/assembly`, `c64://specs/memory-map`, `c64://specs/vic` resources.
- Safety: only call reset/power/drive operations intentionally; confirm preconditions for mounts/writes; log reversible steps in chat.

Error handling patterns:

- If a run stalls, `c64_system.reset` then re-run; verify with `wait_for_text`.
- On memory write validation failure, re-read with `c64_memory.read` and compare.
- For long tasks, prefer background tasks (`c64_system.start_task`) and poll.

## HTTP Examples (optional)

The stdio transport is preferred. The legacy HTTP bridge is deprecated and disabled by default; enable manually before using curl.

```bash
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"op":"upload_run_basic","program":"10 PRINT \"HELLO\"\n20 GOTO 10"}' \
  http://localhost:8000/tools/c64_program | jq

curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"op":"read_screen"}' \
  http://localhost:8000/tools/c64_memory | jq
```

## Safety Notes

- Some tools affect device state (power, reboot, drive ops). Use deliberately.
- Logs emit to stderr; stdout is reserved for the MCP protocol.

## Personas

Use these starting points to seed agent context. Templates live in `.github/prompts/`; the primer is `data/context/bootstrap.md`.

| Persona | Focus | Starter prompt |
| --- | --- | --- |
| BASIC Agent | Commodore BASIC v2, PETSCII, simple I/O, printing | [.github/prompts/basic-program-session.prompt.md](.github/prompts/basic-program-session.prompt.md) |
| ASM Agent | 6502/6510 assembly, raster, sprites, IRQs | [.github/prompts/assembly-routine-session.prompt.md](.github/prompts/assembly-routine-session.prompt.md) |
| SID Composer | SID playback/composition, ADSR, waveforms | [.github/prompts/sid-music-session.prompt.md](.github/prompts/sid-music-session.prompt.md) |
| Drive Manager | Disk images, drive modes, resets | [.github/prompts/drive-management-session.prompt.md](.github/prompts/drive-management-session.prompt.md) |
| VIC Painter | PETSCII/bitmap art, sprites | [.github/prompts/petscii-art-session.prompt.md](.github/prompts/petscii-art-session.prompt.md) |
| Memory Debugger | RAM inspection, screen/colour RAM checks | Use `c64_memory` tools + `c64://specs/memory-map` |
