import SwiftUI

struct OverviewView: View {
    @EnvironmentObject private var store: AuditStore
    private var chinese: Bool { store.language == .zhHant }

    var body: some View {
        if let report = store.report {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    PageHeader(title: text(.overview, language: store.language),
                               subtitle: "agent-audit \(report.version) · \(formattedComparisonDate(report.generatedAt))",
                               symbol: "rectangle.3.group.fill")
                    HStack(spacing: 0) {
                        summaryMetric(chinese ? "已掃描資產" : "Scanned assets", count: report.summary.inventory.total, symbol: "square.stack.3d.up")
                        Divider().frame(height: 44)
                        summaryMetric(text(.totalFindings, language: store.language), count: report.summary.findings.total, symbol: "exclamationmark.bubble")
                        Divider().frame(height: 44)
                        summaryMetric(chinese ? "待人工審閱" : "Awaiting review", count: store.dispositionCounts.needsReview, symbol: "person.crop.circle.badge.clock")
                    }.padding(8).auditorGlass()
                    if store.windowWidth >= 1_200 {
                        HStack(alignment: .top, spacing: 24) {
                            mainColumn(report).frame(maxWidth: .infinity)
                            actionRail(report).frame(width: 320)
                        }
                    } else {
                        mainColumn(report)
                        actionRail(report)
                    }
                    PrivacyStrip(language: store.language)
                }.padding(24).frame(maxWidth: 1440, alignment: .leading)
            }
        } else { FirstScanView() }
    }

    private func summaryMetric(_ title: String, count: Int, symbol: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: symbol).font(.title3).foregroundStyle(AuditorTheme.accent)
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.caption).foregroundStyle(AuditorTheme.secondary)
                Text(count.formatted()).font(.system(size: 26, weight: .semibold)).monospacedDigit()
            }
            Spacer(minLength: 0)
        }.padding(16).frame(maxWidth: .infinity, alignment: .leading)
    }

    private func mainColumn(_ report: ScanReport) -> some View {
        VStack(alignment: .leading, spacing: 20) {
            let priorities = store.prioritizedFindings()
            VStack(alignment: .leading, spacing: 16) {
                SectionTitle(title: chinese ? "優先檢視" : "Review first",
                             detail: chinese ? "\(priorities.count) 項／全部 \(report.summary.findings.total.formatted()) 項" : "\(priorities.count) of \(report.summary.findings.total.formatted())")
                Text(store.canFilterChanges
                     ? (chinese ? "新增及修改優先；完整風險仍保留。" : "New and changed assets come first; all risks are retained.")
                     : (chinese ? "先檢視目前內容；示例、停用及封存項目仍保留警告。" : "Current content comes first; examples, disabled and archived findings retain their warnings."))
                    .font(.caption).foregroundStyle(AuditorTheme.secondary)
                if priorities.isEmpty {
                    Text(chinese ? "本次報告沒有回報發現；仍需核對掃描範圍及未檢查項目。" : "No findings reported. Check scope and uninspected items before drawing conclusions.")
                        .font(.callout).foregroundStyle(AuditorTheme.secondary).padding(.vertical, 12)
                }
                ForEach(Array(priorities.enumerated()), id: \.element.id) { index, finding in
                    if index > 0 { Divider() }
                    Button {
                        store.clearFilters(); store.selectedFindingID = finding.id; store.selectedSection = .findings
                    } label: {
                        VStack(alignment: .leading, spacing: 8) {
                            HStack(alignment: .top, spacing: 10) {
                                SeverityBadge(severity: finding.severity, language: store.language)
                                Text(finding.displayTitle(language: store.language)).font(.callout.weight(.semibold)).multilineTextAlignment(.leading)
                                Spacer(minLength: 0)
                                Image(systemName: "arrow.up.right").foregroundStyle(AuditorTheme.secondary)
                            }
                            Text(finding.location.displayPath).font(.caption.monospaced()).foregroundStyle(AuditorTheme.secondary).lineLimit(1).truncationMode(.middle)
                            Text(finding.reviewLabel(language: store.language)).font(.caption).foregroundStyle(AuditorTheme.secondary)
                            Text(finding.reviewGuidance(language: store.language) ?? finding.recommendation).font(.callout).foregroundStyle(AuditorTheme.secondary).lineLimit(3).multilineTextAlignment(.leading)
                        }.frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle())
                    }.buttonStyle(.plain).help(finding.title)
                }
                Button(chinese ? "查看全部發現" : "Review all findings") {
                    store.clearFilters(); store.selectedSection = .findings
                }.buttonStyle(.bordered)
            }.padding(20).auditorGlass()

            VStack(alignment: .leading, spacing: 14) {
                SectionTitle(title: text(.severityBreakdown, language: store.language), detail: chinese ? "完整報告" : "Full report")
                ForEach(Severity.allCases) { severity in
                    HStack {
                        SeverityBadge(severity: severity, language: store.language)
                        Spacer()
                        Text(report.summary.findings.count(for: severity).formatted()).font(.callout.weight(.semibold)).monospacedDigit()
                    }
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

    private func actionRail(_ report: ScanReport) -> some View {
        VStack(alignment: .leading, spacing: 20) {
            BaselineReviewView()
            VStack(alignment: .leading, spacing: 14) {
                SectionTitle(title: text(.inventory, language: store.language), detail: report.summary.inventory.total.formatted())
                ForEach(InventoryType.allCases) { type in
                    Button { store.selectedSection = .inventory(type) } label: {
                        HStack(spacing: 10) {
                            Image(systemName: type.symbol).frame(width: 20).foregroundStyle(AuditorTheme.accent)
                            Text(type.label(language: store.language))
                            Spacer()
                            Text(report.summary.inventory.count(for: type).formatted()).monospacedDigit()
                            Image(systemName: "chevron.right").font(.caption).foregroundStyle(AuditorTheme.secondary)
                        }.font(.callout).padding(.vertical, 6).contentShape(Rectangle())
                    }.buttonStyle(.plain)
                }
            }.padding(20).auditorGlass()
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}
