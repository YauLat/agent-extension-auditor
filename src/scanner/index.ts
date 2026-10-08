import fs from "node:fs/promises";
import os from "node:os";
import { createHash } from "node:crypto";
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
import { AuditOperationError } from "../util/errors.js";
import { annotateReview } from "../review/index.js";

const DEFAULT_MAX_FILE_BYTES = 512 * 1024;
const DEFAULT_MAX_DEPTH = 6;
const OVERSIZED_SKILL_BYTES = 20_000;

const secretNamePattern =
  /\b([A-Z][A-Z0-9_]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|PRIVATE[_-]?KEY|ACCESS[_-]?KEY|CLIENT[_-]?SECRET)[A-Z0-9_]*)\b/g;
const envReferencePattern = /(?:\$\{?[A-Z_][A-Z0-9_]*\}?|process\.env\.[A-Z_][A-Z0-9_]*)/g;
const remoteScriptPattern = /\b(?:curl|wget)\b[^\n|]{0,220}?\|\s*(?:sh|bash|zsh)\b/i;
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
  if (!(await fs.stat(cwd).catch(() => undefined))?.isDirectory()) {
    throw new AuditOperationError("INPUT_PATH_UNAVAILABLE", "Workspace root is not an accessible directory.");
  }
  if ((options.includeHome ?? true) && !(await fs.stat(home).catch(() => undefined))?.isDirectory()) {
    throw new AuditOperationError("INPUT_PATH_UNAVAILABLE", "Home root is not an accessible directory.");
  }
  const pathFilter = buildPathFilter(options, cwd, home);
  for (const key of ["includePaths", "excludePaths"] as const) {
    pathFilter[key] = await Promise.all(pathFilter[key].map(p => fs.realpath(p).catch(() => p)));
  }
  if (!Number.isSafeInteger(maxFileBytes) || maxFileBytes < 1 || maxFileBytes > 64 * 1024 * 1024
    || !Number.isSafeInteger(maxDepth) || maxDepth < 0 || maxDepth > 100) {
    throw new Error("Invalid scan limits: bytes must be 1..67108864; depth must be 0..100.");
  }
  const explicitTargets: TargetLocation[] = [];
  for (const value of options.paths ?? []) {
    const resolved = await fs.realpath(path.resolve(cwd, expandHome(value, home))).catch(() => undefined);
    if (!resolved) throw new AuditOperationError("INPUT_PATH_UNAVAILABLE", "Explicit scan path is not accessible.");
    const stat = await fs.stat(resolved);
    explicitTargets.push({ path: resolved, kind: stat.isDirectory() || ["package.json", "plugin.json"].includes(path.basename(resolved)) ? "plugin-root" : path.basename(resolved) === "SKILL.md" ? "skill-root"
      : resolved.endsWith(".toml") ? "toml-config" : resolved.endsWith(".json") ? "agent-config" : "workspace-config", reason: "Explicit scan path" });
  }
  const allTargets = explicitTargets.length ? explicitTargets : getDefaultTargets(cwd, home, { includeHome: options.includeHome });
  const targets = allTargets.filter((target) => targetMatchesPathFilter(target.path, pathFilter));
  const reader = new ScanReader(targets, home, {
    includeHome: explicitTargets.length ? false : options.includeHome ?? true,
    ...pathFilter, explicitPaths: explicitTargets.map(t => t.path), includePaths: pathFilter.includePaths.length ? pathFilter.includePaths : explicitTargets.map(t => t.path), maxFileBytes, maxDepth, defaultExcludedDirectories: ["node_modules", ".git", "dist", ".agent-audit-reviews"]
  });
  for (const target of allTargets) {
    if (!targets.includes(target)) reader.diagnostic("user_excluded", target.path, "target");
  }
  const scannedLocations = await buildScannedLocations(targets, home);
  const context: ScanContext = {
    cwd, home, maxFileBytes, maxDepth, pathFilter, reader,
    inventory: [], findings: [], findingIDs: new Set(), structuredSecretFiles: new Set(), documentedExamples: new Map(), findingOccurrences: new Map(), processed: new Set()
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

  for (const file of reader.files.values()) {
    if (context.processed.has(file.path)) continue;
    context.processed.add(file.path);
    await scanTextFile(file.path, context);
  }
  addDuplicateSkillFindings(context);
  annotateReview(context.findings, context.inventory);

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
  findingIDs: Set<string>;
  structuredSecretFiles: Set<string>;
  documentedExamples: Map<string, { start: number; end: number }[]>;
  findingOccurrences: Map<string, number>;
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
  // Resolve each file's nearest owning skill once, independent of library size.
  const skillByDirectory = new Map<string, DiscoveredFile>();
  for (const skill of skills) {
    const directory = path.dirname(skill.path);
    // Preserve first-discovered ownership when aliases resolve into one directory.
    if (!skillByDirectory.has(directory)) skillByDirectory.set(directory, skill);
  }
  const pluginByDirectory = new Map(context.inventory.filter(item => item.type === "plugin").map(item => [item.path, item]));
  const closest = <T>(directory: string, index: Map<string, T>): T | undefined => {
    let current = directory;
    while (true) {
      const found = index.get(current);
      if (found) return found;
      const parent = path.dirname(current);
      if (parent === current) return undefined;
      current = parent;
    }
  };
  const filesBySkill = new Map<DiscoveredFile, DiscoveredFile[]>();
  for (const candidate of files) {
    const owner = closest(path.dirname(candidate.path), skillByDirectory);
    if (owner && candidate.path !== owner.path) {
      const owned = filesBySkill.get(owner) ?? [];
      owned.push(candidate);
      filesBySkill.set(owner, owned);
    }
  }
  for (const file of skills) {
    const skillFile = file.path;
    if (context.processed.has(skillFile)) continue;
    context.processed.add(skillFile);
    const content = await context.reader.read(skillFile);
    if (content === undefined) continue;
    const owningPlugin = closest(path.dirname(skillFile), pluginByDirectory);
    const item: InventoryItem = {
      id: stableId("skill", skillFile), type: "skill",
      name: parseFrontmatterName(content) ?? path.basename(path.dirname(skillFile)),
      path: skillFile, displayPath: toDisplayPath(skillFile, context.home),
      source: inferSource(content),
      aliases: [...file.aliases].map((alias) => toDisplayPath(alias, context.home)).sort(),
      agents: [...file.agents].sort(),
      metadata: { bytes: Buffer.byteLength(content, "utf8"),
        ...(owningPlugin ? { pluginId: owningPlugin.id } : {}) },
      contentHash: hashAssetParts([["SKILL.md", content, context.reader.mode(skillFile) ?? 0]])
    };
    context.inventory.push(item);
    if (!hasSourceMetadata(content)) addFinding(context, "UNKNOWN_SOURCE", skillFile, {
      itemId: item.id, message: "Skill does not include obvious source, origin, repository, or URL metadata."
    });
    if (Buffer.byteLength(content, "utf8") > OVERSIZED_SKILL_BYTES) addFinding(context, "OVERSIZED_SKILL_CONTEXT", skillFile, {
      itemId: item.id, message: `Skill file is larger than ${OVERSIZED_SKILL_BYTES} bytes.`
    });
    detectTextPatterns(content, skillFile, context, item.id);
    for (const bundled of filesBySkill.get(file) ?? []) {
      if (context.processed.has(bundled.path)) continue;
      context.processed.add(bundled.path);
      if (!looksLikeTextFile(bundled.path)) {
        context.reader.diagnostic("unsupported_type", bundled.path);
        continue;
      }
      const text = await context.reader.read(bundled.path);
      if (text === undefined) continue;
      item.contentHash = hashAssetParts([
        ["previous", item.contentHash ?? "", 0],
        [path.relative(path.dirname(skillFile), bundled.path), text, context.reader.mode(bundled.path) ?? 0]
      ]);
      const evidence: FindingEvidence = /\.(md|mdx|txt)$/i.test(bundled.path)
        ? documentedEvidence : { kind: "code", confidence: "medium", active: "unknown" };
      detectTextPatterns(text, bundled.path, context, item.id, evidence, false);
      if (path.basename(bundled.path) === "package.json") {
        try {
          const parsed: unknown = JSON.parse(text);
          if (isRecord(parsed)) {
             context.inventory.push({ id: stableId("package", bundled.path), type: "package", name: stringValue(parsed.name) ?? path.basename(path.dirname(bundled.path)),
               path: bundled.path, displayPath: toDisplayPath(bundled.path, context.home), contentHash: hashText(text, context.reader.mode(bundled.path)) });
             inspectPackageBehavior(parsed, bundled.path, context, item.id);
           }
          else context.reader.diagnostic("invalid_config", bundled.path);
        } catch { context.reader.diagnostic("parse_failed", bundled.path); }
      }
    }
  }
}

async function scanPluginRoot(files: DiscoveredFile[], context: ScanContext): Promise<void> {
  const isManifest = (file: DiscoveredFile) => path.basename(file.path) === "plugin.json"
    && [".claude-plugin", ".codex-plugin"].includes(path.basename(path.dirname(file.path)));
  for (const file of files.filter(isManifest)) {
    if (context.processed.has(file.path)) continue;
    context.processed.add(file.path);
    await scanPluginManifest(file.path, context);
  }
  await scanSkillRoot(files, context);
  for (const file of files) {
    if (context.processed.has(file.path)) continue;
    context.processed.add(file.path);
    if (path.basename(file.path) === "package.json") await scanPackageJson(file.path, context);
    else if (path.basename(file.path) === ".mcp.json" || path.basename(file.path) === "hooks.json") {
      await scanConfig(file.path, context, false, path.basename(file.path) === ".mcp.json");
    } else if (looksLikeTextFile(file.path)) await scanTextFile(file.path, context);
    else context.reader.diagnostic("unsupported_type", file.path);
  }
}

async function scanPluginManifest(filePath: string, context: ScanContext): Promise<void> {
  if (!pathMatchesPathFilter(filePath, context.pathFilter)) return;
  const content = await context.reader.read(filePath);
  if (content === undefined) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
    if (!isRecord(parsed)) throw new Error("Invalid manifest");
  } catch {
    addConfigInventory(filePath, context, { parseError: "Invalid plugin manifest JSON" });
    context.reader.diagnostic("parse_failed", filePath);
    return;
  }
  const pluginRoot = path.dirname(path.dirname(filePath));
  const id = stableId("plugin", pluginRoot);
  if (!context.inventory.some(item => item.id === id)) {
    context.inventory.push({
      id, type: "plugin", name: stringValue(parsed.name) ?? path.basename(pluginRoot),
      path: pluginRoot, displayPath: toDisplayPath(pluginRoot, context.home),
      contentHash: hashText(content, context.reader.mode(filePath)),
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
    contentHash: hashText(content, context.reader.mode(packageFile)),
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
    contentHash: item.contentHash,
    metadata: {
      package: name
    }
  };
  const owningPlugin = context.inventory.some(existing => existing.type === "plugin"
    && (existing.id === pluginItem.id || (existing.metadata?.manifest && isSameOrInside(packageFile, existing.path))));
  if (!owningPlugin) context.inventory.push(pluginItem);

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

async function scanConfig(filePath: string, context: ScanContext, toml = false, flatMcp = false): Promise<void> {
  const content = await context.reader.read(filePath);
  if (content === undefined) return;
  const item: InventoryItem = {
    id: stableId("config", filePath), type: "config", name: path.basename(filePath),
    path: filePath, displayPath: toDisplayPath(filePath, context.home),
    contentHash: hashText(content, context.reader.mode(filePath))
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
  const inspectedFlatServers = new Set<string>();
  if (flatMcp && !Object.hasOwn(parsed, "mcpServers") && !Object.hasOwn(parsed, "mcp_servers")) {
    for (const [name, config] of Object.entries(parsed)) {
      if (isRecord(config)) {
        inspectMcpServer(name, config, filePath, context, name);
        inspectedFlatServers.add(name);
      }
    }
  }
  detectJsonHooks(parsed, filePath, context);
  // Review remaining config branches structurally as well, so deduplicating MCP
  // text references cannot hide unrelated credentials elsewhere in this file.
  detectNonMcpSecrets(parsed, filePath, context, item.id, "", 0, true, inspectedFlatServers);
  detectTextPatterns(content, filePath, context, item.id, configuredEvidence, false);
}

function detectNonMcpSecrets(value: unknown, filePath: string, context: ScanContext, itemId: string, keyPath = "", depth = 0, skipMcpContainers = true, excludedPaths?: ReadonlySet<string>): void {
  if (depth > 64) { context.reader.diagnostic("structure_limit", filePath); return; }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => detectNonMcpSecrets(entry, filePath, context, itemId, `${keyPath}[${index}]`, depth + 1, skipMcpContainers, excludedPaths));
  } else if (isRecord(value)) {
    for (const [key, entry] of Object.entries(value)) {
      if (skipMcpContainers && (key === "mcpServers" || key === "mcp_servers")) continue;
      const child = keyPath ? `${keyPath}.${key}` : key;
      if (excludedPaths?.has(child)) continue;
      detectRecordSecretReferences(key, filePath, context, itemId, child);
      detectNonMcpSecrets(entry, filePath, context, itemId, child, depth + 1, skipMcpContainers, excludedPaths);
    }
  } else {
    detectRecordSecretReferences(value, filePath, context, itemId, keyPath);
  }
}

async function scanTextFile(filePath: string, context: ScanContext): Promise<void> {
  if (!pathMatchesPathFilter(filePath, context.pathFilter)) {
    return;
  }
  if (!looksLikeTextFile(filePath)) {
    context.reader.diagnostic("unsupported_type", filePath);
    return;
  }
  const content = await context.reader.read(filePath);
  if (content === undefined) {
    return;
  }
  const item: InventoryItem = {
    id: stableId("config", filePath), type: "config", name: path.basename(filePath),
    path: filePath, displayPath: toDisplayPath(filePath, context.home),
    contentHash: hashText(content, context.reader.mode(filePath))
  };
  context.inventory.push(item);
  detectTextPatterns(content, filePath, context, item.id, /\.(md|mdx|txt)$/i.test(filePath) ? documentedEvidence : { kind: "code", confidence: "medium", active: "unknown" });
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
    contentHash: hashText(JSON.stringify(serverConfig), context.reader.mode(filePath)),
    metadata: {
      keyPath,
      ...(isRecord(serverConfig) && typeof serverConfig.enabled === "boolean" ? { configuredEnabled: serverConfig.enabled } : {})
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

  // Preserve separate credential locations; key and value signals at the same
  // location share a finding ID, without a second config-owned copy.
  detectNonMcpSecrets(serverConfig, filePath, context, item.id, keyPath, 0, false);
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
      path: filePath, displayPath: toDisplayPath(filePath, context.home),
      contentHash: hashText(value.command, context.reader.mode(filePath))
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
  if (evidence.kind === "documented") {
    const ranges = documentedExampleRanges(content);
    if (ranges.length) context.documentedExamples.set(filePath, ranges);
  }
  addRegexFinding(content, remoteScriptPattern, context, "REMOTE_SCRIPT_EXECUTION", filePath, {
    itemId,
    message: "File contains a remote script execution pattern.",
    evidence
  });
  const hasStructuredSecret = context.structuredSecretFiles.has(filePath);
  if (!hasStructuredSecret) addRegexFinding(content, secretNamePattern, context, "SECRET_PATTERN_REFERENCE", filePath, {
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
  if (evidence.kind === "documented") {
    addRegexFinding(content, /\b(?:ignore|bypass|override)\b[^\n]{0,100}\b(?:instructions|safety|safeguards)\b[\s\S]{0,320}?(?:\b(?:private|secrets?|credentials?|tokens?)\b[\s\S]{0,160}\b(?:send|upload|post|exfiltrate)\b|\b(?:send|upload|post|exfiltrate)\b[\s\S]{0,160}\b(?:private|secrets?|credentials?|tokens?)\b)/i,
      context, "PROMPT_INJECTION_EXFILTRATION", filePath, { itemId, message: "Text combines instruction bypass with a request to transmit private data. Review surrounding context; this is a bounded heuristic.", evidence });
    addRegexFinding(content, /(?:忽略|繞過|绕过|無視|无视|覆蓋|覆盖)[^\n。！？]{0,80}(?:指令|規則|规则|安全|限制)[^\n。！？]{0,240}(?:(?:私人|私密|憑證|凭据|密鑰|密钥|秘密|令牌)[^\n。！？]{0,100}(?:上傳|上传|發送|发送|傳送|传送|外傳|外传)|(?:上傳|上传|發送|发送|傳送|传送|外傳|外传)[^\n。！？]{0,100}(?:私人|私密|憑證|凭据|密鑰|密钥|秘密|令牌))/i,
      context, "PROMPT_INJECTION_EXFILTRATION", filePath, {itemId, message: "Text combines instruction bypass with a request to transmit private data. Review surrounding context; this is a bounded heuristic.", evidence});
  } else if (evidence.kind === "code") {
    for (const index of environmentUploadCalls(content)) {
      addFinding(context, "ENV_NETWORK_EXFILTRATION", filePath, {itemId, line:getLineNumber(content,index), evidence,
        message:"An HTTP upload call contains a direct environment reference. Review the payload and destination; static proximity does not prove runtime data flow."});
    }
  }
  resetRegexes();
}

// Mask string literals and comments, preserving offsets; then inspect only each
// bounded, balanced upload call. Never bridge two unrelated statements/calls.
function environmentUploadCalls(content: string): number[] {
  const masked = content.replace(/(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\*[\s\S]*?\*\/|\/\/[^\n]*|#[^\n]*)/g,
    value => value.replace(/[^\n]/g, " "));
  const sink = /\b(?:requests\.(?:post|put|patch)|axios\.(?:post|put|patch)|fetch)\s*\(/g;
  const indices: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = sink.exec(masked)) && indices.length < 20) {
    let depth = 1, end = sink.lastIndex;
    const limit = Math.min(masked.length, end + 1000);
    for (; end < limit && depth > 0; end++) {
      if (masked[end] === "(") depth++;
      else if (masked[end] === ")") depth--;
    }
    if (depth === 0 && /\b(?:process\s*\.\s*env|os\s*\.\s*environ)\b/.test(masked.slice(sink.lastIndex, end))) indices.push(match.index);
  }
  return indices;
}

function addRegexFinding(
  content: string,
  regex: RegExp,
  context: ScanContext,
  ruleId: string,
  filePath: string,
  details: { itemId?: string; message: string; evidence: FindingEvidence }
): void {
  const matcher = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : regex.flags + "g");
  let match: RegExpExecArray | null;
  let emitted = 0;
  while ((match = matcher.exec(content)) && emitted < 20) {
    const lineStart = content.lastIndexOf("\n", match.index - 1) + 1;
    const prefix = content.slice(lineStart, match.index).split(/[.!?]\s+|[。！？；;]/).at(-1) ?? "";
    const prohibited = details.evidence.kind === "documented"
      && /(?:^|[\s>*-])(?:(?:never|do not|don't|must not|avoid)\b|禁止|不可|不要)[^;\n]{0,70}$/i.test(prefix);
    addFinding(context, ruleId, filePath, {
      itemId: details.itemId, line: getLineNumber(content, match.index),
      message: prohibited ? "Documented prohibition contains this pattern; retained for context, not treated as an execution instruction." : details.message,
      evidence: details.evidence, severity: prohibited ? "info" : undefined,
      reviewContext: context.documentedExamples.get(filePath)?.some(range => match!.index >= range.start && match!.index < range.end) ? "example" : undefined
    });
    emitted++;
    if (!match[0].length) matcher.lastIndex++;
  }
  if (emitted >= 20 && match) context.reader.diagnostic("structure_limit", filePath);
}

function documentedExampleRanges(content: string): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  const fences = /^([\t ]*)(`{3,}|~{3,})[^\n]*\n/gm;
  let opening: RegExpExecArray | null;
  while ((opening = fences.exec(content))) {
    const marker = opening[2];
    const close = new RegExp(`^[\\t ]*${marker[0]}{${marker.length},}[\\t ]*$`, "gm");
    close.lastIndex = fences.lastIndex;
    const closing = close.exec(content);
    if (!closing) break;
    const prefix = content.slice(Math.max(0, opening.index - 200), opening.index).split(/\n\s*\n/).at(-1) ?? "";
    if (/(?:unsafe example|anti-pattern|do not execute|dangerous example|危險示例|危险示例|不安全示例|反例)/i.test(prefix)) {
      ranges.push({start:fences.lastIndex,end:closing.index});
    }
    fences.lastIndex = close.lastIndex;
  }
  return ranges;
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
  details: { itemId?: string; keyPath?: string; line?: number; message: string; evidence?: FindingEvidence; severity?: Severity; reviewContext?: "example" }
): void {
  const rule = getRule(ruleId);
  const id = stableId("finding", ruleId, filePath, details.keyPath ?? "", String(details.line ?? ""), details.itemId ?? "", details.severity ?? "");
  if (context.findingIDs.has(id)) return;
  context.findingIDs.add(id);
  if (ruleId === "SECRET_PATTERN_REFERENCE" && details.keyPath) context.structuredSecretFiles.add(filePath);
  const occurrenceKey = JSON.stringify([ruleId, filePath, details.itemId]);
  const occurrence = context.findingOccurrences.get(occurrenceKey) ?? 0;
  context.findingOccurrences.set(occurrenceKey, occurrence + 1);
  context.findings.push({
    id,
    ruleId: rule.id,
    severity: details.severity ?? (ruleId === "MCP_STDIO_COMMAND" && context.inventory.find(item => item.id === details.itemId)?.metadata?.configuredEnabled === false ? "medium" : rule.severity),
    fingerprint: stableId("finding", ruleId, filePath, details.keyPath ?? "", details.itemId ?? "", details.severity ?? rule.severity,
      String(occurrence)),
    title: rule.title,
    message: details.message,
    itemId: details.itemId,
    recommendation: rule.recommended_action,
    explanation: { detected: rule.what_it_detects, impact: rule.why_it_matters, limits: rule.false_positive_notes },
    ...(details.reviewContext ? {review:{context:details.reviewContext,priority:3}} : {}),
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
  return isInside(candidatePath, parentPath);
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

function hashText(content: string, mode = 0): string {
  return hashAssetParts([["content", content, mode]]);
}

function hashAssetParts(parts: Array<[string, string, number]>): string {
  const hash = createHash("sha256");
  for (const [name, content, mode] of parts.sort(([a], [b]) => a.localeCompare(b))) {
    hash.update(name.length.toString()).update(":").update(name).update("\0");
    hash.update((mode & 0o777).toString(8)).update("\0");
    hash.update(content.length.toString()).update(":").update(content).update("\0");
  }
  return hash.digest("hex");
}

function coverageActions(actions: string[], status?: string): string[] {
  return status && status !== "complete"
    ? ["Scan incomplete: inspect coverage diagnostics before interpreting finding counts.", ...actions]
    : actions;
}
