# macOS Release Hardening Spec

Status: `public_release_process_reference`

Target release: `v0.2.2` / macOS build `4`

## Goal

Ship a public macOS binary that passes Gatekeeper without a manual bypass, add macOS and Swift coverage to GitHub Actions, complete repeatable visual QA for the native app, and publish GitHub/npm artifacts with matching `0.2.2` version proof.

Success means all of the following are true:

- `main` passes the existing Node 20 quality gate plus Swift tests on GitHub-hosted macOS 26 Apple Silicon and Intel runners.
- The release app contains a universal `arm64 + x86_64` executable.
- The app is signed with a `Developer ID Application` identity, Hardened Runtime, and a secure timestamp.
- Apple notarization is accepted, the ticket is stapled, and both `stapler validate` and `spctl --assess --type execute` pass.
- A SHA-256 checksum is published beside the notarized ZIP.
- The 27-screen visual QA matrix passes without clipping, overlap, unreadable text, stale counts, or incorrect wide/narrow detail presentation.
- GitHub release `v0.2.2` and npm `agent-extension-auditor@0.2.2` are independently verified after publication.

## Non-goals

- Mac App Store submission.
- Automatic use of Apple credentials in GitHub Actions.
- Committing certificates, private keys, app-specific passwords, API keys, notarization profiles, screenshots containing local paths, or npm tokens.
- Changing scanner rules, report schema, remediation policy, or the local-first/no-telemetry posture.
- Attaching an ad-hoc, Apple Development-signed, or unnotarized binary to a public release.

## Current behavior

- `apps/macos/scripts/package-app.sh` supports `arm64`, `x86_64`, and universal app bundles while keeping ad-hoc signing as the local-development default.
- `apps/macos/scripts/notarize-app.sh` requires explicit Developer ID and Keychain-profile inputs and fails closed before public artifact creation.
- GitHub Actions defines the Node 20 quality gate plus native Swift/package checks on Apple Silicon and Intel macOS 26 runners.
- The release checklist covers lint, typecheck, tests, package contents, both architectures, signature validation, notarization, Gatekeeper, and visual QA.

## Proposed behavior

### 1. Deterministic packaging

- Update `package-app.sh` to accept an explicit output directory and signing mode.
- Keep ad-hoc signing as the safe default for local development and CI.
- Add a release-only path that refuses to continue unless the identity name begins with `Developer ID Application:`.
- Build `arm64` and `x86_64` release executables, combine them with `lipo`, and verify both architectures before signing.
- For Developer ID signing, use Hardened Runtime and a secure timestamp. Do not use `codesign --deep` to create the signature; verify the completed bundle recursively.

### 2. Notarization and release artifact

- Add `apps/macos/scripts/notarize-app.sh` with required `MACOS_SIGN_IDENTITY` and `NOTARY_KEYCHAIN_PROFILE` inputs.
- Create the submission ZIP with `ditto`, submit using `xcrun notarytool --wait`, staple the accepted ticket to the app, and validate it.
- Recreate the final ZIP after stapling and emit a `.sha256` file.
- Fail closed on missing credentials, non-Developer-ID signatures, notarization rejection, staple failure, architecture mismatch, or Gatekeeper rejection.
- Keep notarization credentials in the local Keychain only; never echo credential values.

### 3. GitHub CI

- Preserve the Ubuntu Node 20 job.
- Add Swift test/build/package jobs on `macos-26` (arm64) and `macos-26-intel` (x86_64). The macOS 26 SDK is required to compile the guarded Liquid Glass APIs while the deployment target remains macOS 14.
- Verify the ad-hoc CI bundle with `codesign --verify --deep --strict` and assert the expected architecture for each runner.
- Do not place Developer ID certificates or notarization secrets in pull-request CI.

### 4. Visual QA

- Keep screenshots under ignored `apps/macos/build/qa/`; do not commit or upload screenshots containing local paths.
- Wide matrix at `1280 x 820`: 10 sections in Traditional Chinese and 10 in English — Overview, Findings, Skills, Plugins, MCP Servers, Hooks, Config, Packages, Scan Locations, Settings.
- Narrow matrix at `940 x 660`: Overview, Findings with detail sheet, and Skills with detail sheet in both languages — 6 screenshots.
- Guided repair preview sheet: 1 additional local-only screenshot using a non-sensitive `UNKNOWN_SOURCE` fixture or disposable test file.
- Acceptance checks: no clipping/overlap, complete localized labels, correct counts, inspector at or above `1280px`, sheet below `1100px`, usable scrolling, keyboard refresh, filter clearing, loading/error behavior, and no secret values rendered.
- Any defect found during QA must be fixed and re-run through the full 27-screen matrix before release.

### 5. Versioned release

- Bump package/app version to `0.2.2` and build number to `4`; update lockfile, changelog, README, and macOS distribution notes.
- Run the complete local gate before any external publication.
- Create a local commit first, then request a final human release confirmation before push, tag, npm publish, or GitHub release publication.
- Publish npm through an interactive browser/2FA login or an explicitly configured trusted publisher; no long-lived token is added to the repository.
- Create the GitHub release as a draft, attach the notarized ZIP and checksum, verify both assets, then publish the draft.
- Verify GitHub tag/release, GitHub Actions, npm dist-tag, a clean npm install, notarization ticket, Gatekeeper acceptance, and first launch from the final ZIP.

## Files and modules affected

- `.github/workflows/ci.yml`
- `apps/macos/scripts/package-app.sh`
- `apps/macos/scripts/notarize-app.sh` (new)
- `apps/macos/Supporting/Info.plist`
- `apps/macos/Sources/AgentExtensionAuditor/OverviewView.swift`
- `apps/macos/README.md`
- `docs/desktop-app-spec.md`
- `docs/report-schema.md`
- `README.md`
- `CHANGELOG.md`
- `package.json`
- `package-lock.json`
- `src/version.ts`
- `test/release-hardening.test.ts` (new)
- `docs/release-hardening-spec.md`
- Native SwiftUI source/tests only if visual QA finds a reproducible defect.

## Verification plan

1. `npm ci`
2. `npm run lint`
3. `npm run typecheck`
4. `npm test` — current baseline: 31 tests
5. `npm run build`
6. `npm pack --dry-run --json`
7. `swift test --package-path apps/macos` — current baseline: 6 tests
8. Build and verify arm64, x86_64, and universal executables with `lipo -info`.
9. Verify Developer ID signature, Hardened Runtime, secure timestamp, and bundle resources with `codesign`.
10. Submit, wait for Apple acceptance, staple, validate, and run Gatekeeper assessment.
11. Complete and review the 27-screen visual matrix.
12. Confirm a clean Git worktree and inspect the exact release diff.
13. After the separate release confirmation: push, wait for both macOS CI jobs and Node CI, publish npm, publish the GitHub draft release, download the final ZIP, verify checksum, and perform a first-launch smoke test.

## Risks and rollback notes

- **Credential gate:** the release host must provide a valid Developer ID Application identity before notarization can succeed.
- **Notary gate:** the release host must provide a Keychain notarization profile without exposing its password or key material.
- **npm gate:** npm publication requires interactive maintainer authentication or an explicitly configured trusted publisher.
- **Irreversible publication:** npm publish and a public GitHub release cannot be treated like local edits. A final pre-release human confirmation is required after all local gates pass.
- **Architecture risk:** a universal binary must be tested on both GitHub-hosted arm64 and Intel runners; local cross-compilation alone is not sufficient proof.
- **UI privacy risk:** screenshots of real scans can reveal private paths. QA artifacts remain local and ignored; fixtures must not contain real secrets.
- **Rollback before publication:** keep the GitHub release in draft and do not change npm until every local/CI/notarization gate passes.
- **Rollback after publication:** do not overwrite a notarized artifact. Preserve `v0.2.1`, mark a broken `v0.2.2` release clearly if necessary, and issue a corrected patch version.

## Human gates

Implementation may start only after approval of this spec and the safety checklist. External release actions require a separate confirmation after implementation, notarization, CI, and QA evidence are ready.
