# Desktop App Spec

## Goal

Provide a local desktop UI for Agent Extension Auditor that is not a web report, keeps all scans on the user's machine, and presents findings by extension type and severity.

## Non-goals

- No SaaS dashboard.
- No account.
- No telemetry.
- No cloud upload.
- No background auto-update behavior in the first desktop MVP.
- No WebView or local HTTP server.
- No enable, disable, install, delete, bulk auto-fix, or AI-generated rewrite behavior.

## Current Status

The repo now supports:

- `agent-audit scan` for terminal, Markdown, JSON, and HTML reports.
- `agent-audit ui` for a no-dependency terminal UI.
- Static HTML reports with categorized local review.
- A standalone no-dependency glass frontend prototype in `examples/glass-dashboard.html`.
- A native SwiftUI app under `apps/macos`.

## Implemented Desktop MVP

The desktop implementation is a native macOS SwiftUI app. It uses Liquid Glass on macOS 26 and SwiftUI material on older supported macOS versions.

Why SwiftUI:

- It produces a real macOS app without a browser shell.
- It needs no Electron, Tauri, React, Vite, or third-party UI dependency.
- It matches native window, sidebar, toolbar, inspector, keyboard, and accessibility behavior.
- The TypeScript scanner remains the single risk-rule implementation.

Desktop MVP screens:

- Overview: severity counts and privacy status.
- Categories: Skills, Plugins, MCP servers, Hooks, Configs, Packages.
- Severity view: Critical, High, Medium, Low, Info.
- Findings detail: rule, title, message, location, recommendation.
- Evidence state: documented, configured, or metadata; activation remains unknown unless independently verified.
- Guided `UNKNOWN_SOURCE` repair with preview, confirmation, backup, rescan, and rollback.
- Scanned locations.
- Settings: language, scan root, home-directory scope, engine status, privacy status.

Desktop data flow:

1. User launches `Agent Extension Auditor.app` locally.
2. The app locates a local Node.js 20+ runtime.
3. The app invokes the bundled `dist/cli.js` with `Process` argument arrays, never shell interpolation.
4. The scanner writes a temporary JSON report using the existing `ScanReport` shape.
5. Swift decodes the report, then immediately removes the temporary file.
6. No network request is made and no report is uploaded.

Guided repair uses the same bundled CLI with argument arrays. Planning is read-only. Apply requires an expected content hash plus explicit confirmation, writes only a validated `SKILL.md`, and creates a private backup outside scan roots before an atomic replacement.

## Files And Build

- Swift package: `apps/macos/Package.swift`
- App source: `apps/macos/Sources/AgentExtensionAuditor`
- Swift tests: `apps/macos/Tests/AgentExtensionAuditorTests`
- Packaging: `apps/macos/scripts/package-app.sh`
- Local output: `apps/macos/build/release/Agent Extension Auditor.app`

The app can be built and opened with:

```bash
swift test --package-path apps/macos
apps/macos/scripts/package-app.sh
open "apps/macos/build/release/Agent Extension Auditor.app"
```

## Current Limits

- macOS only.
- The local MVP uses an ad-hoc signature and is not notarized.
- Node.js 20+ must already exist on the Mac; the Node runtime is not redistributed in the app bundle.
- Review state is not persisted.
- Guided repair is limited to adding user-supplied source metadata; all other findings remain review-only.
- The app source is kept outside the npm package payload until a desktop distribution path is approved.

## Rollback

Remove `apps/macos` and its documentation entries. The CLI scanner, report formats, npm package, and existing static interfaces remain unchanged.

## Verification

Verification:

- `npm run lint`
- `npm test`
- `npm run build`
- `npm audit --json`
- `npm pack --dry-run`
- `swift build --package-path apps/macos`
- `swift test --package-path apps/macos`
- Package and launch `Agent Extension Auditor.app` from Finder.
- Confirm the bundled scanner returns a real local report.
- Secret sentinel check remains false.
