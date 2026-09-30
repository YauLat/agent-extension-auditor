# Native macOS App

`Agent Extension Auditor.app` is a native SwiftUI review interface. It does not use a WebView, React, Vite, a local server, telemetry, or cloud upload.

## Distribution

The macOS app is open-source and is not distributed through the Mac App Store. Local builds use an ad-hoc signature by default. Starting with `v0.2.2`, the release path accepts only a `Developer ID Application` identity, enables Hardened Runtime and a secure timestamp, submits the universal app to Apple's notary service, staples the accepted ticket, and emits a ZIP plus SHA-256 checksum.

The repository never stores a signing identity, certificate, private key, Apple credential, notarization profile, or npm token. The official release process reads an existing signing identity and notarization profile from the local Keychain and refuses to attach an ad-hoc, Apple Development-signed, or unnotarized binary.

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

The packaging script builds the TypeScript scanner and both macOS architectures, creates a universal app, copies `dist` and the pinned TOML parser (including its license) into the app bundle, and applies a local ad-hoc signature. It does not download dependencies or contact a service.

To build only the current runner architecture in CI, set `MACOS_BUILD_ARCHS` to `arm64` or `x86_64`. Its default is `universal`.

## Developer ID And Notarization

This operation contacts Apple and requires an existing Developer ID Application identity plus a `notarytool` Keychain profile. Placeholder values below are names, not secrets:

```bash
MACOS_SIGN_IDENTITY="Developer ID Application: <certificate name>" \
NOTARY_KEYCHAIN_PROFILE="<keychain profile name>" \
apps/macos/scripts/notarize-app.sh
```

The script fails before building if the signing identity is not a Developer ID Application identity. After Apple accepts the submission, it staples and validates the ticket, runs Gatekeeper assessment, recreates the distributable ZIP, and writes a `.sha256` file under `apps/macos/build/artifacts/`.

Verify a downloaded release without bypassing Gatekeeper:

```bash
shasum -a 256 -c "Agent-Extension-Auditor-0.2.2-macos-universal.zip.sha256"
ditto -x -k "Agent-Extension-Auditor-0.2.2-macos-universal.zip" .
xcrun stapler validate -v "Agent Extension Auditor.app"
spctl --assess --type execute --verbose=4 "Agent Extension Auditor.app"
```

## Runtime

The app locates Node from `PATH`, Homebrew, Volta, NVM, or fnm paths and launches the bundled scanner with argument arrays rather than a shell command. Optional development overrides:

```bash
AGENT_AUDIT_NODE_PATH=/path/to/node
AGENT_AUDIT_CLI_PATH=/path/to/dist/cli.js
AGENT_AUDIT_BACKUP_DIR=/path/to/private/backup-directory
```

Scan reports are decoded in memory. A temporary JSON report is removed as soon as decoding finishes.

The app can guide one explicit repair: add a user-supplied HTTPS source URL to `SKILL.md` for an `UNKNOWN_SOURCE` finding. It previews the change, asks for confirmation, verifies the preview hash, creates a private local backup, applies atomically, rescans, and offers guarded rollback. All shell, hook, credential, network, package-script, and write/delete findings remain manual-review only. The app never installs, deletes, enables, disables, or quarantines extensions.
