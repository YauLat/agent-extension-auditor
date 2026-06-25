# Agent Extension Auditor

Local-only. No telemetry. No account. No cloud upload. Open source. Does not read or print secret values.

`agent-audit` is a read-only CLI for auditing local agent extensions: skills, plugins, MCP servers, hooks, and related configuration. It produces deterministic risk flags so users can review what is installed before trusting it.

## Install

```bash
npm install -g agent-extension-auditor
```

For local development:

```bash
npm install
npm run build
node dist/cli.js scan
```

## Usage

```bash
agent-audit scan
agent-audit scan --format html --output risk-report.html
agent-audit scan --format markdown --output risk-report.md
agent-audit scan --format json --output risk-report.json
agent-audit scan --min-severity high
agent-audit scan --no-home
agent-audit scan --include .mcp.json --exclude ~/.codex/plugins/cache
agent-audit explain MCP_STDIO_COMMAND
agent-audit doctor
```

Useful scan filters:

- `--min-severity medium|high|critical` keeps the report focused on findings at or above the selected severity.
- `--no-home` scans only project/workspace locations and skips home-directory agent roots such as `~/.claude` and `~/.codex`.
- `--include <path>[,<path>...]` limits scanning to matching paths within the default scan locations.
- `--exclude <path>[,<path>...]` skips matching paths within the default scan locations.

Report formats:

- `terminal` prints a compact local summary.
- `markdown` writes a readable local review packet.
- `json` writes structured data for local automation.
- `html` writes a static local dashboard that opens directly in a browser without a server, upload, or account. The dashboard includes an English / Traditional Chinese UI toggle.

## What It Scans

- Claude skills and plugins under `~/.claude`
- Codex skills and plugin cache under `~/.codex`
- MCP config in `~/.mcp.json`, project `.mcp.json`, and agent config files
- Workspace agent files such as `AGENTS.md`, `CLAUDE.md`, `SOUL.md`, `USER.md`, and `MEMORY.md`
- Workspace `.agents/skills`
- npm-style plugin packages with `package.json`

## What It Detects

- MCP stdio commands
- MCP env references
- package install scripts
- plugin executables
- hook shell commands
- remote script execution patterns
- secret references without printing secret values
- unknown sources
- duplicate skill names
- oversized skill context
- write/delete capability markers
- auto-update behavior markers

## Privacy

The scanner is local-first and read-only. It does not upload, phone home, create accounts, send analytics, or transmit scan results. See [PRIVACY.md](./PRIVACY.md).

## Security Model

This tool does not declare an extension safe or malicious. It highlights review-worthy behavior and explains why each rule matters. See [docs/risk-model.md](./docs/risk-model.md).

## Report Schema

JSON reports are designed for local automation and start with explicit privacy fields:

```json
{
  "tool": "agent-audit",
  "version": "0.1.1",
  "privacy": {
    "telemetry": false,
    "uploaded": false
  },
  "recommendedActions": []
}
```

See [docs/report-schema.md](./docs/report-schema.md).

## Development

```bash
npm install
npm run lint
npm test
npm run build
```

## Contributing

Rule changes must include a matching `rules/<RULE_ID>.md` file and fixture coverage when practical. See [CONTRIBUTING.md](./CONTRIBUTING.md).
