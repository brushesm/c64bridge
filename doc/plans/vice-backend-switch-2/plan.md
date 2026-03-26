# VICE Backend Switch 2

## Goal

Make backend switching feel instantaneous in normal LLM-driven use, keep both backends available in one MCP session, and make visible VICE execution match what the MCP server reads programmatically.

## Phase 1: Deterministic VICE Launch

- Detect and use a valid VICE resource directory automatically instead of assuming the emulator can locate ROMs by itself.
- Allow explicit VICE resource-directory overrides for local setups that install binaries and ROM assets in different prefixes.
- Keep visible desktop launches on the user display by default and avoid silent fallback to hidden sessions unless explicitly requested.
- Add launcher coverage for resource-directory forwarding and startup argument construction.

## Phase 2: Always-Ready Mixed Backend Runtime

- Make the MCP runtime provision both backends inside one `C64Client` when the session can reasonably address both.
- Ensure a VICE-first session can still switch to C64U without restarting the MCP server or editing config files mid-session.
- Preserve platform gating so tools still report accurate compatibility after a switch.
- Add tests for backend availability and switch behavior in split-config and VICE-first scenarios.

## Phase 3: Instant Switch Path

- Warm available backends eagerly after MCP startup so the first post-switch tool call does not pay process-start or probe penalties.
- Serialize VICE monitor access so concurrent tool calls cannot double-start VICE or race the single-client Binary Monitor transport.
- Keep `c64_select_backend` as a local state change only: no probing, no process launch, no extra round trips.
- Add tests for eager warmup behavior and race-free VICE access where feasible.

## Phase 4: End-to-End Validation

- Validate the MCP flow exactly as an LLM would use it: switch backend, run BASIC, read the screen, switch back, repeat.
- Measure switch-plus-run behavior and confirm the steady-state switch path stays under two seconds on this machine.
- Confirm that VICE visibly shows the same BASIC screen state that MCP reports from screen RAM.
- Update user-facing docs and config metadata for the new VICE launch controls.

## Phase 5: Environment Override Consistency

- Ensure every documented runtime environment variable in `mcp.json` is actually honored when the server is launched from a user-provided MCP client config such as `.vscode/mcp.json`.
- Make the override model consistent: environment variable override first, merged JSON config next when applicable, built-in defaults last.
- Keep a generated README table of all supported runtime environment variables, their defaults, and any JSON config key they override.
- Add concrete `.vscode/mcp.json` examples so it is obvious which settings are env-only flags and which map to JSON config fields.

## Success Criteria

- `c64_select_backend` returns immediately for already provisioned backends.
- A VICE-configured session can switch to C64U and back without restarting the server.
- VICE starts visibly on the desktop with a usable C64 screen instead of an inert grey window caused by missing resources.
- `vice: run HELLO WORLD` and `c64u: run HELLO WORLD` both work through the grouped MCP tools.
- Repeated backend switches in one MCP session remain stable and do not spawn duplicate VICE processes.