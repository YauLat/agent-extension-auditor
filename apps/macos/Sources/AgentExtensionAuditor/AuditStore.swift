import AppKit
import Combine
import Foundation

@MainActor
final class AuditStore: ObservableObject {
    @Published var baselineReview: BaselineReview?
    @Published var baselineMessage = ""
    @Published var baselineBusy = false
    private var baselineRequest: ScanRequest?
    @Published var report: ScanReport?
    @Published var selectedSection: SidebarSection = .overview
    @Published var selectedSeverity: Severity?
    @Published var selectedRuleID: String?
    @Published var searchText = ""
    @Published var selectedInventoryID: String?
    @Published var selectedFindingID: String?
    @Published var activeRepairFinding: Finding?
    @Published var workspaceURL: URL {
        didSet { if workspaceURL != oldValue { invalidateBaselineReview() } }
    }
    @Published var directPackage = false {
        didSet { if directPackage != oldValue { invalidateBaselineReview() } }
    }
    @Published var includeHome: Bool {
        didSet { if includeHome != oldValue { invalidateBaselineReview() } }
    }
    @Published var language: AppLanguage
    @Published var isScanning = false
    @Published var scanStartedAt: Date?
    @Published var scanMessage = ""
    private var scanCancellation: ScanCancellation?
    @Published var lastError: AuditRunnerError?
    @Published private(set) var runtimeStatus: RuntimeStatus
    @Published private(set) var windowWidth: CGFloat = 1_280

    private let runner: AuditRunner
    private var hasStarted = false
    private var findingsByItemID: [String: [Finding]] = [:]

    init(runner: AuditRunner = AuditRunner(), defaults: UserDefaults = .standard) {
        self.runner = runner
        self.workspaceURL = FileManager.default.homeDirectoryForCurrentUser
        self.includeHome = defaults.object(forKey: "includeHome") as? Bool ?? true
        self.language = AppLanguage(rawValue: defaults.string(forKey: "language") ?? "") ?? .zhHant
        self.runtimeStatus = runner.runtimeStatus()
    }

    func scanIfNeeded() async {
        guard !hasStarted else { return }
        hasStarted = true
        await scan()
    }

    func scan() async {
        guard !isScanning && !baselineBusy else { return }
        isScanning = true
        lastError = nil
        scanMessage = ""
        scanStartedAt = Date()
        let cancellation = ScanCancellation()
        scanCancellation = cancellation
        defer { isScanning = false; scanStartedAt = nil; scanCancellation = nil }

        do {
            let result = try await runner.scan(ScanRequest(rootURL: workspaceURL, includeHome: includeHome, directPackage: directPackage), cancellation: cancellation)
            try cancellation.checkCancellation()
            applyReport(result)
            runtimeStatus = runner.runtimeStatus()
        } catch is CancellationError {
            scanMessage = language == .zhHant ? "掃描已取消；保留上一份報告。" : "Scan cancelled; the previous report is unchanged."
        } catch let error as AuditRunnerError {
            lastError = error
            runtimeStatus = runner.runtimeStatus()
        } catch {
            lastError = .launchFailed
        }
    }

    func cancelScan() { scanCancellation?.cancel() }

    func chooseWorkspace() {
        guard !isScanning && !baselineBusy else { return }
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        panel.canCreateDirectories = false
        panel.directoryURL = workspaceURL
        panel.prompt = text(.chooseFolder, language: language)
        guard panel.runModal() == .OK, let url = panel.url else { return }
        workspaceURL = url
    }

    func setLanguage(_ newLanguage: AppLanguage) {
        language = newLanguage
        UserDefaults.standard.set(newLanguage.rawValue, forKey: "language")
    }

    func setIncludeHome(_ newValue: Bool) {
        includeHome = newValue
        UserDefaults.standard.set(newValue, forKey: "includeHome")
    }

    func setWindowWidth(_ newValue: CGFloat) {
        windowWidth = newValue
    }

    func clearFilters() {
        searchText = ""
        selectedSeverity = nil
        selectedRuleID = nil
    }

    func applyReport(_ newReport: ScanReport) {
        invalidateBaselineReview()
        report = newReport
        rebuildFindingCache(from: newReport)
        selectedInventoryID = nil
        selectedFindingID = nil
    }

    func findings(for type: InventoryType? = nil, ignoringSeverity: Bool = false) -> [Finding] {
        guard let report else { return [] }
        let categoryItems = type.map { inventoryType in
            report.inventory.filter { $0.type == inventoryType }
        }
        let categoryIDs = categoryItems.map { Set($0.map(\.id)) }
        let categoryPaths = categoryItems.map { $0.map(\.path) }
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()

        return report.findings.filter { finding in
            if let categoryIDs, let categoryPaths {
                let matchesID = finding.itemId.map(categoryIDs.contains) ?? false
                let matchesPath = categoryPaths.contains { path in
                    finding.location.path == path || finding.location.path.hasPrefix(path + "/")
                }
                if !matchesID && !matchesPath {
                    return false
                }
            }
            if !ignoringSeverity, let selectedSeverity, finding.severity != selectedSeverity {
                return false
            }
            if let selectedRuleID, finding.ruleId != selectedRuleID {
                return false
            }
            if !query.isEmpty {
                let searchable = [
                    finding.ruleId,
                    finding.title,
                    finding.message,
                    finding.location.path,
                    finding.location.displayPath,
                    finding.recommendation
                ].joined(separator: "\n").lowercased()
                if !searchable.contains(query) {
                    return false
                }
            }
            return true
        }.sorted {
            if $0.severity.rank != $1.severity.rank {
                return $0.severity.rank < $1.severity.rank
            }
            return $0.location.displayPath.localizedStandardCompare($1.location.displayPath) == .orderedAscending
        }
    }

    func findings(for item: InventoryItem) -> [Finding] {
        findingsByItemID[item.id] ?? []
    }

    func inventory(for type: InventoryType, ignoringSeverity: Bool = false) -> [InventoryItem] {
        guard let report else { return [] }
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()

        return report.inventory.filter { item in
            guard item.type == type else { return false }
            let itemFindings = findings(for: item)
            if !ignoringSeverity, let selectedSeverity, !itemFindings.contains(where: { $0.severity == selectedSeverity }) {
                return false
            }
            guard !query.isEmpty else { return true }
            let searchable = [item.name, item.path, item.displayPath, item.source ?? ""]
                .joined(separator: "\n")
                .lowercased()
            return searchable.contains(query) || itemFindings.contains { finding in
                [finding.ruleId, finding.title, finding.message]
                    .joined(separator: "\n")
                    .lowercased()
                    .contains(query)
            }
        }.sorted {
            $0.name.localizedStandardCompare($1.name) == .orderedAscending
        }
    }

    func severityScope(for type: InventoryType? = nil) -> [Finding] {
        if let type {
            return inventory(for: type, ignoringSeverity: true).flatMap { findings(for: $0) }
        }
        return findings(ignoringSeverity: true)
    }

    private func invalidateBaselineReview() {
        baselineReview = nil
        baselineRequest = nil
        baselineMessage = ""
    }

    var canAcceptBaseline: Bool {
        baselineReview?.canAccept == true && !baselineBusy && !isScanning
            && baselineRequest == ScanRequest(rootURL: workspaceURL, includeHome: includeHome, directPackage: directPackage)
    }

    func reviewBaseline() async {
        guard !baselineBusy && !isScanning else { return }
        baselineBusy = true
        baselineReview = nil
        baselineMessage = ""
        defer { baselineBusy = false }
        let request = ScanRequest(rootURL: workspaceURL, includeHome: includeHome, directPackage: directPackage)
        do {
            baselineReview = try await runner.reviewBaseline(request)
            baselineRequest = request
        } catch {
            baselineMessage = language == .zhHant ? "無法建立完整比較；請先處理覆蓋率、路徑或基準相容性問題。" : "Cannot prepare a complete review. Check coverage, paths and baseline compatibility."
        }
    }

    func acceptBaseline() async {
        guard canAcceptBaseline, let review = baselineReview, let request = baselineRequest else { return }
        baselineBusy = true
        defer { baselineBusy = false }
        do {
            try await runner.acceptBaseline(request, review: review)
            baselineMessage = language == .zhHant ? "已儲存人工檢視基準；這不代表擴充已獲安全認證。" : "Manual review baseline saved. This is not a safety certification."
            baselineReview = nil
        } catch {
            baselineReview = nil
            baselineMessage = language == .zhHant ? "未接受變更。檔案、基準或覆蓋率可能已改變；請重新比較。" : "Changes were not accepted. Files, baseline or coverage may have changed; compare again."
        }
    }

    func ruleIDs(for type: InventoryType? = nil) -> [String] {
        guard let report else { return [] }
        let source: [Finding]

        if let type {
            let ids = Set(report.inventory.filter { $0.type == type }.map(\.id))
            source = report.findings.filter { finding in
                finding.itemId.map(ids.contains) ?? false
            }
        } else {
            source = report.findings
        }

        return Set(source.filter { finding in
            selectedSeverity.map { finding.severity == $0 } ?? true
        }.map(\.ruleId)).sorted()
    }

    func highestSeverity(for item: InventoryItem) -> Severity? {
        findings(for: item).map(\.severity).min(by: { $0.rank < $1.rank })
    }

    func inventoryCount(for type: InventoryType) -> Int {
        report?.summary.inventory.count(for: type) ?? 0
    }

    func sectionCount(_ section: SidebarSection) -> Int? {
        guard let report else { return nil }
        switch section {
        case .overview, .settings:
            return nil
        case .findings:
            return report.summary.findings.total
        case .inventory(let type):
            return report.summary.inventory.count(for: type)
        case .locations:
            return report.scannedLocations.count
        }
    }

    func copyPath(_ path: String) {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(path, forType: .string)
    }

    func openPath(_ path: String) {
        NSWorkspace.shared.open(URL(fileURLWithPath: path))
    }

    func revealPath(_ path: String) {
        NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: path)])
    }

    func planGuidedRepair(for finding: Finding, source: String) async throws -> RepairPlan {
        guard finding.remediation?.actionId == "skill.add-source" else {
            throw AuditRunnerError.repairFailed(message: "This finding does not support guided repair.")
        }
        return try await runner.planSourceRepair(path: finding.location.path, source: source)
    }

    func applyGuidedRepair(for finding: Finding, source: String, expectedHash: String) async throws -> ApplyRepairResult {
        guard finding.remediation?.actionId == "skill.add-source" else {
            throw AuditRunnerError.repairFailed(message: "This finding does not support guided repair.")
        }
        let result = try await runner.applySourceRepair(
            path: finding.location.path,
            source: source,
            expectedHash: expectedHash
        )
        await scan()
        return result
    }

    func rollbackGuidedRepair(backupId: String) async throws -> RollbackRepairResult {
        let result = try await runner.rollbackRepair(backupId: backupId)
        await scan()
        return result
    }

    func localizedError() -> String {
        switch lastError {
        case .nodeMissing: text(.nodeMissing, language: language)
        case .scannerMissing: text(.scannerMissing, language: language)
        case .invalidReport: text(.invalidReport, language: language)
        case .repairFailed(let message): message
        case .launchFailed, .scanFailed: text(.scanFailed, language: language)
        case nil: ""
        }
    }

    private func rebuildFindingCache(from report: ScanReport) {
        var cache: [String: [Finding]] = [:]
        let itemsByID = Dictionary(uniqueKeysWithValues: report.inventory.map { ($0.id, $0) })

        for finding in report.findings {
            if let itemID = finding.itemId, itemsByID[itemID] != nil {
                cache[itemID, default: []].append(finding)
                continue
            }

            if let item = report.inventory.first(where: {
                finding.location.path == $0.path || finding.location.path.hasPrefix($0.path + "/")
            }) {
                cache[item.id, default: []].append(finding)
            }
        }

        findingsByItemID = cache.mapValues { findings in
            findings.sorted { lhs, rhs in
                if lhs.severity.rank != rhs.severity.rank {
                    return lhs.severity.rank < rhs.severity.rank
                }
                return lhs.location.displayPath.localizedStandardCompare(rhs.location.displayPath) == .orderedAscending
            }
        }
    }
}
