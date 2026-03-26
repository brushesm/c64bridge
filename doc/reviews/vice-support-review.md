# VICE Support Review

Date: 2026-03-08
Reviewer: GitHub Copilot
Scope: PR #103 (`feat/vice`) plus all VICE-related source, grouped tools, tests, docs, generated MCP interface metadata, and CI wiring.

## Verdict

Not production-ready.

The branch introduces useful VICE backend work, but the published MCP compatibility contract is not trustworthy yet. The highest-risk issue is that grouped-tool per-operation platform metadata is not enforced centrally, so several operations declared as c64u-only execute on VICE anyway. That breaks the generated MCP surface, README compatibility tables, and the implied contract relied on by clients and prompts.

## Findings

### VICE-001: Grouped per-operation platform support is metadata-only, and multiple c64u-only operations execute on VICE anyway

- Severity: high
- Confidence: high

Evidence:

- `src/tools/types.ts:296` publishes `operationPlatforms` into metadata, but `defineToolModule().invoke()` only checks the merged tool-level platforms at `src/tools/types.ts:316-317`.
- `src/tools/registry/program.ts:110` declares `load_prg` and `run_crt` as c64u-only, but `src/tools/registry/program.ts:29` and `src/tools/registry/program.ts:47` wire them directly to raw handlers (`groupedProgramHandlers.load_prg` / `run_crt`) instead of routing through `programRunnersModule.invoke()`.
- The raw handlers themselves do not perform a platform check. `executeLoadPrg()` and `executeRunCrt()` in `src/tools/programRunners.ts:634` and `src/tools/programRunners.ts:701` call the client directly.
- Runtime probe on VICE using `node --loader ts-node/esm` showed both grouped operations succeed instead of raising `unsupported_platform`:

```text
{"called":"loadPrgFile","path":"//USB0/demo.prg"}
{"op":"load_prg","isError":false,"error":null,"success":true}
{"called":"runCrtFile","path":"//USB0/game.crt"}
{"op":"run_crt","isError":false,"error":null,"success":true}
```

- The same pattern exists in other grouped tools:
  - `src/tools/registry/drive.ts:89` marks `load_rom` c64u-only, but `src/tools/storage.ts:454` has no per-tool platform restriction. Runtime probe on VICE succeeded.
  - `src/tools/registry/disk.ts:365` marks `file_info` c64u-only, but `src/tools/storage.ts:542` has no per-tool platform restriction. Runtime probe on VICE succeeded.
  - `src/tools/registry/sound.ts:156-157` marks `play_sid_file` / `play_mod_file` c64u-only, but `src/tools/audio.ts:770` and `src/tools/audio.ts:811` have no per-tool platform restriction. Runtime probe on VICE succeeded.

Why this matters:

- MCP clients, generated schemas, prompts, and README tables will all believe those operations are unavailable on VICE, while runtime execution may still proceed.
- The failure mode is especially dangerous because it is silent contract drift, not an obvious exception.
- The current design makes correctness depend on whether a grouped operation happens to route through a legacy tool that already has its own per-tool platform guard.

Recommended fix:

- Enforce `operationPlatforms` inside the grouped dispatcher path rather than treating it as documentation-only metadata.
- Avoid raw handler reuse for grouped operations when the original module-level invocation path is responsible for platform checks.
- Add explicit grouped-tool tests for every c64u-only operation exposed through grouped tools on the VICE platform.

### VICE-002: Capability declarations, implementation, tests, and docs disagree on whether VICE supports drive and storage management

- Severity: high
- Confidence: high

Evidence:

- `src/platform.ts:31` declares VICE limited by `no-drive-management`.
- The backend itself still rejects several storage/drive operations on VICE:
  - `src/device.ts:625` rejects `driveLoadRom`
  - `src/device.ts:681` rejects `filesInfo`
  - `src/device.ts:682-685` reject disk-image creation
- These unsupported backend paths are covered by tests in:
  - `test/device.test.mjs:247` (`driveLoadRom throws unsupported`)
  - `test/device.test.mjs:308` (`filesInfo throws unsupported`)
- Yet the grouped MCP suite expects success for grouped VICE drive/storage calls that the public compatibility tables mark as unavailable on VICE:
  - `test/suites/mcpServerCallToolSuite.mjs:239` expects `c64_drive` `load_rom` success
  - `test/suites/mcpServerCallToolSuite.mjs:255` expects `c64_disk` `file_info` success
- README compatibility tables currently mark those operations as unavailable on VICE:
  - `README.md:297` `file_info`
  - `README.md:309` `load_rom`

Why this matters:

- The codebase currently contains three mutually inconsistent stories:
  1. Platform metadata says VICE has no drive management.
  2. The grouped runtime can still execute selected drive/storage operations on VICE.
  3. The raw backend still rejects a substantial subset of drive/storage operations on VICE.
- This inconsistency makes it impossible to reason safely about platform parity or to generate correct client behavior.

Recommended fix:

- Decide whether VICE drive/storage support is a real supported feature or a phase-one experiment.
- If it is supported, remove the stale `no-drive-management` limitation, align docs, and add real-device coverage.
- If it is not supported, close the grouped-tool escape hatches and update the tests that currently encode success on VICE.

### VICE-003: Real VICE coverage is materially weaker than the published feature surface, and mock-only behavior is being presented as platform support

- Severity: medium
- Confidence: high

Evidence:

- In `test/device.test.mjs`, the resource-backed drive/config tests only run under `useViceMock`:
  - drive tests are guarded under the mock-only block starting near `test/device.test.mjs:187`
  - config read/write tests are also guarded under the mock-only block starting near `test/device.test.mjs:269`
- The same file only verifies unsupported behavior for the real-VICE path on several operations (`loadPrgFile`, `runCrtFile`, `sidplayFile`, `driveLoadRom`, `filesInfo`, flash config operations).
- CI does run both VICE mock tests and VICE device tests (`.github/workflows/build-and-test.yaml:24-31`), but the real-device job does not prove the full grouped feature matrix claimed in README or generated metadata.
- My targeted existing test run passed cleanly (`70 passed / 0 failed`) even though the grouped-tool contract violations above are real. That means the current suite is not protecting the public grouped MCP surface sufficiently.

Why this matters:

- The mock server is currently doing more than emulating a thin transport boundary. It is effectively defining platform behavior for features that are not yet validated on real VICE.
- The branch therefore risks shipping mock-server parity instead of real emulator parity.

Recommended fix:

- Split the VICE matrix into clearly labeled categories: real-device supported, mock-only experimental, and unsupported.
- Add grouped-tool regression tests for the actual public MCP operations on VICE, not just backend/facade tests.
- Avoid advertising VICE support in README/generated tables for operations that have only been validated against the mock server.

### VICE-004: The README and generated compatibility surface overstate confidence in VICE support

- Severity: medium
- Confidence: high

Evidence:

- README currently presents a crisp compatibility matrix for grouped tools, including VICE columns for operations such as:
  - `README.md:367-368` `load_prg`, `run_crt`
  - `README.md:394-395` `play_mod_file`, `play_sid_file`
  - `README.md:297` `file_info`
  - `README.md:309` `load_rom`
- Because `operationPlatforms` is not authoritative at runtime, the tables are currently descriptive rather than contractual.
- The generated MCP tool metadata is built from the same source of truth, so this drift is not isolated to the README.

Why this matters:

- Consumers will treat those tables and generated schemas as API contract, not as aspirational guidance.
- When the documented matrix diverges from live runtime behavior, automation and prompts become unsafe.

Recommended fix:

- Treat generated compatibility output as release-blocking and validate it with runtime tests.
- Do not publish per-operation platform tables until grouped dispatch enforces them.

## Validation Performed

- Reviewed implementation across `src/device.ts`, `src/vice/viceClient.ts`, `src/vice/process.ts`, `src/vice/readiness.ts`, grouped tool registries, legacy tool modules, docs, CI, and tests.
- Ran targeted tests:

```text
runTests: test/groupedToolsShims.test.mjs
runTests: test/programRunnersModule.test.mjs
runTests: test/device.test.mjs
Result: 70 passed, 0 failed
```

- Ran targeted runtime probes with `node --loader ts-node/esm` against the checked-out TypeScript sources on platform `vice`.
- Confirmed that grouped `c64_program.load_prg`, `c64_program.run_crt`, `c64_drive.load_rom`, `c64_disk.file_info`, `c64_sound.play_sid_file`, and `c64_sound.play_mod_file` execute successfully on VICE despite being declared c64u-only in grouped tool metadata.

## Coverage Assessment

Coverage is not sufficient for the grouped public MCP contract.

- Strengths:
  - Core VICE monitor protocol parsing and request/response handling are exercised well.
  - The VICE smoke test covers basic run-and-readiness flow.
  - Some backend unsupported paths are explicitly tested.

- Gaps:
  - The grouped MCP operations are not exhaustively tested against their per-operation platform declarations.
  - Real-VICE coverage does not match the feature surface advertised in grouped tool metadata and README.
  - Several regressions are only detectable with end-to-end grouped-tool invocation, not backend-only tests.

## Documentation Assessment

Documentation is not yet reliable enough for release.

- The README compatibility matrix is more precise than the runtime enforcement actually is.
- `platform.ts` still advertises `no-drive-management` for VICE while grouped docs/tests/runtime partially expose drive operations.
- The branch needs a single explicit statement of what is supported on real VICE, what is mock-only, and what remains phase-one unsupported.

## Duplication and Architectural Fit

- The broad `C64Facade` abstraction remains workable, but VICE support is currently split across backend restrictions, grouped metadata, README generation, and mock-server behavior without a single authoritative enforcement point.
- The highest-value simplification is to move per-operation platform enforcement into one place in grouped dispatch and make documentation generation consume that authoritative runtime rule.

## What I Did Not Fully Verify

- I did not run the full `npm run test:matrix` or a full build during this review.
- I did not validate every drive/config resource behavior against a real installed VICE instance.
- I did not audit every generated file under `mcp/` line-by-line after tracing the metadata source.

Those limitations do not change the main verdict because the highest-severity issues were verified directly in source and with targeted runtime probes.