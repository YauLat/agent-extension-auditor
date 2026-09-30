import fs from "node:fs/promises";
import os from "node:os";
import { parse as parseToml } from "smol-toml";
import path from "node:path";
import type {
  FindingEvidence,
  Finding,
  InventoryItem,
  ScanOptions,
  ScanReport,
  ScannedLocation,
  Severity,
  TargetLocation
} from "../types.js";
import { VERSION } from "../version.js";
import { getRule, severityRank, sortFindings } from "../rules/definitions.js";
import { expandHome, stableId, toDisplayPath } from "../util/paths.js";
import {
  commandName,
  getLineNumber,
  hasSourceMetadata,
  looksLikeTextFile,
  parseFrontmatterName,
  sanitizePublicSource
} from "../util/text.js";
import { exists } from "./files.js";
import { ScanReader, isInside, type DiscoveredFile } from "./reader.js";
import { getDefaultTargets } from "./targets.js";

const DEFAULT_MAX_FILE_BYTES = 512 * 1024;
const DEFAULT_MAX_DEPTH = 6;
const OVERSIZED_SKILL_BYTES = 20_000;

const secretNamePattern =
  /\b([A-Z][A-Z0-9_]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|PRIVATE[_-]?KEY|ACCESS[_-]?KEY|CLIENT[_-]?SECRET)[A-Z0-9_]*)\b/g;
const envReferencePattern = /(?:\$\{?[A-Z_][A-Z0-9_]*\}?|process\.env\.[A-Z_][A-Z0-9_]*)/g;
const remoteScriptPattern = /\b(?:curl|wget)\b[\s\S]{0,220}(?:\||\>\s*\()?\s*(?:sh|bash|zsh)\b/i;
const shellCommandPattern = /\b(?:sh|bash|zsh|node|python3?|npx|uvx|docker|curl|wget)\b/;
const outsideReadPattern = /\b(?:readFile|cat|open)\b[\s\S]{0,120}(?:~\/|\.\.\/\.\.|\/Users\/|\/home\/)/i;
const writeDeletePattern =
  /\b(?:rm\s+-rf|rm\s+-r|unlink|deleteFile|fs\.writeFile|writeFile|writeTextFile|rmdir|trash|DROP\s+TABLE)\b/i;
const autoUpdatePattern = /\b(?:auto[-_]?update|self[-_]?update|updateInterval|npm\s+update|pnpm\s+update|yarn\s+upgrade)\b/i;

export async function scanAgentExtensions(options: ScanOptions = {}): Promise<ScanReport> {
  const cwd = await fs.realpath(path.resolve(options.cwd ?? process.cwd())).catch(() => path.resolve(options.cwd ?? process.cwd()));
  const home = await fs.realpath(path.resolve(options.home ?? os.homedir())).catch(() => path.resolve(options.home ?? os.homedir()));
  const generatedAt = options.generatedAt ?? new Date();
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const pathFilter = buildPathFilter(options, cwd, home);
  if (!Number.isSafeInteger(maxFileBytes) || maxFileBytes < 1 || maxFileBytes > 64 * 1024 * 1024
    || !Number.isSafeInteger(maxDepth) || maxDepth < 0 || maxDepth > 100) {
    throw new Error("Invalid scan limits: bytes must be 1..67108864; depth must be 0..100.");
  }
  const allTargets = getDefaultTargets(cwd, home, { includeHome: options.includeHome });
  const targets = allTargets.filter((target) => targetMatchesPathFilter(target.path, pathFilter));
  const reader = new ScanReader(targets, home, {
    includeHome: options.includeHome ?? true,
    ...pathFilter, maxFileBytes, maxDepth, defaultExcludedDirectories: ["node_modules", ".git", "dist"]
  });
  for (const target of allTargets) {
    if (!targets.includes(target)) reader.diagnostic("user_excluded", target.path, "target");
  }
  const scannedLocations = await buildScannedLocations(targets, home);
  const context: ScanContext = {
    cwd, home, maxFileBytes, maxDepth, pathFilter, reader,
    inventory: [], findings: [], processed: new Set()
  };
  // Discover all aliases before analysis so canonical assets retain every agent association.
  const discovered = new Map<TargetLocation, DiscoveredFile[]>();
  for (const target of targets) discovered.set(target, await reader.discover(target));
  for (const target of targets) {
    const files = discovered.get(target)!;
    if (target.kind === "skill-root") {
      await scanSkillRoot(files, context);
    } else if (target.kind === "plugin-root") {
      await scanPluginRoot(files, context);
    } else {
      for (const file of files) {
        if (context.processed.has(file.path)) continue;
        context.processed.add(file.path);
        if (["mcp-config", "agent-config", "toml-config"].includes(target.kind)) {
          await scanConfig(file.path, context, target.kind === "toml-config");
        } else {
          await scanTextFile(file.path, context);
        }
      }
    }
  }

  addDuplicateSkillFindings(context);

  const findings = sortFindings(context.findings);
  const inventory = context.inventory.sort((a, b) => a.displayPath.localeCompare(b.displayPath));
  const summary = buildSummary(inventory, findings);
  const coverage = reader.coverage();

  return {
    schemaVersion: 2,
    coverage,
    tool: "agent-audit",
    version: VERSION,
    generatedAt: generatedAt.toISOString(),
    privacy: {
      telemetry: false,
      uploaded: false
    },
    scannedLocations,
    inventory,
    findings,
    summary,
    recommendedActions: coverageActions(buildRecommendedActions(findings, summary), coverage.status)
  };
}

export function filterReportByMinSeverity(report: ScanReport, minSeverity?: Severity): ScanReport {
  const findings = minSeverity
    ? sortFindings(report.findings).filter((finding) => severityRank[finding.severity] >= severityRank[minSeverity])
    : sortFindings(report.findings);
  const summary = buildSummary(report.inventory, findings);
  return {
    ...report,
    findings,
    summary,
    filters: { minSeverity, hiddenFindings: report.findings.length - findings.length + (report.filters?.hiddenFindings ?? 0) },
    recommendedActions: coverageActions(buildRecommendedActions(findings, summary), report.coverage?.status)
  };
}

interface ScanContext {
  cwd: string;
  home: string;
  maxFileBytes: number;
  maxDepth: number;
  pathFilter: ScanPathFilter;
  inventory: InventoryItem[];
  findings: Finding[];
  reader: ScanReader;
  processed: Set<string>;
}

interface ScanPathFilter {
  includePaths: string[];
  excludePaths: string[];
}

async function buildScannedLocations(targets: TargetLocation[], home: string): Promise<ScannedLocation[]> {
  const locations: ScannedLocation[] = [];
  for (const target of targets) {
    locations.push({
      path: target.path,
      displayPath: toDisplayPath(target.path, home),
      kind: target.kind,
      exists: await exists(target.path),
      reason: target.reason
    });
  }
  return locations;
}

async function scanSkillRoot(files: DiscoveredFile[], context: ScanContext): Promise<void> {
  const skills = files.filter((file) => [...file.aliases].some((alias) => path.basename(alias) === "SKILL.md"));
  // The closest SKILL.md owns nested files; no double-reporting for nested skills.
  const owner = (filePath: string) => skills.filter((skill) => isInside(filePath, path.dirname(skill.path)))
    .sort((a, b) => b.path.length - a.path.length)[0];
  for (const file of skills) {
    const skillFile = file.path;
    if (context.processed.has(skillFile)) continue;
    context.processed.add(skillFile);
    const content = await context.reader.read(skillFile);
    if (content === undefined) continue;
    const item: InventoryItem = {
      id: stableId("skill", skillFile), type: "skill",
      name: parseFrontmatterName(content) ?? path.basename(path.dirname(skillFile)),
      path: skillFile, displayPath: toDisplayPath(skillFile, context.home),
      source: inferSource(content),
      aliases: [...file.aliases].map((alias) => toDisplayPath(alias, context.home)).sort(),
      agents: [...file.agents].sort(),
      metadata: { bytes: Buffer.byteLength(content, "utf8") }
    };
    context.inventory.push(item);
    if (!hasSourceMetadata(content)) addFinding(context, "UNKNOWN_SOURCE", skillFile, {
      itemId: item.id, message: "Skill does not include obvious source, origin, repository, or URL metadata."
    });
    if (Buffer.byteLength(content, "utf8") > OVERSIZED_SKILL_BYTES) addFinding(context, "OVERSIZED_SKILL_CONTEXT", skillFile, {
      itemId: item.id, message: `Skill file is larger than ${OVERSIZED_SKILL_BYTES} bytes.`
    });
    detectTextPatterns(content, skillFile, context, item.id);
    for (const bundled of files.filter((candidate) => candidate.path !== skillFile && owner(candidate.path) === file)) {
      if (context.processed.has(bundled.path)) continue;
      context.processed.add(bundled.path);
      if (!looksLikeTextFile(bundled.path)) {
        context.reader.diagnostic("unsupported_type", bundled.path);
        continue;
      }
      const text = await context.reader.read(bundled.path);
      if (text === undefined) continue;
      const evidence: FindingEvidence = /\.(md|mdx|txt)$/i.test(bundled.path)
        ? documentedEvidence : { kind: "code", confidence: "medium", active: "unknown" };
      detectTextPatterns(text, bundled.path, context, item.id, evidence, false);
      if (path.basename(bundled.path) === "package.json") {
        try {
          const parsed: unknown = JSON.parse(text);
          if (isRecord(parsed)) inspectPackageBehavior(parsed, bundled.path, context, item.id);
          else context.reader.diagnostic("invalid_config", bundled.path);
        } catch { context.reader.diagnostic("parse_failed", bundled.path); }
      }
    }
  }
}

async function scanPluginRoot(files: DiscoveredFile[], context: ScanContext): Promise<void> {
  for (const file of files.filter((entry) => [...entry.aliases].some((alias) => path.basename(alias) === "package.json"))) {
    if (context.processed.has(file.path)) continue;
    context.processed.add(file.path);
    await scanPackageJson(file.path, context);
  }
}

async function scanPackageJson(packageFile: string, context: ScanContext): Promise<void> {
  if (!pathMatchesPathFilter(packageFile, context.pathFilter)) {
    return;
  }
  const content = await context.reader.read(packageFile);
  if (content === undefined) {
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    context.reader.diagnostic("parse_failed", packageFile);
    return;
  }

  if (!isRecord(parsed)) {
    context.reader.diagnostic("invalid_config", packageFile);
    return;
  }

  const name = stringValue(parsed.name) ?? path.basename(path.dirname(packageFile));
  const source = sanitizePublicSource(stringValue(parsed.repository) ?? stringValue(parsed.homepage));
  const item: InventoryItem = {
    id: stableId("package", packageFile),
    type: "package",
    name,
    path: packageFile,
    displayPath: toDisplayPath(packageFile, context.home),
    source,
    metadata: {
      version: stringValue(parsed.version) ?? "unknown"
    }
  };
  context.inventory.push(item);

  const pluginItem: InventoryItem = {
    id: stableId("plugin", path.dirname(packageFile)),
    type: "plugin",
    name,
    path: path.dirname(packageFile),
    displayPath: toDisplayPath(path.dirname(packageFile), context.home),
    source,
    metadata: {
      package: name
    }
  };
  context.inventory.push(pluginItem);

  inspectPackageBehavior(parsed, packageFile, context, item.id);
  detectTextPatterns(content, packageFile, context, item.id, configuredEvidence, false);
}

function inspectPackageBehavior(parsed: Record<string, unknown>, packageFile: string, context: ScanContext, itemId: string): void {
  const scripts = isRecord(parsed.scripts) ? parsed.scripts : {};
  for (const scriptName of ["preinstall", "install", "postinstall", "prepare"]) {
    if (typeof scripts[scriptName] === "string") {
      addFinding(context, "PLUGIN_POSTINSTALL", packageFile, {
        itemId,
        keyPath: `scripts.${scriptName}`,
        message: `Package defines lifecycle script "${scriptName}".`
      });
    }
  }

  if (parsed.bin !== undefined) {
    addFinding(context, "PLUGIN_BIN_EXECUTABLE", packageFile, {
      itemId,
      keyPath: "bin",
      message: "Package exposes one or more CLI executables."
    });
  }

}

async function scanConfig(filePath: string, context: ScanContext, toml = false): Promise<void> {
  const content = await context.reader.read(filePath);
  if (content === undefined) return;
  const item: InventoryItem = {
    id: stableId("config", filePath), type: "config", name: path.basename(filePath),
    path: filePath, displayPath: toDisplayPath(filePath, context.home)
  };
  context.inventory.push(item);
  let parsed: unknown;
  try {
    parsed = toml ? parseToml(content, { maxDepth: 64 }) : JSON.parse(content);
  } catch {
    item.metadata = { parseError: toml ? "Invalid TOML" : "Invalid JSON" };
    context.reader.diagnostic("parse_failed", filePath);
    return;
  }
  if (!isRecord(parsed)) {
    context.reader.diagnostic("invalid_config", filePath);
    return;
  }
  findMcpServers(parsed, filePath, context);
  detectJsonHooks(parsed, filePath, context);
  detectTextPatterns(content, filePath, context, item.id, configuredEvidence, false);
}

async function scanTextFile(filePath: string, context: ScanContext): Promise<void> {
  if (!pathMatchesPathFilter(filePath, context.pathFilter)) {
    return;
  }
  if (!looksLikeTextFile(filePath)) {
    return;
  }
  const content = await context.reader.read(filePath);
  if (content === undefined) {
    return;
  }
  detectTextPatterns(content, filePath, context);
}

function findMcpServers(value: unknown, filePath: string, context: ScanContext, keyPath = "", depth = 0): void {
  if (depth > 64) { context.reader.diagnostic("structure_limit", filePath); return; }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => findMcpServers(entry, filePath, context, `${keyPath}[${index}]`, depth + 1));
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, entry] of Object.entries(value)) {
    const childPath = keyPath ? `${keyPath}.${key}` : key;
    if ((key === "mcpServers" || key === "mcp_servers") && isRecord(entry)) {
      for (const [serverName, serverConfig] of Object.entries(entry)) {
        inspectMcpServer(serverName, serverConfig, filePath, context, `${childPath}.${serverName}`);
      }
    } else {
      findMcpServers(entry, filePath, context, childPath, depth + 1);
    }
  }
}

function inspectMcpServer(
  serverName: string,
  serverConfig: unknown,
  filePath: string,
  context: ScanContext,
  keyPath: string
): void {
  const item: InventoryItem = {
    id: stableId("mcp", filePath, keyPath),
    type: "mcpServer",
    name: serverName,
    path: filePath,
    displayPath: toDisplayPath(filePath, context.home),
    metadata: {
      keyPath
    }
  };
  context.inventory.push(item);

  if (!isRecord(serverConfig)) {
    return;
  }

  const command = stringValue(serverConfig.command);
  if (command) {
    addFinding(context, "MCP_STDIO_COMMAND", filePath, {
      itemId: item.id,
      keyPath: `${keyPath}.command`,
      message: `MCP server starts local command "${commandName(command)}".`
    });
  }

  if (isRecord(serverConfig.env) && Object.keys(serverConfig.env).length > 0) {
    addFinding(context, "MCP_ENV_REFERENCE", filePath, {
      itemId: item.id,
      keyPath: `${keyPath}.env`,
      message: `MCP server references ${Object.keys(serverConfig.env).length} environment variable(s). Secret values are not printed.`
    });
  }

  const url = stringValue(serverConfig.url) ?? stringValue(serverConfig.serverUrl) ?? stringValue(serverConfig.endpoint);
  const transport = stringValue(serverConfig.transport);
  if (url || transport === "http" || transport === "sse" || transport === "streamable-http") {
    addFinding(context, "MCP_NETWORK_SERVER", filePath, {
      itemId: item.id,
      keyPath,
      message: "MCP server uses a network transport or endpoint."
    });
  }

  detectRecordSecretReferences(serverConfig, filePath, context, item.id, keyPath);
}

function detectJsonHooks(value: unknown, filePath: string, context: ScanContext, keyPath = "", inHooks = false, depth = 0): void {
  if (depth > 64) { context.reader.diagnostic("structure_limit", filePath); return; }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => detectJsonHooks(entry, filePath, context, `${keyPath}[${index}]`, inHooks, depth + 1));
    return;
  }
  if (!isRecord(value)) return;
  // Register command leaves once, not every enclosing hooks/matcher/event object.
  if (inHooks && typeof value.command === "string" && value.command.trim() && (value.type === undefined || value.type === "command")) {
    const commandPath = `${keyPath}.command`;
    const item: InventoryItem = {
      id: stableId("hook", filePath, commandPath), type: "hook", name: keyPath,
      path: filePath, displayPath: toDisplayPath(filePath, context.home)
    };
    context.inventory.push(item);
    addFinding(context, "HOOK_SHELL_COMMAND", filePath, {
      itemId: item.id, keyPath: commandPath, message: "Hook configuration contains a command. Execution has not been observed."
    });
  }
  for (const [key, entry] of Object.entries(value)) {
    const childPath = keyPath ? `${keyPath}.${key}` : key;
    detectJsonHooks(entry, filePath, context, childPath, inHooks || key === "hooks", depth + 1);
  }
}

function detectRecordSecretReferences(
  value: unknown,
  filePath: string,
  context: ScanContext,
  itemId: string,
  keyPath: string
): void {
  const containsReference = (entry: unknown, depth = 0): boolean => {
    if (depth > 64) { context.reader.diagnostic("structure_limit", filePath); return false; }
    if (typeof entry === "string") {
      resetRegexes();
      return secretNamePattern.test(entry) || envReferencePattern.test(entry);
    }
    if (Array.isArray(entry)) return entry.some((child) => containsReference(child, depth + 1));
    if (isRecord(entry)) return Object.entries(entry).some(([key, child]) => containsReference(key, depth + 1) || containsReference(child, depth + 1));
    return false;
  };
  if (containsReference(value)) {
    addFinding(context, "SECRET_PATTERN_REFERENCE", filePath, {
      itemId,
      keyPath,
      message: "Configuration contains secret-like references. Secret values are not printed."
    });
  }
  resetRegexes();
}

function detectTextPatterns(content: string, filePath: string, context: ScanContext, itemId?: string,
  evidence: FindingEvidence = documentedEvidence, detectHookMention = true): void {
  addRegexFinding(content, remoteScriptPattern, context, "REMOTE_SCRIPT_EXECUTION", filePath, {
    itemId,
    message: "File contains a remote script execution pattern.",
    evidence
  });
  addRegexFinding(content, secretNamePattern, context, "SECRET_PATTERN_REFERENCE", filePath, {
    itemId,
    message: "File contains secret-like references. Secret values are not printed.",
    evidence
  });
  addRegexFinding(content, outsideReadPattern, context, "WORKSPACE_OUTSIDE_READ", filePath, {
    itemId,
    message: "File references broad local reads outside the active workspace.",
    evidence
  });
  addRegexFinding(content, writeDeletePattern, context, "WRITE_OR_DELETE_CAPABILITY", filePath, {
    itemId,
    message: "File contains write or delete capability markers.",
    evidence
  });
  addRegexFinding(content, autoUpdatePattern, context, "AUTO_UPDATE_BEHAVIOR", filePath, {
    itemId,
    message: "File contains auto-update behavior markers.",
    evidence
  });
  const hookIndex = detectHookMention ? findNearbyHookShellIndex(content) : undefined;
  if (hookIndex !== undefined) {
    addFinding(context, "HOOK_SHELL_COMMAND", filePath, {
      itemId,
      line: getLineNumber(content, hookIndex),
      message: "File mentions hook behavior with nearby shell command markers.",
      evidence
    });
  }
  resetRegexes();
}

function addRegexFinding(
  content: string,
  regex: RegExp,
  context: ScanContext,
  ruleId: string,
  filePath: string,
  details: { itemId?: string; message: string; evidence: FindingEvidence }
): void {
  const match = regex.exec(content);
  if (!match || match.index === undefined) {
    return;
  }
  addFinding(context, ruleId, filePath, {
    itemId: details.itemId,
    line: getLineNumber(content, match.index),
    message: details.message,
    evidence: details.evidence
  });
}

const configuredEvidence: FindingEvidence = { kind: "configured", confidence: "high", active: "unknown" };

const documentedEvidence: FindingEvidence = {
  kind: "documented",
  confidence: "medium",
  active: "unknown"
};

function findNearbyHookShellIndex(content: string): number | undefined {
  const hookPattern = /\bhooks?\b/gi;
  let match: RegExpExecArray | null;

  while ((match = hookPattern.exec(content)) !== null) {
    const start = Math.max(0, match.index - 240);
    const end = Math.min(content.length, match.index + match[0].length + 240);
    const nearbyText = content.slice(start, end).replace(/^```(?:sh|bash|zsh)\s*$/gim, "");
    if (shellCommandPattern.test(nearbyText)) {
      return match.index;
    }
  }
  return undefined;
}

function addDuplicateSkillFindings(context: ScanContext): void {
  const byName = new Map<string, InventoryItem[]>();
  for (const item of context.inventory) {
    if (item.type !== "skill") {
      continue;
    }
    const key = item.name.toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), item]);
  }

  for (const items of byName.values()) {
    if (items.length < 2) {
      continue;
    }
    for (const item of items) {
      addFinding(context, "DUPLICATE_SKILL_NAME", item.path, {
        itemId: item.id,
        message: `Skill name "${item.name}" appears in ${items.length} locations.`
      });
    }
  }
}

function addFinding(
  context: ScanContext,
  ruleId: string,
  filePath: string,
  details: { itemId?: string; keyPath?: string; line?: number; message: string; evidence?: FindingEvidence }
): void {
  const rule = getRule(ruleId);
  const id = stableId("finding", ruleId, filePath, details.keyPath ?? "", String(details.line ?? ""), details.itemId ?? "");
  if (context.findings.some((finding) => finding.id === id)) return;
  context.findings.push({
    id,
    ruleId: rule.id,
    severity: rule.severity,
    title: rule.title,
    message: details.message,
    itemId: details.itemId,
    recommendation: rule.recommended_action,
    evidence:
      details.evidence ??
      (details.keyPath
        ? { kind: "configured", confidence: "high", active: "unknown" }
        : { kind: "metadata", confidence: "high", active: "unknown" }),
    remediation:
      ruleId === "UNKNOWN_SOURCE" && path.basename(filePath) === "SKILL.md"
        ? {
            mode: "guided",
            actionId: "skill.add-source",
            title: "Add source metadata",
            summary: "Add a user-supplied HTTPS source URL to this skill's frontmatter.",
            requiresInput: ["source"]
          }
        : {
            mode: "review",
            title: "Manual review required",
            summary: rule.recommended_action
          },
    location: {
      path: filePath,
      displayPath: toDisplayPath(filePath, context.home),
      line: details.line,
      keyPath: details.keyPath
    }
  });
}

function buildSummary(inventory: InventoryItem[], findings: Finding[]) {
  const findingCounts: Record<Severity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0
  };
  for (const finding of findings) {
    findingCounts[finding.severity] += 1;
  }

  return {
    inventory: {
      skills: inventory.filter((item) => item.type === "skill").length,
      plugins: inventory.filter((item) => item.type === "plugin").length,
      mcpServers: inventory.filter((item) => item.type === "mcpServer").length,
      hooks: inventory.filter((item) => item.type === "hook").length,
      configs: inventory.filter((item) => item.type === "config").length,
      packages: inventory.filter((item) => item.type === "package").length
    },
    findings: findingCounts
  };
}

function buildRecommendedActions(findings: Finding[], summary: ReturnType<typeof buildSummary>): string[] {
  if (findings.length === 0) {
    return [
      "No findings matched the current scan filters.",
      "Re-run without filters if you expected installed extensions to appear."
    ];
  }

  const actions: string[] = [];
  if (summary.findings.critical > 0) {
    actions.push("Review critical findings first, especially remote script execution patterns, before trusting the extension.");
  }
  if (summary.findings.high > 0) {
    actions.push("Review high findings for install scripts, hooks, local commands, and write/delete capability.");
  }
  if (hasRule(findings, "MCP_ENV_REFERENCE") || hasRule(findings, "SECRET_PATTERN_REFERENCE")) {
    actions.push("Check credential scope for MCP servers and secret-like references; secret values are intentionally not printed.");
  }
  if (hasRule(findings, "DUPLICATE_SKILL_NAME")) {
    actions.push("Resolve duplicate skill names by choosing a canonical copy or documenting why both should exist.");
  }
  if (actions.length === 0) {
    actions.push("Review medium and low findings for provenance, broad reads, and maintainability concerns.");
  }
  actions.push("Keep this report local because it may include extension names and filesystem paths.");
  return actions;
}

function hasRule(findings: Finding[], ruleId: string): boolean {
  return findings.some((finding) => finding.ruleId === ruleId);
}

function buildPathFilter(options: ScanOptions, cwd: string, home: string): ScanPathFilter {
  return {
    includePaths: normalizeFilterPaths(options.includePaths ?? [], cwd, home),
    excludePaths: normalizeFilterPaths(options.excludePaths ?? [], cwd, home)
  };
}

function normalizeFilterPaths(values: string[], cwd: string, home: string): string[] {
  return values.map((value) => {
    const expanded = expandHome(value, home);
    return path.resolve(path.isAbsolute(expanded) ? expanded : path.join(cwd, expanded));
  });
}

function targetMatchesPathFilter(targetPath: string, filter: ScanPathFilter): boolean {
  const normalizedTarget = path.resolve(targetPath);
  if (filter.excludePaths.some((excludedPath) => isSameOrInside(normalizedTarget, excludedPath))) {
    return false;
  }
  if (filter.includePaths.length === 0) {
    return true;
  }
  return filter.includePaths.some(
    (includedPath) => isSameOrInside(normalizedTarget, includedPath) || isSameOrInside(includedPath, normalizedTarget)
  );
}

function pathMatchesPathFilter(filePath: string, filter: ScanPathFilter): boolean {
  const normalizedPath = path.resolve(filePath);
  if (filter.excludePaths.some((excludedPath) => isSameOrInside(normalizedPath, excludedPath))) {
    return false;
  }
  if (filter.includePaths.length === 0) {
    return true;
  }
  return filter.includePaths.some((includedPath) => isSameOrInside(normalizedPath, includedPath));
}

function isSameOrInside(candidatePath: string, parentPath: string): boolean {
  const relativePath = path.relative(parentPath, candidatePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function inferSource(content: string): string | undefined {
  const match = content.match(/^(?:origin|source|repository|repo|url|homepage):\s*(\S+)/im);
  return sanitizePublicSource(match?.[1]);
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (isRecord(value) && typeof value.url === "string") {
    return value.url;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resetRegexes(): void {
  secretNamePattern.lastIndex = 0;
  envReferencePattern.lastIndex = 0;
}

function coverageActions(actions: string[], status?: string): string[] {
  return status && status !== "complete"
    ? ["Scan incomplete: inspect coverage diagnostics before interpreting finding counts.", ...actions]
    : actions;
}
