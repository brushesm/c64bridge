# VICE Backend Feature Completion Plan

**Branch**: `feat/vice`  
**Created**: 2026-03-08  
**Status**: In progress

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

### Phase 2: Test Triage & Platform Declarations
- Identify which failing VICE-mode tests represent:
  a) Missing VICE implementation (must implement)
  b) Hardware-only operations (must mark c64u-only)
- Update `supportedPlatforms` in tool registration for all operations
- Fix `toolRegistry.invoke` test for VICE compatibility

### Phase 3: VICE Disk & Drive Operations
- Implement `drivesList()`, `driveMount()`, `driveRemove()`, `driveReset()`, `driveOn()`, `driveOff()`, `driveSetMode()` in `ViceBackend`
- Wire via `attach`/`detach`/`resourceget`/`resourceset` BM commands
- Add VICE support to the disk/drive tool registry entries

### Phase 4: VICE Config Operations via Resources
- Implement `configsList()`, `configGet()`, `configSet()` using VICE `resourceget`/`resourceset`
- Already have `ViceClient.resourceGet()` and `resourceSet()` — wire them up
- Mark flash/snapshot config ops as c64u-only

### Phase 5: Documentation Updates
- Update README with VICE feature matrix
- Document limitations explicitly
- Update AGENTS.md if needed

### Phase 6: Test Coverage
- Add/update unit tests for all new VICE implementations
- Verify coverage ≥ 90% across affected files
- Validate `npm run test:matrix` passes fully

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
| `bundle_run` | Needs screenshot + memory; partial | 🔶 Partial |
| `batch_run` | Sequential run_prg with assertions | 🔶 Via run_prg |

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
| `version` | Returns emulator identity JSON | ✅ Implement for VICE |
| `info` | Returns VICE process info | ✅ Implement for VICE |
| `get` | `resourceGet(item)` | 🔶 Implement via resources |
| `set` | `resourceSet(item, value)` | 🔶 Implement via resources |
| `list` | Return common VICE resource names | 🔶 Partial |
| `batch_update` | Multiple resourceSet calls | 🔶 Implement |
| `snapshot` | BM dump command | 🔶 Implement |
| `restore` | BM undump command | 🔶 Implement |
| `diff` | Compare snapshots | 🔶 Partial |
| `load_flash` | Not applicable | ❌ c64u-only |
| `save_flash` | Not applicable | ❌ c64u-only |
| `reset_defaults` | Not applicable | ❌ c64u-only |
| `shuffle` | Filesystem-based, not applicable | ❌ c64u-only |
| `read_debugreg` | Not applicable | ❌ c64u-only |
| `write_debugreg` | Not applicable | ❌ c64u-only |

### c64_disk
| Operation | VICE Mapping | Status |
|-----------|--------------|--------|
| `list_drives` | `resourceGet("Drive8Type")` etc | 🔶 Implement |
| `mount` | BM `attach` command (text monitor escape) | 🔶 Implement via resourceset |
| `unmount` | BM `detach` equivalent | 🔶 Implement |
| `find_and_run` | Attach + autostart | 🔶 Implement |
| `create_image` | Not applicable to VICE | ❌ c64u-only |
| `file_info` | Not applicable to VICE | ❌ c64u-only |

### c64_drive  
| Operation | VICE Mapping | Status |
|-----------|--------------|--------|
| `power_on` | `resourceSet("Drive8CPUEnabled", "1")` | 🔶 Implement |
| `power_off` | `resourceSet("Drive8CPUEnabled", "0")` | 🔶 Implement |
| `reset` | No direct BM equivalent | 🔶 via resource |
| `set_mode` | `resourceSet("Drive8Type", ...)` | 🔶 Implement |
| `load_rom` | Not applicable | ❌ c64u-only |

### c64_sound
| Operation | VICE Mapping | Status |
|-----------|--------------|--------|
| `note_on` | Write SID registers via `memSet` | 🔶 Implement |
| `note_off` | Write SID gate bit via `memSet` | 🔶 Implement |
| `reset` | Clear SID registers via `memSet` | 🔶 Implement |
| `silence_all` | Zero all SID registers | 🔶 Implement |
| `set_volume` | `memSet(0xD418, [vol])` | 🔶 Implement |
| `generate` | Generate + play SID arpeggio via BM | 🔶 Implement |
| `play_sid_file` | Not supported (no Ultimate SID player) | ❌ c64u-only |
| `play_mod_file` | Not supported (no Ultimate SID player) | ❌ c64u-only |
| `record_analyze` | Not supported (no audio capture in headless VICE) | ❌ c64u-only |
| `analyze` | Not supported (requires audio) | ❌ c64u-only |
| `compile_play` | SIDWAVE compile + BASIC/ASM upload | 🔶 Partial |
| `pipeline` | Not supported | ❌ c64u-only |

### c64_graphics
| Operation | VICE Mapping | Status |
|-----------|--------------|--------|
| `create_petscii` | `memSet` screen RAM directly | 🔶 Implement |
| `render_petscii` | Write PETSCII to screen via BM | 🔶 Implement |
| `generate_sprite` | upload PRG that displays sprite | 🔶 Via run_prg |
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

### Next steps
- Implement VICE drive/disk operations via BM resources
- Add `supportedPlatforms: ["c64u", "vice"]` to config, disk, drive tool groups 
- Fix `toolRegistry.invoke` test for VICE mode
- Mark truly c64u-only tools explicitly

---

## 7. Exit Criteria

- [ ] `npm run build` passes cleanly
- [ ] `npm run test:matrix` passes (c64u-mock: 0 fail; vice-mock: 0 fail; vice-device: skip or pass)
- [ ] Coverage ≥ 90% across all VICE-related files
- [ ] VICE starts automatically when configured
- [ ] MCP tools operate correctly using VICE backend
- [ ] All tool/VICE mappings documented in this file
- [ ] README reflects real VICE capabilities and limitations
- [ ] PLANS.md contains full execution history
