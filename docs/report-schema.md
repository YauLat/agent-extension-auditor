# Report Schema

`agent-audit scan --format json` writes a JSON report with this top-level shape. `agent-audit scan --format html` renders the same report data into a static local dashboard with escaped HTML fields and browser-only filters.

```json
{
  "tool": "agent-audit",
  "version": "0.1.1",
  "generatedAt": "ISO-8601",
  "privacy": {
    "telemetry": false,
    "uploaded": false
  },
  "scannedLocations": [],
  "inventory": [],
  "findings": [],
  "summary": {},
  "recommendedActions": []
}
```

## Privacy Contract

JSON and HTML reports must not include secret values. Findings should reference locations, rule IDs, and review guidance rather than copying sensitive strings. HTML reports are designed to be opened directly from disk and should remain local because they can contain local paths.

## Filters

`--min-severity` filters findings before rendering and recomputes `summary.findings` and `recommendedActions`.
`--no-home`, `--include`, and `--exclude` change which default scan-location paths are scanned, so `scannedLocations`, `inventory`, and `findings` should be interpreted relative to those filters.

HTML reports also include local browser filters for severity, rule ID, inventory type, location keyword, and free-text search across rule, message, and path fields. These filters run entirely in the browser and do not upload data.

## Stability

The report shape is pre-1.0 and may change, but `privacy.telemetry` and `privacy.uploaded` should remain explicit booleans.
