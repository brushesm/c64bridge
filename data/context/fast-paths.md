# Fast Path Workflows

Use these shortcuts when the user wants a quick visible result and does not need a bespoke program.

## Dual-Backend Greeting

- For prompts such as "write a simple greeting on both vice and c64u" or "show text on the emulator and hardware", call `c64_program` with `op: "cross_platform_greeting"`.
- The workflow switches backends internally, generates a platform-customized BASIC program, captures a screenshot for each backend, and verifies the greeting using the text screen.
- Default template: `HAVE A GREAT DAY, {PLATFORM}!`
- Template placeholders:
  - `{PLATFORM}` or `{BACKEND}` for uppercase substitution (`VICE`, `C64U`)
  - `{platform}` or `{backend}` for lowercase substitution (`vice`, `c64u`)

Example:

```json
{
  "op": "cross_platform_greeting"
}
```

## Single-Backend Quick Text

- If the user only wants one target, still prefer `cross_platform_greeting` with `platforms: ["vice"]` or `platforms: ["c64u"]`.
- Use `upload_run_basic` only when the user needs custom program flow beyond a simple greeting or text demo.

Example:

```json
{
  "op": "cross_platform_greeting",
  "platforms": ["vice"],
  "messageTemplate": "HELLO FROM {PLATFORM}!"
}
```

## Manual Backend Control

- Use `c64_select_backend` only when the user needs a longer interactive session pinned to one backend.
- For simple one-shot demos, prefer orchestration tools that switch internally so the model does not need extra planning.

## Verification Order

1. Trust the structured verification returned by `cross_platform_greeting` first.
2. Use the saved screenshot paths when you want visual confirmation or need to compare VICE and C64U output.
3. Fall back to `c64_memory` (`read_screen` or `wait_for_text`) only when a more detailed inspection is needed.