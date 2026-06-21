# Privacy

Agent Extension Auditor is designed to be local-first.

- No telemetry.
- No cloud upload.
- No accounts.
- No advertising.
- No paid tracking.
- No remote API calls.
- No secret values printed in terminal, Markdown, or JSON reports.

The CLI reads local files to detect extension metadata and risk signals. If it finds an environment variable or secret-looking reference, the report names the rule and location, not the secret value.

Report files are only written when the user explicitly passes `--output`.
