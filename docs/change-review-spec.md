# 新增／修改資產的審閱隊列

Status: approved；使用者在看到此具體規格後於 2026-10-04 批准本機實作。Owner: Codex。此規格不改動已批准的逐項決定。

## Goal

使用者按「比較目前內容」後，在同一次完整、相容的比較中先找到新增與修改資產的風險；完整清單仍可查看。讓第二次使用有明確目的，減少重新看相同警告。

## Non-goals

不自動建立／接受基準、不自動掃描 Home、不將 resolved 當作安全、不改 severity／gate／coverage、不新增持久模型、不遷移或刪除既有基準、不啟用擴充、不增加 runtime 支持或網絡請求。

## Current behavior

CLI baseline diff 已提供 identityHash 和新增／修改／移除資產；Mac app 只解碼名稱與類別並顯示變更明細。Findings 依 current／documented／example／disabled／archive 排序，沒有比較專用隊列。名稱可重複，不能用名稱 join。

## Proposed behavior

1. 為 baseline review 新增明確的 --include-report 選項，回傳產生該比較的同一次 scan report，及 current itemId 到 new／changed／unchanged 的映射。重用 baseline 的 identityHash 對應，不使用名稱或僅 path prefix 推測；缺失／重複身份保持 unknown。
2. 原有 baseline snapshot 和 diff schema 不遷移；新回應欄位是可選的。未指定選項時保留既有輸出。完整 report 仍禁止 source／secret 值。
3. Mac app 的比較操作使用新契約，準備完整 report/index 後一次更新，避免將另一輪掃描的變更標籤貼到舊畫面。只有 complete + comparable 才提供 new／changed／unchanged；partial、incompatible、缺少 baseline 或身份不唯一顯示「無法比較」，不得標作 unchanged。
4. 增加「全部／新增及修改」顯示選項。預設全部；相容比較後先排序 current 新增／修改，再保留既有脈絡及 severity 次序。同一 finding 的 disposition 和風險總數保持原值。移除項目留在比較明細，不虛構成目前 finding。
5. root、Home、package mode、重新掃描、基準接受或 report 替換後清除比較標籤與選項；必須重新比較。取消保留前一完整 report 及其匹配的標籤，不提交部分結果。

## Files/modules affected

src/baseline/index.ts、src/cli.ts、baseline-response schema；Swift BaselineReview／AuditRunner／AuditStore／FindingReviewIndex／OverviewView／FindingsView；對應 Node／Swift 測試、README 和契約文件。單一 owner；不修改私人審閱 history schema。

## Verification plan

先測 invalid／partial／incompatible／重複名稱與身份控制，再測新增、內容及權限修改、移除、相同內容、scope/ruleset 改變；用同一次 report 對應和 stale token 控制防止跨掃描錯貼。既有 baseline、逐項決定、gate 和 coverage 回歸必跑。合成 fixture 實測比較、過濾、接受後重新比較及取消；30k fixture 驗證數目、搜尋、排序和導航。目標：5 名真人中至少 4 人在 60 秒內找到變更及解釋需重審理由；真人結果另計。

## Risks / rollback notes

主要風險：錯誤對應成 unchanged、把移除當安全、比較後來源又改變、顯示選項隱藏其他風險，以及重複 JSON 增加記憶體。保守 unknown、單一 scan snapshot、完整風險總數及明確比較時間。工程估計 2–3 工作日；不是交付承諾。回滾本機 diff，保留所有基準與 history，不執行 migration 或清理。

## Approval checklist

- 操作：上述新增／修改審閱 workflow 和可選 baseline 回應欄位。
- 影響範圍：本機 CLI／Mac app／機器契約；不新增持久模型。
- 是否可回滾：可，以本機 Git diff 回滾，資料保留。
- 主要風險：跨掃描錯誤標籤、隱藏風險、較高記憶體。
- 驗證方式：負例、契約、Node／Swift suite、合成 App 比較與 30k regression；真人驗收另計。
- 需要使用者確認：依操作手冊第 11 節，改變用戶可見 workflow，必須批准後實作。

## Implementation clarification

Mac 的一般掃描、逐項審閱和比較統一排除根目錄的 `.agent-audit-baseline.json`，避免自身快照造成變更或比較時 scope 不一致。既有不同 scope 的決定按已批准規則過期；保留 history，不遷移、不自動重新接受。CLI opt-in report 使用實際比較範圍的逐項狀態；未指定 opt-in 時契約不變。

## Native layout regression found during verification

實際 Findings 畫面在一般及放大視窗中，coverage 橫幅遮住 PageHeader 上半部。第一次只把忽略 safe area 的背景移出 ZStack 未消除遮擋，該假設否決。改為明確垂直排列 coverage／進度與 selectedContent，不依賴 safeAreaInset 向靜態 PageHeader 傳遞 inset；背景獨立於配置尺寸。保持相同背景、橫幅、文案、控制、選擇及資料契約。這是上述已批准審閱畫面的可見性修復，不新增 workflow 或資料模型。驗收：一般與放大視窗標題及 filter 可見，30k 比較／搜尋／詳情及取消仍正確；原生 suite 與重新封裝。

### 選取詳情後縮窗的修正（2026-10-04）

Goal：保留目前 finding，視窗跨過既有 1,100pt 門檻時更新 inspector／sheet 顯示方式。已觀察到寬視窗選取後縮窗會裁切右方詳情，而窄視窗重新選取會正常開啟 sheet；程式只監聽選取改變，未監聽寬度。

Non-goals：不改門檻、最小視窗尺寸、detail 內容、選取／搜尋／比較規則、持久模型或安全設定。

Proposed behavior：FindingsView 沿用 InventoryView 已有的寬度監聽及依目前模式判斷關閉的 binding。切換顯示方式所引起的舊 inspector／sheet 關閉 callback，不清除仍需展示的 finding；使用者關閉目前詳情仍清除選取。只改 FindingsView.swift 與本規格、驗證紀錄。

Verification：Swift 原生 suite；重新封裝兩種架構；新 App 實測同一 finding 寬→窄、窄視窗選取及關閉、搜尋／鍵盤選取與比較取消。鎖屏阻止 GUI 時保留待驗證，不以編譯或舊 App 畫面代替。

Risks / rollback：SwiftUI dismissal callback 順序可能造成選取丟失，須以同一 finding 的位置確認。可回滾此局部 diff，無資料遷移或清理。此為已批准審閱畫面的響應修復，沿用既有授權。
