import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const MAX_REPAIR_FILE_BYTES = 512 * 1024;

export type RepairAction = "skill.add-source";

export interface RepairPlanInput {
  action: RepairAction;
  path: string;
  source: string;
}

export interface RepairPlan {
  action: RepairAction;
  path: string;
  expectedHash: string;
  preview: string;
  description: string;
}

export interface ApplyRepairInput extends RepairPlanInput {
  expectedHash: string;
  confirmed: boolean;
  backupRoot?: string;
}

export interface ApplyRepairResult {
  action: RepairAction;
  path: string;
  backupId: string;
  appliedHash: string;
  changed: true;
}

export interface RollbackRepairInput {
  backupId: string;
  confirmed: boolean;
  backupRoot?: string;
}

export interface RollbackRepairResult {
  backupId: string;
  path: string;
  restored: true;
}

interface PreparedRepair {
  plan: RepairPlan;
  originalContent: string;
  updatedContent: string;
  mode: number;
}

interface BackupMetadata {
  schemaVersion: 1;
  backupId: string;
  action: RepairAction;
  targetPath: string;
  originalHash: string;
  appliedHash: string;
  originalMode: number;
  createdAt: string;
  status: "prepared" | "applied" | "rolled-back";
  rolledBackAt?: string;
}

export class RemediationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RemediationError";
  }
}

export async function planRepair(input: RepairPlanInput): Promise<RepairPlan> {
  return (await prepareRepair(input)).plan;
}

export async function applyRepair(input: ApplyRepairInput): Promise<ApplyRepairResult> {
  if (!input.confirmed) {
    throw new RemediationError("Repair requires explicit confirmation.");
  }

  const prepared = await prepareRepair(input);
  if (prepared.plan.expectedHash !== input.expectedHash) {
    throw new RemediationError("Target changed since preview; create a new repair plan before applying.");
  }

  const backupRoot = path.resolve(input.backupRoot ?? defaultBackupRoot());
  await ensurePrivateDirectory(backupRoot);

  const backupId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}`;
  const backupDirectory = path.join(backupRoot, backupId);
  await fs.mkdir(backupDirectory, { mode: 0o700 });
  await fs.chmod(backupDirectory, 0o700);

  const originalHash = hashContent(prepared.originalContent);
  const appliedHash = hashContent(prepared.updatedContent);
  const metadata: BackupMetadata = {
    schemaVersion: 1,
    backupId,
    action: input.action,
    targetPath: prepared.plan.path,
    originalHash,
    appliedHash,
    originalMode: prepared.mode,
    createdAt: new Date().toISOString(),
    status: "prepared"
  };

  await writePrivateFile(path.join(backupDirectory, "original"), prepared.originalContent);
  await writeMetadata(backupDirectory, metadata);
  await atomicReplace(prepared.plan.path, prepared.updatedContent, prepared.mode, input.expectedHash);
  await writeMetadata(backupDirectory, { ...metadata, status: "applied" });

  return {
    action: input.action,
    path: prepared.plan.path,
    backupId,
    appliedHash,
    changed: true
  };
}

export async function rollbackRepair(input: RollbackRepairInput): Promise<RollbackRepairResult> {
  if (!input.confirmed) {
    throw new RemediationError("Rollback requires explicit confirmation.");
  }
  if (!/^[A-Za-z0-9._-]+$/.test(input.backupId)) {
    throw new RemediationError("Invalid backup ID.");
  }

  const backupRoot = path.resolve(input.backupRoot ?? defaultBackupRoot());
  const backupDirectory = path.join(backupRoot, input.backupId);
  const metadata = await readMetadata(backupDirectory);
  if (metadata.backupId !== input.backupId) {
    throw new RemediationError("Backup metadata does not match the requested backup ID.");
  }

  const originalContent = await fs.readFile(path.join(backupDirectory, "original"), "utf8");
  if (hashContent(originalContent) !== metadata.originalHash) {
    throw new RemediationError("Backup integrity check failed.");
  }

  const current = await readRepairTarget(metadata.targetPath);
  const currentHash = hashContent(current.content);
  if (currentHash !== metadata.appliedHash) {
    throw new RemediationError("Target changed after repair; rollback refused to protect newer edits.");
  }

  await atomicReplace(metadata.targetPath, originalContent, metadata.originalMode, currentHash);
  await writeMetadata(backupDirectory, {
    ...metadata,
    status: "rolled-back",
    rolledBackAt: new Date().toISOString()
  });

  return {
    backupId: input.backupId,
    path: metadata.targetPath,
    restored: true
  };
}

async function prepareRepair(input: RepairPlanInput): Promise<PreparedRepair> {
  if (input.action !== "skill.add-source") {
    throw new RemediationError(`Unsupported repair action: ${String(input.action)}`);
  }

  const source = validateSource(input.source);
  const target = await readRepairTarget(input.path);
  const updatedContent = addSourceMetadata(target.content, source);

  return {
    plan: {
      action: input.action,
      path: target.path,
      expectedHash: hashContent(target.content),
      preview: [`--- ${target.path}`, `+++ ${target.path}`, "@@ YAML frontmatter @@", `+source: ${JSON.stringify(source)}`].join(
        "\n"
      ),
      description: "Add the supplied HTTPS source URL to this skill's YAML frontmatter."
    },
    originalContent: target.content,
    updatedContent,
    mode: target.mode
  };
}

function validateSource(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2048) {
    throw new RemediationError("Source must be a valid HTTPS URL no longer than 2048 characters.");
  }

  let source: URL;
  try {
    source = new URL(trimmed);
  } catch {
    throw new RemediationError("Source must be a valid HTTPS URL.");
  }

  if (source.protocol !== "https:" || !source.hostname) {
    throw new RemediationError("Source must use HTTPS.");
  }
  if (source.username || source.password || source.search) {
    throw new RemediationError("Source URL must not contain credentials or query parameters.");
  }
  return source.toString();
}

async function readRepairTarget(value: string): Promise<{ path: string; content: string; mode: number }> {
  const targetPath = path.resolve(value);
  if (path.basename(targetPath) !== "SKILL.md") {
    throw new RemediationError("Guided source repair only supports SKILL.md files.");
  }

  let stats;
  try {
    stats = await fs.lstat(targetPath);
  } catch {
    throw new RemediationError("Repair target does not exist or cannot be read.");
  }
  if (stats.isSymbolicLink()) {
    throw new RemediationError("Repair target must not be a symbolic link.");
  }
  if (!stats.isFile()) {
    throw new RemediationError("Repair target must be a regular file.");
  }
  if (stats.nlink > 1) {
    throw new RemediationError("Repair target must not use hard links.");
  }
  if (typeof process.getuid === "function" && stats.uid !== process.getuid()) {
    throw new RemediationError("Repair target must be owned by the current user.");
  }
  if (stats.size > MAX_REPAIR_FILE_BYTES) {
    throw new RemediationError(`Repair target is larger than ${MAX_REPAIR_FILE_BYTES} bytes.`);
  }

  return {
    path: targetPath,
    content: await fs.readFile(targetPath, "utf8"),
    mode: stats.mode & 0o777
  };
}

function addSourceMetadata(content: string, source: string): string {
  const opening = content.match(/^---(\r?\n)/);
  if (!opening) {
    throw new RemediationError("SKILL.md must have YAML frontmatter before guided repair can run.");
  }

  const lineEnding = opening[1];
  const closingMarker = `${lineEnding}---`;
  const closingIndex = content.indexOf(closingMarker, opening[0].length);
  if (closingIndex < 0) {
    throw new RemediationError("SKILL.md frontmatter is not closed.");
  }

  const frontmatter = content.slice(opening[0].length, closingIndex);
  if (/^(?:origin|source|repository|repo|url|homepage):/im.test(frontmatter)) {
    throw new RemediationError("SKILL.md already contains source metadata.");
  }

  return `${content.slice(0, closingIndex)}${lineEnding}source: ${JSON.stringify(source)}${content.slice(closingIndex)}`;
}

async function atomicReplace(targetPath: string, content: string, mode: number, expectedHash: string): Promise<void> {
  const directory = path.dirname(targetPath);
  const temporaryPath = path.join(directory, `.${path.basename(targetPath)}.agent-audit-${randomUUID()}.tmp`);

  try {
    const handle = await fs.open(temporaryPath, "wx", mode);
    try {
      await handle.writeFile(content, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.chmod(temporaryPath, mode);

    const current = await readRepairTarget(targetPath);
    if (hashContent(current.content) !== expectedHash) {
      throw new RemediationError("Target changed since preview; write was cancelled.");
    }
    await fs.rename(temporaryPath, targetPath);
  } finally {
    await fs.unlink(temporaryPath).catch(() => undefined);
  }
}

function defaultBackupRoot(): string {
  const override = process.env.AGENT_AUDIT_BACKUP_DIR?.trim();
  if (override) {
    return path.resolve(override);
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "Agent Extension Auditor", "Backups");
  }
  return path.join(os.homedir(), ".agent-audit", "backups");
}

async function ensurePrivateDirectory(directory: string): Promise<void> {
  try {
    const stats = await fs.lstat(directory);
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new RemediationError("Backup path must be a private directory, not a file or symbolic link.");
    }
    if ((stats.mode & 0o077) !== 0) {
      throw new RemediationError("Existing backup directory must be private (mode 0700 or stricter).");
    }
  } catch (error) {
    if (error instanceof RemediationError) {
      throw error;
    }
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code !== "ENOENT") {
      throw new RemediationError("Backup directory cannot be inspected.");
    }
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    await fs.chmod(directory, 0o700);
  }
}

async function writePrivateFile(filePath: string, content: string): Promise<void> {
  await fs.writeFile(filePath, content, { encoding: "utf8", flag: "wx", mode: 0o600 });
  await fs.chmod(filePath, 0o600);
}

async function writeMetadata(directory: string, metadata: BackupMetadata): Promise<void> {
  const metadataPath = path.join(directory, "metadata.json");
  await fs.writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await fs.chmod(metadataPath, 0o600);
}

async function readMetadata(directory: string): Promise<BackupMetadata> {
  let value: unknown;
  try {
    value = JSON.parse(await fs.readFile(path.join(directory, "metadata.json"), "utf8"));
  } catch {
    throw new RemediationError("Backup metadata is missing or invalid.");
  }

  if (!isBackupMetadata(value)) {
    throw new RemediationError("Backup metadata has an unsupported shape.");
  }
  return value;
}

function isBackupMetadata(value: unknown): value is BackupMetadata {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.schemaVersion === 1 &&
    typeof record.backupId === "string" &&
    record.action === "skill.add-source" &&
    typeof record.targetPath === "string" &&
    typeof record.originalHash === "string" &&
    typeof record.appliedHash === "string" &&
    typeof record.originalMode === "number" &&
    typeof record.createdAt === "string" &&
    (record.status === "prepared" || record.status === "applied" || record.status === "rolled-back")
  );
}

function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}
