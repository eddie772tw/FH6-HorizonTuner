# FH6-HorizonTuner MCP (Model Context Protocol) 設定與使用指南

`FH6-HorizonTuner` 內建專屬的 **Localhost 唯讀 MCP Server**，支援 **雙傳輸模式（Stdio 子程序 + FastAPI HTTP/SSE 串流）**，讓 AI Agent（如 Antigravity、Claude Desktop、Cursor、Cline 等）能透過標準 MCP 協議結構化讀取遊戲即時遙測、歷史賽道單圈、實測擷取封包、車輛資料庫、改裝契約與調校計算求解器。

---

## 一、 快速啟動與傳輸方式

### 方式 A：FastAPI 內建 HTTP / SSE 串流通道（推薦 / 零設定）
當 FH6-HorizonTuner 主程式啟動時，FastAPI 後端會自動掛載 MCP SSE 服務：
- **SSE 端點網址**：`http://127.0.0.1:8000/mcp/sse` (或自訂 Port)
- **前端視覺化設定**：前往 `設定 (Settings)` → `開發者選項` → `MCP 伺服器面板`，可一鍵開啟/關閉服務、調整單次查詢樣本上限與一鍵複製連線代碼。

### 方式 B：獨立 Stdio 子程序模式
使用專案 Python uv 環境直接以命令列啟動：

```powershell
uv run --no-project --python .venv\Scripts\python.exe backend/mcp/server.py
```

---

## 二、 各 AI 工具 / IDE 設定方法

### 1. Claude Desktop 設定

編輯 Claude Desktop 設定檔：
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

在 `mcpServers` 區段中加入以下設定（亦可從 HorizonTuner 前端設定面板點擊「複製 Claude Desktop JSON」一鍵取得）：

```json
{
  "mcpServers": {
    "fh6-horizon-tuner": {
      "command": "d:\\FH6-HorizonTuner\\.venv\\Scripts\\python.exe",
      "args": [
        "-u",
        "d:\\FH6-HorizonTuner\\backend\\mcp\\server.py"
      ],
      "cwd": "d:\\FH6-HorizonTuner"
    }
  }
}
```

---

### 2. Cursor IDE 設定

1. 開啟 Cursor，前往 `Settings` → `Features` → `MCP Servers`。
2. 點擊 `+ Add New MCP Server`。
3. 填寫以下欄位：
   - **Name**: `fh6-horizon-tuner`
   - **Type**: `command` (stdio) 或 `sse`
   - **Command / URL**: `d:\FH6-HorizonTuner\.venv\Scripts\python.exe -u d:\FH6-HorizonTuner\backend\mcp\server.py` 或 `http://127.0.0.1:8000/mcp/sse`

---

### 3. VS Code / Roo Code / Cline 設定

編輯 `cline_mcp_settings.json` 或擴充套件的 MCP 設定檔：

```json
{
  "mcpServers": {
    "fh6-horizon-tuner": {
      "command": "d:\\FH6-HorizonTuner\\.venv\\Scripts\\python.exe",
      "args": [
        "-u",
        "d:\\FH6-HorizonTuner\\backend\\mcp\\server.py"
      ],
      "env": {
        "PYTHONIOENCODING": "utf-8"
      }
    }
  }
}
```

---

## 三、 支援的 MCP Tools（工具清單）

MCP Server 提供 26 個專屬唯讀工具，分類如下：

### 1. 遙測數據（完全對齊 TelemetryView 模組）
- `get_live_telemetry_snapshot`：取得最新 UDP 封包快照與管線狀態。
- `get_driver_cockpit_telemetry`：駕駛艙儀表（轉速 RPM、換檔警示、檔位、時速 km/h & mph、油門/煞車/離合器/手煞車/轉向角）。
- `get_vehicle_dynamics_telemetry`：車輛動力學（橫向/縱向/垂直 G力、姿態角 Pitch/Roll/Yaw、即時馬力 kW/HP、扭力 Nm/ft-lb、增壓值 PSI/bar、EV 動能回收）。
- `get_tires_status_telemetry`：四輪輪胎狀態（四輪胎溫 °C & °F、滑移角、滑移比 %、綜合滑移向量、過熱與打滑警示）。
- `get_suspension_telemetry`：四輪懸吊行程（0.0~1.0 正規化行程、觸底 `travel >= 0.95` 警示、側傾與俯仰差值）。

### 2. 賽道單圈與擷取封包
- `list_race_sessions`：列出 SQLite 儲存的歷史賽道錄製清單。
- `get_session_summary`：取得賽道 Session 的各單圈時間 (Lap Times)、極速與均速。
- `query_session_telemetry`：查詢特定單圈的時間序列點位（支援降採樣與指定通道）。
- `list_tuning_captures`：列出 `docs/calibration/` 中的實測 `tuning-capture/v1` 封包。
- `get_capture_summary`：取得擷取封包的中繼資料與數據品質診斷。
- `query_capture_window`：查詢局部時間窗口的高精度遙測數據。
- `compare_captures`：執行 A/B 跑圈差異對比（G力、滑移比、極速與時間差異）。

### 3. 直線加速與馬力機
- `list_drag_sessions`：列出直線加速測試清單。
- `get_drag_analysis`：取得 0-100、0-200 km/h、60ft、1/4 mile 加速成績與打滑分析。

### 4. 車輛資料庫與能力契約
- `search_cars`：搜尋 Forza 官方車輛資料庫。
- `get_car_details`：取得車輛原生規格（馬力、扭力、紅線轉速、車重、前後配重比）。
- `get_car_tuning_capabilities`：取得車輛在特定改裝配置下的能力契約（懸吊/防傾桿/差速器/齒比是否可調）。
- `get_tuning_constants_and_priors`：取得物理常數與基準自然頻率。

### 5. 調校計算求解器與閉環診斷
- `list_tuning_presets`：列出儲存的調校設定檔。
- `get_tuning_preset`：取得指定設定檔的調校參數。
- `run_dev_tuning_solver`：執行純物理調校計算（Road/Rally/Drift/Drag 算牌建議值）。
- `run_gearing_solver`：執行 AEGO 幾何動力帶齒比最佳化計算。
- `diagnose_telemetry_handling`：依胎溫與動態感受執行閉環微調診斷。

### 6. 系統設定與日誌
- `get_system_settings`：取得系統單位與通訊埠設定。
- `get_hud_configurations`：取得 HUD 儀表配置與音訊擷取裝置狀態。
- `get_recent_logs`：讀取後端即時執行日誌。

---

## 四、 支援的 MCP Resources（資源 URI）

可直接於 Agent 中按需引用以下 Resource URI：
- `fh6://telemetry/live`：即時遙測快照
- `fh6://telemetry/session/{session_id}`：特定賽道 Session 摘要
- `fh6://capture/{capture_id}`：特定擷取封包中繼資料
- `fh6://car/{car_id}`：車輛原生規格與能力契約
- `fh6://tuning/{car_id}/{save_name}`：特定調校設定檔內容
- `fh6://settings/current`：當前系統度量衡與配置

---

## 五、 常用 Agent 協作範例 Prompt

你可以直接對配置好 MCP 的 Agent 說：

1. **實測賽後分析**：
   > 「請透過 MCP 查詢最近一場賽道 Session 的單圈時間，並分析我在入彎時的四輪懸吊觸底與輪胎抓地力狀況。」
2. **調校算牌與齒比規劃**：
   > 「我正在調校 2024 Ford Mustang Dark Horse，請先用 MCP 查詢車輛規格，然後為我計算一套公路賽事（Road）的底盤調校與 AEGO 6 檔齒輪比。」
3. **A/B 跑圈對比**：
   > 「請使用 `compare_captures` 比對 `baseline_run_01` 與 `candidate_run_02` 兩次試駕封包，說明防傾桿加硬後橫向 G 值與出彎極速有何差異？」
