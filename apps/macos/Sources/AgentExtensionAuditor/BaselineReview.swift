import Foundation
import SwiftUI

struct BaselineAssetLabel: Decodable { let name: String; let type: String }
struct BaselineFindingLabel: Decodable { let ruleId: String; let assetName: String; let severity: String }
struct BaselineReviewDiff: Decodable {
    let status: String
    let currentGeneratedAt: String
    let reasons: [String]
    let addedAssets: [BaselineAssetLabel]
    let removedAssets: [BaselineAssetLabel]
    let changedAssets: [BaselineAssetLabel]
    let newFindings: [BaselineFindingLabel]
    let resolvedFindings: [BaselineFindingLabel]

    func blockMessage(language: AppLanguage) -> String {
        let zh = language == .zhHant
        if reasons.contains("ruleset_mismatch") {
            return zh ? "規則已變更，不能直接接受舊基準。請重新檢視目前發現，再建立另一份基準；原有基準會保留。" : "Rules changed; this baseline cannot be accepted directly. Review current findings and create a separate baseline. The existing baseline remains protected."
        }
        if reasons.contains("scope_mismatch") {
            return zh ? "掃描範圍不同，不能直接比較。請回到原有範圍，或重新檢視另一個範圍。" : "The scan scope differs. Return to the original scope or review the separate scope."
        }
        if reasons.contains("current_scan_incomplete") {
            return zh ? "目前掃描未完整，不能接受基準或把舊風險當作已解決。請查看掃描範圍與未檢查項目。" : "The scan is incomplete. Acceptance and risk resolution are blocked. Check scope and uninspected items."
        }
        if reasons.contains("ambiguous_asset_identity") {
            return zh ? "部分資產無法唯一對應，請先確認重複或移動的項目再審閱。" : "Some assets cannot be matched uniquely. Check duplicate or moved assets before reviewing again."
        }
        return zh ? "此比較不能接受。請核對報告版本、掃描範圍與完整程度，再重新審閱。" : "This comparison cannot be accepted. Check report version, scope and coverage, then review again."
    }
}
struct BaselineReview: Decodable {
    let exists: Bool
    let reviewedHash: String?
    let canAccept: Bool
    let assets: [BaselineAssetLabel]
    let diff: BaselineReviewDiff?
    let report: ScanReport?
    let changeReview: BaselineChangeReview?

    var hasValidToken: Bool { reviewedHash?.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil }

    func validatedChanges(for report: ScanReport) -> [String: AssetChangeState] {
        guard diff?.status == "comparable", diff?.currentGeneratedAt == report.generatedAt,
              let changeReview, changeReview.status == "comparable", changeReview.generatedAt == report.generatedAt,
              report.schemaVersion == 2, report.coverage?.status == "complete" else { return [:] }
        let ids = report.inventory.map(\.id), mappedIDs = changeReview.items.map(\.itemId)
        guard ids.count == Set(ids).count, mappedIDs.count == Set(mappedIDs).count,
              Set(ids) == Set(mappedIDs) else { return [:] }
        return Dictionary(uniqueKeysWithValues: changeReview.items.map { ($0.itemId, $0.state) })
    }
}

enum AssetChangeState: String, Decodable {
    case new, changed, unchanged, unknown
    var requiresReview: Bool { self == .new || self == .changed }
    func label(language: AppLanguage) -> String {
        let zh = language == .zhHant
        switch self {
        case .new: return zh ? "新增資產" : "New asset"
        case .changed: return zh ? "資產已修改" : "Changed asset"
        case .unchanged: return zh ? "與基準相同" : "Unchanged from baseline"
        case .unknown: return zh ? "無法比較" : "Comparison unavailable"
        }
    }
}
struct BaselineChangeReview: Decodable {
    struct Item: Decodable { let itemId: String; let state: AssetChangeState }
    let status: String
    let generatedAt: String
    let items: [Item]
}
enum ChangeReviewFilter: String { case all, newAndChanged }

struct BaselineReviewView: View {
    @EnvironmentObject private var store: AuditStore
    private func copy(_ zh: String, _ en: String) -> String { store.language == .zhHant ? zh : en }
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(copy("人工檢視基準", "Manual review baseline")).font(.headline)
            Text(copy("比較新增、修改和移除的擴充。接受只記錄本次檢視；不會啟用擴充或認證安全。", "Compare added, changed and removed extensions. Acceptance records review; it does not enable or certify extensions."))
                .font(.caption).foregroundStyle(.secondary)
            HStack {
                Button(copy("比較目前內容", "Compare current contents")) { Task { await store.reviewBaseline() } }
                    .disabled(store.baselineBusy || store.isScanning)
                if let review = store.baselineReview {
                    Button(review.exists ? copy("接受已檢視變更", "Accept reviewed changes") : copy("建立已檢視基準", "Create reviewed baseline")) {
                        Task { await store.acceptBaseline() }
                    }.disabled(!store.canAcceptBaseline)
                }
                if store.baselineBusy { ProgressView().controlSize(.small) }
                if store.baselineBusy {
                    Button(copy("取消比較", "Cancel comparison"), action: store.cancelBaselineReview)
                }
            }
            if let review = store.baselineReview {
                if let comparedAt = store.comparisonGeneratedAt {
                    Text(copy("比較時間：", "Compared at: ") + formattedComparisonDate(comparedAt)).font(.caption)
                    Text(copy("到發現頁可查看新增及修改；完整風險數目保留。無法比較的項目仍需檢視。", "Findings can show new and changed assets. Full risk counts are retained; unmatched assets still need review.")).font(.caption).foregroundStyle(.secondary)
                }
                Text("\(review.assets.count) " + copy("項資產", "assets")).font(.caption.monospacedDigit())
                if let diff = review.diff {
                    Text(copy("新增 \(diff.addedAssets.count) · 修改 \(diff.changedAssets.count) · 移除 \(diff.removedAssets.count) · 新發現 \(diff.newFindings.count) · 已解決 \(diff.resolvedFindings.count)", "Added \(diff.addedAssets.count) · Changed \(diff.changedAssets.count) · Removed \(diff.removedAssets.count) · New findings \(diff.newFindings.count) · Resolved \(diff.resolvedFindings.count)"))
                        .font(.subheadline)
                    if !review.canAccept { Text(diff.blockMessage(language: store.language)).foregroundStyle(.orange) }
                    DisclosureGroup(copy("變更明細", "Change details")) {
                        ScrollView {
                            VStack(alignment: .leading, spacing: 6) {
                                assetRows(diff.addedAssets, prefix: "+")
                                assetRows(diff.changedAssets, prefix: "~")
                                assetRows(diff.removedAssets, prefix: "−")
                                ForEach(Array(diff.newFindings.enumerated()), id: \.offset) { _, f in Text("+ \(f.severity) · \(f.ruleId) · \(f.assetName)") }
                                ForEach(Array(diff.resolvedFindings.enumerated()), id: \.offset) { _, f in Text("− \(f.severity) · \(f.ruleId) · \(f.assetName)") }
                            }.frame(maxWidth: .infinity, alignment: .leading)
                        }.frame(maxHeight: 180)
                    }.font(.caption)
                } else {
                    Text(copy("尚未有基準，變更標籤無法比較。", "No baseline yet; change labels are unavailable.")).font(.caption).foregroundStyle(.secondary)
                    DisclosureGroup(copy("將納入的資產", "Assets to include")) {
                        ScrollView { assetRows(review.assets, prefix: "+") }.frame(maxHeight: 180)
                    }.font(.caption)
                }
            }
            if !store.baselineMessage.isEmpty { Text(store.baselineMessage).font(.caption) }
        }.padding(16).frame(maxWidth: .infinity, alignment: .leading).auditorGlass()
    }
    private func assetRows(_ assets: [BaselineAssetLabel], prefix: String) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            ForEach(Array(assets.enumerated()), id: \.offset) { _, asset in Text("\(prefix) \(asset.type): \(asset.name)") }
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}

func formattedComparisonDate(_ value: String) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    guard let date = formatter.date(from: value) else { return value }
    return date.formatted(date: .abbreviated, time: .shortened)
}
