import Foundation
import XCTest
@testable import AgentExtensionAuditor

final class AgentExtensionAuditorTests: XCTestCase {
    func testDecodesScanReportAndCounts() throws {
        let data = Data(sampleReport.utf8)
        let report = try JSONDecoder().decode(ScanReport.self, from: data)

        XCTAssertEqual(report.tool, "agent-audit")
        XCTAssertEqual(report.summary.findings.total, 3)
        XCTAssertEqual(report.summary.inventory.total, 2)
        XCTAssertEqual(report.inventory.first?.type, .skill)
        XCTAssertEqual(report.findings.first?.severity, .critical)
        XCTAssertEqual(report.findings.first?.evidence?.kind, .documented)
        XCTAssertEqual(report.findings.first?.remediation?.mode, .review)
        XCTAssertFalse(report.privacy.telemetry)
        XCTAssertFalse(report.privacy.uploaded)
    }

    func testScanRequestBuildsArgumentsWithoutShellInterpolation() {
        let request = ScanRequest(
            rootURL: URL(fileURLWithPath: "/tmp/project with spaces"),
            includeHome: false
        )
        let arguments = request.arguments(
            scannerURL: URL(fileURLWithPath: "/tmp/app/dist/cli.js"),
            outputURL: URL(fileURLWithPath: "/tmp/report.json")
        )

        XCTAssertEqual(arguments.first, "/tmp/app/dist/cli.js")
        XCTAssertTrue(arguments.contains("/tmp/project with spaces"))
        XCTAssertTrue(arguments.contains("--no-home"))
        XCTAssertFalse(arguments.contains(where: { $0.contains(";") }))
    }

    func testRuntimeLocatorHonorsExplicitLocalPaths() throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("agent-auditor-runtime-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }

        let nodeURL = root.appendingPathComponent("node")
        let scannerURL = root.appendingPathComponent("cli.js")
        try Data("#!/bin/sh\n".utf8).write(to: nodeURL)
        try Data("// scanner\n".utf8).write(to: scannerURL)
        try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: nodeURL.path)

        let locator = RuntimeLocator(
            environment: [
                "AGENT_AUDIT_NODE_PATH": nodeURL.path,
                "AGENT_AUDIT_CLI_PATH": scannerURL.path
            ],
            homeURL: root,
            bundleResourceURL: nil,
            currentDirectoryURL: root,
            executableURL: nil
        )

        XCTAssertEqual(locator.locateNode(), nodeURL)
        XCTAssertEqual(locator.locateScanner(), scannerURL)
    }

    func testBothLanguagesContainCoreNavigationLabels() {
        XCTAssertEqual(text(.skills, language: .zhHant), "技能")
        XCTAssertEqual(text(.skills, language: .english), "Skills")
        XCTAssertFalse(text(.privacyNote, language: .zhHant).isEmpty)
        XCTAssertFalse(text(.privacyNote, language: .english).isEmpty)
    }

    @MainActor
    func testInventorySeverityAndFindingSearchFilters() throws {
        let suiteName = "AgentExtensionAuditorTests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let store = AuditStore(defaults: defaults)
        let report = try JSONDecoder().decode(ScanReport.self, from: Data(sampleReport.utf8))
        store.applyReport(report)

        XCTAssertEqual(store.inventory(for: .skill).map(\.name), ["One"])
        XCTAssertEqual(store.findings(for: report.inventory[0]).count, 2)

        store.selectedSeverity = .critical
        XCTAssertEqual(store.inventory(for: .skill).map(\.name), ["One"])
        XCTAssertTrue(store.inventory(for: .plugin).isEmpty)
        XCTAssertEqual(store.findings().map(\.ruleId), ["REMOTE_SCRIPT_EXECUTION"])

        store.selectedSeverity = nil
        store.searchText = "package script"
        XCTAssertEqual(store.findings().map(\.ruleId), ["PACKAGE_SCRIPT"])
        XCTAssertEqual(store.inventory(for: .plugin).map(\.name), ["Plugin One"])

        store.searchText = "/tmp/project/SKILL.md"
        XCTAssertEqual(store.findings().count, 2)
    }

    func testAppSourcesDoNotContainFixtureSecret() throws {
        let packageRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let sources = packageRoot.appendingPathComponent("Sources")
        let sentinel = "sk-" + "test-should-not-appear"
        let enumerator = FileManager.default.enumerator(
            at: sources,
            includingPropertiesForKeys: nil,
            options: [.skipsHiddenFiles]
        )

        while let url = enumerator?.nextObject() as? URL {
            guard url.pathExtension == "swift" else { continue }
            let contents = try String(contentsOf: url, encoding: .utf8)
            XCTAssertFalse(contents.contains(sentinel), "Secret sentinel found in \(url.lastPathComponent)")
        }
    }

    private var sampleReport: String {
        """
        {
          "tool": "agent-audit",
          "version": "0.2.1",
          "generatedAt": "2026-07-10T10:00:00.000Z",
          "privacy": { "telemetry": false, "uploaded": false },
          "scannedLocations": [
            {
              "path": "/tmp/project",
              "displayPath": "/tmp/project",
              "kind": "workspace",
              "exists": true,
              "reason": "Selected workspace"
            }
          ],
          "inventory": [
            {
              "id": "skill:one",
              "type": "skill",
              "name": "One",
              "path": "/tmp/project/SKILL.md",
              "displayPath": "/tmp/project/SKILL.md",
              "source": "Codex",
              "metadata": { "enabled": true }
            },
            {
              "id": "plugin:one",
              "type": "plugin",
              "name": "Plugin One",
              "path": "/tmp/project/plugin.json",
              "displayPath": "/tmp/project/plugin.json"
            }
          ],
          "findings": [
            {
              "ruleId": "REMOTE_SCRIPT_EXECUTION",
              "severity": "critical",
              "title": "Remote script execution",
              "message": "Remote execution pattern found.",
              "location": {
                "path": "/tmp/project/SKILL.md",
                "displayPath": "/tmp/project/SKILL.md",
                "line": 8
              },
              "itemId": "skill:one",
              "recommendation": "Review before use.",
              "evidence": {
                "kind": "documented",
                "confidence": "medium",
                "active": "unknown"
              },
              "remediation": {
                "mode": "review",
                "title": "Manual review required",
                "summary": "Review before use."
              }
            },
            {
              "ruleId": "SHELL_COMMAND",
              "severity": "high",
              "title": "Shell command",
              "message": "A shell command was found.",
              "location": {
                "path": "/tmp/project/SKILL.md",
                "displayPath": "/tmp/project/SKILL.md"
              },
              "itemId": "skill:one",
              "recommendation": "Inspect the command."
            },
            {
              "ruleId": "PACKAGE_SCRIPT",
              "severity": "medium",
              "title": "Package script",
              "message": "A package script was found.",
              "location": {
                "path": "/tmp/project/plugin.json",
                "displayPath": "/tmp/project/plugin.json",
                "keyPath": "scripts.install"
              },
              "itemId": "plugin:one",
              "recommendation": "Review the package script."
            }
          ],
          "summary": {
            "inventory": {
              "skills": 1,
              "plugins": 1,
              "mcpServers": 0,
              "hooks": 0,
              "configs": 0,
              "packages": 0
            },
            "findings": {
              "critical": 1,
              "high": 1,
              "medium": 1,
              "low": 0,
              "info": 0
            }
          },
          "recommendedActions": ["Review critical findings first."]
        }
        """
    }

}
