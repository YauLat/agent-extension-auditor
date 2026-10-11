import Foundation

enum ReportScopeFreshness { case unknown, current, previous }

// Fixed review guidance for built-in rules. Report and inspected source remain verbatim.
extension Finding {
    private var traditionalChinesePresentation: (title: String, guidance: String)? {
        switch ruleId {
        case "REMOTE_SCRIPT_EXECUTION": return ("遠端腳本執行模式", "先檢視完整腳本及來源，固定版本；避免直接把下載內容交給 shell。文件示例也會命中，執行狀態仍未知。")
        case "ENV_NETWORK_EXFILTRATION": return ("HTTP 上傳呼叫內引用環境變數", "核對完整呼叫、傳送內容及接收端；靜態位置相近不能證明資料已外傳。")
        case "PROMPT_INJECTION_EXFILTRATION": return ("繞過指令與傳送私人資料的描述", "檢視原文要求的資料及目的地，再決定是否啟用。教學示例亦可能命中。")
        case "MCP_STDIO_COMMAND": return ("MCP 伺服器啟動本機命令", "啟用前核對命令、套件、參數及維護者。合法的 stdio 伺服器也需要這項檢視。")
        case "MCP_ENV_REFERENCE": return ("MCP 伺服器引用環境變數", "只提供確實需要的變數；變數名稱不代表已讀取憑證。")
        case "MCP_NETWORK_SERVER": return ("MCP 伺服器使用網絡端點", "核對端點擁有人、認證方式及資料處理範圍。")
        case "PLUGIN_POSTINSTALL": return ("插件含安裝生命週期腳本", "安裝或啟用前閱讀完整腳本及套件來源，確認副作用。")
        case "PLUGIN_BIN_EXECUTABLE": return ("插件提供可執行程式", "核對執行檔名稱與來源是否符合預期；此宣告本身不代表惡意。")
        case "HOOK_SHELL_COMMAND": return ("Hook 含 shell 命令", "核對自動觸發時機、命令來源及副作用。")
        case "SECRET_PATTERN_REFERENCE": return ("偵測到類似憑證的引用", "核對是否需要該憑證及最小存取範圍；報告只描述引用。")
        case "WORKSPACE_OUTSIDE_READ": return ("可能讀取工作區以外的資料", "核對完整內容是否確實需要存取其他本機檔案；文件提及路徑不代表已獲權限。")
        case "WRITE_OR_DELETE_CAPABILITY": return ("寫入或刪除能力標記", "核對操作範圍與觸發條件，破壞性操作須經人工確認。")
        case "AUTO_UPDATE_BEHAVIOR": return ("自動更新行為標記", "核對更新來源與信任方式，避免未檢視的更新改變行為。")
        case "UNKNOWN_SOURCE": return ("未能確認擴充來源", "先核對可信來源；來源欄位不代表完整供應鏈驗證。")
        case "DUPLICATE_SKILL_NAME": return ("技能名稱重複", "核對重複項目的來源及用途，避免載入錯誤版本。")
        case "OVERSIZED_SKILL_CONTEXT": return ("技能內容過大", "檢視是否可拆分必要指引與參考資料，減少載入負擔。")
        default: return nil
        }
    }
    func displayTitle(language: AppLanguage) -> String {
        language == .zhHant ? traditionalChinesePresentation?.title ?? title : title
    }
    func reviewGuidance(language: AppLanguage) -> String? {
        language == .zhHant ? traditionalChinesePresentation?.guidance : nil
    }
}
