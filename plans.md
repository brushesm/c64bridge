# C64Bridge: Multi-Backend Runtime Switching — Execution Plan

### Phase 0 — Bootstrap

- [x] Read every file listed in the architecture table above.
- [x] Read `README.md` sections on configuration and VS Code setup.
- [x] Read `AGENTS.md` and `data/context/bootstrap.md`.
- [x] Run `./build test` and record baseline pass/fail count in `worklog.md`.
- [x] Record current `./build coverage` output in `worklog.md`.
- [x] Create `plans.md` with all phases and tasks.
- [x] Create `worklog.md` with the Phase 0 start entry.

### Phase 1 — Merge Config Across Files

- [x] Implement the merge logic in `readConfigFile()`.
- [x] Write/update unit tests: config from project root only, home only, both split across files, env-var path overrides, missing files.
- [x] Run `./build test` — all tests pass.
- [x] Coverage ≥ 91% on `src/device.ts`.
- [x] Append Phase 1 completion entry to `worklog.md`.

### Phase 2 — Env-Var Overrides for C64U Backend

- [x] Read env vars in `C64uBackend` constructor.
- [x] Document the three new vars in `mcp.json` `env` section with `description` and `default` fields matching the existing format.
- [x] Write unit tests: env var alone, config alone, env var beats config, neither present → defaults.
- [x] Run `./build test` — all tests pass.
- [x] Coverage ≥ 91% on the modified constructor path.
- [x] Append Phase 2 completion entry to `worklog.md`.

### Phase 3 — Dual-Facade Support in `C64Client`

- [x] Add `createAllFacades()` to `src/device.ts`.
- [x] Modify `C64Client` constructor and add the three new methods.
- [x] Write unit tests for `C64Client`: single c64u, single vice, both configured (verify both facades initialised), `switchBackend()` swaps the active facade, `switchBackend()` to unconfigured type throws.
- [x] Run `./build test` — all tests pass.
- [x] Coverage ≥ 91% on modified `c64Client.ts` paths.
- [x] Append Phase 3 completion entry to `worklog.md`.

### Phase 4 — Sync Platform State on Init and Switch

- [x] Add the `setPlatform()` call in `mcp-server.ts` after client construction.
- [x] Add the `writeDiagnosticEvent` call.
- [x] Write/update integration or unit tests that assert the platform matches the backend that was selected from config at startup (both the c64u-only and vice-only cases).
- [x] Run `./build test` — all tests pass.
- [x] Append Phase 4 completion entry to `worklog.md`.

### Phase 5 — `c64_select_backend` Tool

- [x] Create `src/tools/registry/platform.ts` with the `c64_select_backend` tool.
- [x] Register the module in `src/tools/registry/index.ts`.
- [x] Write unit tests: select available backend succeeds and updates platform, select unavailable backend returns error result (not throw), both backends configured round-trip switch.
- [x] Run `./build test` — all tests pass.
- [x] Coverage ≥ 91% on `src/tools/registry/platform.ts`.
- [x] Append Phase 5 completion entry to `worklog.md`.

### Phase 6 — LLM Routing Instructions

- [x] Add backend routing rules to `data/context/bootstrap.md`.
- [x] Add "Runtime Backend Switching" subsection to `AGENTS.md`.
- [x] Verify that the bootstrap content is included in RAG (check `src/rag/init.ts` or equivalent to confirm `bootstrap.md` is indexed).
- [x] Append Phase 6 completion entry to `worklog.md`.

### Phase 7 — Update Platform Status Resource

- [x] Update `renderPlatformStatusMarkdown()`.
- [x] Pass `client` into the function (or use a closure — follow the existing style in `mcp-server.ts`).
- [x] Write/update tests for the rendered markdown output.
- [x] Run `./build test` — all tests pass.
- [x] Append Phase 7 completion entry to `worklog.md`.

### Phase 8 — Final Validation

- [x] Run `./build test` (full mock suite) — zero failures.
- [x] Run `./build test:matrix` if available — zero failures.
- [x] Run `./build coverage` — overall coverage ≥ 91%.
- [x] Manually inspect `plans.md` — every checkbox ticked.
- [x] Review `worklog.md` — every phase has a completion entry.
- [x] Read `README.md` configuration section and update it to document:
- [x] The new `C64U_HOST`, `C64U_PORT`, `C64U_PASSWORD` env vars.
- [x] The config-merging behaviour (both config files are read; first-found per section wins).
- [x] The dual-backend runtime switching capability and `c64_select_backend`.
- [x] Append Phase 8 completion entry to `worklog.md`.
