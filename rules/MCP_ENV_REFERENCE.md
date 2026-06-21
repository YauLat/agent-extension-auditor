# MCP_ENV_REFERENCE

Severity: medium

## What It Detects

MCP `env` blocks or secret-like environment references.

## Why It Matters

Environment variables often contain API keys or tokens that tools can read at runtime.

## False Positive Notes

Some env vars are harmless configuration. Secret values are not printed by this tool.

## Recommended Action

Confirm the server only receives variables it truly needs.
