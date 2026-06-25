# Desktop App Spec

## Goal

Provide a local desktop UI for Agent Extension Auditor that is not a web report, keeps all scans on the user's machine, and presents findings by extension type and severity.

## Non-goals

- No SaaS dashboard.
- No account.
- No telemetry.
- No cloud upload.
- No background auto-update behavior in the first desktop MVP.
- No dependency installation until explicitly approved.

## Current Status

The repo now supports:

- `agent-audit scan` for terminal, Markdown, JSON, and HTML reports.
- `agent-audit ui` for a no-dependency terminal UI.
- Static HTML reports with categorized local review.

## Proposed Desktop MVP

Recommended first desktop implementation: Electron app shell with a strict local preload boundary.

Why Electron first:

- The project is already Node.js and TypeScript.
- The existing scanner can be reused directly.
- Tauri would require adding Rust toolchain requirements for contributors.

Desktop MVP screens:

- Overview: severity counts and privacy status.
- Categories: Skills, Plugins, MCP servers, Hooks, Configs, Packages.
- Severity view: Critical, High, Medium, Low, Info.
- Findings detail: rule, title, message, location, recommendation.
- Scanned locations.

Desktop data flow:

1. User launches desktop app locally.
2. App invokes the existing scanner in-process or through a local child process.
3. UI receives only the existing `ScanReport` shape.
4. No network requests are sent.
5. No secret values are printed or persisted.

## Human-gated Dependency Checklist

Operation: introduce a desktop app dependency such as Electron or Tauri.

Impact scope: package metadata, lockfile, build scripts, app source tree, packaged tarball contents, CI runtime time.

Rollback: remove dependency entries, app source tree, generated lockfile changes, and desktop scripts.

Main risks:

- Larger install footprint.
- New dependency advisory surface.
- Accidental web/network capability in desktop shell.
- Confusion between local desktop UI and hosted web dashboard.

Verification:

- `npm run lint`
- `npm test`
- `npm run build`
- `npm audit --json`
- `npm pack --dry-run`
- Desktop app launches without network permissions beyond local file/process access.
- Secret sentinel check remains false.

Needs explicit confirmation:

- Exact desktop framework: Electron or Tauri.
- Permission to add third-party dependencies.
- Permission to update package metadata and lockfile.
