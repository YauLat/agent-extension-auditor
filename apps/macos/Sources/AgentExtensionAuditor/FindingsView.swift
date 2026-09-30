import SwiftUI

struct FindingsView: View {
    @EnvironmentObject private var store: AuditStore
    @State private var presentDetailAsSheet = false

    private var findings: [Finding] { store.findings() }
    private var selectedFinding: Finding? {
        guard let id = store.selectedFindingID else { return nil }
        return store.report?.findings.first(where: { $0.id == id })
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
                PageHeader(
                    title: text(.findings, language: store.language),
                    subtitle: "\(findings.count.formatted()) · \(text(.reviewQueue, language: store.language))",
                    symbol: "list.bullet.rectangle.portrait.fill"
                )
                .padding(.horizontal, 24)
                .padding(.top, 24)

                filterBar
                    .padding(.horizontal, 24)

                if findings.isEmpty {
                    EmptyStateView(
                        title: text(.noFindings, language: store.language),
                        detail: text(.noFindingsDetail, language: store.language),
                        symbol: "checkmark.shield.fill"
                    )
                } else {
                    List(selection: $store.selectedFindingID) {
                        ForEach(findings) { finding in
                            FindingListRow(finding: finding, language: store.language)
                                .tag(finding.id)
                        }
                    }
                    .listStyle(.inset)
                }
        }
        .searchable(text: $store.searchText, prompt: text(.searchPlaceholder, language: store.language))
        .onChange(of: store.selectedFindingID) { _, newValue in
            if newValue != nil {
                presentDetailAsSheet = store.windowWidth < 1_100
            }
        }
        .inspector(isPresented: inspectorBinding) {
            if let selectedFinding {
                FindingDetailView(finding: selectedFinding)
                    .environmentObject(store)
                    .inspectorColumnWidth(min: 320, ideal: 380, max: 460)
            }
        }
        .sheet(isPresented: sheetBinding) {
            if let selectedFinding {
                FindingDetailView(finding: selectedFinding)
                    .environmentObject(store)
                    .frame(minWidth: 520, minHeight: 560)
            }
        }
    }

    private var filterBar: some View {
        VStack(alignment: .leading, spacing: 10) {
            SeverityFilterBar()
            HStack(spacing: 10) {
                Picker(
                    text(.filterRule, language: store.language),
                    selection: Binding(
                        get: { store.selectedRuleID ?? "" },
                        set: { store.selectedRuleID = $0.isEmpty ? nil : $0 }
                    )
                ) {
                    Text(text(.all, language: store.language)).tag("")
                    ForEach(store.ruleIDs(), id: \.self) { ruleID in
                        Text(ruleID).tag(ruleID)
                    }
                }
                .labelsHidden()
                .frame(width: 220)

                Spacer()

                Button {
                    store.clearFilters()
                } label: {
                    Label(text(.clearFilters, language: store.language), systemImage: "xmark.circle")
                }
                .disabled(store.searchText.isEmpty && store.selectedSeverity == nil && store.selectedRuleID == nil)
            }
        }
    }

    private var inspectorBinding: Binding<Bool> {
        Binding(
            get: { selectedFinding != nil && !presentDetailAsSheet },
            set: { if !$0 { store.selectedFindingID = nil } }
        )
    }

    private var sheetBinding: Binding<Bool> {
        Binding(
            get: { selectedFinding != nil && presentDetailAsSheet },
            set: { if !$0 { store.selectedFindingID = nil } }
        )
    }
}

private struct FindingListRow: View {
    let finding: Finding
    let language: AppLanguage

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            RoundedRectangle(cornerRadius: 2)
                .fill(finding.severity.color)
                .frame(width: 4, height: 54)

            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 8) {
                    SeverityBadge(severity: finding.severity, language: language)
                    Text(finding.ruleId)
                        .font(.caption.monospaced().weight(.semibold))
                        .foregroundStyle(.secondary)
                    Spacer()
                }
                Text(finding.title)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                Text(finding.message)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                Text(locationText(finding.location))
                    .font(.caption2.monospaced())
                    .foregroundStyle(.tertiary)
                    .lineLimit(1)
            }
        }
        .padding(.vertical, 7)
    }

    private func locationText(_ location: FindingLocation) -> String {
        guard let line = location.line else { return location.displayPath }
        return "\(location.displayPath):\(line)"
    }
}

struct FindingDetailView: View {
    @EnvironmentObject private var store: AuditStore
    let finding: Finding

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 8) {
                        SeverityBadge(severity: finding.severity, language: store.language)
                        Text(finding.ruleId)
                            .font(.caption.monospaced().weight(.semibold))
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button {
                        store.selectedFindingID = nil
                    } label: {
                        Image(systemName: "xmark")
                    }
                    .buttonStyle(.borderless)
                    .help(text(.close, language: store.language))
                }

                Text(finding.title)
                    .font(.title3.weight(.bold))
                    .textSelection(.enabled)

                DetailField(
                    title: text(.message, language: store.language),
                    value: finding.message
                )
                DetailField(
                    title: text(.location, language: store.language),
                    value: locationText,
                    monospaced: true
                )

                HStack(spacing: 10) {
                    Button {
                        store.openPath(finding.location.path)
                    } label: {
                        Label(text(.openFile, language: store.language), systemImage: "doc.text")
                    }
                    Button {
                        store.revealPath(finding.location.path)
                    } label: {
                        Label(text(.showInFinder, language: store.language), systemImage: "folder")
                    }
                    Button {
                        store.copyPath(finding.location.path)
                    } label: {
                        Label(text(.copyPath, language: store.language), systemImage: "doc.on.doc")
                    }
                }

                if let evidenceText {
                    DetailField(
                        title: text(.evidence, language: store.language),
                        value: evidenceText,
                        accent: AuditorTheme.accent
                    )
                }

                DetailField(
                    title: text(.recommendation, language: store.language),
                    value: finding.recommendation,
                    accent: finding.severity.color
                )

                if let remediation = finding.remediation {
                    VStack(alignment: .leading, spacing: 10) {
                        Text(text(.remediation, language: store.language))
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                        Text(remediation.summary)
                            .font(.callout)
                            .frame(maxWidth: .infinity, alignment: .leading)

                        if remediation.mode == .guided {
                            Button {
                                store.activeRepairFinding = finding
                            } label: {
                                Label(text(.guidedRepair, language: store.language), systemImage: "wrench.and.screwdriver")
                            }
                            .buttonStyle(.borderedProminent)
                        } else {
                            Label(text(.manualReview, language: store.language), systemImage: "person.crop.circle.badge.checkmark")
                                .font(.caption.weight(.medium))
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(12)
                    .auditorGlass(tint: remediation.mode == .guided ? AuditorTheme.accent : nil)
                }
            }
            .padding(20)
        }
    }

    private var locationText: String {
        var parts = [finding.location.displayPath]
        if let line = finding.location.line {
            parts[0] += ":\(line)"
        }
        if let keyPath = finding.location.keyPath {
            parts.append(keyPath)
        }
        return parts.joined(separator: "\n")
    }

    private var evidenceText: String? {
        guard let evidence = finding.evidence else { return nil }
        let kind: String
        switch evidence.kind {
        case .documented: kind = text(.documentedBehavior, language: store.language)
        case .code: kind = store.language == .zhHant ? "程式包含此模式" : "Pattern present in code"
        case .configured: kind = text(.configuredBehavior, language: store.language)
        case .metadata: kind = text(.metadataEvidence, language: store.language)
        }
        let confidence = evidence.confidence == .high
            ? text(.high, language: store.language)
            : text(.medium, language: store.language)
        return "\(kind) · \(text(.confidence, language: store.language)): \(confidence) · \(text(.activeUnknown, language: store.language))"
    }
}

struct GuidedRepairSheet: View {
    @EnvironmentObject private var store: AuditStore
    @Environment(\.dismiss) private var dismiss
    let finding: Finding

    @State private var source = ""
    @State private var plan: RepairPlan?
    @State private var applied: ApplyRepairResult?
    @State private var rolledBack = false
    @State private var isWorking = false
    @State private var errorMessage: String?
    @State private var confirmApply = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                PageHeader(
                    title: text(.guidedRepair, language: store.language),
                    subtitle: finding.location.displayPath,
                    symbol: "wrench.and.screwdriver.fill"
                )

                if rolledBack {
                    statusCard(
                        text(.repairRolledBack, language: store.language),
                        symbol: "arrow.uturn.backward.circle.fill"
                    )
                    Button(text(.done, language: store.language)) { dismiss() }
                        .buttonStyle(.borderedProminent)
                } else if let applied {
                    statusCard(
                        text(.repairApplied, language: store.language),
                        symbol: "checkmark.shield.fill"
                    )
                    Text("Backup: \(applied.backupId)")
                        .font(.caption.monospaced())
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                    HStack {
                        Button {
                            rollback(applied.backupId)
                        } label: {
                            Label(text(.rollback, language: store.language), systemImage: "arrow.uturn.backward")
                        }
                        .disabled(isWorking)
                        Button(text(.done, language: store.language)) { dismiss() }
                            .buttonStyle(.borderedProminent)
                    }
                } else {
                    DetailField(
                        title: text(.message, language: store.language),
                        value: finding.message
                    )

                    VStack(alignment: .leading, spacing: 8) {
                        Text(text(.sourceURL, language: store.language))
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                        TextField("https://github.com/owner/repository", text: $source)
                            .textFieldStyle(.roundedBorder)
                    }

                    Button {
                        preview()
                    } label: {
                        Label(text(.previewRepair, language: store.language), systemImage: "doc.text.magnifyingglass")
                    }
                    .disabled(isWorking || source.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

                    if let plan {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(text(.repairPreview, language: store.language))
                                .font(.headline)
                            Text(plan.preview)
                                .font(.caption.monospaced())
                                .textSelection(.enabled)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(12)
                                .auditorGlass(tint: AuditorTheme.accent)
                        }

                        Button {
                            confirmApply = true
                        } label: {
                            Label(text(.applyRepair, language: store.language), systemImage: "checkmark.shield")
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(isWorking)
                    }
                }

                if isWorking {
                    ProgressView()
                }
                if let errorMessage {
                    Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                        .font(.callout)
                        .foregroundStyle(.red)
                        .textSelection(.enabled)
                }
            }
            .padding(24)
        }
        .onChange(of: source) { _, _ in
            if applied == nil {
                plan = nil
                errorMessage = nil
            }
        }
        .alert(text(.confirmRepairTitle, language: store.language), isPresented: $confirmApply) {
            Button(text(.cancel, language: store.language), role: .cancel) {}
            Button(text(.applyRepair, language: store.language), role: .destructive) { apply() }
        } message: {
            Text(text(.confirmRepairDetail, language: store.language))
        }
    }

    private func statusCard(_ value: String, symbol: String) -> some View {
        Label(value, systemImage: symbol)
            .font(.headline)
            .foregroundStyle(Color(red: 0.18, green: 0.52, blue: 0.28))
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .auditorGlass(tint: Color(red: 0.18, green: 0.52, blue: 0.28))
    }

    private func preview() {
        isWorking = true
        errorMessage = nil
        Task {
            defer { isWorking = false }
            do {
                plan = try await store.planGuidedRepair(for: finding, source: source)
            } catch {
                errorMessage = repairErrorMessage(error)
            }
        }
    }

    private func apply() {
        guard let plan else { return }
        isWorking = true
        errorMessage = nil
        Task {
            defer { isWorking = false }
            do {
                applied = try await store.applyGuidedRepair(
                    for: finding,
                    source: source,
                    expectedHash: plan.expectedHash
                )
            } catch {
                errorMessage = repairErrorMessage(error)
            }
        }
    }

    private func rollback(_ backupId: String) {
        isWorking = true
        errorMessage = nil
        Task {
            defer { isWorking = false }
            do {
                _ = try await store.rollbackGuidedRepair(backupId: backupId)
                rolledBack = true
                applied = nil
            } catch {
                errorMessage = repairErrorMessage(error)
            }
        }
    }

    private func repairErrorMessage(_ error: Error) -> String {
        if case AuditRunnerError.repairFailed(let message) = error {
            return message
        }
        return error.localizedDescription
    }
}

struct DetailField: View {
    let title: String
    let value: String
    var monospaced = false
    var accent: Color?

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            Text(value)
                .font(monospaced ? .callout.monospaced() : .callout)
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(12)
        .auditorGlass(tint: accent)
    }
}
