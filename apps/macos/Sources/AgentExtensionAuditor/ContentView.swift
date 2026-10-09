import AppKit
import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var store: AuditStore
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var darkDisplay = false

    var body: some View {
        HStack(spacing: 0) {
            SidebarView()
                .frame(width: store.windowWidth < 1_150 ? 196 : 224)
            Rectangle().fill(AuditorTheme.border).frame(width: 1)
            VStack(spacing: 0) {
                workspaceHeader
                if let started = store.scanStartedAt {
                    TimelineView(.periodic(from: started, by: 1)) { context in
                        Text(store.language == .zhHant ? "正在讀取及檢查本機檔案 · 已用 \(Int(context.date.timeIntervalSince(started))) 秒" : "Reading and reviewing local files · \(Int(context.date.timeIntervalSince(started))) seconds elapsed")
                            .font(.caption).padding(8)
                    }
                } else if !store.scanMessage.isEmpty {
                    Text(store.scanMessage).font(.caption).padding(8)
                }
                if let report = store.report, store.selectedSection != .overview {
                    CoverageBanner(report: report, language: store.language, request: store.reportRequest, freshness: store.reportScopeFreshness) {
                        store.selectedSection = .locations
                    }
                }
                selectedContent
                    .id(store.selectedSection)
                    .transition(.opacity)
            }
            .background { AuditorCanvas() }
            .animation(reduceMotion ? nil : .easeInOut(duration: 0.18), value: store.selectedSection)
        }
        .preferredColorScheme(darkDisplay ? .dark : .light)
        .foregroundStyle(AuditorTheme.primary)
        .frame(minWidth: 940, minHeight: 660)
        .background {
            GeometryReader { proxy in
                Color.clear
                    .onAppear { store.setWindowWidth(proxy.size.width) }
                    .onChange(of: proxy.size.width) { _, newWidth in
                        store.setWindowWidth(newWidth)
                    }
            }
        }
        .onChange(of: store.selectedSection) { _, newSection in
            store.clearFilters()
            store.selectedInventoryID = nil
            if newSection != .findings { store.selectedFindingID = nil }
        }
        .sheet(item: $store.activeRepairFinding) { finding in
            GuidedRepairSheet(finding: finding)
                .environmentObject(store)
                .frame(minWidth: 620, minHeight: 620)
        }
        .alert(
            text(.scanFailed, language: store.language),
            isPresented: Binding(
                get: { store.lastError != nil },
                set: { if !$0 { store.lastError = nil } }
            )
        ) {
            Button("OK") { store.lastError = nil }
        } message: {
            Text(store.localizedError())
        }
    }

    @ViewBuilder
    private var selectedContent: some View {
        if store.report == nil && store.isScanning && store.selectedSection != .settings {
            LoadingStateView(language: store.language)
        } else {
            switch store.selectedSection {
            case .overview:
                OverviewView()
            case .findings:
                FindingsView()
            case .inventory(let type):
                InventoryView(type: type)
            case .locations:
                LocationsView()
            case .settings:
                SettingsView()
            }
        }
    }

    private var workspaceHeader: some View {
        HStack(spacing: 12) {
            Button(action: store.chooseWorkspace) {
                HStack(spacing: 10) {
                    Image(systemName: "folder").font(.system(size: 19))
                    VStack(alignment: .leading, spacing: 3) {
                        Text(store.workspaceURL.lastPathComponent).font(.system(size: 14, weight: .medium)).lineLimit(1)
                        Text(store.directPackage
                             ? (store.language == .zhHant ? "下載的套件／技能庫 · 個人目錄已排除" : "Downloaded package / skill library · Home excluded")
                             : (store.language == .zhHant ? "已安裝的擴充" : "Installed extensions"))
                            .font(.system(size: 11)).foregroundStyle(AuditorTheme.secondary).lineLimit(1)
                    }
                }.frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .help(text(.chooseFolder, language: store.language) + "\n" + store.workspaceURL.path)
            .disabled(store.isScanning || store.baselineBusy || store.findingReviewBusy)

            Toggle(
                text(.includeHome, language: store.language),
                isOn: Binding(
                    get: { store.includeHome && !store.directPackage },
                    set: { store.setIncludeHome($0) }
                )
            )
            .toggleStyle(.switch)
            .controlSize(.small)
            .help(text(.includeHome, language: store.language))
            .disabled(store.directPackage || store.isScanning || store.baselineBusy || store.findingReviewBusy)

            Button(store.language == .zhHant ? (darkDisplay ? "淺色顯示" : "深色顯示") : (darkDisplay ? "Light display" : "Dark display")) {
                darkDisplay.toggle()
            }.buttonStyle(AuditorQuietButtonStyle())

            Menu {
                ForEach(AppLanguage.allCases) { language in
                    Button {
                        store.setLanguage(language)
                    } label: {
                        if language == store.language {
                            Label(language.displayName, systemImage: "checkmark")
                        } else {
                            Text(language.displayName)
                        }
                    }
                }
            } label: {
                Image(systemName: "globe").font(.system(size: 17))
            }.menuStyle(.borderlessButton).fixedSize()
                .accessibilityLabel(store.language == .zhHant ? "語言" : "Language")

            if store.isScanning {
                Button(store.language == .zhHant ? "取消掃描" : "Cancel scan", action: store.cancelScan)
                    .buttonStyle(AuditorQuietButtonStyle())
            }

            Button {
                Task { await store.scan() }
            } label: {
                if store.isScanning {
                    ProgressView()
                        .controlSize(.small)
                        .frame(width: 18, height: 18)
                } else {
                    Text(text(.scanNow, language: store.language))
                }
            }.buttonStyle(AuditorQuietButtonStyle())
            .disabled(store.isScanning || store.baselineBusy || store.findingReviewBusy)
            .keyboardShortcut("r", modifiers: .command)
        }.padding(.horizontal, store.windowWidth < 1_150 ? 22 : 28)
            .frame(height: 67)
            .background(AuditorTheme.canvas)
            .overlay(alignment: .bottom) { Rectangle().fill(AuditorTheme.border).frame(height: 1) }
    }

}
