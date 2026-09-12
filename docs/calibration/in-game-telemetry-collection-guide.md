# FH6 實機遙測測試與資料收集作業手冊 (In-Game Telemetry Collection Guide)

本手冊定義 FH6-HorizonTuner 進行實機遙測數據收集、A/B 單一變因測試與校準數據歸檔的標準作業程序 (SOP)。所有收集到的數據將作為 Phase 4（輪胎/懸吊物理模型）與 Phase 5（賽事 Solvers）演算法調校的 Single Source of Truth。

---

## 1. 測試前置檢查清單 (Pre-Flight Checklist)

在開始任何資料收集前，請確認以下項目：

### A. 遊戲端設定
1. **遙測輸出 (Data Out)**：
   - 進入 Forza 遊戲設定 → **音效/HUD (Audio/HUD)** → **遙測輸出 (Data Out)**：開啟 (ON)。
   - **IP 位址 (Data Out IP Address)**：`127.0.0.1`（若雙設備測試，請填入執行 Horizon Tuner 設備的區域網路 IP）。
   - **連接埠 (Data Out IP Port)**：`8000`。
   - **資料格式 (Data Out Packet Format)**：`CarDash` 或 `FM8/FH5/FH6 Telemetry`。
2. **駕駛輔助設定 (Assists)**：
   - **變速箱 (Shifting)**：手排 (Manual) 或手排含離合器 (Manual w/ Clutch)（避免自排干擾轉速採樣）。
   - **循跡控制 (TCS) / 車身穩定 (STM)**：關閉 (OFF)（採樣純粹物理抓地力與滑移極限）。
   - **轉向輔助 (Steering)**：仿真 (Simulation) 或一般 (Normal)（紀錄時須於 Metadata 註明）。
   - **ABS 防鎖死**：依測試目的固定（建議一般開啟，直線煞車極限測試時記錄設定）。

### B. 軟體端設定
1. 啟動 `start_all.bat` 或後端服務。
2. 進入前端 **Settings → Developer Options**，開啟 **Use Developer Tuning View**。
3. 進入 **Tuning** 頁面，點擊右上角 **Open Telemetry Capture** 開啟錄製工具。
4. 若使用 AI 輔助分析，確認 MCP 狀態為已連接（`http://127.0.0.1:8001/mcp`）。

---

## 2. 單一變因 A/B 測試標準協議 (Single-Variable A/B Protocol)

為了確保數據具備科學可比較性，必須嚴格遵守單一變因控制原則：

```
[基線測試 Baseline] ──(修改單一變因)──> [候選測試 Candidate] ──(MCP compare_captures)──> [差異評估 Delta Analysis]
```

### 變因控制守則
1. **單次只變更一個參數**：
   - 範例 1（胎壓）：僅將前輪胎壓由 30.0 PSI 改為 32.0 PSI，其餘避震、傾角、齒輪比均保持不變。
   - 範例 2（改裝件）：僅更換防傾桿等級（原廠 → 競賽級），其餘零件不變。
2. **環境條件嚴格恆定**：
   - 同一輛車、同一個 PI / 車級。
   - 相同的賽道、路面（乾柏油 / 濕地 / 砂石路）、天氣與時間。
3. **駕駛動作一致性**：
   - 相同的起步油門方式（如彈射起步或怠速全油門）。
   - 相同的入彎剎車參考點與走線。
   - 固定的換檔轉速點。
4. **標準採樣流程**：
   - **第 1 圈（熱身圈）**：暖胎使胎溫進入工作區間（約 80°C ~ 100°C / 180°F ~ 210°F），不計入正式資料。
   - **第 2 ~ 4 圈（有效採樣圈）**：連續執行至少 3 次重複採樣。若發生打轉、撞牆或偏離賽道，該圈作廢並記錄為無效樣本。

---

## 3. 遙測錄製與匯出操作流程

1. **填寫 Metadata（錄製前必填）**：
   - **Car ID / Name**：車輛名稱與型號（如 `Toyota GR86 2022`）。
   - **Game Build**：遊戲版本號（若未知請填寫目前日期或版本）。
   - **Installed Parts**：改裝零件清單（如 `Race Suspension, Race ARB, Sport Tires`）。
   - **Tire Type**：輪胎種類（`Street`, `Sport`, `Semi-Slick`, `Slick`, `Rally`, `Drift`, `Drag`）。
   - **Surface & Weather**：路面與天候（`tarmac / dry`, `gravel / dry` 等）。
   - **Notes**：本趟測試假設與調整參數（例如：`Front Tire Pressure 32 PSI Baseline`）。
2. **開始錄製**：
   - 點擊 **Start Capture**。
   - 執行設定好的測試路線。
3. **停止與驗證**：
   - 測試完成後點擊 **Stop Capture**。
   - 檢視即時摘要面板：檢查樣本數 (Samples Count)、最大速度、平均採樣頻率（標準約 60 Hz）。
4. **下載與歸檔**：
   - 點擊 **Download JSON**（標準 `tuning-capture/v1` 檔案，供系統與 MCP 解析）。
   - 點擊 **Download CSV**（供 Excel / MoTeC 分析輔助）。
   - 將 JSON 檔案存放至 `docs/calibration/in_game_captures/` 目錄。

---

## 4. 檔案命名規範

所有實機擷取檔案統一使用以下命名格式：

```text
{CarModel}_{Drivetrain}_{TestType}_{Variable}_{Value}_run{Index}_{Timestamp}.json
```

**命名範例**：
- `GR86_RWD_TirePressure_Front32PSI_run1_20260814.json`
- `WRX_AWD_Suspension_BumpSoft_run2_20260814.json`
- `SilviaS15_RWD_Drift_RearDiff100_run1_20260814.json`
- `Mustang_RWD_Drag_FinalDrive373_run1_20260814.json`

---

## 5. MCP 唯讀服務輔助分析

錄製完成並歸檔後，可利用 MCP 工具進行 AI 驅動的自動化分析：

1. **資料品質檢查**：
   - 呼叫 `get_capture_summary(capture_id="GR86_RWD_TirePressure_Front32PSI_run1")`，驗證時間戳單調性與數據完整度。
2. **A/B 差異對比**：
   - 呼叫 `compare_captures(baseline_id="GR86_Front30PSI", candidate_id="GR86_Front32PSI")`，自動比對平均抓地力、側向 G 值峰值、滑移角均值與極速差異。
3. **局部時間窗口剖析**：
   - 呼叫 `query_capture_window(capture_id="...", start_sec=12.5, end_sec=16.0, channels=["slip_angle_fl", "lat_g", "steer"])`，針對特定彎道或起步瞬間進行微觀遙測比對。
