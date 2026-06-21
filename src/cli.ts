#!/usr/bin/env node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { explainRule } from "./explain/index.js";
import { renderReport, type ReportFormat } from "./report/index.js";
import { scanAgentExtensions } from "./scanner/index.js";
import { exists } from "./scanner/files.js";
import { getDefaultTargets } from "./scanner/targets.js";
import { rules } from "./rules/definitions.js";
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
  const report = await scanAgentExtensions({
    cwd: parsed.root,
    home: parsed.home
  });
  const output = renderReport(report, parsed.format);

  if (parsed.output) {
    await fs.writeFile(parsed.output, output, "utf8");
    console.log(`Wrote ${parsed.format} report to ${parsed.output}`);
    return;
  }

  process.stdout.write(output);
}

async function runDoctor(args: string[]): Promise<void> {
  const parsed = parseOptions(args);
  const cwd = path.resolve(parsed.root ?? process.cwd());
  const home = path.resolve(parsed.home ?? os.homedir());
  const targets = getDefaultTargets(cwd, home);
  const lines = [
    "Agent Audit Doctor",
    "",
    `Version: ${VERSION}`,
    `Node: ${process.version}`,
    `CWD: ${cwd}`,
    `Home: ${home}`,
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
  output?: string;
  root?: string;
  home?: string;
}

function parseOptions(args: string[]): ParsedOptions {
  const parsed: ParsedOptions = {
    format: "terminal"
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--format") {
      const value = args[++index];
      if (!isReportFormat(value)) {
        throw new CliError(`Unsupported format: ${value ?? ""}`);
      }
      parsed.format = value;
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
  return value === "terminal" || value === "markdown" || value === "json";
}

function printHelp(): void {
  console.log(`agent-audit ${VERSION}

Local-first CLI for auditing agent skills, plugins, MCP servers, hooks, and extension risk.

Usage:
  agent-audit scan [--format terminal|markdown|json] [--output report.md]
  agent-audit explain <RULE_ID>
  agent-audit doctor

Options:
  --root <path>   Workspace root to scan. Defaults to the current directory.
  --home <path>   Home directory to scan. Defaults to the current user's home.
  --format        Report format for scan. Defaults to terminal.
  --output, -o    Write the rendered report to a file.
  --version, -v   Print version.
  --help, -h      Print help.

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
