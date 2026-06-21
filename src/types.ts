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

export interface Finding {
  ruleId: string;
  severity: Severity;
  title: string;
  message: string;
  location: FindingLocation;
  itemId?: string;
  recommendation: string;
}

export interface InventoryItem {
  id: string;
  type: InventoryType;
  name: string;
  path: string;
  displayPath: string;
  source?: string;
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
}

export interface ScanOptions {
  cwd?: string;
  home?: string;
  generatedAt?: Date;
  maxFileBytes?: number;
  maxDepth?: number;
}

export interface TargetLocation {
  path: string;
  kind: string;
  reason: string;
}
