import SwiftUI

struct OverviewView: View {
    @EnvironmentObject private var store: AuditStore

    var body: some View {
        if let report = store.report {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    PageHeader(
                        title: text(.overview, language: store.language),
                        subtitle: "agent-audit \(report.version) · \(report.generatedAt)",
                        symbol: "rectangle.3.group.fill"
                    )

                    PrivacyStrip(language: store.language)

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
                            columns: [GridItem(.adaptive(minimum: 180, maximum: 280), spacing: 12)],
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
            EmptyStateView(
                title: text(.noFindings, language: store.language),
                detail: text(.scanFailed, language: store.language),
                symbol: "shield.slash"
            )
        }
    }
}

private struct SeverityMetricCard: View {
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
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .frame(minHeight: 84)
        .auditorGlass(tint: severity.color)
    }
}

private struct InventoryMetricCard: View {
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
                        .font(.title3.weight(.bold))
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.tertiary)
            }
            .padding(14)
            .frame(minHeight: 76)
            .contentShape(Rectangle())
            .auditorGlass(tint: AuditorTheme.accent)
        }
        .buttonStyle(.plain)
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
