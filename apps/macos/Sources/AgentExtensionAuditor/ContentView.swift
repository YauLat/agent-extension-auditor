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
            ZStack {
                AuditorCanvas()
                selectedContent
                    .id(store.selectedSection)
                    .transition(.opacity)
            }
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
        .task { await store.scanIfNeeded() }
        .onChange(of: store.selectedSection) { _, _ in
            store.clearFilters()
            store.selectedInventoryID = nil
            store.selectedFindingID = nil
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
        if store.report == nil && store.isScanning {
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
            Button(action: chooseWorkspace) {
                Label(store.workspaceURL.lastPathComponent, systemImage: "folder")
                    .lineLimit(1)
            }
            .help(text(.chooseFolder, language: store.language))

            Toggle(
                text(.includeHome, language: store.language),
                isOn: Binding(
                    get: { store.includeHome },
                    set: { store.setIncludeHome($0) }
                )
            )
            .toggleStyle(.switch)
            .controlSize(.small)
            .help(text(.includeHome, language: store.language))

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
            .disabled(store.isScanning)
            .keyboardShortcut("r", modifiers: .command)
        }
    }

    private func chooseWorkspace() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        panel.canCreateDirectories = false
        panel.directoryURL = store.workspaceURL
        panel.prompt = text(.chooseFolder, language: store.language)

        guard panel.runModal() == .OK, let url = panel.url else { return }
        store.workspaceURL = url
        Task { await store.scan() }
    }
}
