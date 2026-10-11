import type { ScanReport } from "../types.js";

export function coverageLines(report: ScanReport): string[] {
  const coverage = report.coverage;
  if (!coverage) return ["Scan coverage: unknown (legacy report). Finding counts do not establish completeness."];
  const lines = [
    `Scan coverage: ${coverage.status}. ${coverage.status === "complete" ? "Declared scope inspected; this is not a safety guarantee." : "Scan incomplete: some locations were not inspected."}`,
    `Files read: ${coverage.filesRead}; files skipped/uninspected: ${coverage.filesSkipped}; directory subtrees skipped: ${coverage.directoriesSkipped}.`,
    `Scope: home ${coverage.scope.includeHome ? "included" : "excluded"}; byte limit ${coverage.scope.maxFileBytes}; depth limit ${coverage.scope.maxDepth}.`,
    `Include: ${coverage.scope.includePaths.join(", ") || "all declared roots"}; exclude: ${coverage.scope.excludePaths.join(", ") || "none"}.`,
    `Default directory exclusions: ${coverage.scope.defaultExcludedDirectories.join(", ")}.`
  ];
  if (report.filters?.minSeverity) lines.push(`Finding filter: ${report.filters.minSeverity}; hidden findings: ${report.filters.hiddenFindings}.`);
  for (const diagnostic of coverage.diagnostics) {
    lines.push(`${diagnostic.code}: ${diagnostic.displayPath} — ${diagnostic.message}`);
  }
  return lines;
}
