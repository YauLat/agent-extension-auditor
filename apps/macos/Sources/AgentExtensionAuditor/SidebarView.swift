import SwiftUI

struct SidebarView: View {
    @EnvironmentObject private var store: AuditStore
    @State private var inventoryExpanded = false
    private var chinese: Bool { store.language == .zhHant }
    private var inventorySelected: Bool {
        if case .inventory = store.selectedSection { return true }
        return false
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 28) {
            brand
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    VStack(alignment: .leading, spacing: 5) {
                        groupLabel(chinese ? "檢視工作區" : "Review workspace")
                        sidebarRow(.overview, symbol: "square.grid.2x2")
                        sidebarRow(.findings, symbol: "list.bullet")
                        Button { store.selectedSection = .inventory(.skill) } label: {
                            rowLabel(title: text(.inventory, language: store.language), symbol: "shippingbox",
                                     count: store.report?.summary.inventory.total, selected: inventorySelected)
                        }.buttonStyle(.plain)
                            .accessibilityAddTraits(inventorySelected ? .isSelected : [])
                        DisclosureGroup(isExpanded: $inventoryExpanded) {
                            VStack(spacing: 4) {
                                ForEach(InventoryType.allCases) { type in sidebarRow(.inventory(type), symbol: type.symbol) }
                            }.padding(.top, 6)
                        } label: {
                            Text(chinese ? "資產分類" : "Asset categories").font(.system(size: 11)).foregroundStyle(AuditorTheme.secondary)
                        }.padding(.horizontal, 12).padding(.top, 6)
                    }
                    VStack(alignment: .leading, spacing: 5) {
                        groupLabel(chinese ? "工具與範圍" : "Tools and scope")
                        sidebarRow(.locations, symbol: "folder")
                        sidebarRow(.settings, symbol: "gearshape")
                    }
                }
            }
            privacyFooter
        }.padding(.horizontal, store.windowWidth < 1_150 ? 12 : 16)
            .padding(.top, 28).padding(.bottom, 18)
            .background(AuditorTheme.sidebar)
            .onChange(of: store.selectedSection) { _, _ in
                inventoryExpanded = inventorySelected
            }
    }

    private var brand: some View {
        HStack(spacing: 10) {
            Image(systemName: "checkmark.shield")
                .font(.system(size: 19))
                .foregroundStyle(AuditorTheme.accentText)
                .frame(width: 36, height: 38)
                .background(AuditorTheme.accentFill, in: RoundedRectangle(cornerRadius: 11))
            VStack(alignment: .leading, spacing: 4) {
                Text("Agent Auditor").font(.system(size: 17, weight: .semibold))
                    .lineLimit(1).minimumScaleFactor(0.9)
                Text(chinese ? "本機擴充檢視工具" : "Local extension review")
                    .font(.system(size: 11)).foregroundStyle(AuditorTheme.secondary)
                    .lineLimit(1).minimumScaleFactor(0.85)
            }
        }.padding(.horizontal, store.windowWidth < 1_150 ? 3 : 9)
    }

    private func groupLabel(_ title: String) -> some View {
        Text(title).font(.system(size: 11)).foregroundStyle(AuditorTheme.secondary)
            .padding(.horizontal, 12).padding(.bottom, 3)
    }

    private func sidebarRow(_ section: SidebarSection, symbol: String) -> some View {
        Button { store.selectedSection = section } label: {
            rowLabel(title: section.label(language: store.language), symbol: symbol,
                     count: store.sectionCount(section), selected: section == store.selectedSection)
        }.buttonStyle(.plain).accessibilityAddTraits(section == store.selectedSection ? .isSelected : [])
    }

    private func rowLabel(title: String, symbol: String, count: Int?, selected: Bool) -> some View {
        HStack(spacing: 10) {
            Image(systemName: symbol).font(.system(size: 17)).frame(width: 20)
            Text(title).font(.system(size: 14, weight: selected ? .semibold : .regular))
            Spacer(minLength: 0)
            if let count {
                Text(count.formatted()).font(.system(size: 12)).monospacedDigit()
                    .padding(.horizontal, 7).padding(.vertical, 2)
                    .background(AuditorTheme.surface.opacity(0.6), in: RoundedRectangle(cornerRadius: 6))
            }
        }.foregroundStyle(selected ? AuditorTheme.accentText : AuditorTheme.secondary)
            .padding(.horizontal, 12).frame(minHeight: 42)
            .background(selected ? AuditorTheme.accentFill : Color.clear, in: RoundedRectangle(cornerRadius: 10))
            .contentShape(Rectangle())
    }

    private var privacyFooter: some View {
        VStack(alignment: .leading, spacing: 4) {
            Label(text(.localOnly, language: store.language), systemImage: "checkmark.shield")
                .font(.system(size: 12, weight: .semibold))
            Text(chinese ? "不執行擴充 · 不上傳檔案" : "No extension execution · No upload")
                .font(.system(size: 11)).foregroundStyle(AuditorTheme.secondary)
        }.frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 10).padding(.top, 16)
            .overlay(alignment: .top) { Rectangle().fill(AuditorTheme.border).frame(height: 1) }
    }
}
