# 資源與開發資料目錄

產品後端、MCP 與 Agent CLI 均位於 `backend-rust/`。此目錄只保留車庫資料與預設車輛參數，並沿用開發模式既有資料路徑，避免更換後端時遺失設定、Preset 或錄製資料。

- `car_database.json`、`car_params/default_car.json` 由 Rust build.rs 嵌入。
- 維護車庫使用 `scripts/update_car_db.py`；它是選用的開發工具。
- 不要清除本目錄下未追蹤的使用者資料。Python 後端參考及測試可由 Git 基準 `ec7d769` 查閱；黃金輸出留在 Rust 契約測試中。
