import Foundation
import Darwin

struct ScanRequest: Equatable {
    let rootURL: URL
    let includeHome: Bool
    var directPackage: Bool = false

    func arguments(scannerURL: URL, outputURL: URL) -> [String] {
        var values = [
            scannerURL.path,
            "scan",
            "--format", "json",
            "--output", outputURL.path,
            "--root", rootURL.path
        ]
        if directPackage { values += ["--path", rootURL.path] }
        if !includeHome || directPackage {
            values.append("--no-home")
        }
        return values
    }
}

struct RuntimeStatus: Equatable {
    let nodeURL: URL?
    let scannerURL: URL?
}

enum AuditRunnerError: Error, Equatable {
    case nodeMissing
    case scannerMissing
    case launchFailed
    case scanFailed(exitCode: Int32)
    case invalidReport
    case repairFailed(message: String)
}

struct RuntimeLocator {
    private let fileManager: FileManager
    private let environment: [String: String]
    private let homeURL: URL
    private let bundleResourceURL: URL?
    private let currentDirectoryURL: URL
    private let executableURL: URL?

    init(
        fileManager: FileManager = .default,
        environment: [String: String] = ProcessInfo.processInfo.environment,
        homeURL: URL = FileManager.default.homeDirectoryForCurrentUser,
        bundleResourceURL: URL? = Bundle.main.resourceURL,
        currentDirectoryURL: URL = URL(fileURLWithPath: FileManager.default.currentDirectoryPath),
        executableURL: URL? = Bundle.main.executableURL
    ) {
        self.fileManager = fileManager
        self.environment = environment
        self.homeURL = homeURL
        self.bundleResourceURL = bundleResourceURL
        self.currentDirectoryURL = currentDirectoryURL
        self.executableURL = executableURL
    }

    func status() -> RuntimeStatus {
        RuntimeStatus(nodeURL: locateNode(), scannerURL: locateScanner())
    }

    func locateNode() -> URL? {
        var candidates: [URL] = []

        if let override = environment["AGENT_AUDIT_NODE_PATH"] {
            candidates.append(URL(fileURLWithPath: override))
        }

        if let path = environment["PATH"] {
            candidates.append(contentsOf: path.split(separator: ":").map {
                URL(fileURLWithPath: String($0)).appendingPathComponent("node")
            })
        }

        candidates.append(contentsOf: [
            URL(fileURLWithPath: "/opt/homebrew/bin/node"),
            URL(fileURLWithPath: "/usr/local/bin/node"),
            homeURL.appendingPathComponent(".volta/bin/node"),
            homeURL.appendingPathComponent(".local/bin/node")
        ])

        candidates.append(contentsOf: versionedNodeCandidates(
            root: homeURL.appendingPathComponent(".nvm/versions/node"),
            suffix: "bin/node"
        ))
        candidates.append(contentsOf: versionedNodeCandidates(
            root: homeURL.appendingPathComponent(".local/share/fnm/node-versions"),
            suffix: "installation/bin/node"
        ))

        return firstExecutable(in: candidates)
    }

    func locateScanner() -> URL? {
        var candidates: [URL] = []

        if let override = environment["AGENT_AUDIT_CLI_PATH"] {
            candidates.append(URL(fileURLWithPath: override))
        }

        if let bundleResourceURL {
            candidates.append(bundleResourceURL.appendingPathComponent("agent-audit/dist/cli.js"))
        }

        candidates.append(contentsOf: scannerCandidates(startingAt: currentDirectoryURL))
        if let executableURL {
            candidates.append(contentsOf: scannerCandidates(startingAt: executableURL.deletingLastPathComponent()))
        }

        return candidates.first(where: isReadableFile)
    }

    private func scannerCandidates(startingAt start: URL) -> [URL] {
        var directory = start.standardizedFileURL
        var candidates: [URL] = []

        for _ in 0..<10 {
            candidates.append(directory.appendingPathComponent("dist/cli.js"))
            let parent = directory.deletingLastPathComponent()
            if parent.path == directory.path {
                break
            }
            directory = parent
        }
        return candidates
    }

    private func versionedNodeCandidates(root: URL, suffix: String) -> [URL] {
        guard let entries = try? fileManager.contentsOfDirectory(
            at: root,
            includingPropertiesForKeys: nil,
            options: [.skipsHiddenFiles]
        ) else {
            return []
        }

        return entries
            .sorted { $0.lastPathComponent.localizedStandardCompare($1.lastPathComponent) == .orderedDescending }
            .map { $0.appendingPathComponent(suffix) }
    }

    private func firstExecutable(in candidates: [URL]) -> URL? {
        candidates.first { fileManager.isExecutableFile(atPath: $0.path) }
    }

    private func isReadableFile(_ url: URL) -> Bool {
        var isDirectory: ObjCBool = false
        return fileManager.fileExists(atPath: url.path, isDirectory: &isDirectory) && !isDirectory.boolValue
    }
}

struct AuditRunner {
    let locator: RuntimeLocator

    init(locator: RuntimeLocator = RuntimeLocator()) {
        self.locator = locator
    }

    func runtimeStatus() -> RuntimeStatus {
        locator.status()
    }

    func scan(_ request: ScanRequest) async throws -> ScanReport {
        try await Task.detached(priority: .userInitiated) {
            try scanSynchronously(request)
        }.value
    }

    func planSourceRepair(path: String, source: String) async throws -> RepairPlan {
        try await Task.detached(priority: .userInitiated) {
            try runRepairSynchronously(
                arguments: [
                    "repair", "plan",
                    "--action", "skill.add-source",
                    "--path", path,
                    "--source", source
                ],
                currentDirectoryURL: URL(fileURLWithPath: path).deletingLastPathComponent(),
                as: RepairPlan.self
            )
        }.value
    }

    func applySourceRepair(path: String, source: String, expectedHash: String) async throws -> ApplyRepairResult {
        try await Task.detached(priority: .userInitiated) {
            try runRepairSynchronously(
                arguments: [
                    "repair", "apply",
                    "--action", "skill.add-source",
                    "--path", path,
                    "--source", source,
                    "--expected-hash", expectedHash,
                    "--yes"
                ],
                currentDirectoryURL: URL(fileURLWithPath: path).deletingLastPathComponent(),
                as: ApplyRepairResult.self
            )
        }.value
    }

    func rollbackRepair(backupId: String) async throws -> RollbackRepairResult {
        try await Task.detached(priority: .userInitiated) {
            try runRepairSynchronously(
                arguments: ["repair", "rollback", "--backup", backupId, "--yes"],
                currentDirectoryURL: FileManager.default.homeDirectoryForCurrentUser,
                as: RollbackRepairResult.self
            )
        }.value
    }

    func reviewBaseline(_ request: ScanRequest) async throws -> BaselineReview {
        let data = try await baselineCommand(request, operation: "review")
        return try JSONDecoder().decode(BaselineReview.self, from: data)
    }

    func acceptBaseline(_ request: ScanRequest, review: BaselineReview) async throws {
        _ = try await baselineCommand(request, operation: review.exists ? "accept" : "create", expectedHash: review.reviewedHash)
    }

    private func baselineCommand(_ request: ScanRequest, operation: String, expectedHash: String? = nil) async throws -> Data {
        try await Task.detached(priority: .userInitiated) {
            let status = locator.status()
            guard let node = status.nodeURL else { throw AuditRunnerError.nodeMissing }
            guard let scanner = status.scannerURL else { throw AuditRunnerError.scannerMissing }
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent("agent-audit-baseline-\(UUID().uuidString)")
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: false, attributes: [.posixPermissions: 0o700])
            defer { try? FileManager.default.removeItem(at: directory) }
            let outputURL = directory.appendingPathComponent("response.json")
            FileManager.default.createFile(atPath: outputURL.path, contents: nil, attributes: [.posixPermissions: 0o600])
            let output = try FileHandle(forWritingTo: outputURL)
            defer { try? output.close() }
            guard let resolved = realpath(request.rootURL.path, nil) else { throw AuditRunnerError.launchFailed }
            let canonicalRoot = String(cString: resolved)
            free(resolved)
            var arguments = [scanner.path, "baseline", operation, "--format", "json", "--root", canonicalRoot]
            if request.directPackage { arguments += ["--path", canonicalRoot] }
            if !request.includeHome || request.directPackage { arguments.append("--no-home") }
            if let expectedHash { arguments += ["--expected-hash", expectedHash, "--yes"] }
            let process = Process()
            process.executableURL = node
            process.arguments = arguments
            process.currentDirectoryURL = request.rootURL
            process.standardOutput = output
            process.standardError = FileHandle.nullDevice
            try process.run()
            process.waitUntilExit()
            guard process.terminationStatus == 0 else { throw AuditRunnerError.scanFailed(exitCode: process.terminationStatus) }
            return try Data(contentsOf: outputURL)
        }.value
    }

    private func scanSynchronously(_ request: ScanRequest) throws -> ScanReport {
        let status = locator.status()
        guard let nodeURL = status.nodeURL else {
            throw AuditRunnerError.nodeMissing
        }
        guard let scannerURL = status.scannerURL else {
            throw AuditRunnerError.scannerMissing
        }

        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("agent-audit-\(UUID().uuidString).json")
        defer { try? FileManager.default.removeItem(at: outputURL) }

        let process = Process()
        process.executableURL = nodeURL
        process.arguments = request.arguments(scannerURL: scannerURL, outputURL: outputURL)
        process.currentDirectoryURL = request.rootURL
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice

        do {
            try process.run()
        } catch {
            throw AuditRunnerError.launchFailed
        }
        process.waitUntilExit()

        // Incomplete scans still contain useful findings and coverage diagnostics.
        guard [0, 3, 4].contains(process.terminationStatus) else {
            throw AuditRunnerError.scanFailed(exitCode: process.terminationStatus)
        }

        guard let data = try? Data(contentsOf: outputURL),
              let report = try? JSONDecoder().decode(ScanReport.self, from: data) else {
            throw AuditRunnerError.invalidReport
        }
        return report
    }

    private func runRepairSynchronously<T: Decodable>(
        arguments: [String],
        currentDirectoryURL: URL,
        as type: T.Type
    ) throws -> T {
        let status = locator.status()
        guard let nodeURL = status.nodeURL else {
            throw AuditRunnerError.nodeMissing
        }
        guard let scannerURL = status.scannerURL else {
            throw AuditRunnerError.scannerMissing
        }

        let output = Pipe()
        let errors = Pipe()
        let process = Process()
        process.executableURL = nodeURL
        process.arguments = [scannerURL.path] + arguments
        process.currentDirectoryURL = currentDirectoryURL
        process.standardOutput = output
        process.standardError = errors

        do {
            try process.run()
        } catch {
            throw AuditRunnerError.launchFailed
        }
        process.waitUntilExit()

        let outputData = output.fileHandleForReading.readDataToEndOfFile()
        let errorData = errors.fileHandleForReading.readDataToEndOfFile()
        guard process.terminationStatus == 0 else {
            let rawMessage = String(data: errorData, encoding: .utf8)?
                .trimmingCharacters(in: .whitespacesAndNewlines)
            let message = rawMessage.map { String($0.prefix(500)) } ?? "Repair command failed."
            throw AuditRunnerError.repairFailed(message: message)
        }

        guard let value = try? JSONDecoder().decode(type, from: outputData) else {
            throw AuditRunnerError.repairFailed(message: "Repair command returned an unreadable response.")
        }
        return value
    }
}
