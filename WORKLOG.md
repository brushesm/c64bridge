## 2026-03-26 17:05 - Refactor start

Started the repository-wide skill architecture refactor. Confirmed that execution logic currently lives in multiple places: the legacy agent-specific skill directory, `.github/prompts`, `src/prompts/registry.ts`, `AGENTS.md`, `.github/copilot-instructions.md`, `.github/agents/c64.agent.md`, and `data/context/fast-paths.md`.

Confirmed the required cleanup scope for anthem-facing content. The public prompt registry, generated MCP metadata, agent instructions, context docs, and `src/tools/meta/audio.ts` all expose the old preset name or anthem wording today.

## 2026-03-26 17:12 - Skill catalog created

Created the new `.github/skills` catalog as the single planned home for execution guidance. The catalog covers prompt-backed flows and the extra operational domains that previously existed only as Claude-local skills, so the repository no longer depends on agent-specific skill paths.

## 2026-03-26 17:28 - Routing layers refactored

Rewrote every prompt file under `.github/prompts` to point at a matching skill instead of describing tool sequences. Replaced the MCP prompt registry implementation with a routing-only model that references `.github/skills`, preserved prompt arguments, and renamed the public preset prompt to neutral music-demo naming.

## 2026-03-26 17:36 - Preset compatibility and cleanup

Made `fuer_elise` the only public preset while keeping the legacy caller path as an internal alias that normalizes to the same preset. Removed the legacy duplicate skill files, rebuilt the project to regenerate README and MCP metadata, and confirmed that generated artifacts no longer expose the removed prompt or preset names.

## 2026-03-26 17:46 - Prompt regression fix and final validation

Restored argument-aware routing notes in `src/prompts/registry.ts` so MCP prompt responses remain routing-only while still surfacing SID- and sprite-specific guidance for prompt arguments. Rebuilt generated MCP artifacts, reran the targeted prompt and preset tests, and completed a clean `npm run test:matrix` run.