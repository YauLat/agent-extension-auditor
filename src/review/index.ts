import type { Finding, InventoryItem } from "../types.js";

const archivedPath = (value: string): boolean => value.split(/[\\/]/).some(segment => /^(?:\.archive|archive|archives|archived)$/i.test(segment));

export function annotateReview(findings: Finding[], inventory: InventoryItem[]): void {
  const items = new Map(inventory.map(item => [item.id, item]));
  for (const finding of findings) {
    const item = finding.itemId ? items.get(finding.itemId) : undefined;
    // A current alias can still expose a canonical asset stored under archive.
    const archived = archivedPath(finding.location.path) && !(item?.aliases?.some(alias => !archivedPath(alias)));
    const context = archived ? "archived" : item?.metadata?.configuredEnabled === false ? "disabled"
      : finding.review?.context === "example" ? "example" : "current";
    const priority = context === "archived" ? 5 : context === "disabled" ? 4 : context === "example" ? 3
      : finding.evidence.kind === "documented" ? 1 : finding.evidence.kind === "metadata" ? 2 : 0;
    finding.review = { context, priority };
  }
}
