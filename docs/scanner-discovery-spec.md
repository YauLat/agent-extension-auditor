# Scanner Discovery Restart Spec

Status: approved for local implementation on 2026-10-01 after the restart review and the user's instruction to begin.

## Goal

Close the reproduced inventory gaps in the existing 0.2.2 scanner, then verify the bundled macOS app locally.

## Non-goals

No install or dependency upgrade, agent configuration mutation, extension execution, network lookup by the scanner, remote publication, signing identity access, or report schema change. Discovery does not prove activation or trust.

## Current behavior

Home-level shared skills and Codex TOML are absent from discovery. Plugin roots only search for package.json; manifest-only plugins and their bundled skills are missed. Main and the release worktree have different Git histories.

## Proposed behavior

- Work on a new local branch from the existing clean 0.2.2 worktree; preserve the original checkout and release branch.
- Add home `.agents/skills`, `.hermes/skills`, `.skillclaw/shared/default/skills`, and `.codex/config.toml`. Add workspace `.codex/config.toml`. Preserve `--no-home`, include/exclude filters, byte/depth limits, and no symlink traversal.
- Statically extract Codex `mcp_servers` from TOML tables, dotted keys, strings, arrays and inline tables. Invalid or unsupported MCP syntax yields a generic parse warning without raw values. This is a bounded discovery reader, not a complete TOML validator. Preserve `enabled` as configured metadata, while activation evidence remains unknown.
- Discover `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json`, their bounded local SKILL.md files, inline MCP/hooks, and conventional plugin-root `.mcp.json` / `hooks/hooks.json`. Keep referenced arbitrary paths and remote manifests out of scope.
- Associate bundled skills with their plugin using optional metadata. A manifest plus package.json must yield one plugin, while keeping package lifecycle findings. Nested packages under a discovered manifest remain package components and must not displace the owning plugin. Deduplicate inventory by stable identity before summary and duplicate-name checks.
- Never echo parser source snippets, MCP arguments/environment values, or URL credentials. Preserve existing URL sanitization and guided-repair policy.

## Files/modules affected

`src/scanner/targets.ts`, `src/scanner/index.ts`, a bounded TOML reader under `src/scanner/`, regression tests, supported-agent documentation, and the existing project state ledger. Swift source and report types need no changes.

## Verification plan

1. Observe failing regression tests for malformed private input, missing locations, quoted/multiline TOML, inline/env tables, manifest-only plugins, package overlap, path filters, no-home and symlinks.
2. Pass the full Node suite, lint, build, existing Swift tests, and a synthetic CLI scan.
3. Run a local ad-hoc package build into a new output directory, verify signature and architecture, launch that exact bundle, and inspect core UI interactions. Full release QA and notarization remain separate.

## Risks / rollback notes

Additional roots can increase scan time and inventory size. Unsupported TOML is explicitly partial; malformed input must never leak its contents. Existing size/depth limits remain. No source files under scanned locations are written. Local changes are confined to the named development branch and can be reviewed as a diff; original main and release commits remain available. Dependency advisories identified in the restart review remain a separately approved maintenance task.
