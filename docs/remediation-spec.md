# Guided Remediation Spec

## Goal

Add a local guided-remediation workflow that can preview a deterministic repair, require explicit approval, apply it safely, verify the result with a new scan, and roll it back.

The first supported mutation is intentionally narrow: add user-supplied `source` metadata to the YAML frontmatter of a `SKILL.md` finding reported as `UNKNOWN_SOURCE`.

## Non-goals

- No silent or bulk auto-fix.
- No AI-generated file rewrites.
- No automatic delete, install, enable, disable, quarantine, or package update.
- No mutation for shell commands, hooks, credential references, network endpoints, or write/delete findings.
- No guessing a source URL or trust decision.
- No report upload, telemetry, account, or remote repair service.

## Current Behavior

- The scanner reports deterministic findings with recommendations.
- The macOS app can inspect a finding and copy its path.
- Findings do not distinguish documented behavior from configured behavior.
- The CLI and macOS app do not modify scanned extensions.

## Proposed Behavior

### Finding context

Findings may include optional evidence metadata:

- `kind`: `documented`, `configured`, or `metadata`.
- `confidence`: `medium` or `high`.
- `active`: `unknown` in this version; a documented capability is not treated as proof that it is active.

Text hook detection must require a shell marker near the hook marker instead of matching two unrelated terms anywhere in the file.

### Remediation descriptor

Every new finding includes a remediation descriptor:

- `review`: manual review only; no mutation action is available.
- `guided`: the engine supports a deterministic repair after user input and confirmation.

Only `UNKNOWN_SOURCE` on `SKILL.md` is `guided` in the first version. It uses action `skill.add-source` and requires an absolute `https://` source URL supplied by the user.

### CLI workflow

The CLI exposes:

```text
agent-audit repair plan --action skill.add-source --path <SKILL.md> --source <https-url>
agent-audit repair apply --action skill.add-source --path <SKILL.md> --source <https-url> --expected-hash <sha256> --yes
agent-audit repair rollback --backup <backup-id> --yes
```

`plan` is read-only and returns JSON containing a minimal preview and the current content hash. `apply` refuses to run without `--yes`, refuses symlinks and non-`SKILL.md` targets, verifies the content hash, creates a private backup, preserves file permissions, and uses an atomic same-directory rename. `rollback` refuses to overwrite a file that changed after the repair.

### macOS workflow

For a guided finding, the detail inspector provides a repair sheet:

1. User enters the source URL.
2. App asks the CLI for a read-only preview.
3. App displays the preview and an explicit Apply Repair button.
4. App applies only the previewed content hash.
5. App rescans automatically.
6. App exposes rollback for the returned backup ID.

Review-only findings show their evidence state and file navigation actions, but no apply button.

## Files And Modules Affected

- `src/types.ts`
- `src/scanner/index.ts`
- `src/remediation/index.ts`
- `src/cli.ts`
- `test/scanner.test.ts`
- `test/remediation.test.ts`
- `apps/macos/Sources/AgentExtensionAuditor/Models.swift`
- `apps/macos/Sources/AgentExtensionAuditor/AuditRunner.swift`
- `apps/macos/Sources/AgentExtensionAuditor/AuditStore.swift`
- `apps/macos/Sources/AgentExtensionAuditor/FindingsView.swift`
- `apps/macos/Sources/AgentExtensionAuditor/Localization.swift`
- `apps/macos/Tests/AgentExtensionAuditorTests/AgentExtensionAuditorTests.swift`
- product, schema, privacy, and threat-model documentation

## Verification Plan

- A distant `hook` and shell marker do not produce `HOOK_SHELL_COMMAND`.
- A nearby hook and shell marker still produce the finding with `documented` evidence.
- `UNKNOWN_SOURCE` exposes only `skill.add-source` guided remediation.
- Plan rejects non-HTTPS input, missing frontmatter, non-`SKILL.md`, oversized files, and symlinks.
- Apply requires confirmation and the exact preview hash.
- Apply preserves the original mode and creates a private backup outside the scanned extension.
- Rollback succeeds only when the repaired file still matches the recorded post-apply hash.
- Generated reports never include file contents or secret values in remediation metadata.
- TypeScript lint, tests, build, Swift build/tests, package dry-run, and a generated-report sentinel check pass.

## Risks And Rollback Notes

- A stale preview could overwrite newer edits. The expected content hash is mandatory.
- A symlink could redirect a write. Symlink targets are rejected.
- Backups may contain sensitive configuration. They live outside scan roots with directory mode `0700` and file mode `0600`.
- A generic text repair could corrupt a skill. The first version only inserts one quoted frontmatter field into a validated `SKILL.md`.
- Code rollback is a normal Git revert. User-file rollback uses the backup ID and also checks the current content hash before writing.
