# Changelog

## 0.1.1

- Added `--min-severity medium|high|critical` to focus reports on higher-priority findings.
- Added `--no-home` plus `--include` and `--exclude` path filters for narrower local scans.
- Added recommended next actions to terminal, Markdown, and JSON reports.
- Updated Vitest dev dependency to remove the low-severity esbuild audit finding.

## 0.1.0

- Initial local-first CLI skeleton.
- Added read-only scan, Markdown/JSON/terminal reports, `explain`, and `doctor`.
- Added deterministic risk rules for MCP, plugins, hooks, secret references, duplicate skills, and oversized skills.
- Added privacy, security, rule, example, and CI documentation.
