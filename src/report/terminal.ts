import type { ScanReport } from "../types.js";
import { severityLabels, sortFindings } from "../rules/definitions.js";

export function renderTerminal(report: ScanReport): string {
  const summary = report.summary;
  const topFindings = sortFindings(report.findings).slice(0, 12);
  const lines = [
    "Agent Extension Audit",
    "",
    "Scanned:",
    `  Skills: ${summary.inventory.skills}`,
    `  Plugins: ${summary.inventory.plugins}`,
    `  MCP servers: ${summary.inventory.mcpServers}`,
    `  Hooks: ${summary.inventory.hooks}`,
    "",
    "Risk summary:",
    `  Critical: ${summary.findings.critical}`,
    `  High: ${summary.findings.high}`,
    `  Medium: ${summary.findings.medium}`,
    `  Low: ${summary.findings.low}`,
    `  Info: ${summary.findings.info}`,
    "",
    "Top findings:"
  ];

  if (topFindings.length === 0) {
    lines.push("  None");
  } else {
    for (const finding of topFindings) {
      const label = severityLabels[finding.severity].padEnd(5);
      const rule = finding.ruleId.padEnd(28);
      const location = formatLocation(finding);
      lines.push(`  ${label} ${rule} ${location}`);
    }
  }

  lines.push("", "Privacy: telemetry disabled, no data uploaded.");
  return `${lines.join("\n")}\n`;
}

function formatLocation(finding: ScanReport["findings"][number]): string {
  const line = finding.location.line ? `:${finding.location.line}` : "";
  return `${finding.location.displayPath}${line}`;
}
