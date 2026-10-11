import Foundation

enum FindingDispositionState: String, Codable, CaseIterable, Identifiable {
    case needsReview = "needs_review"
    case acceptedRisk = "accepted_risk"
    case falsePositive = "false_positive"
    var id: String { rawValue }
    func label(language: AppLanguage) -> String {
        switch self {
        case .needsReview: language == .zhHant ? "待審閱" : "Needs review"
        case .acceptedRisk: language == .zhHant ? "已接受風險" : "Accepted risk"
        case .falsePositive: language == .zhHant ? "人工判定誤報" : "Marked false positive"
        }
    }
}

struct FindingDisposition: Codable, Equatable {
    enum Status: String, Codable { case unreviewed, current, stale, unavailable }
    let state: FindingDispositionState
    let status: Status
    let reviewedAt: String?
    var effectiveState: FindingDispositionState { status == .current ? state : .needsReview }
    func label(language: AppLanguage) -> String {
        switch status {
        case .stale: language == .zhHant ? "舊決定已失效 · 請重新審閱" : "Previous decision expired · review again"
        case .unavailable: language == .zhHant ? "待審閱 · 尚無完整、唯一的內容證據" : "Needs review · complete unique evidence required"
        default: effectiveState.label(language: language)
        }
    }
}

struct FindingDispositionPreview: Codable, Equatable {
    let expectedHash: String
    let canSet: Bool
    let findingId: String?
    let disposition: FindingDisposition?
    var isValid: Bool {
        canSet && expectedHash.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil
            && findingId?.range(of: "^finding:[a-f0-9]{24}$", options: .regularExpression) != nil
            && disposition != nil
    }
}
