# CVT 既有證據匯入、冷讀與選取

本切片對應 [#434 最新縮小指派](https://github.com/eddie772tw/FH6-HorizonTuner/issues/434#issuecomment-6098932949)，基於 main `c1e86317b43aa328a075760e3f6d683dc179583b`。沿用 [foundation](cvt-foundation.md) 的 `cvt-capture/v1`、`cvt-qualification/v1`、immutable POST 與 saved-cvt replay，保留 #515 的正式底盤契約。

## 桌面入口與來源

在調校 Step 1 明確選擇 CVT 後，Step 3 的 foundation 面板提供：

1. 重新整理與選取已保存的 CVT 證據。清單包含所有保存車輛的 ordinal 與 evidence ID；選取不切換目前車輛，不自動宣告相符。
2. 匯入最多 8 MiB 的原始 JSON 物件。它必須遵循原有 `cvt-capture/v1` 契約；schema、SI 通道、來源與資格仍由 Rust 判定，沒有前端 fallback 或換算。未知版本也送至 owner 回報 unsupported，損壞 JSON 則清除舊選取並顯示錯誤。
3. 查看不包含幀資料的原始 metadata，以及擷取時間、遊戲版本與記錄器版本的 unknown 提示。未知來源保持原來的 null／unknown。限位、FD、輪胎幾何及設定 reference 必須來自可追溯的遊戲設定或量測，不從當前 profile 或匯入動作補值。
4. **獨立確認目前配置**：使用空白的 JSON 欄位輸入 `identity` 與 `cvtConfiguration`；格式範例只有 null／unknown，不預填匯入 metadata。即時 ordinal／PI/Class 有完整來源時優先使用即時身分；離線則使用玩家獨立輸入的身分。carId 始終由目前選取車輛提供。Rust 比對完整設定，不能只確認一個 checkbox 就把 capture 當成當前設定。
5. 只有 owner 回報 capture qualified 且已獨立確認目前配置時，開放呼叫既有 immutable 保存 POST。回傳 evidence ID 後以 `saved-cvt` 重播；更改車輛、身分、profile 或 baseline setup 會清除選取及確認，A→B→A 也須重新操作。尚未完成的 file/read/save 回覆不能重新綁定舊狀態。

此為既有來源匯入，**沒有 live CVT recorder**。`tuning-capture/v1` 的 ICE／EV 記錄不會自動轉換成 CVT。來源檔保留在原位置；匯入與保存只傳送未補值的 JSON，不覆寫來源。

目前設定使用完整 CVT configuration JSON，屬最小可驗收入口；分欄引導表單、live recorder 與原始來源轉換器為後續工作。

## Owner 與存取

| 入口 | 行為 |
| --- | --- |
| `GET /api/tuning/cvt-evidence` | `cvt-evidence-list/v1`：只列 metadata，SQL 移除 `capture.frames`，不載入整段幀資料或信任 qualification cache |
| `GET /api/tuning/cvt-evidence/{evidenceId}` | `cvt-evidence-read/v1`：回傳 immutable raw JSON；檢查保存 envelope schema／kind／workflow／ID |
| `POST /api/tuning/cvt-evidence` | 原有資格通過才保存的契約，未重建 |
| workflow HTTP／MCP／CLI | 原有同一個 `EvidenceService`，saved-cvt 每次重新驗證 raw |

`RoadStore` 的 discovery 與 read 都使用 SQLite read-only flags。不存在、空白、損壞或缺少 table 的冷庫讀取失敗，不建立庫、不改檔案。正常 WAL reader 可能有 `-wal`／`-shm` 輔助檔生命週期；主資料庫及其他 durable bytes 保持不變。evidence ID 只作參數化 SQL 值，不形成外部檔案路徑。沿用原有資料目錄與存取邊界。

Companion 透過原有 desktop workflow relay 顯示同一 Rust 結果；證據匯入／保存 UI 只在桌面掛載，不增加 LAN 白名單或遠端寫入能力。ICE／EV 未選 CVT 時不執行 discovery，保持原有 replay 契約。共用 `TuneSessionProvider` 僅新增 CVT session 與 snapshot 接線；`TuningView` 只在既有 Step 3 注入該 session，未修改全局選車入口。

## 驗證與限制

- [Rust 契約](../../backend-rust/tests/cvt_foundation_contract.rs)：保存、owner restart、cold discovery／read、錯誤冷庫、非法 ID、unknown／損壞 schema、stale 身分／設定、來源缺漏，以及 HTTP／MCP／CLI 同結果。全部 CVT fixture 明示 synthetic，不能當作真實量測。
- [Mounted desktop 契約](../../frontend/src/features/tuning/TuneSessionProvider.cvt.test.tsx)：import／saved 選取、來源提示、空白確認、獨立確認傳輸、live identity 優先、設定變更、A→B→A、過期回覆與錯誤 schema。
- 完整 frontend／Rust default 與 no-default-features、build、Rust fmt、Ruff、path case、版本一致性及 diff checks 由 PR body 記錄 exact head 與結果。既有 fixtures／車檔只讀，未改 hash；本工作區沒有使用者保存的實車資料庫。
- **NOT_RUN：真實 CVT 遊戲／設備 gate。** 需至少一台確認為 CVT 的車款／ordinal、PI/Class、改裝與設定 reference、FD 與可見範圍、可信輪胎幾何與 ratio 限位、遊戲／記錄器版本，以及可追溯 raw UDP／session 入口。目前環境沒有遊戲、車輛設定來源或設備，不能宣稱擷取、套用或重測成功。
- **NOT_RUN：瀏覽器視覺、窄畫面／主題及原生 Companion 設備 gate。** 既有 Chromium sandbox helper 配置阻止啟動；未改權限或停用 sandbox。mounted 測試不能替代視覺或裝置驗收。

solver、ratioPreview、gearing、recommendation 維持 unavailable／null，readiness 的 measuredEngine／gearingAvailable 維持 false。沒有新增效率、幾何、限位先驗值或賽事偏置。Issue 保持 open，這份交付不關閉 FH6 遊戲階段。
