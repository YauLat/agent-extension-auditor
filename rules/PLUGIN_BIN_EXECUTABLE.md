# PLUGIN_BIN_EXECUTABLE

Severity: low

## What It Detects

`package.json` `bin` entries.

## Why It Matters

Executables may be invoked by agents, shell commands, or users.

## False Positive Notes

Most CLI packages expose bin entries by design.

## Recommended Action

Confirm the executable name and package source match what you intended to install.
