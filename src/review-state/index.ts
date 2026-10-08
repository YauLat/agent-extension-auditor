import { createHash, randomUUID } from "node:crypto";
import { constants, type Stats } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { rules } from "../rules/definitions.js";
import type { Finding, ScanReport } from "../types.js";
import { AuditOperationError } from "../util/errors.js";
import { RULESET_VERSION } from "../version.js";

export const REVIEW_DIRECTORY = ".agent-audit-reviews";
const ZERO = "0".repeat(64);
const HEX = /^[a-f0-9]{64}$/;
const MAX_BYTES = 16 * 1024 * 1024;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const MAX_REVISIONS = 1000;
const STATES = ["needs_review", "accepted_risk", "false_positive"] as const;
export type ReviewState = typeof STATES[number];
export interface Decision {
  fingerprint: string;
  assetIdentityHash: string;
  assetContentHash: string;
  ruleId: string;
  rulesetVersion: string;
  rulesetHash: string;
  scopeHash: string;
  state: ReviewState;
  reviewedAt: string;
}
export interface ReviewSnapshot {
  tool: "agent-audit-review-state";
  schemaVersion: 1;
  parentHash: string;
  decisions: Decision[];
}
export interface LoadedReviews {
  hash: string;
  snapshot: ReviewSnapshot | null;
  revisions: Record<string, ReviewSnapshot>;
}
export interface Disposition {
  state: ReviewState;
  status: "unreviewed" | "current" | "stale" | "unavailable";
  reviewedAt?: string;
}
function fail(reason: "REVIEW_STATE_INVALID" | "REVIEW_STATE_BUSY" | "REVIEW_STALE" | "REVIEW_REQUIRED" | "SCAN_INCOMPLETE"): never {
  throw new AuditOperationError(reason, "Finding review was not applied. Check current content, scope and private review storage.");
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
function hash(value: unknown): string { return createHash("sha256").update(stable(value)).digest("hex"); }
function bytesHash(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function same(a: Stats, b: Stats): boolean {
  return a.dev === b.dev && a.ino === b.ino && a.uid === b.uid && a.mode === b.mode && a.nlink === b.nlink && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
}
function privateFile(s: Stats): boolean {
  return s.isFile() && !s.isSymbolicLink() && s.nlink === 1 && s.size <= MAX_BYTES && (s.mode & 0o077) === 0 && (process.getuid === undefined || s.uid === process.getuid());
}
async function lstatOptional(file: string): Promise<Stats | undefined> {
  try { return await fs.lstat(file); } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined; fail("REVIEW_STATE_INVALID"); }
}
async function directory(root: string, create = false): Promise<{ dir: string; stat?: Stats }> {
  let canonical: string;
  try { canonical = await fs.realpath(path.resolve(root)); } catch { fail("REVIEW_STATE_INVALID"); }
  const rootStat = await fs.lstat(canonical);
  if (!rootStat.isDirectory() || (rootStat.mode & 0o022) !== 0 || (process.getuid && rootStat.uid !== process.getuid())) fail("REVIEW_STATE_INVALID");
  const dir = path.join(canonical, REVIEW_DIRECTORY);
  if (create) { try { await fs.mkdir(dir, { mode: 0o700 }); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "EEXIST") fail("REVIEW_STATE_INVALID"); } }
  const stat = await lstatOptional(dir);
  if (stat && (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0 || (process.getuid && stat.uid !== process.getuid()) || await fs.realpath(dir) !== dir)) fail("REVIEW_STATE_INVALID");
  return { dir, stat };
}
function keys(value: unknown, expected: string[]): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join(",") === [...expected].sort().join(",");
}
function validSnapshot(value: unknown): value is ReviewSnapshot {
  if (!keys(value, ["tool", "schemaVersion", "parentHash", "decisions"]) || value.tool !== "agent-audit-review-state" || value.schemaVersion !== 1 || typeof value.parentHash !== "string" || !HEX.test(value.parentHash) || !Array.isArray(value.decisions) || value.decisions.length > 100000) return false;
  const seen = new Set<string>();
  for (const d of value.decisions) {
    if (!keys(d, ["fingerprint", "assetIdentityHash", "assetContentHash", "ruleId", "rulesetVersion", "rulesetHash", "scopeHash", "state", "reviewedAt"])) return false;
    if (!["fingerprint", "assetIdentityHash", "assetContentHash", "rulesetHash", "scopeHash"].every(k => typeof d[k] === "string" && HEX.test(d[k] as string)) || typeof d.ruleId !== "string" || !/^[A-Z][A-Z0-9_]{0,127}$/.test(d.ruleId) || typeof d.rulesetVersion !== "string" || !/^[0-9][0-9.a-z-]{0,63}$/.test(d.rulesetVersion) || !STATES.includes(d.state as ReviewState) || typeof d.reviewedAt !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(d.reviewedAt) || !Number.isFinite(Date.parse(d.reviewedAt))) return false;
    if (new Date(d.reviewedAt).toISOString() !== d.reviewedAt || seen.has(d.fingerprint as string)) return false;
    seen.add(d.fingerprint as string);
  }
  return true;
}
async function readVersion(file: string): Promise<{ snapshot: ReviewSnapshot; hash: string; size: number }> {
  const before = await fs.lstat(file);
  if (!privateFile(before)) fail("REVIEW_STATE_INVALID");
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    if (!same(before, await handle.stat())) fail("REVIEW_STATE_INVALID");
    const buffer = Buffer.alloc(before.size + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const result = await handle.read(buffer, offset, buffer.length - offset, offset);
      if (!result.bytesRead) break;
      offset += result.bytesRead;
    }
    if (offset !== before.size || !same(before, await handle.stat()) || !same(before, await fs.lstat(file))) fail("REVIEW_STATE_INVALID");
    const text = buffer.subarray(0, offset).toString("utf8");
    const snapshot: unknown = JSON.parse(text);
    if (!validSnapshot(snapshot)) fail("REVIEW_STATE_INVALID");
    return { snapshot, hash: bytesHash(text), size: before.size };
  } finally { await handle.close(); }
}
async function readDirectory(root: string, ownLock = false): Promise<LoadedReviews> {
  const { dir, stat } = await directory(root);
  if (!stat) return { hash: ZERO, snapshot: null, revisions: {} };
  if (!ownLock && await lstatOptional(path.join(dir, "write.lock"))) fail("REVIEW_STATE_BUSY");
  const names = (await fs.readdir(dir)).filter(n => n !== "write.lock").sort();
  if (names.length > MAX_REVISIONS || names.some(n => !/^revision-[a-f0-9]{64}\.json$/.test(n))) fail("REVIEW_STATE_INVALID");
  const revisions: Record<string, ReviewSnapshot> = {};
  let total = 0;
  for (const name of names) {
    const version = await readVersion(path.join(dir, name));
    if (name !== `revision-${version.hash}.json` || revisions[version.hash]) fail("REVIEW_STATE_INVALID");
    revisions[version.hash] = version.snapshot;
    total += version.size;
    if (total > MAX_TOTAL_BYTES) fail("REVIEW_STATE_INVALID");
  }
  const children = new Map<string, string>();
  for (const [id, value] of Object.entries(revisions)) {
    if (children.has(value.parentHash) || (value.parentHash !== ZERO && !revisions[value.parentHash])) fail("REVIEW_STATE_INVALID");
    children.set(value.parentHash, id);
  }
  let current = ZERO, count = 0;
  while (children.has(current)) { current = children.get(current)!; if (++count > names.length) fail("REVIEW_STATE_INVALID"); }
  if (count !== names.length) fail("REVIEW_STATE_INVALID");
  const after = await directory(root);
  if (!after.stat || stat.dev !== after.stat.dev || stat.ino !== after.stat.ino || stat.mode !== after.stat.mode || names.join() !== (await fs.readdir(dir)).filter(n => n !== "write.lock").sort().join()) fail("REVIEW_STATE_INVALID");
  if (!ownLock && await lstatOptional(path.join(dir, "write.lock"))) fail("REVIEW_STATE_BUSY");
  return { hash: current, snapshot: revisions[current] ?? null, revisions };
}
export async function loadReviews(root: string): Promise<LoadedReviews> {
  try { return await readDirectory(root); } catch (e) { if (e instanceof AuditOperationError) throw e; return fail("REVIEW_STATE_INVALID"); }
}
type Binding = Omit<Decision, "state" | "reviewedAt">;
function bindings(report: ScanReport): Map<Finding, Binding> {
  const result = new Map<Finding, Binding>();
  if (!report.coverage) return result;
  const items = new Map<string, typeof report.inventory[number]>(), duplicateItems = new Set<string>();
  for (const item of report.inventory) { if (items.has(item.id)) duplicateItems.add(item.id); items.set(item.id, item); }
  const ids = new Map<string, number>(), fingerprints = new Map<string, number>();
  for (const f of report.findings) {
    if (f.id) ids.set(f.id, (ids.get(f.id) ?? 0) + 1);
    if (f.fingerprint) fingerprints.set(f.fingerprint, (fingerprints.get(f.fingerprint) ?? 0) + 1);
  }
  const rulesetHash = hash({ version: RULESET_VERSION, rules });
  const scopeHash = hash({ scope: report.coverage.scope, locations: report.scannedLocations.map(l => [l.kind, l.path]).sort() });
  const identityHashes = new Map<string, string>();
  for (const finding of report.findings) {
    const item = finding.itemId ? items.get(finding.itemId) : undefined;
    if (!finding.id || !/^finding:[a-f0-9]{24}$/.test(finding.id) || !finding.fingerprint || !/^finding:[a-f0-9]{24}$/.test(finding.fingerprint)
      || !rules.some(r => r.id === finding.ruleId) || !item || duplicateItems.has(item.id) || ids.get(finding.id) !== 1 || fingerprints.get(finding.fingerprint) !== 1 || !HEX.test(item.contentHash ?? "")) continue;
    let identity = identityHashes.get(item.id);
    if (!identity) { identity = hash({ path: item.path, type: item.type, aliases: [...(item.aliases ?? [])].sort(), agents: [...(item.agents ?? [])].sort() }); identityHashes.set(item.id, identity); }
    result.set(finding, {
      fingerprint: hash(finding.fingerprint), assetIdentityHash: identity,
      assetContentHash: item.contentHash!, ruleId: finding.ruleId, rulesetVersion: RULESET_VERSION, rulesetHash, scopeHash
    });
  }
  return result;
}
function binding(report: ScanReport, finding: Finding): Binding | null {
  return bindings(report).get(finding) ?? null;
}
function disposition(report: ScanReport, finding: Finding, current: Binding | undefined, decisions: Map<string, Decision>): Disposition {
  if (report.schemaVersion !== 2 || report.coverage?.status !== "complete" || !current) return { state: "needs_review", status: "unavailable" };
  const previous = decisions.get(current.fingerprint);
  if (!previous) return { state: "needs_review", status: "unreviewed" };
  const { state, reviewedAt, ...old } = previous;
  if (stable(old) !== stable(current)) return { state: "needs_review", status: "stale" };
  return { state, reviewedAt, status: "current" };
}
export function applyReviews(report: ScanReport, loaded: LoadedReviews): ScanReport {
  const current = bindings(report), decisions = new Map(loaded.snapshot?.decisions.map(d => [d.fingerprint, d]) ?? []);
  return { ...report, findings: report.findings.map(f => ({ ...f, disposition: disposition(report, f, current.get(f), decisions) })) };
}
export function previewReview(report: ScanReport, loaded: LoadedReviews, findingId?: string) {
  const selected = findingId ? report.findings.filter(f => f.id === findingId) : [];
  const canSet = report.schemaVersion === 2 && report.coverage?.status === "complete" && (!findingId || selected.length === 1 && binding(report, selected[0]) !== null);
  // Timestamps and applied annotations do not make unchanged files stale. Full source is never returned or persisted.
  const { generatedAt: _time, findings, coverage, ...rest } = report;
  const expectedHash = hash({ report: { ...rest, coverage: coverage && { status: coverage.status, scope: coverage.scope, diagnostics: coverage.diagnostics.filter(d => d.affectsCompleteness) },
    findings: findings.map(({ disposition: _state, ...f }) => f) }, previous: loaded.hash, findingId: findingId ?? null });
  return { tool: "agent-audit" as const, schemaVersion: 2 as const, operation: "review.preview", expectedHash, canSet,
    findingId: findingId ?? null, disposition: selected.length === 1 ? disposition(report, selected[0], binding(report, selected[0]) ?? undefined, new Map(loaded.snapshot?.decisions.map(d => [d.fingerprint, d]) ?? [])) : null,
    revision: loaded.hash, revisions: Object.keys(loaded.revisions).sort() };
}
async function appendVersion(root: string, snapshot: ReviewSnapshot, expectedParent: string): Promise<string> {
  const { dir, stat } = await directory(root);
  if (!stat || (await readDirectory(root, true)).hash !== expectedParent) fail("REVIEW_STALE");
  const text = `${stable(snapshot)}\n`;
  if (Buffer.byteLength(text) > MAX_BYTES || !validSnapshot(snapshot)) fail("REVIEW_STATE_INVALID");
  const oldFiles = (await fs.readdir(dir)).filter(n => n.startsWith("revision-"));
  let totalBytes = Buffer.byteLength(text);
  for (const file of oldFiles) totalBytes += (await fs.lstat(path.join(dir, file))).size;
  if (oldFiles.length >= MAX_REVISIONS || totalBytes > MAX_TOTAL_BYTES) fail("REVIEW_STATE_INVALID");
  const id = bytesHash(text);
  const temporary = path.join(dir, `pending-${randomUUID()}`);
  const handle = await fs.open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { await handle.writeFile(text, "utf8"); await handle.sync(); } finally { await handle.close(); }
  try {
    const after = await directory(root);
    if (!after.stat || stat.dev !== after.stat.dev || stat.ino !== after.stat.ino) fail("REVIEW_STATE_INVALID");
    await fs.link(temporary, path.join(dir, `revision-${id}.json`));
  } finally { await fs.unlink(temporary); }
  const directoryHandle = await fs.open(dir, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { await directoryHandle.sync(); } finally { await directoryHandle.close(); }
  return id;
}
async function withLock<T>(root: string, task: () => Promise<T>): Promise<T> {
  const { dir, stat } = await directory(root, true);
  let lock;
  try { lock = await fs.open(path.join(dir, "write.lock"), constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "EEXIST") fail("REVIEW_STATE_BUSY"); fail("REVIEW_STATE_INVALID"); }
  const identity = await lock.stat();
  try {
    const after = await directory(root);
    if (!stat || !after.stat || stat.dev !== after.stat.dev || stat.ino !== after.stat.ino) fail("REVIEW_STATE_INVALID");
    return await task();
  } catch (e) { if (e instanceof AuditOperationError) throw e; return fail("REVIEW_STATE_INVALID"); }
  finally {
    await lock.close();
    const current = await lstatOptional(path.join(dir, "write.lock"));
    if (current?.dev === identity.dev && current.ino === identity.ino) await fs.unlink(path.join(dir, "write.lock"));
  }
}
function requireWrite(report: ScanReport, expectedHash: string, confirmed: boolean) {
  if (!confirmed || !HEX.test(expectedHash)) fail("REVIEW_REQUIRED");
  if (report.schemaVersion !== 2 || report.coverage?.status !== "complete") fail("SCAN_INCOMPLETE");
}
export async function saveReview(root: string, report: ScanReport, findingId: string, state: string, expectedHash: string, confirmed: boolean, revalidate?: () => Promise<ScanReport>) {
  if (!STATES.includes(state as ReviewState)) fail("REVIEW_STATE_INVALID");
  requireWrite(report, expectedHash, confirmed);
  return withLock(root, async () => {
    const loaded = await readDirectory(root, true);
    if (revalidate) report = await revalidate();
    requireWrite(report, expectedHash, confirmed);
    const preview = previewReview(report, loaded, findingId);
    if (preview.expectedHash !== expectedHash) fail("REVIEW_STALE");
    if (!preview.canSet) fail("REVIEW_STATE_INVALID");
    const current = binding(report, report.findings.find(f => f.id === findingId)!)!;
    const decisions = (loaded.snapshot?.decisions ?? []).filter(d => d.fingerprint !== current.fingerprint);
    decisions.push({ ...current, state: state as ReviewState, reviewedAt: new Date().toISOString() });
    const revision = await appendVersion(root, { tool: "agent-audit-review-state", schemaVersion: 1, parentHash: loaded.hash, decisions: decisions.sort((a,b) => a.fingerprint.localeCompare(b.fingerprint)) }, loaded.hash);
    return { tool: "agent-audit", schemaVersion: 2, operation: "review.set", saved: true, findingId, state, revision, previousRevision: loaded.hash };
  });
}
export async function restoreReviews(root: string, report: ScanReport, revision: string, expectedHash: string, confirmed: boolean, revalidate?: () => Promise<ScanReport>) {
  requireWrite(report, expectedHash, confirmed);
  if (!HEX.test(revision)) fail("REVIEW_STATE_INVALID");
  return withLock(root, async () => {
    const loaded = await readDirectory(root, true);
    if (revalidate) report = await revalidate();
    requireWrite(report, expectedHash, confirmed);
    if (previewReview(report, loaded).expectedHash !== expectedHash) fail("REVIEW_STALE");
    const previous = loaded.revisions[revision];
    if (!previous) fail("REVIEW_STATE_INVALID");
    const next = await appendVersion(root, { ...previous, parentHash: loaded.hash }, loaded.hash);
    return { tool: "agent-audit", schemaVersion: 2, operation: "review.restore", restored: true, revision: next, previousRevision: loaded.hash };
  });
}
