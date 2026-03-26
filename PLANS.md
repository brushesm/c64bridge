# Copilot-Native Skill Refactor Plan

Authoritative execution plan for consolidating repository execution logic under `.github/skills`, refactoring prompts into routing-only entry points, and removing anthem-facing content while preserving preset compatibility.

## Outcomes

- `.github/skills/*/SKILL.md` becomes the only home for execution steps, MCP sequencing, validation, and safety rules.
- `.github/prompts/*.prompt.md` and `src/prompts/registry.ts` become thin intent-routing layers only.
- The legacy agent-specific skill directory is removed after migration.
- All anthem-facing references are removed from user-facing content.
- Legacy preset callers continue to resolve to `fuer_elise` without breaking playback on `vice` or `c64u`.

## Phase 1 - Discovery

- [x] Inventory existing skill files, prompt files, and cross-agent instruction files.
- [x] Identify procedural logic outside skills.
- [x] Locate anthem-facing references and preset call paths.
- [x] Capture prompt-to-skill mapping gaps.

## Phase 2 - Skill Catalog

- [x] Create `.github/skills/` as the single source of truth.
- [x] Add normalized skills for BASIC, assembly, graphics, sound, memory, storage, streaming, system control, software launch, printer work, fast demo flow, and PR convergence.
- [x] Ensure each skill has intent, inputs, execution, validation, safety, and escalation guidance.
- [x] Remove overlapping or duplicate skill content.

## Phase 3 - Prompt Refactor

- [x] Rewrite every `.github/prompts/*.prompt.md` file to route to a skill only.
- [x] Refactor `src/prompts/registry.ts` so MCP prompts reference skills instead of embedding workflows.
- [x] Rename anthem-facing prompt identifiers to neutral music-demo naming.
- [x] Update prompt tests to validate routing behavior.

## Phase 4 - Cross-Agent Alignment

- [x] Rewrite `.github/copilot-instructions.md` to declare the skill architecture clearly.
- [x] Rewrite `AGENTS.md`, `CLAUDE.md`, `.github/agents/c64.agent.md`, and related context docs to reference `.github/skills` instead of duplicating execution logic.
- [x] Remove legacy skill-directory references from active instructions and prompts.
- [x] Ensure Copilot, Claude Code, and Codex all point at the same skill files.

## Phase 5 - Preset Cleanup And Compatibility

- [x] Remove anthem-facing examples, prompt names, descriptions, and documentation references.
- [x] Refactor preset handling so `fuer_elise` is the canonical public preset.
- [x] Preserve compatibility for legacy callers that still send the old preset identifier.
- [x] Verify playback routing still succeeds on both `vice` and `c64u`.

## Phase 6 - Cleanup

- [x] Delete the legacy duplicate skill copies.
- [x] Remove dead prompt text and stale references.
- [x] Update generated MCP metadata and README content if build scripts regenerate them.
- [x] Maintain `WORKLOG.md` with timestamped progress entries.

## Phase 7 - Validation

- [x] Search for remaining execution logic outside `.github/skills` and remove it.
- [x] Search for remaining anthem-facing references and remove or normalize them.
- [x] Run `npm run build`.
- [x] Run targeted tests for prompts and preset compatibility.
- [x] Run `npm run test:matrix`.

## Final Checklist

- [x] `.github/skills` contains the authoritative execution logic.
- [x] Prompts are routing-only and reference skills.
- [x] The legacy duplicate skill directory is removed.
- [x] Anthem-facing content is gone.
- [x] Legacy preset calls still produce `fuer_elise` playback.
- [x] Build and tests are green.
