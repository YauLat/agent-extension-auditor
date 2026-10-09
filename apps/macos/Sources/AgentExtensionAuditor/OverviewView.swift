import SwiftUI

struct OverviewView: View {
    @EnvironmentObject private var store: AuditStore
    private var chinese: Bool { store.language == .zhHant }

    var body: some View {
        if let report = store.report {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    HStack(alignment: .center) {
                        PageHeader(title: chinese ? "檢視總覽" : "Review overview",
                                   subtitle: chinese ? "先查看需要審閱的項目，再比較擴充的變更。" : "Review items needing attention, then compare extension changes.",
                                   symbol: "square.grid.2x2")
                        Text(formattedComparisonDate(report.generatedAt))
                            .font(.system(size: 11)).foregroundStyle(AuditorTheme.secondary)
                            .padding(.horizontal, 8).padding(.vertical, 4)
                            .background(AuditorTheme.inset, in: RoundedRectangle(cornerRadius: 6))
                    }
                    CoverageBanner(report: report, language: store.language, request: store.reportRequest, freshness: store.reportScopeFreshness) {
                        store.selectedSection = .locations
                    }
                    HStack(spacing: 0) {
                        summaryMetric(chinese ? "已發現資產" : "Discovered assets", count: report.summary.inventory.total, caption: inventoryCaption(report))
                        Rectangle().fill(AuditorTheme.border).frame(width: 1, height: 82)
                        summaryMetric(chinese ? "風險發現" : "Risk findings", count: report.summary.findings.total,
                                      caption: chinese ? "嚴重 \(report.summary.findings.critical.formatted()) · 其他 \((report.summary.findings.total - report.summary.findings.critical).formatted())"
                                          : "Critical \(report.summary.findings.critical.formatted()) · Other \((report.summary.findings.total - report.summary.findings.critical).formatted())")
                        Rectangle().fill(AuditorTheme.border).frame(width: 1, height: 82)
                        summaryMetric(chinese ? "待人工審閱" : "Awaiting review", count: store.dispositionCounts.needsReview,
                                      caption: (chinese ? "已審閱 " : "Reviewed ") + store.dispositionCounts.reviewed.formatted())
                    }.padding(.vertical, 20).auditorGlass()
                    if store.windowWidth >= 1_150 {
                        HStack(alignment: .top, spacing: 20) {
                            mainColumn(report).frame(maxWidth: .infinity)
                            actionRail(report).frame(width: 286)
                        }
                    } else {
                        mainColumn(report)
                        actionRail(report)
                    }
                }.padding(store.windowWidth < 1_150 ? 22 : 28).frame(maxWidth: 1510, alignment: .leading)
            }.scrollIndicators(.hidden)
        } else { FirstScanView() }
    }

    private func inventoryCaption(_ report: ScanReport) -> String {
        InventoryType.allCases.compactMap { type in
            let count = report.summary.inventory.count(for: type)
            guard count > 0 else { return nil }
            return chinese ? "\(count.formatted()) 個\(type.label(language: store.language))" : "\(count.formatted()) \(type.label(language: store.language))"
        }.joined(separator: " · ")
    }

    private func summaryMetric(_ title: String, count: Int, caption: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.system(size: 12)).foregroundStyle(AuditorTheme.secondary)
            Text(count.formatted()).font(.system(size: 30, weight: .semibold)).tracking(-0.7).monospacedDigit()
            Text(caption).font(.system(size: 12)).foregroundStyle(AuditorTheme.secondary).lineLimit(2)
        }.padding(.horizontal, 24).frame(maxWidth: .infinity, alignment: .leading)
    }

    private func mainColumn(_ report: ScanReport) -> some View {
        VStack(alignment: .leading, spacing: 20) {
            let priorities = store.prioritizedFindings()
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Text(chinese ? "優先檢視的 \(priorities.count) 項發現" : "\(priorities.count) findings to review first").font(.system(size: 16, weight: .semibold))
                    Spacer()
                    Button(chinese ? "查看全部" : "View all") {
                        store.clearFilters(); store.selectedSection = .findings
                    }.buttonStyle(.plain).font(.system(size: 13)).foregroundStyle(AuditorTheme.accent).underline()
                }
                if priorities.isEmpty {
                    Text(chinese ? "本次報告沒有回報發現；仍需核對掃描範圍及未檢查項目。" : "No findings reported. Check scope and uninspected items before drawing conclusions.")
                        .font(.system(size: 13)).foregroundStyle(AuditorTheme.secondary).padding(.vertical, 12)
                }
                ForEach(priorities) { finding in
                    Button {
                        store.clearFilters(); store.selectedFindingID = finding.id; store.selectedSection = .findings
                    } label: {
                        VStack(alignment: .leading, spacing: 10) {
                            HStack(alignment: .top) {
                                Text(finding.severity.label(language: store.language))
                                    .font(.system(size: 11, weight: .medium)).foregroundStyle(finding.severity.color)
                                    .padding(.horizontal, 8).padding(.vertical, 4)
                                    .background(finding.severity.color.opacity(0.08), in: RoundedRectangle(cornerRadius: 6))
                                Spacer()
                                Text(finding.disposition?.label(language: store.language) ?? FindingDispositionState.needsReview.label(language: store.language))
                                    .font(.system(size: 12)).foregroundStyle(AuditorTheme.secondary)
                            }
                            Text(finding.displayTitle(language: store.language)).font(.system(size: 15, weight: .semibold))
                            Text(assetName(finding, report: report) + " · " + finding.reviewLabel(language: store.language))
                                .font(.system(size: 12)).foregroundStyle(AuditorTheme.secondary)
                            Text(shortLocation(finding)).font(.system(size: 12, design: .monospaced))
                                .foregroundStyle(AuditorTheme.secondary).lineLimit(2).truncationMode(.middle)
                            HStack {
                                Text(chinese ? "查看命中原因、限制及建議" : "View evidence, limits and guidance")
                                    .font(.system(size: 12)).foregroundStyle(AuditorTheme.secondary)
                                Spacer()
                                Image(systemName: "arrow.right").font(.system(size: 17))
                            }.padding(.top, 4)
                        }.multilineTextAlignment(.leading).frame(maxWidth: .infinity, alignment: .leading)
                            .padding(16).background(AuditorTheme.surface, in: RoundedRectangle(cornerRadius: 12))
                            .overlay(RoundedRectangle(cornerRadius: 12).stroke(AuditorTheme.border, lineWidth: 1))
                            .contentShape(Rectangle())
                    }.buttonStyle(AuditorCardButtonStyle()).help(finding.title + "\n" + finding.location.path)
                }
                Text(store.canFilterChanges
                     ? (chinese ? "新增及修改優先；完整風險仍保留。先看證據，再作決定。" : "New and changed assets come first. All risks remain; review evidence before deciding.")
                     : (chinese ? "先查看命中原因和檔案位置，再決定是否接受風險。掃描不會執行這個擴充。" : "Review evidence and location before accepting risk. Scanning never executes the extension."))
                    .font(.system(size: 12)).foregroundStyle(AuditorTheme.secondary)
                    .padding(14).frame(maxWidth: .infinity, alignment: .leading)
                    .background(AuditorTheme.inset, in: RoundedRectangle(cornerRadius: 10))
            }.padding(20).auditorGlass()

            VStack(alignment: .leading, spacing: 0) {
                SectionTitle(title: chinese ? "完整風險分佈" : "Full risk distribution",
                             detail: (chinese ? "總數 " : "Total ") + report.summary.findings.total.formatted())
                    .padding(.bottom, 18)
                ForEach(Severity.allCases) { severity in
                    HStack {
                        if report.summary.findings.count(for: severity) > 0 {
                            Text(severity.label(language: store.language)).font(.system(size: 11, weight: .medium))
                                .foregroundStyle(severity.color).padding(.horizontal, 8).padding(.vertical, 4)
                                .background(severity.color.opacity(0.08), in: RoundedRectangle(cornerRadius: 6))
                        } else {
                            Text(severity.label(language: store.language)).font(.system(size: 13)).foregroundStyle(AuditorTheme.secondary)
                        }
                        Spacer()
                        Text(report.summary.findings.count(for: severity).formatted()).font(.system(size: 13, weight: .semibold)).monospacedDigit()
                    }.frame(minHeight: 42)
                    if severity != Severity.allCases.last { Rectangle().fill(AuditorTheme.border).frame(height: 1) }
                }
            }.padding(20).auditorGlass()
            let incomplete = report.inventory.filter(\.hasIncompleteEvidence).count
            if incomplete > 0 {
                EvidenceNotice(title: "\(text(.coverageNotice, language: store.language)): \(incomplete.formatted())", detail: text(.coverageNoticeDetail, language: store.language))
            }
            if !report.recommendedActions.isEmpty {
                DisclosureGroup(text(.recommendedActions, language: store.language)) {
                    VStack(alignment: .leading, spacing: 12) {
                        ForEach(Array(report.recommendedActions.enumerated()), id: \.offset) { _, action in
                            Text(action).font(.callout).textSelection(.enabled)
                        }
                    }.padding(.top, 12)
                }.padding(20).auditorGlass()
            }
        }.frame(maxWidth: .infinity, alignment: .leading)
    }

    private func assetName(_ finding: Finding, report: ScanReport) -> String {
        if let itemID = finding.itemId, let item = report.inventory.first(where: { $0.id == itemID }) { return item.name }
        return URL(fileURLWithPath: finding.location.path).deletingLastPathComponent().lastPathComponent
    }

    private func shortLocation(_ finding: Finding) -> String {
        let prefix = store.reportRequest.map { $0.rootURL.standardizedFileURL.path + "/" }
        let path = prefix.flatMap { finding.location.path.hasPrefix($0) ? String(finding.location.path.dropFirst($0.count)) : nil } ?? finding.location.displayPath
        return path + (finding.location.line.map { ":\($0)" } ?? "")
    }

    private func actionRail(_ report: ScanReport) -> some View {
        VStack(alignment: .leading, spacing: 20) {
            BaselineReviewView()
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text(chinese ? "資產摘要" : "Asset summary").font(.system(size: 16, weight: .semibold))
                    Spacer()
                    Button(chinese ? "查看" : "View") { store.selectedSection = .inventory(.skill) }
                        .buttonStyle(.plain).font(.system(size: 13)).foregroundStyle(AuditorTheme.accent).underline()
                }.padding(.bottom, 18)
                ForEach(InventoryType.allCases) { type in
                    Button { store.selectedSection = .inventory(type) } label: {
                        HStack {
                            Text(type.label(language: store.language)).foregroundStyle(AuditorTheme.secondary)
                            Spacer()
                            Text(report.summary.inventory.count(for: type).formatted()).fontWeight(.semibold).monospacedDigit()
                        }.font(.system(size: 14)).frame(minHeight: 43).contentShape(Rectangle())
                    }.buttonStyle(.plain)
                    if type != InventoryType.allCases.last { Rectangle().fill(AuditorTheme.border).frame(height: 1) }
                }
            }.padding(20).auditorGlass()
            Text(chinese ? "資料留在本機。不收集遙測，不上傳掃描內容。" : "Data stays on this Mac. No telemetry or scan uploads.")
                .font(.system(size: 11)).foregroundStyle(AuditorTheme.secondary)
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}
