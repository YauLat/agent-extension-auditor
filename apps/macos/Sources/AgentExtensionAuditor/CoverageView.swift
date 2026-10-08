import SwiftUI

struct CoverageBanner: View {
    let report: ScanReport
    let language: AppLanguage
    var request: ScanRequest? = nil
    var freshness: ReportScopeFreshness = .unknown
    let showDetails: () -> Void

    private var title: String {
        switch report.coverage?.status {
        case "complete": language == .zhHant ? "已檢查宣告範圍；不代表安全保證" : "Declared scope inspected; not a safety guarantee"
        case "partial": language == .zhHant ? "掃描不完整：部分位置未能檢查" : "Scan incomplete: some locations were not inspected"
        case "failed": language == .zhHant ? "掃描不完整：受影響範圍沒有可讀檔案" : "Scan incomplete: no readable files in the affected scope"
        default: language == .zhHant ? "舊版報告：無法確認掃描完整程度" : "Legacy report: coverage unknown"
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if freshness == .previous {
                Label(language == .zhHant ? "範圍已變更 · 下方保留上一份報告，請重新掃描" : "Scope changed · Previous report retained; scan again", systemImage: "exclamationmark.triangle")
                    .font(.callout.weight(.semibold)).foregroundStyle(Severity.medium.color)
            }
            HStack(alignment: .top, spacing: 12) {
            Image(systemName: report.coverage?.status == "complete" ? "scope" : "exclamationmark.triangle")
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.callout.weight(.semibold))
                if let request {
                    Text((language == .zhHant ? "此報告：" : "This report: ") + request.rootURL.path
                         + (request.directPackage ? (language == .zhHant ? " · 套件" : " · Package") : (language == .zhHant ? " · 已安裝擴充" : " · Installed extensions"))
                         + (request.includeHome && !request.directPackage ? " · Home ✓" : " · Home −"))
                        .font(.caption).foregroundStyle(AuditorTheme.secondary).lineLimit(1).truncationMode(.middle)
                        .help(request.rootURL.path)
                } else {
                    Text(language == .zhHant ? "無法確認此報告與目前選擇範圍是否一致" : "This report cannot be bound to the currently selected scope")
                        .font(.caption).foregroundStyle(AuditorTheme.secondary)
                }
                if let coverage = report.coverage {
                    Text(language == .zhHant
                         ? "已讀取 \(coverage.filesRead) 個檔案 · 未檢查 \(coverage.filesSkipped) 個檔案 · 跳過 \(coverage.directoriesSkipped) 個子目錄"
                         : "\(coverage.filesRead) files read · \(coverage.filesSkipped) files uninspected · \(coverage.directoriesSkipped) subtrees skipped")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            Spacer()
            Button(language == .zhHant ? "查看範圍" : "View scope", action: showDetails)
            }
        }
        .padding(.horizontal, 24).padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AuditorTheme.surface)
        .overlay(alignment: .bottom) { Divider() }
    }
}

struct CoverageDetails: View {
    let coverage: ScanCoverage
    let language: AppLanguage

    var body: some View {
        DisclosureGroup(language == .zhHant ? "掃描範圍及未檢查原因" : "Scope and coverage diagnostics") {
            ScrollView {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Home: \(coverage.scope.includeHome ? "included" : "excluded") · \(coverage.scope.maxFileBytes) bytes · depth \(coverage.scope.maxDepth)")
                    Text("Include: \(coverage.scope.includePaths.joined(separator: ", "))")
                    Text("Exclude: \(coverage.scope.excludePaths.joined(separator: ", "))")
                    Text("Default exclusions: \(coverage.scope.defaultExcludedDirectories.joined(separator: ", "))")
                    ForEach(coverage.diagnostics) { diagnostic in
                        VStack(alignment: .leading, spacing: 3) {
                            Text("\(diagnostic.code): \(diagnostic.displayPath)").font(.caption.monospaced())
                            Text(diagnostic.message).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .textSelection(.enabled)
            }
            .frame(maxHeight: 260)
        }
        .padding(.horizontal, 24)
    }
}
