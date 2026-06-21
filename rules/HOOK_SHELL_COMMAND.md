# HOOK_SHELL_COMMAND

Severity: high

## What It Detects

Hook-like configuration containing command strings or common shell executables.

## Why It Matters

Hooks can run automatically at sensitive moments in an agent workflow.

## False Positive Notes

Some agent hooks are expected, but they deserve explicit review.

## Recommended Action

Review trigger timing, command source, and side effects.
