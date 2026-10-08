import SwiftUI

struct SidebarView: View {
    @EnvironmentObject private var store: AuditStore

    var body: some View {
        VStack(spacing: 0) {
            brand
            List(selection: $store.selectedSection) {
                Section {
                    sidebarRow(.overview)
                    sidebarRow(.findings)
                }

                Section(text(.inventory, language: store.language)) {
                    ForEach(InventoryType.allCases) { type in
                        sidebarRow(.inventory(type))
                    }
                }

                Section {
                    sidebarRow(.locations)
                    sidebarRow(.settings)
                }
            }
            .listStyle(.sidebar)

            privacyFooter
        }
        .background(AuditorTheme.canvas)
    }

    private var brand: some View {
        HStack(spacing: 12) {
            Image(systemName: "shield.lefthalf.filled.badge.checkmark")
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(AuditorTheme.accent)
                .frame(width: 42, height: 42)
                .auditorGlass(tint: AuditorTheme.accent)
            VStack(alignment: .leading, spacing: 2) {
                Text("AGENT AUDITOR")
                    .font(.headline.weight(.bold))
                Text(store.language == .zhHant ? "本機擴充檢視" : "LOCAL EXTENSION REVIEW")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.top, 18)
        .padding(.bottom, 12)
    }

    private func sidebarRow(_ section: SidebarSection) -> some View {
        Label {
            HStack {
                Text(section.label(language: store.language))
                Spacer()
                if let count = store.sectionCount(section) {
                    Text(count.formatted())
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(.quaternary, in: Capsule())
                }
            }
        } icon: {
            Image(systemName: section.symbol)
                .foregroundStyle(section == store.selectedSection ? Color.primary : .secondary)
        }
        .tag(section)
    }

    private var privacyFooter: some View {
        HStack(spacing: 8) {
            Image(systemName: "lock.fill")
                .foregroundStyle(Color(red: 0.18, green: 0.52, blue: 0.28))
            VStack(alignment: .leading, spacing: 1) {
                Text(text(.localOnly, language: store.language))
                    .font(.caption.weight(.semibold))
                Text(text(.noTelemetry, language: store.language))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding(14)
        .overlay(alignment: .top) { Divider() }
    }
}
