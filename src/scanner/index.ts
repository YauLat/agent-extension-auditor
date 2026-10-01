import fs from "node:fs/promises";
import os from "node:os";
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
  sanitizePublicSource,
  sanitizeJsonError
} from "../util/text.js";
import { exists, findFiles, hasSymlinkBelow, readSmallFile } from "./files.js";
import { getDefaultTargets } from "./targets.js";
import { readCodexMcpToml } from "./toml.js";

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
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const home = path.resolve(options.home ?? os.homedir());
  const generatedAt = options.generatedAt ?? new Date();
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const pathFilter = buildPathFilter(options, cwd, home);
  const targets = getDefaultTargets(cwd, home, { includeHome: options.includeHome }).filter((target) =>
    targetMatchesPathFilter(target.path, pathFilter)
  );
  const scannedLocations = await buildScannedLocations(targets, home);
  const context: ScanContext = {
    cwd,
    home,
    maxFileBytes,
    maxDepth,
    pathFilter,
    scannedSkills: new Set(),
    inventory: [],
    findings: []
  };

  for (const target of targets) {
    if (!(await exists(target.path)) || await hasSymlinkBelow(target.path, home) || await hasSymlinkBelow(target.path, cwd)) {
      continue;
    }
    if (target.kind === "skill-root") {
      await scanSkillRoot(target.path, context);
    } else if (target.kind === "plugin-root") {
      await scanPluginRoot(target.path, context);
    } else if (target.kind === "toml-config") {
      await scanTomlConfig(target.path, context);
    } else if (target.kind === "mcp-config" || target.kind === "agent-config") {
      await scanJsonConfig(target.path, context);
      await scanTextFile(target.path, context);
    } else if (target.kind === "workspace-config") {
      await scanTextFile(target.path, context);
    }
  }

  addDuplicateSkillFindings(context);

  const findings = sortFindings(context.findings);
  const inventory = context.inventory.sort((a, b) => a.displayPath.localeCompare(b.displayPath));
  const summary = buildSummary(inventory, findings);

  return {
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
    recommendedActions: buildRecommendedActions(findings, summary)
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
    recommendedActions: buildRecommendedActions(findings, summary)
  };
}

interface ScanContext {
  cwd: string;
  home: string;
  maxFileBytes: number;
  maxDepth: number;
  pathFilter: ScanPathFilter;
  scannedSkills: Set<string>;
  inventory: InventoryItem[];
  findings: Finding[];
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

async function scanSkillRoot(root: string, context: ScanContext): Promise<void> {
  const skillFiles = (await findFiles(root, (filePath) => path.basename(filePath) === "SKILL.md", context.maxDepth)).filter(
    (filePath) => pathMatchesPathFilter(filePath, context.pathFilter)
  );
  for (const skillFile of skillFiles) {
    await scanSkillFile(skillFile, context);
  }
}

async function scanSkillFile(skillFile: string, context: ScanContext, pluginId?: string): Promise<void> {
  if (!pathMatchesPathFilter(skillFile, context.pathFilter) || context.scannedSkills.has(skillFile)) return;
  context.scannedSkills.add(skillFile);
  const content = await readSmallFile(skillFile, context.maxFileBytes);
  if (content === undefined) return;

  const name = parseFrontmatterName(content) ?? path.basename(path.dirname(skillFile));
  const item: InventoryItem = {
    id: stableId("skill", skillFile),
    type: "skill",
    name,
    path: skillFile,
    displayPath: toDisplayPath(skillFile, context.home),
    source: inferSource(content),
    metadata: {
      bytes: Buffer.byteLength(content, "utf8"),
      ...(pluginId ? { pluginId } : {})
    }
  };
  context.inventory.push(item);

  if (!hasSourceMetadata(content)) {
    addFinding(context, "UNKNOWN_SOURCE", skillFile, {
      itemId: item.id,
      message: "Skill does not include obvious source, origin, repository, or URL metadata."
    });
  }
  if (Buffer.byteLength(content, "utf8") > OVERSIZED_SKILL_BYTES) {
    addFinding(context, "OVERSIZED_SKILL_CONTEXT", skillFile, {
      itemId: item.id,
      message: `Skill file is larger than ${OVERSIZED_SKILL_BYTES} bytes.`
    });
  }

  detectTextPatterns(content, skillFile, context, item.id);
}

async function scanPluginRoot(root: string, context: ScanContext): Promise<void> {
  const isManifest = (file: string) => path.basename(file) === "plugin.json"
    && [".claude-plugin", ".codex-plugin"].includes(path.basename(path.dirname(file)));
  const files = await findFiles(root, file => isManifest(file)
    || ["package.json", "SKILL.md", ".mcp.json"].includes(path.basename(file))
    || (path.basename(file) === "hooks.json" && path.basename(path.dirname(file)) === "hooks"), context.maxDepth);
  for (const manifest of files.filter(isManifest)) {
    await scanPluginManifest(manifest, context);
  }
  for (const packageFile of files.filter(file => path.basename(file) === "package.json")) {
    await scanPackageJson(packageFile, context);
  }
  const pluginRoots = files.filter(isManifest).map(file => path.dirname(path.dirname(file)));
  for (const file of files) {
    if (path.basename(file) === "SKILL.md") {
      const plugin = context.inventory.filter(item => item.type === "plugin" && isSameOrInside(file, item.path))
        .sort((a, b) => b.path.length - a.path.length)[0];
      await scanSkillFile(file, context, plugin?.id);
    } else if (pluginRoots.some(pluginRoot => file === path.join(pluginRoot, ".mcp.json")
      || file === path.join(pluginRoot, "hooks", "hooks.json"))) {
      await scanJsonConfig(file, context, path.basename(file) === ".mcp.json");
    }
  }
}

async function scanPluginManifest(filePath: string, context: ScanContext): Promise<void> {
  if (!pathMatchesPathFilter(filePath, context.pathFilter)) return;
  const content = await readSmallFile(filePath, context.maxFileBytes);
  if (content === undefined) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
    if (!isRecord(parsed)) throw new Error("Invalid manifest");
  } catch {
    addConfigInventory(filePath, context, { parseError: "Invalid plugin manifest JSON" });
    return;
  }
  const pluginRoot = path.dirname(path.dirname(filePath));
  const id = stableId("plugin", pluginRoot);
  if (!context.inventory.some(item => item.id === id)) {
    context.inventory.push({
      id, type: "plugin", name: stringValue(parsed.name) ?? path.basename(pluginRoot),
      path: pluginRoot, displayPath: toDisplayPath(pluginRoot, context.home),
      source: sanitizePublicSource(stringValue(parsed.repository) ?? stringValue(parsed.homepage)),
      metadata: { manifest: path.relative(pluginRoot, filePath), version: stringValue(parsed.version) ?? "unknown" }
    });
  }
  findMcpServers(parsed, filePath, context);
  detectJsonHooks(parsed, filePath, context);
}

function addConfigInventory(filePath: string, context: ScanContext, metadata?: InventoryItem["metadata"]): void {
  context.inventory.push({
    id: stableId("config", filePath), type: "config", name: path.basename(filePath),
    path: filePath, displayPath: toDisplayPath(filePath, context.home), metadata
  });
}

async function scanTomlConfig(filePath: string, context: ScanContext): Promise<void> {
  if (!pathMatchesPathFilter(filePath, context.pathFilter)) return;
  const content = await readSmallFile(filePath, context.maxFileBytes);
  if (content === undefined) return;
  const result = readCodexMcpToml(content);
  addConfigInventory(filePath, context, {
    coverage: "Static MCP subset; not full TOML validation",
    ...(result.parseError ? { parseError: result.parseError } : {})
  });
  for (const [name, config] of Object.entries(result.servers)) {
    inspectMcpServer(name, config, filePath, context, `mcp_servers.${name}`);
  }
}

async function scanPackageJson(packageFile: string, context: ScanContext): Promise<void> {
  if (!pathMatchesPathFilter(packageFile, context.pathFilter)) {
    return;
  }
  const content = await readSmallFile(packageFile, context.maxFileBytes);
  if (content === undefined) {
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    detectTextPatterns(content, packageFile, context);
    return;
  }

  if (!isRecord(parsed)) {
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
  const owningPlugin = context.inventory.some(existing => existing.type === "plugin"
    && (existing.id === pluginItem.id || (existing.metadata?.manifest && isSameOrInside(packageFile, existing.path))));
  if (!owningPlugin) context.inventory.push(pluginItem);

  const scripts = isRecord(parsed.scripts) ? parsed.scripts : {};
  for (const scriptName of ["preinstall", "install", "postinstall", "prepare"]) {
    if (typeof scripts[scriptName] === "string") {
      addFinding(context, "PLUGIN_POSTINSTALL", packageFile, {
        itemId: item.id,
        keyPath: `scripts.${scriptName}`,
        message: `Package defines lifecycle script "${scriptName}".`
      });
    }
  }

  if (parsed.bin !== undefined) {
    addFinding(context, "PLUGIN_BIN_EXECUTABLE", packageFile, {
      itemId: item.id,
      keyPath: "bin",
      message: "Package exposes one or more CLI executables."
    });
  }

  detectTextPatterns(content, packageFile, context, item.id);
}

async function scanJsonConfig(filePath: string, context: ScanContext, flatMcp = false): Promise<void> {
  if (!pathMatchesPathFilter(filePath, context.pathFilter)) {
    return;
  }
  const content = await readSmallFile(filePath, context.maxFileBytes);
  if (content === undefined) {
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    context.inventory.push({
      id: stableId("config", filePath),
      type: "config",
      name: path.basename(filePath),
      path: filePath,
      displayPath: toDisplayPath(filePath, context.home),
      metadata: {
        parseError: sanitizeJsonError(error)
      }
    });
    return;
  }

  context.inventory.push({
    id: stableId("config", filePath),
    type: "config",
    name: path.basename(filePath),
    path: filePath,
    displayPath: toDisplayPath(filePath, context.home)
  });

  findMcpServers(parsed, filePath, context);
  if (flatMcp && isRecord(parsed) && !Object.hasOwn(parsed, "mcpServers")) {
    for (const [name, config] of Object.entries(parsed)) {
      if (isRecord(config)) inspectMcpServer(name, config, filePath, context, name);
    }
  }
  detectJsonHooks(parsed, filePath, context);
}

async function scanTextFile(filePath: string, context: ScanContext): Promise<void> {
  if (!pathMatchesPathFilter(filePath, context.pathFilter)) {
    return;
  }
  if (!looksLikeTextFile(filePath)) {
    return;
  }
  const content = await readSmallFile(filePath, context.maxFileBytes);
  if (content === undefined) {
    return;
  }
  detectTextPatterns(content, filePath, context);
}

function findMcpServers(value: unknown, filePath: string, context: ScanContext, keyPath = ""): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => findMcpServers(entry, filePath, context, `${keyPath}[${index}]`));
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, entry] of Object.entries(value)) {
    const childPath = keyPath ? `${keyPath}.${key}` : key;
    if (key === "mcpServers" && isRecord(entry)) {
      for (const [serverName, serverConfig] of Object.entries(entry)) {
        inspectMcpServer(serverName, serverConfig, filePath, context, `${childPath}.${serverName}`);
      }
    } else {
      findMcpServers(entry, filePath, context, childPath);
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
      keyPath,
      ...(isRecord(serverConfig) && typeof serverConfig.enabled === "boolean"
        ? { configuredEnabled: serverConfig.enabled } : {})
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

  const envCount = (isRecord(serverConfig.env) ? Object.keys(serverConfig.env).length : 0)
    + (Array.isArray(serverConfig.env_vars) ? serverConfig.env_vars.length : 0)
    + (typeof serverConfig.bearer_token_env_var === "string" ? 1 : 0);
  if (envCount > 0) {
    addFinding(context, "MCP_ENV_REFERENCE", filePath, {
      itemId: item.id,
      keyPath: `${keyPath}.env`,
      message: `MCP server references ${envCount} environment variable(s). Secret values are not printed.`
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

function detectJsonHooks(value: unknown, filePath: string, context: ScanContext, keyPath = ""): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => detectJsonHooks(entry, filePath, context, `${keyPath}[${index}]`));
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, entry] of Object.entries(value)) {
    const childPath = keyPath ? `${keyPath}.${key}` : key;
    const keyLooksLikeHook = /hook|preToolUse|postToolUse|stop|notification/i.test(key);
    if (keyLooksLikeHook && containsShellCommand(entry)) {
      const item: InventoryItem = {
        id: stableId("hook", filePath, childPath),
        type: "hook",
        name: childPath,
        path: filePath,
        displayPath: toDisplayPath(filePath, context.home)
      };
      context.inventory.push(item);
      addFinding(context, "HOOK_SHELL_COMMAND", filePath, {
        itemId: item.id,
        keyPath: childPath,
        message: "Hook-like configuration contains shell command behavior."
      });
    }
    detectJsonHooks(entry, filePath, context, childPath);
  }
}

function detectRecordSecretReferences(
  value: unknown,
  filePath: string,
  context: ScanContext,
  itemId: string,
  keyPath: string
): void {
  const text = JSON.stringify(value);
  if (secretNamePattern.test(text) || envReferencePattern.test(text)) {
    addFinding(context, "SECRET_PATTERN_REFERENCE", filePath, {
      itemId,
      keyPath,
      message: "Configuration contains secret-like references. Secret values are not printed."
    });
  }
  resetRegexes();
}

function detectTextPatterns(content: string, filePath: string, context: ScanContext, itemId?: string): void {
  addRegexFinding(content, remoteScriptPattern, context, "REMOTE_SCRIPT_EXECUTION", filePath, {
    itemId,
    message: "File contains a remote script execution pattern.",
    evidence: documentedEvidence
  });
  addRegexFinding(content, secretNamePattern, context, "SECRET_PATTERN_REFERENCE", filePath, {
    itemId,
    message: "File contains secret-like references. Secret values are not printed.",
    evidence: documentedEvidence
  });
  addRegexFinding(content, outsideReadPattern, context, "WORKSPACE_OUTSIDE_READ", filePath, {
    itemId,
    message: "File references broad local reads outside the active workspace.",
    evidence: documentedEvidence
  });
  addRegexFinding(content, writeDeletePattern, context, "WRITE_OR_DELETE_CAPABILITY", filePath, {
    itemId,
    message: "File contains write or delete capability markers.",
    evidence: documentedEvidence
  });
  addRegexFinding(content, autoUpdatePattern, context, "AUTO_UPDATE_BEHAVIOR", filePath, {
    itemId,
    message: "File contains auto-update behavior markers.",
    evidence: documentedEvidence
  });
  const hookIndex = findNearbyHookShellIndex(content);
  if (hookIndex !== undefined) {
    const item: InventoryItem = {
      id: stableId("hook", filePath, String(hookIndex)),
      type: "hook",
      name: path.basename(filePath),
      path: filePath,
      displayPath: toDisplayPath(filePath, context.home)
    };
    context.inventory.push(item);
    addFinding(context, "HOOK_SHELL_COMMAND", filePath, {
      itemId: item.id,
      line: getLineNumber(content, hookIndex),
      message: "File mentions hook behavior with nearby shell command markers.",
      evidence: documentedEvidence
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
  context.findings.push({
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

function containsShellCommand(value: unknown): boolean {
  if (typeof value === "string") {
    return shellCommandPattern.test(value);
  }
  if (Array.isArray(value)) {
    return value.some((entry) => containsShellCommand(entry));
  }
  if (isRecord(value)) {
    return Object.values(value).some((entry) => containsShellCommand(entry));
  }
  return false;
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
