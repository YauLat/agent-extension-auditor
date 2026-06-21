import path from "node:path";
import { describe, expect, it } from "vitest";
import { explainRule } from "../src/explain/index.js";
import { renderJson } from "../src/report/json.js";
import { renderMarkdown } from "../src/report/markdown.js";
import { scanAgentExtensions } from "../src/scanner/index.js";

const fixtureRoot = path.resolve("test/fixtures");
const home = path.join(fixtureRoot, "home");
const cwd = path.join(fixtureRoot, "project");

describe("agent extension scanner", () => {
  it("detects MCP stdio commands and env references", async () => {
    const report = await scanAgentExtensions({ cwd, home, generatedAt: new Date("2026-06-21T00:00:00.000Z") });
    const ruleIds = report.findings.map((finding) => finding.ruleId);

    expect(ruleIds).toContain("MCP_STDIO_COMMAND");
    expect(ruleIds).toContain("MCP_ENV_REFERENCE");
    expect(ruleIds).toContain("MCP_NETWORK_SERVER");
    expect(report.summary.inventory.mcpServers).toBe(3);
  });

  it("detects package postinstall and bin executables", async () => {
    const report = await scanAgentExtensions({ cwd, home });
    const ruleIds = report.findings.map((finding) => finding.ruleId);

    expect(ruleIds).toContain("PLUGIN_POSTINSTALL");
    expect(ruleIds).toContain("PLUGIN_BIN_EXECUTABLE");
    expect(report.summary.inventory.plugins).toBe(1);
  });

  it("detects hook, remote script, write/delete, and duplicate skill names", async () => {
    const report = await scanAgentExtensions({ cwd, home });
    const ruleIds = report.findings.map((finding) => finding.ruleId);

    expect(ruleIds).toContain("HOOK_SHELL_COMMAND");
    expect(ruleIds).toContain("REMOTE_SCRIPT_EXECUTION");
    expect(ruleIds).toContain("WRITE_OR_DELETE_CAPABILITY");
    expect(ruleIds).toContain("DUPLICATE_SKILL_NAME");
  });

  it("does not print secret values in JSON or Markdown reports", async () => {
    const report = await scanAgentExtensions({ cwd, home });
    const json = renderJson(report);
    const markdown = renderMarkdown(report);

    expect(json).not.toContain("sk-test-should-not-appear");
    expect(markdown).not.toContain("sk-test-should-not-appear");
    expect(json).toContain("SECRET_PATTERN_REFERENCE");
  });

  it("renders Markdown with required sections and JSON top-level shape", async () => {
    const report = await scanAgentExtensions({ cwd, home, generatedAt: new Date("2026-06-21T00:00:00.000Z") });
    const markdown = renderMarkdown(report);
    const parsed = JSON.parse(renderJson(report));

    expect(markdown).toContain("## Executive Summary");
    expect(markdown).toContain("## Scanned Locations");
    expect(markdown).toContain("## Risk Summary");
    expect(markdown).toContain("## Findings by Severity");
    expect(markdown).toContain("## Privacy Note");
    expect(parsed.tool).toBe("agent-audit");
    expect(parsed.privacy.telemetry).toBe(false);
    expect(parsed.privacy.uploaded).toBe(false);
    expect(Array.isArray(parsed.inventory)).toBe(true);
    expect(Array.isArray(parsed.findings)).toBe(true);
  });

  it("explains documented rules", () => {
    expect(explainRule("MCP_STDIO_COMMAND")).toContain("MCP server starts a local command");
  });
});
