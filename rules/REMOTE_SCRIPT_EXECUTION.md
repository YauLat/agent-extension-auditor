# REMOTE_SCRIPT_EXECUTION

Severity: critical

## What It Detects

Patterns such as `curl` or `wget` piped into a shell.

## Why It Matters

Remote scripts can change behavior without local review and may execute arbitrary code.

## False Positive Notes

Install docs sometimes show these commands, but they should not be blindly trusted.

## Recommended Action

Download and inspect the script, pin the source, or avoid the pattern.
