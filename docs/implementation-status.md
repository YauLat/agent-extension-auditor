# Product review implementation — 2026-10-01

Status: local source 0.3.0, unpublished. Scope and approval: [product review specification](product-review-ready-spec.md).

## Implemented

Reliability changes are integrated with current plugin ownership, Hermes and SkillClaw discovery. The scanner declares incomplete coverage, examines supported skill sidecars, parses Codex TOML with a pinned parser, and reads Claude project/user settings. Reports preserve static evidence and do not claim observed execution.

Direct path scans, SARIF, JSON errors, severity exit gates and line-independent finding fingerprints support agent/CI use. The Mac app adds a top-five review queue, scoped filter counts, asset-to-finding navigation and manual baseline preview/create/accept. Baseline acceptance rescans and checks a content-bound review token; incomplete or incompatible scans remain blocked. Source URLs are explicitly self-declared.

Detection changes keep English documented prohibitions visible at informational severity, distinguish disabled MCP configuration, preserve adjacent active commands, and add bounded prompt-injection/exfiltration heuristics. These are selected deterministic signals, not comprehensive malicious-content detection.

## Validation scope

Regression suites cover scanner/parser boundaries, baseline integrity and concurrency, privacy, reports, packaging controls, direct paths, JSON errors, severity/coverage precedence, stale review rejection, and native model/filter/request behavior. The local completion report records exact test counts and packaging/UI observations. Historical CI runs do not verify this new local integration; fresh remote CI requires a later push.

## Remaining release and research work

- Public npm/GitHub publication, Developer ID signing and notarization require a separate release action; local builds are ad-hoc signed and need external Node.js 20+.
- An Intel binary build does not establish Intel runtime behavior; clean-machine/Gatekeeper and Windows/Linux regressions remain separate checks.
- Validate prioritization with a labeled holdout corpus and five target users. Current fixture results do not establish general precision/recall or usability rates.
- Automatic monitoring, trust enforcement, source attestation, multilingual semantic detection and a bundled Node runtime remain outside this release scope.
