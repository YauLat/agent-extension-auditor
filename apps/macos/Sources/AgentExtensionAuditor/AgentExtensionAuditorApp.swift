import SwiftUI

@main
struct AgentExtensionAuditorApp: App {
    @StateObject private var store = AuditStore()
    @FocusedValue(\.dashboardSearchFocus) private var searchFocus: Binding<Bool>?

    var body: some Scene {
        WindowGroup(text(.appName, language: store.language)) {
            ContentView()
                .environmentObject(store)
                .tint(AuditorTheme.accent)
        }
        .defaultSize(width: 1280, height: 820)
        .windowToolbarStyle(.unifiedCompact)
        .commands {
            CommandGroup(after: .textEditing) {
                Button(store.language == .zhHant ? "搜尋" : "Search") { searchFocus?.wrappedValue = true }
                    .keyboardShortcut("f", modifiers: .command)
                    .disabled(searchFocus == nil)
            }
            CommandGroup(after: .newItem) {
                Button(text(.scanNow, language: store.language)) {
                    Task { await store.scan() }
                }
                .keyboardShortcut("r", modifiers: .command)
                .disabled(store.isScanning || store.baselineBusy)
            }
        }
    }
}
