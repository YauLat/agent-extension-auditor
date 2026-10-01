import Foundation
import XCTest
@testable import AgentExtensionAuditor

final class ScanCancellationTests: XCTestCase {
    @MainActor
    func testScopeChangeClearsPreviousBaselineStatus() {
        let store = AuditStore()
        store.baselineMessage = "Saved for previous folder"
        store.workspaceURL = URL(fileURLWithPath: "/tmp/other-synthetic-folder")
        XCTAssertTrue(store.baselineMessage.isEmpty)
        store.baselineMessage = "Saved for previous mode"
        store.directPackage.toggle()
        XCTAssertTrue(store.baselineMessage.isEmpty)
        store.baselineMessage = "Saved for previous Home scope"
        store.includeHome.toggle()
        XCTAssertTrue(store.baselineMessage.isEmpty)
    }

    func testCancelledBeforeLaunchDoesNotStartProcess() throws {
        let cancellation = ScanCancellation()
        cancellation.cancel()
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/false")
        XCTAssertThrowsError(try cancellation.launch(process)) { XCTAssertTrue($0 is CancellationError) }
        XCTAssertFalse(process.isRunning)
    }

    @MainActor
    func testCancelStopsOwnedScannerAndPreservesReport() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("aea-cancel-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let scanner = root.appendingPathComponent("slow.cjs")
        let marker = root.appendingPathComponent("started")
        try Data("require('fs').writeFileSync('started', 'yes'); setTimeout(() => {}, 30000);".utf8).write(to: scanner)
        var environment = ProcessInfo.processInfo.environment
        environment["AGENT_AUDIT_CLI_PATH"] = scanner.path
        let runner = AuditRunner(locator: RuntimeLocator(environment: environment))
        try Data("---\nname: retained\nsource: https://example.invalid/source\n---\nReference".utf8).write(to: root.appendingPathComponent("SKILL.md"))
        var repository = URL(fileURLWithPath: #filePath)
        for _ in 0..<5 { repository.deleteLastPathComponent() }
        var realEnvironment = environment
        realEnvironment["AGENT_AUDIT_CLI_PATH"] = repository.appendingPathComponent("dist/cli.js").path
        let previous = try await AuditRunner(locator: RuntimeLocator(environment: realEnvironment)).scan(ScanRequest(rootURL: root, includeHome: false, directPackage: true))
        let store = AuditStore(runner: runner)
        store.applyReport(previous)
        store.workspaceURL = root
        let task = Task { await store.scan() }
        for _ in 0..<200 {
            if FileManager.default.fileExists(atPath: marker.path) { break }
            try await Task.sleep(for: .milliseconds(10))
        }
        XCTAssertTrue(FileManager.default.fileExists(atPath: marker.path))
        let start = Date()
        store.cancelScan()
        await task.value
        XCTAssertLessThan(Date().timeIntervalSince(start), 2)
        XCTAssertFalse(store.isScanning)
        XCTAssertEqual(store.report?.generatedAt, previous.generatedAt)
        XCTAssertEqual(store.report?.inventory.map(\.id), previous.inventory.map(\.id))
        XCTAssertNil(store.lastError)
        XCTAssertFalse(store.scanMessage.isEmpty)
    }
}
