import Foundation

enum AppLanguage: String, CaseIterable, Identifiable {
    case zhHant
    case english

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .zhHant: "繁中"
        case .english: "English"
        }
    }
}

enum TextKey {
    case appName
    case overview
    case findings
    case skills
    case plugins
    case mcpServers
    case hooks
    case configs
    case packages
    case locations
    case settings
    case scanNow
    case scanning
    case chooseFolder
    case includeHome
    case privacy
    case privacyNote
    case noTelemetry
    case noUpload
    case localOnly
    case totalFindings
    case inventory
    case recommendedActions
    case severityBreakdown
    case critical
    case high
    case medium
    case low
    case info
    case all
    case noFindings
    case noFindingsDetail
    case noItems
    case noItemsDetail
    case searchPlaceholder
    case rule
    case location
    case recommendation
    case message
    case severity
    case reviewQueue
    case filterRule
    case clearFilters
    case scannedLocations
    case exists
    case missing
    case reason
    case source
    case generatedAt
    case selectedRoot
    case language
    case engine
    case nodeRuntime
    case scannerEngine
    case available
    case unavailable
    case readOnly
    case readOnlyDetail
    case scanFailed
    case nodeMissing
    case scannerMissing
    case invalidReport
    case close
    case copyPath
    case findingsForItem
    case clean
    case reportVersion
    case reload
    case evidence
    case documentedBehavior
    case configuredBehavior
    case metadataEvidence
    case confidence
    case activeUnknown
    case openFile
    case showInFinder
    case remediation
    case manualReview
    case guidedRepair
    case sourceURL
    case previewRepair
    case repairPreview
    case applyRepair
    case rollback
    case repairApplied
    case repairRolledBack
    case repairFailed
    case confirmRepairTitle
    case confirmRepairDetail
    case cancel
    case done
}

func text(_ key: TextKey, language: AppLanguage) -> String {
    let pair: (zh: String, en: String)

    switch key {
    case .appName: pair = ("Agent Extension Auditor", "Agent Extension Auditor")
    case .overview: pair = ("總覽", "Overview")
    case .findings: pair = ("風險發現", "Findings")
    case .skills: pair = ("技能", "Skills")
    case .plugins: pair = ("插件", "Plugins")
    case .mcpServers: pair = ("MCP 伺服器", "MCP Servers")
    case .hooks: pair = ("Hooks", "Hooks")
    case .configs: pair = ("設定檔", "Configs")
    case .packages: pair = ("套件", "Packages")
    case .locations: pair = ("掃描位置", "Locations")
    case .settings: pair = ("設定", "Settings")
    case .scanNow: pair = ("立即掃描", "Scan Now")
    case .scanning: pair = ("掃描中", "Scanning")
    case .chooseFolder: pair = ("選擇資料夾", "Choose Folder")
    case .includeHome: pair = ("包含個人目錄", "Include Home")
    case .privacy: pair = ("私隱", "Privacy")
    case .privacyNote: pair = ("所有掃描均留在本機。", "Every scan stays on this Mac.")
    case .noTelemetry: pair = ("無遙測", "No telemetry")
    case .noUpload: pair = ("不上傳", "No upload")
    case .localOnly: pair = ("只限本機", "Local only")
    case .totalFindings: pair = ("風險總數", "Total Findings")
    case .inventory: pair = ("資產清單", "Inventory")
    case .recommendedActions: pair = ("建議行動", "Recommended Actions")
    case .severityBreakdown: pair = ("嚴重程度", "Severity Breakdown")
    case .critical: pair = ("嚴重", "Critical")
    case .high: pair = ("高", "High")
    case .medium: pair = ("中", "Medium")
    case .low: pair = ("低", "Low")
    case .info: pair = ("資訊", "Info")
    case .all: pair = ("全部", "All")
    case .noFindings: pair = ("沒有風險發現", "No findings")
    case .noFindingsDetail: pair = ("目前篩選條件下沒有需要審閱的項目。", "Nothing needs review under the current filters.")
    case .noItems: pair = ("沒有項目", "No items")
    case .noItemsDetail: pair = ("目前分類或篩選條件沒有項目。", "No items match this category or filter.")
    case .searchPlaceholder: pair = ("搜尋規則、訊息或路徑", "Search rule, message, or path")
    case .rule: pair = ("規則", "Rule")
    case .location: pair = ("位置", "Location")
    case .recommendation: pair = ("建議", "Recommendation")
    case .message: pair = ("訊息", "Message")
    case .severity: pair = ("程度", "Severity")
    case .reviewQueue: pair = ("審閱清單", "Review Queue")
    case .filterRule: pair = ("規則篩選", "Rule Filter")
    case .clearFilters: pair = ("清除篩選", "Clear Filters")
    case .scannedLocations: pair = ("已掃描位置", "Scanned Locations")
    case .exists: pair = ("已找到", "Found")
    case .missing: pair = ("不存在", "Missing")
    case .reason: pair = ("原因", "Reason")
    case .source: pair = ("來源", "Source")
    case .generatedAt: pair = ("產生時間", "Generated")
    case .selectedRoot: pair = ("掃描根目錄", "Scan Root")
    case .language: pair = ("語言", "Language")
    case .engine: pair = ("掃描引擎", "Scan Engine")
    case .nodeRuntime: pair = ("Node 執行環境", "Node Runtime")
    case .scannerEngine: pair = ("Auditor 引擎", "Auditor Engine")
    case .available: pair = ("可用", "Available")
    case .unavailable: pair = ("不可用", "Unavailable")
    case .readOnly: pair = ("唯讀模式", "Read-only Mode")
    case .readOnlyDetail: pair = ("App 只會掃描及顯示結果，不會啟用、停用或修改 extensions。", "The app scans and displays results without enabling, disabling, or modifying extensions.")
    case .scanFailed: pair = ("掃描失敗，掃描器已停止且沒有保存報告。", "The scan failed. The scanner stopped without saving a report.")
    case .nodeMissing: pair = ("找不到本機 Node 執行環境。", "A local Node runtime could not be found.")
    case .scannerMissing: pair = ("App 內找不到 agent-audit 掃描器。", "The bundled agent-audit scanner could not be found.")
    case .invalidReport: pair = ("掃描器回傳的報告格式無法讀取。", "The scanner returned an unreadable report.")
    case .close: pair = ("關閉", "Close")
    case .copyPath: pair = ("複製路徑", "Copy Path")
    case .findingsForItem: pair = ("相關風險", "Related Findings")
    case .clean: pair = ("沒有已知風險", "No known risk")
    case .reportVersion: pair = ("報告版本", "Report Version")
    case .reload: pair = ("重新掃描", "Rescan")
    case .evidence: pair = ("證據狀態", "Evidence State")
    case .documentedBehavior: pair = ("文件描述", "Documented behavior")
    case .configuredBehavior: pair = ("已設定", "Configured behavior")
    case .metadataEvidence: pair = ("Metadata 訊號", "Metadata signal")
    case .confidence: pair = ("可信度", "Confidence")
    case .activeUnknown: pair = ("未證實已啟用", "Not verified active")
    case .openFile: pair = ("開啟檔案", "Open File")
    case .showInFinder: pair = ("在 Finder 顯示", "Show in Finder")
    case .remediation: pair = ("修復", "Remediation")
    case .manualReview: pair = ("只限人工審閱", "Manual review only")
    case .guidedRepair: pair = ("引導式修復", "Guided Repair")
    case .sourceURL: pair = ("來源 HTTPS URL", "Source HTTPS URL")
    case .previewRepair: pair = ("預覽修復", "Preview Repair")
    case .repairPreview: pair = ("修復預覽", "Repair Preview")
    case .applyRepair: pair = ("套用修復", "Apply Repair")
    case .rollback: pair = ("還原", "Rollback")
    case .repairApplied: pair = ("修復已套用並重新掃描。", "Repair applied and rescanned.")
    case .repairRolledBack: pair = ("修復已還原並重新掃描。", "Repair rolled back and rescanned.")
    case .repairFailed: pair = ("修復失敗", "Repair Failed")
    case .confirmRepairTitle: pair = ("確認套用修復？", "Apply this repair?")
    case .confirmRepairDetail: pair = ("App 會先備份原檔、驗證內容 hash，再寫入及重新掃描。", "The app will back up the file, verify its content hash, apply the change, and rescan.")
    case .cancel: pair = ("取消", "Cancel")
    case .done: pair = ("完成", "Done")
    }

    return language == .zhHant ? pair.zh : pair.en
}

extension Severity {
    func label(language: AppLanguage) -> String {
        switch self {
        case .critical: text(.critical, language: language)
        case .high: text(.high, language: language)
        case .medium: text(.medium, language: language)
        case .low: text(.low, language: language)
        case .info: text(.info, language: language)
        }
    }
}

extension InventoryType {
    func label(language: AppLanguage) -> String {
        switch self {
        case .skill: text(.skills, language: language)
        case .plugin: text(.plugins, language: language)
        case .mcpServer: text(.mcpServers, language: language)
        case .hook: text(.hooks, language: language)
        case .config: text(.configs, language: language)
        case .package: text(.packages, language: language)
        }
    }
}

extension SidebarSection {
    func label(language: AppLanguage) -> String {
        switch self {
        case .overview: text(.overview, language: language)
        case .findings: text(.findings, language: language)
        case .inventory(let type): type.label(language: language)
        case .locations: text(.locations, language: language)
        case .settings: text(.settings, language: language)
        }
    }
}
