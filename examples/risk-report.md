# Agent Extension Audit

Generated at: 2026-06-21T00:00:00.000Z

Privacy: telemetry disabled, no data uploaded.

## Executive Summary

- Skills: 2
- Plugins: 1
- MCP servers: 1
- Hooks: 1
- Findings: 4

## Risk Summary

| Severity | Count |
| --- | ---: |
| Critical | 0 |
| High | 2 |
| Medium | 1 |
| Low | 1 |
| Info | 0 |

## Findings by Severity

### High

- `MCP_STDIO_COMMAND` in `~/.mcp.json`: MCP server starts a local command. Review the binary and arguments before trusting it.
- `PLUGIN_POSTINSTALL` in `~/.codex/plugins/cache/example/package.json`: Package install lifecycle script can execute during install.

### Medium

- `MCP_ENV_REFERENCE` in `~/.mcp.json`: MCP server references environment variables. Secret values are not printed.

### Low

- `UNKNOWN_SOURCE` in `~/.claude/skills/example/SKILL.md`: Extension source could not be determined.

## Recommended Manual Review

Review high and critical findings before installing or enabling the related extension.
