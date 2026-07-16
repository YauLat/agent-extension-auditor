# macOS Release Hardening Spec

Status: `implemented_local_pending_external_release`

Target release: `v0.2.2` / macOS build `4`

## Goal

Make the GitHub source release and npm CLI safe for public use without exposing private maintainer data, harden the macOS build so locally produced artifacts do not embed build-machine paths, add macOS and Swift coverage to GitHub Actions, complete repeatable visual QA for the native app, and prepare matching `0.2.2` release proof.

Success means all of the following are true:

- `main` passes the existing Node 20 quality gate plus Swift tests on GitHub-hosted macOS 26 Apple Silicon and Intel runners.
- GitHub Actions uses explicit read-only permissions and every third-party action is pinned to a verified full 40-character commit SHA.
- Tracked source, the npm tarball, generated reports used as privacy fixtures, and packaged executables pass fail-closed privacy scans without private email addresses, credentials, secret sentinels, or absolute user-home paths.
- Source metadata shown in reports is display-safe: URL userinfo, query parameters, and fragments are removed, and unsafe or unparseable values are omitted.
- The release app contains a universal `arm64 + x86_64` executable.
- If and only if a separately approved public signing identity is used, the app is signed with a `Developer ID Application` identity, Hardened Runtime, and a secure timestamp; Apple notarization is accepted, the ticket is stapled, and both `stapler validate` and `spctl --assess --type execute` pass.
- A SHA-256 checksum is published beside any separately approved notarized ZIP.
- The 27-screen visual QA matrix passes without clipping, overlap, unreadable text, stale counts, or incorrect wide/narrow detail presentation.
- GitHub release `v0.2.2` and npm `agent-extension-auditor@0.2.2` are independently verified after publication.

## Non-goals

- Mac App Store submission.
- Automatic use of Apple credentials in GitHub Actions.
- Committing certificates, private keys, app-specific passwords, API keys, notarization profiles, screenshots containing local paths, or npm tokens.
- Changing scanner rules, report schema, remediation policy, or the local-first/no-telemetry posture.
- Attaching an ad-hoc, Apple Development-signed, or unnotarized binary to a public release.
- Publishing a macOS binary signed with a certificate subject that reveals a private personal identity. A personal Developer ID certificate is not compatible with the strict no-private-data release mode.
- Treating a source-only GitHub release as proof that npm publication, notarization, or remote privacy-history cleanup also happened.

## Current behavior

- `apps/macos/scripts/package-app.sh` supports `arm64`, `x86_64`, and universal app bundles, keeps ad-hoc signing as the local-development default, strips release debug symbols, and rejects packaged app artifacts containing private email or absolute user-home patterns.
- `apps/macos/scripts/notarize-app.sh` requires explicit Developer ID and Keychain-profile inputs and fails closed before public artifact creation.
- GitHub Actions defines the Node 20 quality gate plus native Swift/package checks on Apple Silicon and Intel macOS 26 runners; permissions are read-only and third-party actions are pinned to reviewed full commit SHAs.
- Inventory source metadata is sanitized before entering the report model: credentials, query strings, and fragments are removed from supported URLs, while unsafe values are omitted.
- The release checklist covers lint, typecheck, tests, package contents, both architectures, signature validation, notarization, Gatekeeper, and visual QA.

## Proposed behavior

### 1. Deterministic packaging

- Update `package-app.sh` to accept an explicit output directory and signing mode.
- Keep ad-hoc signing as the safe default for local development and CI.
- Add a release-only path that refuses to continue unless the identity name begins with `Developer ID Application:`.
- Build `arm64` and `x86_64` release executables, combine them with `lipo`, and verify both architectures before signing.
- Strip release debug symbols before signing, then fail packaging if any completed app artifact still contains an absolute macOS or Linux user-home path. Prefix mapping is intentionally omitted because it produces invalid Swift module-cache references during linking; the post-strip byte scan is the release gate.
- For Developer ID signing, use Hardened Runtime and a secure timestamp. Do not use `codesign --deep` to create the signature; verify the completed bundle recursively.

### 2. Report source privacy

- Sanitize source metadata before it enters the report model.
- For supported public URL schemes, remove username, password, query, and fragment components.
- Omit values that cannot be represented safely as a public source location.
- Add synthetic sentinel coverage proving terminal, Markdown, JSON, and HTML output do not contain source credentials or query secrets.
- Keep the existing local path model unchanged in this slice; reports remain local artifacts and documentation continues to warn users not to publish raw inventories.

### 3. Notarization and release artifact

- Add `apps/macos/scripts/notarize-app.sh` with required `MACOS_SIGN_IDENTITY` and `NOTARY_KEYCHAIN_PROFILE` inputs.
- Create the submission ZIP with `ditto`, submit using `xcrun notarytool --wait`, staple the accepted ticket to the app, and validate it.
- Recreate the final ZIP after stapling and emit a `.sha256` file.
- Fail closed on missing credentials, non-Developer-ID signatures, notarization rejection, staple failure, architecture mismatch, or Gatekeeper rejection.
- Keep notarization credentials in the local Keychain only; never echo credential values.
- Treat the certificate subject and Team ID as public artifact metadata. Do not create or attach a Developer ID build until the user separately confirms that the selected public identity is acceptable.

### 4. GitHub CI

- Preserve the Ubuntu Node 20 job.
- Add Swift test/build/package jobs on `macos-26` (arm64) and `macos-26-intel` (x86_64). The macOS 26 SDK is required to compile the guarded Liquid Glass APIs while the deployment target remains macOS 14.
- Declare `permissions: contents: read` in the workflow.
- Pin `actions/checkout` v4.3.1 to `34e114876b0b11c390a56381ad16ebd13914f8d5` and `actions/setup-node` v4.4.0 to `49933ea5288caeca8642d1e84afbd3f7d6820020`; both commits were verified against the official upstream repositories. Retain comments with the reviewed release versions.
- Verify the ad-hoc CI bundle with `codesign --verify --deep --strict` and assert the expected architecture for each runner.
- Do not place Developer ID certificates or notarization secrets in pull-request CI.

### 5. Visual QA

- Keep screenshots under ignored `apps/macos/build/qa/`; do not commit or upload screenshots containing local paths.
- Wide matrix at `1280 x 820`: 10 sections in Traditional Chinese and 10 in English — Overview, Findings, Skills, Plugins, MCP Servers, Hooks, Config, Packages, Scan Locations, Settings.
- Narrow matrix at `940 x 660`: Overview, Findings with detail sheet, and Skills with detail sheet in both languages — 6 screenshots.
- Guided repair preview sheet: 1 additional local-only screenshot using a non-sensitive `UNKNOWN_SOURCE` fixture or disposable test file.
- Acceptance checks: no clipping/overlap, complete localized labels, correct counts, inspector at or above `1280px`, sheet below `1100px`, usable scrolling, keyboard refresh, filter clearing, loading/error behavior, and no secret values rendered.
- Any defect found during QA must be fixed and re-run through the full 27-screen matrix before release.
- The current local baseline contains 27 selected screenshots covering the matrix above; all 66 retained QA iterations are ignored by Git. Re-run the affected matrix if implementation changes native UI code.

### 6. Versioned release

- Bump package/app version to `0.2.2` and build number to `4`; update lockfile, changelog, README, and macOS distribution notes.
- Run the complete local gate before any external publication.
- Create a local commit first, then request a final human release confirmation before any remote history update, Actions-run deletion, push, tag, npm publish, or GitHub release publication.
- Publish npm through an interactive browser/2FA login or an explicitly configured trusted publisher; no long-lived token is added to the repository.
- Create the GitHub release as a draft. In strict no-private-data mode, publish source and CLI release notes without a signed macOS binary. Attach a notarized ZIP and checksum only after the separate signing-identity approval.
- Verify GitHub tag/release, GitHub Actions, npm dist-tag, and a clean npm install. If a macOS binary was separately approved, also verify its notarization ticket, Gatekeeper acceptance, checksum, certificate subject, and first launch from the final ZIP.

## Files and modules affected

- `.github/workflows/ci.yml`
- `apps/macos/scripts/package-app.sh`
- `apps/macos/scripts/notarize-app.sh` (new)
- `src/scanner/index.ts`
- `src/util/text.ts`
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
- `test/scanner.test.ts`
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
9. Byte-scan the packaged executable and app resources; require zero macOS or Linux absolute home-directory strings and zero secret sentinels.
10. Generate reports from synthetic source URLs containing credentials, query secrets, and fragments; require all four formats to exclude the sentinels.
11. Verify workflow action SHAs against their upstream repositories and validate the workflow declares read-only permissions.
12. Complete and review the 27-screen visual matrix.
13. Confirm a clean Git worktree and inspect the exact release diff.
14. If a public signing identity is separately approved, verify Developer ID signature, Hardened Runtime, secure timestamp, certificate subject, notarization, stapling, and Gatekeeper.
15. After the separate release confirmation: perform the explicitly approved remote privacy cleanup, push, wait for both macOS CI jobs and Node CI, publish npm, and publish the GitHub draft release. Attach and smoke-test a macOS ZIP only if the signing-identity gate was approved.

## Risks and rollback notes

- **Credential gate:** the release host must provide a valid Developer ID Application identity before notarization can succeed.
- **Notary gate:** the release host must provide a Keychain notarization profile without exposing its password or key material.
- **npm gate:** npm publication requires interactive maintainer authentication or an explicitly configured trusted publisher.
- **Irreversible publication:** npm publish and a public GitHub release cannot be treated like local edits. A final pre-release human confirmation is required after all local gates pass.
- **Architecture risk:** a universal binary must be tested on both GitHub-hosted arm64 and Intel runners; local cross-compilation alone is not sufficient proof.
- **UI privacy risk:** screenshots of real scans can reveal private paths. QA artifacts remain local and ignored; fixtures must not contain real secrets.
- **Build-path privacy risk:** Swift release binaries can retain absolute source paths even when tracked source is clean. Release stripping and byte-level artifact checks are mandatory before any binary is attached.
- **Report privacy risk:** source metadata can contain embedded credentials or query tokens. Sanitization must occur before rendering, with sentinel tests covering every report format.
- **Certificate identity risk:** a Developer ID signature exposes certificate subject and Team ID metadata. Strict no-private-data releases must omit the signed binary unless an acceptable public organization identity is explicitly approved.
- **Workflow supply-chain risk:** mutable action tags can change after review. Full-SHA pins and explicit read-only permissions are required.
- **Rollback before publication:** keep the GitHub release in draft and do not change npm until every local/CI/notarization gate passes.
- **Rollback after publication:** do not overwrite a notarized artifact. Preserve `v0.2.1`, mark a broken `v0.2.2` release clearly if necessary, and issue a corrected patch version.

## Human gates

Implementation may start only after approval of this spec and the safety checklist. Remote history rewrite, Actions-run deletion, push, tag, npm publication, GitHub release publication, and use of any Developer ID identity each require explicit confirmation at the relevant gate. Approval of local implementation does not approve any external mutation or identity disclosure.
