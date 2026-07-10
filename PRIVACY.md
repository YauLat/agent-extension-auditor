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

Guided repair is also explicit. Repair planning reads a target file but does not write it. Applying the supported repair creates a local backup before changing the file. On macOS, backups are stored under `~/Library/Application Support/Agent Extension Auditor/Backups` with directory mode `0700` and file mode `0600`. Backups are never uploaded, but they may contain the original local file and should be protected like the source file.
