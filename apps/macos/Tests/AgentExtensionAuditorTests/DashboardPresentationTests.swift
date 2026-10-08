import Foundation
import XCTest
@testable import AgentExtensionAuditor

final class DashboardPresentationTests: XCTestCase {
    private func report(_ findings: [Finding] = [], inventory: [InventoryItem] = []) -> ScanReport {
        ScanReport(tool: "agent-audit", version: "fixture", generatedAt: "2026-10-08T00:00:00Z",
                   privacy: PrivacyState(telemetry: false, uploaded: false), scannedLocations: [], inventory: inventory,
                   findings: findings, summary: ScanSummary(inventory: InventoryCounts(skills: 0, plugins: 0, mcpServers: 0, hooks: 0, configs: 0, packages: 0),
                   findings: FindingCounts(critical: findings.count, high: 0, medium: 0, low: 0, info: 0)), recommendedActions: [])
    }
    private func finding(rule: String = "CUSTOM_RULE") -> Finding {
        Finding(ruleId: rule, severity: .critical, title: "Original custom title", message: "Original message",
                location: FindingLocation(path: "/tmp/fixture/SKILL.md", displayPath: "/tmp/fixture/SKILL.md", line: 7, keyPath: nil),
                itemId: nil, recommendation: "Original recommendation", evidence: nil, remediation: nil)
    }

    func testUnknownRuleAndEnglishPreserveOriginalReportText() {
        let custom = finding()
        XCTAssertEqual(custom.displayTitle(language: .zhHant), custom.title)
        XCTAssertNil(custom.reviewGuidance(language: .zhHant))
        let known = finding(rule: "REMOTE_SCRIPT_EXECUTION")
        XCTAssertEqual(known.displayTitle(language: .english), known.title)
        XCTAssertNil(known.reviewGuidance(language: .english))
        XCTAssertEqual(known.displayTitle(language: .zhHant), "遠端腳本執行模式")
        XCTAssertNotNil(known.reviewGuidance(language: .zhHant))
        XCTAssertEqual(known.title, "Original custom title", "Presentation must not mutate source fields")
    }

    @MainActor
    func testDisplayedChineseTitleIsSearchableWithoutChangingOriginalFields() {
        let store = AuditStore()
        let known = finding(rule: "REMOTE_SCRIPT_EXECUTION")
        let item = InventoryItem(id: "fixture", type: .skill, name: "Fixture", path: "/tmp/fixture",
                                 displayPath: "/tmp/fixture", source: nil, metadata: nil)
        store.applyReport(report([known], inventory: [item]))
        store.searchText = "遠端腳本"
        XCTAssertEqual(store.findings().map(\.id), [known.id])
        XCTAssertEqual(store.inventory(for: .skill).map(\.id), [item.id])
        store.searchText = "Original custom title"
        XCTAssertEqual(store.findings().map(\.id), [known.id])
        XCTAssertEqual(store.inventory(for: .skill).map(\.id), [item.id])
        XCTAssertEqual(store.report?.findings.first?.title, known.title)
        store.applyReport(report([finding()], inventory: [item]))
        store.searchText = "遠端腳本"
        XCTAssertTrue(store.findings().isEmpty)
        XCTAssertTrue(store.inventory(for: .skill).isEmpty, "Unknown rules must not acquire unrelated translations")
    }

    @MainActor
    func testUnboundReportHasUnknownScopeAndEmptyPriorityIsNotFive() {
        let store = AuditStore()
        XCTAssertEqual(store.reportScopeFreshness, .unknown)
        store.applyReport(report())
        XCTAssertEqual(store.reportScopeFreshness, .unknown)
        XCTAssertTrue(store.prioritizedFindings().isEmpty)
        store.applyReport(report([finding()]))
        XCTAssertEqual(store.prioritizedFindings().count, 1)
        store.searchText = "no-matching-result"
        XCTAssertTrue(store.findings().isEmpty)
        XCTAssertEqual(store.prioritizedFindings().count, 1, "Overview uses the full report regardless of list filters")
        XCTAssertEqual(store.dispositionCounts.needsReview, 1)
    }

    @MainActor
    func testFolderModeAndEffectiveHomeChangesMarkRetainedReportAsPreviousScope() {
        let store = AuditStore()
        let root = URL(fileURLWithPath: "/tmp/dashboard-original")
        store.workspaceURL = root; store.includeHome = false; store.directPackage = true
        let original = report([finding()])
        store.applyReport(original, request: ScanRequest(rootURL: root, includeHome: false, directPackage: true))
        XCTAssertEqual(store.reportScopeFreshness, .current)
        store.workspaceURL = root.appendingPathComponent("another")
        XCTAssertEqual(store.reportScopeFreshness, .previous)
        XCTAssertEqual(store.report, original)
        store.workspaceURL = root
        XCTAssertEqual(store.reportScopeFreshness, .current)
        store.includeHome = true
        XCTAssertEqual(store.reportScopeFreshness, .current, "Package mode excludes Home regardless of the saved preference")
        store.directPackage = false
        XCTAssertEqual(store.reportScopeFreshness, .previous)
        store.applyReport(original, request: ScanRequest(rootURL: root, includeHome: true))
        XCTAssertEqual(store.reportScopeFreshness, .current)
        store.includeHome = false
        XCTAssertEqual(store.reportScopeFreshness, .previous)
    }
}
