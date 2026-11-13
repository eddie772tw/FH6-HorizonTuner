# FH6-HorizonTuner Agent CLI 使用指南 (fh6-agent)

`fh6-agent` 是一個專為 **AI Agent**（如 Antigravity、Codex、Jules、本機自動化腳本、終端 LLM 代理等）設計的命令列工具。此工具旨在配合專案現有的 **MCP (Model Context Protocol)** 伺服器與 **前端 UI (Tauri / React)**，使 AI Agent 能夠更高效、更直覺地參與調校工作流（底盤與齒比算牌）、監控即時遙測數據、執行閉環操控診斷，並進行 Preset 配置管理。

---

## 核心設計理念與架構特性

1. **極度穩定性 (Long-Term Invariant)**：
   - 採用 Rust，使用共用車庫資源及有時限的 HTTP client，無 Python runtime。
   - 與後端透過標準 HTTP REST 與 MCP JSON-RPC 2.0 協議解耦，內部重構不會影響 CLI 契約。原則上非新增重大功能，日常無需修改維護。
2. **離線與線上雙模式 (Offline & Online Dual Mode)**：
   - **離線純算牌模式**：當後端未啟動時，CLI 依然能直接載入車輛資料庫進行車型查詢、底盤物理算牌、AEGO 齒比計算與 Preset 讀寫。
   - **線上即時模式**：當後端啟動時，自動感知 `logs/web_port.txt`（相容動態埠），可即時擷取 60Hz 遙測快照、調用閉環操控診斷，並與後端 REST/MCP 狀態即時雙向同步。
3. **單一自包含二進位發行支援 (Standalone Binary & Sidecar Ready)**：
   - Cargo 直接編譯 `fh6-agent.exe`，車庫資料嵌入執行檔；同時保留 `--data-dir` 與動態埠探索。
   - 可獨立運作；開發模式沿用 repository／backend 資料路徑，release 預設使用執行檔所在目錄。
4. **AI Agent 第一優先 (Agent-First)**：
   - 所有子命令均支援 `--json` 輸出純淨、可預測的 JSON 結構（無 ANSI 顏色字元干擾）。
   - 標準 Exit Code（`0` 成功，`1` 業務/連線失敗，`2` 引數解析錯誤）。

---

## 快速上手與執行方式

### 方式 A：Windows 便捷批次檔（推薦）
在專案根目錄直接執行：
```powershell
.\fh6-agent.bat <subcommand> [options]
```

### 方式 B：獨立二進位檔（Release Build）
從 Release 下載或打包產出的單一執行檔：
```powershell
.\fh6-agent.exe <subcommand> [options]
```

### 方式 C：Cargo 原始碼入口

```powershell
cargo run --locked --manifest-path backend-rust/Cargo.toml --bin fh6-agent -- <subcommand> [options]
```

所有結果均為可閱讀的 JSON，`--json` 保留為相容旗標。正式調校使用 `solve workflow` 與合格原始證據；舊 `solve chassis/gearing/full`、`telemetry diagnose` 已退役，只回明確錯誤。`telemetry snapshot` 保留原始觀測，Preset 路徑不可跳出資料目錄。

---

## 子命令完整手冊

### 1. 服務與遙測狀態自檢 (`status` / `doctor`)

探測 HorizonTuner 後端、MCP 端點、動態 HTTP 端口以及 UDP 遙測信號接收狀況。

```powershell
.\fh6-agent.bat status
```

**JSON 格式輸出（Agent 適用）：**
```powershell
.\fh6-agent.bat status --json
```
```json
{
  "cli_version": "1.0.0",
  "app_version": "11.45.19",
  "backend_url": "http://127.0.0.1:8001",
  "backend_running": true,
  "mcp_enabled": true,
  "mcp_endpoint": "http://127.0.0.1:8001/mcp",
  "telemetry_udp_port": 8000,
  "telemetry_receiving": true,
  "is_race_on": true,
  "current_speed_kmh": 182.4,
  "mode": "online"
}
```

---

### 2. MCP 客戶端配置生成 (`mcp-config`)

自動感知目前運行的後端 HTTP 端口（即使在動態埠下），產出適用於各 AI Agent 客戶端的正確設定片段。

```powershell
# 檢視所有支援之客戶端配置
.\fh6-agent.bat mcp-config

# 輸出 Codex 註冊指令
.\fh6-agent.bat mcp-config --client codex --json

# 輸出 Claude Desktop 配置 JSON
.\fh6-agent.bat mcp-config --client claude --json
```

---

### 3. 車輛資料庫查詢 (`cars`)

快速檢索車輛資料庫，獲取車輛序號 (Ordinal ID)、車重、軸重比、驅動方式等物理參數。

```powershell
# 搜尋車型
.\fh6-agent.bat cars search "Civic" --limit 5 --json

# 依驅動方式過濾
.\fh6-agent.bat cars search "Porsche" --drive AWD --json

# 查詢特定車輛規格
.\fh6-agent.bat cars get 247 --json
```

---

### 4. 調校算牌核心 (`solve`)

正式工作流：

```powershell
.\fh6-agent.bat solve workflow --args-file workflow-request.json --data-dir <資料目錄> --json
```

新 JSON request 使用 `schemaVersion: "tuning-workflow-result/v2"`（v1 保留歷史 chassis 語意），包含 `goal`、`season`、完整 `profile`、`inputSnapshot.carId` 與 `evidence`。本地已存 ICE 證據使用 `{"kind":"saved-engine","observationId":"..."}`；EV 使用 `{"kind":"saved-ev","evidenceId":"..."}`。亦可傳完整 `engine-capture`／`ev-capture` 原始資料，由相同 Rust library 重播資格；不能只填 RPM／功率峰值宣稱 measured。

CLI 與 MCP 是唯讀分析入口；正式保存由桌面／後端 API 確認 backend-issued evidenceId。舊 `solve chassis/gearing/full` 及其算牌／preset 寫入已退役，不再保留公式。請改用上方正式 workflow，不可把裸峰值當成合格證據。[移除範圍與封存處理](../tuning/model-retirement.md)。

---

### 5. 遙測監控與閉環診斷 (`telemetry`)

#### (1) 即時遙測快照 (`snapshot`)
擷取目前遊戲 60Hz UDP 封包的即時遙測值。支援分類讀取：

```powershell
# 讀取駕駛艙控制項輸入 (RPM, 檔位, 油門煞車離合, 轉向角)
.\fh6-agent.bat telemetry snapshot --category cockpit --json

# 讀取車輛動力學 G 力 (3軸加速度, 俯仰側傾, 馬力扭力)
.\fh6-agent.bat telemetry snapshot --category dynamics --json

# 讀取4輪輪胎狀態 (4輪溫度, 滑移角, 滑移率)
.\fh6-agent.bat telemetry snapshot --category tires --json

# 讀取4輪懸吊行程與觸底警報
.\fh6-agent.bat telemetry snapshot --category suspension --json
```

舊 `telemetry diagnose` 的快速處理建議亦已移除，不再從少量胎溫推定精確算牌指令；觀測資料可透過上述 snapshot 工具檢視。

---

### 6. 調校預設管理 (`preset`)

管理本地 `tunings/` 目錄與後端儲存的調校設定檔案。

```powershell
# 列出所有預設
.\fh6-agent.bat preset list --json

# 讀取特定車輛的調校細節
.\fh6-agent.bat preset get 302 base_road --json
```

---

### 7. MCP 工具直接調用 (`mcp-call`)

若 Agent 在沒有 MCP 連線通道的終端環境下，可透過本命令直接調用後端內建的現行 MCP 工具：

```powershell
.\fh6-agent.bat mcp-call get_tuning_model_priors --args '{}' --json
```

---

## 獨立二進位檔編譯說明 (Cargo)

若要將 `fh6-agent` 打包為單一自包含執行檔以供 Release 發行或作為 Sidecar：

```powershell
cargo build --locked --release --manifest-path backend-rust/Cargo.toml --bin fh6-agent
```

產物位於 `backend-rust/target/release/fh6-agent.exe`；`scripts/build_backend.ps1` 另複製至 `dist/fh6-agent.exe`。Linux 產物名稱為 `fh6-agent`。車庫已嵌入，離線指令不需啟動應用程式。

---

## AI Agent Prompt 整合指引範例

在賦予 AI Agent 使用本工具時，可於 Agent System Prompt 中加入以下指導：

```markdown
You have access to the FH6-HorizonTuner CLI tool (`.\fh6-agent.bat` or `fh6-agent.exe`).
Always append `--json` to retrieve structured, machine-readable output.

Standard Tuning Workflow:
1. Inspect connection: `.\fh6-agent.bat status --json`
2. Search vehicle baseline: `.\fh6-agent.bat cars search "<car_name>" --json`
3. Obtain the complete profile and saved evidence ID or original capture; never invent hidden inputs.
4. Calculate the formal recommendation: `.\fh6-agent.bat solve workflow --args-file workflow-request.json --data-dir <data-root> --json`
5. Review readiness and qualified evidence before saving through the application.
6. Inspect live telemetry (legacy diagnostic contract): `.\fh6-agent.bat telemetry diagnose --json`
```
