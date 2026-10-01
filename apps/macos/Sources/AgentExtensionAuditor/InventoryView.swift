import SwiftUI

struct InventoryView: View {
    @EnvironmentObject private var store: AuditStore
    @State private var presentDetailAsSheet = false
    let type: InventoryType

    private var items: [InventoryItem] { store.inventory(for: type) }
    private var selectedItem: InventoryItem? {
        guard let id = store.selectedInventoryID else { return nil }
        return store.report?.inventory.first(where: { $0.id == id })
    }

    var body: some View {
        ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    PageHeader(
                        title: type.label(language: store.language),
                        subtitle: "\(items.count.formatted()) / \(store.inventoryCount(for: type).formatted())",
                        symbol: type.symbol
                    )

                    SeverityFilterBar()

                    if items.isEmpty {
                        EmptyStateView(
                            title: text(.noItems, language: store.language),
                            detail: text(.noItemsDetail, language: store.language),
                            symbol: type.symbol
                        )
                        .frame(minHeight: 360)
                    } else {
                        GlassGroup {
                            LazyVGrid(
                                columns: [GridItem(.adaptive(minimum: 280, maximum: 420), spacing: 16)],
                                spacing: 16
                            ) {
                                ForEach(items) { item in
                                    InventoryCard(
                                        item: item,
                                        findings: store.findings(for: item),
                                        language: store.language,
                                        selected: store.selectedInventoryID == item.id
                                    ) {
                                        presentDetailAsSheet = store.windowWidth < 1_100
                                        store.selectedInventoryID = item.id
                                    }
                                }
                            }
                        }
                    }
                }
                .padding(28)
                .frame(maxWidth: 1440, alignment: .leading)
        }
        .searchable(text: $store.searchText, prompt: text(.searchPlaceholder, language: store.language))
        .onChange(of: store.windowWidth) { _, width in
            guard selectedItem != nil else { return }
            presentDetailAsSheet = width < 1_100
        }
        .inspector(isPresented: inspectorBinding) {
            if let selectedItem {
                InventoryDetailView(item: selectedItem)
                    .environmentObject(store)
                    .inspectorColumnWidth(min: 320, ideal: 380, max: 460)
            }
        }
        .sheet(isPresented: sheetBinding) {
            if let selectedItem {
                InventoryDetailView(item: selectedItem)
                    .environmentObject(store)
                    .frame(minWidth: 520, minHeight: 560)
            }
        }
    }

    private var inspectorBinding: Binding<Bool> {
        Binding(
            get: { selectedItem != nil && !presentDetailAsSheet },
            set: { if !$0 && !presentDetailAsSheet { store.selectedInventoryID = nil } }
        )
    }

    private var sheetBinding: Binding<Bool> {
        Binding(
            get: { selectedItem != nil && presentDetailAsSheet },
            set: { if !$0 && presentDetailAsSheet { store.selectedInventoryID = nil } }
        )
    }
}

private struct InventoryCard: View {
    let item: InventoryItem
    let findings: [Finding]
    let language: AppLanguage
    let selected: Bool
    let action: () -> Void

    private var highestSeverity: Severity? {
        findings.map(\.severity).min(by: { $0.rank < $1.rank })
    }

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top) {
                    Image(systemName: item.type.symbol)
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundStyle(AuditorTheme.accent)
                        .frame(width: 42, height: 42)
                        .background(AuditorTheme.accent.opacity(0.12), in: RoundedRectangle(cornerRadius: 7))
                    Spacer()
                    if let highestSeverity {
                        SeverityBadge(severity: highestSeverity, language: language)
                    } else {
                        Image(systemName: item.hasIncompleteEvidence ? "exclamationmark.circle" : "text.magnifyingglass")
                            .foregroundStyle(item.hasIncompleteEvidence ? Severity.medium.color : .secondary)
                            .help(text(item.metadata?.parseError != nil ? .parseIncomplete :
                                (item.hasIncompleteEvidence ? .limitedCoverage : .noReportedFindings), language: language))
                    }
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text(item.name)
                        .font(.headline)
                        .lineLimit(2)
                    if let source = item.source, !source.isEmpty {
                        Text(source)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }

                VStack(alignment: .leading, spacing: 6) {
                    if item.type == .mcpServer {
                        ConfigurationPill(enabled: item.metadata?.configuredEnabled, language: language)
                    }
                    if item.hasIncompleteEvidence {
                        StatusPill(
                            title: text(item.metadata?.parseError != nil ? .parseIncomplete : .limitedCoverage, language: language),
                            symbol: "exclamationmark.circle.fill", color: Severity.medium.color
                        )
                    }
                    if item.metadata?.pluginId != nil {
                        StatusPill(title: text(.bundledSkill, language: language), symbol: "shippingbox", color: AuditorTheme.accent)
                    }
                }

                Spacer(minLength: 0)

                HStack(alignment: .bottom, spacing: 8) {
                    Text(item.displayPath)
                        .font(.caption2.monospaced())
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                    Spacer(minLength: 8)
                    Label(findings.count.formatted(), systemImage: "exclamationmark.bubble")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(highestSeverity?.color ?? .secondary)
                        .fixedSize()
                }
            }
            .padding(18)
            .frame(minHeight: 198, alignment: .topLeading)
            .contentShape(Rectangle())
            .auditorGlass(tint: highestSeverity?.color ?? AuditorTheme.accent)
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(selected ? AuditorTheme.accent : Color.clear, lineWidth: 2)
            )
        }
        .buttonStyle(AuditorCardButtonStyle())
    }
}

private struct InventoryDetailView: View {
    @EnvironmentObject private var store: AuditStore
    let item: InventoryItem

    private var findings: [Finding] { store.findings(for: item) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HStack(alignment: .top) {
                    Image(systemName: item.type.symbol)
                        .font(.title2.weight(.semibold))
                        .foregroundStyle(AuditorTheme.accent)
                    Spacer()
                    Button {
                        store.selectedInventoryID = nil
                    } label: {
                        Image(systemName: "xmark")
                    }
                    .buttonStyle(.borderless)
                    .help(text(.close, language: store.language))
                }

                Text(item.name)
                    .font(.title3.weight(.bold))
                    .textSelection(.enabled)

                if let source = item.source, !source.isEmpty {
                    DetailField(title: text(.source, language: store.language), value: source)
                }

                DetailField(
                    title: text(.location, language: store.language),
                    value: item.displayPath,
                    monospaced: true
                )

                Button {
                    store.copyPath(item.path)
                } label: {
                    Label(text(.copyPath, language: store.language), systemImage: "doc.on.doc")
                }

                Divider()
                VStack(alignment: .leading, spacing: 12) {
                    if item.type == .mcpServer {
                        Text(text(.configurationState, language: store.language))
                            .font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                        ConfigurationPill(enabled: item.metadata?.configuredEnabled, language: store.language)
                        Text(text(.runtimeUnverified, language: store.language))
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    if item.metadata?.parseError != nil {
                        EvidenceNotice(title: text(.parseIncomplete, language: store.language),
                                       detail: text(.parseIncompleteDetail, language: store.language))
                    }
                    if item.metadata?.coverage != nil {
                        EvidenceNotice(title: text(.limitedCoverage, language: store.language),
                                       detail: text(.limitedCoverageDetail, language: store.language))
                    }
                    if item.metadata?.pluginId != nil {
                        if let owner = item.owningPlugin(in: store.report?.inventory ?? []) {
                            DetailField(title: text(.owningPlugin, language: store.language), value: owner.name)
                            Text(owner.displayPath).font(.caption.monospaced()).foregroundStyle(.secondary)
                                .textSelection(.enabled)
                        } else {
                            DetailField(title: text(.owningPlugin, language: store.language),
                                        value: text(.ownerUnresolved, language: store.language))
                        }
                    }
                    if item.metadata == nil {
                        Text(text(.metadataUnavailable, language: store.language))
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }

                SectionTitle(
                    title: text(.findingsForItem, language: store.language),
                    detail: findings.count.formatted()
                )

                if findings.isEmpty {
                    HStack(spacing: 9) {
                        Image(systemName: "text.magnifyingglass")
                            .foregroundStyle(.secondary)
                        Text(text(.noReportedFindings, language: store.language))
                            .font(.subheadline.weight(.medium))
                    }
                } else {
                    LazyVStack(spacing: 10) {
                        ForEach(findings) { finding in
                            VStack(alignment: .leading, spacing: 7) {
                                SeverityBadge(severity: finding.severity, language: store.language)
                                Text(finding.ruleId)
                                    .font(.caption.monospaced().weight(.semibold))
                                Text(finding.title)
                                    .font(.subheadline.weight(.semibold))
                                Text(finding.message)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(3)
                            }
                            .padding(12)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .auditorGlass(tint: finding.severity.color)
                        }
                    }
                }
            }
            .padding(20)
        }
    }
}
