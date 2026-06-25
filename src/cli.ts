#!/usr/bin/env node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { explainRule } from "./explain/index.js";
import { renderReport, type ReportFormat } from "./report/index.js";
import { filterReportByMinSeverity, scanAgentExtensions } from "./scanner/index.js";
import { exists } from "./scanner/files.js";
import { getDefaultTargets } from "./scanner/targets.js";
import { rules } from "./rules/definitions.js";
import type { Severity } from "./types.js";
import { runTerminalUi } from "./ui/terminal.js";
import { toDisplayPath } from "./util/paths.js";
import { VERSION } from "./version.js";

async function main(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;

  if (!command || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "--version" || command === "-v") {
    console.log(VERSION);
    return;
  }

  if (command === "scan") {
    await runScan(rest);
    return;
  }

  if (command === "ui") {
    await runUi(rest);
    return;
  }

  if (command === "explain") {
    const ruleId = rest[0];
    if (!ruleId) {
      throw new CliError("Usage: agent-audit explain <RULE_ID>");
    }
    process.stdout.write(explainRule(ruleId));
    return;
  }

  if (command === "doctor") {
    await runDoctor(rest);
    return;
  }

  throw new CliError(`Unknown command: ${command}`);
}

async function runScan(args: string[]): Promise<void> {
  const parsed = parseOptions(args);
  const rawReport = await scanAgentExtensions({
    cwd: parsed.root,
    home: parsed.home,
    includeHome: parsed.includeHome,
    includePaths: parsed.includePaths,
    excludePaths: parsed.excludePaths
  });
  const report = filterReportByMinSeverity(rawReport, parsed.minSeverity);
  const output = renderReport(report, parsed.format);

  if (parsed.output) {
    await fs.writeFile(parsed.output, output, "utf8");
    console.log(`Wrote ${parsed.format} report to ${parsed.output}`);
    return;
  }

  process.stdout.write(output);
}

async function runUi(args: string[]): Promise<void> {
  const parsed = parseOptions(args);
  if (parsed.output) {
    throw new CliError("agent-audit ui does not support --output. Use scan --format html/json/markdown for files.");
  }
  if (parsed.formatProvided) {
    throw new CliError("agent-audit ui does not support --format. Use scan for report formats.");
  }

  const rawReport = await scanAgentExtensions({
    cwd: parsed.root,
    home: parsed.home,
    includeHome: parsed.includeHome,
    includePaths: parsed.includePaths,
    excludePaths: parsed.excludePaths
  });
  const report = filterReportByMinSeverity(rawReport, parsed.minSeverity);
  await runTerminalUi(report);
}

async function runDoctor(args: string[]): Promise<void> {
  const parsed = parseOptions(args);
  const cwd = path.resolve(parsed.root ?? process.cwd());
  const home = path.resolve(parsed.home ?? os.homedir());
  const targets = getDefaultTargets(cwd, home, { includeHome: parsed.includeHome });
  const lines = [
    "Agent Audit Doctor",
    "",
    `Version: ${VERSION}`,
    `Node: ${process.version}`,
    `CWD: ${cwd}`,
    `Home: ${home}`,
    `Home scan: ${parsed.includeHome ? "enabled" : "disabled"}`,
    "",
    "Default scan locations:"
  ];

  for (const target of targets) {
    lines.push(`  ${await exists(target.path) ? "yes" : "no "}  ${toDisplayPath(target.path, home)} (${target.reason})`);
  }

  lines.push("", `Rules loaded: ${rules.length}`, "Privacy: telemetry disabled, no data uploaded.", "");
  process.stdout.write(lines.join("\n"));
}

interface ParsedOptions {
  format: ReportFormat;
  formatProvided: boolean;
  output?: string;
  root?: string;
  home?: string;
  includeHome: boolean;
  minSeverity?: Severity;
  includePaths: string[];
  excludePaths: string[];
}

function parseOptions(args: string[]): ParsedOptions {
  const parsed: ParsedOptions = {
    format: "terminal",
    formatProvided: false,
    includeHome: true,
    includePaths: [],
    excludePaths: []
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--format") {
      const value = args[++index];
      if (!isReportFormat(value)) {
        throw new CliError(`Unsupported format: ${value ?? ""}`);
      }
      parsed.format = value;
      parsed.formatProvided = true;
    } else if (arg === "--output" || arg === "-o") {
      const value = args[++index];
      if (!value) {
        throw new CliError(`Missing value for ${arg}`);
      }
      parsed.output = value;
    } else if (arg === "--root") {
      const value = args[++index];
      if (!value) {
        throw new CliError("Missing value for --root");
      }
      parsed.root = value;
    } else if (arg === "--home") {
      const value = args[++index];
      if (!value) {
        throw new CliError("Missing value for --home");
      }
      parsed.home = value;
    } else if (arg === "--no-home") {
      parsed.includeHome = false;
    } else if (arg === "--min-severity") {
      const value = args[++index];
      if (!isMinimumSeverity(value)) {
        throw new CliError("Unsupported minimum severity. Use medium, high, or critical.");
      }
      parsed.minSeverity = value;
    } else if (arg === "--include") {
      parsed.includePaths.push(...readPathFilterValues(arg, args[++index]));
    } else if (arg === "--exclude") {
      parsed.excludePaths.push(...readPathFilterValues(arg, args[++index]));
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new CliError(`Unknown option: ${arg}`);
    }
  }

  return parsed;
}

function isReportFormat(value: string | undefined): value is ReportFormat {
  return value === "terminal" || value === "markdown" || value === "json" || value === "html";
}

function isMinimumSeverity(value: string | undefined): value is Severity {
  return value === "medium" || value === "high" || value === "critical";
}

function readPathFilterValues(optionName: string, value: string | undefined): string[] {
  if (!value) {
    throw new CliError(`Missing value for ${optionName}`);
  }
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function printHelp(): void {
  console.log(`agent-audit ${VERSION}

Local-first CLI for auditing agent skills, plugins, MCP servers, hooks, and extension risk.

Usage:
  agent-audit scan [--format terminal|markdown|json|html] [--output report.md]
  agent-audit ui [--no-home] [--min-severity high]
  agent-audit scan --no-home --min-severity high
  agent-audit explain <RULE_ID>
  agent-audit doctor

Options:
  --root <path>                    Workspace root to scan. Defaults to the current directory.
  --home <path>                    Home directory to scan. Defaults to the current user's home.
  --no-home                        Scan only workspace/project locations, not home-directory agent roots.
  --include <path>[,<path>...]     Only scan matching paths.
  --exclude <path>[,<path>...]     Skip matching paths.
  --min-severity medium|high|critical
                                   Only include findings at or above this severity in reports.
  --format                         Report format for scan. Defaults to terminal.
  --output, -o                     Write the rendered report to a file.
  --version, -v                    Print version.
  --help, -h                       Print help.

Privacy:
  No telemetry. No cloud upload. No accounts. No secret values printed.
`);
}

class CliError extends Error {}

main(process.argv.slice(2)).catch((error: unknown) => {
  if (error instanceof CliError) {
    console.error(error.message);
    process.exitCode = 2;
    return;
  }
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
