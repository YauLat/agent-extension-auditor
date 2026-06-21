# Threat Model

Agent Extension Auditor helps users review local agent extension risk.

## In Scope

- MCP server definitions that start local commands.
- MCP server definitions that reference environment variables.
- Plugin packages with install lifecycle scripts.
- Hook-like settings that can execute shell commands.
- Remote script execution patterns.
- Duplicate or oversized skills.
- Unknown extension provenance.

## Out Of Scope

- Proving an extension is malicious.
- Sandboxing or blocking execution.
- Automatically installing, deleting, or repairing extensions.
- Uploading reports for remote analysis.
- Reading or validating secret values.

## Main Risk

Agent extensions can execute code, receive credentials, read local files, or mutate workspace state. The tool highlights these capabilities so users can review them before enabling or installing extensions.
