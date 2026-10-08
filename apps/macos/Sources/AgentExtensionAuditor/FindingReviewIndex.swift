import Foundation

/// Derived, in-memory data for one report. Nothing here changes finding evidence or identity.
struct FindingReviewIndex {
    let queue: [Finding]
    let searchEntries: [SearchEntry]
    let searchEntryIDs: [Int]
    let byItemID: [String: [Finding]]
    let categoryMatches: [InventoryType: Set<Int>]
    let inventorySearch: InventorySearchIndex

    struct SearchEntry {
        let text: String
        let ruleID: String
    }

    func prioritizing(_ changes: [String: AssetChangeState]) -> FindingReviewIndex {
        guard !changes.isEmpty else { return self }
        var first: [Int] = [], rest: [Int] = []
        for index in queue.indices {
            let finding = queue[index]
            if (finding.review?.context ?? "current") == "current",
               finding.itemId.flatMap({ changes[$0] })?.requiresReview == true { first.append(index) }
            else { rest.append(index) }
        }
        return FindingReviewIndex(base: self, order: first + rest)
    }

    private init(base: FindingReviewIndex, order: [Int]) {
        queue = order.map { base.queue[$0] }
        searchEntryIDs = order.map { base.searchEntryIDs[$0] }
        searchEntries = base.searchEntries
        byItemID = base.byItemID
        inventorySearch = base.inventorySearch
        var categories: [InventoryType: Set<Int>] = [:]
        for (type, positions) in base.categoryMatches {
            categories[type] = Set(order.indices.filter { positions.contains(order[$0]) })
        }
        categoryMatches = categories
    }

    init(report: ScanReport) {
        queue = Self.ordered(report.findings)

        let itemIDs = Set(report.inventory.map(\.id))
        var typesByItemID: [String: Set<InventoryType>] = [:]
        var paths: [String: PathMatch] = [:]
        for (position, item) in report.inventory.enumerated() {
            typesByItemID[item.id, default: []].insert(item.type)
            var match = paths[item.path] ?? PathMatch(firstOwner: position, types: [])
            match.types.insert(item.type)
            paths[item.path] = match
        }
        var pathCache: [LiteralPathKey: PathMatch] = [:]
        var categories: [InventoryType: Set<Int>] = [:]
        var ownership: [String: [Finding]] = [:]
        var textPool: [SearchFields: Int] = [:]
        var entries: [SearchEntry] = []
        var entryIDs: [Int] = []
        entryIDs.reserveCapacity(queue.count)
        for (position, finding) in queue.enumerated() {
            let pathKey = LiteralPathKey(value: finding.location.path)
            let pathMatch: PathMatch
            if let cached = pathCache[pathKey] {
                pathMatch = cached
            } else {
                pathMatch = Self.matchPath(finding.location.path, paths: paths)
                pathCache[pathKey] = pathMatch
            }
            var matchedTypes = pathMatch.types
            if let itemID = finding.itemId, let ownerTypes = typesByItemID[itemID] {
                matchedTypes.formUnion(ownerTypes)
            }
            for type in matchedTypes { categories[type, default: []].insert(position) }
            if let itemID = finding.itemId, itemIDs.contains(itemID) {
                ownership[itemID, default: []].append(finding)
            } else if let owner = pathMatch.firstOwner {
                ownership[report.inventory[owner].id, default: []].append(finding)
            }

            let fields = SearchFields(finding)
            if let existing = textPool[fields] {
                entryIDs.append(existing)
            } else {
                let entryID = entries.count
                entries.append(SearchEntry(text: fields.normalized, ruleID: fields.ruleID))
                textPool[fields] = entryID
                entryIDs.append(entryID)
            }
        }
        byItemID = ownership
        categoryMatches = categories
        searchEntries = entries
        searchEntryIDs = entryIDs
        inventorySearch = InventorySearchIndex(inventory: report.inventory, byItemID: ownership)
    }

    private struct PathMatch {
        var firstOwner: Int?
        var types: Set<InventoryType>

        mutating func merge(_ other: PathMatch) {
            if let owner = other.firstOwner { firstOwner = min(firstOwner ?? owner, owner) }
            types.formUnion(other.types)
        }
    }

    private static func matchPath(_ path: String, paths: [String: PathMatch]) -> PathMatch {
        var result = paths[path] ?? PathMatch(firstOwner: nil, types: [])
        // Do not normalize components: empty/root/trailing/repeated slashes have
        // distinct legacy prefix behavior. Scalar boundaries also retain combining marks.
        for boundary in path.unicodeScalars.indices where path.unicodeScalars[boundary].value == 47 {
            let prefix = String(path.unicodeScalars[..<boundary])
            if let match = paths[prefix], path.hasPrefix(prefix + "/") { result.merge(match) }
        }
        return result
    }

    private static func ordered(_ findings: [Finding]) -> [Finding] {
        // Swift String equality can merge canonically equivalent UTF-8 spellings that
        // localizedStandardCompare orders differently. Preserve the original spellings.
        let pathKeys = findings.map { LiteralPathKey(value: $0.location.displayPath) }
        var uniquePaths: [LiteralPathKey: String] = [:]
        for index in findings.indices { uniquePaths[pathKeys[index]] = findings[index].location.displayPath }
        let paths = uniquePaths.sorted {
            $0.value.localizedStandardCompare($1.value) == .orderedAscending
        }
        var pathRanks: [LiteralPathKey: Int] = [:]
        var rank = 0
        var previous: String?
        for (key, path) in paths {
            if let previous, previous.localizedStandardCompare(path) != .orderedSame { rank += 1 }
            pathRanks[key] = rank
            previous = path
        }
        let keys = findings.indices.map { index in
            let finding = findings[index]
            return SortKey(priority: finding.reviewPriority, severity: finding.severity.rank,
                    pathRank: pathRanks[pathKeys[index]] ?? 0, id: finding.id)
        }
        return findings.indices.sorted { left, right in
            let lhs = keys[left], rhs = keys[right]
            if lhs.priority != rhs.priority { return lhs.priority < rhs.priority }
            if lhs.severity != rhs.severity { return lhs.severity < rhs.severity }
            if lhs.pathRank != rhs.pathRank { return lhs.pathRank < rhs.pathRank }
            if lhs.id != rhs.id { return lhs.id < rhs.id }
            return left < right
        }.map { findings[$0] }
    }

    private struct SortKey {
        let priority: Int
        let severity: Int
        let pathRank: Int
        let id: String
    }

    private struct LiteralPathKey: Hashable {
        let value: String
        let bytes: [UInt8]

        init(value: String) {
            self.value = value
            bytes = Array(value.utf8)
        }

        static func == (lhs: Self, rhs: Self) -> Bool {
            lhs.bytes == rhs.bytes
        }

        func hash(into hasher: inout Hasher) { hasher.combine(value) }
    }

    private struct SearchFields: Hashable {
        let ruleID: String
        let title: String
        let message: String
        let path: String
        let displayPath: String
        let recommendation: String

        init(_ finding: Finding) {
            ruleID = finding.ruleId
            title = finding.title
            message = finding.message
            path = finding.location.path
            displayPath = finding.location.displayPath
            recommendation = finding.recommendation
        }

        var normalized: String {
            [ruleID, title, message, path, displayPath, recommendation]
                .joined(separator: "\n").lowercased()
        }
    }
}

/// Inventory has a deliberately narrower search contract than the global review queue.
struct InventorySearchIndex {
    struct Entry {
        let item: InventoryItem
        let text: String
        let findingTextIDs: [Int]
        let severities: Set<Severity>
    }

    let entries: [Entry]
    let positionsByType: [InventoryType: [Int]]
    let findingTexts: [String]

    init(inventory: [InventoryItem], byItemID: [String: [Finding]]) {
        var indexed: [Entry] = []
        var texts: [String] = []
        var pool: [Fields: Int] = [:]
        for item in inventory {
            let findings = byItemID[item.id] ?? []
            var textIDs: Set<Int> = []
            for finding in findings {
                let fields = Fields(ruleID: finding.ruleId, title: finding.title, message: finding.message)
                if let existing = pool[fields] {
                    textIDs.insert(existing)
                } else {
                    let position = texts.count
                    texts.append([fields.ruleID, fields.title, fields.message].joined(separator: "\n").lowercased())
                    pool[fields] = position
                    textIDs.insert(position)
                }
            }
            indexed.append(Entry(item: item,
                text: [item.name, item.path, item.displayPath, item.source ?? ""].joined(separator: "\n").lowercased(),
                findingTextIDs: textIDs.sorted(), severities: Set(findings.map(\.severity))))
        }
        var positions: [InventoryType: [Int]] = [:]
        for position in indexed.indices { positions[indexed[position].item.type, default: []].append(position) }
        for type in InventoryType.allCases {
            positions[type] = (positions[type] ?? []).sorted {
                indexed[$0].item.name.localizedStandardCompare(indexed[$1].item.name) == .orderedAscending
            }
        }
        entries = indexed
        positionsByType = positions
        findingTexts = texts
    }

    private struct Fields: Hashable {
        let ruleID: String
        let title: String
        let message: String
    }

    func matchingPositions(query: String) -> Set<Int> {
        let matchingTexts = findingTexts.map { $0.contains(query) }
        return Set(entries.indices.filter { position in
            let entry = entries[position]
            return entry.text.contains(query) || entry.findingTextIDs.contains { matchingTexts[$0] }
        })
    }

    func inventory(for type: InventoryType, matching: Set<Int>?, severity: Severity?) -> [InventoryItem] {
        (positionsByType[type] ?? []).compactMap { position in
            let entry = entries[position]
            if let matching, !matching.contains(position) { return nil }
            if let severity, !entry.severities.contains(severity) { return nil }
            return entry.item
        }
    }
}
