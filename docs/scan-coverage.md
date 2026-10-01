# Scan coverage contract (schema 2)

This branch adds reliability improvements to the existing auditor. It does not execute an agent, install a skill, prove runtime activation, or establish that an extension is safe.

## Status and counts

- `complete`: every encountered supported file in the declared inspection scope was read, subject to the explicit exclusions below. Missing optional default roots are normal.
- `partial`: at least one file was read, but a read, format, parse, structure or traversal limitation prevented complete inspection.
- `failed`: such a limitation occurred and no files could be read. This still yields a report; it is different from a CLI operation error.
- No `coverage` field (legacy reports): unknown, never implicitly complete.

`filesRead` counts unique canonical files successfully decoded as UTF-8. `filesSkipped` counts known file paths with a diagnostic, including files read but not structurally parsed. These are not disjoint counts. `directoriesSkipped` counts known unvisited subtrees, not files inside them. Optional missing roots and unresolved link targets remain explicit diagnostics and are not invented file counts. Excluded directories are not enumerated.

Diagnostics contain fixed codes/messages, paths and entry kinds, never raw parser or filesystem exception messages. `parse_failed` is intentionally generic: JSON and TOML exceptions can echo credentials. Invalid top-level objects and excessive structured nesting have distinct diagnostics.

CLI `scan` / `ui` exits: 0 complete, 1 operation error, 2 usage error, 3 partial, 4 failed coverage. Risk severity does not affect the exit code. Output files are written even on 3/4. `--allow-incomplete` restores exit 0 for valid incomplete reports for existing scripts; it does not change coverage. The Mac runner accepts 3/4 and displays the result with an incomplete banner.

## Declared roots

| Agent/scope | Paths relative to home or chosen workspace |
| --- | --- |
| Claude user | `~/.claude/skills`, `~/.claude/plugins`, `~/.claude.json`, `~/.claude/settings.json` |
| Claude workspace | `.claude/skills`, `.claude/settings.json`, `.claude/settings.local.json` |
| Codex user | `~/.codex/skills`, `~/.codex/plugins/cache`, `~/.codex/config.toml` |
| Codex workspace | `.codex/config.toml` |
| Shared skills | `~/.agents/skills`, workspace `.agents/skills` |
| MCP | `~/.mcp.json`, workspace `.mcp.json` |
| Workspace instructions | `AGENTS.md`, `CLAUDE.md`, `SOUL.md`, `USER.md`, `MEMORY.md` |

User/project Claude paths: [official settings reference](https://code.claude.com/docs/en/settings). Codex TOML: [official configuration reference](https://developers.openai.com/codex/config-basic/). These are known file locations, not a simulation of effective agent settings or precedence. Custom `CLAUDE_CONFIG_DIR` / `CODEX_HOME`, managed settings, inherited parent repositories/worktrees and OpenClaw are not currently discovered automatically. Point `--root` at the intended workspace. `--include` narrows declared roots; it does not grant access to arbitrary files.

Skill roots: discover `SKILL.md`, then inspect supported text files belonging to its package. Nested skills own their own files. Plugin roots: inspect `package.json` manifests only; this is not a complete plugin code audit. Instruction files: text pattern inspection only. JSON/TOML agent configuration: structured MCP/hook inspection plus static text markers. The bundled parser is pinned to `smol-toml` 1.9.0 (BSD-3-Clause); packaged apps retain its license.

## Boundaries and links

- Default file limit: 512 KiB. Default directory depth: 6 below each root; configuration nesting limit: 64.
- `node_modules`, `.git`, `dist` directories are excluded by policy and named in diagnostics/scope.
- Supported text: Markdown, JSON/JSONC, YAML, TOML, plain text, JS/TS, shell, Python, Ruby, PowerShell, Fish, CFG/INI, XML/HTML/CSS, Dockerfile, Makefile, `.env` files. JSONC/YAML in skill bundles are text-inspected, not fully parsed.
- Binary/invalid UTF-8, unsupported and oversized package files are uninspected and make coverage incomplete. An image-only diagnostic does not mean malicious content.
- Paths and symlink destinations must both satisfy scope/exclusions. Links outside selected known roots, broken links and cycles are explicit diagnostics. The scanner does not expand to an entire home directory. Scoped canonical assets retain aliases/agent associations and are inspected once.
- Reads are bounded and checked before/after reading; replaced final symlinks are rejected. This is a local read-only scanner, not an OS sandbox or atomic filesystem snapshot. Avoid changing installations during an audit.

## Evidence and identity

`documented` means a pattern occurs in instructions/reference text; `code` means it occurs in bundled source/scripts; `configured` means it occurs in configuration; `metadata` means a provenance/size/duplicate signal. All have `active: unknown`. Warnings and test examples can contain the same static patterns as executable behavior; their file path, line and evidence kind are retained for review. The scanner does not infer semantic safety from a negation such as “never run”.

Hook inventory counts actual command-bearing leaves within `hooks`. Parent objects and textual mentions do not create extra hook assets. Different events, array positions and source files remain separate. Finding IDs hash the rule, canonical location, key/line and asset; they are deterministic within this schema, not a permanent identity across arbitrary moves. Move-aware baseline matching is a separate upcoming feature.

Minimum severity filters preserve coverage and report hidden finding counts. A zero-finding filtered report is not a safety verdict. Reports contain local names and paths; keep them local unless reviewed for sharing.

## Validation and remaining work

Regression tests use synthetic temporary homes/workspaces and never execute sample commands. Tests cover malformed JSON/TOML privacy, read/depth/format failures, exclusions, canonical aliasing, out-of-scope links, bundled scripts, hook counts, static counterexamples, CLI exits, and the separately copied scanner runtime. Native decoding tests cover legacy and schema-2 reports. Mac runtime, signing, notarization and Gatekeeper require their actual respective environments.

Next stage: local baseline and manual changes review; opt-in monitoring only after baseline semantics are validated. No history, notifications, or automatic trust decisions are implemented by this change.
