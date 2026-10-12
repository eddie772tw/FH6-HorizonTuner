# Tune 保存車輛離線入口（Issue #487）

## 範圍與操作

正常 Tune 標頭可直接選取 `/api/cars/with_params` 列出的保存車輛／profile，再開啟 Step 3「引擎資料與齒比」。保存引擎觀測沿用既有 Rust archive 相容性結果、原始 capture 載入與動力配置確認；沒有另建 archive 或數值 owner。

「已保存車輛 · 離線」表示手動 profile 選取，不代表遊戲正在使用該車或設定。即使仍保有別車的 Data Out 快取，也不將 PI／Class 或遙測帶入此選取；新的 ICE／EV／raw capture 採集停用。點選「跟隨 Data Out」、收到新的遊戲車輛或 WebSocket 重新連線會恢復即時選取。返回 Live 工作區也恢復跟隨 Data Out。

離線指不需要遊戲遙測，本地 Rust sidecar 與保存資料仍須可用。缺少保存車輛、讀取失敗、profile 尚未載入或檔案已消失時顯示原因；失敗的保存 profile 不以猜測預設值替代。

## 生命週期與資格

- `CarParamsProvider` 擁有車輛、來源與單調遞增的 `selectionGeneration`。新選取在同步 render 即隱藏前一份 profile／`loadedCarId`；載入、dyno 輪詢與清除／匯入的延遲回覆只能更新原 generation。
- `TuneSessionProvider` 使用 selection generation 作為草稿、Apply 與非同步 evidence 的失效範圍。它只是 UI token，不是 capture setup／upgrade／session／時間窗來源。
- 切換車輛或 profile／setup 後，舊分析、capture 與 preview 不得回寫。A→B→A 必須重新選取並確認，不能讓第一個 A 的回覆或 Apply 恢復。
- 引擎 archive 的 dependency key 相容，不等於完整 evidence 情境仍然有效。沿用原永久 stale 護欄：重新選取已失效的同 ID 可檢視已保存觀測與分析，但不能恢復 recommendation；分析完成後顯示明確 review-only 原因及重新採集入口。
- ICE archive 不進 EV／CVT／EV+CVT recommendation。原有能力分流、powertrain 確認與 Rust qualification 不放寬；不新增 CVT／EV 保存 evidence 入口。
- #515 的 mechanical／workflow v2、ICE recommendation v3、EV v2 與版本感知重播維持原 owner；未修改 Rust evidence 或底盤公式。

## 驗證證據與界線

基準為 main `c1e86317b43aa328a075760e3f6d683dc179583b`。採用技能：`cross-agent-collaboration`、`halfmoon-design-system`、`huge-component-refactoring`、`modular-refactoring`、`pr-author-maintainer`。

`TuningView.offline.test.tsx` 使用實際 CarParams／TuneSession provider、正常選車與 observation UI；12 項 synthetic transport 測試覆蓋載入、A→B→A、late capture／dyno、重新接管、setup／Apply、確認重置、完整分析後 review-only、缺 profile 與 EV／CVT 路由。它不證明遊戲 capture 資格；資格由現有 Rust tests 覆蓋。

正常 Vite UI 與 Rust sidecar 使用獨立暫存資料目錄，只有 `990001`／`990002` 合成 profile，沒有偽造 Data Out 或保存 capture。在 390×844 以繁中／英文、七個 Core Theme × 日夜模式執行 28 組選取／切換，檢查 selector 外緣、label 關聯、來源提示與 page errors。兩份 profile 的前後 SHA-256 相同。原始矩陣與四張代表畫面為 commit 前工作樹證據，來源檔案雜湊載於[矩陣](assets/offline-tune-selection/matrix.json)。

| 語言 | Default dark | Rhine Lab dark |
| --- | --- | --- |
| 繁中 | [正常離線選車](assets/offline-tune-selection/zh-tw-default.png) | [紙面主題](assets/offline-tune-selection/zh-tw-rhine-lab.png) |
| 英文 | [正常離線選車](assets/offline-tune-selection/en-us-default.png) | [紙面主題](assets/offline-tune-selection/en-us-rhine-lab.png) |

**DB11／carId 2527 qualified tire card gate：NOT_RUN。** 此雲端工作區未提供原始 DB 與 profile，沒有建立假 DB11 資料、修改使用者電腦或宣稱來源、真實 A/B／遊戲／Windows 原生驗收完成。Linux Tauri GUI 也未驗證：環境沒有 GTK／WebKit 原生開發函式庫。

本地 gate：完整 Vitest 1,797 passed／1 skipped，TypeScript／Vite Windows build、Rust default 契約、Rust no-default-features 契約、兩份 manifest rustfmt、Ruff 0.17.0、版本／路徑大小寫與 `git diff --check`。實際 remote SHA 與 CI 另見 Draft PR。
