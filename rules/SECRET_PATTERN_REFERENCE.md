# SECRET_PATTERN_REFERENCE

Severity: medium

## What It Detects

Secret-looking environment variable names or credential markers.

Structured configurations retain one finding per matching field, including separate MCP environment variables. A key and its value at the same location share one finding; a structured match suppresses the redundant file-level text warning. MCP ownership is preserved for wrapped, flat and snake-case server maps.

## Why It Matters

Extensions that receive credentials can access private APIs or accounts.

## False Positive Notes

The scanner reports references only and does not print secret values.

## Recommended Action

Confirm the extension really needs the credential and receives the narrowest possible scope.
