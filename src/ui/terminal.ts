import readline from "node:readline";
import { sortFindings } from "../rules/definitions.js";
import type { Finding, InventoryItem, InventoryType, ScanReport, Severity } from "../types.js";

type SeverityFilter = Severity | "all";

interface CategorySummary {
  type: InventoryType;
  label: string;
  itemCount: number;
  findings: Finding[];
  severityCounts: Record<Severity, number>;
  sourceBuckets: Array<{ name: string; count: number }>;
}

export interface TerminalUiState {
  categoryIndex: number;
  severity: SeverityFilter;
  selectedIndex: number;
  showHelp: boolean;
}

export interface TerminalUiRenderOptions {
  width?: number;
  height?: number;
  color?: boolean;
}

interface TerminalUiRunOptions extends TerminalUiRenderOptions {
  input?: NodeJS.ReadStream;
  output?: NodeJS.WriteStream;
  interactive?: boolean;
}

const severities: Severity[] = ["critical", "high", "medium", "low", "info"];
const severityFilters: SeverityFilter[] = ["all", ...severities];
const inventoryTypes: InventoryType[] = ["skill", "plugin", "mcpServer", "hook", "config", "package"];

const categoryLabels: Record<InventoryType, string> = {
  skill: "Skills",
  plugin: "Plugins",
  mcpServer: "MCP servers",
  hook: "Hooks",
  config: "Configs",
  package: "Packages"
};

const severityLabels: Record<SeverityFilter, string> = {
  all: "All",
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  info: "Info"
};

const severityShortLabels: Record<Severity, string> = {
  critical: "CRIT",
  high: "HIGH",
  medium: "MED",
  low: "LOW",
  info: "INFO"
};

const severityAnsi: Record<Severity, string> = {
  critical: "\u001b[31;1m",
  high: "\u001b[38;5;202m",
  medium: "\u001b[33;1m",
  low: "\u001b[32m",
  info: "\u001b[34m"
};

const resetAnsi = "\u001b[0m";

export function createInitialTerminalUiState(): TerminalUiState {
  return {
    categoryIndex: 0,
    severity: "all",
    selectedIndex: 0,
    showHelp: false
  };
}

export async function runTerminalUi(report: ScanReport, options: TerminalUiRunOptions = {}): Promise<void> {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const interactive = options.interactive ?? Boolean(input.isTTY && output.isTTY);
  const state = createInitialTerminalUiState();

  if (!interactive) {
    output.write(renderTerminalUiScreen(report, state, { ...options, color: false }));
    return;
  }

  readline.emitKeypressEvents(input);
  input.setRawMode?.(true);
  input.resume();

  const render = (): void => {
    output.write("\u001b[2J\u001b[H");
    output.write(
      renderTerminalUiScreen(report, state, {
        width: options.width ?? output.columns,
        height: options.height ?? output.rows,
        color: options.color ?? true
      })
    );
  };

  render();

  await new Promise<void>((resolve) => {
    const onKeypress = (_inputValue: string, key: readline.Key): void => {
      const categories = buildCategorySummaries(report);
      const category = categories[clamp(state.categoryIndex, 0, categories.length - 1)];
      const visibleFindings = getVisibleFindings(category, state.severity);

      if (key.ctrl && key.name === "c") {
        cleanup();
        resolve();
        return;
      }

      if (key.name === "q" || key.name === "escape") {
        cleanup();
        resolve();
        return;
      }

      if (key.name === "right" || key.name === "l") {
        state.categoryIndex = (state.categoryIndex + 1) % categories.length;
        state.selectedIndex = 0;
      } else if (key.name === "left" || key.name === "h") {
        state.categoryIndex = (state.categoryIndex - 1 + categories.length) % categories.length;
        state.selectedIndex = 0;
      } else if (key.name === "down" || key.name === "j") {
        state.selectedIndex = clamp(state.selectedIndex + 1, 0, Math.max(0, visibleFindings.length - 1));
      } else if (key.name === "up" || key.name === "k") {
        state.selectedIndex = clamp(state.selectedIndex - 1, 0, Math.max(0, visibleFindings.length - 1));
      } else if (key.name === "a" || key.name === "0") {
        state.severity = "all";
        state.selectedIndex = 0;
      } else if (key.name && /^[1-5]$/.test(key.name)) {
        state.severity = severities[Number(key.name) - 1];
        state.selectedIndex = 0;
      } else if (key.name === "tab") {
        const currentIndex = severityFilters.indexOf(state.severity);
        state.severity = severityFilters[(currentIndex + 1) % severityFilters.length];
        state.selectedIndex = 0;
      } else if (key.name === "?") {
        state.showHelp = !state.showHelp;
      }

      render();
    };

    const cleanup = (): void => {
      input.off("keypress", onKeypress);
      input.setRawMode?.(false);
      output.write("\u001b[2J\u001b[H");
    };

    input.on("keypress", onKeypress);
  });
}

export function renderTerminalUiScreen(
  report: ScanReport,
  state: TerminalUiState = createInitialTerminalUiState(),
  options: TerminalUiRenderOptions = {}
): string {
  const width = options.width ?? 100;
  const height = options.height ?? 34;
  const color = options.color ?? false;
  const categories = buildCategorySummaries(report);
  const categoryIndex = clamp(state.categoryIndex, 0, categories.length - 1);
  const category = categories[categoryIndex];
  const visibleFindings = getVisibleFindings(category, state.severity);
  const selectedIndex = clamp(state.selectedIndex, 0, Math.max(0, visibleFindings.length - 1));
  const selected = visibleFindings[selectedIndex];
  const lines: string[] = [];

  lines.push(bold("Agent Audit UI", color), "Local-only. Read-only. No telemetry. No upload.");
  lines.push("");
  lines.push(renderRiskSummary(report, color));
  lines.push(renderCategoryTabs(categories, categoryIndex, width, color));
  lines.push(renderSeverityTabs(category, state.severity, width, color));
  lines.push("");
  lines.push(
    `${bold(category.label, color)}  ${category.itemCount} items  ${category.findings.length} findings  Sources: ${formatSourceBuckets(
      category.sourceBuckets
    )}`
  );
  lines.push("");

  if (state.showHelp) {
    lines.push("Keys: ←/→ category  1-5 severity  0/a all  ↑/↓ select  tab next severity  ? help  q quit");
    lines.push("");
  } else {
    lines.push("Keys: ←/→ category · 1-5 severity · 0/a all · ↑/↓ select · ? help · q quit");
    lines.push("");
  }

  if (visibleFindings.length === 0) {
    lines.push("No findings for this category/severity.");
  } else {
    const listHeight = Math.max(6, Math.floor(height * 0.38));
    const start = Math.max(0, selectedIndex - Math.floor(listHeight / 2));
    const rows = visibleFindings.slice(start, start + listHeight);
    lines.push(`${severityLabels[state.severity]} findings (${visibleFindings.length})`);
    for (const [offset, finding] of rows.entries()) {
      const absoluteIndex = start + offset;
      const marker = absoluteIndex === selectedIndex ? ">" : " ";
      lines.push(`${marker} ${formatFindingLine(finding, width, color)}`);
    }
  }

  lines.push("");
  lines.push("Selected");
  if (selected) {
    lines.push(...renderFindingDetail(selected, width, color));
  } else {
    lines.push("  Nothing selected.");
  }

  return `${fitLines(lines, height).join("\n")}\n`;
}

function buildCategorySummaries(report: ScanReport): CategorySummary[] {
  const inventoryById = new Map(report.inventory.map((item) => [item.id, item]));
  const categories = new Map<InventoryType, CategorySummary>(
    inventoryTypes.map((type) => [
      type,
      {
        type,
        label: categoryLabels[type],
        itemCount: report.inventory.filter((item) => item.type === type).length,
        findings: [],
        severityCounts: emptySeverityCounts(),
        sourceBuckets: summarizeSourceBuckets(report.inventory.filter((item) => item.type === type))
      }
    ])
  );

  for (const finding of sortFindings(report.findings)) {
    const type = getFindingInventoryType(finding, inventoryById);
    const category = categories.get(type);
    if (!category) {
      continue;
    }
    category.findings.push(finding);
    category.severityCounts[finding.severity] += 1;
  }

  return inventoryTypes.map((type) => categories.get(type)).filter((category): category is CategorySummary => Boolean(category));
}

function getVisibleFindings(category: CategorySummary, severity: SeverityFilter): Finding[] {
  if (severity === "all") {
    return category.findings;
  }
  return category.findings.filter((finding) => finding.severity === severity);
}

function renderRiskSummary(report: ScanReport, color: boolean): string {
  return severities
    .map((severity) => `${colorSeverity(severityLabels[severity], severity, color)} ${report.summary.findings[severity]}`)
    .join("  ");
}

function renderCategoryTabs(categories: CategorySummary[], activeIndex: number, width: number, color: boolean): string {
  const tabs = categories.map((category, index) => {
    const label = `${category.label} ${category.itemCount}/${category.findings.length}`;
    return index === activeIndex ? bold(`[${label}]`, color) : label;
  });
  return truncate(`Category: ${tabs.join("  ")}`, width);
}

function renderSeverityTabs(category: CategorySummary, active: SeverityFilter, width: number, color: boolean): string {
  const tabs = severityFilters.map((severity) => {
    const count = severity === "all" ? category.findings.length : category.severityCounts[severity];
    const label = `${severityLabels[severity]} ${count}`;
    const colored = severity === "all" ? label : colorSeverity(label, severity, color);
    return severity === active ? bold(`[${colored}]`, color) : colored;
  });
  return truncate(`Severity: ${tabs.join("  ")}`, width);
}

function formatFindingLine(finding: Finding, width: number, color: boolean): string {
  const location = formatLocation(finding);
  const prefix = colorSeverity(severityShortLabels[finding.severity].padEnd(4), finding.severity, color);
  return truncate(`${prefix} ${finding.ruleId} ${finding.title} ${location}`, width - 2);
}

function renderFindingDetail(finding: Finding, width: number, color: boolean): string[] {
  return [
    `  ${colorSeverity(severityLabels[finding.severity], finding.severity, color)}  ${finding.ruleId}`,
    `  ${wrap(finding.title, width - 2).join("\n  ")}`,
    `  ${wrap(finding.message, width - 2).join("\n  ")}`,
    `  Location: ${formatLocation(finding)}`,
    `  Recommendation: ${wrap(finding.recommendation, Math.max(20, width - 18)).join("\n  ")}`
  ];
}

function getFindingInventoryType(finding: Finding, inventoryById: Map<string, InventoryItem>): InventoryType {
  if (finding.itemId) {
    const item = inventoryById.get(finding.itemId);
    if (item) {
      return item.type;
    }
  }

  const location = finding.location.displayPath.toLowerCase();
  if (location.includes("skill.md")) {
    return "skill";
  }
  if (location.includes("package.json")) {
    return "package";
  }
  if (location.includes("hook")) {
    return "hook";
  }
  if (location.includes("mcp")) {
    return "mcpServer";
  }
  return "config";
}

function summarizeSourceBuckets(items: InventoryItem[]): Array<{ name: string; count: number }> {
  const buckets = new Map<string, number>();
  for (const item of items) {
    const bucket = sourceBucketForPath(item.displayPath);
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
  }
  return Array.from(buckets, ([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function sourceBucketForPath(displayPath: string): string {
  const pathValue = displayPath.toLowerCase();
  if (pathValue.includes(".skillclaw")) {
    return "SkillClaw";
  }
  if (pathValue.includes(".codex")) {
    return "Codex";
  }
  if (pathValue.includes(".claude")) {
    return "Claude";
  }
  if (pathValue.includes(".hermes")) {
    return "Hermes";
  }
  if (pathValue.includes("openclaw")) {
    return "OpenClaw";
  }
  if (pathValue.includes(".agents") || pathValue.startsWith("./") || !pathValue.startsWith("~")) {
    return "Workspace";
  }
  return "Other";
}

function emptySeverityCounts(): Record<Severity, number> {
  return {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0
  };
}

function formatSourceBuckets(buckets: Array<{ name: string; count: number }>): string {
  if (buckets.length === 0) {
    return "none";
  }
  return buckets
    .slice(0, 4)
    .map((bucket) => `${bucket.count} ${bucket.name}`)
    .join(", ");
}

function formatLocation(finding: Finding): string {
  const line = finding.location.line ? `:${finding.location.line}` : "";
  return `${finding.location.displayPath}${line}`;
}

function colorSeverity(value: string, severity: Severity, color: boolean): string {
  if (!color) {
    return value;
  }
  return `${severityAnsi[severity]}${value}${resetAnsi}`;
}

function bold(value: string, color: boolean): string {
  if (!color) {
    return value;
  }
  return `\u001b[1m${value}${resetAnsi}`;
}

function truncate(value: string, width: number): string {
  if (width <= 1 || value.length <= width) {
    return value;
  }
  return `${value.slice(0, Math.max(1, width - 1))}…`;
}

function wrap(value: string, width: number): string[] {
  const safeWidth = Math.max(20, width);
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current.length === 0) {
      current = word;
    } else if (current.length + word.length + 1 <= safeWidth) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines.length > 0 ? lines : [""];
}

function fitLines(lines: string[], height: number): string[] {
  const safeHeight = Math.max(12, height);
  if (lines.length <= safeHeight) {
    return lines;
  }
  return [...lines.slice(0, safeHeight - 1), "…"];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
