# Supported Agents

The MVP scanner supports filesystem discovery for common local agent extension locations:

- Claude: `~/.claude/skills`, `~/.claude/plugins`, `~/.claude.json`
- Codex: `~/.codex/skills`, `~/.codex/plugins/cache`
- MCP: `~/.mcp.json`, project `.mcp.json`, and `mcpServers` blocks in JSON config files
- Workspaces: `AGENTS.md`, `CLAUDE.md`, `SOUL.md`, `USER.md`, `MEMORY.md`, `.agents/skills`

Future versions may add Windows paths, more host apps, and richer plugin manifest parsing.
