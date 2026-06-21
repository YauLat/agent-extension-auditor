import path from "node:path";
import type { TargetLocation } from "../types.js";

export function getDefaultTargets(cwd: string, home: string): TargetLocation[] {
  const workspaceFiles = ["AGENTS.md", "CLAUDE.md", "SOUL.md", "USER.md", "MEMORY.md", ".mcp.json"];
  const targets: TargetLocation[] = [
    {
      path: path.join(home, ".claude", "skills"),
      kind: "skill-root",
      reason: "Claude skills"
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
      reason: "Codex skills"
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
    },
    {
      path: path.join(cwd, ".agents", "skills"),
      kind: "skill-root",
      reason: "Workspace agent skills"
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
