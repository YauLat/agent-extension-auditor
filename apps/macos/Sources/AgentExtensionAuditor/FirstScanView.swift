import SwiftUI

struct FirstScanView: View {
    @EnvironmentObject private var store: AuditStore
    private var chinese: Bool { store.language == .zhHant }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                PageHeader(
                    title: chinese ? "開始你的第一次檢視" : "Start your first review",
                    subtitle: chinese ? "選擇範圍 → 掃描 → 檢視證據 → 比較基準" : "Choose scope → Scan → Review evidence → Compare baseline",
                    symbol: "shield.lefthalf.filled"
                )
                PrivacyStrip(language: store.language)
                VStack(alignment: .leading, spacing: 14) {
                    Text(chinese ? "1. 選擇要檢查的資料夾" : "1. Choose a folder to inspect").font(.headline)
                    HStack {
                        Text(store.workspaceURL.path).font(.callout).textSelection(.enabled).lineLimit(2)
                        Spacer()
                        Button(text(.chooseFolder, language: store.language), action: store.chooseWorkspace)
                    }
                    Divider()
                    Text(chinese ? "2. 選擇掃描方式" : "2. Choose the scan scope").font(.headline)
                    Picker(chinese ? "掃描方式" : "Scan scope", selection: $store.directPackage) {
                        Text(chinese ? "已安裝的擴充" : "Installed extensions").tag(false)
                        Text(chinese ? "下載的套件／技能庫" : "Downloaded package / skill library").tag(true)
                    }.pickerStyle(.segmented)
                    Text(store.directPackage
                         ? (chinese ? "檢查所選資料夾內支援的文件與腳本；不包含個人目錄，不執行套件。" : "Inspect supported documents and scripts in this folder. Excludes Home and never executes the package.")
                         : (chinese ? "尋找工作區內支援的 agent 設定、技能和外掛。可選擇一併檢查個人目錄。" : "Discover supported agent configurations, skills and plugins in the workspace. Optionally include Home."))
                        .font(.callout).foregroundStyle(.secondary)
                    Toggle(text(.includeHome, language: store.language), isOn: Binding(
                        get: { store.includeHome && !store.directPackage }, set: { store.setIncludeHome($0) }
                    )).disabled(store.directPackage)
                }.padding(20).auditorGlass()
                HStack {
                    Button { Task { await store.scan() } } label: {
                        Label(chinese ? "開始掃描" : "Start scan", systemImage: "magnifyingglass")
                    }.buttonStyle(.borderedProminent).controlSize(.large)
                    Text(chinese ? "完成後先檢視優先項目；基準只記錄人工檢視，不代表安全認證。" : "Review priority findings first. A baseline records manual review, not a safety certification.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                if store.runtimeStatus.nodeURL == nil || store.runtimeStatus.scannerURL == nil {
                    HStack {
                        Text(chinese ? "尚未找到掃描引擎或 Node.js。需要 Node.js 20+。" : "Scanner or Node.js was not found. Node.js 20+ is required.")
                        Button(chinese ? "檢查引擎設定" : "Check engine settings") { store.selectedSection = .settings }
                    }.font(.callout)
                }
            }.padding(28).frame(maxWidth: 1100, alignment: .leading)
        }
    }
}
