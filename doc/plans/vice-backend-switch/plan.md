# C64Bridge: Multi-Backend Runtime Switching — Implementation Brief

## Context

You are working in the repository at `/home/chris/dev/c64/c64bridge`.

This is a TypeScript MCP (Model Context Protocol) server that bridges Commodore 64
hardware and emulator backends to AI agents. Two backends exist:

- **C64U** (`c64u`): REST API to physical C64 Ultimate hardware at `http://c64u`
- **VICE** (`vice`): Binary monitor protocol to the VICE C64 emulator

The server is started via `node scripts/start.mjs` (stdio MCP transport).

---

## Mandatory Process

Before writing any code you **must** create `plans.md` at the repo root with the
full multi-phase plan described below. Every task in `plans.md` must be a checkbox.
Tick each checkbox the moment that task is complete — never batch. Alongside
`plans.md`, maintain `worklog.md` at the repo root. Append a timestamped entry to
`worklog.md` whenever you start a phase, complete a phase, or make a decision that
deviates from this brief.

Format for `worklog.md` entries:

```
## YYYY-MM-DD HH:MM — <one-line summary>

<Free prose: what was done, any surprises, decisions made.>
```

**Do not proceed to the next phase until all checkboxes in the current phase are
ticked.** If you discover that a later phase must be restructured because of
something you learned in an earlier phase, update `plans.md` and add a worklog
entry explaining why.

---

## Test Coverage Mandate

**Minimum 91% line + branch coverage across all modified and new source files.**

- Run the existing test suite with `./build test` (mock backend) after every phase.
- After the final phase run `./build coverage` and verify the threshold.
- If coverage drops below 91% on any modified file, write additional tests before
  marking that phase complete.
- Tests live in `src/**/*.test.ts` (co-located) or `test/**/*.ts` — follow the
  existing pattern for the file you are modifying.
- Do not delete or weaken existing tests.

---

## Bug Report: Why Vice Is Never Selected

When the server starts, `mcp-server.ts` calls `config.ts::loadConfig()`, which is a
**C64U-only** legacy loader. It reads `~/.c64bridge.json` or the project root
`.c64bridge.json` but only ever extracts `c64u.*` fields; the `vice` section is
silently ignored.

Separately, `device.ts::readConfigFile()` — used by `createFacade()` — scans
candidate paths in order and **returns on the first match**:

1. `C64BRIDGE_CONFIG` env var path
2. `.c64bridge.json` in the project root
3. `~/.c64bridge.json` in the home directory

The project root `.c64bridge.json` currently contains:

```json
{ "c64u": { "host": "c64u", "port": 80 } }
```

Because this file is found first and contains no `vice` section,
`createFacade()` always selects c64u — the user's `~/.c64bridge.json` vice config
is never reached.

A second issue: after `createFacade()` resolves, `platform.ts::currentPlatform`
remains `"c64u"` (its hardcoded default) even when vice was selected, because
`mcp-server.ts` never calls `setPlatform()` with the result of the facade selection.

---

## Existing Architecture — Key Files

Read every file listed here before writing code.

| File | Role |
|---|---|
| `src/mcp-server.ts` | MCP entry point. Creates `C64Client`, registers MCP handlers. |
| `src/config.ts` | Legacy C64U-only config loader used by `mcp-server.ts`. |
| `src/device.ts` | `C64uBackend`, `ViceBackend`, `C64Facade` interface, `createFacade()`, `readConfigFile()`. |
| `src/c64Client.ts` | Orchestration wrapper around a single `C64Facade`. All tool methods delegate here. |
| `src/platform.ts` | Global `currentPlatform` state, `setPlatform()`, tool gating helpers. |
| `src/tools/types.ts` | `ToolExecutionContext` — passed to every tool invocation. |
| `src/tools/registry/index.ts` | Registers all tool modules; `toolRegistry.invoke()`. |
| `src/tools/registry/system.ts` | Example of a multi-operation tool module. |
| `src/tools/vice.ts` | Vice-specific tool (`supportedPlatforms: ["vice"]`). Study this as a pattern. |
| `mcp.json` | MCP server descriptor with documented env vars. |
| `.vscode/mcp.json` | VS Code MCP config — stdio invocation. |
| `data/context/bootstrap.md` | LLM bootstrap prompt injected before every session. |
| `AGENTS.md` | LLM-facing setup and usage guide. |

Also read:

- `src/tools/types.ts` fully (especially `ToolExecutionContext` and `ToolModule`).
- One complete tool module (e.g. `src/tools/registry/system.ts`) to understand the
  pattern before implementing the new tool.

---

## Phase Breakdown for `plans.md`

Use exactly the following phase and task names. Add sub-tasks as needed, but do not
remove or rename the top-level items.

---

### Phase 0 — Bootstrap

- [ ] Read every file listed in the architecture table above.
- [ ] Read `README.md` sections on configuration and VS Code setup.
- [ ] Read `AGENTS.md` and `data/context/bootstrap.md`.
- [ ] Run `./build test` and record baseline pass/fail count in `worklog.md`.
- [ ] Record current `./build coverage` output in `worklog.md`.
- [ ] Create `plans.md` with all phases and tasks.
- [ ] Create `worklog.md` with the Phase 0 start entry.

---

### Phase 1 — Merge Config Across Files

**Goal**: `readConfigFile()` in `src/device.ts` collects backend sections from
*all* candidate config files rather than stopping at the first match.

**Specification**:

- Iterate all candidate paths in order (env var → project root → home dir).
- Accumulate: take the `c64u` section from the **first** file that contains one;
  take the `vice` section from the **first** file that contains one.
- Stop iterating early only when both sections have been found.
- If no file yields a section, that section remains `undefined`.
- Return `null` only when no candidate file exists at all.
- The function signature and return type (`C64BridgeConfigFile | null`) must not
  change.
- Do not change any other behaviour of `createFacade()`.

**Tasks**:

- [ ] Implement the merge logic in `readConfigFile()`.
- [ ] Write/update unit tests: config from project root only, home only, both split
  across files, env-var path overrides, missing files.
- [ ] Run `./build test` — all tests pass.
- [ ] Coverage ≥ 91% on `src/device.ts`.
- [ ] Append Phase 1 completion entry to `worklog.md`.

---

### Phase 2 — Env-Var Overrides for C64U Backend

**Goal**: The C64U backend respects env-var overrides analogous to the existing
`VICE_BINARY`, `VICE_HOST`, `VICE_PORT` vars, so a user can fully configure it
from `.vscode/mcp.json` without a config file.

**New env vars** (read inside `C64uBackend` constructor, same pattern as
`ViceBackend`):

| Env var | Overrides |
|---|---|
| `C64U_HOST` | `config.host` / `config.hostname` |
| `C64U_PORT` | `config.port` |
| `C64U_PASSWORD` | `config.networkPassword` |

**Precedence within `C64uBackend`** (highest → lowest):

1. Env var (`C64U_HOST`, etc.)
2. Constructor `config` argument (from config file)
3. Built-in defaults (`c64u`, port `80`)

**Tasks**:

- [ ] Read env vars in `C64uBackend` constructor.
- [ ] Document the three new vars in `mcp.json` `env` section with `description`
  and `default` fields matching the existing format.
- [ ] Write unit tests: env var alone, config alone, env var beats config,
  neither present → defaults.
- [ ] Run `./build test` — all tests pass.
- [ ] Coverage ≥ 91% on the modified constructor path.
- [ ] Append Phase 2 completion entry to `worklog.md`.

---

### Phase 3 — Dual-Facade Support in `C64Client`

**Goal**: When both backends are configured, `C64Client` initialises both facades
at construction time and exposes a `switchBackend()` method for zero-reconnect
runtime switching.

**Specification**:

Add a new exported async function to `src/device.ts`:

```typescript
export interface AllFacadesResult {
  primary: FacadeSelection;           // the initially selected backend
  secondary: C64Facade | null;        // the other backend, if configured
  secondaryType: DeviceType | null;
}

export async function createAllFacades(
  logger?: { info: (...a: any[]) => void },
  options?: FacadeOptions,
): Promise<AllFacadesResult>
```

Logic:

1. Call the existing `createFacade()` to determine the primary selection.
2. Read the merged config (via the updated `readConfigFile()`).
3. If the config contains the OTHER backend (the one not selected as primary),
   construct it immediately (no probing required — just instantiate).
4. Return both.

Modify `C64Client`:

- Change constructor so that when `forceC64uFacade` is `false` it calls
  `createAllFacades()` instead of `createFacade()`.
- Store results in:
  ```typescript
  private readonly allFacades: Map<DeviceType, Promise<C64Facade>>;
  private activeType: DeviceType;
  private facadePromise: Promise<C64Facade>;  // points to allFacades.get(activeType)
  ```
- Add:
  ```typescript
  switchBackend(type: DeviceType): void
  // Throws if the type is not in allFacades.
  // Updates this.facadePromise = this.allFacades.get(type).
  // Updates this.activeType.
  // Does NOT call setPlatform() — that is the caller's responsibility.

  getActiveBackendType(): Promise<DeviceType>
  // Returns activeType (already resolved, but keep async for consistency).

  getAvailableBackends(): DeviceType[]
  // Returns Array.from(allFacades.keys()).
  ```
- All existing delegate methods in `C64Client` continue to work unchanged because
  they already use `this.facadePromise`.

**Tasks**:

- [ ] Add `createAllFacades()` to `src/device.ts`.
- [ ] Modify `C64Client` constructor and add the three new methods.
- [ ] Write unit tests for `C64Client`: single c64u, single vice, both configured
  (verify both facades initialised), `switchBackend()` swaps the active facade,
  `switchBackend()` to unconfigured type throws.
- [ ] Run `./build test` — all tests pass.
- [ ] Coverage ≥ 91% on modified `c64Client.ts` paths.
- [ ] Append Phase 3 completion entry to `worklog.md`.

---

### Phase 4 — Sync Platform State on Init and Switch

**Goal**: `platform.ts::currentPlatform` always reflects the actually active
backend, from server start through any subsequent switches.

**In `src/mcp-server.ts`**:

After constructing `C64Client` and before registering MCP handlers, add:

```typescript
const initialBackendType = await client.getActiveBackendType();
setPlatform(initialBackendType);
writeDiagnosticEvent("platform_initialised", { platform: initialBackendType });
```

**In `C64Client::switchBackend()`** — the platform sync is **not** done here;
it remains the tool's responsibility (see Phase 5). Document this contract in a
comment.

**Tasks**:

- [ ] Add the `setPlatform()` call in `mcp-server.ts` after client construction.
- [ ] Add the `writeDiagnosticEvent` call.
- [ ] Write/update integration or unit tests that assert the platform matches the
  backend that was selected from config at startup (both the c64u-only and
  vice-only cases).
- [ ] Run `./build test` — all tests pass.
- [ ] Append Phase 4 completion entry to `worklog.md`.

---

### Phase 5 — `c64_select_backend` Tool

**Goal**: A new MCP tool lets the LLM (or user) switch the active backend at
runtime without restarting the server.

**Tool name**: `c64_select_backend`

**Module placement**: Add a new file `src/tools/registry/platform.ts` following the
same `ToolModule` / `defineToolModule` / `operationPlatforms` pattern as
`src/tools/registry/system.ts`. Register it in `src/tools/registry/index.ts`.

**Tool specification**:

```
Input schema
  op: "select"                    (discriminator, required)
  backend: "c64u" | "vice"       (required)

Supported platforms: ["c64u", "vice"]   — available on both

Behaviour
  1. Call ctx.client.getAvailableBackends().
  2. If backend is not in the list, return an error result explaining which
     backends are configured (do not throw).
  3. Call ctx.client.switchBackend(backend).
  4. Call ctx.setPlatform(backend).
  5. Return a success result that includes:
     - The newly active backend name
     - The list of tool names now available on that backend
     - The list of tool names now unavailable
     - A one-line usage hint reminding the user they can switch back
```

**Tasks**:

- [ ] Create `src/tools/registry/platform.ts` with the `c64_select_backend` tool.
- [ ] Register the module in `src/tools/registry/index.ts`.
- [ ] Write unit tests: select available backend succeeds and updates platform,
  select unavailable backend returns error result (not throw), both backends
  configured round-trip switch.
- [ ] Run `./build test` — all tests pass.
- [ ] Coverage ≥ 91% on `src/tools/registry/platform.ts`.
- [ ] Append Phase 5 completion entry to `worklog.md`.

---

### Phase 6 — LLM Routing Instructions

**Goal**: The LLM automatically calls `c64_select_backend` when the user expresses
a preference for a specific backend in natural language, without requiring any
server-side prompt parsing.

**Update `data/context/bootstrap.md`**:

Add a section (before the existing tool listing, or at the top of the "Platform"
section if one exists) with these exact routing rules:

```markdown
## Backend Selection

Two backends may be available: `c64u` (physical C64 Ultimate hardware) and `vice`
(VICE emulator). Use `c64_select_backend` to switch.

**Routing rules — call `c64_select_backend` first when the user:**
- Says "use vice", "on vice", "in the emulator", "via vice", or similar
- Says "use c64u", "on hardware", "on the Ultimate", "on the real machine", or similar
- Prefixes a request with a backend name, e.g. "vice: run this program"

Do not assume the current backend is correct without checking
`c64://platform/status` if the user has expressed a preference.
```

**Update `AGENTS.md`**:

Add a short "Runtime Backend Switching" subsection under the configuration section
that explains:
- Both backends can be live simultaneously when configured
- `c64_select_backend` switches without restarting
- The platform status resource (`c64://platform/status`) always reflects the
  currently active backend

**Tasks**:

- [ ] Add backend routing rules to `data/context/bootstrap.md`.
- [ ] Add "Runtime Backend Switching" subsection to `AGENTS.md`.
- [ ] Verify that the bootstrap content is included in RAG (check
  `src/rag/init.ts` or equivalent to confirm `bootstrap.md` is indexed).
- [ ] Append Phase 6 completion entry to `worklog.md`.

---

### Phase 7 — Update Platform Status Resource

**Goal**: The `c64://platform/status` resource rendered in `mcp-server.ts` now
also reports which backends are available (not just which is active) and removes
the stale notice about needing a restart to switch.

**In `mcp-server.ts::renderPlatformStatusMarkdown()`**:

- Add a "## Available Backends" section listing each backend from
  `client.getAvailableBackends()`, marking the active one.
- Remove or update the trailing line:
  > Switching platforms currently requires restarting the MCP server with an
  > updated configuration.

  Replace with a line explaining `c64_select_backend`.

**Tasks**:

- [ ] Update `renderPlatformStatusMarkdown()`.
- [ ] Pass `client` into the function (or use a closure — follow the existing
  style in `mcp-server.ts`).
- [ ] Write/update tests for the rendered markdown output.
- [ ] Run `./build test` — all tests pass.
- [ ] Append Phase 7 completion entry to `worklog.md`.

---

### Phase 8 — Final Validation

- [ ] Run `./build test` (full mock suite) — zero failures.
- [ ] Run `./build test:matrix` if available — zero failures.
- [ ] Run `./build coverage` — overall coverage ≥ 91%.
- [ ] Manually inspect `plans.md` — every checkbox ticked.
- [ ] Review `worklog.md` — every phase has a completion entry.
- [ ] Read `README.md` configuration section and update it to document:
  - The new `C64U_HOST`, `C64U_PORT`, `C64U_PASSWORD` env vars.
  - The config-merging behaviour (both config files are read; first-found per
    section wins).
  - The dual-backend runtime switching capability and `c64_select_backend`.
- [ ] Append Phase 8 completion entry to `worklog.md`.

---

## Constraints and Non-Goals

- **Do not** delete or rename any existing public API on `C64Client` or
  `C64Facade`.
- **Do not** remove `config.ts` or change its `loadConfig()` signature — it is
  used by `mcp-server.ts` for diagnostics and may be used by external callers.
- **Do not** change the `createFacade()` function signature or its behaviour when
  called with `preferredC64uBaseUrl` set (that path is used by tests).
- **Do not** add `npm` dependencies beyond what is already in `package.json`.
- **Do not** modify generated files under `generated/`.
- Keep all new source in TypeScript with strict types — no `any` except where the
  existing code already uses it for generated API types.
- The `switchBackend()` method on `C64Client` must be synchronous (just a pointer
  swap); do not await or re-connect anything inside it.
- The `createAllFacades()` secondary facade is constructed eagerly but its
  underlying process (VICE) must **not** be started until the first method call
  on it — this matches the existing lazy-start behaviour in `ViceBackend`.

---

## Precedence Order (for reference and tests)

After all phases are complete, the effective configuration precedence for backend
selection is, from highest to lowest:

1. `C64_MODE` env var (`"c64u"` or `"vice"`) → forces a single backend
2. `C64U_HOST` / `C64U_PORT` / `C64U_PASSWORD` env vars → override c64u fields
3. `VICE_BINARY` / `VICE_HOST` / `VICE_PORT` env vars → override vice fields
4. `C64BRIDGE_CONFIG` env var → explicit config file path (first-found wins per
   backend section across this and subsequent candidates)
5. `.c64bridge.json` in project root → merged into accumulated config
6. `~/.c64bridge.json` in home directory → merged into accumulated config
7. Built-in defaults (`c64u:80`, `127.0.0.1:6502`, `x64sc`)

---

## Acceptance Criteria

The implementation is complete when:

1. Starting the server with only `{ "vice": { "exe": "/usr/bin/x64sc" } }` in
   `~/.c64bridge.json` and `{ "c64u": { "host": "c64u" } }` in the project root
   results in **both** backends being available and `vice` being selected if
   `C64_MODE=vice` is set (or c64u if not set).
2. Starting with only `{ "vice": ... }` in `~/.c64bridge.json` and **no** project
   root config results in the vice backend being selected automatically.
3. `C64U_HOST=192.168.1.99` in the environment overrides the host from any config
   file.
4. After the server is running with both backends configured, calling the
   `c64_select_backend` tool with `backend: "vice"` returns a success result and
   subsequent tool calls use the vice facade.
5. Calling `c64_select_backend` with a backend that is not configured returns an
   error result (not a thrown exception) listing which backends are available.
6. `c64://platform/status` correctly lists available backends and the active one.
7. `./build coverage` reports ≥ 91% overall.
8. `plans.md` has every checkbox ticked and `worklog.md` has a completion entry
   for every phase.
