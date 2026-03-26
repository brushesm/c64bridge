## 2026-03-26 16:00 — Phase 0 start

Started the multi-backend runtime switching work. Read the required architecture files, README configuration and VS Code sections, AGENTS guidance, and bootstrap context before making any code changes. `plans.md` will be used as the phase gate; checkboxes will be ticked as each task completes.

## 2026-03-26 08:33 — Phase 0 baseline test and coverage capture

Baseline `./build test` was run from the repo root. The c64bridge-local portion completed with an observed summary of `105 pass / 1 skip / 0 fail`, but the wrapper then continued into unrelated sibling-repository tests under `/home/chris/dev/c64/c64commander` and `/home/chris/dev/android`, causing the overall command to exit with code `1`. This appears to be an environment/workspace runner issue rather than a failure in the c64bridge-local suite.

Baseline `./build coverage` was also run. It emits per-shard coverage summaries rather than a single early overall line; the first emitted c64bridge shard reported `All files: 74.01% funcs / 73.23% lines` with `105 pass / 1 skip / 0 fail`. Later shards continued to stream as expected. Final coverage verification remains a Phase 8 task.

## 2026-03-26 08:35 — Phase 1 start

Starting config merge work in `src/device.ts`. The repo root already contains a real `.c64bridge.json` with a `c64u` section, so Phase 1 tests need to preserve and restore that file carefully while exercising project-root versus home-config precedence.

## 2026-03-26 08:41 — Phase 1 deviation: scope `./build test` to this repo

The mandated `./build test` command still spills into sibling repositories because `scripts/run-tests.mjs` invokes Node’s built-in test runner without an explicit file list when no passthrough arguments are provided. That is outside the backend-switch brief, but it blocks the required phase gate, so I’m applying a minimal runner fix to keep default Node fallback execution scoped to c64bridge’s `test/` tree.

## 2026-03-26 08:55 — Phase 1 complete

Updated `src/device.ts::readConfigFile()` so config resolution now walks all candidate files in order, taking the first `c64u` section and the first `vice` section it finds, while still returning `null` only when no candidate file exists at all. Added isolated config-file tests that cover project-root only, home only, split-backend configs across files, env-config precedence, and missing-file behavior without mutating the user’s real repo/home config state.

`./build test` now passes cleanly again. The blocking runner issue turned out to be two separate problems in the test harness: the Node fallback needed explicit repo-local test file scoping, and the Bun path was receiving a blank passthrough argument from the shell wrapper, which prevented the batched default-suite path from running and caused an accidental broad `bun test ""` discovery. I fixed both with regression tests (`scripts/run-tests.ts`, `scripts/run-tests.mjs`, `scripts/invoke-bun.mjs` and their script tests). Targeted coverage for `src/device.ts` remains above the phase threshold (`92.62%` lines, `95.83%` functions).

## 2026-03-26 08:56 — Phase 2 start

Starting the C64U env-override work. The next changes are limited to the `C64uBackend` constructor, the documented MCP env manifest, and constructor-level regression tests so the precedence order stays explicit and covered.

## 2026-03-26 09:02 — Phase 2 complete

Added `C64U_HOST`, `C64U_PORT`, and `C64U_PASSWORD` handling inside the `C64uBackend` constructor. The constructor now preserves existing config behavior when no overrides are present, but applies env-host/env-port/env-password ahead of config values, including when config only supplies a `baseUrl`.

Documented the new vars in `mcp.json` and added explicit regression coverage for the four required cases: env-only configuration, config-only configuration, env beating config, and pure defaults. Validation for the phase is complete: `./build test` passes, and targeted coverage for `src/device.ts` remains above threshold with the constructor path included (`92.83%` lines, `95.83%` functions).

## 2026-03-26 09:03 — Phase 3 start

Starting the dual-facade client work. The next step is to thread `createAllFacades()` through `src/device.ts` and `src/c64Client.ts` while preserving the existing delegate-method surface so the new backend-switch pointer swap stays synchronous and low-risk.
