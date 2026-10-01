import SwiftUI

struct PageHeader: View {
    let title: String
    let subtitle: String
    let symbol: String

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: symbol)
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(AuditorTheme.accent)
                .frame(width: 42, height: 42)
                .auditorGlass(tint: AuditorTheme.accent)

            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                        .font(.system(size: 32, weight: .bold, design: .rounded))
                        .tracking(-0.6)
                Text(subtitle)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
            Spacer(minLength: 12)
        }
    }
}

struct StatusPill: View {
    let title: String
    let symbol: String
    let color: Color

    var body: some View {
        Label(title, systemImage: symbol)
            .font(.caption.weight(.medium))
            .foregroundStyle(color)
            .padding(.horizontal, 9).padding(.vertical, 5)
            .background(color.opacity(0.09), in: Capsule())
            .fixedSize(horizontal: false, vertical: true)
    }
}

struct ConfigurationPill: View {
    let enabled: Bool?
    let language: AppLanguage

    var body: some View {
        StatusPill(
            title: text(enabled.map { $0 ? .configuredEnabled : .configuredDisabled } ?? .configurationUnspecified, language: language),
            symbol: enabled.map { $0 ? "checkmark.circle" : "minus.circle" } ?? "questionmark.circle",
            color: enabled == true ? AuditorTheme.accent : .secondary
        )
    }
}

struct EvidenceNotice: View {
    let title: String
    let detail: String

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "exclamationmark.circle.fill")
                .font(.title3).foregroundStyle(Severity.medium.color)
            VStack(alignment: .leading, spacing: 5) {
                Text(title).font(.subheadline.weight(.semibold))
                Text(detail).font(.caption).foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Severity.medium.color.opacity(0.08), in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Severity.medium.color.opacity(0.25)))
        .accessibilityElement(children: .combine)
    }
}

struct SectionTitle: View {
    let title: String
    var detail: String?

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title)
                .font(.headline)
            Spacer()
            if let detail {
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }
        }
    }
}

struct SeverityBadge: View {
    let severity: Severity
    let language: AppLanguage

    var body: some View {
        Label(severity.label(language: language), systemImage: severity.symbol)
            .font(.caption.weight(.semibold))
            .foregroundStyle(severity.color)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(severity.color.opacity(0.11), in: Capsule())
            .fixedSize()
    }
}

struct SeverityFilterBar: View {
    var type: InventoryType? = nil
    private var scopedFindings: [Finding] { store.severityScope(for: type) }
    @EnvironmentObject private var store: AuditStore

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                filterButton(
                    title: text(.all, language: store.language),
                    count: scopedFindings.count,
                    severity: nil
                )
                ForEach(Severity.allCases) { severity in
                    filterButton(
                        title: severity.label(language: store.language),
                        count: scopedFindings.filter { $0.severity == severity }.count,
                        severity: severity
                    )
                }
            }
        }
    }

    private func filterButton(title: String, count: Int, severity: Severity?) -> some View {
        let selected = store.selectedSeverity == severity
        let color = severity?.color ?? AuditorTheme.accent

        return Button {
            store.selectedSeverity = severity
            store.selectedRuleID = nil
        } label: {
            HStack(spacing: 6) {
                Circle()
                    .fill(color)
                    .frame(width: 7, height: 7)
                Text(title)
                    .lineLimit(1)
                Text(count.formatted())
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }
            .font(.caption.weight(selected ? .semibold : .regular))
            .frame(minWidth: 76, minHeight: 30)
            .padding(.horizontal, 8)
            .background(selected ? color.opacity(0.14) : Color.clear, in: RoundedRectangle(cornerRadius: 7))
            .overlay(
                RoundedRectangle(cornerRadius: 7)
                    .stroke(selected ? color.opacity(0.45) : AuditorTheme.border, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }
}

struct EmptyStateView: View {
    let title: String
    let detail: String
    let symbol: String

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: symbol)
                .font(.system(size: 34, weight: .medium))
                .foregroundStyle(AuditorTheme.accent)
            Text(title)
                .font(.headline)
            Text(detail)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 380)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(36)
    }
}

struct PrivacyStrip: View {
    let language: AppLanguage

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: "lock.shield.fill")
                .font(.title3)
                .foregroundStyle(Color(red: 0.18, green: 0.52, blue: 0.28))
            VStack(alignment: .leading, spacing: 2) {
                Text(text(.privacy, language: language))
                    .font(.subheadline.weight(.semibold))
                Text(text(.privacyNote, language: language))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            HStack(spacing: 12) {
                privacyLabel(.noTelemetry)
                privacyLabel(.noUpload)
                privacyLabel(.localOnly)
            }
        }
        .padding(14)
        .auditorGlass(tint: Color(red: 0.18, green: 0.52, blue: 0.28))
    }

    private func privacyLabel(_ key: TextKey) -> some View {
        Label(text(key, language: language), systemImage: "checkmark")
            .font(.caption.weight(.medium))
            .foregroundStyle(.secondary)
            .fixedSize()
    }
}

struct LoadingStateView: View {
    let language: AppLanguage

    var body: some View {
        VStack(spacing: 14) {
            ProgressView()
                .controlSize(.large)
            Text(text(.scanning, language: language))
                .font(.headline)
            Text(text(.privacyNote, language: language))
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
