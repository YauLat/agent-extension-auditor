# Reliability work status — 2026-09-30

Approved scope: improve the existing auditor's privacy and scan reliability (F01–F05), validate a review branch, then progress to local baseline/manual change review. Source branch: `codex/auditor-reliability`. Baseline: `d36b4c88c5b06b9902d9463a30997f2a0c4990d1`.

## Implemented for review

- Fixed parser diagnostics with no source excerpts; malformed JSON/TOML makes coverage incomplete.
- Schema 2 coverage, declared filters/limits, read/skipped counts and reasons; CLI exits 3/4 and explicit compatibility flag.
- Shared skills, Claude settings/project skills, Codex TOML, bounded canonical symlinks/aliases.
- Bundled skill text/script inspection, static evidence distinctions and hook command-leaf deduplication.
- Coverage UI in terminal/Markdown/HTML, JSON loader prototype and native Mac UI; legacy reports remain readable with unknown coverage.
- Separately packaged scanner includes pinned TOML parser and license.
- P2 CLI baseline review: private local snapshots, manual diff, explicit accept/delete, content-bound review hashes, and compatibility gates for rules, report schema, scope and incomplete scans.
- Baseline review includes file permission bits, so making a bundled script executable requires review; the baseline file itself is excluded from its scan scope to prevent self-generated changes.

## Verification

- Linux x64, Node 24.19.0: typecheck, **74 tests**, build and whitespace checks pass.
- Original isolated C01 positive control remains valid. R01–R08 no longer reproduce against the new build. This covers selected synthetic cases, not a general detection-rate claim.
- Follow-up boundary fixes prevent symlinks bypassing default directory exclusions and reject nonexistent/inaccessible home or workspace roots instead of showing complete coverage. Additional cases cover malformed TOML, permission failures, nested configuration limits, broken/cyclic/out-of-scope links, exclusions, binary content, stable counts, CLI exit behavior and running the copied runtime independently.
- GitHub Actions run [36702041700](https://github.com/YauLat/agent-extension-auditor/actions/runs/36702041700) passed Node 20, macOS arm64 and macOS x86_64 on P2 head `5a826f2db96ac97cee50469b33cd7cebf3117c27`. The latest permission/self-baseline changes require a fresh CI run after push. No local Mac UI, Finder launch, Claude review, Developer ID signing, notarization or Gatekeeper validation has been performed here.
- P2 synthetic checks cover timestamp stability, content-identical skill moves, bundled content and executable-bit changes, new MCP network endpoints, self-baseline exclusion, incompatible rule/scope state, incomplete scans, private persistence, symlink/hard-link rejection, and explicit CLI confirmation. These are selected regression cases, not a claim about all change-detection cases.

## Next work

1. Run fresh branch CI for the executable-mode/self-baseline checkpoint and repair any platform failure before treating it as stable.
2. Review baseline matching semantics and add negative cases without weakening the incomplete-scan contract.
3. Native Mac baseline controls and automatic monitoring are not implemented. The first P2 slice is intentionally manual CLI create → diff → accept/delete.
4. F06 release remains separate: source version is still 0.2.2, last verified published npm/GitHub release is 0.2.1. No version, tag, npm publish or formal Mac release has been issued by this branch.

Continue on this branch, inspect current remote and local state first, preserve user edits, and avoid parallel writes to an active worktree. Scheduled progress updates continue through 23:00 Hong Kong time on September 30.
