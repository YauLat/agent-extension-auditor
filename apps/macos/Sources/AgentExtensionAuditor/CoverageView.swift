import SwiftUI

struct CoverageBanner: View {
    let report: ScanReport
    let language: AppLanguage
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
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: report.coverage?.status == "complete" ? "scope" : "exclamationmark.triangle")
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.callout.weight(.semibold))
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
        .padding(12)
        .background(.regularMaterial)
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
