import Foundation
import XCTest
@testable import AgentExtensionAuditor

final class InventoryMetadataTests: XCTestCase {
    private func roundTrip(_ metadata: Any?) throws -> [String: Any] {
        var object: [String: Any] = [
            "id": "item", "type": "mcpServer", "name": "Example",
            "path": "/tmp/example", "displayPath": "example"
        ]
        if let metadata { object["metadata"] = metadata }
        let item = try JSONDecoder().decode(InventoryItem.self, from: JSONSerialization.data(withJSONObject: object))
        return try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(item)) as? [String: Any])
    }

    func testExplicitFalseAndPluginOwnershipSurviveDecoding() throws {
        let result = try roundTrip(["configuredEnabled": false, "pluginId": "plugin-123"])
        let metadata = try XCTUnwrap(result["metadata"] as? [String: Any])
        XCTAssertEqual(metadata["configuredEnabled"] as? Bool, false)
        XCTAssertEqual(metadata["pluginId"] as? String, "plugin-123")
    }

    func testLegacyReportWithoutMetadataStillDecodes() throws {
        XCTAssertNil(try roundTrip(nil)["metadata"])
    }

    func testMalformedOptionalMetadataDoesNotRejectInventory() throws {
        for malformed: Any in ["invalid", 42, ["configuredEnabled": "false", "pluginId": 9]] {
            let result = try roundTrip(malformed)
            XCTAssertEqual(result["id"] as? String, "item")
            let metadata = try XCTUnwrap(result["metadata"] as? [String: Any])
            XCTAssertNotNil(metadata["parseError"])
            XCTAssertNil(metadata["configuredEnabled"])
        }
    }

    func testConfigurationTriStateAndUnknownKeys() throws {
        for flag in [true, false] {
            let result = try roundTrip(["configuredEnabled": flag, "futureField": ["data": 1]])
            XCTAssertEqual((result["metadata"] as? [String: Any])?["configuredEnabled"] as? Bool, flag)
        }
        let result = try roundTrip(["enabled": true])
        XCTAssertNil((result["metadata"] as? [String: Any])?["configuredEnabled"])
    }

    func testParserErrorsAreSanitizedAndCoverageStaysIncomplete() throws {
        let result = try roundTrip(["parseError": "SYNTHETIC_PRIVATE_EXCERPT", "coverage": "static subset"])
        let metadata = try XCTUnwrap(result["metadata"] as? [String: Any])
        XCTAssertNotNil(metadata["parseError"])
        XCTAssertNotNil(metadata["coverage"])
        XCTAssertFalse(String(describing: result).contains("SYNTHETIC_PRIVATE_EXCERPT"))
        let item = try JSONDecoder().decode(InventoryItem.self, from: JSONSerialization.data(withJSONObject: result))
        XCTAssertTrue(item.hasIncompleteEvidence)
    }

    func testPluginOwnershipRequiresExactIDAndPluginType() throws {
        func item(_ id: String, _ type: String, _ metadata: [String: Any] = [:]) throws -> InventoryItem {
            let json: [String: Any] = ["id": id, "type": type, "name": "Shared name",
                "path": "/tmp/example", "displayPath": "example", "metadata": metadata]
            return try JSONDecoder().decode(InventoryItem.self, from: JSONSerialization.data(withJSONObject: json))
        }
        let skill = try item("skill", "skill", ["pluginId": "owner"])
        let unrelated = try item("other", "plugin")
        let wrongType = try item("owner", "package")
        let owner = try item("owner", "plugin")
        XCTAssertNil(skill.owningPlugin(in: [unrelated, wrongType]))
        XCTAssertEqual(skill.owningPlugin(in: [unrelated, wrongType, owner]), owner)
        XCTAssertNil(try item("standalone", "skill").owningPlugin(in: [owner]))
    }

    func testBothLanguagesExplainLimitsWithoutRuntimeClaim() {
        for language in AppLanguage.allCases {
            for key: TextKey in [.configuredEnabled, .configuredDisabled, .configurationUnspecified,
                                 .runtimeUnverified, .parseIncompleteDetail, .limitedCoverageDetail, .ownerUnresolved] {
                XCTAssertFalse(text(key, language: language).isEmpty)
            }
            XCTAssertNotEqual(text(.configuredEnabled, language: language), text(.configurationUnspecified, language: language))
        }
    }
}
