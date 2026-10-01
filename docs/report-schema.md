# Report Schema

`agent-audit scan --format json` writes a JSON report with this top-level shape. `agent-audit scan --format html` renders the same report data into a static local dashboard with escaped HTML fields and browser-only filters.

```json
{
  "tool": "agent-audit",
  "version": "0.3.0",
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
