---
name: system-control
description: Control machine lifecycle, background tasks, and configuration state.
---

## Intent

Use this skill for pause/resume, reset, reboot, power, menu actions, background tasks, and configuration workflows.

## Inputs

- Desired machine action or configuration change.
- Any task name, configuration category, or configuration item involved.
- Whether state persistence or flash save is required.

## Execution

1. Use `c64_system` with `op: "pause"`, `op: "resume"`, `op: "reset"`, `op: "reboot"`, `op: "poweroff"`, or `op: "menu"` as needed.
2. Use `c64_system` task operations for background task lifecycle management.
3. Use `c64_config` for configuration reads, writes, snapshots, diffs, and status checks.

## Validation

1. Confirm the resulting machine or configuration state in the summary.
2. When configuration changes are involved, report the category and item that changed.

## Safety

- Require explicit confirmation before reset, reboot, poweroff, flash save, or destructive config resets.
- Never leave the system paused without telling the user.
