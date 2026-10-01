# Performance, detection evaluation and first-use specification

Status: approved for local implementation under the user's continuing optimization instruction (2026-10-01).

## Goal
Make large inventories practical, measure rule behavior honestly, and make the first scan and baseline review discoverable without external setup guidance.

## Current behavior
Skill ownership repeatedly filters every skill for every candidate file inside every skill loop. Native scanning provides no cancellation, starts with a folder/scope hint, and hides package mode in Settings. Selected fixtures pass, but no repeatable scale benchmark or labeled evaluation corpus is provided.

## Proposed behavior
- Index nearest skill ownership once, preserving scan order, nested boundaries, aliases and content hashes. Record before/after time and peak RSS on identical synthetic datasets; avoid flaky timing gates in unit tests.
- Add a frozen 100-case synthetic corpus (50 positive/50 negative), separate calibration and evaluation splits, per-rule/evidence metrics and reproducible commands. Tune only calibration cases; report remaining evaluation misses openly.
- Put folder and scope controls on the first-use screen, make Home exclusion explicit in package mode, show elapsed scan time and allow cancelling the owned scanner process. A cancelled result must never replace a previous report.
- Verify native baseline acceptance after the previous realpath repair. Prepare a five-user, seven-day protocol and blank evidence sheet; do not claim real-user validation or contact people.

## Non-goals
No cloud upload, executing scanned scripts, automatic trust, public release, installing new tools, or assertions of general detection accuracy. No change to scope/size/symlink protections.

## Files
Scanner and native runner/store/views; benchmark/evaluation scripts and corpus; focused regression tests; docs. One owner: Codex. Reuse codex/product-review-ready and its existing worktree; preserve the primary checkout.

## Verification
Compare inventory/findings/content hashes on identical fixtures; nested skill and prefix-boundary tests; full Node/Swift suites, cancellation integration test, synthetic benchmark with timeouts, frozen evaluation metrics, native first-use/baseline smoke, universal local packaging and diff/privacy checks.

## Risks and rollback
Indices must preserve nearest ownership and deterministic order. Cancellation must target only the current child and synchronize process registration. Synthetic templates are not representative accuracy evidence. Revert this work to ad99f36 if needed; preserve user data and existing App builds.
