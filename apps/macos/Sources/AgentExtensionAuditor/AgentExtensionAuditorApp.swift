import SwiftUI

@main
struct AgentExtensionAuditorApp: App {
    @StateObject private var store = AuditStore()

    var body: some Scene {
        WindowGroup(text(.appName, language: store.language)) {
            ContentView()
                .environmentObject(store)
                .tint(AuditorTheme.accent)
        }
        .defaultSize(width: 1280, height: 820)
        .windowToolbarStyle(.unified)
        .commands {
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
