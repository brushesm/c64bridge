# Fast Path Workflows

Use these routing shortcuts when the user wants a quick visible or audible result and does not need a bespoke workflow.

## Quick Visible Demo

- Route quick greetings, smoke tests, and visible backend confirmation to `.github/skills/cross-platform-demo/SKILL.md`.
- Use the custom BASIC path only when the user needs logic beyond a simple demo.

## Quick Music Demo

- Route recognizable demo-tune requests to `.github/skills/sid-music/SKILL.md`.
- The canonical built-in preset is `fuer_elise`.
- Legacy preset callers should still normalize to the same playback path rather than failing.

Example:

```json
{
  "op": "play_preset",
  "preset": "fuer_elise"
}
```

## Longer Interactive Sessions

- Use the dedicated skill for the underlying task when the user needs a pinned backend, custom program logic, or deeper debugging.

## Verification Order

1. Trust the verification defined by the selected skill first.
2. Use captured artifacts or follow-up inspection only when the selected skill indicates that extra verification is needed.