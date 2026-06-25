import { sortFindings } from "../rules/definitions.js";
import type { Finding, InventoryItem, InventoryType, ScanReport, Severity } from "../types.js";

const severities: Severity[] = ["critical", "high", "medium", "low", "info"];
const inventoryTypes: InventoryType[] = ["skill", "plugin", "mcpServer", "hook", "config", "package"];

const severityLabels: Record<Severity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  info: "Info"
};

const inventoryLabels: Record<InventoryType, string> = {
  skill: "Skills",
  plugin: "Plugins",
  mcpServer: "MCP servers",
  hook: "Hooks",
  config: "Configs",
  package: "Packages"
};

export function renderHtml(report: ScanReport): string {
  const sortedFindings = sortFindings(report.findings);
  const inventoryById = new Map(report.inventory.map((item) => [item.id, item]));
  const ruleIds = uniqueSorted(sortedFindings.map((finding) => finding.ruleId));
  const generatedAt = escapeHtml(report.generatedAt);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Agent Extension Audit</title>
  <style>
${renderCss()}
  </style>
</head>
<body>
  <main class="shell">
    <header class="topbar">
      <div>
        <p class="eyebrow">Local report</p>
        <h1>Agent Extension Audit</h1>
      </div>
      <div class="privacy-pill">No telemetry. No upload. Local-only.</div>
    </header>

    <section class="summary-grid" aria-label="Overview risk summary">
      ${renderRiskCards(report)}
    </section>

    <section class="panel split-panel" aria-label="Inventory and next actions">
      <div>
        <div class="section-heading">
          <p class="eyebrow">Inventory</p>
          <h2>Discovered extension surface</h2>
        </div>
        <div class="inventory-grid">
          ${renderInventoryCards(report)}
        </div>
      </div>
      <div>
        <div class="section-heading">
          <p class="eyebrow">Recommended</p>
          <h2>Next actions</h2>
        </div>
        ${renderActions(report)}
      </div>
    </section>

    <section class="panel" aria-label="Findings">
      <div class="section-heading with-meta">
        <div>
          <p class="eyebrow">Findings</p>
          <h2>Review queue</h2>
        </div>
        <p class="meta" data-filter-count>${sortedFindings.length} findings</p>
      </div>
      ${renderFilters(ruleIds)}
      ${renderFindings(sortedFindings, inventoryById)}
    </section>

    <section class="panel" aria-label="Scanned locations">
      <div class="section-heading with-meta">
        <div>
          <p class="eyebrow">Scope</p>
          <h2>Scanned locations</h2>
        </div>
        <p class="meta">${report.scannedLocations.length} locations</p>
      </div>
      <div class="location-list">
        ${renderScannedLocations(report)}
      </div>
    </section>

    <section class="privacy-note" aria-label="Privacy note">
      <strong>Privacy note:</strong> This report was generated locally by agent-audit ${escapeHtml(report.version)} at ${generatedAt}. It does not upload scan results, send telemetry, create accounts, or print secret values. Keep local paths and report files on machines you trust.
    </section>
  </main>
  <script>
${renderScript()}
  </script>
</body>
</html>
`;
}

function renderRiskCards(report: ScanReport): string {
  return severities
    .map((severity) => {
      const count = report.summary.findings[severity];
      return `<article class="risk-card risk-${severity}">
        <span class="risk-label">${severityLabels[severity]}</span>
        <strong>${count}</strong>
      </article>`;
    })
    .join("\n");
}

function renderInventoryCards(report: ScanReport): string {
  return inventoryTypes
    .map((type) => {
      const count = report.summary.inventory[toSummaryInventoryKey(type)];
      return `<div class="inventory-card">
        <span>${inventoryLabels[type]}</span>
        <strong>${count}</strong>
      </div>`;
    })
    .join("\n");
}

function renderActions(report: ScanReport): string {
  if (report.recommendedActions.length === 0) {
    return `<div class="empty-inline">No immediate next actions.</div>`;
  }

  return `<ol class="action-list">
    ${report.recommendedActions.map((action) => `<li>${escapeHtml(action)}</li>`).join("\n")}
  </ol>`;
}

function renderFilters(ruleIds: string[]): string {
  return `<div class="filters" aria-label="Finding filters">
    <label>
      <span>Severity</span>
      <select data-testid="severity-filter" id="severity-filter">
        <option value="">All severities</option>
        ${severities.map((severity) => `<option value="${severity}">${severityLabels[severity]}</option>`).join("\n")}
      </select>
    </label>
    <label>
      <span>Rule</span>
      <select data-testid="rule-filter" id="rule-filter">
        <option value="">All rules</option>
        ${ruleIds.map((ruleId) => `<option value="${escapeAttribute(ruleId)}">${escapeHtml(ruleId)}</option>`).join("\n")}
      </select>
    </label>
    <label>
      <span>Inventory type</span>
      <select data-testid="inventory-filter" id="inventory-filter">
        <option value="">All types</option>
        ${inventoryTypes.map((type) => `<option value="${type}">${inventoryLabels[type]}</option>`).join("\n")}
      </select>
    </label>
    <label>
      <span>Location keyword</span>
      <input data-testid="location-filter" id="location-filter" type="search" placeholder="Path or folder">
    </label>
    <label class="search-control">
      <span>Search</span>
      <input data-testid="search-filter" id="search-filter" type="search" placeholder="Rule, message, path">
    </label>
    <button type="button" data-testid="reset-filters" id="reset-filters">Reset</button>
  </div>`;
}

function renderFindings(findings: Finding[], inventoryById: Map<string, InventoryItem>): string {
  if (findings.length === 0) {
    return `<div class="empty-state">
      <h3>No findings detected</h3>
      <p>The scan did not find review-worthy extension behavior in the selected locations.</p>
    </div>`;
  }

  return `<div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Severity</th>
          <th>Rule</th>
          <th>Title</th>
          <th>Message</th>
          <th>Location</th>
          <th>Recommendation</th>
        </tr>
      </thead>
      <tbody>
        ${findings.map((finding) => renderFindingRow(finding, inventoryById)).join("\n")}
      </tbody>
    </table>
    <div class="empty-state filtered-empty" data-filter-empty hidden>
      <h3>No matching findings</h3>
      <p>Adjust filters or clear search to see more results.</p>
    </div>
  </div>`;
}

function renderFindingRow(finding: Finding, inventoryById: Map<string, InventoryItem>): string {
  const inventoryType = getFindingInventoryType(finding, inventoryById);
  const location = formatLocation(finding);
  const searchableText = [
    finding.ruleId,
    finding.severity,
    finding.title,
    finding.message,
    location,
    finding.recommendation,
    inventoryType
  ].join(" ");

  return `<tr data-finding-row
    data-severity="${finding.severity}"
    data-rule="${escapeAttribute(finding.ruleId)}"
    data-inventory-type="${inventoryType}"
    data-location="${escapeAttribute(location.toLowerCase())}"
    data-search="${escapeAttribute(searchableText.toLowerCase())}">
    <td data-label="Severity"><span class="badge badge-${finding.severity}">${severityLabels[finding.severity]}</span></td>
    <td data-label="Rule"><code>${escapeHtml(finding.ruleId)}</code></td>
    <td data-label="Title">${escapeHtml(finding.title)}</td>
    <td data-label="Message">${escapeHtml(finding.message)}</td>
    <td data-label="Location"><code>${escapeHtml(location)}</code></td>
    <td data-label="Recommendation">${escapeHtml(finding.recommendation)}</td>
  </tr>`;
}

function renderScannedLocations(report: ScanReport): string {
  if (report.scannedLocations.length === 0) {
    return `<div class="empty-inline">No scanned locations were recorded.</div>`;
  }

  return report.scannedLocations
    .map(
      (location) => `<article class="location-row">
        <div>
          <code>${escapeHtml(location.displayPath)}</code>
          <p>${escapeHtml(location.reason)}</p>
        </div>
        <span>${escapeHtml(location.kind)}</span>
        <strong>${location.exists ? "Found" : "Missing"}</strong>
      </article>`
    )
    .join("\n");
}

function getFindingInventoryType(finding: Finding, inventoryById: Map<string, InventoryItem>): InventoryType {
  if (finding.itemId) {
    const item = inventoryById.get(finding.itemId);
    if (item) {
      return item.type;
    }
  }

  const location = finding.location.displayPath.toLowerCase();
  if (location.includes("skill.md")) {
    return "skill";
  }
  if (location.includes("package.json")) {
    return "package";
  }
  if (location.includes("hook")) {
    return "hook";
  }
  if (location.includes("mcp")) {
    return "mcpServer";
  }
  return "config";
}

function formatLocation(finding: Finding): string {
  const line = finding.location.line ? `:${finding.location.line}` : "";
  return `${finding.location.displayPath}${line}`;
}

function toSummaryInventoryKey(type: InventoryType): keyof ScanReport["summary"]["inventory"] {
  if (type === "mcpServer") {
    return "mcpServers";
  }
  return `${type}s` as keyof ScanReport["summary"]["inventory"];
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

function renderCss(): string {
  return `:root {
  color-scheme: light;
  --bg: #f7f3ea;
  --panel: #fffdf8;
  --text: #1f2520;
  --muted: #687067;
  --line: #d8d0c2;
  --line-strong: #b8ad9b;
  --critical: #a62124;
  --high: #d3522a;
  --medium: #b98512;
  --low: #4f8a42;
  --info: #3d6e8a;
  --ink: #27312b;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  line-height: 1.5;
}

.shell {
  width: min(1180px, calc(100% - 32px));
  margin: 0 auto;
  padding: 28px 0 40px;
}

.topbar {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 18px;
}

h1,
h2,
h3,
p {
  margin: 0;
}

h1 {
  font-size: 2rem;
  line-height: 1.1;
}

h2 {
  font-size: 1.05rem;
}

h3 {
  font-size: 1rem;
}

.eyebrow {
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

.privacy-pill {
  border: 1px solid var(--line-strong);
  border-radius: 999px;
  color: var(--ink);
  font-size: 0.86rem;
  font-weight: 700;
  padding: 8px 12px;
  white-space: nowrap;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 12px;
}

.risk-card,
.panel,
.privacy-note {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 8px;
}

.risk-card {
  border-top: 4px solid var(--accent);
  min-height: 92px;
  padding: 14px;
}

.risk-card strong {
  display: block;
  font-size: 2rem;
  line-height: 1;
  margin-top: 12px;
}

.risk-label {
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 800;
  text-transform: uppercase;
}

.risk-critical {
  --accent: var(--critical);
}

.risk-high {
  --accent: var(--high);
}

.risk-medium {
  --accent: var(--medium);
}

.risk-low {
  --accent: var(--low);
}

.risk-info {
  --accent: var(--info);
}

.panel {
  margin-top: 12px;
  padding: 18px;
}

.split-panel {
  display: grid;
  grid-template-columns: 1.15fr 0.85fr;
  gap: 24px;
}

.section-heading {
  margin-bottom: 12px;
}

.with-meta {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
}

.meta {
  color: var(--muted);
  font-size: 0.9rem;
}

.inventory-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.inventory-card {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 12px;
}

.inventory-card span {
  color: var(--muted);
  display: block;
  font-size: 0.82rem;
}

.inventory-card strong {
  display: block;
  font-size: 1.45rem;
  margin-top: 6px;
}

.action-list {
  margin: 0;
  padding-left: 1.25rem;
}

.action-list li + li {
  margin-top: 8px;
}

.filters {
  align-items: end;
  display: grid;
  grid-template-columns: 0.9fr 1.25fr 1fr 1.2fr 1.4fr auto;
  gap: 10px;
  margin-bottom: 12px;
}

label span {
  color: var(--muted);
  display: block;
  font-size: 0.78rem;
  font-weight: 800;
  margin-bottom: 4px;
}

select,
input,
button {
  border: 1px solid var(--line-strong);
  border-radius: 7px;
  color: var(--text);
  font: inherit;
  min-height: 38px;
}

select,
input {
  background: #fffefa;
  width: 100%;
  padding: 7px 9px;
}

button {
  background: var(--ink);
  color: #fffefa;
  cursor: pointer;
  font-weight: 800;
  padding: 7px 12px;
}

.table-wrap {
  overflow-x: auto;
}

table {
  border-collapse: collapse;
  min-width: 980px;
  width: 100%;
}

th,
td {
  border-top: 1px solid var(--line);
  padding: 10px;
  text-align: left;
  vertical-align: top;
}

th {
  color: var(--muted);
  font-size: 0.75rem;
  text-transform: uppercase;
}

td {
  font-size: 0.88rem;
}

code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.84em;
  overflow-wrap: anywhere;
}

.badge {
  border-radius: 999px;
  color: #fff;
  display: inline-block;
  font-size: 0.72rem;
  font-weight: 900;
  min-width: 72px;
  padding: 4px 8px;
  text-align: center;
}

.badge-critical {
  background: var(--critical);
}

.badge-high {
  background: var(--high);
}

.badge-medium {
  background: var(--medium);
}

.badge-low {
  background: var(--low);
}

.badge-info {
  background: var(--info);
}

.empty-state,
.empty-inline {
  border: 1px dashed var(--line-strong);
  border-radius: 8px;
  color: var(--muted);
  padding: 16px;
}

.empty-state h3 {
  color: var(--text);
  margin-bottom: 4px;
}

.filtered-empty {
  margin-top: 12px;
}

.location-list {
  display: grid;
  gap: 8px;
}

.location-row {
  align-items: start;
  border-top: 1px solid var(--line);
  display: grid;
  gap: 12px;
  grid-template-columns: minmax(0, 1fr) 120px 82px;
  padding: 10px 0;
}

.location-row:first-child {
  border-top: 0;
}

.location-row p {
  color: var(--muted);
  font-size: 0.86rem;
  margin-top: 3px;
}

.location-row span,
.location-row strong {
  color: var(--muted);
  font-size: 0.86rem;
}

.privacy-note {
  color: var(--muted);
  margin-top: 12px;
  padding: 14px 18px;
}

.privacy-note strong {
  color: var(--text);
}

tr[hidden],
[hidden] {
  display: none !important;
}

@media (max-width: 900px) {
  .summary-grid,
  .split-panel,
  .inventory-grid,
  .filters {
    grid-template-columns: 1fr 1fr;
  }

  .search-control {
    grid-column: 1 / -1;
  }
}

@media (max-width: 680px) {
  .shell {
    width: min(100% - 20px, 1180px);
    padding-top: 16px;
  }

  .topbar,
  .with-meta {
    align-items: start;
    flex-direction: column;
  }

  .privacy-pill {
    white-space: normal;
  }

  .summary-grid,
  .split-panel,
  .inventory-grid,
  .filters {
    grid-template-columns: 1fr;
  }

  table,
  thead,
  tbody,
  tr,
  th,
  td {
    display: block;
    min-width: 0;
  }

  thead {
    display: none;
  }

  tr {
    border-top: 1px solid var(--line);
    padding: 10px 0;
  }

  td {
    border: 0;
    display: grid;
    gap: 10px;
    grid-template-columns: 120px minmax(0, 1fr);
    padding: 6px 0;
  }

  td::before {
    color: var(--muted);
    content: attr(data-label);
    font-size: 0.72rem;
    font-weight: 900;
    text-transform: uppercase;
  }

  .location-row {
    grid-template-columns: 1fr;
  }
}`;
}

function renderScript(): string {
  return `(function () {
  const rows = Array.from(document.querySelectorAll("[data-finding-row]"));
  const severityFilter = document.getElementById("severity-filter");
  const ruleFilter = document.getElementById("rule-filter");
  const inventoryFilter = document.getElementById("inventory-filter");
  const locationFilter = document.getElementById("location-filter");
  const searchFilter = document.getElementById("search-filter");
  const resetButton = document.getElementById("reset-filters");
  const count = document.querySelector("[data-filter-count]");
  const filteredEmpty = document.querySelector("[data-filter-empty]");

  function valueOf(element) {
    return element && "value" in element ? String(element.value).trim().toLowerCase() : "";
  }

  function applyFilters() {
    const severity = valueOf(severityFilter);
    const rule = valueOf(ruleFilter);
    const inventoryType = valueOf(inventoryFilter);
    const locationKeyword = valueOf(locationFilter);
    const search = valueOf(searchFilter);
    let visible = 0;

    for (const row of rows) {
      const matchesSeverity = !severity || row.dataset.severity === severity;
      const matchesRule = !rule || row.dataset.rule.toLowerCase() === rule;
      const matchesInventory = !inventoryType || row.dataset.inventoryType.toLowerCase() === inventoryType;
      const matchesLocation = !locationKeyword || row.dataset.location.includes(locationKeyword);
      const matchesSearch = !search || row.dataset.search.includes(search);
      const show = matchesSeverity && matchesRule && matchesInventory && matchesLocation && matchesSearch;
      row.hidden = !show;
      if (show) {
        visible += 1;
      }
    }

    if (count) {
      count.textContent = visible + " of " + rows.length + " findings";
    }
    if (filteredEmpty) {
      filteredEmpty.hidden = rows.length === 0 || visible > 0;
    }
  }

  for (const control of [severityFilter, ruleFilter, inventoryFilter, locationFilter, searchFilter]) {
    if (control) {
      control.addEventListener("input", applyFilters);
      control.addEventListener("change", applyFilters);
    }
  }

  if (resetButton) {
    resetButton.addEventListener("click", function () {
      for (const control of [severityFilter, ruleFilter, inventoryFilter, locationFilter, searchFilter]) {
        if (control && "value" in control) {
          control.value = "";
        }
      }
      applyFilters();
    });
  }

  applyFilters();
})();`;
}
