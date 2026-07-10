import type { Finding, ScanReport, Severity } from "../types.js";
import { sortFindings } from "../rules/definitions.js";

const severities: Severity[] = ["critical", "high", "medium", "low", "info"];

export function renderMarkdown(report: ScanReport): string {
  const lines = [
    "# Agent Extension Audit",
    "",
    `Generated at: ${report.generatedAt}`,
    "",
    "Privacy: telemetry disabled, no data uploaded.",
    "",
    "## Executive Summary",
    "",
    `- Skills: ${report.summary.inventory.skills}`,
    `- Plugins: ${report.summary.inventory.plugins}`,
    `- MCP servers: ${report.summary.inventory.mcpServers}`,
    `- Hooks: ${report.summary.inventory.hooks}`,
    `- Findings: ${report.findings.length}`,
    "",
    "## Scanned Locations",
    "",
    "| Location | Kind | Exists | Reason |",
    "| --- | --- | --- | --- |"
  ];

  for (const location of report.scannedLocations) {
    lines.push(
      `| \`${escapePipe(location.displayPath)}\` | ${escapePipe(location.kind)} | ${location.exists ? "yes" : "no"} | ${escapePipe(location.reason)} |`
    );
  }

  lines.push(
    "",
    "## Risk Summary",
    "",
    "| Severity | Count |",
    "| --- | ---: |",
    `| Critical | ${report.summary.findings.critical} |`,
    `| High | ${report.summary.findings.high} |`,
    `| Medium | ${report.summary.findings.medium} |`,
    `| Low | ${report.summary.findings.low} |`,
    `| Info | ${report.summary.findings.info} |`,
    "",
    "## Recommended Next Actions",
    ""
  );

  if (report.recommendedActions.length === 0) {
    lines.push("No immediate next actions.", "");
  } else {
    for (const action of report.recommendedActions) {
      lines.push(`- ${action}`);
    }
    lines.push("");
  }

  lines.push(
    "",
    "## Findings by Severity",
    ""
  );

  for (const severity of severities) {
    const findings = sortFindings(report.findings).filter((finding) => finding.severity === severity);
    if (findings.length === 0) {
      continue;
    }
    lines.push(`### ${capitalize(severity)}`, "");
    for (const finding of findings) {
      lines.push(`- \`${finding.ruleId}\` in \`${formatLocation(finding)}\`: ${finding.message}`);
    }
    lines.push("");
  }

  lines.push("## Findings by Extension", "");
  if (report.inventory.length === 0) {
    lines.push("No extensions discovered.", "");
  } else {
    for (const item of report.inventory) {
      const findings = report.findings.filter((finding) => finding.itemId === item.id);
      if (findings.length === 0) {
        continue;
      }
      lines.push(`- \`${item.name}\` (${item.type}) at \`${item.displayPath}\`: ${findings.length} finding(s)`);
    }
    lines.push("");
  }

  const duplicateFindings = report.findings.filter((finding) => finding.ruleId === "DUPLICATE_SKILL_NAME");
  lines.push("## Duplicates / Conflicts", "");
  if (duplicateFindings.length === 0) {
    lines.push("No duplicate skill names detected.", "");
  } else {
    for (const finding of duplicateFindings) {
      lines.push(`- \`${formatLocation(finding)}\`: ${finding.message}`);
    }
    lines.push("");
  }

  const manualReview = sortFindings(report.findings).filter(
    (finding) => finding.severity === "critical" || finding.severity === "high"
  );
  lines.push("## Recommended Manual Review", "");
  if (manualReview.length === 0) {
    lines.push("No high or critical findings detected.", "");
  } else {
    for (const finding of manualReview) {
      lines.push(`- \`${finding.ruleId}\` at \`${formatLocation(finding)}\`: ${finding.recommendation}`);
    }
    lines.push("");
  }

  lines.push("## Privacy Note", "", "No telemetry was sent and no data was uploaded by this scan.", "");
  lines.push(`Tool version: ${report.version}`, "");
  return `${lines.join("\n")}\n`;
}

function formatLocation(finding: Finding): string {
  const line = finding.location.line ? `:${finding.location.line}` : "";
  return `${finding.location.displayPath}${line}`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function escapePipe(value: string): string {
  return value.replace(/\|/g, "\\|");
}
