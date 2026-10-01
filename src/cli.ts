#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  compareBaseline,
  createBaseline,
  deleteBaseline,
  readBaseline,
  renderBaselineDiff,
  writeBaseline
} from "./baseline/index.js";
import { explainRule } from "./explain/index.js";
import { renderReport, type ReportFormat } from "./report/index.js";
import { filterReportByMinSeverity, scanAgentExtensions } from "./scanner/index.js";
import { exists } from "./scanner/files.js";
import { getDefaultTargets } from "./scanner/targets.js";
import { rules, severityRank } from "./rules/definitions.js";
import { applyRepair, planRepair, rollbackRepair, type RepairAction } from "./remediation/index.js";
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

  if (command === "repair") {
    await runRepair(rest);
    return;
  }

  if (command === "baseline") {
    await runBaseline(rest);
    return;
  }

  throw new CliError(`Unknown command: ${command}`);
}

async function runBaseline(args: string[]): Promise<void> {
  const [operation, ...optionArgs] = args;
  const baselineOptions = parseBaselineOptions(optionArgs);
  const parsed = parseOptions(baselineOptions.scanArgs);
  if (parsed.minSeverity || parsed.output || (parsed.formatProvided && parsed.format !== "json") || parsed.allowIncomplete || parsed.failOn) {
    throw new CliError("Baseline commands do not support --min-severity, --output, --format, or --allow-incomplete.");
  }
  const filePath = path.resolve(baselineOptions.file ?? path.join(parsed.root ?? process.cwd(), ".agent-audit-baseline.json"));

  if (operation === "delete") {
    if (!baselineOptions.confirmed) throw new CliError("baseline delete requires --yes.");
    await deleteBaseline(filePath);
    console.log(`Deleted baseline ${filePath}`);
    return;
  }
  if (operation !== "create" && operation !== "diff" && operation !== "accept" && operation !== "review") {
    throw new CliError("Usage: agent-audit baseline create|diff|accept|delete [--file <path>] [--yes]");
  }
  if (operation === "accept" && !baselineOptions.confirmed) {
    throw new CliError("baseline accept requires --yes.");
  }

  const report = await scanAgentExtensions({
    paths: parsed.paths,
    cwd: parsed.root,
    home: parsed.home,
    includeHome: parsed.includeHome,
    includePaths: parsed.includePaths,
    // The baseline is product state, not an extension asset. Excluding it also prevents
    // a custom baseline stored under a skill package from causing self-generated diffs.
    excludePaths: [...parsed.excludePaths, filePath]
  });
  if (operation === "diff") {
    const diff = compareBaseline(await readBaseline(filePath), report);
    process.stdout.write(parsed.format === "json" ? JSON.stringify(diff) + "\n" : renderBaselineDiff(diff));
    process.exitCode = diff.status === "incompatible" ? 5 : diff.status === "partial" ? 3 : 0;
    return;
  }

  const baseline = createBaseline(report);
  const previous = await exists(filePath) ? await readBaseline(filePath) : null;
  const reviewedHash = createHash("sha256").update(JSON.stringify({ scope: baseline.scopeHash, rules: baseline.rulesetVersion,
    assets: baseline.assets, previous })).digest("hex");
  if (operation === "review") {
    const diff = previous ? compareBaseline(previous, report) : null;
    process.stdout.write(JSON.stringify({ exists: previous !== null, reviewedHash,
      canAccept: !diff || diff.status === "comparable", assets: baseline.assets.map(a => ({ name: a.name, type: a.type })), diff }) + "\n");
    return;
  }
  if (baselineOptions.expectedHash && baselineOptions.expectedHash !== reviewedHash) {
    throw new Error("Files or baseline changed since review. Review again before accepting.");
  }
  if (parsed.format === "json" && !baselineOptions.expectedHash) throw new Error("JSON baseline writes require --expected-hash from baseline review.");
  await writeBaseline(filePath, baseline, operation === "accept");
  if (parsed.format === "json") console.log(JSON.stringify({ saved: true, assets: baseline.assets.length }));
  else console.log(`${operation === "accept" ? "Accepted" : "Created"} baseline ${filePath} (${baseline.assets.length} assets)`);
}

async function runScan(args: string[]): Promise<void> {
  const parsed = parseOptions(args);
  const rawReport = await scanAgentExtensions({
    paths: parsed.paths,
    cwd: parsed.root,
    home: parsed.home,
    includeHome: parsed.includeHome,
    includePaths: parsed.includePaths,
    excludePaths: parsed.excludePaths
  });
  const report = filterReportByMinSeverity(rawReport, parsed.minSeverity);
  const output = renderReport(report, parsed.format);
  if (!parsed.allowIncomplete) {
    process.exitCode = report.coverage?.status === "failed" ? 4 : report.coverage?.status === "partial" ? 3 : 0;
  }

  if (!process.exitCode && parsed.failOn && rawReport.findings.some(f => severityRank[f.severity] >= severityRank[parsed.failOn!])) process.exitCode = 6;

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
    paths: parsed.paths,
    cwd: parsed.root,
    home: parsed.home,
    includeHome: parsed.includeHome,
    includePaths: parsed.includePaths,
    excludePaths: parsed.excludePaths
  });
  const report = filterReportByMinSeverity(rawReport, parsed.minSeverity);
  await runTerminalUi(report);
  if (!parsed.allowIncomplete) {
    process.exitCode = report.coverage?.status === "failed" ? 4 : report.coverage?.status === "partial" ? 3 : 0;
  }
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

async function runRepair(args: string[]): Promise<void> {
  const [operation, ...optionArgs] = args;
  const parsed = parseRepairOptions(optionArgs);

  if (operation === "plan") {
    const input = requireRepairInput(parsed);
    process.stdout.write(`${JSON.stringify(await planRepair(input), null, 2)}\n`);
    return;
  }

  if (operation === "apply") {
    const input = requireRepairInput(parsed);
    if (!parsed.expectedHash) {
      throw new CliError("Missing value for --expected-hash");
    }
    process.stdout.write(
      `${JSON.stringify(
        await applyRepair({
          ...input,
          expectedHash: parsed.expectedHash,
          confirmed: parsed.confirmed
        }),
        null,
        2
      )}\n`
    );
    return;
  }

  if (operation === "rollback") {
    if (!parsed.backupId) {
      throw new CliError("Missing value for --backup");
    }
    process.stdout.write(
      `${JSON.stringify(
        await rollbackRepair({
          backupId: parsed.backupId,
          confirmed: parsed.confirmed
        }),
        null,
        2
      )}\n`
    );
    return;
  }

  throw new CliError(
    "Usage: agent-audit repair plan|apply --action skill.add-source --path <SKILL.md> --source <https-url>"
  );
}

interface ParsedOptions {
  paths: string[];
  failOn?: Severity;
  allowIncomplete?: boolean;
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

interface ParsedRepairOptions {
  action?: RepairAction;
  path?: string;
  source?: string;
  expectedHash?: string;
  backupId?: string;
  confirmed: boolean;
}

interface ParsedBaselineOptions {
  expectedHash?: string;
  file?: string;
  confirmed: boolean;
  scanArgs: string[];
}

function parseBaselineOptions(args: string[]): ParsedBaselineOptions {
  const parsed: ParsedBaselineOptions = { confirmed: false, scanArgs: [] };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--expected-hash") {
      parsed.expectedHash = requireOptionValue(arg, args[++index]);
    } else if (arg === "--file") {
      parsed.file = requireOptionValue(arg, args[++index]);
    } else if (arg === "--yes") {
      parsed.confirmed = true;
    } else {
      parsed.scanArgs.push(arg);
      if (["--path", "--fail-on", "--root", "--home", "--include", "--exclude", "--min-severity", "--format", "--output", "-o"].includes(arg)) {
        parsed.scanArgs.push(requireOptionValue(arg, args[++index]));
      }
    }
  }
  return parsed;
}

function parseRepairOptions(args: string[]): ParsedRepairOptions {
  const parsed: ParsedRepairOptions = { confirmed: false };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--action") {
      const value = args[++index];
      if (value !== "skill.add-source") {
        throw new CliError(`Unsupported repair action: ${value ?? ""}`);
      }
      parsed.action = value;
    } else if (arg === "--path") {
      parsed.path = requireOptionValue(arg, args[++index]);
    } else if (arg === "--source") {
      parsed.source = requireOptionValue(arg, args[++index]);
    } else if (arg === "--expected-hash") {
      parsed.expectedHash = requireOptionValue(arg, args[++index]);
    } else if (arg === "--backup") {
      parsed.backupId = requireOptionValue(arg, args[++index]);
    } else if (arg === "--yes") {
      parsed.confirmed = true;
    } else {
      throw new CliError(`Unknown repair option: ${arg}`);
    }
  }
  return parsed;
}

function requireRepairInput(parsed: ParsedRepairOptions): { action: RepairAction; path: string; source: string } {
  if (!parsed.action) {
    throw new CliError("Missing value for --action");
  }
  if (!parsed.path) {
    throw new CliError("Missing value for --path");
  }
  if (!parsed.source) {
    throw new CliError("Missing value for --source");
  }
  return { action: parsed.action, path: parsed.path, source: parsed.source };
}

function requireOptionValue(optionName: string, value: string | undefined): string {
  if (!value) {
    throw new CliError(`Missing value for ${optionName}`);
  }
  return value;
}

function parseOptions(args: string[]): ParsedOptions {
  const parsed: ParsedOptions = {
    paths: [],
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
    } else if (arg === "--path") {
      parsed.paths.push(requireOptionValue(arg, args[++index]));
    } else if (arg === "--fail-on") {
      const value = args[++index];
      if (!isMinimumSeverity(value)) throw new CliError("Unsupported fail-on severity. Use medium, high, or critical.");
      parsed.failOn = value;
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
    } else if (arg === "--allow-incomplete") {
      parsed.allowIncomplete = true;
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
  return value === "terminal" || value === "markdown" || value === "json" || value === "html" || value === "sarif";
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
  agent-audit scan [--format terminal|markdown|json|html|sarif] [--output report.md]
  agent-audit ui [--no-home] [--min-severity high]
  agent-audit scan --no-home --min-severity high
  agent-audit explain <RULE_ID>
  agent-audit doctor
  agent-audit repair plan --action skill.add-source --path <SKILL.md> --source <https-url>
  agent-audit repair apply --action skill.add-source --path <SKILL.md> --source <https-url> --expected-hash <sha256> --yes
  agent-audit repair rollback --backup <backup-id> --yes
  agent-audit baseline review --format json [scan options]
  agent-audit baseline create [--file .agent-audit-baseline.json] [scan options]
  agent-audit baseline diff [--file .agent-audit-baseline.json] [scan options]
  agent-audit baseline accept --yes [--file .agent-audit-baseline.json] [scan options]
  agent-audit baseline delete --yes [--file .agent-audit-baseline.json]

Options:
  --path <path>                    Inspect an explicit package directory or file; repeatable.
  --fail-on medium|high|critical    Exit 6 when findings meet threshold (coverage errors take precedence).
  --root <path>                    Workspace root to scan. Defaults to the current directory.
  --home <path>                    Home directory to scan. Defaults to the current user's home.
  --no-home                        Scan only workspace/project locations, not home-directory agent roots.
  --allow-incomplete               Return exit 0 for partial/failed reports (legacy scripting compatibility).
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

Scan exits:
  0 complete declared scope; 1 operation failed; 2 invalid usage; 3 partial scan; 4 no readable files; 5 incompatible baseline.
  Risk findings exit 6 only with --fail-on; filtering never bypasses the gate. Incomplete scans still write a report.

Repair safety:
  Repair planning is read-only. Apply and rollback require --yes, content-hash checks, and private local backups.

Baseline safety:
  Baselines contain hashes and sanitized finding signatures, not source text, raw commands, credentials, or absolute paths.
  Replacing or deleting a baseline requires --yes; incomplete scans can never replace one or resolve prior risk.
`);
}

class CliError extends Error {}

main(process.argv.slice(2)).catch((error: unknown) => {
  const args = process.argv.slice(2);
  if (args[args.indexOf("--format") + 1] === "json") {
    const usage = error instanceof CliError;
    process.stdout.write(JSON.stringify({ tool: "agent-audit", schemaVersion: 2, error: { code: usage ? "INVALID_USAGE" : "OPERATION_FAILED", message: usage ? "Invalid command or option. Run agent-audit --help." : "Operation failed. Check input paths, permissions, and scan scope." } }) + "\n");
    process.exitCode = usage ? 2 : 1;
    return;
  }
  if (error instanceof CliError) {
    console.error(error.message);
    process.exitCode = 2;
    return;
  }
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
