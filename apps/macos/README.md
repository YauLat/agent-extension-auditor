# Native macOS App

`Agent Extension Auditor.app` is a native SwiftUI review interface. It does not use a WebView, React, Vite, a local server, telemetry, or cloud upload.

## Distribution

The macOS app is open-source and built locally from this repository. It is not distributed through the Mac App Store, and the repository does not attach an unnotarized app binary to releases. The local packaging script uses an ad-hoc signature for development and personal use.

## Requirements

- macOS 14 or newer. macOS 26 uses native Liquid Glass; older supported versions use SwiftUI material.
- Xcode 26 to build the current source.
- Node.js 20 or newer to run the bundled `agent-audit` scanner.

## Build And Open

From the repository root:

```bash
swift test --package-path apps/macos
apps/macos/scripts/package-app.sh
open "apps/macos/build/release/Agent Extension Auditor.app"
```

The packaging script builds the TypeScript scanner and Swift app, copies `dist` into the app bundle, and applies a local ad-hoc signature. It does not download dependencies or contact a service.

## Runtime

The app locates Node from `PATH`, Homebrew, Volta, NVM, or fnm paths and launches the bundled scanner with argument arrays rather than a shell command. Optional development overrides:

```bash
AGENT_AUDIT_NODE_PATH=/path/to/node
AGENT_AUDIT_CLI_PATH=/path/to/dist/cli.js
AGENT_AUDIT_BACKUP_DIR=/path/to/private/backup-directory
```

Scan reports are decoded in memory. A temporary JSON report is removed as soon as decoding finishes.

The app can guide one explicit repair: add a user-supplied HTTPS source URL to `SKILL.md` for an `UNKNOWN_SOURCE` finding. It previews the change, asks for confirmation, verifies the preview hash, creates a private local backup, applies atomically, rescans, and offers guarded rollback. All shell, hook, credential, network, package-script, and write/delete findings remain manual-review only. The app never installs, deletes, enables, disables, or quarantines extensions.
