# MCP_STDIO_COMMAND

Severity: high

## What It Detects

An MCP server definition with a `command` field, usually stdio-based.

## Why It Matters

Starting local commands gives the extension executable behavior on the user's machine.

## False Positive Notes

Many legitimate MCP servers use stdio. The finding means review is needed, not that the server is malicious.

## Recommended Action

Review the command source, package name, arguments, and maintainer before enabling it.
