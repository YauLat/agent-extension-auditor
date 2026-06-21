# Risk Model

Agent Extension Auditor reports risk signals, not verdicts.

## Severity

- `info`: metadata or inventory details that help review.
- `low`: behavior that is usually benign but worth recording.
- `medium`: behavior involving environment references, network endpoints, or broader local access.
- `high`: executable hooks, package install scripts, MCP stdio commands, or write/action capability.
- `critical`: remote script execution, credential exfiltration patterns, dangerous delete/write commands, or similar high-impact patterns.

## Principles

- Do not print secret values.
- Prefer deterministic rules over opaque AI judgment.
- Explain every rule.
- Keep findings reviewable and conservative.
- Do not mutate the scanned environment.
