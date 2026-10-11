# ENV_NETWORK_EXFILTRATION

Severity: high

Detects a direct `process.env` or `os.environ` reference inside a balanced `fetch`, `requests.post/put/patch` or `axios.post/put/patch` call, within 1,000 characters. String literals and comments are masked. Source and endpoint text are never copied into findings.

Review the whole payload and destination before execution. This is static proximity, not proven data flow or malicious intent. Authorized uploads may trigger it. Aliases, intermediate variables, template interpolation, other HTTP clients and obfuscation can evade it. Runtime activity remains unknown.
