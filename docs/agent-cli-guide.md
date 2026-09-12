# FH6-HorizonTuner Agent CLI 使用指南 (fh6-agent)

`fh6-agent` 是一個專為 **AI Agent**（如 Antigravity、Codex、Jules、本機自動化腳本、終端 LLM 代理等）設計的命令列工具。此工具旨在配合專案現有的 **MCP (Model Context Protocol)** 伺服器與 **前端 UI (Tauri / React)**，使 AI Agent 能夠更高效、更直覺地參與調校工作流（底盤與齒比算牌）、監控即時遙測數據、執行閉環操控診斷，並進行 Preset 配置管理。

---

## 核心設計理念與架構特性

1. **極度穩定性 (Long-Term Invariant)**：
   - 採用 Python 3.13 標準庫核心實作，**零額外 pip 第三方依賴**。
   - 與後端透過標準 HTTP REST 與 MCP JSON-RPC 2.0 協議解耦，內部重構不會影響 CLI 契約。原則上非新增重大功能，日常無需修改維護。
2. **離線與線上雙模式 (Offline & Online Dual Mode)**：
   - **離線純算牌模式**：當後端未啟動時，CLI 依然能直接載入車輛資料庫進行車型查詢、底盤物理算牌、AEGO 齒比計算與 Preset 讀寫。
   - **線上即時模式**：當後端啟動時，自動感知 `logs/web_port.txt`（相容動態埠），可即時擷取 60Hz 遙測快照、調用閉環操控診斷，並與後端 REST/MCP 狀態即時雙向同步。
3. **單一自包含二進位發行支援 (Standalone Binary & Sidecar Ready)**：
   - 內建完整 `sys.frozen` 相容層與 `fh6-agent.spec` 打包規格。
   - 可一鍵編譯為單一執行檔 `fh6-agent.exe`，作為 GitHub Release Asset 直接下載使用，或作為 Tauri Sidecar 隨附分發，於無 Python 環境的電腦上獨立運作。
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

### 方式 C：標準 uv 虛擬環境調度
遵循專案 Python 工具鏈規範：
```powershell
uv run --no-project --python .venv\Scripts\python.exe -m backend.agent_cli <subcommand> [options]
```

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
  "app_version": "11.45.17",
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

完全對齊前端 `tuningMath.ts` 與後端 MCP 服務之純物理純函數算牌演算法。

#### (1) 底盤物理算牌 (`solve chassis`)
計算前後防傾桿 (ARB)、前後彈簧磅數（lbs/in 與 kgf/mm）、車高建議、前後回彈/壓縮阻尼、定位角度與差速器配置。

```powershell
# 手動指定物理參數
.\fh6-agent.bat solve chassis --weight 1450 --bias 52 --drive AWD --goal road --json

# 自動從車輛資料庫帶入車重與配重
.\fh6-agent.bat solve chassis --car-id 302 --goal drift --json

# 匯出前端 Step 5 AppliedSetupTable 相容格式
.\fh6-agent.bat solve chassis --weight 1350 --bias 54 --drive RWD --export-applied-setup --json
```

**支援賽事目標 (`--goal`)**：
- `road`：公路 / 環道賽事（平衡抓地力與側傾控制）
- `drift`：甩尾漂移賽事（低回彈、前大負外傾、100% 差速鎖定）
- `rally`：拉力 / 越野賽事（高行程、軟化 ARB、柔和阻尼）
- `drag`：直線加速賽事（前低後高 Forward Rake、後硬 ARB 抑制起步歪斜）

#### (2) AEGO 幾何齒比算牌 (`solve gearing`)
依據引擎紅線轉速、最大馬力轉速與目標極速，求解幾何等比遞增之最佳動力帶齒比與終傳比 (Final Drive)。

```powershell
.\fh6-agent.bat solve gearing --max-rpm 8500 --peak-hp-rpm 7800 --top-speed 320 --gears 6 --json
```

#### (3) 整車一鍵算牌與 Preset 儲存 (`solve full`)
一鍵完成全套底盤與齒比算牌，並支援直接儲存為 Preset。儲存之檔案與前端 UI 完全互通！

```powershell
# 算牌並儲存為 'base_road' 預設
.\fh6-agent.bat solve full --car-id 302 --vehicle-class S1 --weight 1380 --bias 58 --drive FWD --goal road --save base_road --json
```
儲存後，啟動前端 UI 進入 `TuningView`，下拉選單即會出現該項 Preset，點擊即可一鍵載入！

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

#### (2) 閉環操控診斷 (`diagnose`)
根據實時 4 輪胎溫與軸溫差（$\Delta T_{\text{axle}}$），或駕駛回報的過彎動態症狀，給出精確可執行的具體調校微調步驟。

```powershell
# 自動依據當前實時胎溫進行熱平衡評估
.\fh6-agent.bat telemetry diagnose --json

# 結合駕駛反饋（如入彎推頭 understeer_entry）給予調校建議
.\fh6-agent.bat telemetry diagnose --symptom understeer_entry --json
```

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

若 Agent 在沒有 MCP 連線通道的終端環境下，可透過本命令直接調用後端內建的 26 項 MCP 工具：

```powershell
.\fh6-agent.bat mcp-call run_dev_tuning_solver --args '{"car_params":{"weight_kg":1450,"front_weight_bias":0.52,"drivetrain":"AWD"},"purpose":"road"}' --json
```

---

## 獨立二進位檔編譯說明 (PyInstaller)

若要將 `fh6-agent` 打包為單一自包含執行檔以供 Release 發行或作為 Sidecar：

```powershell
# 透過 uv 執行 PyInstaller 打包
uv run --no-project --python .venv\Scripts\python.exe pyinstaller fh6-agent.spec
```

產物將生成於 `dist/fh6-agent.exe`，體積輕巧且內嵌車輛資料庫，可在任何乾淨的 Windows 機器上獨立運作。

---

## AI Agent Prompt 整合指引範例

在賦予 AI Agent 使用本工具時，可於 Agent System Prompt 中加入以下指導：

```markdown
You have access to the FH6-HorizonTuner CLI tool (`.\fh6-agent.bat` or `fh6-agent.exe`).
Always append `--json` to retrieve structured, machine-readable output.

Standard Tuning Workflow:
1. Inspect connection: `.\fh6-agent.bat status --json`
2. Search vehicle baseline: `.\fh6-agent.bat cars search "<car_name>" --json`
3. Generate initial tuning setup: `.\fh6-agent.bat solve chassis --car-id <id> --goal <road|drift|rally|drag> --json`
4. Calculate gearing: `.\fh6-agent.bat solve gearing --max-rpm <rpm> --peak-hp-rpm <rpm> --top-speed <speed> --json`
5. Save full tune to preset: `.\fh6-agent.bat solve full --car-id <id> --goal road --save agent_v1 --json`
6. Check telemetry & closed-loop diagnosis: `.\fh6-agent.bat telemetry diagnose --json`
```
