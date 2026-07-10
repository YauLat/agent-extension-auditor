# WRITE_OR_DELETE_CAPABILITY

Severity: high

## What It Detects

Commands or code markers associated with file writes, deletes, or destructive changes.

## Why It Matters

Write and delete operations can mutate local state and are harder to reverse.

## False Positive Notes

Some tools need write access to function. The risk depends on scope and trigger.

## Recommended Action

Review the exact scope and make sure destructive operations are human-gated.
