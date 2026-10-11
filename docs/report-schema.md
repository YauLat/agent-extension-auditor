# Report Schema

`agent-audit scan --format json` writes a JSON report with this top-level shape. `agent-audit scan --format html` renders the same report data into a static local dashboard with escaped HTML fields and browser-only filters.

```json
{
  "tool": "agent-audit",
  "version": "0.3.2",
  "schemaVersion": 2,
  "generatedAt": "ISO-8601",
  "privacy": {
    "telemetry": false,
    "uploaded": false
  },
  "coverage": {"status": "complete", "filesRead": 0, "filesSkipped": 0, "directoriesSkipped": 0, "scope": {}, "diagnostics": []},
  "scannedLocations": [],
  "inventory": [],
  "findings": [],
  "summary": {},
  "recommendedActions": []
}
```

## Privacy Contract

JSON and HTML reports must not include secret values. Findings should reference locations, rule IDs, and review guidance rather than copying sensitive strings. HTML reports are designed to be opened directly from disk and should remain local because they can contain local paths.

New findings can include evidence and remediation metadata without file contents:

```json
{
  "evidence": {
    "kind": "documented",
    "confidence": "medium",
    "active": "unknown"
  },
  "remediation": {
    "mode": "review",
    "title": "Manual review required",
    "summary": "Review the trigger and side effects."
  }
}
```

`mode: guided` is currently limited to `UNKNOWN_SOURCE` on `SKILL.md`, with action ID `skill.add-source`. Reports describe the supported action but never embed original or replacement file contents.

## Filters

`--min-severity` filters findings before rendering and recomputes `summary.findings` and `recommendedActions`.
`--no-home`, `--include`, and `--exclude` change which default scan-location paths are scanned, so `scannedLocations`, `inventory`, and `findings` should be interpreted relative to those filters.

HTML reports also include local browser filters for severity, rule ID, inventory type, location keyword, and free-text search across rule, message, and path fields. These filters run entirely in the browser and do not upload data.

The HTML UI includes an English / Traditional Chinese toggle for report chrome such as headings, filters, table labels, severity labels, inventory labels, empty states, and privacy text. The toggle is browser-only and does not change the JSON report schema.

HTML reports now put categorized inventory/finding cards before the full findings table. Categories are derived from existing `inventory.type` and finding `itemId` data, so this does not change the JSON schema. Inside each category, findings are grouped by severity before the full table. The full table remains available in an advanced review section.

## Stability

The report shape is pre-1.0 and may change, but `privacy.telemetry` and `privacy.uploaded` should remain explicit booleans.

## Coverage, fingerprints and automation

The example above abbreviates `coverage.scope`; see [scan coverage](scan-coverage.md) for declared limits, filters and diagnostics. Coverage is `complete`, `partial`, or `failed` within that declared scope. It is never a malware-free verdict. Legacy reports without coverage are unknown. Direct scans declare `scope.explicitPaths`.

Each finding has a `fingerprint` suitable for SARIF correlation. It excludes line numbers so unrelated leading line changes do not create a new identity; moving paths, changing severity, or changing occurrence ordering can change it. `id` remains a per-report identifier.

`--format sarif` emits SARIF 2.1.0 rules, locations, levels, fingerprints, and coverage notifications. Paths may identify local resources and should be reviewed before sharing. `invocations.executionSuccessful` is false for incomplete coverage.

`--format json` failures use `{ "tool": "agent-audit", "schemaVersion": 2, "error": { "code": "INVALID_USAGE", "message": "..." } }` or `OPERATION_FAILED`, with fixed messages rather than source excerpts. Successful output retains the scan-report shape. Exit codes: 0 success/report-only, 1 operation error, 2 invalid usage, 3 partial coverage, 4 failed coverage, 6 explicit severity gate. Coverage exits take priority; presentation filters cannot hide findings from a severity gate.

Baseline JSON preview is a separate contract from scan reports. `baseline review --format json` returns `exists`, `reviewedHash`, `canAccept`, asset summaries, and an optional `diff`. JSON create/accept requires `--expected-hash` from that preview. Changes in scanned data or the previous baseline invalidate the hash. Baselines are local review state, not signatures or guarantees against a malicious local writer.

## Review relevance and explanations (0.3.2)

Findings add optional `review: {context, priority}`. Context is `current`, `example`, `disabled`, or `archived`; lower priority values come first in native review: current code/configuration 0, documented 1, metadata 2, explicitly unsafe fenced example 3, explicitly disabled MCP 4, archive path 5. Severity, coverage, fingerprints and runtime activity remain unchanged. Archive classification uses exact archive directory segments; a current alias keeps a canonical archived asset in current review. An example requires an explicit unsafe-example label immediately before a closed fenced block. Generic code fences are not downgraded. JSON finding order remains severity-first; native overview/list use the separate review priority. Legacy reports retain severity-first review.

`explanation: {detected, impact, limits}` contains fixed rule guidance, never inspected source. Native details show these separately from location and recommended action.

JSON errors now add safe `reason`, whitelisted `operation`, `retryable` and `nextAction`. Reasons include `INVALID_ARGUMENT`, `INPUT_PATH_UNAVAILABLE`, `REVIEW_REQUIRED`, `REVIEW_STALE`, `SCAN_INCOMPLETE`, `BASELINE_INVALID`, `BASELINE_OPERATION_FAILED`, `REVIEW_STATE_INVALID`, `REVIEW_STATE_BUSY` and `UNKNOWN_FAILURE`. `retryable: false` means do not blindly repeat the same request; perform the stated next action. Codes and exit statuses remain compatible.

All baseline JSON success responses add a common `response: {tool: "agent-audit", schemaVersion: 2, operation}` envelope and a top-level operation. Flat payload fields remain compatible; baseline diff retains its existing top-level tool/schemaVersion 1. Preview/create/accept/delete also expose tool/schemaVersion 2 at the top level. Baseline snapshot files remain schema 1 without migration. JSON delete returns a structured `deleted` result; deletion still requires `--yes`.

## Formal schemas and offline validation

JSON Schema 2020-12 contracts are included in the npm package:

- [Schema-2 scan report](schemas/scan-report-v2.schema.json): complete, partial and failed coverage; explicit privacy/activity values; optional review and explanation fields.
- [Schema-2 safe CLI errors](schemas/cli-error-v2.schema.json): enumerated reasons/actions and closed error fields.
- [Versioned baseline success response](schemas/baseline-response-v2.schema.json): operation-specific preview/write/delete/diff payloads; the diff retains its top-level schema 1 and carries the common schema-2 response envelope.
- [Schema-1 baseline snapshot](schemas/baseline-snapshot-v1.schema.json): complete coverage and hash fields. This describes structure; the baseline reader additionally verifies internal hash consistency.
- [Schema-2 finding review responses](schemas/review-response-v2.schema.json): list, preview, set and restore operation payloads.
- [Schema-1 private review history](schemas/review-state-v1.schema.json): strict hash-only decision records; the reader additionally validates file privacy and the unbroken revision chain.

Run `npm run build`, then `python3 scripts/validate-json-contracts.py` in an environment that already has `jsonschema` with Draft202012Validator support. Set `AEA_NODE` to an existing Node executable if required. The script uses only local temporary synthetic assets, checks real CLI responses and malformed controls, and does not execute inspected extensions. No runtime scanner dependency is added. Legacy reports require a legacy consumer; they intentionally do not validate against the schema-2 report contract. Unknown additive report/baseline fields remain permitted; safe error objects are closed. Structural validation cannot establish redaction, scanner accuracy, summary consistency, or trust.

The dialect and composition follow the [official JSON Schema reference](https://json-schema.org/understanding-json-schema/reference/combining).

## Per-finding manual decisions

`scan --with-reviews` adds optional `disposition: {state, status, reviewedAt?}` to each finding. States are `needs_review`, `accepted_risk` and `false_positive`. Status is `unreviewed`, `current`, `stale` or `unavailable`. Only a current, complete and uniquely bound decision applies; stale/unavailable/unreviewed decisions always have state `needs_review`. A current decision has a review timestamp. Legacy reports can omit the field. This field does not change severity, risk totals, coverage, runtime activity or `--fail-on`.

`review list` reports coverage, the current revision and finding decisions. `review preview --finding <id>` returns a content-bound token and `canSet`; `review set --finding <id> --state <state> --expected-hash <token> --yes` rescans inside an exclusive storage lock and requires the token to match. `--content-hash` can bind a preview to the originally displayed asset. For restoration, obtain a preview without `--finding`, choose a hash from `revisions`, then use `review restore --revision <hash> --expected-hash <token> --yes`. Use the same root, paths, includes, excludes and Home scope throughout. Review commands require JSON output and do not accept severity filters or incomplete-scan opt-outs.

`review list` and preview can return exit 0 with incomplete coverage so the caller can inspect the problem. Always inspect `coverageStatus` and `canSet`; exit 0 alone is not a complete-scan verdict. Rule evaluator changes must also bump `RULESET_VERSION`; the stored ruleset hash covers that version and rule definitions, not the entire executable.

Read-only commands never create review storage. Writes append private versions under `<root>/.agent-audit-reviews` (directory `0700`, files `0600`), without paths, source, names, raw commands, secrets or freeform notes. The root must belong to the current user and must not be writable by group/others. This is local integrity checking, not a signature against a malicious owner. Versions are retained; restoration adds a new version and does not erase newer history. Invalid files, symlinks, hardlinks, unknown fields, chain forks/gaps, stale tokens and incomplete scans fail closed with safe errors. A crash lock is not automatically removed. Recovery requires inspecting and preserving the private state first; no automatic deletion or migration occurs.

Bounds are 1,000 revisions, 16 MiB per file and 64 MiB total. Each revision contains a complete decision snapshot, so total history can reach its byte limit before the revision count; the next write is refused without deleting old decisions. This is a bounded local workflow, not unlimited bulk annotation. Content can still change after the fresh scan; decisions certify only the bytes inspected and expire on the next scan. They never authorize extension execution.

The reserved storage directory changes the scope exclusion policy. Existing baselines may be incompatible and need explicit manual review. The updated Mac app requires a matching scanner supporting `--with-reviews`; pairing it with an earlier external CLI is unsupported. In the Mac app, check current content, choose a state and explicitly save. Counts distinguish pending decisions from reviewed decisions while retaining all risk counts.

## Same-scan change review

`baseline review --include-report` optionally adds `report` (scan-report-v2) and `changeReview` (`status`, `generatedAt`, `items` with `itemId` and new/changed/unchanged/unknown). The report, diff and mapping use one scan; consumers must verify timestamps and exact unique item IDs before using labels. Duplicate baseline or current identities remain unknown even when the legacy diff matches equal content. Current item IDs refer only to that returned report; do not join another report by asset names or path prefixes. Removed assets have no current label.

Partial opt-in reviews return useful full findings, a null acceptance token and `canAccept: false`. Default review retains its incomplete-scan error. The snapshot and diff persistence schemas are unchanged. Report scope excludes the selected baseline file. Change labels do not change disposition, severity, coverage or gate results; using a different scope expires prior decisions as usual. Relative report-schema references must be resolved from this schema directory; the offline harness registers all six local schemas and makes no network request.
