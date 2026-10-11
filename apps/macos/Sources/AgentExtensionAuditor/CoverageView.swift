import SwiftUI

struct CoverageBanner: View {
    let report: ScanReport
    let language: AppLanguage
    var request: ScanRequest? = nil
    var freshness: ReportScopeFreshness = .unknown
    let showDetails: () -> Void

    private var title: String {
        switch report.coverage?.status {
        case "complete": language == .zhHant ? "已檢查宣告範圍" : "Declared scope inspected"
        case "partial": language == .zhHant ? "掃描不完整：部分位置未能檢查" : "Scan incomplete: some locations were not inspected"
        case "failed": language == .zhHant ? "掃描不完整：受影響範圍沒有可讀檔案" : "Scan incomplete: no readable files in the affected scope"
        default: language == .zhHant ? "舊版報告：無法確認掃描完整程度" : "Legacy report: coverage unknown"
        }
    }
    private var normal: Bool { report.coverage?.status == "complete" && freshness == .current && request != nil }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if freshness == .previous {
                Label(language == .zhHant ? "範圍已變更 · 下方保留上一份報告，請重新掃描" : "Scope changed · Previous report retained; scan again", systemImage: "exclamationmark.triangle")
                    .font(.system(size: 13, weight: .semibold)).foregroundStyle(Severity.medium.color)
            }
            HStack(alignment: .center, spacing: 8) {
                Circle().fill(normal ? AuditorTheme.accent : Severity.medium.color).frame(width: 6, height: 6)
                Text(title)
                if let coverage = report.coverage {
                    Text(language == .zhHant ? "· 讀取 \(coverage.filesRead) 個檔案" : "· \(coverage.filesRead) files read")
                    if coverage.filesSkipped > 0 || coverage.directoriesSkipped > 0 {
                        Text(language == .zhHant ? "· 未檢查 \(coverage.filesSkipped) · 跳過目錄 \(coverage.directoriesSkipped)" : "· Uninspected \(coverage.filesSkipped) · Subtrees skipped \(coverage.directoriesSkipped)")
                    }
                }
                Text(language == .zhHant ? "· 不代表安全保證" : "· Not a safety guarantee")
                Spacer(minLength: 0)
                Button(language == .zhHant ? "查看範圍" : "View scope", action: showDetails)
                    .buttonStyle(.plain).foregroundStyle(AuditorTheme.accent).underline()
            }.font(.system(size: 12)).foregroundStyle(AuditorTheme.secondary)
            if !normal {
                if let request {
                    Text((language == .zhHant ? "此報告：" : "This report: ") + request.rootURL.path
                         + (request.directPackage ? (language == .zhHant ? " · 套件" : " · Package") : (language == .zhHant ? " · 已安裝擴充" : " · Installed extensions"))
                         + (request.includeHome && !request.directPackage ? " · Home ✓" : " · Home −"))
                        .font(.system(size: 12)).foregroundStyle(AuditorTheme.secondary)
                        .textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
                } else {
                    Text(language == .zhHant ? "無法確認此報告與目前選擇範圍是否一致" : "This report cannot be bound to the currently selected scope")
                        .font(.system(size: 12)).foregroundStyle(AuditorTheme.secondary)
                }
            }
        }.padding(normal ? 0 : 12).frame(maxWidth: .infinity, alignment: .leading)
            .background(normal ? Color.clear : AuditorTheme.inset, in: RoundedRectangle(cornerRadius: 10))
            .help(request?.rootURL.path ?? title)
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
