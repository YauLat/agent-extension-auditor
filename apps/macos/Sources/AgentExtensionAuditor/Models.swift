import Foundation

enum Severity: String, Codable, CaseIterable, Identifiable {
    case critical
    case high
    case medium
    case low
    case info

    var id: String { rawValue }

    var rank: Int {
        switch self {
        case .critical: 0
        case .high: 1
        case .medium: 2
        case .low: 3
        case .info: 4
        }
    }
}

enum InventoryType: String, Codable, CaseIterable, Identifiable {
    case skill
    case plugin
    case mcpServer
    case hook
    case config
    case package

    var id: String { rawValue }
}

struct FindingLocation: Codable, Equatable {
    let path: String
    let displayPath: String
    let line: Int?
    let keyPath: String?
}

enum EvidenceKind: String, Codable, Equatable {
    case documented
    case code
    case configured
    case metadata
}

enum EvidenceConfidence: String, Codable, Equatable {
    case medium
    case high
}

struct FindingEvidence: Codable, Equatable {
    let kind: EvidenceKind
    let confidence: EvidenceConfidence
    let active: String
}

enum RemediationMode: String, Codable, Equatable {
    case review
    case guided
}

struct RemediationDescriptor: Codable, Equatable {
    let mode: RemediationMode
    let title: String
    let summary: String
    let actionId: String?
    let requiresInput: [String]?
}

struct Finding: Codable, Identifiable, Equatable {
    let ruleId: String
    let severity: Severity
    let title: String
    let message: String
    let location: FindingLocation
    let itemId: String?
    let recommendation: String
    let evidence: FindingEvidence?
    let remediation: RemediationDescriptor?

    var id: String {
        [
            ruleId,
            itemId ?? "",
            location.path,
            location.line.map(String.init) ?? "",
            location.keyPath ?? "",
            message
        ].joined(separator: "\u{1F}")
    }
}

struct RepairPlan: Codable, Equatable {
    let action: String
    let path: String
    let expectedHash: String
    let preview: String
    let description: String
}

struct ApplyRepairResult: Codable, Equatable {
    let action: String
    let path: String
    let backupId: String
    let appliedHash: String
    let changed: Bool
}

struct RollbackRepairResult: Codable, Equatable {
    let backupId: String
    let path: String
    let restored: Bool
}

struct InventoryItem: Codable, Identifiable, Equatable {
    let id: String
    let type: InventoryType
    let name: String
    let path: String
    let displayPath: String
    let source: String?
    var contentHash: String? = nil
    var aliases: [String]? = nil
    var agents: [String]? = nil
}

struct ScannedLocation: Codable, Identifiable, Equatable {
    let path: String
    let displayPath: String
    let kind: String
    let exists: Bool
    let reason: String

    var id: String { "\(kind)\u{1F}\(path)" }
}

struct InventoryCounts: Codable, Equatable {
    let skills: Int
    let plugins: Int
    let mcpServers: Int
    let hooks: Int
    let configs: Int
    let packages: Int

    var total: Int {
        skills + plugins + mcpServers + hooks + configs + packages
    }

    func count(for type: InventoryType) -> Int {
        switch type {
        case .skill: skills
        case .plugin: plugins
        case .mcpServer: mcpServers
        case .hook: hooks
        case .config: configs
        case .package: packages
        }
    }
}

struct FindingCounts: Codable, Equatable {
    let critical: Int
    let high: Int
    let medium: Int
    let low: Int
    let info: Int

    var total: Int {
        critical + high + medium + low + info
    }

    func count(for severity: Severity) -> Int {
        switch severity {
        case .critical: critical
        case .high: high
        case .medium: medium
        case .low: low
        case .info: info
        }
    }
}

struct ScanSummary: Codable, Equatable {
    let inventory: InventoryCounts
    let findings: FindingCounts
}

struct PrivacyState: Codable, Equatable {
    let telemetry: Bool
    let uploaded: Bool
}

struct ScanReport: Codable, Equatable {
    let tool: String
    let version: String
    let generatedAt: String
    let privacy: PrivacyState
    let scannedLocations: [ScannedLocation]
    let inventory: [InventoryItem]
    let findings: [Finding]
    let summary: ScanSummary
    let recommendedActions: [String]
    var schemaVersion: Int? = nil
    var coverage: ScanCoverage? = nil
}

struct ScanDiagnostic: Codable, Equatable, Identifiable {
    let code: String
    let displayPath: String
    let message: String
    let affectsCompleteness: Bool
    var id: String { "\(code)\u{1F}\(displayPath)" }
}

struct ScanScope: Codable, Equatable {
    let includeHome: Bool
    let includePaths: [String]
    let excludePaths: [String]
    let defaultExcludedDirectories: [String]
    let maxFileBytes: Int
    let maxDepth: Int
}

struct ScanCoverage: Codable, Equatable {
    let status: String
    let filesRead: Int
    let filesSkipped: Int
    let directoriesSkipped: Int
    let diagnostics: [ScanDiagnostic]
    let scope: ScanScope
}

enum SidebarSection: Hashable, Identifiable {
    case overview
    case findings
    case inventory(InventoryType)
    case locations
    case settings

    static let all: [SidebarSection] = [
        .overview,
        .findings,
        .inventory(.skill),
        .inventory(.plugin),
        .inventory(.mcpServer),
        .inventory(.hook),
        .inventory(.config),
        .inventory(.package),
        .locations,
        .settings
    ]

    var id: String {
        switch self {
        case .overview: "overview"
        case .findings: "findings"
        case .inventory(let type): "inventory-\(type.rawValue)"
        case .locations: "locations"
        case .settings: "settings"
        }
    }
}
