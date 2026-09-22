# Rust 後端遷移與測試

產品後端改為獨立的 `backend-rust` crate。Tauri／React 仍是獨立前端，維持既有 REST 路徑、三條 WebSocket、Forza UDP 輸入、SQLite 與 JSON 資料格式。此遷移的範圍是語言、程序與建置工具鏈，不重新分配既有業務職責。

## 模組與資料流

```text
Forza UDP → Tokio receive → bounded processing worker
                              ├─ telemetry / recorders / dyno / SQLite
                              ├─ Road observations and captures
                              └─ latest snapshot → JSON / binary WebSocket
React / HUD → HTTP → config / sessions / Road / MoTeC / MCP
Windows services → bounded workers → cached HUD snapshots
Tauri host → owned stdin / readiness → standalone sidecar
```

UDP socket 接收不執行同步磁碟寫入或原生 Windows 呼叫。處理工作有界；慢速 WS consumer 不會形成無限積壓。設定儲存先持久化再發布結果；檔案存取需通過資料目錄包含性檢查。

## 測試的完成基準

本次以輸入／輸出相容為本地驗證基準，不以內部類別名稱或 Python 實作細節鎖住 Rust 設計：

| 測試層 | 內容 | 入口 |
| --- | --- | --- |
| 黃金參考資料 | Python 產生的設定、HUD、PCM、MoTeC、MCP 與領域輸出 | `backend-rust/tests/fixtures/`、`backend-rust/tests/mcp_golden.json`、`tests/fixtures/telemetry/` |
| 純領域／資料契約 | 封包、128-byte binary、錄製轉移、SQLite 舊資料、Road、MCP、缺值與拒絕行為 | `cargo test --locked --manifest-path backend-rust/Cargo.toml` |
| 程序迴路 | 真實 sidecar、HTTP／multipart／UDP／WS、readiness、埠 fallback、stdin EOF | `cargo test --locked --manifest-path backend-rust/Cargo.toml --test process_contract` |
| 前端與打包 CI | 既有 Vitest／build、Windows Rust tests、Full／Lite executable metadata | GitHub Actions |
| 實機驗收 | 真實遊戲、原生音訊／GSMTC／Discord 與 GUI | 不由本地迴路結果推定 |

參考 fixtures 保留缺值與單位語義。CSV 與二進位輸出採精確比較；浮點領域轉換只在有理由時使用明確的數值容差。更新 fixtures 須核對 Python 輸入與預期行為，不能為了讓測試通過而重新產生錯誤基準。

參考資料產生器為 `scripts/generate_backend_contract_fixtures.py`、`scripts/generate_telemetry_contract_fixtures.py` 與 `backend-rust/tests/mcp_fixture_generator.py`，須透過 uv 選定 Python 執行。一般 `cargo test` 只讀取已提交 fixtures，不需要 Python。設定 `FH6_TEST_BACKEND_EXE` 為已建置的 sidecar 絕對路徑，可讓同一組 `process_contract` 驗證 release 執行檔。

原生 provider 的呼叫由固定 worker 持有；Discord 關閉最多等待兩秒，音訊／GSMTC 最多等待 100ms。若驅動或 IPC 永久掛起，程序結束時由作業系統回收，不能由本地契約測試推定原生 cleanup 或硬體功能已驗收。

## Python 保留用途

`backend/` 暫時作為遷移參考及選用 Agent CLI／維護工具；CI 仍驗證既有 Python 測試以防參考資料與工具退化。產品開發入口與 release packaging 已使用 Cargo，使用者執行檔不含 Python、uv、pip 或 PyInstaller。

後續移除參考實作應以保留的契約與 CLI 維護策略為前提。既有調校求解器與顯示單位職責的模糊／重複情況列於 [enhancement #423](https://github.com/eddie772tw/FH6-HorizonTuner/issues/423)，本次保留其輸出，不當成 bug 一併改寫。

建置使用 Cargo.lock，版本由 Tauri manifest 驗證，資源由 build.rs 嵌入。此變更移除 Python 打包步驟；沒有以這些測試宣稱特定百分比的效能提升。
