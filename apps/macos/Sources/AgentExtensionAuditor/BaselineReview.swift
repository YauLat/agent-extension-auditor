import Foundation
import SwiftUI

struct BaselineAssetLabel: Decodable { let name: String; let type: String }
struct BaselineFindingLabel: Decodable { let ruleId: String; let assetName: String; let severity: String }
struct BaselineReviewDiff: Decodable {
    let status: String
    let reasons: [String]
    let addedAssets: [BaselineAssetLabel]
    let removedAssets: [BaselineAssetLabel]
    let changedAssets: [BaselineAssetLabel]
    let newFindings: [BaselineFindingLabel]
    let resolvedFindings: [BaselineFindingLabel]
}
struct BaselineReview: Decodable {
    let exists: Bool
    let reviewedHash: String
    let canAccept: Bool
    let assets: [BaselineAssetLabel]
    let diff: BaselineReviewDiff?
}

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
            }
            if let review = store.baselineReview {
                Text("\(review.assets.count) " + copy("項資產", "assets")).font(.caption.monospacedDigit())
                if let diff = review.diff {
                    Text(copy("新增 \(diff.addedAssets.count) · 修改 \(diff.changedAssets.count) · 移除 \(diff.removedAssets.count) · 新發現 \(diff.newFindings.count) · 已解決 \(diff.resolvedFindings.count)", "Added \(diff.addedAssets.count) · Changed \(diff.changedAssets.count) · Removed \(diff.removedAssets.count) · New findings \(diff.newFindings.count) · Resolved \(diff.resolvedFindings.count)"))
                        .font(.subheadline)
                    if !review.canAccept { Text(diff.reasons.joined(separator: ", ")).foregroundStyle(.orange) }
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
