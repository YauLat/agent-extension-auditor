# OVERSIZED_SKILL_CONTEXT

Severity: low

## What It Detects

Very large `SKILL.md` files that may consume excessive context.

## Why It Matters

Oversized skills can slow agents and bury important instructions.

## False Positive Notes

Some reference-heavy skills are intentionally large.

## Recommended Action

Split large references into separate files and keep `SKILL.md` focused.
