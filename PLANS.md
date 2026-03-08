# VICE Backend Feature Completion Plan

**Branch**: `feat/vice`  
**Created**: 2026-03-08  
**Status**: Complete ✅

---

## 1. Scope

Extend the `feat/vice` branch so that the C64 Bridge MCP server supports the VICE emulator as a backend with maximal feature parity. The implementation maps the current MCP tool surface onto VICE functionality, primarily using VICE's Binary Monitor (BM) protocol.

---

## 2. Assumptions

1. VICE Binary Monitor (BM) is the primary interface — not the text monitor. BM is the TCP binary protocol exposed via `-binarymonitor`.
2. For operations that VICE genuinely cannot support (hardware-specific like printers, streaming), we mark them explicitly as c64u-only and skip tests on VICE.
3. Feature parity is defined as: all operations that VICE is technically capable of performing are implemented; hardware-only operations are explicitly documented as unsupported.
4. Tests are `.mjs` format using the custom `#test/runner` harness.
5. Coverage target: ≥90% for all files touched by this feature.

---

## 3. Multi-Phase Plan

### Phase 1: Branch Recovery & Build Fix ✅
- Merge `origin/main` into `feat/vice`
- Resolve merge conflicts in 5 files
- Fix TypeScript `Buffer<ArrayBufferLike>` incompatibility in `mockServer.ts` and `viceClient.ts`
- Fix `PendingRequest.cmd` field naming mismatch between tests and implementation

### Phase 2: Test Triage & Platform Declarations ✅
- Identified all failing VICE-mode tests: disk/drive (32), printer (5), toolsRegistry (1), developer (1), file creation (9)
- Updated `supportedPlatforms` in all tool registry entries
- Added `operationPlatforms` per-op overrides for c64u-only operations
- Added C64U/VICE columns to auto-generated README tools table

### Phase 3: VICE Disk & Drive Operations ✅
- Implemented `drivesList()`, `driveMount()`, `driveRemove()`, `driveReset()`, `driveOn()`, `driveOff()`, `driveSetMode()` in `ViceBackend`
- Wired via `resourceSet`/`resourceGet` BM commands (Drive{N}CPUEnabled, Drive{N}Image, Drive{N}Type)
- Added VICE support to disk/drive tool registry entries

### Phase 4: VICE Config Operations via Resources ✅
- Implemented `configsList()`, `configGet()`, `configSet()`, `configBatchUpdate()` in `ViceBackend`
- Wired via `ViceClient.resourceGet()` and `resourceSet()`
- snapshot/restore/diff delegate to meta tool using VICE resource reads/writes
- Flash/snapshot/debugreg config ops marked as c64u-only

### Phase 5: Documentation Updates ✅
- README auto-generated tools table enriched with C64U/VICE platform columns
- Per-op platform support documented in README
- AGENTS.md unchanged (no new public-facing behaviour)

### Phase 6: Test Coverage ✅
- All VICE backend methods covered by unit tests
- Coverage ≥ 90% across all affected files
- `npm run test:matrix` passes: 472 pass, 30 skip, 0 fail

### Static MCP Interface Mirror
- [x] Create the `mcp/` directory
- [x] Implement deterministic generation of the interface files
- [x] Generate `mcp/server.json`
- [x] Generate `mcp/tools.json`
- [x] Generate `mcp/resources.json`
- [x] Generate `mcp/prompts.json`
- [x] Extract schemas into `mcp/schemas/`
- [x] Generate `mcp/protocol-examples.json`
- [x] Add generator script
- [x] Update README

---

## 4. Mapping Matrix

### c64_memory
| Operation | VICE Mapping | Status |
|-----------|--------------|--------|
| `read` | `ViceClient.memGet()` → BM 0x01 | ✅ Implemented |
| `write` | `ViceClient.memSet()` → BM 0x02 | ✅ Implemented |
| `read_screen` | `memGet(0x0400, 0x0400+999)` → screen decode | ✅ Implemented |
| `wait_for_text` | Poll `memGet()` loop | ✅ Implemented |

### c64_program
| Operation | VICE Mapping | Status |
|-----------|--------------|--------|
| `upload_run_basic` | inject BASIC via `memSet` + `keyboardFeed("RUN\r")` | ✅ Implemented |
| `upload_run_asm` | assemble + inject PRG via `memSet` + `goto` | ✅ Implemented |
| `run_prg` | `injectPrg()` via `memSet` + `keyboardFeed` | ✅ Implemented |
| `load_prg` | Not supported on VICE (no Ultimate filesystem) | ❌ c64u-only |
| `run_crt` | Not supported (cart management is Ultimate-specific) | ❌ c64u-only |
| `bundle_run` | Not supported (requires debugreg capture) | ❌ c64u-only |
| `batch_run` | Sequential `run_prg` + memory/screen assertions | ✅ Implemented |

### c64_system
| Operation | VICE Mapping | Status |
|-----------|--------------|--------|
| `reset` | BM 0xCC type=0 + `waitForBasicReady()` | ✅ Implemented |
| `reboot` | Alias for reset on VICE | ✅ Implemented |
| `pause` | No-op (BM can halt via breakpoint) | ✅ No-op |
| `resume` | No-op | ✅ No-op |
| `poweroff` | BM 0xBB Quit + process stop | ✅ Implemented |
| `menu` | Not supported | ❌ c64u-only |
| `start_task` / `stop_task` | Background task manager (platform-agnostic) | ✅ Works |

### c64_debug
| Operation | VICE Mapping | Status |
|-----------|--------------|--------|
| `get_registers` | BM 0x31 (registers get) | ✅ Implemented |
| `set_registers` | BM 0x32 (registers set) | ✅ Implemented |
| `list_registers` | BM 0x33 (register metadata) | ✅ Implemented |
| `step` | BM 0x71 | ✅ Implemented |
| `step_return` | BM 0x74 | ✅ Implemented |
| `create_checkpoint` | BM 0x12 | ✅ Implemented |
| `list_checkpoints` | BM 0x11 | ✅ Implemented |
| `get_checkpoint` | BM 0x11 (filter) | ✅ Implemented |
| `delete_checkpoint` | BM 0x13 | ✅ Implemented |
| `toggle_checkpoint` | BM 0x14 | ✅ Implemented |
| `set_condition` | BM 0x22 | ✅ Implemented |

### c64_vice
| Operation | VICE Mapping | Status |
|-----------|--------------|--------|
| `display_get` | BM 0x27 (display capture) | ✅ Implemented |
| `resource_get` | BM 0x56 (resourceget) | ✅ Implemented |
| `resource_set` | BM 0x57 (resourceset) | ✅ Implemented |

### c64_config
| Operation | VICE Mapping | Status |
|-----------|--------------|--------|
| `version` | Returns emulator identity JSON | ✅ Implemented |
| `info` | Probes BM connection, returns VICE identity | ✅ Implemented |
| `get` | `resourceGet(item)` via BM 0x56 | ✅ Implemented |
| `set` | `resourceSet(item, value)` via BM 0x57 | ✅ Implemented |
| `list` | Returns curated list of VICE resource names | ✅ Implemented |
| `batch_update` | Multiple `resourceSet` calls via BM | ✅ Implemented |
| `snapshot` | Reads all resources via `configsList`+`configGet` | ✅ Implemented |
| `restore` | Writes resources via `configBatchUpdate` | ✅ Implemented |
| `diff` | Compares live resources against snapshot file | ✅ Implemented |
| `load_flash` | Not applicable | ❌ c64u-only |
| `save_flash` | Not applicable | ❌ c64u-only |
| `reset_defaults` | Not applicable | ❌ c64u-only |
| `shuffle` | Filesystem-based, not applicable | ❌ c64u-only |
| `read_debugreg` | Not applicable | ❌ c64u-only |
| `write_debugreg` | Not applicable | ❌ c64u-only |

### c64_disk
| Operation | VICE Mapping | Status |
|-----------|--------------|--------|
| `list_drives` | `resourceGet("Drive{N}CPUEnabled/Image/Type")` for drives 8–11 | ✅ Implemented |
| `mount` | `resourceSet("Drive{N}CPUEnabled", 1)` + `Drive{N}Image` | ✅ Implemented |
| `unmount` | `resourceSet("Drive{N}Image", "")` | ✅ Implemented |
| `find_and_run` | Requires Ultimate filesystem — not applicable | ❌ c64u-only |
| `create_image` | Not applicable to VICE | ❌ c64u-only |
| `file_info` | Not applicable to VICE | ❌ c64u-only |

### c64_drive  
| Operation | VICE Mapping | Status |
|-----------|--------------|--------|
| `power_on` | `resourceSet("Drive{N}CPUEnabled", 1)` | ✅ Implemented |
| `power_off` | `resourceSet("Drive{N}CPUEnabled", 0)` | ✅ Implemented |
| `reset` | Toggle `Drive{N}CPUEnabled` 0→1 via resource | ✅ Implemented |
| `set_mode` | `resourceSet("Drive{N}Type", typeNum)` | ✅ Implemented |
| `load_rom` | Not applicable | ❌ c64u-only |

### c64_sound
| Operation | VICE Mapping | Status |
|-----------|--------------|--------|
| `note_on` | Write SID voice registers via `memSet` (0xD400+) | ✅ Implemented |
| `note_off` | Clear gate bit via `memSet` | ✅ Implemented |
| `reset` | Zero SID control registers via `memSet` | ✅ Implemented |
| `silence_all` | Alias for soft SID reset via `memSet` | ✅ Implemented |
| `set_volume` | `memSet(0xD418, [vol & 0x0F])` | ✅ Implemented |
| `generate` | Drive SID note sequence via repeated `sidNoteOn` / `sidNoteOff` | ✅ Implemented |
| `play_sid_file` | Not supported (no Ultimate SID player) | ❌ c64u-only |
| `play_mod_file` | Not supported (no Ultimate SID player) | ❌ c64u-only |
| `record_analyze` | Not supported (no audio capture in headless VICE) | ❌ c64u-only |
| `analyze` | Not supported (requires audio) | ❌ c64u-only |
| `compile_play` | SIDWAVE compiled to PRG, then `runPrg()` (PRG output only) | ✅ Implemented |
| `pipeline` | Not supported | ❌ c64u-only |

### c64_graphics
| Operation | VICE Mapping | Status |
|-----------|--------------|--------|
| `create_petscii` | Generate PETSCII BASIC program, `uploadAndRunBasic()` | ✅ Implemented |
| `render_petscii` | Build PETSCII screen BASIC program, `uploadAndRunBasic()` | ✅ Implemented |
| `generate_sprite` | Build sprite PRG, `runPrg()` | ✅ Implemented |
| `generate_bitmap` | Reserved/coming soon | ❌ Not implemented |

### c64_printer
| Operation | VICE Mapping | Status |
|-----------|--------------|--------|
| `print_text` | Not applicable | ❌ c64u-only |
| `print_bitmap` | Not applicable | ❌ c64u-only |
| `define_chars` | Not applicable | ❌ c64u-only |

### c64_stream
| Operation | VICE Mapping | Status |
|-----------|--------------|--------|
| `start` | Not applicable | ❌ c64u-only |
| `stop` | Not applicable | ❌ c64u-only |

### c64_rag
| Operation | VICE Mapping | Status |
|-----------|--------------|--------|
| `basic` | Same (local knowledge base) | ✅ Works |
| `asm` | Same (local knowledge base) | ✅ Works |

---

## 5. Risk Register

| Risk | Severity | Mitigation |
|------|----------|------------|
| VICE BM protocol differences across versions | Medium | Test against VICE 3.7+ |
| Tests that require real VICE unavailable in CI | High | Use mock server for unit tests; skip device tests |
| Buffer type incompatibilities with newer `@types/node` | Low | Fixed in Phase 1 |
| Performance of memory-polling waitForText | Medium | Use reasonable timeouts |
| VICE resource names differ across builds | Medium | Use safe prefixes, document |

---

## 6. Work Log

### 2026-03-08
- Merged `origin/main` into `feat/vice`
- Resolved conflicts in: `.github/copilot-instructions.md`, `README.md`, `doc/developer.md`, `src/vice/viceClient.ts`, `test/device.test.mjs`
- Fixed TypeScript `Buffer<ArrayBufferLike>` error in `src/vice/mockServer.ts`
- Fixed `PendingRequest.expected` → `cmd` naming mismatch in `viceClient.ts` (tests expected `cmd` field)
- Build: clean (`npm run build` passes)
- Tests: 496 pass, 1 skip, 0 fail on c64u-mock; 428 pass, 25 skip, 48 fail on vice-mock (platform support gaps)
- Identified 48 failing VICE mock tests: disk/drive (32), printer (5), toolsRegistry (1), developer (1), file creation (9)
- Created PLANS.md
- Added Static MCP Interface Mirror task group to this plan
- Started implementation of the static MCP interface generator and repository snapshot output
- Added `src/mcp/metadata.ts` so runtime MCP `serverInfo` is derived from deterministic project metadata instead of a stale hardcoded version
- Added `scripts/generate-mcp-interface.ts` to launch the stdio MCP server against a local mock C64, perform MCP discovery, and regenerate `mcp/server.json`, `mcp/tools.json`, `mcp/resources.json`, `mcp/prompts.json`, `mcp/protocol-examples.json`, and `mcp/schemas/*.schema.json`
- Integrated static MCP snapshot generation into `npm run build` and added `npm run mcp:generate`
- Added `test/generateMcpInterface.test.mjs` to verify the checked-in `mcp/` snapshot matches fresh generator output
- Updated README with the Static MCP Interface section
- Generated the checked-in `mcp/` snapshot artifacts
- Validation: `npm test` passes (497 pass, 1 skip, 0 fail)
- Validation: `npm run build` passes with MCP snapshot generation included

### 2026-03-08 (continuation)
- Completed all remaining 🔶 Implement / 🔶 Partial items in the mapping matrix
- Implemented `ViceBackend`: `drivesList`, `driveMount`, `driveRemove`, `driveReset`, `driveOn`, `driveOff`, `driveSetMode` via `resourceSet`/`resourceGet`
- Implemented `ViceBackend`: `configsList` (curated VICE resource list), `configGet`, `configSet`, `configBatchUpdate` via BM resource protocol
- Confirmed SID operations (`note_on`, `note_off`, `reset`, `silence_all`, `set_volume`, `generate`) work on VICE via `writeMemory` to $D400+ registers
- Confirmed `compile_play` works on VICE via compiled PRG → `runPrg()` (SID attachment output path remains c64u-only)
- Confirmed `create_petscii`, `render_petscii`, `generate_sprite` work on VICE via `uploadAndRunBasic`/`runPrg`
- Confirmed `snapshot`, `restore`, `diff` config ops work on VICE via resource-backed meta tool
- Added `operationPlatforms` per-op overrides to all tool registry files; added C64U/VICE columns to README tools table
- Fixed pre-existing TypeScript narrowing error in `src/mcp/metadata.ts`
- Validation: `npm run build` passes cleanly; `npm run test:matrix` passes (472 pass, 30 skip, 0 fail)
- Branch is complete and ready for PR review

---

## 7. Exit Criteria

- [x] `npm run build` passes cleanly
- [x] `npm run test:matrix` passes (472 pass, 30 skip, 0 fail across all passes)
- [x] Coverage ≥ 90% across all VICE-related files (`device.ts` at 92.34%)
- [x] VICE starts automatically when configured (via `createFacade` fallback detection)
- [x] MCP tools operate correctly using VICE backend
- [x] All tool/VICE mappings documented in this file
- [x] README reflects real VICE capabilities and limitations (C64U/VICE columns in tools table)
- [x] PLANS.md contains full execution history
