# Changelog

## Unreleased

## 0.1.2

- Rewrote the README introduction and added mainstream-language entry points for new users.
- Added `agent-audit ui` for a local terminal UI grouped by extension type and severity.
- Added `agent-audit scan --format html --output risk-report.html` for a static local dashboard report.
- Added categorized inventory/finding cards to make large skills scans easier to review.
- Grouped category-card findings by severity so large categories can be reviewed by risk level.
- Added browser-only severity, rule, inventory type, location, and text filters to HTML reports.
- Added an English / Traditional Chinese UI toggle to HTML reports.
- Documented the HTML report privacy model and local-only usage.

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
