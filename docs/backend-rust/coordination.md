# Rust 後端遷移協作

- 分支：`codex/rust-backend`，基底 `9bf6bcba6988a18b18b9491599797a853ccad04e`。
- 目標：獨立 Rust HTTP/WS/UDP 服務，保持前端契約、既有 JSON 與 SQLite 資料相容，移除產品後端對 Python/PyInstaller 的執行期依賴。
- 本地驗證依使用者要求聚焦可觀察輸入與輸出，不以本輪結果宣稱遊戲或硬體驗收。
- 採用技能：`cross-agent-collaboration`、`modular-refactoring`、`telemetry-udp-protocol`、`portable-release-validation`、`pr-author-maintainer`。

| Owner | 寫入範圍 | 狀態 |
|---|---|---|
| root / Codex | crate manifests、runtime、HTTP/WS、設定/資源/安全、MCP/export、建置/CI/文件與整合 | active |
| telemetry_core / Luna | `backend-rust/src/telemetry/`、`backend-rust/tests/telemetry*`、`handoffs/telemetry.md` | 已交接 root |
| contract_inventory / Luna | `backend-rust/src/road/`、`backend-rust/tests/road*`、`handoffs/road.md` | 已交接；執行唯讀整合 review |
| native_services / Luna | `backend-rust/src/native/`、`backend-rust/tests/native*`、`handoffs/native.md`；後續獨立 `src/mcp/`、`tests/mcp*` | native／MCP 均已交接 root |

所有子代理在同一專屬 worktree 以不重疊目錄工作，只有 root 管理 Cargo 與 Git 交付。原始 `D:\FH6-HorizonTuner` 不寫入。子代理交接停止寫入後 root 才修改相同檔案。高頻 UDP 接收不得等候磁碟或 Windows 探查。
