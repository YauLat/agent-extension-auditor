import path from "node:path";
import type { TargetLocation } from "../types.js";

interface DefaultTargetOptions {
  includeHome?: boolean;
}

export function getDefaultTargets(cwd: string, home: string, options: DefaultTargetOptions = {}): TargetLocation[] {
  const includeHome = options.includeHome ?? true;
  const workspaceFiles = ["AGENTS.md", "CLAUDE.md", "SOUL.md", "USER.md", "MEMORY.md", ".mcp.json"];
  const homeTargets: TargetLocation[] = [
    { path: path.join(home, ".agents", "skills"), kind: "skill-root", reason: "Shared agent skills", agent: "shared" },
    { path: path.join(home, ".claude", "settings.json"), kind: "agent-config", reason: "Claude user settings", agent: "claude" },
    { path: path.join(home, ".codex", "config.toml"), kind: "toml-config", reason: "Codex user config", agent: "codex" },
    {
      path: path.join(home, ".claude", "skills"),
      kind: "skill-root",
      reason: "Claude skills",
      agent: "claude"
    },
    {
      path: path.join(home, ".claude", "plugins"),
      kind: "plugin-root",
      reason: "Claude plugins"
    },
    {
      path: path.join(home, ".claude.json"),
      kind: "agent-config",
      reason: "Claude config"
    },
    {
      path: path.join(home, ".codex", "skills"),
      kind: "skill-root",
      reason: "Codex skills",
      agent: "codex"
    },
    {
      path: path.join(home, ".codex", "plugins", "cache"),
      kind: "plugin-root",
      reason: "Codex plugin cache"
    },
    {
      path: path.join(home, ".mcp.json"),
      kind: "mcp-config",
      reason: "User MCP config"
    }
  ];
  const targets: TargetLocation[] = [
    ...(includeHome ? homeTargets : []),
    { path: path.join(cwd, ".claude", "skills"), kind: "skill-root", reason: "Workspace Claude skills", agent: "claude" },
    { path: path.join(cwd, ".claude", "settings.json"), kind: "agent-config", reason: "Claude project settings", agent: "claude" },
    { path: path.join(cwd, ".claude", "settings.local.json"), kind: "agent-config", reason: "Claude local project settings", agent: "claude" },
    { path: path.join(cwd, ".codex", "config.toml"), kind: "toml-config", reason: "Codex project config", agent: "codex" },
    {
      path: path.join(cwd, ".agents", "skills"),
      kind: "skill-root",
      reason: "Workspace agent skills",
      agent: "shared"
    }
  ];

  for (const file of workspaceFiles) {
    targets.push({
      path: path.join(cwd, file),
      kind: file === ".mcp.json" ? "mcp-config" : "workspace-config",
      reason: `Workspace ${file}`
    });
  }

  return dedupeTargets(targets);
}

function dedupeTargets(targets: TargetLocation[]): TargetLocation[] {
  const seen = new Set<string>();
  return targets.filter((target) => {
    const key = `${target.kind}:${target.path}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
