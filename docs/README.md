# 文件索引

本目錄依用途區分操作指南、技術參考、校準作業與歷史紀錄。開始新工作時，先從下表選擇入口；不要將歷史計畫的完成標記視為目前版本的驗證結果。

## 依任務查找

| 需求 | 入口 |
| --- | --- |
| 啟動 Full／Lite 開發環境、打包 | [開發啟動指南](guides/development.md) |
| Windows／Linux 發行、LAN Data Out 與獨立 OTA | [跨平台發行指南](guides/cross-platform-release.md) |
| Rust 後端架構、遷移契約與測試分層 | [Rust 後端指南](backend-rust/README.md) |
| Python 效能工作如何由 Rust 承接、單機量測與資料完整性證據 | [效能承接盤查](backend-rust/performance-inheritance.md) |
| 匯出檔案、另存新檔與儲存位置 | [檔案匯出指南](guides/file-exports.md) |
| 使用 Agent CLI | [CLI 操作指南](guides/agent-cli-guide.md) |
| 連接 MCP | [MCP 設定指南](guides/mcp-setup-guide.md) |
| 安裝自訂 HUD | [可攜版 HUD 套件](guides/portable-custom-hud.md) |
| R34 原廠 V·spec 儀表、NISMO MFD Ver.II 適配與驗證 | [R34 MFD 原型契約](hud/r34-mfd.md) |
| 查看 HUD 技術參考 | [Stack ST8100 外觀、設定與遙測契約](hud/stack-st8100.md)、[S650 媒體欄位契約](hud/s650-media-properties-contract.md)、[FH6 畫面安全區觀測](hud/fh6-ui-safe-zones.md) |
| 開始調校開發 (Rust SSOT) | [調校程式與驗證入口](tuning/README.md)、[Road v3 起步模型](tuning/aego-road-launch-v3.md) |
| 前端主題、CSS 架構、擴充與送審驗證 | [主題與設計系統開發指南](frontend/design-systems.md) |
| 查閱 2026-09-24 版型一致化背景 | [版型研究與階段紀錄](frontend/ui-layout-refinement-20260924.md) |
| 收集實機資料、規劃人工驗收 | [校準資料與流程](calibration/README.md) |
| 查找外部 HUD 研究 | [外部專案參考索引](reference-projects/README.md) |
| 查找版本發行紀錄 | [v1.7.1](releases/v1.7.1.md)、[v1.6.2](releases/v1.6.2.md)、[v1.6.1](releases/v1.6.1.md)、[v1.6.0](releases/v1.6.0.md)、[v1.5.2](releases/v1.5.2.md)、[v1.4.4](releases/v1.4.4.md) |
| 查找舊計畫、研究與搬移位置 | [歷史文件與路徑對照](archive/README.md) |

## 維護原則

- 根目錄只保留本索引；新文件放入對應主題，不再新增平行的總計畫或交接總表。
- `guides/` 放操作步驟，`hud/` 放契約與畫面參考，`tuning/` 放調校開發入口，`calibration/` 放採樣與驗收流程。
- `reference-projects/` 保留外部專案的研究快照；`releases/` 保留版本紀錄；`archive/` 保留已結束階段或具時效性的研究、計畫與調查。
- 文件應分開描述「程式已存在」「本地測試通過」與「實機驗證通過」。日期、測試數量及版本敘述只對原記錄有效；重新開發時需重新驗證。
- 校準資料目錄與模板路徑由工具使用，維持 `calibration/in_game_captures/`、`fixtures/`、`unverified/`、`templates/` 不變。
- 搬移文件時同步更新有效連結，並在[路徑對照](archive/README.md#舊路徑對照)保留舊檔名的查找方式；不改寫歷史 Journal 的原始紀錄。

代理規範由 [AGENTS.md](../.agents/AGENTS.md)、[rules](../.agents/rules/) 與 [skills](../.agents/skills/README.md) 維護；經驗與決策記錄位於 [Journal](../.agents/Journal.md)。本索引不複製其規則。被 Git 忽略的本地 `ref/` 參考包另行保存，不是閱讀本索引的必要依賴。
