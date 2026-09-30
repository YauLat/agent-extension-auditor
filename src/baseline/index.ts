import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { Finding, InventoryItem, InventoryType, ScanReport, Severity } from "../types.js";
import { RULESET_VERSION } from "../version.js";

const MAX_BASELINE_BYTES = 16 * 1024 * 1024;

export interface BaselineFinding {
  signature: string;
  ruleId: string;
  severity: Severity;
  evidenceKind: string;
  location: string;
  keyPath?: string;
}

export interface BaselineAsset {
  identityHash: string;
  contentHash: string;
  reviewHash: string;
  type: InventoryType;
  name: string;
  source?: string;
  agents?: string[];
  findings: BaselineFinding[];
}

export interface BaselineSnapshot {
  tool: "agent-audit-baseline";
  schemaVersion: 1;
  createdAt: string;
  reportSchemaVersion: 2;
  scannerVersion: string;
  rulesetVersion: string;
  scopeHash: string;
  coverageStatus: "complete";
  assets: BaselineAsset[];
}

export interface BaselineAssetChange {
  type: InventoryType;
  name: string;
  identityHash: string;
  previousReviewHash?: string;
  currentReviewHash?: string;
}

export interface BaselineFindingChange extends BaselineFinding {
  assetType: InventoryType;
  assetName: string;
  assetIdentityHash: string;
}

export interface BaselineDiff {
  tool: "agent-audit-baseline-diff";
  schemaVersion: 1;
  status: "comparable" | "partial" | "incompatible";
  reasons: string[];
  baselineCreatedAt: string;
  currentGeneratedAt: string;
  addedAssets: BaselineAssetChange[];
  removedAssets: BaselineAssetChange[];
  changedAssets: BaselineAssetChange[];
  newFindings: BaselineFindingChange[];
  resolvedFindings: BaselineFindingChange[];
  unresolvedBaselineAssets: number;
  summary: {
    addedAssets: number;
    removedAssets: number;
    changedAssets: number;
    newFindings: number;
    resolvedFindings: number;
  };
}

export class BaselineError extends Error {}

export function createBaseline(report: ScanReport): BaselineSnapshot {
  if (report.schemaVersion !== 2 || !report.coverage) {
    throw new BaselineError("A schema 2 report with coverage is required to create a baseline.");
  }
  if (report.coverage.status !== "complete") {
    throw new BaselineError("An incomplete scan cannot create or replace a baseline.");
  }
  return snapshotReport(report);
}

export function compareBaseline(baseline: BaselineSnapshot, report: ScanReport): BaselineDiff {
  const reasons: string[] = [];
  if (report.schemaVersion !== baseline.reportSchemaVersion || !report.coverage) {
    reasons.push("report_schema_mismatch");
  }
  if (baseline.rulesetVersion !== RULESET_VERSION) {
    reasons.push("ruleset_mismatch");
  }
  if (report.coverage && baseline.scopeHash !== hashValue(report.coverage.scope)) {
    reasons.push("scope_mismatch");
  }
  if (reasons.length > 0) {
    return emptyDiff(baseline, report, "incompatible", reasons);
  }

  const current = snapshotReport(report, false);
  const { matched, previousOnly, currentOnly } = matchAssets(baseline.assets, current.assets);
  const incomplete = report.coverage!.status !== "complete";
  const addedAssets = currentOnly.map((asset) => assetChange(asset, "current"));
  const removedAssets = incomplete ? [] : previousOnly.map((asset) => assetChange(asset, "previous"));
  const changedAssets: BaselineAssetChange[] = [];
  const newFindings: BaselineFindingChange[] = [];
  const resolvedFindings: BaselineFindingChange[] = [];

  for (const [previous, next] of matched) {
    if (previous.reviewHash !== next.reviewHash) {
      changedAssets.push({
        type: next.type,
        name: next.name,
        identityHash: next.identityHash,
        previousReviewHash: previous.reviewHash,
        currentReviewHash: next.reviewHash
      });
    }
    const previousFindings = new Map(previous.findings.map((finding) => [finding.signature, finding]));
    const currentFindings = new Map(next.findings.map((finding) => [finding.signature, finding]));
    for (const finding of next.findings) {
      if (!previousFindings.has(finding.signature)) newFindings.push(findingChange(finding, next));
    }
    if (!incomplete) {
      for (const finding of previous.findings) {
        if (!currentFindings.has(finding.signature)) resolvedFindings.push(findingChange(finding, previous));
      }
    }
  }
  for (const asset of currentOnly) {
    newFindings.push(...asset.findings.map((finding) => findingChange(finding, asset)));
  }
  if (!incomplete) {
    for (const asset of previousOnly) {
      resolvedFindings.push(...asset.findings.map((finding) => findingChange(finding, asset)));
    }
  }

  const status = incomplete ? "partial" : "comparable";
  if (incomplete) reasons.push("current_scan_incomplete");
  return finishDiff({
    tool: "agent-audit-baseline-diff",
    schemaVersion: 1,
    status,
    reasons,
    baselineCreatedAt: baseline.createdAt,
    currentGeneratedAt: report.generatedAt,
    addedAssets: sortAssetChanges(addedAssets),
    removedAssets: sortAssetChanges(removedAssets),
    changedAssets: sortAssetChanges(changedAssets),
    newFindings: sortFindingChanges(newFindings),
    resolvedFindings: sortFindingChanges(resolvedFindings),
    unresolvedBaselineAssets: incomplete ? baseline.assets.length : 0,
    summary: { addedAssets: 0, removedAssets: 0, changedAssets: 0, newFindings: 0, resolvedFindings: 0 }
  });
}

export async function readBaseline(filePath: string): Promise<BaselineSnapshot> {
  const { content } = await readExistingBaseline(filePath);
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    throw new BaselineError("Baseline file is not valid JSON.");
  }
  if (!isBaseline(value)) throw new BaselineError("Baseline file has an unsupported or invalid shape.");
  return value;
}

export async function writeBaseline(filePath: string, baseline: BaselineSnapshot, replace: boolean): Promise<void> {
  const target = path.resolve(filePath);
  const directory = path.dirname(target);
  const realDirectory = await fs.realpath(directory).catch(() => undefined);
  if (!realDirectory || realDirectory !== directory) {
    throw new BaselineError("Baseline directory must exist and must not resolve through a symbolic link.");
  }
  let expectedHash: string | undefined;
  try {
    expectedHash = (await readExistingBaseline(target)).hash;
    if (!replace) throw new BaselineError("Baseline already exists; use baseline accept --yes to replace it.");
  } catch (error) {
    if (error instanceof BaselineError && !error.message.startsWith("Baseline file does not exist")) throw error;
  }

  const temporary = path.join(directory, `.${path.basename(target)}.agent-audit-${randomUUID()}.tmp`);
  const output = `${JSON.stringify(baseline, null, 2)}\n`;
  try {
    const handle = await fs.open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(output, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.chmod(temporary, 0o600);
    if (expectedHash) {
      const current = await readExistingBaseline(target);
      if (current.hash !== expectedHash) throw new BaselineError("Baseline changed during update; replacement was cancelled.");
    } else if (await fs.lstat(target).then(() => true).catch(() => false)) {
      throw new BaselineError("Baseline appeared during creation; write was cancelled.");
    }
    await fs.rename(temporary, target);
  } finally {
    await fs.unlink(temporary).catch(() => undefined);
  }
}

export async function deleteBaseline(filePath: string): Promise<void> {
  const target = path.resolve(filePath);
  const before = await readExistingBaseline(target);
  const after = await readExistingBaseline(target);
  if (before.hash !== after.hash) throw new BaselineError("Baseline changed during deletion; delete was cancelled.");
  await fs.unlink(target);
}

export function renderBaselineDiff(diff: BaselineDiff): string {
  const lines = [
    "Agent Audit Baseline Diff",
    "",
    `Status: ${diff.status}`,
    `Reasons: ${diff.reasons.join(", ") || "none"}`,
    `Added assets: ${diff.summary.addedAssets}`,
    `Removed assets: ${diff.summary.removedAssets}`,
    `Changed assets: ${diff.summary.changedAssets}`,
    `New findings: ${diff.summary.newFindings}`,
    `Resolved findings: ${diff.summary.resolvedFindings}`
  ];
  if (diff.unresolvedBaselineAssets) {
    lines.push(`Unresolved baseline assets: ${diff.unresolvedBaselineAssets} (incomplete scans never resolve prior risk)`);
  }
  const addAssets = (title: string, values: BaselineAssetChange[]) => {
    if (!values.length) return;
    lines.push("", `${title}:`);
    for (const value of values) lines.push(`  - ${value.type}: ${value.name}`);
  };
  addAssets("Added assets", diff.addedAssets);
  addAssets("Removed assets", diff.removedAssets);
  addAssets("Changed assets", diff.changedAssets);
  const addFindings = (title: string, values: BaselineFindingChange[]) => {
    if (!values.length) return;
    lines.push("", `${title}:`);
    for (const value of values) lines.push(`  - ${value.severity} ${value.ruleId} in ${value.assetType}:${value.assetName} (${value.location})`);
  };
  addFindings("New findings", diff.newFindings);
  addFindings("Resolved findings", diff.resolvedFindings);
  return `${lines.join("\n")}\n`;
}

function snapshotReport(report: ScanReport, requireComplete = true): BaselineSnapshot {
  if (report.schemaVersion !== 2 || !report.coverage) {
    throw new BaselineError("A schema 2 report with coverage is required for baseline comparison.");
  }
  if (requireComplete && report.coverage.status !== "complete") {
    throw new BaselineError("An incomplete scan cannot create or replace a baseline.");
  }
  const findingsByItem = new Map<string, Finding[]>();
  for (const finding of report.findings) {
    if (finding.itemId) findingsByItem.set(finding.itemId, [...(findingsByItem.get(finding.itemId) ?? []), finding]);
  }
  const assets = report.inventory.map((item) => snapshotAsset(item, findingsByItem.get(item.id) ?? []));
  return {
    tool: "agent-audit-baseline",
    schemaVersion: 1,
    createdAt: report.generatedAt,
    reportSchemaVersion: 2,
    scannerVersion: report.version,
    rulesetVersion: RULESET_VERSION,
    scopeHash: hashValue(report.coverage.scope),
    coverageStatus: "complete",
    assets: assets.sort(compareAssets)
  };
}

function snapshotAsset(item: InventoryItem, findings: Finding[]): BaselineAsset {
  const identityHash = hashValue([item.type, item.name]);
  const contentHash = item.contentHash ?? hashValue(item.metadata ?? {});
  const sanitizedFindings = findings.map((finding) => snapshotFinding(finding, item)).sort(compareFindings);
  return {
    identityHash,
    contentHash,
    reviewHash: hashValue([contentHash, sanitizedFindings.map((finding) => finding.signature)]),
    type: item.type,
    name: item.name,
    source: item.source,
    agents: item.agents?.slice().sort(),
    findings: sanitizedFindings
  };
}

function snapshotFinding(finding: Finding, item: InventoryItem): BaselineFinding {
  const base = path.dirname(item.path);
  const relative = path.relative(base, finding.location.path);
  const location = relative && !relative.startsWith("..") && !path.isAbsolute(relative)
    ? relative.split(path.sep).join("/")
    : path.basename(finding.location.path);
  const value = {
    ruleId: finding.ruleId,
    severity: finding.severity,
    evidenceKind: finding.evidence.kind,
    location,
    keyPath: finding.location.keyPath
  };
  return { signature: hashValue(value), ...value };
}

function matchAssets(previous: BaselineAsset[], current: BaselineAsset[]) {
  const prior = previous.map((asset, index) => ({ asset, index, matched: false }));
  const next = current.map((asset, index) => ({ asset, index, matched: false }));
  const matched: Array<[BaselineAsset, BaselineAsset]> = [];
  for (const candidate of next) {
    const exact = prior.find((entry) => !entry.matched && entry.asset.identityHash === candidate.asset.identityHash
      && entry.asset.contentHash === candidate.asset.contentHash);
    if (exact) {
      exact.matched = true;
      candidate.matched = true;
      matched.push([exact.asset, candidate.asset]);
    }
  }
  const identities = new Set(next.filter((entry) => !entry.matched).map((entry) => entry.asset.identityHash));
  for (const identity of identities) {
    const oldGroup = prior.filter((entry) => !entry.matched && entry.asset.identityHash === identity);
    const newGroup = next.filter((entry) => !entry.matched && entry.asset.identityHash === identity);
    if (oldGroup.length === 1 && newGroup.length === 1) {
      oldGroup[0].matched = true;
      newGroup[0].matched = true;
      matched.push([oldGroup[0].asset, newGroup[0].asset]);
    }
  }
  return {
    matched,
    previousOnly: prior.filter((entry) => !entry.matched).map((entry) => entry.asset),
    currentOnly: next.filter((entry) => !entry.matched).map((entry) => entry.asset)
  };
}

function emptyDiff(baseline: BaselineSnapshot, report: ScanReport, status: BaselineDiff["status"], reasons: string[]): BaselineDiff {
  return finishDiff({
    tool: "agent-audit-baseline-diff", schemaVersion: 1, status, reasons,
    baselineCreatedAt: baseline.createdAt, currentGeneratedAt: report.generatedAt,
    addedAssets: [], removedAssets: [], changedAssets: [], newFindings: [], resolvedFindings: [],
    unresolvedBaselineAssets: baseline.assets.length,
    summary: { addedAssets: 0, removedAssets: 0, changedAssets: 0, newFindings: 0, resolvedFindings: 0 }
  });
}

function finishDiff(diff: BaselineDiff): BaselineDiff {
  diff.summary = {
    addedAssets: diff.addedAssets.length,
    removedAssets: diff.removedAssets.length,
    changedAssets: diff.changedAssets.length,
    newFindings: diff.newFindings.length,
    resolvedFindings: diff.resolvedFindings.length
  };
  return diff;
}

function assetChange(asset: BaselineAsset, side: "previous" | "current"): BaselineAssetChange {
  return {
    type: asset.type, name: asset.name, identityHash: asset.identityHash,
    ...(side === "previous" ? { previousReviewHash: asset.reviewHash } : { currentReviewHash: asset.reviewHash })
  };
}

function findingChange(finding: BaselineFinding, asset: BaselineAsset): BaselineFindingChange {
  return { ...finding, assetType: asset.type, assetName: asset.name, assetIdentityHash: asset.identityHash };
}

async function readExistingBaseline(filePath: string): Promise<{ content: string; hash: string }> {
  const target = path.resolve(filePath);
  let stats;
  try {
    stats = await fs.lstat(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new BaselineError("Baseline file does not exist.");
    throw new BaselineError("Baseline file cannot be inspected.");
  }
  if (stats.isSymbolicLink() || !stats.isFile() || stats.nlink !== 1) {
    throw new BaselineError("Baseline must be a regular file with one hard link, not a symbolic link.");
  }
  if (typeof process.getuid === "function" && stats.uid !== process.getuid()) {
    throw new BaselineError("Baseline must be owned by the current user.");
  }
  if (stats.size > MAX_BASELINE_BYTES) throw new BaselineError("Baseline exceeds the 16 MiB safety limit.");
  const content = await fs.readFile(target, "utf8").catch(() => { throw new BaselineError("Baseline file cannot be read."); });
  return { content, hash: hashValue(content) };
}

function isBaseline(value: unknown): value is BaselineSnapshot {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return record.tool === "agent-audit-baseline" && record.schemaVersion === 1
    && record.reportSchemaVersion === 2 && record.coverageStatus === "complete"
    && typeof record.createdAt === "string" && typeof record.scannerVersion === "string"
    && typeof record.rulesetVersion === "string" && typeof record.scopeHash === "string"
    && Array.isArray(record.assets) && record.assets.every(isBaselineAsset);
}

function isBaselineAsset(value: unknown): value is BaselineAsset {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.identityHash === "string" && typeof record.contentHash === "string"
    && typeof record.reviewHash === "string" && isInventoryType(record.type)
    && typeof record.name === "string" && Array.isArray(record.findings) && record.findings.every(isBaselineFinding);
}

function isInventoryType(value: unknown): value is InventoryType {
  return value === "skill" || value === "plugin" || value === "mcpServer" || value === "hook"
    || value === "config" || value === "package";
}

function isBaselineFinding(value: unknown): value is BaselineFinding {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.signature === "string" && typeof record.ruleId === "string"
    && (record.severity === "critical" || record.severity === "high" || record.severity === "medium"
      || record.severity === "low" || record.severity === "info")
    && typeof record.evidenceKind === "string" && typeof record.location === "string"
    && (record.keyPath === undefined || typeof record.keyPath === "string");
}

function hashValue(value: unknown): string {
  return createHash("sha256").update(stableJson(value), "utf8").digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function compareAssets(a: BaselineAsset, b: BaselineAsset): number {
  return a.type.localeCompare(b.type) || a.name.localeCompare(b.name) || a.contentHash.localeCompare(b.contentHash);
}
function compareFindings(a: BaselineFinding, b: BaselineFinding): number { return a.signature.localeCompare(b.signature); }
function sortAssetChanges(values: BaselineAssetChange[]): BaselineAssetChange[] {
  return values.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
}
function sortFindingChanges(values: BaselineFindingChange[]): BaselineFindingChange[] {
  return values.sort((a, b) => a.severity.localeCompare(b.severity) || a.ruleId.localeCompare(b.ruleId) || a.assetName.localeCompare(b.assetName));
}
