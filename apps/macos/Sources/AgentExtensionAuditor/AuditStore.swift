import AppKit
import Combine
import Foundation

@MainActor
final class AuditStore: ObservableObject {
    @Published var findingReviewPreview: FindingDispositionPreview?
    @Published var findingReviewMessage = ""
    @Published var findingReviewBusy = false
    private var findingReviewRequest: ScanRequest?
    private var findingReviewFinding: Finding?
    private(set) var dispositionCounts = (needsReview: 0, reviewed: 0)
    @Published var baselineReview: BaselineReview?
    @Published var baselineMessage = ""
    @Published var baselineBusy = false
    private var baselineRequest: ScanRequest?
    private var baselineCancellation: ScanCancellation?
    private var baselineGeneration = 0
    private var normalReviewIndex: FindingReviewIndex?
    @Published var selectedChangeFilter: ChangeReviewFilter = .all
    @Published private(set) var comparisonGeneratedAt: String?
    @Published private(set) var assetChanges: [String: AssetChangeState] = [:]
    var canFilterChanges: Bool { baselineReview?.diff?.status == "comparable" && comparisonGeneratedAt != nil && !assetChanges.isEmpty }
    func changeState(for finding: Finding) -> AssetChangeState { finding.itemId.flatMap { assetChanges[$0] } ?? .unknown }
    @Published var report: ScanReport?
    @Published private(set) var reportRequest: ScanRequest?
    var reportScopeFreshness: ReportScopeFreshness {
        guard report != nil, let inspected = reportRequest else { return .unknown }
        let current = ScanRequest(rootURL: workspaceURL, includeHome: includeHome, directPackage: directPackage)
        return inspected.rootURL.standardizedFileURL == current.rootURL.standardizedFileURL
            && inspected.directPackage == current.directPackage
            && (inspected.includeHome && !inspected.directPackage) == (current.includeHome && !current.directPackage)
            ? .current : .previous
    }
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
    private let indexBuilder: @MainActor (ScanReport) async -> FindingReviewIndex
    private var hasStarted = false
    private var findingsByItemID: [String: [Finding]] = [:]
    private var reviewQueue: [Finding] = []
    private var reviewSearchEntries: [FindingReviewIndex.SearchEntry] = []
    private var reviewSearchEntryIDs: [Int] = []
    private var reviewCategoryMatches: [InventoryType: Set<Int>] = [:]
    private var inventorySearchIndex: InventorySearchIndex?
    private var matchingInventoryCache: (query: String, positions: Set<Int>)?
    private var matchingReviewCache: (query: String, ruleID: String?, indices: [Int])?

    func prioritizedFindings(limit: Int = 5) -> [Finding] { Array(reviewQueue.prefix(max(0, limit))) }

    init(runner: AuditRunner = AuditRunner(), defaults: UserDefaults = .standard,
         indexBuilder: @escaping @MainActor (ScanReport) async -> FindingReviewIndex = { report in
             await Task.detached(priority: .userInitiated) { FindingReviewIndex(report: report) }.value
         }) {
        self.runner = runner
        self.indexBuilder = indexBuilder
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
        guard !isScanning && !baselineBusy && !findingReviewBusy else { return }
        isScanning = true
        lastError = nil
        scanMessage = ""
        scanStartedAt = Date()
        let cancellation = ScanCancellation()
        scanCancellation = cancellation
        defer { isScanning = false; scanStartedAt = nil; scanCancellation = nil }

        do {
            let request = ScanRequest(rootURL: workspaceURL, includeHome: includeHome, directPackage: directPackage)
            let result = try await runner.scan(request, cancellation: cancellation)
            try cancellation.checkCancellation()
            let index = await indexBuilder(result)
            try cancellation.checkCancellation()
            applyReport(result, index: index, request: request)
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
        guard !isScanning && !baselineBusy && !findingReviewBusy else { return }
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
        selectedChangeFilter = .all
    }

    func applyReport(_ newReport: ScanReport, request: ScanRequest? = nil) {
        applyReport(newReport, index: FindingReviewIndex(report: newReport), request: request)
    }

    private func applyReport(_ newReport: ScanReport, index: FindingReviewIndex, request: ScanRequest? = nil) {
        invalidateBaselineReview()
        normalReviewIndex = index
        applyIndex(index)
        report = newReport
        reportRequest = request
        let reviewed = newReport.findings.filter { $0.disposition?.effectiveState != nil && $0.disposition?.effectiveState != .needsReview }.count
        dispositionCounts = (newReport.findings.count - reviewed, reviewed)
        selectedInventoryID = nil
        selectedFindingID = nil
    }

    private func applyIndex(_ index: FindingReviewIndex) {
        matchingReviewCache = nil
        matchingInventoryCache = nil
        inventorySearchIndex = index.inventorySearch
        reviewQueue = index.queue
        reviewSearchEntries = index.searchEntries
        reviewSearchEntryIDs = index.searchEntryIDs
        findingsByItemID = index.byItemID
        reviewCategoryMatches = index.categoryMatches
    }

    func findings(for type: InventoryType? = nil, ignoringSeverity: Bool = false) -> [Finding] {
        guard report != nil else { return [] }
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let category = type.map { reviewCategoryMatches[$0] ?? [] }
        return matchingReviewIndices(query: query).compactMap { position in
            if let category, !category.contains(position) { return nil }
            let finding = reviewQueue[position]
            if type == nil, selectedChangeFilter == .newAndChanged, !changeState(for: finding).requiresReview { return nil }
            if !ignoringSeverity, let selectedSeverity, finding.severity != selectedSeverity { return nil }
            return finding
        }
    }

    func findings(for item: InventoryItem) -> [Finding] {
        findingsByItemID[item.id] ?? []
    }

    func inventory(for type: InventoryType, ignoringSeverity: Bool = false) -> [InventoryItem] {
        guard let inventorySearchIndex else { return [] }
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let matching: Set<Int>?
        if query.isEmpty {
            matching = nil
        } else if let cached = matchingInventoryCache, cached.query == query {
            matching = cached.positions
        } else {
            let positions = inventorySearchIndex.matchingPositions(query: query)
            matchingInventoryCache = (query, positions)
            matching = positions
        }
        return inventorySearchIndex.inventory(for: type, matching: matching,
                                               severity: ignoringSeverity ? nil : selectedSeverity)
    }

    func severityScope(for type: InventoryType? = nil) -> [Finding] {
        if let type {
            return inventory(for: type, ignoringSeverity: true).flatMap { findings(for: $0) }
        }
        return findings(ignoringSeverity: true)
    }

    func severityCounts(for type: InventoryType? = nil) -> (total: Int, bySeverity: [Severity: Int]) {
        let scope = severityScope(for: type)
        var counts: [Severity: Int] = [:]
        for finding in scope { counts[finding.severity, default: 0] += 1 }
        return (scope.count, counts)
    }

    private func invalidateBaselineReview() {
        baselineGeneration += 1
        baselineCancellation?.cancel()
        selectedChangeFilter = .all
        comparisonGeneratedAt = nil
        assetChanges = [:]
        if let normalReviewIndex { applyIndex(normalReviewIndex) }
        findingReviewPreview = nil
        findingReviewRequest = nil
        findingReviewFinding = nil
        findingReviewMessage = ""
        baselineReview = nil
        baselineRequest = nil
        baselineMessage = ""
    }

    var canAcceptBaseline: Bool {
        baselineReview?.canAccept == true && baselineReview?.hasValidToken == true && !baselineBusy && !isScanning && !findingReviewBusy
            && baselineRequest == ScanRequest(rootURL: workspaceURL, includeHome: includeHome, directPackage: directPackage)
    }

    func reviewBaseline() async {
        guard !baselineBusy && !isScanning && !findingReviewBusy else { return }
        baselineBusy = true
        baselineMessage = ""
        let cancellation = ScanCancellation()
        baselineCancellation = cancellation
        let generation = baselineGeneration
        defer { baselineBusy = false; baselineCancellation = nil }
        let request = ScanRequest(rootURL: workspaceURL, includeHome: includeHome, directPackage: directPackage)
        do {
            let review = try await runner.reviewBaseline(request, cancellation: cancellation)
            guard let freshReport = review.report else { throw AuditRunnerError.invalidReport }
            try cancellation.checkCancellation()
            let index = await indexBuilder(freshReport)
            let changes = review.validatedChanges(for: freshReport)
            let prioritized = await Task.detached(priority: .userInitiated) { index.prioritizing(changes) }.value
            try cancellation.checkCancellation()
            guard generation == baselineGeneration,
                  request == ScanRequest(rootURL: workspaceURL, includeHome: includeHome, directPackage: directPackage) else { return }
            applyReport(freshReport, index: index, request: request)
            baselineReview = review
            baselineRequest = request
            comparisonGeneratedAt = freshReport.generatedAt
            assetChanges = changes
            applyIndex(prioritized)
        } catch is CancellationError {
            baselineMessage = language == .zhHant ? "比較已取消；保留上一份完整結果。" : "Comparison cancelled; the previous complete result is retained."
        } catch {
            baselineRequest = nil
            baselineMessage = language == .zhHant ? "無法建立完整比較；請先處理覆蓋率、路徑或基準相容性問題。" : "Cannot prepare a complete review. Check coverage, paths and baseline compatibility."
        }
    }

    func cancelBaselineReview() { baselineCancellation?.cancel() }

    func acceptBaseline() async {
        guard canAcceptBaseline, let review = baselineReview, let request = baselineRequest else { return }
        baselineBusy = true
        defer { baselineBusy = false }
        do {
            try await runner.acceptBaseline(request, review: review)
            invalidateBaselineReview()
            baselineMessage = language == .zhHant ? "已儲存人工檢視基準；這不代表擴充已獲安全認證。" : "Manual review baseline saved. This is not a safety certification."
        } catch {
            invalidateBaselineReview()
            baselineMessage = language == .zhHant ? "未接受變更。檔案、基準或覆蓋率可能已改變；請重新比較。" : "Changes were not accepted. Files, baseline or coverage may have changed; compare again."
        }
    }

    var canSaveFindingReview: Bool {
        guard let preview = findingReviewPreview, preview.isValid, let finding = findingReviewFinding else { return false }
        return !findingReviewBusy && !isScanning && !baselineBusy && preview.findingId == finding.scannerID
            && selectedFindingID == finding.id && report?.findings.contains(finding) == true
            && findingReviewRequest == ScanRequest(rootURL: workspaceURL, includeHome: includeHome, directPackage: directPackage)
    }

    func prepareFindingReview(_ finding: Finding) async {
        guard !findingReviewBusy && !isScanning && !baselineBusy,
              let scannerID = finding.scannerID,
              let contentHash = report?.inventory.first(where: { $0.id == finding.itemId })?.contentHash else {
            findingReviewMessage = language == .zhHant ? "缺少完整內容證據，請重新掃描。" : "Complete content evidence is missing. Scan again."
            return
        }
        findingReviewBusy = true
        findingReviewPreview = nil
        findingReviewMessage = ""
        defer { findingReviewBusy = false }
        let request = ScanRequest(rootURL: workspaceURL, includeHome: includeHome, directPackage: directPackage)
        do {
            let preview = try await runner.previewFindingDisposition(request, findingID: scannerID, contentHash: contentHash)
            guard request == ScanRequest(rootURL: workspaceURL, includeHome: includeHome, directPackage: directPackage),
                  selectedFindingID == finding.id, report?.findings.contains(finding) == true else { return }
            findingReviewPreview = preview
            findingReviewRequest = request
            findingReviewFinding = finding
        } catch {
            findingReviewMessage = language == .zhHant ? "無法核對目前內容或私人審閱檔；請重新掃描並檢查覆蓋率。" : "Current content or private review storage could not be checked. Scan again and check coverage."
        }
    }

    func saveFindingReview(_ state: FindingDispositionState) async {
        guard canSaveFindingReview, let preview = findingReviewPreview, let request = findingReviewRequest else { return }
        findingReviewBusy = true
        defer { findingReviewBusy = false }
        do {
            try await runner.saveFindingDisposition(request, preview: preview, state: state)
            let refreshed = try await runner.scan(request)
            let index = await indexBuilder(refreshed)
            guard request == ScanRequest(rootURL: workspaceURL, includeHome: includeHome, directPackage: directPackage) else { return }
            applyReport(refreshed, index: index, request: request)
            findingReviewMessage = language == .zhHant ? "已儲存人工決定；severity、風險閘門及覆蓋率保留。" : "Manual decision saved; severity, risk gates and coverage are preserved."
        } catch {
            findingReviewPreview = nil
            findingReviewMessage = language == .zhHant ? "未能確認保存結果；內容或審閱檔可能已改變。請重新掃描後核對。" : "Save outcome could not be confirmed. Content or review storage may have changed; scan again to check."
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

    private func matchingReviewIndices(query: String) -> [Int] {
        guard !query.isEmpty || selectedRuleID != nil else { return Array(reviewQueue.indices) }
        if let cache = matchingReviewCache, cache.query == query, cache.ruleID == selectedRuleID {
            return cache.indices
        }
        let matchingEntries = reviewSearchEntries.map { entry in
            if let selectedRuleID, entry.ruleID != selectedRuleID { return false }
            return query.isEmpty || entry.text.contains(query)
        }
        let matches = reviewQueue.indices.filter { index in
            matchingEntries[reviewSearchEntryIDs[index]]
        }
        matchingReviewCache = (query, selectedRuleID, matches)
        return matches
    }

}
