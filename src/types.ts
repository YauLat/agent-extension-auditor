export type Severity = "critical" | "high" | "medium" | "low" | "info";

export type InventoryType =
  | "skill"
  | "plugin"
  | "mcpServer"
  | "hook"
  | "config"
  | "package";

export interface RuleDefinition {
  id: string;
  severity: Severity;
  title: string;
  what_it_detects: string;
  why_it_matters: string;
  false_positive_notes: string;
  recommended_action: string;
}

export interface FindingLocation {
  path: string;
  displayPath: string;
  line?: number;
  keyPath?: string;
}

export type EvidenceKind = "documented" | "code" | "configured" | "metadata";
export type EvidenceConfidence = "medium" | "high";

export interface FindingEvidence {
  kind: EvidenceKind;
  confidence: EvidenceConfidence;
  active: "unknown";
}

export interface RemediationDescriptor {
  mode: "review" | "guided";
  title: string;
  summary: string;
  actionId?: "skill.add-source";
  requiresInput?: ["source"];
}

export interface Finding {
  id?: string;
  fingerprint?: string;
  ruleId: string;
  severity: Severity;
  title: string;
  message: string;
  location: FindingLocation;
  itemId?: string;
  recommendation: string;
  evidence: FindingEvidence;
  remediation: RemediationDescriptor;
}

export interface InventoryItem {
  id: string;
  type: InventoryType;
  name: string;
  path: string;
  displayPath: string;
  source?: string;
  /** SHA-256 of the inspected asset content. It never contains source text. */
  contentHash?: string;
  aliases?: string[];
  agents?: string[];
  metadata?: Record<string, string | number | boolean>;
}

export interface ScannedLocation {
  path: string;
  displayPath: string;
  kind: string;
  exists: boolean;
  reason: string;
}

export interface ScanSummary {
  inventory: {
    skills: number;
    plugins: number;
    mcpServers: number;
    hooks: number;
    configs: number;
    packages: number;
  };
  findings: Record<Severity, number>;
}

export interface ScanReport {
  /** Absent in legacy reports. Tool version and report schema evolve independently. */
  schemaVersion?: 2;
  coverage?: ScanCoverage;
  filters?: { minSeverity?: Severity; hiddenFindings: number };
  tool: "agent-audit";
  version: string;
  generatedAt: string;
  privacy: {
    telemetry: false;
    uploaded: false;
  };
  scannedLocations: ScannedLocation[];
  inventory: InventoryItem[];
  findings: Finding[];
  summary: ScanSummary;
  recommendedActions: string[];
}

export interface ScanOptions {
  paths?: string[];
  cwd?: string;
  home?: string;
  generatedAt?: Date;
  maxFileBytes?: number;
  maxDepth?: number;
  includeHome?: boolean;
  includePaths?: string[];
  excludePaths?: string[];
}

export interface TargetLocation {
  path: string;
  kind: string;
  reason: string;
  agent?: string;
}

export type ScanStatus = "complete" | "partial" | "failed";
export type DiagnosticCode = "not_found" | "user_excluded" | "default_excluded" | "size_limit" | "depth_limit"
  | "access_denied" | "read_failed" | "unsupported_type" | "binary_file" | "parse_failed"
  | "invalid_config" | "structure_limit" | "symlink_broken" | "symlink_cycle" | "outside_scope";
export interface ScanDiagnostic {
  code: DiagnosticCode;
  path: string;
  displayPath: string;
  kind: "file" | "directory" | "target";
  affectsCompleteness: boolean;
  message: string;
}
export interface ScanCoverage {
  status: ScanStatus;
  filesRead: number;
  filesSkipped: number;
  directoriesSkipped: number;
  diagnostics: ScanDiagnostic[];
  scope: {
    explicitPaths?: string[];
    includeHome: boolean;
    includePaths: string[];
    excludePaths: string[];
    defaultExcludedDirectories: string[];
    maxFileBytes: number;
    maxDepth: number;
  };
}
