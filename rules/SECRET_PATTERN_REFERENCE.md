# SECRET_PATTERN_REFERENCE

Severity: medium

## What It Detects

Secret-looking environment variable names or credential markers.

## Why It Matters

Extensions that receive credentials can access private APIs or accounts.

## False Positive Notes

The scanner reports references only and does not print secret values.

## Recommended Action

Confirm the extension really needs the credential and receives the narrowest possible scope.
