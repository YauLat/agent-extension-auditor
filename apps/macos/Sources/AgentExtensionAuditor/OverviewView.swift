import SwiftUI

struct OverviewView: View {
    @EnvironmentObject private var store: AuditStore

    var body: some View {
        if let report = store.report {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    PageHeader(
                        title: text(.overview, language: store.language),
                        subtitle: "agent-audit \(report.version) · \(formattedScanDate(report.generatedAt))",
                        symbol: "rectangle.3.group.fill"
                    )

                    PrivacyStrip(language: store.language)
                    BaselineReviewView()
                    VStack(alignment: .leading, spacing: 10) {
                        Text(store.language == .zhHant ? "優先檢視的 5 項發現" : "First 5 findings to review").font(.headline)
                        ForEach(Array(report.findings.sorted { $0.severity.rank < $1.severity.rank }.prefix(5))) { finding in
                            Button {
                                store.clearFilters()
                                store.selectedFindingID = finding.id
                                store.selectedSection = .findings
                            } label: {
                                HStack(alignment: .top) {
                                    SeverityBadge(severity: finding.severity, language: store.language)
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(finding.title).font(.subheadline.weight(.medium))
                                        Text(finding.location.displayPath).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                                        Text(finding.recommendation).font(.caption).lineLimit(2)
                                    }
                                    Spacer()
                                    Image(systemName: "arrow.right")
                                }.frame(maxWidth: .infinity, alignment: .leading)
                            }.buttonStyle(.plain)
                        }
                    }.padding(16).auditorGlass()

                    let incompleteCount = report.inventory.filter(\.hasIncompleteEvidence).count
                    if incompleteCount > 0 {
                        EvidenceNotice(
                            title: "\(text(.coverageNotice, language: store.language)): \(incompleteCount.formatted())",
                            detail: text(.coverageNoticeDetail, language: store.language)
                        )
                    }

                    SectionTitle(
                        title: text(.severityBreakdown, language: store.language),
                        detail: "\(text(.totalFindings, language: store.language)): \(report.summary.findings.total.formatted())"
                    )
                    GlassGroup {
                        LazyVGrid(
                            columns: [GridItem(.adaptive(minimum: 150, maximum: 240), spacing: 12)],
                            spacing: 12
                        ) {
                            ForEach(Severity.allCases) { severity in
                                SeverityMetricCard(
                                    severity: severity,
                                    count: report.summary.findings.count(for: severity),
                                    language: store.language
                                )
                            }
                        }
                    }

                    SectionTitle(
                        title: text(.inventory, language: store.language),
                        detail: report.summary.inventory.total.formatted()
                    )
                    GlassGroup {
                        LazyVGrid(
                            columns: [GridItem(.adaptive(minimum: 240, maximum: 400), spacing: 12)],
                            spacing: 12
                        ) {
                            ForEach(InventoryType.allCases) { type in
                                InventoryMetricCard(
                                    type: type,
                                    count: report.summary.inventory.count(for: type),
                                    language: store.language
                                ) {
                                    store.selectedSection = .inventory(type)
                                }
                            }
                        }
                    }

                    SectionTitle(title: text(.recommendedActions, language: store.language))
                    RecommendedActionsView(actions: report.recommendedActions, language: store.language)
                }
                .padding(28)
                .frame(maxWidth: 1440, alignment: .leading)
            }
        } else {
            FirstScanView()
        }
    }

    private func formattedScanDate(_ value: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = formatter.date(from: value) else { return value }
        return date.formatted(date: .abbreviated, time: .shortened)
    }
}

private struct SeverityMetricCard: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let severity: Severity
    let count: Int
    let language: AppLanguage

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: severity.symbol)
                .font(.system(size: 21, weight: .semibold))
                .foregroundStyle(severity.color)
                .frame(width: 38, height: 38)
                .background(severity.color.opacity(0.12), in: RoundedRectangle(cornerRadius: 7))
            VStack(alignment: .leading, spacing: 3) {
                Text(severity.label(language: language))
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Text(count.formatted())
                    .font(.system(size: 25, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
                    .fixedSize(horizontal: true, vertical: false)
                    .contentTransition(.numericText())
                    .animation(reduceMotion ? nil : .easeOut(duration: 0.25), value: count)
            }
            Spacer(minLength: 0)
        }
        .padding(18)
        .frame(minHeight: 96)
        .auditorGlass(tint: severity.color)
    }
}

private struct InventoryMetricCard: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let type: InventoryType
    let count: Int
    let language: AppLanguage
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: type.symbol)
                    .font(.system(size: 19, weight: .semibold))
                    .foregroundStyle(AuditorTheme.accent)
                    .frame(width: 38, height: 38)
                    .background(AuditorTheme.accent.opacity(0.12), in: RoundedRectangle(cornerRadius: 7))
                VStack(alignment: .leading, spacing: 3) {
                    Text(type.label(language: language))
                        .font(.subheadline.weight(.semibold))
                    Text(count.formatted())
                        .contentTransition(.numericText())
                        .animation(reduceMotion ? nil : .easeOut(duration: 0.25), value: count)
                        .font(.title3.weight(.bold))
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.tertiary)
            }
            .padding(18)
            .frame(minHeight: 92)
            .contentShape(Rectangle())
            .auditorGlass(tint: AuditorTheme.accent)
        }
        .buttonStyle(AuditorCardButtonStyle())
    }
}

private struct RecommendedActionsView: View {
    let actions: [String]
    let language: AppLanguage

    var body: some View {
        if actions.isEmpty {
            HStack(spacing: 10) {
                Image(systemName: "checkmark.shield.fill")
                    .foregroundStyle(Severity.low.color)
                Text(text(.clean, language: language))
                    .font(.subheadline.weight(.medium))
            }
            .padding(.vertical, 8)
        } else {
            VStack(spacing: 0) {
                ForEach(Array(actions.enumerated()), id: \.offset) { index, action in
                    HStack(alignment: .top, spacing: 12) {
                        Text("\(index + 1)")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(AuditorTheme.accent)
                            .frame(width: 24, height: 24)
                            .background(AuditorTheme.accent.opacity(0.12), in: Circle())
                        Text(action)
                            .font(.subheadline)
                            .textSelection(.enabled)
                        Spacer()
                    }
                    .padding(.vertical, 11)
                    if index < actions.count - 1 {
                        Divider().padding(.leading, 36)
                    }
                }
            }
        }
    }
}
