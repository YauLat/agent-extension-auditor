import Foundation
import Darwin
import XCTest
@testable import AgentExtensionAuditor

final class AgentExtensionAuditorTests: XCTestCase {
    func testManualDispositionDecodeRejectsUnknownTrustAndKeepsRisk() throws {
        var object = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(sampleReport.utf8)) as? [String: Any])
        var findings = try XCTUnwrap(object["findings"] as? [[String: Any]])
        findings[0]["id"] = "finding:012345678901234567890123"
        findings[0]["fingerprint"] = "finding:abcdefabcdefabcdefabcdef"
        findings[0]["disposition"] = ["state": "accepted_risk", "status": "current", "reviewedAt": "2026-10-04T00:00:00.000Z"]
        object["findings"] = findings
        let report = try JSONDecoder().decode(ScanReport.self, from: JSONSerialization.data(withJSONObject: object))
        XCTAssertEqual(report.findings[0].scannerID, "finding:012345678901234567890123")
        XCTAssertEqual(report.findings[0].disposition?.state, .acceptedRisk)
        XCTAssertEqual(report.findings[0].severity, .critical)
        XCTAssertEqual(report.summary.findings.total, 3)
        findings[0]["disposition"] = ["state": "safe", "status": "current"]
        object["findings"] = findings
        XCTAssertThrowsError(try JSONDecoder().decode(ScanReport.self, from: JSONSerialization.data(withJSONObject: object)))
    }

    func testReviewPreviewRequiresValidTokenAndCurrentFinding() throws {
        let good = Data("{\"expectedHash\":\"\(String(repeating: "a", count: 64))\",\"canSet\":true,\"findingId\":\"finding:012345678901234567890123\",\"disposition\":{\"state\":\"needs_review\",\"status\":\"unreviewed\"}}".utf8)
        let preview = try JSONDecoder().decode(FindingDispositionPreview.self, from: good)
        XCTAssertTrue(preview.isValid)
        let malformed = Data(String(decoding: good, as: UTF8.self).replacingOccurrences(of: String(repeating: "a", count: 64), with: "not-a-token").utf8)
        XCTAssertFalse(try JSONDecoder().decode(FindingDispositionPreview.self, from: malformed).isValid)
    }

    @MainActor
    func testReviewMessagesInvalidateWithScopeAndUnreviewedCountsStaySeparate() throws {
        let store = AuditStore()
        let report = try JSONDecoder().decode(ScanReport.self, from: Data(sampleReport.utf8))
        store.applyReport(report)
        XCTAssertEqual(store.dispositionCounts.needsReview, 3)
        XCTAssertEqual(store.dispositionCounts.reviewed, 0)
        store.findingReviewMessage = "old decision"
        store.directPackage.toggle()
        XCTAssertTrue(store.findingReviewMessage.isEmpty)
        XCTAssertFalse(store.canSaveFindingReview)
    }

    @MainActor
    func testIndexedReviewPreservesLocalizedOrderingAndUnicodeSearch() throws {
        var object = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(sampleReport.utf8)) as? [String: Any])
        let original = try XCTUnwrap((object["findings"] as? [[String: Any]])?.first)
        let paths = ["/tmp/SKILL2.md", "/tmp/skill02.md", "/tmp/SKILL10.md", "/tmp/é.md", "/tmp/e\u{301}.md", "/tmp/中文.md"]
        object["findings"] = (0..<72).reversed().map { index -> [String: Any] in
            var finding = original
            finding["id"] = "unicode-review-\(index)"
            finding["location"] = ["path": paths[index % paths.count], "displayPath": paths[index % paths.count], "line": index]
            finding["ruleId"] = index % 2 == 0 ? "RULE_Σ" : "RULE_ß"
            finding["title"] = "İstanbul CAFE\u{301} 中文 🛡️"
            finding["message"] = "First line\nSecond line \(index % 3)"
            finding["recommendation"] = "Review Straße Σ now"
            finding["severity"] = Severity.allCases[index % Severity.allCases.count].rawValue
            if index % 4 != 0 { finding["review"] = ["context": "current", "priority": index % 9 - 2] }
            return finding
        }
        let report = try JSONDecoder().decode(ScanReport.self, from: JSONSerialization.data(withJSONObject: object))
        let store = AuditStore()
        store.applyReport(report)
        let expectedOrder = report.findings.sorted(by: Finding.reviewPrecedes)
        XCTAssertEqual(store.findings().map(\.id), expectedOrder.map(\.id))
        XCTAssertEqual(store.findings(for: report.inventory[0]).map(\.id), expectedOrder.map(\.id))
        for query in ["not-present-🧪", "  RULE_Σ  ", "İstanbul", "café", "中文", "🛡️", "Straße", "FIRST LINE\nSECOND", "skill02", "Σ now", "/tmp/e", "é.md", "e\u{301}.md"] {
            store.searchText = query
            let normalizedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            let expected = expectedOrder.filter {
                [$0.ruleId, $0.title, $0.message, $0.location.path, $0.location.displayPath, $0.recommendation]
                    .joined(separator: "\n").lowercased().contains(normalizedQuery)
            }
            for rule in [nil, "RULE_Σ", "RULE_ß", "NONMATCHING_RULE"] as [String?] {
                store.selectedRuleID = rule
                for severity in [nil, .critical, .medium] as [Severity?] {
                    store.selectedSeverity = severity
                    let filtered = expected.filter {
                        (rule == nil || $0.ruleId == rule) && (severity == nil || $0.severity == severity)
                    }
                    XCTAssertEqual(store.findings().map(\.id), filtered.map(\.id), query)
                    XCTAssertEqual(store.findings().map(\.id), filtered.map(\.id), "Repeated query: \(query)")
                }
            }
        }
    }

    @MainActor
    func testReviewFilterCacheInvalidatesAcrossQueryRuleAndReport() throws {
        let report = try JSONDecoder().decode(ScanReport.self, from: Data(sampleReport.utf8))
        let store = AuditStore()
        store.applyReport(report)
        store.searchText = "Remote"
        let initial = store.findings()
        XCTAssertEqual(initial.count, 1)
        XCTAssertEqual(store.findings(), initial)
        store.selectedRuleID = "NONMATCHING_RULE"
        XCTAssertTrue(store.findings().isEmpty)
        store.selectedRuleID = nil
        store.searchText = "package script"
        XCTAssertEqual(store.findings().count, 1)
        store.searchText = "Remote"
        var object = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(sampleReport.utf8)) as? [String: Any])
        object["findings"] = []
        store.applyReport(try JSONDecoder().decode(ScanReport.self, from: JSONSerialization.data(withJSONObject: object)))
        XCTAssertTrue(store.findings().isEmpty)
        store.applyReport(report)
        store.clearFilters()
        XCTAssertEqual(store.findings().count, 3)
        XCTAssertEqual(store.findings(for: .skill).count, 2)
    }

    @MainActor
    func testThirtyThousandFindingReviewAndFilters() throws {
        var data: Data
        let uniqueTextControl = ProcessInfo.processInfo.environment["AEA_NATIVE_SCALE_UNIQUE_TEXT_CONTROL"] == "1"
        let ownerControl = ProcessInfo.processInfo.environment["AEA_NATIVE_SCALE_OWNER_CONTROL"]
        let uniquePathControl = ProcessInfo.processInfo.environment["AEA_NATIVE_SCALE_UNIQUE_PATH_CONTROL"] == "1"
        if let fixture = ProcessInfo.processInfo.environment["AEA_NATIVE_SCALE_REPORT"] {
            data = try Data(contentsOf: URL(fileURLWithPath: fixture))
        } else {
            var object = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(sampleReport.utf8)) as? [String: Any])
            let originals = try XCTUnwrap(object["findings"] as? [[String: Any]])
            object["findings"] = (0..<30_000).map { index -> [String: Any] in
                var finding = originals[index % originals.count]
                finding["id"] = "scale-\(index)"
                return finding
            }
            data = try JSONSerialization.data(withJSONObject: object)
        }
        if uniqueTextControl {
            var object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
            let findings = try XCTUnwrap(object["findings"] as? [[String: Any]])
            object["findings"] = findings.enumerated().map { index, original -> [String: Any] in
                var finding = original
                finding["message"] = "\(original["message"] as? String ?? "")\nSynthetic unique text control \(index)"
                return finding
            }
            data = try JSONSerialization.data(withJSONObject: object)
        }
        if let ownerControl {
            XCTAssertTrue(["missing", "unknown"].contains(ownerControl))
            var object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
            let findings = try XCTUnwrap(object["findings"] as? [[String: Any]])
            object["findings"] = findings.map { original -> [String: Any] in
                var finding = original
                if ownerControl == "missing" { finding.removeValue(forKey: "itemId") }
                else { finding["itemId"] = "synthetic:unknown-owner" }
                return finding
            }
            data = try JSONSerialization.data(withJSONObject: object)
        }
        if uniquePathControl {
            var object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
            let findings = try XCTUnwrap(object["findings"] as? [[String: Any]])
            object["findings"] = findings.enumerated().map { index, original -> [String: Any] in
                var finding = original
                var location = finding["location"] as? [String: Any] ?? [:]
                location["path"] = "\(location["path"] as? String ?? "")/synthetic-path-\(index)"
                finding["location"] = location
                return finding
            }
            data = try JSONSerialization.data(withJSONObject: object)
        }
        var expectedSkillCount: Int?
        var runs: [[String: Double]] = []
        for _ in 0..<3 {
            var timings: [String: Double] = [:]
            var start = CFAbsoluteTimeGetCurrent()
            let report = try JSONDecoder().decode(ScanReport.self, from: data)
            timings["decodeMs"] = (CFAbsoluteTimeGetCurrent() - start) * 1000
            XCTAssertEqual(report.findings.count, 30_000)
            let store = AuditStore()
            start = CFAbsoluteTimeGetCurrent()
            store.applyReport(report)
            timings["cacheMs"] = (CFAbsoluteTimeGetCurrent() - start) * 1000
            XCTAssertEqual(store.prioritizedFindings().count, 5)
            start = CFAbsoluteTimeGetCurrent()
            XCTAssertEqual(store.findings().count, 30_000)
            timings["allFindingsMs"] = (CFAbsoluteTimeGetCurrent() - start) * 1000
            let skillIDs = Set(report.inventory.filter { $0.type == .skill }.map(\.id))
            let skillPaths = report.inventory.filter { $0.type == .skill }.map(\.path)
            let expectedSkills = expectedSkillCount ?? report.findings.filter { finding in
                (finding.itemId.map(skillIDs.contains) ?? false) || skillPaths.contains {
                    finding.location.path == $0 || finding.location.path.hasPrefix($0 + "/")
                }
            }.count
            expectedSkillCount = expectedSkills
            start = CFAbsoluteTimeGetCurrent()
            XCTAssertEqual(store.findings(for: .skill).count, expectedSkills)
            timings["skillFilterMs"] = (CFAbsoluteTimeGetCurrent() - start) * 1000
            store.searchText = "unmatched-scale-query-987654"
            start = CFAbsoluteTimeGetCurrent()
            XCTAssertEqual(store.findings().count, 0)
            timings["searchMs"] = (CFAbsoluteTimeGetCurrent() - start) * 1000
            start = CFAbsoluteTimeGetCurrent()
            XCTAssertEqual(store.findings().count, 0)
            timings["repeatedSearchMs"] = (CFAbsoluteTimeGetCurrent() - start) * 1000
            store.searchText = ""
            store.selectedSeverity = report.findings.first?.severity
            XCTAssertEqual(store.findings().count, report.findings.filter { $0.severity == store.selectedSeverity }.count)
            runs.append(timings)
        }
        var usage = rusage()
        getrusage(RUSAGE_SELF, &usage)
        #if DEBUG
        let configuration = "debug"
        #else
        let configuration = "release"
        #endif
        let evidence: [String: Any] = ["findings": 30_000, "runs": runs, "peakRssBytes": usage.ru_maxrss,
            "configuration": configuration,
            "ownerControl": ownerControl ?? "valid IDs unchanged",
            "uniquePathControl": uniquePathControl,
            "uniqueTextControl": uniqueTextControl,
            "expectedSkills": expectedSkillCount ?? 0,
            "mode": uniquePathControl ? "synthetic unique-path control" : (ownerControl != nil ? "synthetic \(ownerControl!) owner control" : (uniqueTextControl ? "synthetic unique-message control" :
                (ProcessInfo.processInfo.environment["AEA_NATIVE_SCALE_REPORT"] == nil ? "synthetic model regression" : "real scanner report"))),
            "limits": "\(configuration) XCTest process; store timings exclude SwiftUI rendering and scanner time."]
        let output = try JSONSerialization.data(withJSONObject: evidence, options: [.sortedKeys])
        print("AEA_NATIVE_SCALE " + String(decoding: output, as: UTF8.self))
    }

    @MainActor
    func testSeverityCountsPreserveScopeFiltersAndReportReplacement() throws {
        let store = AuditStore()
        XCTAssertEqual(store.severityCounts().total, 0)
        XCTAssertTrue(store.severityCounts().bySeverity.isEmpty)
        let report = try JSONDecoder().decode(ScanReport.self, from: Data(sampleReport.utf8))
        store.applyReport(report)
        for query in ["", "remote", "  package  ", "not-present", "SKILL"] {
            store.searchText = query
            for type in [nil, .skill, .mcpServer, .plugin] as [InventoryType?] {
                for selected in [nil, .critical, .high, .medium] as [Severity?] {
                    store.selectedSeverity = selected
                    for rule in [nil, "REMOTE_SCRIPT_EXECUTION", "NONMATCHING_RULE"] as [String?] {
                        store.selectedRuleID = rule
                        let scope = store.severityScope(for: type)
                        let counts = store.severityCounts(for: type)
                        XCTAssertEqual(counts.total, scope.count)
                        for severity in Severity.allCases {
                            XCTAssertEqual(counts.bySeverity[severity, default: 0], scope.filter { $0.severity == severity }.count)
                        }
                    }
                }
            }
        }
        store.clearFilters()
        XCTAssertEqual(store.severityCounts().total, 3)
        var object = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(sampleReport.utf8)) as? [String: Any])
        object["findings"] = []
        store.applyReport(try JSONDecoder().decode(ScanReport.self, from: JSONSerialization.data(withJSONObject: object)))
        XCTAssertEqual(store.severityCounts().total, 0)
        XCTAssertTrue(store.severityCounts().bySeverity.isEmpty)
        store.applyReport(report)
        XCTAssertEqual(store.severityCounts(for: .skill).total, 2)
    }

    @MainActor
    func testThirtyThousandSeverityFilterScopeMeasurement() throws {
        guard let path = ProcessInfo.processInfo.environment["AEA_NATIVE_SCALE_REPORT"] else { return }
        let report = try JSONDecoder().decode(ScanReport.self, from: Data(contentsOf: URL(fileURLWithPath: path)))
        let store = AuditStore()
        store.applyReport(report)
        var runs: [[String: Any]] = []
        for query in ["", "skill-1499", "unmatched-scale-query-987654"] {
            store.searchText = query
            for _ in 0..<3 {
                let start = CFAbsoluteTimeGetCurrent()
                let total = store.severityScope(for: .skill).count
                let counts = Severity.allCases.map { severity in
                    store.severityScope(for: .skill).filter { $0.severity == severity }.count
                }
                let elapsed = (CFAbsoluteTimeGetCurrent() - start) * 1000
                XCTAssertEqual(total, query.isEmpty ? 30_000 : (query == "skill-1499" ? 20 : 0))
                XCTAssertEqual(counts.reduce(0, +), total)
                let tallyStart = CFAbsoluteTimeGetCurrent()
                let tally = store.severityCounts(for: .skill)
                let tallyMs = (CFAbsoluteTimeGetCurrent() - tallyStart) * 1000
                XCTAssertEqual(tally.total, total)
                XCTAssertEqual(Severity.allCases.map { tally.bySeverity[$0, default: 0] }, counts)
                runs.append(["query": query, "sixScopeMs": elapsed, "oneTallyMs": tallyMs, "total": total])
            }
        }
        print("AEA_NATIVE_SEVERITY " + String(decoding: try JSONSerialization.data(withJSONObject: runs, options: [.sortedKeys]), as: UTF8.self))
    }

    @MainActor
    private func legacyInventory(_ report: ScanReport, store: AuditStore, type: InventoryType,
                                 ignoringSeverity: Bool = false) -> [InventoryItem] {
        let query = store.searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return report.inventory.filter { item in
            guard item.type == type else { return false }
            let findings = store.findings(for: item)
            if !ignoringSeverity, let severity = store.selectedSeverity,
               !findings.contains(where: { $0.severity == severity }) { return false }
            return query.isEmpty || [item.name, item.path, item.displayPath, item.source ?? ""]
                .joined(separator: "\n").lowercased().contains(query) || findings.contains {
                    [$0.ruleId, $0.title, $0.message].joined(separator: "\n").lowercased().contains(query)
                }
        }.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
    }

    @MainActor
    func testInventorySearchPreservesFieldBoundariesOwnershipAndReplacement() throws {
        var object = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(sampleReport.utf8)) as? [String: Any])
        let originalItem = try XCTUnwrap((object["inventory"] as? [[String: Any]])?.first)
        let originalFinding = try XCTUnwrap((object["findings"] as? [[String: Any]])?.first)
        let names = ["skill02", "SKILL2", "é", "e\u{301}", "中文 🛡️", "İstanbul Straße"]
        object["inventory"] = (0..<36).reversed().map { i -> [String: Any] in
            var item = originalItem
            item["id"] = i % 7 == 0 ? "shared-owner" : "item-\(i)"
            item["type"] = InventoryType.allCases[i % InventoryType.allCases.count].rawValue
            item["name"] = names[i % names.count]
            item["path"] = "/tmp/item-\(i)"
            item["displayPath"] = "display-\(i)"
            if i % 2 == 0 { item["source"] = "source-Σ\nSecond line" }
            else { item.removeValue(forKey: "source") }
            return item
        }
        object["findings"] = (0..<72).map { i -> [String: Any] in
            var finding = originalFinding
            finding["id"] = "inventory-finding-\(i)"
            finding["itemId"] = i % 7 == 0 ? "shared-owner" : (i % 5 == 0 ? "unknown-owner" : "item-\(i % 36)")
            finding["ruleId"] = "RULE_Σ"
            finding["title"] = "İstanbul CAFE\u{301} 中文"
            finding["message"] = "First line\nSecond Straße \(i % 3)"
            finding["recommendation"] = "recommendation-only-987"
            finding["location"] = ["path": "/tmp/item-\(i % 36)/finding-path-only-987", "displayPath": "finding-display-only-987"]
            finding["severity"] = Severity.allCases[i % Severity.allCases.count].rawValue
            return finding
        }
        let report = try JSONDecoder().decode(ScanReport.self, from: JSONSerialization.data(withJSONObject: object))
        let store = AuditStore()
        XCTAssertTrue(store.inventory(for: .skill).isEmpty)
        for replacement in [report, report] {
            store.applyReport(replacement)
            for query in ["not-present-🧪", "", "  RULE_Σ  ", "İstanbul", "café", "中文", "Straße", "source-Σ\nSecond", "FIRST LINE\nSECOND", "skill02", "display-35", "recommendation-only-987", "finding-path-only-987", "finding-display-only-987", "é", "e\u{301}"] {
                store.searchText = query
                for type in InventoryType.allCases {
                    for severity in [nil, .critical, .high, .medium] as [Severity?] {
                        store.selectedSeverity = severity
                        for rule in [nil, "RULE_Σ", "NONMATCHING_RULE"] as [String?] {
                            store.selectedRuleID = rule
                            for ignoring in [false, true] {
                                let expected = legacyInventory(report, store: store, type: type, ignoringSeverity: ignoring)
                                XCTAssertEqual(store.inventory(for: type, ignoringSeverity: ignoring), expected, query)
                                XCTAssertEqual(store.inventory(for: type, ignoringSeverity: ignoring), expected, "Repeated: \(query)")
                            }
                        }
                    }
                }
            }
            object["inventory"] = []
            object["findings"] = []
            store.applyReport(try JSONDecoder().decode(ScanReport.self, from: JSONSerialization.data(withJSONObject: object)))
            for type in InventoryType.allCases { XCTAssertTrue(store.inventory(for: type).isEmpty) }
        }
        store.applyReport(report)
        store.clearFilters()
        XCTAssertEqual(store.inventory(for: .skill), legacyInventory(report, store: store, type: .skill))
    }

    @MainActor
    func testThirtyThousandInventorySearchMeasurement() throws {
        guard let path = ProcessInfo.processInfo.environment["AEA_NATIVE_SCALE_REPORT"] else { return }
        var data = try Data(contentsOf: URL(fileURLWithPath: path))
        let unique = ProcessInfo.processInfo.environment["AEA_NATIVE_SCALE_UNIQUE_TEXT_CONTROL"] == "1"
        if unique {
            var object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
            let findings = try XCTUnwrap(object["findings"] as? [[String: Any]])
            object["findings"] = findings.enumerated().map { i, original -> [String: Any] in
                var finding = original
                finding["message"] = "\(original["message"] as? String ?? "") unique-message-\(i)"
                return finding
            }
            data = try JSONSerialization.data(withJSONObject: object)
        }
        let report = try JSONDecoder().decode(ScanReport.self, from: data)
        var runs: [[String: Any]] = []
        for _ in 0..<3 {
            let store = AuditStore()
            let preparation = CFAbsoluteTimeGetCurrent()
            store.applyReport(report)
            let preparationMs = (CFAbsoluteTimeGetCurrent() - preparation) * 1000
            for query in ["", "skill-1499", "unmatched-scale-query-987654"] {
                store.searchText = query
                let start = CFAbsoluteTimeGetCurrent()
                let expected = legacyInventory(report, store: store, type: .skill)
                let legacyMs = (CFAbsoluteTimeGetCurrent() - start) * 1000
                let coldStart = CFAbsoluteTimeGetCurrent()
                let actual = store.inventory(for: .skill)
                let coldMs = (CFAbsoluteTimeGetCurrent() - coldStart) * 1000
                let repeatStart = CFAbsoluteTimeGetCurrent()
                let repeated = store.inventory(for: .skill)
                let repeatedMs = (CFAbsoluteTimeGetCurrent() - repeatStart) * 1000
                XCTAssertEqual(actual, expected)
                XCTAssertEqual(repeated, expected)
                XCTAssertEqual(actual.count, query.isEmpty ? 1500 : (query == "skill-1499" ? 1 : 0))
                runs.append(["query": query, "preparationMs": preparationMs, "legacyMs": legacyMs,
                             "coldMs": coldMs, "repeatedMs": repeatedMs, "items": actual.count])
            }
        }
        var usage = rusage()
        getrusage(RUSAGE_SELF, &usage)
        #if DEBUG
        let configuration = "debug"
        #else
        let configuration = "release"
        #endif
        let evidence: [String: Any] = ["configuration": configuration, "uniqueTextControl": unique,
            "runs": runs, "peakRssBytes": usage.ru_maxrss,
            "limits": "Synthetic scanner report; legacy precedes indexed query; three runs; excludes UI/scanner."]
        print("AEA_NATIVE_INVENTORY " + String(decoding: try JSONSerialization.data(withJSONObject: evidence, options: [.sortedKeys]), as: UTF8.self))
    }

    @MainActor
    func testOwnershipFallbackPreservesInputOrderAndCategoryPathSemantics() throws {
        var object = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(sampleReport.utf8)) as? [String: Any])
        var inventory = try XCTUnwrap(object["inventory"] as? [[String: Any]])
        inventory[0]["path"] = "/tmp/project"
        inventory[0]["displayPath"] = "/tmp/project"
        let original = try XCTUnwrap((object["findings"] as? [[String: Any]])?.first)
        object["findings"] = (0..<4).map { index -> [String: Any] in
            var finding = original
            finding["message"] = "fallback-\(index)"
            finding["location"] = ["path": index == 3 ? "/tmp/projects/plugin.json" : "/tmp/project/plugin.json",
                                   "displayPath": "/tmp/project/plugin.json"]
            finding.removeValue(forKey: "itemId")
            if index == 1 { finding["itemId"] = "missing:owner" }
            if index == 2 { finding["itemId"] = "plugin:one" }
            return finding
        }
        for reversed in [false, true] {
            object["inventory"] = reversed ? Array(inventory.reversed()) : inventory
            let report = try JSONDecoder().decode(ScanReport.self, from: JSONSerialization.data(withJSONObject: object))
            let store = AuditStore()
            store.applyReport(report)
            let skill = try XCTUnwrap(report.inventory.first { $0.id == "skill:one" })
            let plugin = try XCTUnwrap(report.inventory.first { $0.id == "plugin:one" })
            XCTAssertEqual(store.findings(for: skill).map(\.message), reversed ? [] : ["fallback-0", "fallback-1"])
            XCTAssertEqual(store.findings(for: plugin).map(\.message), reversed ? ["fallback-0", "fallback-1", "fallback-2"] : ["fallback-2"])
            XCTAssertEqual(store.findings(for: .skill).map(\.message), ["fallback-0", "fallback-1", "fallback-2"])
            XCTAssertEqual(store.findings(for: .plugin).map(\.message), ["fallback-0", "fallback-1", "fallback-2"])
            XCTAssertEqual(store.findings().count, 4)
        }
    }

    @MainActor
    func testPathOwnershipAndCategoryIndexMatchReferenceOnEdgePaths() throws {
        var object = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(sampleReport.utf8)) as? [String: Any])
        let originalItem = try XCTUnwrap((object["inventory"] as? [[String: Any]])?.first)
        let originalFinding = try XCTUnwrap((object["findings"] as? [[String: Any]])?.first)
        let paths = ["/tmp/project", "/tmp/project/nested", "/tmp/projects", "", "/", "/tmp/", "/tmp//", "/tmp/é", "/tmp/e\u{301}", "/tmp/🛡️", "/tmp/🛡", "/tmp/中文", "/tmp/\u{301}edge", "relative", "relative/", "/tmp/É"]
        let findingPaths = paths.flatMap { [$0, $0 + "/file", $0 + "s/file", $0 + "//file", $0 + "/\u{301}file"] } + ["/unknown/file", "//root/file"]
        let items = paths.enumerated().map { index, path -> [String: Any] in
            var item = originalItem
            item["id"] = "edge:\(index)"
            item["type"] = InventoryType.allCases[index % InventoryType.allCases.count].rawValue
            item["path"] = path
            item["displayPath"] = path
            return item
        }
        object["findings"] = findingPaths.enumerated().flatMap { index, path -> [[String: Any]] in
            (0..<3).map { ownerMode -> [String: Any] in
                var finding = originalFinding
                finding["message"] = "edge-\(index)-\(ownerMode)"
                finding["location"] = ["path": path, "displayPath": path, "line": index]
                finding["severity"] = Severity.allCases[index % Severity.allCases.count].rawValue
                finding.removeValue(forKey: "itemId")
                if ownerMode == 1 { finding["itemId"] = "unknown:edge" }
                if ownerMode == 2 { finding["itemId"] = "edge:\(index % paths.count)" }
                return finding
            }
        }
        var duplicate = items[1]
        duplicate["id"] = items[0]["id"]
        duplicate["type"] = InventoryType.config.rawValue
        let variants = [items, Array(items.reversed()), items.filter { ($0["path"] as? String) != "" }, [], items + [duplicate]]
        for (variant, inventory) in variants.enumerated() {
            object["inventory"] = inventory
            let report = try JSONDecoder().decode(ScanReport.self, from: JSONSerialization.data(withJSONObject: object))
            let store = AuditStore()
            store.applyReport(report)
            let queue = store.findings()
            for item in report.inventory {
                let expected = queue.filter { finding in
                    if let owner = finding.itemId, report.inventory.contains(where: { $0.id == owner }) {
                        return owner == item.id
                    }
                    return report.inventory.first { finding.location.path == $0.path || finding.location.path.hasPrefix($0.path + "/") }?.id == item.id
                }
                XCTAssertEqual(store.findings(for: item).map(\.message), expected.map(\.message), "owner \(item.id), variant \(variant)")
            }
            for type in InventoryType.allCases {
                let category = report.inventory.filter { $0.type == type }
                for query in ["", "edge-2", "unmatched"] {
                    for severity in [nil, Severity.critical, .info] {
                        store.searchText = query
                        store.selectedSeverity = severity
                        let expected = queue.filter { finding in
                            (severity == nil || finding.severity == severity) &&
                            (query.isEmpty || finding.message.contains(query)) &&
                            category.contains { finding.itemId == $0.id || finding.location.path == $0.path || finding.location.path.hasPrefix($0.path + "/") }
                        }
                        XCTAssertEqual(store.findings(for: type).map(\.message), expected.map(\.message), "category \(type), variant \(variant)")
                    }
                }
            }
        }
    }

    func testBlockedBaselineExplainsRulesAndKeepsUnknownReasonsPrivate() {
        let rules = BaselineReviewDiff(status: "incompatible", currentGeneratedAt: "2026-10-04T00:00:00.000Z", reasons: ["ruleset_mismatch"], addedAssets: [], removedAssets: [], changedAssets: [], newFindings: [], resolvedFindings: [])
        XCTAssertTrue(rules.blockMessage(language: .english).contains("Rules changed"))
        XCTAssertTrue(rules.blockMessage(language: .zhHant).contains("規則已變更"))
        let unknown = BaselineReviewDiff(status: "incompatible", currentGeneratedAt: "2026-10-04T00:00:00.000Z", reasons: ["private-source-marker"], addedAssets: [], removedAssets: [], changedAssets: [], newFindings: [], resolvedFindings: [])
        XCTAssertFalse(unknown.blockMessage(language: .english).contains("private-source-marker"))
    }
    @MainActor
    func testReviewQueuePreservesAllSeveritiesAndPrioritizesCurrentContent() throws {
        var object = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(sampleReport.utf8)) as? [String: Any])
        var findings = try XCTUnwrap(object["findings"] as? [[String: Any]])
        findings[0]["ruleId"] = "ARCHIVED_TEST"
        findings[0]["review"] = ["context": "archived", "priority": 5]
        findings[1]["ruleId"] = "CURRENT_TEST"
        findings[1]["review"] = ["context": "current", "priority": 0]
        findings[2]["ruleId"] = "DISABLED_TEST"
        findings[2]["review"] = ["context": "disabled", "priority": 4]
        object["findings"] = findings
        let report = try JSONDecoder().decode(ScanReport.self, from: JSONSerialization.data(withJSONObject: object))
        let store = AuditStore()
        store.applyReport(report)
        XCTAssertEqual(store.findings().map(\.ruleId), ["CURRENT_TEST", "DISABLED_TEST", "ARCHIVED_TEST"])
        XCTAssertEqual(store.findings().last?.severity, .critical)
        store.searchText = "ARCHIVED_TEST"
        XCTAssertEqual(store.findings().map(\.ruleId), ["ARCHIVED_TEST"])
    }

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
        XCTAssertNil(report.coverage, "Legacy reports must not imply complete coverage")
    }

    func testDecodesCoverageAndCodeEvidence() throws {
        var object = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(sampleReport.utf8)) as? [String: Any])
        object["schemaVersion"] = 2
        object["coverage"] = [
            "status": "partial", "filesRead": 1, "filesSkipped": 1, "directoriesSkipped": 0,
            "scope": ["includeHome": false, "includePaths": [], "excludePaths": [],
                      "defaultExcludedDirectories": ["node_modules", ".git", "dist"], "maxFileBytes": 524288, "maxDepth": 6] as [String: Any],
            "diagnostics": [["code": "parse_failed", "displayPath": ".mcp.json",
                             "message": "Invalid configuration syntax", "affectsCompleteness": true] as [String: Any]]
        ] as [String: Any]
        var findings = try XCTUnwrap(object["findings"] as? [[String: Any]])
        findings[0]["evidence"] = ["kind": "code", "confidence": "medium", "active": "unknown"]
        object["findings"] = findings
        let report = try JSONDecoder().decode(ScanReport.self, from: JSONSerialization.data(withJSONObject: object))
        XCTAssertEqual(report.schemaVersion, 2)
        XCTAssertEqual(report.coverage?.status, "partial")
        XCTAssertEqual(report.coverage?.diagnostics.first?.code, "parse_failed")
        XCTAssertEqual(report.findings.first?.evidence?.kind, .code)
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

    func testDirectPackageScanAlwaysExcludesHome() {
        let request = ScanRequest(rootURL: URL(fileURLWithPath: "/tmp/package"), includeHome: true, directPackage: true)
        let arguments = request.arguments(scannerURL: URL(fileURLWithPath: "/tmp/cli.js"), outputURL: URL(fileURLWithPath: "/tmp/report.json"))
        XCTAssertTrue(arguments.contains("--path"))
        XCTAssertTrue(arguments.contains("--no-home"))
        XCTAssertEqual(arguments.filter { $0 == "/tmp/package" }.count, 2)
    }

    func testNativeBaselineRoundTrip() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("aea-native-\(UUID().uuidString)").resolvingSymlinksInPath()
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        try Data("---\nname: fixture\nsource: https://example.invalid/source\n---\nReference".utf8).write(to: root.appendingPathComponent("SKILL.md"))
        var repository = URL(fileURLWithPath: #filePath)
        for _ in 0..<5 { repository.deleteLastPathComponent() }
        let scanner = repository.appendingPathComponent("dist/cli.js")
        var environment = ProcessInfo.processInfo.environment
        environment["AGENT_AUDIT_CLI_PATH"] = scanner.path
        let runner = AuditRunner(locator: RuntimeLocator(environment: environment))
        let request = ScanRequest(rootURL: root, includeHome: false, directPackage: true)
        let review = try await runner.reviewBaseline(request)
        XCTAssertFalse(review.exists)
        do { try await runner.acceptBaseline(request, review: review) } catch { XCTFail(String(reflecting: error)); return }
        let after = try await runner.reviewBaseline(request)
        XCTAssertTrue(after.exists)
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

        XCTAssertEqual(store.severityScope(for: .skill).count, 2)
        XCTAssertEqual(store.severityScope(for: .plugin).count, 1)

        store.selectedSeverity = .critical
        XCTAssertEqual(store.inventory(for: .skill).map(\.name), ["One"])
        XCTAssertTrue(store.inventory(for: .plugin).isEmpty)
        XCTAssertEqual(store.severityScope(for: .plugin).count, 1)
        XCTAssertEqual(store.findings().map(\.ruleId), ["REMOTE_SCRIPT_EXECUTION"])

        store.selectedSeverity = nil
        store.searchText = "package script"
        XCTAssertEqual(store.severityScope(for: .skill).count, 0)
        XCTAssertEqual(store.severityScope(for: .plugin).count, 1)
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
          "version": "0.2.2",
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
