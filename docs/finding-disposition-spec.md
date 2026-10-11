# 逐項審閱狀態：已批准本機規格

Status: approved for local implementation — human approved2026-10-04。Owner: Codex。依原規格實作及驗證；公開發布／真人驗收另計。

## Goal

讓使用者保存 needs review／accepted risk／false positive 三種逐項決定；內容或規則改變後重新審閱。未處理數與已審閱數分開，所有風險與 coverage 仍可查看。

## Non-goals

不批准執行、不降低 severity、不繞過 --fail-on、不改 runtime 權限或 agent 設定、不自動信任來源、不上傳、不新增第三方依賴、不遷移現有 baseline、不刪除舊紀錄。

## Current behavior

0.3.2 有整體人工 baseline、審閱排序及固定風險說明；沒有逐項持久決定。再次掃描要重新辨認已看過的警告。

## Proposed behavior

1. 詳情頁由使用者明確選擇三種狀態，預設 needs review；accepted risk 不表示安全。每次寫入前重新核對目前內容，過期結果拒絕。
2. schema 1 私人本機檔案只保存 finding fingerprint、規則 ID／ruleset、資產內容及權限雜湊、scope 雜湊、狀態和時間。禁止 source、secret、raw command、絕對路徑或自由輸入備註。
3. 決定只適用於同 scope、同內容／權限、同規則的精確對應。內容、規則、權限改變或身份不唯一時舊決定失效；移動／別名保守處理，不靜默套用。
4. CLI 提供 review list／preview／set；set 必須 expected-hash 及明確確認。原生 UI 使用同一契約。篩選只影響顯示，JSON／SARIF 的全部風險、severity gate 和 coverage 保留。
5. 採用既有 baseline 的安全路徑、原子寫入及競態保護；新檔案 mode 0600。保留可還原的前一版本，不永久刪除，不覆寫既有 baseline。

## Files/modules affected

獨立 src/review-state 模組、types、CLI、報告可選審閱欄位、Swift Models／Store／FindingsView、相關測試和契約文件。沿用現有 worktree；一次只有 Codex 擁有寫入範圍。

## Verification plan

先測 invalid input、malformed／oversized／symlink／scope mismatch；再測三種狀態、stale hash、changed contents／permissions／ruleset、ambiguous identity、未知狀態、并行更新及還原。保證 report secret sentinel 不外露、gate 不變、incomplete scan 不得批准。完整 Node／Swift 檢查及隔離 App 實測。工程粗估 3–4 個工作日，真人五人驗收另計。

## Risks / rollback notes

主要風險是舊決定錯套新內容、誤解 accepted risk、隱藏未處理風險及持久檔案私隱。fail closed；顯示明確過期狀態；風險與 coverage 不受決定影響。回滾移除功能入口並保留私人資料檔案，不刪除或自動 migration。

## Human gate

本項已依操作手冊第 11 節取得明確批准。批准範圍只有上述本機功能；不包含公開發布、聯絡試用者、安裝 runtime、權限或憑證操作。

## Implementation details within the approved scope

- 本機狀態放在 root/.agent-audit-reviews，目錄 0700、版本檔 0600。使用追加版本鏈，每次保存保留全部前版；不覆寫 baseline。保留目錄固定列入掃描排除政策，避免自己的版本檔造成內容變動。
- 每版只含固定 schema、前版雜湊及決定清單。決定包含 finding／資產身份雜湊、內容與權限合成雜湊、scope／ruleset 雜湊、固定 enum 及 ISO 時間；不含路徑、名稱、命令、原文或備註。
- preview token 綁定完整未篩選掃描、所有資產內容、前版及所選 finding。set 重新掃描、取得獨佔鎖及比對 token，拒絕 scope drift、缺失／重複身份、partial scan 或過期結果。鎖不會自動清除他人／崩潰留下的鎖。
- 狀態讀取拒絕 symlink、hardlink、非私人權限、未知欄位、無效 enum／hash、分叉／斷裂版本鏈及大小上限。完整讀取前後核對目錄與檔案身份。
- CLI list／preview／set 使用 JSON v2；scan --with-reviews 是唯讀載入。restore 追加指定前版的決定，亦需完整 preview token 和 --yes；仍保留舊版。所有狀態不影響 findings、severity、gate 或 coverage。
- 原生介面先核對所選 finding，明確顯示三種狀態及失效原因，再按使用者選擇保存。保存失敗不改畫面上的決定；重新掃描後才顯示新狀態。
