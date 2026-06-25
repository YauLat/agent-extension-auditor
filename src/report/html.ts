import { sortFindings } from "../rules/definitions.js";
import type { Finding, InventoryItem, InventoryType, ScanReport, Severity } from "../types.js";

type Language = "en" | "zh-Hant";

interface CategorySummary {
  type: InventoryType;
  itemCount: number;
  findings: Finding[];
  severityCounts: Record<Severity, number>;
  sourceBuckets: Array<{
    name: string;
    count: number;
  }>;
}

const severities: Severity[] = ["critical", "high", "medium", "low", "info"];
const inventoryTypes: InventoryType[] = ["skill", "plugin", "mcpServer", "hook", "config", "package"];

const defaultLanguage: Language = "en";

const htmlCopy = {
  en: {
    allRules: "All rules",
    allSeverities: "All severities",
    allTypes: "All types",
    advancedReview: "Advanced review",
    clearFiltersHelp: "Adjust filters or clear search to see more results.",
    clearFiltersTitle: "No matching findings",
    config: "Configs",
    categorizedSurface: "Categorized surface",
    categoryBrowser: "Category browser",
    categoryBrowserLabel: "Categorized inventory and findings",
    categoryFindingCount: "{count} findings",
    categoryItemCount: "{count} items",
    critical: "Critical",
    discoveredSurface: "Discovered extension surface",
    documentTitle: "Agent Extension Audit",
    findings: "Findings",
    findingsCount: "{visible} of {total} findings",
    found: "Found",
    high: "High",
    hook: "Hooks",
    info: "Info",
    inventory: "Inventory",
    inventoryAndActions: "Inventory and next actions",
    inventoryType: "Inventory type",
    language: "Language",
    localReport: "Local report",
    location: "Location",
    locationKeyword: "Location keyword",
    locationPlaceholder: "Path or folder",
    locationsCount: "{count} locations",
    low: "Low",
    mcpServer: "MCP servers",
    medium: "Medium",
    message: "Message",
    missing: "Missing",
    noFindingsHelp: "The scan did not find review-worthy extension behavior in the selected locations.",
    noFindingsTitle: "No findings detected",
    noCategoryFindings: "No findings in this category.",
    noImmediateActions: "No immediate next actions.",
    noLocations: "No scanned locations were recorded.",
    openFullTable: "Open full findings table",
    overviewRiskSummary: "Overview risk summary",
    package: "Packages",
    plugin: "Plugins",
    privacyNoteLabel: "Privacy note:",
    privacyNotePrefix: "This report was generated locally by",
    privacyNoteSuffix:
      "It does not upload scan results, send telemetry, create accounts, or print secret values. Keep local paths and report files on machines you trust.",
    privacyPill: "No telemetry. No upload. Local-only.",
    recommendation: "Recommendation",
    recommended: "Recommended",
    reset: "Reset",
    reviewCategory: "Review this category",
    reviewQueue: "Review queue",
    rule: "Rule",
    scannedLocations: "Scanned locations",
    scope: "Scope",
    search: "Search",
    searchPlaceholder: "Rule, message, path",
    severity: "Severity",
    skill: "Skills",
    sourceBreakdown: "Source breakdown",
    title: "Title",
    topFindings: "Top findings",
    nextActions: "Next actions"
  },
  "zh-Hant": {
    allRules: "所有規則",
    allSeverities: "所有嚴重度",
    allTypes: "所有類型",
    advancedReview: "進階審閱",
    clearFiltersHelp: "調整篩選或清除搜尋即可查看更多結果。",
    clearFiltersTitle: "沒有符合條件的發現",
    config: "設定",
    categorizedSurface: "分類版面",
    categoryBrowser: "分類瀏覽",
    categoryBrowserLabel: "分類清單與發現",
    categoryFindingCount: "{count} 項發現",
    categoryItemCount: "{count} 個項目",
    critical: "嚴重",
    discoveredSurface: "已發現的擴充面",
    documentTitle: "Agent 擴充風險審核",
    findings: "發現",
    findingsCount: "共 {total} 項，顯示 {visible} 項",
    found: "存在",
    high: "高",
    hook: "Hooks",
    info: "資訊",
    inventory: "清單",
    inventoryAndActions: "清單與下一步",
    inventoryType: "清單類型",
    language: "語言",
    localReport: "本機報告",
    location: "位置",
    locationKeyword: "位置關鍵字",
    locationPlaceholder: "路徑或資料夾",
    locationsCount: "{count} 個位置",
    low: "低",
    mcpServer: "MCP 伺服器",
    medium: "中",
    message: "訊息",
    missing: "缺失",
    noFindingsHelp: "這次掃描在選定位置中沒有發現需要審閱的擴充行為。",
    noFindingsTitle: "沒有發現風險項",
    noCategoryFindings: "此分類沒有發現項。",
    noImmediateActions: "目前沒有立即行動項。",
    noLocations: "沒有記錄掃描位置。",
    openFullTable: "打開完整 findings table",
    overviewRiskSummary: "風險總覽",
    package: "Packages",
    plugin: "Plugins",
    privacyNoteLabel: "隱私提示：",
    privacyNotePrefix: "此報告由本機 agent-audit 產生：",
    privacyNoteSuffix: "不會上傳掃描結果、不會傳送 telemetry、不需要帳號，也不會列印 secret value。含本機路徑的報告應只留在可信任機器。",
    privacyPill: "無 telemetry。不上傳。本機限定。",
    recommendation: "建議",
    recommended: "建議",
    reset: "重設",
    reviewCategory: "審閱此分類",
    reviewQueue: "審閱佇列",
    rule: "規則",
    scannedLocations: "掃描位置",
    scope: "範圍",
    search: "搜尋",
    searchPlaceholder: "規則、訊息、路徑",
    severity: "嚴重度",
    skill: "Skills",
    sourceBreakdown: "來源分佈",
    title: "標題",
    topFindings: "重點發現",
    nextActions: "下一步"
  }
} satisfies Record<Language, Record<string, string>>;

export function renderHtml(report: ScanReport): string {
  const sortedFindings = sortFindings(report.findings);
  const inventoryById = new Map(report.inventory.map((item) => [item.id, item]));
  const ruleIds = uniqueSorted(sortedFindings.map((finding) => finding.ruleId));
  const generatedAt = escapeHtml(report.generatedAt);
  const copy = htmlCopy[defaultLanguage];

  return `<!doctype html>
<html lang="en" data-language="${defaultLanguage}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${copy.documentTitle}</title>
  <style>
${renderCss()}
  </style>
</head>
<body>
  <main class="shell">
    <header class="topbar">
      <div>
        <p class="eyebrow" data-i18n="localReport">${copy.localReport}</p>
        <h1 data-i18n="documentTitle">${copy.documentTitle}</h1>
      </div>
      <div class="topbar-actions">
        <div class="language-toggle" role="group" aria-label="${copy.language}" data-i18n-aria-label="language">
          <button type="button" class="lang-button is-active" data-lang-option="en" aria-pressed="true">EN</button>
          <button type="button" class="lang-button" data-lang-option="zh-Hant" aria-pressed="false">繁中</button>
        </div>
        <div class="privacy-pill" data-i18n="privacyPill">${copy.privacyPill}</div>
      </div>
    </header>

    <section class="summary-grid" aria-label="Overview risk summary" data-i18n-aria-label="overviewRiskSummary">
      ${renderRiskCards(report)}
    </section>

    <section class="panel split-panel" aria-label="Inventory and next actions" data-i18n-aria-label="inventoryAndActions">
      <div>
        <div class="section-heading">
          <p class="eyebrow" data-i18n="inventory">${copy.inventory}</p>
          <h2 data-i18n="discoveredSurface">${copy.discoveredSurface}</h2>
        </div>
        <div class="inventory-grid">
          ${renderInventoryCards(report)}
        </div>
      </div>
      <div>
        <div class="section-heading">
          <p class="eyebrow" data-i18n="recommended">${copy.recommended}</p>
          <h2 data-i18n="nextActions">${copy.nextActions}</h2>
        </div>
        ${renderActions(report)}
      </div>
    </section>

    <section class="panel" aria-label="Categorized inventory and findings" data-i18n-aria-label="categoryBrowserLabel">
      <div class="section-heading">
        <p class="eyebrow" data-i18n="categoryBrowser">${copy.categoryBrowser}</p>
        <h2 data-i18n="categorizedSurface">${copy.categorizedSurface}</h2>
      </div>
      ${renderCategoryBrowser(report, sortedFindings, inventoryById)}
    </section>

    <details class="panel advanced-review" aria-label="Findings" data-i18n-aria-label="findings" data-advanced-review>
      <summary>
        <span>
          <span class="eyebrow" data-i18n="advancedReview">${copy.advancedReview}</span>
          <strong data-i18n="openFullTable">${copy.openFullTable}</strong>
        </span>
        <span class="meta" data-filter-count data-total-findings="${sortedFindings.length}">${formatTemplate(copy.findingsCount, {
          visible: sortedFindings.length,
          total: sortedFindings.length
        })}</span>
      </summary>
      <div class="advanced-body">
        <div class="section-heading">
          <p class="eyebrow" data-i18n="findings">${copy.findings}</p>
          <h2 data-i18n="reviewQueue">${copy.reviewQueue}</h2>
        </div>
        ${renderFilters(ruleIds)}
        ${renderFindings(sortedFindings, inventoryById)}
      </div>
    </details>

    <section class="panel" aria-label="Scanned locations" data-i18n-aria-label="scannedLocations">
      <div class="section-heading with-meta">
        <div>
          <p class="eyebrow" data-i18n="scope">${copy.scope}</p>
          <h2 data-i18n="scannedLocations">${copy.scannedLocations}</h2>
        </div>
        <p class="meta" data-location-count data-count="${report.scannedLocations.length}">${formatTemplate(copy.locationsCount, {
          count: report.scannedLocations.length
        })}</p>
      </div>
      <div class="location-list">
        ${renderScannedLocations(report)}
      </div>
    </section>

    <section class="privacy-note" aria-label="Privacy note">
      <strong data-i18n="privacyNoteLabel">${copy.privacyNoteLabel}</strong>
      <span data-i18n="privacyNotePrefix">${copy.privacyNotePrefix}</span> agent-audit ${escapeHtml(report.version)} at ${generatedAt}.
      <span data-i18n="privacyNoteSuffix">${copy.privacyNoteSuffix}</span>
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
  const copy = htmlCopy[defaultLanguage];
  return severities
    .map((severity) => {
      const count = report.summary.findings[severity];
      return `<article class="risk-card risk-${severity}">
        <span class="risk-label" data-i18n-severity="${severity}">${copy[severity]}</span>
        <strong>${count}</strong>
      </article>`;
    })
    .join("\n");
}

function renderInventoryCards(report: ScanReport): string {
  const copy = htmlCopy[defaultLanguage];
  return inventoryTypes
    .map((type) => {
      const count = report.summary.inventory[toSummaryInventoryKey(type)];
      return `<div class="inventory-card">
        <span data-i18n-inventory="${type}">${copy[type]}</span>
        <strong>${count}</strong>
      </div>`;
    })
    .join("\n");
}

function renderActions(report: ScanReport): string {
  const copy = htmlCopy[defaultLanguage];
  if (report.recommendedActions.length === 0) {
    return `<div class="empty-inline" data-i18n="noImmediateActions">${copy.noImmediateActions}</div>`;
  }

  return `<ol class="action-list">
    ${report.recommendedActions.map((action) => `<li>${escapeHtml(action)}</li>`).join("\n")}
  </ol>`;
}

function renderCategoryBrowser(
  report: ScanReport,
  findings: Finding[],
  inventoryById: Map<string, InventoryItem>
): string {
  const categories = buildCategorySummaries(report, findings, inventoryById);

  return `<div class="category-grid">
    ${categories.map((category) => renderCategoryCard(category)).join("\n")}
  </div>`;
}

function renderCategoryCard(category: CategorySummary): string {
  const copy = htmlCopy[defaultLanguage];
  const topFindings = sortFindings(category.findings).slice(0, 5);

  return `<article class="category-card" data-category-section="${category.type}">
    <header>
      <div>
        <span class="category-title" data-i18n-inventory="${category.type}">${copy[category.type]}</span>
        <div class="category-metrics">
          <span data-i18n-template="categoryItemCount" data-count="${category.itemCount}">${formatTemplate(copy.categoryItemCount, {
            count: category.itemCount
          })}</span>
          <span data-i18n-template="categoryFindingCount" data-count="${category.findings.length}">${formatTemplate(copy.categoryFindingCount, {
            count: category.findings.length
          })}</span>
        </div>
      </div>
      <button type="button" class="category-focus" data-category-filter="${category.type}" data-i18n="reviewCategory">${copy.reviewCategory}</button>
    </header>
    <div class="severity-strip" aria-label="${copy.severity}">
      ${severities.map((severity) => renderSeverityChip(severity, category.severityCounts[severity])).join("\n")}
    </div>
    ${renderSourceBreakdown(category)}
    <div class="category-findings">
      <h3 data-i18n="topFindings">${copy.topFindings}</h3>
      ${topFindings.length > 0 ? renderMiniFindings(topFindings) : `<div class="empty-inline" data-i18n="noCategoryFindings">${copy.noCategoryFindings}</div>`}
    </div>
  </article>`;
}

function renderSeverityChip(severity: Severity, count: number): string {
  const copy = htmlCopy[defaultLanguage];
  return `<span class="severity-chip severity-chip-${severity}">
    <span data-i18n-severity="${severity}">${copy[severity]}</span>
    <strong>${count}</strong>
  </span>`;
}

function renderSourceBreakdown(category: CategorySummary): string {
  const copy = htmlCopy[defaultLanguage];
  if (category.sourceBuckets.length === 0) {
    return "";
  }

  return `<div class="source-breakdown">
    <h3 data-i18n="sourceBreakdown">${copy.sourceBreakdown}</h3>
    <div class="source-list">
      ${category.sourceBuckets
        .slice(0, 5)
        .map((bucket) => `<span><strong>${bucket.count}</strong> ${escapeHtml(bucket.name)}</span>`)
        .join("\n")}
    </div>
  </div>`;
}

function renderMiniFindings(findings: Finding[]): string {
  const copy = htmlCopy[defaultLanguage];
  return `<ol class="mini-finding-list">
    ${findings
      .map((finding) => {
        const location = formatLocation(finding);
        return `<li>
          <span class="badge badge-${finding.severity}" data-i18n-severity="${finding.severity}">${copy[finding.severity]}</span>
          <div>
            <strong><code>${escapeHtml(finding.ruleId)}</code> ${escapeHtml(finding.title)}</strong>
            <p>${escapeHtml(finding.message)}</p>
            <code>${escapeHtml(location)}</code>
          </div>
        </li>`;
      })
      .join("\n")}
  </ol>`;
}

function buildCategorySummaries(
  report: ScanReport,
  findings: Finding[],
  inventoryById: Map<string, InventoryItem>
): CategorySummary[] {
  const categories = new Map<InventoryType, CategorySummary>(
    inventoryTypes.map((type) => [
      type,
      {
        type,
        itemCount: report.inventory.filter((item) => item.type === type).length,
        findings: [],
        severityCounts: {
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
          info: 0
        },
        sourceBuckets: summarizeSourceBuckets(report.inventory.filter((item) => item.type === type))
      }
    ])
  );

  for (const finding of findings) {
    const type = getFindingInventoryType(finding, inventoryById);
    const category = categories.get(type);
    if (!category) {
      continue;
    }
    category.findings.push(finding);
    category.severityCounts[finding.severity] += 1;
  }

  return inventoryTypes.map((type) => categories.get(type)).filter((category): category is CategorySummary => Boolean(category));
}

function summarizeSourceBuckets(items: InventoryItem[]): Array<{ name: string; count: number }> {
  const buckets = new Map<string, number>();
  for (const item of items) {
    const bucket = sourceBucketForPath(item.displayPath);
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
  }
  return Array.from(buckets, ([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function sourceBucketForPath(displayPath: string): string {
  const pathValue = displayPath.toLowerCase();
  if (pathValue.includes(".skillclaw")) {
    return "SkillClaw";
  }
  if (pathValue.includes(".codex")) {
    return "Codex";
  }
  if (pathValue.includes(".claude")) {
    return "Claude";
  }
  if (pathValue.includes(".hermes")) {
    return "Hermes";
  }
  if (pathValue.includes("openclaw")) {
    return "OpenClaw";
  }
  if (pathValue.includes(".agents") || pathValue.startsWith("./") || !pathValue.startsWith("~")) {
    return "Workspace";
  }
  return "Other";
}

function renderFilters(ruleIds: string[]): string {
  const copy = htmlCopy[defaultLanguage];
  return `<div class="filters" aria-label="Finding filters">
    <label>
      <span data-i18n="severity">${copy.severity}</span>
      <select data-testid="severity-filter" id="severity-filter">
        <option value="" data-i18n="allSeverities">${copy.allSeverities}</option>
        ${severities.map((severity) => `<option value="${severity}" data-i18n-severity="${severity}">${copy[severity]}</option>`).join("\n")}
      </select>
    </label>
    <label>
      <span data-i18n="rule">${copy.rule}</span>
      <select data-testid="rule-filter" id="rule-filter">
        <option value="" data-i18n="allRules">${copy.allRules}</option>
        ${ruleIds.map((ruleId) => `<option value="${escapeAttribute(ruleId)}">${escapeHtml(ruleId)}</option>`).join("\n")}
      </select>
    </label>
    <label>
      <span data-i18n="inventoryType">${copy.inventoryType}</span>
      <select data-testid="inventory-filter" id="inventory-filter">
        <option value="" data-i18n="allTypes">${copy.allTypes}</option>
        ${inventoryTypes.map((type) => `<option value="${type}" data-i18n-inventory="${type}">${copy[type]}</option>`).join("\n")}
      </select>
    </label>
    <label>
      <span data-i18n="locationKeyword">${copy.locationKeyword}</span>
      <input data-testid="location-filter" id="location-filter" type="search" placeholder="${escapeAttribute(copy.locationPlaceholder)}" data-i18n-placeholder="locationPlaceholder">
    </label>
    <label class="search-control">
      <span data-i18n="search">${copy.search}</span>
      <input data-testid="search-filter" id="search-filter" type="search" placeholder="${escapeAttribute(copy.searchPlaceholder)}" data-i18n-placeholder="searchPlaceholder">
    </label>
    <button type="button" data-testid="reset-filters" id="reset-filters" data-i18n="reset">${copy.reset}</button>
  </div>`;
}

function renderFindings(findings: Finding[], inventoryById: Map<string, InventoryItem>): string {
  const copy = htmlCopy[defaultLanguage];
  if (findings.length === 0) {
    return `<div class="empty-state">
      <h3 data-i18n="noFindingsTitle">${copy.noFindingsTitle}</h3>
      <p data-i18n="noFindingsHelp">${copy.noFindingsHelp}</p>
    </div>`;
  }

  return `<div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th data-i18n="severity">${copy.severity}</th>
          <th data-i18n="rule">${copy.rule}</th>
          <th data-i18n="title">${copy.title}</th>
          <th data-i18n="message">${copy.message}</th>
          <th data-i18n="location">${copy.location}</th>
          <th data-i18n="recommendation">${copy.recommendation}</th>
        </tr>
      </thead>
      <tbody>
        ${findings.map((finding) => renderFindingRow(finding, inventoryById)).join("\n")}
      </tbody>
    </table>
    <div class="empty-state filtered-empty" data-filter-empty hidden>
      <h3 data-i18n="clearFiltersTitle">${copy.clearFiltersTitle}</h3>
      <p data-i18n="clearFiltersHelp">${copy.clearFiltersHelp}</p>
    </div>
  </div>`;
}

function renderFindingRow(finding: Finding, inventoryById: Map<string, InventoryItem>): string {
  const copy = htmlCopy[defaultLanguage];
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
    <td data-label="${copy.severity}" data-label-key="severity"><span class="badge badge-${finding.severity}" data-i18n-severity="${finding.severity}">${copy[finding.severity]}</span></td>
    <td data-label="${copy.rule}" data-label-key="rule"><code>${escapeHtml(finding.ruleId)}</code></td>
    <td data-label="${copy.title}" data-label-key="title">${escapeHtml(finding.title)}</td>
    <td data-label="${copy.message}" data-label-key="message">${escapeHtml(finding.message)}</td>
    <td data-label="${copy.location}" data-label-key="location"><code>${escapeHtml(location)}</code></td>
    <td data-label="${copy.recommendation}" data-label-key="recommendation">${escapeHtml(finding.recommendation)}</td>
  </tr>`;
}

function renderScannedLocations(report: ScanReport): string {
  const copy = htmlCopy[defaultLanguage];
  if (report.scannedLocations.length === 0) {
    return `<div class="empty-inline" data-i18n="noLocations">${copy.noLocations}</div>`;
  }

  return report.scannedLocations
    .map(
      (location) => `<article class="location-row">
        <div>
          <code>${escapeHtml(location.displayPath)}</code>
          <p>${escapeHtml(location.reason)}</p>
        </div>
        <span>${escapeHtml(location.kind)}</span>
        <strong data-i18n="${location.exists ? "found" : "missing"}">${location.exists ? copy.found : copy.missing}</strong>
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

function formatTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => String(values[key] ?? ""));
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

function escapeScriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
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

.topbar-actions {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
}

.language-toggle {
  background: #eee6d8;
  border: 1px solid var(--line-strong);
  border-radius: 8px;
  display: inline-grid;
  grid-template-columns: 1fr 1fr;
  padding: 3px;
}

.lang-button {
  background: transparent;
  border: 0;
  border-radius: 6px;
  color: var(--muted);
  min-height: 30px;
  padding: 4px 9px;
}

.lang-button.is-active {
  background: var(--ink);
  color: #fffefa;
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

.category-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.category-card {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 14px;
}

.category-card header {
  align-items: start;
  display: flex;
  gap: 12px;
  justify-content: space-between;
  margin-bottom: 12px;
}

.category-title {
  display: block;
  font-size: 1.05rem;
  font-weight: 900;
}

.category-metrics {
  color: var(--muted);
  display: flex;
  flex-wrap: wrap;
  font-size: 0.82rem;
  gap: 8px;
  margin-top: 4px;
}

.category-focus {
  background: #fffefa;
  color: var(--ink);
  font-size: 0.82rem;
  min-height: 32px;
  white-space: nowrap;
}

.severity-strip {
  display: grid;
  gap: 6px;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  margin-bottom: 12px;
}

.severity-chip {
  border-left: 3px solid var(--accent);
  background: #fbf7ed;
  border-radius: 6px;
  display: block;
  min-width: 0;
  padding: 7px;
}

.severity-chip span {
  color: var(--muted);
  display: block;
  font-size: 0.66rem;
  font-weight: 900;
  overflow: hidden;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.severity-chip strong {
  display: block;
  font-size: 1rem;
  line-height: 1.1;
  margin-top: 3px;
}

.severity-chip-critical {
  --accent: var(--critical);
}

.severity-chip-high {
  --accent: var(--high);
}

.severity-chip-medium {
  --accent: var(--medium);
}

.severity-chip-low {
  --accent: var(--low);
}

.severity-chip-info {
  --accent: var(--info);
}

.source-breakdown {
  border-top: 1px solid var(--line);
  padding-top: 10px;
}

.source-breakdown h3,
.category-findings h3 {
  color: var(--muted);
  font-size: 0.75rem;
  margin-bottom: 8px;
  text-transform: uppercase;
}

.source-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.source-list span {
  background: #eee6d8;
  border-radius: 999px;
  color: var(--ink);
  font-size: 0.78rem;
  padding: 4px 8px;
}

.category-findings {
  border-top: 1px solid var(--line);
  margin-top: 10px;
  padding-top: 10px;
}

.mini-finding-list {
  display: grid;
  gap: 8px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.mini-finding-list li {
  align-items: start;
  display: grid;
  gap: 8px;
  grid-template-columns: 80px minmax(0, 1fr);
}

.mini-finding-list p {
  color: var(--muted);
  font-size: 0.82rem;
  margin: 2px 0;
}

.advanced-review summary {
  align-items: center;
  cursor: pointer;
  display: flex;
  gap: 16px;
  justify-content: space-between;
  list-style: none;
}

.advanced-review summary::-webkit-details-marker {
  display: none;
}

.advanced-review summary strong {
  display: block;
  font-size: 1.05rem;
}

.advanced-body {
  border-top: 1px solid var(--line);
  margin-top: 14px;
  padding-top: 14px;
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
  .category-grid,
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

  .topbar-actions {
    justify-content: flex-start;
  }

  .privacy-pill {
    white-space: normal;
  }

  .summary-grid,
  .split-panel,
  .inventory-grid,
  .category-grid,
  .filters {
    grid-template-columns: 1fr;
  }

  .category-card header,
  .advanced-review summary {
    align-items: start;
    flex-direction: column;
  }

  .severity-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .mini-finding-list li {
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
  const translations = ${escapeScriptJson(htmlCopy)};
  const defaultLanguage = "${defaultLanguage}";
  const storageKey = "agent-audit-report-language";
  const rows = Array.from(document.querySelectorAll("[data-finding-row]"));
  const languageButtons = Array.from(document.querySelectorAll("[data-lang-option]"));
  const categoryButtons = Array.from(document.querySelectorAll("[data-category-filter]"));
  const advancedReview = document.querySelector("[data-advanced-review]");
  const severityFilter = document.getElementById("severity-filter");
  const ruleFilter = document.getElementById("rule-filter");
  const inventoryFilter = document.getElementById("inventory-filter");
  const locationFilter = document.getElementById("location-filter");
  const searchFilter = document.getElementById("search-filter");
  const resetButton = document.getElementById("reset-filters");
  const count = document.querySelector("[data-filter-count]");
  const filteredEmpty = document.querySelector("[data-filter-empty]");
  const locationCount = document.querySelector("[data-location-count]");
  let currentLanguage = readPreferredLanguage();

  function valueOf(element) {
    return element && "value" in element ? String(element.value).trim().toLowerCase() : "";
  }

  function copy() {
    return translations[currentLanguage] || translations[defaultLanguage];
  }

  function formatTemplate(template, values) {
    return String(template).replace(/\\{(\\w+)\\}/g, function (_match, key) {
      return values[key] == null ? "" : String(values[key]);
    });
  }

  function readPreferredLanguage() {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored && translations[stored]) {
        return stored;
      }
    } catch (_error) {
      // Some file:// contexts can restrict storage. The toggle still works for the open page.
    }
    return defaultLanguage;
  }

  function savePreferredLanguage(language) {
    try {
      window.localStorage.setItem(storageKey, language);
    } catch (_error) {
      // Ignore storage failures; this report is still fully local and usable.
    }
  }

  function translateTextElements(languageCopy) {
    for (const element of document.querySelectorAll("[data-i18n]")) {
      const key = element.getAttribute("data-i18n");
      if (key && languageCopy[key]) {
        element.textContent = languageCopy[key];
      }
    }

    for (const element of document.querySelectorAll("[data-i18n-placeholder]")) {
      const key = element.getAttribute("data-i18n-placeholder");
      if (key && languageCopy[key]) {
        element.setAttribute("placeholder", languageCopy[key]);
      }
    }

    for (const element of document.querySelectorAll("[data-i18n-aria-label]")) {
      const key = element.getAttribute("data-i18n-aria-label");
      if (key && languageCopy[key]) {
        element.setAttribute("aria-label", languageCopy[key]);
      }
    }

    for (const element of document.querySelectorAll("[data-i18n-severity]")) {
      const key = element.getAttribute("data-i18n-severity");
      if (key && languageCopy[key]) {
        element.textContent = languageCopy[key];
      }
    }

    for (const element of document.querySelectorAll("[data-i18n-inventory]")) {
      const key = element.getAttribute("data-i18n-inventory");
      if (key && languageCopy[key]) {
        element.textContent = languageCopy[key];
      }
    }

    for (const element of document.querySelectorAll("[data-label-key]")) {
      const key = element.getAttribute("data-label-key");
      if (key && languageCopy[key]) {
        element.setAttribute("data-label", languageCopy[key]);
      }
    }

    if (locationCount) {
      locationCount.textContent = formatTemplate(languageCopy.locationsCount, {
        count: locationCount.getAttribute("data-count") || "0"
      });
    }
  }

  function applyLanguage(language) {
    currentLanguage = translations[language] ? language : defaultLanguage;
    const languageCopy = copy();
    document.documentElement.lang = currentLanguage;
    document.documentElement.dataset.language = currentLanguage;
    document.title = languageCopy.documentTitle;
    translateTextElements(languageCopy);

    for (const button of languageButtons) {
      const active = button.getAttribute("data-lang-option") === currentLanguage;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    }

    savePreferredLanguage(currentLanguage);
    applyFilters();
  }

  function applyFilters() {
    const languageCopy = copy();
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
      count.textContent = formatTemplate(languageCopy.findingsCount, {
        visible,
        total: rows.length
      });
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

  for (const button of languageButtons) {
    button.addEventListener("click", function () {
      applyLanguage(button.getAttribute("data-lang-option") || defaultLanguage);
    });
  }

  for (const button of categoryButtons) {
    button.addEventListener("click", function () {
      if (inventoryFilter && "value" in inventoryFilter) {
        inventoryFilter.value = button.getAttribute("data-category-filter") || "";
      }
      if (advancedReview && "open" in advancedReview) {
        advancedReview.open = true;
        advancedReview.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      applyFilters();
    });
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

  applyLanguage(currentLanguage);
})();`;
}
