# Reliability work status — 2026-09-30

Approved scope: improve the existing auditor's privacy and scan reliability (F01–F05), validate a review branch, then progress to local baseline/manual change review. Source branch: `codex/auditor-reliability`. Baseline: `d36b4c88c5b06b9902d9463a30997f2a0c4990d1`.

## Implemented for review

- Fixed parser diagnostics with no source excerpts; malformed JSON/TOML makes coverage incomplete.
- Schema 2 coverage, declared filters/limits, read/skipped counts and reasons; CLI exits 3/4 and explicit compatibility flag.
- Shared skills, Claude settings/project skills, Codex TOML, bounded canonical symlinks/aliases.
- Bundled skill text/script inspection, static evidence distinctions and hook command-leaf deduplication.
- Coverage UI in terminal/Markdown/HTML, JSON loader prototype and native Mac UI; legacy reports remain readable with unknown coverage.
- Separately packaged scanner includes pinned TOML parser and license.

## Verification

- Linux x64, Node 24.19.0: typecheck, **62 tests**, build and whitespace checks pass.
- Original isolated C01 positive control remains valid. R01–R08 no longer reproduce against the new build. This covers selected synthetic cases, not a general detection-rate claim.
- Additional cases cover malformed TOML, permission failures, nested configuration limits, broken/cyclic/out-of-scope links, exclusions, binary content, stable counts, CLI exit behavior and running the copied runtime independently.
- Swift source changes and native decoding tests are present; macOS arm64/x86_64 CI is pending for this branch. No local Mac UI, Finder launch, Claude review, Developer ID signing, notarization or Gatekeeper validation has been performed here.

## Next work

1. Inspect branch CI and repair any platform failure before treating this as ready to merge.
2. Review scope/count semantics and negative cases; retain genuine limitations in the coverage contract.
3. P2 baseline/manual changes review is not implemented in this checkpoint. It must handle incomplete scans, schema/rule/scope incompatibility, content-based review approval, and moved assets without storing secrets or raw command arguments.
4. F06 release remains separate: source version is still 0.2.2, last verified published npm/GitHub release is 0.2.1. No version, tag, npm publish or formal Mac release has been issued by this branch.

Continue on this branch, inspect current remote and local state first, preserve user edits, and avoid parallel writes to an active worktree. Scheduled progress updates continue through 23:00 Hong Kong time on September 30.
