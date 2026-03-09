# VICE Support Review Plan

## Review Artifacts

- Issues report: `doc/reviews/vice-support-review.md`
- Scope basis: active PR `Extend VICE support` plus all VICE-related implementation, tests, docs, scripts, generated MCP interface files, and CI wiring

## Phases

### Phase 1: Scope and File Map
- [x] Capture active PR context and changed-file surface
- [x] Identify VICE-related source, tests, docs, scripts, schemas, and generated artifacts
- [x] Confirm the complete review set against the actual git diff from `main`

### Phase 2: Design and Wiring Review
- [x] Trace entry points, backend selection, and process lifecycle wiring
- [x] Trace MCP tool/module integration for VICE and debugger support
- [x] Compare VICE behavior against existing c64u conventions and abstractions
- [x] Check for partial wiring, unsupported paths presented as supported, and feature-parity gaps

### Phase 3: Implementation Review
- [x] Review `src/device.ts` VICE backend behavior end to end
- [x] Review `src/vice/viceClient.ts` protocol framing, parsing, and error handling
- [x] Review `src/vice/process.ts`, `src/vice/readiness.ts`, and supporting helpers
- [x] Review VICE-specific tools and grouped tool integrations
- [x] Review platform metadata, supported-platform declarations, and generated MCP interface consistency
- [x] Review concurrency, cleanup, retries, timeouts, and state management risks

### Phase 4: Test and Tooling Review
- [x] Review unit, integration, smoke, and mock-server tests for VICE support
- [x] Review test runner / matrix behavior, CI coverage, and dependency assumptions
- [x] Execute targeted validation commands/tests where feasible
- [x] Assess determinism, realism of mocks, and high-risk untested paths

### Phase 5: Documentation and Onboarding Review
- [x] Review README, developer docs, VICE docs, and planning docs for accuracy and completeness
- [x] Check examples, prerequisites, platform limitations, and onboarding clarity
- [x] Check generated MCP documentation and schemas for mismatches with runtime behavior

### Phase 6: Findings and Finalization
- [x] Record concrete evidence-backed findings with severity and remediation
- [x] Write final review report at `doc/reviews/vice-support-review.md`
- [x] Update this plan with completed tasks and a work log covering review actions and conclusions

## Explicit Review Themes

- Completeness
- Correctness
- Consistency with existing architecture and UX
- Duplication and simplification opportunities
- Type safety and schema quality
- Process lifecycle, cancellation, cleanup, and race conditions
- Platform assumptions and portability
- Security and shell / file handling risks
- Test coverage adequacy and regression detection power
- Documentation accuracy and discoverability
- CI/CD and dependency handling
- Long-term maintainability and likely failure modes

## Exit Criteria

- [x] `PLANS.md` reflects completed review work
- [x] `doc/reviews/vice-support-review.md` exists
- [x] The report contains concrete findings with evidence and remediation guidance
- [x] Test coverage adequacy is explicitly assessed
- [x] Documentation adequacy is explicitly assessed
- [x] Duplication, consistency, and architectural fit are explicitly assessed
- [x] Production-readiness verdict is explicit
- [x] Work log records what was reviewed, what was executed, and what remained unverified

## Work Log

- 2026-03-08: Collected active PR metadata, unresolved review comments, and a repository-wide VICE file map.
- 2026-03-08: Confirmed no local uncommitted changes; review is against the checked-out PR branch and repository state.
- 2026-03-08: Reviewed VICE backend implementation in `src/device.ts`, `src/vice/viceClient.ts`, `src/vice/process.ts`, and `src/vice/readiness.ts`.
- 2026-03-08: Reviewed grouped tool wiring, legacy tool modules, platform metadata, README compatibility tables, developer docs, CI workflow, and VICE-related tests.
- 2026-03-08: Ran targeted tests for grouped tool shims, program runners, and device behavior; result was 70 passed / 0 failed.
- 2026-03-08: Ran targeted runtime probes on platform `vice` using `node --loader ts-node/esm` and confirmed grouped operations declared c64u-only still execute on VICE (`c64_program.load_prg`, `c64_program.run_crt`, `c64_drive.load_rom`, `c64_disk.file_info`, `c64_sound.play_sid_file`, `c64_sound.play_mod_file`).
- 2026-03-08: Wrote final review report to `doc/reviews/vice-support-review.md` with production-readiness verdict of not production-ready.
- 2026-03-08: Began capture-surface refactor planning for grouped `capture_frame` and `capture_samples`, including removal of legacy `c64_vice.display_get` and improved spec-shaped mock C64U UDP streaming.

## Capture Refactor Plan

### Goal

Replace the VICE-only `display_get` debugger helper with grouped capture operations that fit the public MCP surface:

- `c64_graphics.capture_frame`
- `c64_sound.capture_samples`

The implementation should normalize results across backends where feasible, remove the unused legacy VICE op immediately, and make the mock C64U stream behavior mirror real control and UDP packet flow closely enough to exercise the new capture paths end to end.

### Tasks

- [x] Add backend/client capture primitives for normalized frame and sample capture
- [x] Implement `c64_graphics.capture_frame` with `count` defaulting to `1`
- [x] Implement `c64_sound.capture_samples` with `count` defaulting to `256`
- [x] Remove legacy `c64_vice.display_get`
- [x] Reuse C64U UDP stream packet parsing aligned to `c64commander` stream code and spec
- [x] Normalize VICE frame capture output to the shared grouped-tool response shape
- [x] Make mock C64U stream start/stop behavior and UDP packet emission match the real stream contract closely
- [x] Add unit and integration coverage for grouped tools, client/backend capture helpers, and mock streaming
- [x] Regenerate generated MCP artifacts if the public tool surface changes
- [x] Update README and any generated documentation that references the affected tool surface

### Work Log

- 2026-03-08: Added `src/streamCapture.ts` and wired normalized video/audio capture through `C64Client`, grouped tool registries, and MCP responses.
- 2026-03-08: Removed `c64_vice.display_get`, replaced it with grouped `c64_graphics.capture_frame`, and added grouped `c64_sound.capture_samples`.
- 2026-03-08: Updated the mock C64U server to emit spec-shaped UDP video/audio packets on stream start and aligned the VICE mock/display parsing with real BM packet structure.
- 2026-03-08: Added coverage in `test/streamCapture.test.mjs`, `test/mockC64StreamServer.test.mjs`, MCP integration tests, grouped-tool tests, and client coverage tests.
- 2026-03-08: Verified the refactor with `npm run build` and `npm run test:matrix` after regenerating the README and MCP snapshots.

## Phased Remediation Plan

This remediation plan is derived from the findings in `doc/reviews/vice-support-review.md`. The phases are ordered to restore API contract integrity first, then reconcile platform scope, then expand validation and documentation.

### Phase R0: Lock the Intended Support Matrix

Goal:

- [x] Decide which VICE capabilities are truly supported now, which are mock-only, and which remain unsupported in phase one.

Required decisions:

- [x] Decide whether VICE drive/resource-backed operations such as `list_drives`, `mount`, `unmount`, `power_on`, `power_off`, and `set_mode` are intended product features or temporary implementation experiments.
- [x] Decide whether grouped c64u-only operations that currently leak through on VICE should be blocked immediately or officially supported and documented.
- [x] Decide whether mock-only behaviors may appear in public compatibility tables before real-VICE validation exists.

Deliverables:

- [x] Produce a written source-of-truth support matrix checked into the repo.
- [x] Add a short decision note in `doc/` or the VICE developer docs defining `supported`, `mock-only experimental`, and `unsupported`.

Exit criteria:

- [x] Every disputed operation from VICE-001 and VICE-002 has an explicit intended status.
- [x] There is one authoritative place the implementation, tests, and docs will align to.

### Phase R1: Restore Runtime Contract Enforcement

Goal:

- [x] Make grouped-tool platform declarations authoritative at runtime.

Primary tasks:

- [x] Add per-operation platform enforcement to grouped dispatch so `operationPlatforms` is checked during execution, not only emitted as metadata.
- [x] Remove direct raw-handler bypasses where grouped operations currently skip the guarded module invocation path.
- [x] Ensure error shape is consistent with existing `unsupported_platform` responses.

Primary files:

- [x] `src/tools/types.ts`
- [x] `src/tools/registry/utils.ts`
- [x] `src/tools/registry/program.ts`
- [x] `src/tools/registry/drive.ts`
- [x] `src/tools/registry/disk.ts`
- [x] `src/tools/registry/sound.ts`

Acceptance tests:

- [x] Grouped `c64_program.load_prg` and `c64_program.run_crt` reject on VICE.
- [x] Grouped `c64_drive.load_rom` rejects on VICE unless R0 explicitly reclassifies it as supported.
- [x] Grouped `c64_disk.file_info` rejects on VICE unless R0 explicitly reclassifies it as supported.
- [x] Grouped `c64_sound.play_sid_file` and `c64_sound.play_mod_file` reject on VICE unless R0 explicitly reclassifies them as supported.

Exit criteria:

- [x] Runtime behavior matches grouped-tool metadata for every operation reviewed in VICE-001.
- [x] No grouped tool can bypass declared per-operation platform restrictions.

### Phase R2: Reconcile Backend Scope with Declared Platform Capabilities

Goal:

- [x] Eliminate the contradiction between backend support, grouped-tool surface, and platform capability metadata.

Primary tasks:

- [x] Align `src/platform.ts` with the actual intended VICE scope from R0.
- [x] Either remove unsupported grouped operations from the public VICE surface or implement the missing backend support behind real VICE behavior.
- [x] Normalize which operations are intentionally resource-backed on VICE and which are still c64u-only.

Primary files:

- [x] `src/platform.ts`
- [x] `src/device.ts`
- [x] Relevant grouped registry modules under `src/tools/registry/`
- [x] Any generated MCP metadata sources that derive compatibility tables

Acceptance tests:

- [x] Backend unsupported paths and grouped-tool compatibility no longer contradict each other.
- [x] Platform status output does not advertise `no-drive-management` if drive operations are intentionally supported on VICE.
- [x] Publicly exposed grouped operations have matching backend behavior.

Exit criteria:

- [x] The implementation tells one coherent story about VICE support.
- [x] VICE-002 is fully resolved by code and metadata, not just documentation.

### Phase R3: Close Test Coverage Gaps on the Public MCP Surface

Goal:

- [x] Make regressions in grouped-tool compatibility impossible to miss.

Primary tasks:

- [x] Add grouped-tool regression tests for every operation whose availability differs by platform.
- [x] Expand MCP call-tool tests to assert both success and `unsupported_platform` behavior consistently for VICE and c64u.
- [x] Separate mock-only expectations from real-VICE expectations so the suite does not silently promote mock behavior into public contract.

Primary files:

- [x] `test/groupedToolsShims.test.mjs`
- [x] `test/suites/mcpServerCallToolSuite.mjs`
- [x] `test/device.test.mjs`
- [x] `test/programRunnersModule.test.mjs`
- [x] Any VICE mock-server tests that currently encode disputed behavior

Acceptance tests:

- [x] Every grouped c64u-only operation has a VICE rejection test.
- [x] Every grouped VICE-supported operation has at least one positive path test.
- [x] Mock-only VICE behavior is not asserted as general VICE support in end-to-end MCP tests.

Exit criteria:

- [x] The suite fails immediately if grouped metadata and runtime behavior drift again.
- [x] VICE-003 is materially reduced by explicit grouped-contract coverage.

### Phase R4: Regenerate and Audit Public Documentation and MCP Metadata

Goal:

- [x] Make the published compatibility surface reflect the enforced runtime contract exactly.

Primary tasks:

- [x] Regenerate README compatibility tables and generated MCP interface artifacts after R1 and R2 are complete.
- [x] Update developer and VICE docs to distinguish real-device support, mock-only workflows, and unsupported operations.
- [x] Add a short support-status section that explicitly states the current VICE phase-one limits.

Primary files:

- [x] `README.md`
- [x] `doc/developer.md`
- [x] `doc/vice/**`
- [x] `mcp/tools.json`
- [x] `mcp/resources.json`
- [x] `mcp/prompts.json`
- [x] `mcp/server.json`

Acceptance tests:

- [x] README tables match runtime enforcement.
- [x] Generated MCP metadata no longer advertises operations whose runtime path disagrees.
- [x] Documentation does not rely on implied behavior from mocks.

Exit criteria:

- [x] VICE-004 is resolved.
- [x] A user reading the README and generated metadata would infer the same support matrix the runtime enforces.

### Phase R5: Run Full Validation and Decide Release Readiness

Goal:

- [x] Reassess production readiness after remediation, using the full matrix rather than targeted probes alone.

Primary tasks:

- [x] Run `npm run build`.
- [x] Run `npm run test:matrix`.
- [x] Re-run targeted real-VICE smoke and grouped compatibility checks.
- [x] Re-review any remaining mock-only areas and decide whether they block release or need explicit labeling.

Acceptance tests:

- [x] Full build passes.
- [x] Full matrix passes.
- [x] Targeted runtime probes no longer contradict metadata.

Exit criteria:

- [x] The branch can produce a single coherent answer to: what is supported on VICE, how is it enforced, how is it documented, and how is it tested?
- [x] Production-readiness is re-evaluated after remediation rather than assumed.

## Remediation Mapping

- VICE-001 maps primarily to R1 and R3.
- VICE-002 maps primarily to R0 and R2.
- VICE-003 maps primarily to R3 and R5.
- VICE-004 maps primarily to R4, but only after R1 and R2 are complete.

## Recommended Execution Order

1. Complete R0 before changing docs or generated metadata.
2. Complete R1 before attempting to “fix” README or MCP tables.
3. Complete R2 immediately after R1 so backend scope and capability metadata stop contradicting each other.
4. Complete R3 before calling the contract stabilized.
5. Complete R4 only after the enforced behavior is settled.
6. Use R5 as the release gate.

## Remediation Work Log

- 2026-03-08: Implemented central per-operation platform enforcement for grouped tools in `src/tools/types.ts` and preserved legacy `unsupported_platform` tool naming via `operationToolNames` mappings.
- 2026-03-08: Rewired grouped `c64_program` operations away from raw handler bypasses so grouped platform checks are authoritative at runtime.
- 2026-03-08: Aligned VICE platform metadata and public support status with the new authoritative matrix in `doc/vice/support-matrix.md`.
- 2026-03-08: Added grouped-tool, MCP, platform, VICE integration, README generator, and debugger/process regression tests covering the remediated contract.
- 2026-03-08: Ran `npm run build`, `npm run test:matrix`, and repeated three-leg coverage runs (`c64u/mock`, `vice/mock`, `vice/device`).
- 2026-03-08: Verified Bun's text coverage reporter includes the new VICE debugger/process coverage, but Bun's multi-file LCOV output still reports the previously observed merged line coverage value (`89.92%`) for those files. The code/test remediation is complete; the remaining gap is in producing a trustworthy merged LCOV artifact above the requested threshold.
