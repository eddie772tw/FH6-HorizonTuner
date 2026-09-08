# 網路連接埠傳輸契約 (Network Port Contract)

本專案將「Forza 遊戲遙測封包傳輸」與「本機應用程式 API / WebSocket 服務」嚴格分離為不同通訊協定與連接埠：

| 服務項目 | 傳輸協定 | 開發模式預設值 | 環境變數設定 | 職責與用途 |
| :--- | :--- | :--- | :--- | :--- |
| **Forza Data Out 遙測接收器** | UDP | `127.0.0.1:8000` | `TELEMETRY_IP`, `TELEMETRY_PORT` | 接收 Forza 遊戲 60Hz 324-byte 二進位封包 |
| **FastAPI REST / WebSocket 伺服器** | HTTP / WS over TCP | `127.0.0.1:8001` | `BACKEND_PORT` | 提供前端 UI 數據查詢與即時廣播 |

---

## 核心不變量與防混淆規範

1. **UDP 與 HTTP 端點嚴格隔離**：
   - Forza 遊戲內部 Data Out 設定必須指向 UDP 埠（預設 `8000`）。
   - 前端 (Tauri / React) 與所有外部 API 客戶端**只能連線至 HTTP/WebSocket 埠（預設 `8001`）**。
   - **嚴禁將 `8000` 作為 HTTP URL 呼叫**（例如 `http://127.0.0.1:8000/api/...` 為嚴重錯誤，會導致連線失敗）。

2. **Portable Release 動態連接埠機制**：
   - 在單檔便攜發行版（Portable Release）中，FastAPI 後端會在啟動時動態選取可用的本機 TCP 埠，防止多執行個體或與既有系統服務衝突。
   - Tauri 主機與外部整合透過 **Sidecar Readiness Event** 或讀取 `logs/web_port.txt` 取得實際分配之 HTTP 埠。
   - **UDP 遙測端口在 Release 模式下依然維持固定配置（預設 `8000`）**，不受動態 TCP 埠影響。

3. **連接埠變更 SOP**：
   - 若需調整任一連接埠，必須同步更新對應環境變數（`TELEMETRY_PORT` 或 `BACKEND_PORT`）與所有使用該通訊的客戶端設定。
