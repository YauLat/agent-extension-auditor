# DUPLICATE_SKILL_NAME

Severity: medium

## What It Detects

Multiple `SKILL.md` files declaring the same skill name.

## Why It Matters

Duplicate names can confuse discovery, activation, and maintenance.

## False Positive Notes

Different agents can intentionally keep copies of the same skill.

## Recommended Action

Confirm which copy is canonical and remove or rename stale duplicates.
