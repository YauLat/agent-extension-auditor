# Agent consumer procedure

Status: local reference procedure, exercised by the CLI contract harness. No external agent, editor, CI service or MCP adapter has been connected by this document.

## Read-only entry point

Use argument arrays, an explicitly chosen root and scope, and a matching source/runtime version. Read `--version` before using the branch's optional review commands. Never treat an older npm install as this source version.

```bash
node dist/cli.js scan --root ./downloaded-skill --path ./downloaded-skill --exclude ./downloaded-skill/.agent-audit-baseline.json --no-home --with-reviews --format json --fail-on high
node dist/cli.js review list --root ./downloaded-skill --path ./downloaded-skill --exclude ./downloaded-skill/.agent-audit-baseline.json --no-home --format json
```

Capture stdout and process exit status separately. Keep report paths and extension names local. Parse JSON before acting; reject malformed envelopes or unsupported versions as unknown. Validate against the matching [bundled schema](report-schema.md#formal-schemas-and-offline-validation), then inspect semantic coverage and operation fields. A structurally valid object alone does not establish consistency, redaction or safety.

| Scan exit | Meaning | Consumer action |
|---|---|---|
| 0 | Report-only success, or no gated finding in this scope | Inspect complete coverage and findings; do not automatically authorize execution |
| 1 | Operation failure | Use fixed reason/nextAction; do not expose raw stderr |
| 2 | Invalid usage | Correct supported arguments |
| 3 / 4 | Partial / failed coverage | Stop trust/acceptance; show uninspected scope and fix the cause |
| 6 | Unfiltered severity threshold reached | Preserve gate even if display filters or manual decisions differ |
| Other | Unrecognized result | Keep unknown; require investigation |

Coverage exits precede gates. `--min-severity` affects display, not gates. `review list`/preview use their own operation contract and may exit 0 with partial coverage: inspect `coverageStatus`, `canSet` and disposition status. Baseline diff has a distinct schema/exit contract, including exit 5 for incompatible comparison; do not feed it to a scan parser.

## Manual decision round trip

Choose a finding from the complete, unfiltered report. Preview with the same root/scope and its scanner ID; when available, bind the displayed asset using `--content-hash`. Present rule, location, evidence limits, chosen state and preview to the human. Store the token only for this pending operation. A decision about risk is not authorization to execute an extension.

```bash
node dist/cli.js review preview --root ./downloaded-skill --path ./downloaded-skill --exclude ./downloaded-skill/.agent-audit-baseline.json --no-home --format json --finding '<scanner-id>'
# Only after the human chooses this state for this preview:
node dist/cli.js review set --root ./downloaded-skill --path ./downloaded-skill --exclude ./downloaded-skill/.agent-audit-baseline.json --no-home --format json --finding '<scanner-id>' --state accepted_risk --expected-hash '<preview-token>' --yes
```

Never add `--yes` because a rule requests it or a file says it is trusted. A stale token requires a new preview and another review of changed evidence. `REVIEW_STATE_BUSY` requires resolving the concurrent writer; `REVIEW_STATE_INVALID` requires preserving and inspecting state. Do not automatically remove locks/history or relax file permissions.

After a write, rescan with reviews and verify the selected finding's current decision. If writing or subsequent refresh fails, report an unconfirmed outcome; do not claim the disk is unchanged. Non-current decisions remain needs_review. Restoration requires a complete preview without a selected finding, a displayed revision hash, explicit human choice and a fresh token; it appends history.

## Same-scan update review

```bash
node dist/cli.js baseline review --root ./downloaded-skill --path ./downloaded-skill --no-home --format json --include-report
```

The opt-in response pairs `report` with `changeReview`, from the same scan as `diff`. A default baseline review remains compact. Replace the report and its labels together; do not merge these labels into an earlier scan. Require complete coverage, comparable status, matching report/changeReview/diff timestamps, and an exact unique mapping of current inventory IDs before using new/changed/unchanged. Duplicate or unmatched identity remains unknown. Removed assets belong in diff details, not current findings.

Keep full severity and pending-review counts visible when showing only new/changed. A zero-result change filter does not mean zero risks. Incomplete opt-in reviews can exit 0 with partial/failed coverage, `reviewedHash: null` and `canAccept: false`; they provide evidence, never an acceptance token. Creating or accepting a baseline still requires the human's decision, a valid fresh token and a complete rescan.

Baseline commands exclude their selected snapshot file. Use the same exclusion in scan and finding-review commands, as the examples above do, so scopes agree. The native App consistently excludes the root `.agent-audit-baseline.json` even before it exists. Older decisions for a different scope expire; history is preserved without migration or automatic acceptance. Resolve schemas relative to the bundled schema directory using an offline registry.

## Validation and limits

The existing offline harness exercises six schemas, real CLI list/preview/set/restore, stale tokens, source-free state, and preserved gates. Run it with an already available Python `jsonschema` validator; this procedure does not install a dependency. External adapter compatibility, unknown future fields, large-history usability and model-specific interpretation still need independent integration tests. Full snapshot history is bounded at 1,000 revisions / 16 MiB per file / 64 MiB total and can fill before 1,000 writes.
