import Foundation
import XCTest
@testable import AgentExtensionAuditor

final class StatusMessageTests: XCTestCase {
    @MainActor
    func testRetainedMessagesTranslateAndClearWithoutChangingGuards() {
        let store = AuditStore()
        for status in AuditStatusMessage.allCases {
            store.scanStatus = status
            store.baselineStatus = status
            store.findingReviewStatus = status
            store.language = .zhHant
            let chinese = store.scanMessage
            store.language = .english
            XCTAssertFalse(store.scanMessage.isEmpty)
            XCTAssertNotEqual(store.scanMessage, chinese)
            XCTAssertEqual(store.baselineMessage, store.scanMessage)
            XCTAssertEqual(store.findingReviewMessage, store.scanMessage)
            store.language = .zhHant
            XCTAssertEqual(store.scanMessage, chinese)
            XCTAssertNil(store.report)
            XCTAssertFalse(store.canAcceptBaseline)
            XCTAssertFalse(store.canSaveFindingReview)
        }
        store.scanStatus = nil
        store.baselineStatus = nil
        store.findingReviewStatus = nil
        store.language = .english
        XCTAssertTrue(store.scanMessage.isEmpty)
        XCTAssertTrue(store.baselineMessage.isEmpty)
        XCTAssertTrue(store.findingReviewMessage.isEmpty)
    }

    @MainActor
    func testMissingEvidenceWarningFollowsCurrentLanguageWithoutRetry() async {
        let store = AuditStore()
        store.language = .zhHant
        let finding = Finding(ruleId: "UNKNOWN_SOURCE", severity: .low, title: "Missing source",
                              message: "Synthetic", location: FindingLocation(path: "/tmp/synthetic/SKILL.md", displayPath: "/tmp/synthetic/SKILL.md", line: nil, keyPath: nil),
                              itemId: nil, recommendation: "Review source", evidence: nil, remediation: nil)
        await store.prepareFindingReview(finding)
        XCTAssertEqual(store.findingReviewMessage, "缺少完整內容證據，請重新掃描。")
        store.language = .english
        XCTAssertEqual(store.findingReviewMessage, "Complete content evidence is missing. Scan again.")
        store.language = .zhHant
        XCTAssertEqual(store.findingReviewMessage, "缺少完整內容證據，請重新掃描。")
        XCTAssertFalse(store.canSaveFindingReview)
    }

    @MainActor
    func testSavedBaselineMessageFollowsCurrentLanguageWithoutAnotherWrite() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("aea-language-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        try Data("---\nname: synthetic-notes\nsource: https://example.invalid/notes\n---\nRead supplied notes.\n".utf8)
            .write(to: root.appendingPathComponent("SKILL.md"))
        var repository = URL(fileURLWithPath: #filePath)
        for _ in 0..<5 { repository.deleteLastPathComponent() }
        var environment = ProcessInfo.processInfo.environment
        environment["AGENT_AUDIT_CLI_PATH"] = repository.appendingPathComponent("dist/cli.js").path
        let store = AuditStore(runner: AuditRunner(locator: RuntimeLocator(environment: environment)))
        store.workspaceURL = root
        store.includeHome = false
        store.directPackage = true
        store.language = .zhHant
        await store.reviewBaseline()
        XCTAssertTrue(store.canAcceptBaseline)
        await store.acceptBaseline()
        XCTAssertEqual(store.baselineMessage, "已儲存人工檢視基準；這不代表擴充已獲安全認證。")
        let baseline = root.appendingPathComponent(".agent-audit-baseline.json")
        let saved = try Data(contentsOf: baseline)
        store.language = .english
        XCTAssertEqual(store.baselineMessage, "Manual review baseline saved. This is not a safety certification.")
        store.language = .zhHant
        XCTAssertEqual(store.baselineMessage, "已儲存人工檢視基準；這不代表擴充已獲安全認證。")
        XCTAssertEqual(try Data(contentsOf: baseline), saved)
    }
}
