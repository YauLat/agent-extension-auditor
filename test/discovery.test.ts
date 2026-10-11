import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scanAgentExtensions } from "../src/scanner/index.js";
import { renderHtml } from "../src/report/html.js";
import { renderMarkdown } from "../src/report/markdown.js";

let root: string;
let home: string;
let cwd: string;
async function put(relative: string, content: string, base = home): Promise<string> {
  const file = path.join(base, relative);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
  return file;
}
const skill = (name: string) => `---\nname: ${name}\nsource: https://example.test/skills\n---\nRead local text.\n`;
const scan = () => scanAgentExtensions({ home, cwd });

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "audit-discovery-"));
  home = path.join(root, "home");
  cwd = path.join(root, "project");
  await fs.mkdir(home);
  await fs.mkdir(cwd);
});
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

describe("discovery boundaries", () => {
  it("reports invalid TOML without echoing secret-bearing input", async () => {
    await put(".codex/config.toml", '[mcp_servers.bad]\nenv = { TOKEN = "sentinel-private-value"\n');
    const report = await scan();
    expect(report.inventory.find(item => item.type === "config")?.metadata?.parseError).toBeTruthy();
    expect(report.summary.inventory.mcpServers).toBe(0);
    expect(JSON.stringify(report)).not.toContain("sentinel-private-value");
  });

  it("does not expose JSON parser excerpts from a malformed manifest", async () => {
    await put(".claude/plugins/bad/.claude-plugin/plugin.json", '{"env":"sentinel-private-value",broken}');
    const report = await scan();
    expect(report.inventory.find(item => item.type === "config")?.metadata?.parseError).toBeTruthy();
    expect(JSON.stringify(report)).not.toContain("sentinel-private-value");
  });

  it("redacts native JSON error excerpts from ordinary MCP config too", async () => {
    await put(".mcp.json", 'sentinel-private-value is not JSON');
    const report = await scan();
    expect(report.inventory[0]?.metadata?.parseError).toBeTruthy();
    expect(JSON.stringify(report)).not.toContain("sentinel-private-value");
  });

  it("discovers shared home roots once even when workspace is home", async () => {
    await put(".agents/skills/common/SKILL.md", skill("common"));
    await put(".hermes/skills/hermes/SKILL.md", skill("hermes"));
    await put(".skillclaw/shared/default/skills/shared/SKILL.md", skill("shared"));
    const report = await scanAgentExtensions({ home, cwd: home });
    expect(report.inventory.filter(item => item.type === "skill").map(item => item.name).sort())
      .toEqual(["common", "hermes", "shared"]);
    expect(report.findings.some(item => item.ruleId === "DUPLICATE_SKILL_NAME")).toBe(false);
  });

  it("extracts Codex MCP config while ignoring fake tables inside multiline text", async () => {
    await put(".codex/config.toml", `instructions = '''
[mcp_servers.fake]
command = "bash"
'''
[mcp_servers.local]
command = "node"
args = ["sentinel-private-value", # comment
  "server.js",]
env = { API_TOKEN = "sentinel-private-value" }
enabled = false
[mcp_servers."remote.example#1"]
url = "https://example.test/mcp?token=sentinel-private-value"
env_vars = ["API_TOKEN"]
`);
    const report = await scan();
    const servers = report.inventory.filter(item => item.type === "mcpServer");
    expect(servers.map(item => item.name).sort()).toEqual(["local", "remote.example#1"]);
    expect(servers.find(item => item.name === "local")?.metadata?.configuredEnabled).toBe(false);
    expect(report.findings.map(item => item.ruleId)).toEqual(expect.arrayContaining([
      "MCP_STDIO_COMMAND", "MCP_ENV_REFERENCE", "MCP_NETWORK_SERVER"
    ]));
    expect(report.findings.every(item => item.evidence.active === "unknown")).toBe(true);
    for (const output of [JSON.stringify(report), renderMarkdown(report), renderHtml(report)]) {
      expect(output).not.toContain("sentinel-private-value");
    }
  });

  it("supports dotted MCP keys and nested environment tables", async () => {
    await put(".codex/config.toml", `mcp_servers.local.command = 'node'
[mcp_servers.local.env]
API_TOKEN = "sentinel-private-value"
`);
    const report = await scan();
    expect(report.summary.inventory.mcpServers).toBe(1);
    expect(report.findings.map(item => item.ruleId)).toContain("MCP_ENV_REFERENCE");
  });

  it("rejects duplicate TOML keys rather than silently overriding configuration", async () => {
    await put(".codex/config.toml", '[mcp_servers.local]\ncommand = "node"\ncommand = "bash"\n');
    const report = await scan();
    expect(report.summary.inventory.mcpServers).toBe(0);
    expect(report.inventory[0]?.metadata?.parseError).toBeTruthy();
  });

  it("inventories empty server tables without inventing a running command", async () => {
    await put(".codex/config.toml", '[mcp_servers.empty]\n');
    const report = await scan();
    expect(report.inventory.filter(item => item.type === "mcpServer").map(item => item.name)).toEqual(["empty"]);
    expect(report.findings).toEqual([]);
  });

  it("handles literal prototype-like server names without modifying object prototypes", async () => {
    await put(".codex/config.toml", '[mcp_servers.__proto__]\ncommand = "node"\n[mcp_servers.constructor]\nurl = "https://example.test"');
    const report = await scan();
    expect(report.summary.inventory.mcpServers).toBe(2);
    expect(Object.prototype).not.toHaveProperty("command");
  });

  it.each([".claude/plugins", ".codex/plugins/cache"])("discovers manifest-only plugins and their bundled skills in %s", async prefix => {
    const folder = prefix.startsWith(".claude") ? ".claude-plugin" : ".codex-plugin";
    await put(`${prefix}/demo/${folder}/plugin.json`, JSON.stringify({ name: "demo", version: "1", mcpServers: { local: { command: "node" } } }));
    await put(`${prefix}/demo/skills/read/SKILL.md`, skill("reader"));
    await put(`${prefix}/demo/hooks/hooks.json`, '{"hooks":{"Stop":[{"hooks":[{"type":"command","command":"node hook.js"}]}]}}');
    await put(`${prefix}/demo/.mcp.json`, '{"remote":{"url":"https://example.test/mcp"}}');
    const report = await scan();
    const plugin = report.inventory.find(item => item.type === "plugin");
    expect(plugin?.name).toBe("demo");
    expect(report.summary.inventory.plugins).toBe(1);
    expect(report.inventory.find(item => item.type === "skill")?.metadata?.pluginId).toBe(plugin?.id);
    expect(report.summary.inventory.skills).toBe(1);
    expect(report.summary.inventory.mcpServers).toBe(2);
    expect(report.findings.map(item => item.ruleId)).toContain("HOOK_SHELL_COMMAND");
  });

  it("keeps package lifecycle findings without counting a manifest plugin twice", async () => {
    await put(".claude/plugins/demo/.claude-plugin/plugin.json", '{"name":"manifest-name"}');
    await put(".claude/plugins/demo/package.json", '{"name":"package-name","scripts":{"postinstall":"node setup.js"}}');
    const report = await scan();
    expect(report.summary.inventory.plugins).toBe(1);
    expect(report.inventory.find(item => item.type === "plugin")?.name).toBe("manifest-name");
    expect(report.summary.inventory.packages).toBe(1);
    expect(report.findings.map(item => item.ruleId)).toContain("PLUGIN_POSTINSTALL");
  });

  it("treats nested packages as plugin components and associates skills with the manifest", async () => {
    await put(".codex/plugins/cache/demo/.codex-plugin/plugin.json", '{"name":"demo"}');
    await put(".codex/plugins/cache/demo/skills/read/package.json", '{"name":"helper","scripts":{"postinstall":"node setup.js"}}');
    await put(".codex/plugins/cache/demo/skills/read/SKILL.md", skill("reader"));
    const report = await scan();
    const plugin = report.inventory.find(item => item.type === "plugin");
    expect(report.summary.inventory.plugins).toBe(1);
    expect(report.summary.inventory.packages).toBe(1);
    expect(report.inventory.find(item => item.type === "skill")?.metadata?.pluginId).toBe(plugin?.id);
    expect(report.findings.map(item => item.ruleId)).toContain("PLUGIN_POSTINSTALL");
  });

  it("keeps workspace TOML when home scanning is disabled", async () => {
    await put(".codex/config.toml", '[mcp_servers.home]\ncommand = "node"');
    await put(".agents/skills/home/SKILL.md", skill("home"));
    await put(".codex/config.toml", '[mcp_servers.workspace]\ncommand = "node"', cwd);
    const report = await scanAgentExtensions({ home, cwd, includeHome: false });
    expect(report.inventory.filter(item => item.type === "mcpServer").map(item => item.name)).toEqual(["workspace"]);
    expect(report.summary.inventory.skills).toBe(0);
  });

  it("honors include and exclude filters on bundled files", async () => {
    await put(".claude/plugins/demo/.claude-plugin/plugin.json", '{"name":"demo"}');
    const included = await put(".claude/plugins/demo/skills/read/SKILL.md", skill("included"));
    await put(".claude/plugins/demo/skills/skip/SKILL.md", skill("excluded"));
    const report = await scanAgentExtensions({ home, cwd, includePaths: [included] });
    expect(report.inventory.map(item => item.name)).toEqual(["included"]);
    const excluded = await scanAgentExtensions({ home, cwd, excludePaths: [path.dirname(included)] });
    expect(excluded.inventory.filter(item => item.type === "skill").map(item => item.name)).toEqual(["excluded"]);
  });

  it("does not traverse symbolic roots or read symbolic config files", async () => {
    const outside = await put("outside/skills/read/SKILL.md", skill("outside"), root);
    await fs.symlink(path.join(root, "outside"), path.join(home, ".hermes"));
    await fs.mkdir(path.join(home, ".codex"));
    const config = await put("outside/config.toml", '[mcp_servers.outside]\ncommand = "node"', root);
    await fs.symlink(config, path.join(home, ".codex/config.toml"));
    expect((await scan()).inventory).toEqual([]);
    expect(await fs.readFile(outside, "utf8")).toBe(skill("outside"));
  });

  it("applies byte and depth limits to the new discovery paths", async () => {
    await put(".codex/config.toml", '[mcp_servers.local]\ncommand = "node"');
    await put(".agents/skills/deep/a/SKILL.md", skill("deep"));
    const report = await scanAgentExtensions({ home, cwd, maxDepth: 0, maxFileBytes: 8 });
    expect(report.inventory).toEqual([]);
  });
});
