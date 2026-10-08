import SwiftUI

struct FindingsView: View {
    @EnvironmentObject private var store: AuditStore
    @State private var presentDetailAsSheet = false

    private var findings: [Finding] {
        guard store.selectedSection == .findings else { return [] }
        return store.findings()
    }
    private var selectedFinding: Finding? {
        guard let id = store.selectedFindingID else { return nil }
        return store.report?.findings.first(where: { $0.id == id })
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
                PageHeader(
                    title: text(.findings, language: store.language),
                    subtitle: "\(findings.count.formatted()) · \(text(.reviewQueue, language: store.language)) · \(reviewCountsText)",
                    symbol: "list.bullet.rectangle.portrait.fill"
                )
                .padding(.horizontal, 24)
                .padding(.top, 24)

                if !store.findingReviewMessage.isEmpty {
                    Text(store.findingReviewMessage)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                        .padding(.horizontal, 24)
                }

                filterBar
                    .padding(.horizontal, 24)

                if findings.isEmpty {
                    EmptyStateView(
                        title: store.selectedChangeFilter == .newAndChanged ? (store.language == .zhHant ? "沒有符合條件的新增或修改發現" : "No matching new or changed findings") : text(.noFindings, language: store.language),
                        detail: store.selectedChangeFilter == .newAndChanged ? (store.language == .zhHant ? "完整報告仍可能有風險或無法比較的項目；切回全部檢視。" : "The full report may still contain risks or unmatched items. Switch to All to review them.") : text(.noFindingsDetail, language: store.language),
                        symbol: store.selectedChangeFilter == .newAndChanged ? "line.3.horizontal.decrease.circle" : "checkmark.shield.fill"
                    )
                } else {
                    List(selection: $store.selectedFindingID) {
                        ForEach(findings) { finding in
                            FindingListRow(finding: finding, language: store.language, changeState: store.comparisonGeneratedAt != nil ? store.changeState(for: finding) : nil)
                                .tag(finding.id)
                        }
                    }
                    .listStyle(.inset)
                }
        }
        .searchable(text: $store.searchText, prompt: text(.searchPlaceholder, language: store.language))
        .onAppear { presentDetailAsSheet = store.selectedFindingID != nil && store.windowWidth < 1_100 }
        .onChange(of: store.selectedFindingID) { _, newValue in
            if newValue != nil {
                presentDetailAsSheet = store.windowWidth < 1_100
            }
        }
        .onChange(of: store.windowWidth) { _, width in
            guard selectedFinding != nil else { return }
            presentDetailAsSheet = width < 1_100
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
            if let comparedAt = store.comparisonGeneratedAt {
                Text((store.language == .zhHant ? "比較時間：" : "Compared at: ") + formattedComparisonDate(comparedAt)
                    + (store.canFilterChanges ? "" : (store.language == .zhHant ? " · 無法比較，仍保留全部風險" : " · Comparison unavailable; all risks retained")))
                    .font(.caption).foregroundStyle(.secondary)
            }
            Picker(store.language == .zhHant ? "審閱範圍" : "Review scope", selection: $store.selectedChangeFilter) {
                Text(store.language == .zhHant ? "全部" : "All").tag(ChangeReviewFilter.all)
                Text(store.language == .zhHant ? "新增及修改" : "New and changed").tag(ChangeReviewFilter.newAndChanged)
            }.pickerStyle(.segmented).frame(maxWidth: 320).disabled(!store.canFilterChanges)
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
                .disabled(store.searchText.isEmpty && store.selectedSeverity == nil && store.selectedRuleID == nil && store.selectedChangeFilter == .all)
            }
        }
    }

    private var reviewCountsText: String {
        let counts = store.dispositionCounts
        return store.language == .zhHant ? "全部報告：待審閱 \(counts.needsReview.formatted())／已審閱 \(counts.reviewed.formatted())"
            : "Full report: \(counts.needsReview.formatted()) need review / \(counts.reviewed.formatted()) reviewed"
    }

    private var inspectorBinding: Binding<Bool> {
        Binding(
            get: { selectedFinding != nil && !presentDetailAsSheet },
            set: { if !$0 && !presentDetailAsSheet { store.selectedFindingID = nil } }
        )
    }

    private var sheetBinding: Binding<Bool> {
        Binding(
            get: { selectedFinding != nil && presentDetailAsSheet },
            set: { if !$0 && presentDetailAsSheet { store.selectedFindingID = nil } }
        )
    }
}

private struct FindingListRow: View {
    let finding: Finding
    let language: AppLanguage
    let changeState: AssetChangeState?

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
                Text(finding.reviewLabel(language: language))
                    .font(.caption2).foregroundStyle(.secondary)
                if let disposition = finding.disposition {
                    Text(disposition.label(language: language)).font(.caption2).foregroundStyle(.secondary)
                }
                if let changeState { Text(changeState.label(language: language)).font(.caption2).foregroundStyle(.secondary) }
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
    @State private var proposedState: FindingDispositionState = .needsReview

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
                Text(finding.reviewLabel(language: store.language)).font(.caption).foregroundStyle(.secondary)
                manualReview
                if let explanation = finding.explanation {
                    DetailField(title: store.language == .zhHant ? "命中原因" : "What matched", value: explanation.detected)
                    DetailField(title: store.language == .zhHant ? "可能影響" : "Potential impact", value: explanation.impact)
                    DetailField(title: store.language == .zhHant ? "判定限制" : "Detection limits", value: explanation.limits)
                }
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
                        if remediation.summary != finding.recommendation {
                            Text(remediation.summary)
                                .font(.callout)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }

                        if remediation.mode == .guided {
                            Button {
                                store.activeRepairFinding = finding
                            } label: {
                                Label(text(.guidedRepair, language: store.language), systemImage: "wrench.and.screwdriver")
                            }
                            .buttonStyle(.borderedProminent)
                            .disabled(store.findingReviewBusy || store.isScanning || store.baselineBusy)
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

    private var manualReview: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(store.language == .zhHant ? "人工審閱決定" : "Manual review decision").font(.headline)
            Text(finding.disposition?.label(language: store.language) ?? FindingDispositionState.needsReview.label(language: store.language)).font(.callout)
            Text(store.language == .zhHant ? "決定只適用於相同內容、權限、範圍及規則。接受風險或判定誤報不代表安全，所有風險仍保留。" : "Decisions apply only to unchanged content, permissions, scope and rules. Accepted risk or a false-positive decision does not certify safety; all risks remain visible.")
                .font(.caption).foregroundStyle(.secondary)
            Button(store.language == .zhHant ? "核對目前內容" : "Check current content") {
                Task { await store.prepareFindingReview(finding) }
            }
            .disabled(store.findingReviewBusy || store.isScanning || store.baselineBusy)
            if let preview = store.findingReviewPreview, preview.findingId == finding.scannerID, preview.isValid {
                Picker(store.language == .zhHant ? "保存為" : "Save as", selection: $proposedState) {
                    ForEach(FindingDispositionState.allCases) { state in Text(state.label(language: store.language)).tag(state) }
                }
                Button(store.language == .zhHant ? "儲存此審閱決定" : "Save this review decision") {
                    Task { await store.saveFindingReview(proposedState) }
                }
                .disabled(!store.canSaveFindingReview)
            }
            if store.findingReviewBusy { ProgressView().controlSize(.small) }
            if !store.findingReviewMessage.isEmpty {
                Text(store.findingReviewMessage).font(.caption).foregroundStyle(.secondary).textSelection(.enabled)
            }
        }
        .onChange(of: finding.id) { _, _ in proposedState = .needsReview }
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
