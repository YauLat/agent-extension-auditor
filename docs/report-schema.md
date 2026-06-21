# Report Schema

`agent-audit scan --format json` writes a JSON report with this top-level shape:

```json
{
  "tool": "agent-audit",
  "version": "0.1.0",
  "generatedAt": "ISO-8601",
  "privacy": {
    "telemetry": false,
    "uploaded": false
  },
  "scannedLocations": [],
  "inventory": [],
  "findings": [],
  "summary": {}
}
```

## Privacy Contract

JSON reports must not include secret values. Findings should reference locations, rule IDs, and review guidance rather than copying sensitive strings.

## Stability

The report shape is pre-1.0 and may change, but `privacy.telemetry` and `privacy.uploaded` should remain explicit booleans.
