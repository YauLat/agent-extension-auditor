# WORKSPACE_OUTSIDE_READ

Severity: medium

## What It Detects

References to broad home-directory or parent-directory reads.

## Why It Matters

Broad local reads may expose unrelated private files to an extension.

## False Positive Notes

Documentation can mention paths without granting access.

## Recommended Action

Review whether the extension needs access outside the active workspace.
