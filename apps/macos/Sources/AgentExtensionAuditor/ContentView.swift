import AppKit
import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var store: AuditStore
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        NavigationSplitView {
            SidebarView()
                .navigationSplitViewColumnWidth(min: 220, ideal: 260, max: 300)
        } detail: {
            VStack(spacing: 0) {
                if let started = store.scanStartedAt {
                    TimelineView(.periodic(from: started, by: 1)) { context in
                        Text(store.language == .zhHant ? "正在讀取及檢查本機檔案 · 已用 \(Int(context.date.timeIntervalSince(started))) 秒" : "Reading and reviewing local files · \(Int(context.date.timeIntervalSince(started))) seconds elapsed")
                            .font(.caption).padding(8)
                    }
                } else if !store.scanMessage.isEmpty {
                    Text(store.scanMessage).font(.caption).padding(8)
                }
                if let report = store.report {
                    CoverageBanner(report: report, language: store.language) {
                        store.selectedSection = .locations
                    }
                }
                selectedContent
                    .id(store.selectedSection)
                    .transition(.opacity)
            }
            .background { AuditorCanvas() }
            .animation(reduceMotion ? nil : .easeInOut(duration: 0.18), value: store.selectedSection)
            .toolbar { toolbarContent }
        }
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

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItemGroup(placement: .primaryAction) {
            Button(action: store.chooseWorkspace) {
                Label(store.workspaceURL.lastPathComponent, systemImage: "folder")
                    .lineLimit(1)
            }
            .help(text(.chooseFolder, language: store.language))
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
                Label(store.language.displayName, systemImage: "globe")
            }

            if store.isScanning {
                Button(store.language == .zhHant ? "取消掃描" : "Cancel scan", action: store.cancelScan)
            }

            Button {
                Task { await store.scan() }
            } label: {
                if store.isScanning {
                    ProgressView()
                        .controlSize(.small)
                        .frame(width: 18, height: 18)
                } else {
                    Label(text(.scanNow, language: store.language), systemImage: "arrow.clockwise")
                }
            }
            .disabled(store.isScanning || store.baselineBusy || store.findingReviewBusy)
            .keyboardShortcut("r", modifiers: .command)
        }
    }

}
