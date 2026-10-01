# Changelog

## 0.3.0 — 2026-10-01 (local source; unpublished)

- Replace parser source excerpts with fixed diagnostics; mark invalid configuration as incomplete.
- Add schema version 2, declared scope, bounded-read/skipped counts and explicit partial/failed status across reports and native UI. Legacy reports display unknown coverage.
- Add shared skills, Claude user/project settings and skills, and Codex TOML configuration.
- Follow only in-scope symlinks, retain aliases, scan bundled skill text/scripts, and count hook command leaves once.
- Add stable finding IDs and evidence kind `code`; static evidence does not prove execution.
- Add scan exit codes 3/4 and `--allow-incomplete` compatibility. Bundle the pinned TOML parser with its license in the Mac app.
- Add manual local baseline create/diff/accept/delete commands with private hash-only persistence, content/permission-bound review, derived-hash consistency checks, move-aware matching with fail-closed ambiguous identities, self-baseline exclusion, concurrent update guards, and fail-closed schema/rules/scope/coverage gates.
- Preserve Hermes/SkillClaw discovery and plugin ownership while integrating reliability work.
- Add explicit `--path`, stable correlation fingerprints, SARIF, structured JSON errors and opt-in `--fail-on` gates.
- Keep documented prohibitions visible at informational severity, preserve adjacent active instructions, and add bounded prompt-injection/exfiltration detection.
- Add native baseline preview/create/accept, stale-review protection, top-five next actions, scoped counts, and navigation from assets to findings.
- Label source metadata as self-declared; distinguish disabled configuration from observed activity.
- This version has not been published, notarized or deployed.

## 0.2.2 - 2026-07-11

- Added universal `arm64` and `x86_64` macOS packaging with deterministic architecture verification.
- Added fail-closed Developer ID signing, Hardened Runtime, secure timestamp, notarization, stapling, Gatekeeper assessment, and SHA-256 artifact generation.
- Added native macOS CI on GitHub-hosted Apple Silicon and Intel macOS 26 runners while preserving the Node 20 gate.
- Added repository tests for signing, notarization, and dual-architecture CI controls.
- Kept four-digit severity totals on one line in the Chinese native-app overview at wide desktop sizes.
- Restored canonical project links after moving the source to a clean public repository with new history.

## 0.2.1 - 2026-07-11

- Reworked the README for GitHub/npm open-source distribution, removed the maintainer-specific macOS bundle identifier, and added repository data-hygiene checks.
- Removed account-linked source, homepage, and issue-tracker package metadata pending migration to a maintainer-neutral project identity.

## 0.2.0 - 2026-07-10

- Added guided `UNKNOWN_SOURCE` repair with a read-only preview, explicit confirmation, content-hash guard, private backup, automatic rescan, and guarded rollback.
- Added finding evidence state and remediation metadata, while keeping shell, hook, credential, network, and write/delete findings review-only.
- Narrowed text hook detection so hook and shell markers must appear near each other instead of anywhere in the same file.
- Added macOS file navigation and a native guided-repair sheet with preview and rollback controls.
- Added a minimalist Figma-authored macOS app icon with generated 16px through 1024px `.icns` assets.
- Added a native macOS SwiftUI app with Liquid Glass, categorized inventory cards, severity filters, finding inspectors, scanned locations, and English / Traditional Chinese UI.
- Added local `.app` packaging with the existing scanner bundled as a local engine; no WebView, local server, telemetry, or cloud upload.
- Added a standalone no-dependency glass dashboard prototype at `examples/glass-dashboard.html`.

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
