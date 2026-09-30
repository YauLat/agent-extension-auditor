import SwiftUI

struct LocationsView: View {
    @EnvironmentObject private var store: AuditStore

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            PageHeader(
                title: text(.scannedLocations, language: store.language),
                subtitle: (store.report?.scannedLocations.count ?? 0).formatted(),
                symbol: "scope"
            )
            .padding(.horizontal, 24)
            .padding(.top, 24)

            if let coverage = store.report?.coverage {
                CoverageDetails(coverage: coverage, language: store.language)
            }

            if let locations = store.report?.scannedLocations, !locations.isEmpty {
                List(locations) { location in
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: location.exists ? "checkmark.circle.fill" : "minus.circle")
                            .foregroundStyle(location.exists ? Severity.low.color : .secondary)
                            .font(.title3)
                        VStack(alignment: .leading, spacing: 5) {
                            HStack {
                                Text(location.displayPath)
                                    .font(.callout.monospaced().weight(.medium))
                                    .textSelection(.enabled)
                                Spacer()
                                Text(location.kind)
                                    .font(.caption2.weight(.semibold))
                                    .foregroundStyle(.secondary)
                            }
                            Text(location.reason)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Text(location.exists ? text(.exists, language: store.language) : text(.missing, language: store.language))
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(location.exists ? Severity.low.color : .secondary)
                        }
                    }
                    .padding(.vertical, 6)
                }
                .listStyle(.inset)
            } else {
                EmptyStateView(
                    title: text(.scannedLocations, language: store.language),
                    detail: text(.noItemsDetail, language: store.language),
                    symbol: "scope"
                )
            }
        }
    }
}

struct SettingsView: View {
    @EnvironmentObject private var store: AuditStore

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                PageHeader(
                    title: text(.settings, language: store.language),
                    subtitle: text(.localOnly, language: store.language),
                    symbol: "gearshape.fill"
                )

                settingsSection(title: text(.language, language: store.language)) {
                    Picker(
                        text(.language, language: store.language),
                        selection: Binding(
                            get: { store.language },
                            set: { store.setLanguage($0) }
                        )
                    ) {
                        ForEach(AppLanguage.allCases) { language in
                            Text(language.displayName).tag(language)
                        }
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()
                    .frame(maxWidth: 320)
                }

                settingsSection(title: text(.selectedRoot, language: store.language)) {
                    VStack(alignment: .leading, spacing: 12) {
                        Text(store.workspaceURL.path)
                            .font(.callout.monospaced())
                            .textSelection(.enabled)
                        Toggle(
                            text(.includeHome, language: store.language),
                            isOn: Binding(
                                get: { store.includeHome },
                                set: { store.setIncludeHome($0) }
                            )
                        )
                        .toggleStyle(.switch)
                    }
                }

                settingsSection(title: text(.engine, language: store.language)) {
                    VStack(spacing: 0) {
                        RuntimeStatusRow(
                            title: text(.nodeRuntime, language: store.language),
                            url: store.runtimeStatus.nodeURL,
                            language: store.language
                        )
                        Divider().padding(.vertical, 10)
                        RuntimeStatusRow(
                            title: text(.scannerEngine, language: store.language),
                            url: store.runtimeStatus.scannerURL,
                            language: store.language
                        )
                    }
                }

                settingsSection(title: text(.readOnly, language: store.language)) {
                    Label {
                        Text(text(.readOnlyDetail, language: store.language))
                            .font(.callout)
                    } icon: {
                        Image(systemName: "eye.fill")
                            .foregroundStyle(AuditorTheme.accent)
                    }
                }

                PrivacyStrip(language: store.language)
            }
            .padding(28)
            .frame(maxWidth: 960, alignment: .leading)
        }
    }

    private func settingsSection<Content: View>(
        title: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(.headline)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct RuntimeStatusRow: View {
    let title: String
    let url: URL?
    let language: AppLanguage

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: url == nil ? "xmark.circle.fill" : "checkmark.circle.fill")
                .foregroundStyle(url == nil ? Severity.critical.color : Severity.low.color)
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                Text(url == nil ? text(.unavailable, language: language) : text(.available, language: language))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if let url {
                    Text(url.path)
                        .font(.caption2.monospaced())
                        .foregroundStyle(.tertiary)
                        .textSelection(.enabled)
                }
            }
            Spacer()
        }
    }
}
