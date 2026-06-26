# Agent Extension Auditor

Know what your local AI agents can run before you trust them.

`agent-audit` is a local-first risk reviewer for agent extensions: skills, plugins, MCP servers, hooks, config files, and npm-style packages. It turns a messy local agent setup into a categorized review queue, without uploading your files or printing secret values.

**Language:** [English](./docs/languages.md#english) · [繁體中文](./docs/languages.md#traditional-chinese) · [简体中文](./docs/languages.md#simplified-chinese) · [日本語](./docs/languages.md#japanese) · [한국어](./docs/languages.md#korean) · [Español](./docs/languages.md#spanish) · [Français](./docs/languages.md#french) · [Deutsch](./docs/languages.md#german) · [Português](./docs/languages.md#portuguese)

## Why Use It

Modern agent tools can load local skills, run MCP servers, install plugins, execute hooks, and read configuration from several hidden folders. That power is useful, but it is hard to review by hand.

Agent Extension Auditor helps you answer practical questions:

- Which local extensions can execute commands?
- Which MCP servers receive environment variables?
- Which packages define install scripts or executables?
- Which hooks or docs mention write/delete behavior?
- Which skills have unknown sources, duplicate names, or oversized context?
- Where should I start reviewing first?

It is not an antivirus engine and does not claim an extension is safe or malicious. It gives you a structured, local review surface.

## What You Get

- `agent-audit scan` for terminal, Markdown, JSON, and static HTML reports.
- `agent-audit ui` for a no-browser terminal UI grouped by extension type and severity.
- Categorized HTML reports for large skill libraries.
- Severity filtering with `critical`, `high`, `medium`, `low`, and `info`.
- Read-only scanning: no install, sync, delete, or auto-fix behavior.
- Privacy-first defaults: no telemetry, no cloud upload, no account, no secret value printing.

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

## Quick Start

```bash
agent-audit scan
agent-audit ui
agent-audit scan --format html --output risk-report.html
agent-audit scan --min-severity high
agent-audit scan --no-home
```

Open the HTML report directly from disk. It does not need a server, account, or upload.

## Commands

```bash
agent-audit scan
agent-audit scan --format terminal
agent-audit scan --format markdown --output risk-report.md
agent-audit scan --format json --output risk-report.json
agent-audit scan --format html --output risk-report.html
agent-audit scan --min-severity medium|high|critical
agent-audit scan --no-home
agent-audit scan --include .mcp.json --exclude ~/.codex/plugins/cache
agent-audit ui
agent-audit explain MCP_STDIO_COMMAND
agent-audit doctor
```

Useful scan filters:

- `--min-severity medium|high|critical` keeps reports focused on higher-priority findings.
- `--no-home` scans only project/workspace locations and skips home-directory agent roots such as `~/.claude` and `~/.codex`.
- `--include <path>[,<path>...]` limits scanning to matching paths within the default scan locations.
- `--exclude <path>[,<path>...]` skips matching paths within the default scan locations.

## Review Interfaces

Terminal UI:

- `agent-audit ui` opens a local read-only terminal interface.
- Findings are grouped by extension type and severity.
- Keyboard shortcuts: left/right changes category, `1`-`5` selects severity, `0` or `a` shows all severities, up/down moves selection, `q` quits.

Report formats:

- `terminal` prints a compact local summary.
- `markdown` writes a readable local review packet.
- `json` writes structured data for local automation.
- `html` writes a static local dashboard. It includes categorized inventory cards, severity groups, an advanced findings table, and language options.

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

This tool highlights review-worthy behavior and explains why each rule matters. It does not declare an extension safe or malicious. See [docs/risk-model.md](./docs/risk-model.md).

## Report Schema

JSON reports are designed for local automation and start with explicit privacy fields:

```json
{
  "tool": "agent-audit",
  "version": "0.1.2",
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
