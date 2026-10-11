# Product review-ready release specification

Status: approved for local implementation by the user's 2026-10-01 instruction to complete the reviewed improvements without further questions.

## Goal

Make local extension review reliable and actionable for humans and agents: explicit coverage, complete supported skill-package inspection, meaningful risk prioritization, persistent manual change review, and documented machine-readable gates.

## Non-goals

No cloud service, telemetry, execution of scanned components, automatic trust/quarantine, public push/publish, Apple credentials or notarization. No claim of comprehensive malware detection. Preserve the primary checkout and existing local artifacts.

## Current behavior

Main b279b5f has broad inventory and native configuration metadata but silently skips some input, reads only SKILL.md for skills, lacks direct-path scanning and severity CI gates, and shows global counts under narrowed filters. Draft reliability PR ea40e94 supplies coverage and manual CLI baselines but predates current plugin/Hermes/SkillClaw discovery.

## Proposed behavior

1. Integrate the reliability branch while preserving latest discovery, plugin ownership and native UI metadata. Invalid/incomplete scans remain explicit across formats and fail closed for baseline operations.
2. Add direct local path inspection, stable finding fingerprints, structured JSON errors, optional severity exit gates and SARIF. Keep default scanning report-only; incomplete scan status takes precedence.
3. Distinguish documented prohibitions from executable instructions without suppressing adjacent risky content; disabled configuration remains visible with reduced urgency. Add a bounded, explainable prompt-injection/exfiltration heuristic with documented limits.
4. Add native manual baseline create/compare/accept controls using existing content-bound guarded CLI operations. Show changes and require explicit user acceptance; never silently update trust.
5. Scope native counts consistently and allow inventory finding navigation; provide concrete next actions and clearly label self-declared source metadata.
6. Start the native app with an explicit scan action so scope can be selected before a large Home scan. Preserve finding selection across navigation.
7. Update version/documentation and package a locally runnable Mac app with the matching scanner. Preserve existing build artifacts.

## Affected modules

Scanner/reader/targets, types/rules, CLI/report formats, baseline, Swift models/store/runner/review views, runtime packaging, tests and docs. One owner: Codex. Reuse the existing clean development worktree on codex/product-review-ready.

## Verification plan

Run negative cases before changes; preserve discovery and baseline regressions; verify invalid path/size/JSON, bundled scripts, prohibited commands and adjacent positive controls, disabled MCP, JSON errors, fail-on and SARIF. Run full Node typecheck/tests/build, Swift tests, diff/privacy checks, isolated bundled CLI and local native UI smoke. Validate that creating/accepting a baseline does not modify scanned assets and stale/partial results cannot be approved.

## Risks and rollback

Integration can regress manifest discovery. Schema and fingerprint changes invalidate incompatible baselines intentionally. Context heuristics remain conservative signals, not safety verdicts. Review state must be local, private and content-bound. Pinned TOML dependency requires source/lockfile/runtime license review and packaging validation. Roll back through Git to b279b5f; do not reset other worktrees or remove user data.

## Delivery criteria

Integrated source, passing checks, matching local app and CLI, updated usage/limits and a final completion packet. Remaining external release prerequisites and any unverified platform behavior are reported explicitly.
