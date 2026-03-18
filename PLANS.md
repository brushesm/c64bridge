# VICE Stabilization Execution Plan

Authoritative execution plan for completing and stabilizing VICE support on branch `feat/vice`.

## Goals

- Ensure every grouped MCP tool marked as supporting VICE has a real, correct VICE implementation.
- Ensure grouped support metadata matches runtime behavior.
- Stabilize tests and remove nondeterminism in VICE coverage.
- Finish with green build, green test matrix, and documented verification evidence.

## Phase 1 - Repository Reconnaissance

- [x] Identify all grouped MCP tools exposed by the server
- [x] Identify declared support for each grouped tool
- [x] Map grouped tools to implementation locations
- [x] Map grouped tools to primary test coverage
- [ ] Confirm current failing baseline with build and full matrix

### Grouped Tool Audit Table

| Tool | Declared Support | Implementation Location | Tests | Notes |
| --- | --- | --- | --- | --- |
| `c64_program` | BOTH with VICE exclusions for `load_prg`, `run_crt`, `bundle_run` | `src/tools/registry/program.ts`, `src/tools/programRunners.ts`, `src/tools/meta/index.ts`, `src/c64Client.ts`, `src/device.ts` | `test/groupedToolsShims.test.mjs`, `test/suites/mcpServerCallToolSuite.mjs`, `test/programRunnersModule.test.mjs`, `test/device.test.mjs` | VICE path relies on `runPrgFile`, BASIC upload, ASM upload, and meta batch workflows. |
| `c64_memory` | BOTH | `src/tools/registry/memory.ts`, `src/tools/memory.ts`, `src/c64Client.ts`, `src/device.ts` | `test/groupedToolsShims.test.mjs`, `test/suites/mcpServerCallToolSuite.mjs`, `test/device.test.mjs`, `test/toolsTypes.test.mjs` | Shared memory abstraction; VICE should resolve through monitor-backed memory I/O. |
| `c64_sound` | BOTH with VICE exclusions for `capture_samples`, `play_sid_file`, `play_mod_file`, `pipeline`, `analyze`, `record_analyze` | `src/tools/registry/sound.ts`, `src/tools/audio.ts`, `src/tools/meta/index.ts`, `src/c64Client.ts`, `src/device.ts` | `test/groupedToolsShims.test.mjs`, `test/suites/mcpServerCallToolSuite.mjs`, `test/audioModule.test.mjs`, `test/device.test.mjs` | VICE-supported surface is register-level SID control plus generation and compile-play workflows. |
| `c64_system` | BOTH with VICE exclusions for `pause`, `resume`, `menu` | `src/tools/registry/system.ts`, `src/tools/machineControl.ts`, `src/tools/meta/index.ts`, `src/c64Client.ts`, `src/device.ts` | `test/groupedToolsShims.test.mjs`, `test/suites/mcpServerCallToolSuite.mjs`, `test/device.test.mjs` | Task lifecycle flows through grouped system and meta modules. |
| `c64_graphics` | BOTH | `src/tools/registry/graphics.ts`, `src/tools/graphics.ts`, `src/c64Client.ts`, `src/device.ts`, `src/streamCapture.ts` | `test/groupedToolsShims.test.mjs`, `test/suites/mcpServerCallToolSuite.mjs`, `test/graphicsModule.test.mjs`, `test/streamCapture.test.mjs`, `test/device.test.mjs` | Includes normalized frame capture plus PETSCII, sprite, and bitmap rendering. |
| `c64_rag` | BOTH | `src/tools/registry/rag.ts`, `src/tools/rag.ts`, `src/rag/**/*` | `test/groupedToolsShims.test.mjs`, `test/suites/mcpServerCallToolSuite.mjs` | Platform-neutral; included for completeness in the full audit. |
| `c64_disk` | BOTH with VICE exclusions for `file_info`, `create_image`, `find_and_run` | `src/tools/registry/disk.ts`, `src/tools/storage.ts`, `src/tools/meta/index.ts`, `src/c64Client.ts`, `src/device.ts` | `test/groupedToolsShims.test.mjs`, `test/suites/mcpServerCallToolSuite.mjs`, `test/device.test.mjs` | VICE contract includes `list_drives`, `mount`, `unmount`. |
| `c64_drive` | BOTH with VICE exclusion for `load_rom` | `src/tools/registry/drive.ts`, `src/tools/storage.ts`, `src/c64Client.ts`, `src/device.ts` | `test/groupedToolsShims.test.mjs`, `test/suites/mcpServerCallToolSuite.mjs`, `test/device.test.mjs` | VICE contract includes reset, power, and mode operations. |
| `c64_printer` | C64U only | `src/tools/registry/printer.ts`, `src/tools/printer.ts`, `src/c64Client.ts`, `src/device.ts` | `test/groupedToolsShims.test.mjs`, `test/suites/mcpServerCallToolSuite.mjs` | Out of VICE implementation scope except metadata verification. |
| `c64_config` | BOTH with VICE exclusions for flash, debugreg, and shuffle operations | `src/tools/registry/config.ts`, `src/tools/developer.ts`, `src/tools/meta/index.ts`, `src/tools/meta/configInventory.ts`, `src/c64Client.ts`, `src/device.ts` | `test/groupedToolsShims.test.mjs`, `test/suites/mcpServerCallToolSuite.mjs`, `test/developerModule.test.mjs`, `test/device.test.mjs` | VICE support is resource-backed rather than REST-backed. |
| `c64_extract` | C64U only | `src/tools/registry/extract.ts`, `src/tools/extract.ts`, `src/tools/meta/index.ts` | `test/groupedToolsShims.test.mjs` | Verify metadata/runtime rejection only. |
| `c64_stream` | C64U only | `src/tools/registry/stream.ts`, `src/tools/streaming.ts`, `src/c64Client.ts`, `src/device.ts`, `src/streamCapture.ts` | `test/groupedToolsShims.test.mjs`, `test/suites/mcpServerCallToolSuite.mjs`, `test/streamCapture.test.mjs` | Verify metadata/runtime rejection only on VICE. |
| `c64_debug` | VICE only | `src/tools/debug.ts`, `src/c64Client.ts`, `src/vice/viceClient.ts`, `src/device.ts` | `test/groupedToolsShims.test.mjs`, `test/viceModule.test.mjs`, `test/viceClient.test.mjs`, `test/viceIntegration.test.mjs` | Core VICE debugger surface; highest-risk VICE-only module. |
| `c64_vice` | VICE only | `src/tools/vice.ts`, `src/c64Client.ts`, `src/vice/viceClient.ts`, `src/device.ts` | `test/groupedToolsShims.test.mjs`, `test/viceModule.test.mjs`, `test/viceClient.test.mjs`, `test/viceIntegration.test.mjs` | Safe VICE resource get and set surface. |

## Phase 2 - VICE Capability Mapping

- [x] Identify VICE abstraction layers used by the repository
- [x] Identify how process startup and readiness are handled
- [x] Identify how monitor commands, memory, and resources are accessed
- [ ] Confirm file mounting, keyboard or program injection, execution control, and snapshot behavior against implementation
- [ ] Record deterministic test risks from process lifecycle and monitor readiness

### Current Capability Map

- Primary abstraction layer: `ViceBackend` in `src/device.ts`.
- Monitor transport: `ViceClient` in `src/vice/viceClient.ts`.
- Process orchestration: `src/vice/process.ts`.
- Startup and readiness validation: `src/vice/readiness.ts` via `waitForBasicReady`.
- Backend selection: `createFacade(...)` in `src/device.ts`, consumed by `C64Client`.
- Program execution on VICE: PRG upload or run and BASIC or ASM upload eventually flow through `C64Client` to `ViceBackend` and monitor-backed execution.
- Memory inspection and mutation on VICE: monitor-backed reads and writes through `ViceBackend.readMemory` and `ViceBackend.writeMemory`.
- Execution control on VICE: reset, reboot, poweroff, debugger stepping, and checkpoints via `ViceBackend` plus `ViceClient` monitor commands.
- Drive operations on VICE: implemented in `ViceBackend` and exposed through shared storage and grouped drive tools.
- Config operations on VICE: implemented via VICE resources rather than C64U REST config endpoints.
- Frame capture on VICE: normalized through grouped graphics capture and backend or client helpers.
- Audio sample capture: currently C64U-only by contract.

## Phase 3 - Tool Implementation Audit

- [ ] Audit `c64_program` VICE operations end to end
- [ ] Audit `c64_memory` VICE operations end to end
- [ ] Audit `c64_sound` VICE-supported operations end to end
- [ ] Audit `c64_system` VICE-supported operations end to end
- [ ] Audit `c64_graphics` VICE operations end to end
- [ ] Audit `c64_disk` and `c64_drive` VICE operations end to end
- [ ] Audit `c64_config` VICE operations end to end
- [ ] Audit `c64_debug` and `c64_vice` end to end
- [ ] Record all mismatches between metadata, implementation, and tests

### Audit Criteria

- Concrete VICE implementation exists.
- Grouped operation reaches the correct backend or client method.
- Backend behavior is semantically correct for VICE.
- Unsupported operations fail with `unsupported_platform` instead of leaking through.
- Error handling is deterministic and testable.
- Positive and negative paths are covered by tests.

## Phase 4 - Gap Closure

- [ ] Implement missing VICE logic where metadata promises support
- [ ] Reclassify operations if real VICE support does not exist or is not realistic
- [ ] Refactor duplicated backend logic if needed to stabilize behavior
- [ ] Add regression tests for every fix

## Phase 5 - Test Stabilization

- [ ] Capture current failing tests and root causes
- [ ] Eliminate race conditions and nondeterministic startup timing
- [ ] Ensure reliable emulator lifecycle setup and teardown
- [ ] Re-run affected tests repeatedly until stable

## Phase 6 - Coverage Validation

- [ ] Measure affected-module coverage after fixes
- [ ] Add success and failure-path tests where coverage is weak
- [ ] Confirm affected modules meet repository standard

## Phase 7 - CI Repair

- [ ] Run `npm run build`
- [ ] Run `npm run test:matrix`
- [ ] Run targeted repeated VICE-sensitive tests
- [ ] Confirm final green status and record results

## Observations and Discoveries

- The repository already contains a public VICE source-of-truth document at `doc/vice/support-matrix.md`.
- Grouped-tool runtime enforcement is already implemented in `src/tools/types.ts` using `operationPlatforms`.
- VICE support is concentrated in `src/device.ts`, `src/c64Client.ts`, and `src/vice/*`; grouped registries mainly route into existing modules.
- The highest-risk areas for semantic drift are shared storage, config, and program operations whose grouped surface is BOTH but whose backend semantics differ substantially between C64U and VICE.
- `c64_debug` and `c64_vice` already have dedicated unit and integration coverage, but they still need validation against the current full matrix and repeated runs.
- TODO: Keep CI and automation on Node.js LTS majors only. Stay on Node 24 for now, ignore non-LTS Node 25 upgrade churn from Dependabot or similar automation, and plan the next runtime bump directly to Node 26 once it is the active LTS.

## Verification Results

- Pending initial baseline build.
- Pending initial full matrix run.
- Pending repeated VICE-sensitive test runs.

## Work Log

- 2026-03-09: Replaced the prior review-only plan with this execution plan for the stabilization task.
- 2026-03-09: Loaded repository memory and confirmed the repo source of truth points to `doc/vice/support-matrix.md` and grouped platform checks in `src/tools/types.ts`.
- 2026-03-09: Mapped grouped MCP tools from `src/tools/registry/index.ts` and identified the 14 public grouped tools currently exposed.
- 2026-03-09: Confirmed declared platform support from grouped registry modules and `doc/vice/support-matrix.md`.
- 2026-03-09: Mapped primary grouped-tool coverage to `test/groupedToolsShims.test.mjs`, `test/suites/mcpServerCallToolSuite.mjs`, `test/device.test.mjs`, and the dedicated VICE module tests.
- 2026-03-09: Identified the main VICE execution stack as `src/device.ts` -> `src/c64Client.ts` -> `src/vice/viceClient.ts` with process or readiness helpers in `src/vice/process.ts` and `src/vice/readiness.ts`.
- 2026-03-09: Next step is baseline verification using `npm run build` and `npm run test:matrix`, followed by focused remediation of any failing or weakly covered VICE paths.

## Final Summary

To be completed at the end of execution with:

- tools audited
- issues discovered
- fixes implemented
- tests added
- final CI status
