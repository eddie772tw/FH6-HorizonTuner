# FH6 調校校準資料庫與實機測試資料目錄 (Tuning Calibration Directory)

本目錄存放 FH6 遙測實機採樣數據、A/B 測試 Manifest、社群基準對照與物理校準檔案。

---

## 1. 目錄架構

```text
docs/calibration/
├── README.md                                # 本說明文件
├── in-game-telemetry-collection-guide.md    # 實機遙測測試與資料收集作業手冊 (SOP)
├── in-game-test-schedule-and-matrix.md      # 測試車輛梯隊矩陣與排程表
├── templates/                               # 資料與 Manifest 模板
│   └── capture_manifest_template.json       # A/B 測試 Manifest JSON Schema 範本
├── in_game_captures/                        # 實機產出的原始 tuning-capture/v1 JSON/CSV 檔案
├── fixtures/                                # 經過審核並提取為演算法基準的測試用例 (Fixtures)
└── unverified/                              # 待驗證或缺乏完整 Game Build / 改裝記錄的暫存數據
```

---

## 2. 資料置信度分級 (Confidence Levels)

所有納入校準體系的數據均標註置信度，嚴防未經驗證的數據污染生產物理模型：

- **`in_game_capture`（最高）**：
  - 由遊戲端開啟 UDP 遙測直接輸出，並透過 `TuningTelemetryCaptureView` 完整錄製。
  - 具備明確的 `carId`、`gameBuild`、改裝清單、路面天候與駕駛輔助設定。
  - 具備單一變因 A/B 對照與至少 3 次重複採樣。
- **`community`（中等）**：
  - 社群玩家回報之數據或截圖分享，附帶來源連結與部分改裝資訊。
  - 須經人工審核後方可作為候選參考，不可直接作為生產常數。
- **`unverified`（最低 / 預設）**：
  - 僅有分享碼或無遊戲版本之舊資料，預設標記為 `unknown`。

---

## 3. 實機測試與收集流程導引

1. **閱讀操作手冊**：參考 [in-game-telemetry-collection-guide.md](./in-game-telemetry-collection-guide.md) 設定遊戲 UDP 輸出與駕駛輔助。
2. **依排程選擇車型與項目**：參考 [in-game-test-schedule-and-matrix.md](./in-game-test-schedule-and-matrix.md) 挑選測試梯隊。
3. **錄製與匯出**：在開發者調校介面中錄製 `tuning-capture/v1` 檔案並儲存至 `in_game_captures/`。
4. **建立 Manifest 並利用 MCP 分析**：複製 `templates/capture_manifest_template.json` 記錄測試變因，透過 MCP 工具 `compare_captures` 評估改動效益。
