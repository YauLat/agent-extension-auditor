import path from "node:path";
import { describe, expect, it } from "vitest";
import { explainRule } from "../src/explain/index.js";
import { renderHtml } from "../src/report/html.js";
import { renderReport } from "../src/report/index.js";
import { renderJson } from "../src/report/json.js";
import { renderMarkdown } from "../src/report/markdown.js";
import { filterReportByMinSeverity, scanAgentExtensions } from "../src/scanner/index.js";

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

  it("does not print secret values in JSON, Markdown, or HTML reports", async () => {
    const report = await scanAgentExtensions({ cwd, home });
    const json = renderJson(report);
    const markdown = renderMarkdown(report);
    const html = renderHtml(report);

    expect(json).not.toContain("sk-test-should-not-appear");
    expect(markdown).not.toContain("sk-test-should-not-appear");
    expect(html).not.toContain("sk-test-should-not-appear");
    expect(json).toContain("SECRET_PATTERN_REFERENCE");
  });

  it("can scan only workspace locations without home-directory agent roots", async () => {
    const report = await scanAgentExtensions({ cwd, home, includeHome: false });
    const ruleIds = report.findings.map((finding) => finding.ruleId);

    expect(report.scannedLocations.some((location) => location.displayPath.includes(".claude"))).toBe(false);
    expect(report.summary.inventory.skills).toBe(0);
    expect(report.summary.inventory.mcpServers).toBe(1);
    expect(ruleIds).not.toContain("DUPLICATE_SKILL_NAME");
  });

  it("supports include and exclude path filters", async () => {
    const agentsPath = path.join(cwd, "AGENTS.md");
    const included = await scanAgentExtensions({ cwd, home, includePaths: [agentsPath] });
    const includedRuleIds = included.findings.map((finding) => finding.ruleId);

    expect(included.scannedLocations.map((location) => location.displayPath)).toEqual([agentsPath]);
    expect(included.summary.inventory.mcpServers).toBe(0);
    expect(includedRuleIds).toContain("REMOTE_SCRIPT_EXECUTION");
    expect(includedRuleIds).toContain("WRITE_OR_DELETE_CAPABILITY");

    const excluded = await scanAgentExtensions({ cwd, home, includeHome: false, excludePaths: [agentsPath] });
    const excludedRuleIds = excluded.findings.map((finding) => finding.ruleId);

    expect(excluded.summary.inventory.mcpServers).toBe(1);
    expect(excludedRuleIds).toContain("MCP_STDIO_COMMAND");
    expect(excludedRuleIds).not.toContain("REMOTE_SCRIPT_EXECUTION");
  });

  it("filters reports by minimum severity and recomputes the summary", async () => {
    const report = await scanAgentExtensions({ cwd, home });
    const filtered = filterReportByMinSeverity(report, "high");

    expect(filtered.findings.every((finding) => finding.severity === "critical" || finding.severity === "high")).toBe(
      true
    );
    expect(filtered.summary.findings.medium).toBe(0);
    expect(filtered.summary.findings.low).toBe(0);
    expect(filtered.recommendedActions.length).toBeGreaterThan(0);
  });

  it("renders Markdown with required sections and JSON top-level shape", async () => {
    const report = await scanAgentExtensions({ cwd, home, generatedAt: new Date("2026-06-21T00:00:00.000Z") });
    const markdown = renderMarkdown(report);
    const parsed = JSON.parse(renderJson(report));

    expect(markdown).toContain("## Executive Summary");
    expect(markdown).toContain("## Scanned Locations");
    expect(markdown).toContain("## Risk Summary");
    expect(markdown).toContain("## Recommended Next Actions");
    expect(markdown).toContain("## Findings by Severity");
    expect(markdown).toContain("## Privacy Note");
    expect(parsed.tool).toBe("agent-audit");
    expect(parsed.privacy.telemetry).toBe(false);
    expect(parsed.privacy.uploaded).toBe(false);
    expect(Array.isArray(parsed.recommendedActions)).toBe(true);
    expect(Array.isArray(parsed.inventory)).toBe(true);
    expect(Array.isArray(parsed.findings)).toBe(true);
  });

  it("renders an HTML dashboard with filters, search, and required sections", async () => {
    const report = await scanAgentExtensions({ cwd, home, generatedAt: new Date("2026-06-21T00:00:00.000Z") });
    const html = renderHtml(report);

    expect(html).toContain("<!doctype html>");
    expect(html).toContain("Overview risk summary");
    expect(html).toContain("Discovered extension surface");
    expect(html).toContain("Recommended");
    expect(html).toContain("Review queue");
    expect(html).toContain("Scanned locations");
    expect(html).toContain("No telemetry. No upload. Local-only.");
    expect(html).toContain("data-lang-option=\"en\"");
    expect(html).toContain("data-lang-option=\"zh-Hant\"");
    expect(html).toContain("data-testid=\"severity-filter\"");
    expect(html).toContain("data-testid=\"rule-filter\"");
    expect(html).toContain("data-testid=\"inventory-filter\"");
    expect(html).toContain("data-testid=\"location-filter\"");
    expect(html).toContain("data-testid=\"search-filter\"");
    expect(html).toContain("data-finding-row");
    expect(html).toContain("function applyFilters");
  });

  it("renders local English and Traditional Chinese language switching controls", async () => {
    const report = await scanAgentExtensions({ cwd, home, generatedAt: new Date("2026-06-21T00:00:00.000Z") });
    const html = renderHtml(report);

    expect(html).toContain("agent-audit-report-language");
    expect(html).toContain("function applyLanguage");
    expect(html).toContain("繁中");
    expect(html).toContain("風險總覽");
    expect(html).toContain("清單與下一步");
    expect(html).toContain("共 {total} 項，顯示 {visible} 項");
    expect(html).toContain("data-i18n-placeholder=\"searchPlaceholder\"");
    expect(html).toContain("data-label-key=\"recommendation\"");
  });

  it("routes HTML through the shared report renderer", async () => {
    const report = await scanAgentExtensions({ cwd, home });
    const html = renderReport(report, "html");

    expect(html).toContain("<title>Agent Extension Audit</title>");
    expect(html).toContain("data-finding-row");
  });

  it("renders a clear HTML empty state when there are no findings", async () => {
    const report = await scanAgentExtensions({ cwd, home });
    const emptyReport = {
      ...report,
      findings: [],
      recommendedActions: [],
      summary: {
        ...report.summary,
        findings: {
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
          info: 0
        }
      }
    };
    const html = renderHtml(emptyReport);

    expect(html).toContain("No findings detected");
    expect(html).toContain("The scan did not find review-worthy extension behavior");
  });

  it("escapes HTML-sensitive report fields in the HTML renderer", async () => {
    const report = await scanAgentExtensions({ cwd, home });
    const taintedReport = {
      ...report,
      findings: [
        {
          ...report.findings[0],
          message: "</script><img src=x onerror=alert(1)>",
          location: {
            ...report.findings[0].location,
            displayPath: "<bad-path>"
          }
        }
      ]
    };
    const html = renderHtml(taintedReport);

    expect(html).not.toContain("</script><img");
    expect(html).not.toContain("<bad-path>");
    expect(html).toContain("&lt;bad-path&gt;");
    expect(html).toContain("&lt;/script&gt;&lt;img");
  });

  it("explains documented rules", () => {
    expect(explainRule("MCP_STDIO_COMMAND")).toContain("MCP server starts a local command");
  });
});
