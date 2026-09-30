# Agent Extension Auditor

Know what your local AI agents can run before you trust them.

`agent-audit` is a local-first risk reviewer for agent extensions: skills, plugins, MCP servers, hooks, config files, and npm-style packages. It turns a messy local agent setup into a categorized review queue, without uploading your files or printing secret values.

**Language:** [English](./docs/languages.md#english) · [繁體中文](./docs/languages.md#traditional-chinese) · [简体中文](./docs/languages.md#simplified-chinese) · [日本語](./docs/languages.md#japanese) · [한국어](./docs/languages.md#korean) · [Español](./docs/languages.md#spanish) · [Français](./docs/languages.md#french) · [Deutsch](./docs/languages.md#german) · [Português](./docs/languages.md#portuguese)

**Open source:** MIT licensed. The CLI is distributed through npm, and the complete CLI and macOS app source is maintained on GitHub. There is no hosted service, commercial edition, account system, or private backend.

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
- A native macOS SwiftUI app with categorized inventory cards and finding inspectors.
- Categorized HTML reports for large skill libraries.
- Severity filtering with `critical`, `high`, `medium`, `low`, and `info`.
- Read-only scanning plus an explicit guided repair for adding user-supplied source metadata to `SKILL.md`.
- Repair preview, confirmation, content-hash protection, private backup, rescan, and guarded rollback.
- Scan coverage status and safe diagnostics for unreadable, oversized, excluded, unsupported, or invalid files.
- Canonical skill aliases, bundled script inspection, and Claude/Codex settings support.
- Privacy-first defaults: no telemetry, no cloud upload, no account, no secret value printing.

## Install The CLI

```bash
npm install -g agent-extension-auditor
agent-audit --version
```

Or run from source:

```bash
npm install
npm run build
node dist/cli.js scan
```

## macOS App

The macOS app is an optional native SwiftUI interface. It is not distributed through the Mac App Store. Starting with `v0.2.2`, tagged GitHub releases can include a universal, Developer ID-signed, notarized ZIP and its SHA-256 checksum. Node.js 20 or newer must still be installed on the Mac because the app bundles the scanner, not a Node runtime.

Requirements: macOS 14 or newer, Xcode 26, and Node.js 20 or newer.

Local source builds remain ad-hoc signed and never use a release certificate unless an explicit `MACOS_SIGN_IDENTITY` is supplied:

```bash
swift test --package-path apps/macos
apps/macos/scripts/package-app.sh
open "apps/macos/build/release/Agent Extension Auditor.app"
```

Release packaging fails closed unless a `Developer ID Application` identity and an existing notarization Keychain profile are supplied. See [apps/macos/README.md](./apps/macos/README.md) for build, signature, checksum, runtime, and repair details.

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
agent-audit repair plan --action skill.add-source --path ./SKILL.md --source https://github.com/owner/repository
agent-audit baseline create --no-home
agent-audit baseline diff --no-home
agent-audit baseline accept --no-home --yes
```

Useful scan filters:

- `--min-severity medium|high|critical` keeps reports focused on higher-priority findings.
- `--no-home` scans only project/workspace locations and skips home-directory agent roots such as `~/.claude` and `~/.codex`.
- `--include <path>[,<path>...]` limits scanning to matching paths within the default scan locations.
- `--exclude <path>[,<path>...]` skips matching paths within the default scan locations.

## Guided Repair

Repair is opt-in and intentionally narrow. The first supported action adds a source URL supplied by the user to a `SKILL.md` finding reported as `UNKNOWN_SOURCE`.

```bash
agent-audit repair plan --action skill.add-source --path ./SKILL.md --source https://github.com/owner/repository
agent-audit repair apply --action skill.add-source --path ./SKILL.md --source https://github.com/owner/repository --expected-hash <sha256> --yes
agent-audit repair rollback --backup <backup-id> --yes
```

Planning is read-only. Apply and rollback require explicit confirmation. The engine rejects symlinks and stale previews, creates a private local backup, preserves file mode, and will not roll back over newer edits. Shell commands, hooks, credentials, network endpoints, package scripts, and write/delete findings remain manual-review only.

## Manual Baseline Review

Use a local baseline to review extension changes between scans. Keep the same scan scope for every command.

```bash
agent-audit baseline create --no-home
agent-audit baseline diff --no-home
agent-audit baseline accept --no-home --yes
agent-audit baseline delete --yes
```

The baseline stores content/permission hashes and sanitized finding signatures, not source text, raw commands, credentials, full configuration, or absolute paths. It is written as a private `0600` file and rejects symbolic links and multiply-linked files. On load, derived identity, review, and finding hashes must remain internally consistent; this detects corruption or casual edits but is not a cryptographic signature against a malicious writer. No-follow reads and inode/content guards prevent `accept` or `delete` from silently replacing a concurrent update. The selected baseline file is excluded from the scan so it cannot create its own change event. `accept` and `delete` require `--yes`. A partial or failed scan can show new observations, but it cannot replace the last complete baseline or claim that earlier risks disappeared. Report schema, ruleset, or scope mismatches are marked incompatible instead of being silently compared.

## Review Interfaces

Native macOS app:

- [apps/macos](./apps/macos) builds `Agent Extension Auditor.app` with SwiftUI and no third-party UI dependencies.
- It opens from Finder or the Dock, scans through the bundled local engine, and does not use a WebView or local server.
- The first MVP requires Node.js 20+ on the Mac. Build and launch instructions are in [apps/macos/README.md](./apps/macos/README.md).

Terminal UI:

- `agent-audit ui` opens a local read-only terminal interface.
- Findings are grouped by extension type and severity.
- Keyboard shortcuts: left/right changes category, `1`-`5` selects severity, `0` or `a` shows all severities, up/down moves selection, `q` quits.

Standalone frontend prototype:

- [examples/glass-dashboard.html](./examples/glass-dashboard.html) is a no-dependency glass UI prototype.
- Open it directly from disk and load a local `agent-audit scan --format json` report.
- It does not need a server, account, cloud upload, or npm install step.

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

The reliability changes on this branch are source-only and are not yet on npm or a signed Mac release. See [the coverage contract](./docs/scan-coverage.md) for exact roots, supported formats, limits, and exit codes.

Additional declared locations include user `~/.agents/skills`, Claude user/project `settings.json`, project `.claude/settings.local.json` and `.claude/skills`, and user/project `.codex/config.toml`. Skill package text files are inspected without executing scripts. Symbolic links are followed only within selected declared roots, and identical canonical skills are counted once.

`scan` and `ui` now return **3 for partial scans** and **4 when an incomplete scope has no readable files**. A report is still produced. Use `--allow-incomplete` only if an existing integration needs legacy exit-0 behavior; the report's coverage status remains unchanged. Findings alone do not change exit codes.

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

The scanner is local-first and read-only. Guided repair runs only after explicit confirmation and keeps private backups on the same machine. The tool does not upload, phone home, create accounts, send analytics, or transmit scan results. See [PRIVACY.md](./PRIVACY.md).

### Public Repository Data Hygiene

Tracked source and documentation intentionally avoid maintainer email addresses, personal home-directory paths, Apple Team IDs, signing certificate identities, credentials, and private scan output. Automated tests guard against personal email and macOS home paths returning to public source.

Package metadata links only to this canonical public project repository and its issue tracker. It does not include a maintainer email address, personal profile URL, credential, or private runtime value.

## Security Model

This tool highlights review-worthy behavior and explains why each rule matters. It does not declare an extension safe or malicious. See [docs/risk-model.md](./docs/risk-model.md).

## Report Schema

JSON reports are designed for local automation and start with explicit privacy fields:

```json
{
  "tool": "agent-audit",
  "version": "0.2.2",
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

Issues and pull requests are welcome. Before posting logs or reports, remove secrets, tokens, personal paths, extension inventories, and any other private local data. Use GitHub's private security advisory flow for vulnerabilities.
