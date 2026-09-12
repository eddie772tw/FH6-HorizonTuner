# 外部 HUD 專案參考索引

本區保留源自 Drift HUD／PR#185 研究的五份外部專案快照，供後續設計比較。這些是歷史研究，不是目前的開發範圍、功能移植計畫或上游最新狀態；原 PR 的實作範圍另見 [歷史計畫](../archive/hud/telemetry-hud-implementation-plan.md)。

## 研究快照

| 專案 | 記錄的 Snapshot | 當時記錄的授權 | 可查找的主題 |
| --- | --- | --- | --- |
| [Horizon HUD](horizon-hud.md) | `bd01ad0d644252824f82560f0ecbef50d6d6951d` | Proprietary personal/non-commercial | primary／secondary 資訊階層；README 層級概念 |
| [ONYX Drive HUD](onyx-drive-hud.md) | `3677d149d877a3872b38f2ec1f910efe3beb6fe4` | MIT | 儀表卡、單位切換與 grip warning 分級 |
| [FH6 Telemetry Dashboard](fh6-tel.md) | `7ffeb0812f9f240653620ed3ecb0d2266b8d94ab` | MIT | 小尺寸輪胎／懸吊狀態的資訊密度 |
| [Forza Data Tools](forza-data-tools.md) | `73f8f7058479bf1c17fd9460e2cf379207d1cd2d` | GPL-3.0 | latest-frame 與 backpressure 概念 |
| [Forza Telemetry](forza-telemetry.md) | `88aa7d59ac2684e16ef57862555c93f2af1a7ce3` | MIT | torque／steer／speed 型別及即時、錄製更新頻率的差別 |

## 使用方式與邊界

- 各專案頁保留上游來源及具體觀察；先閱讀本地摘要，不以仍有原分支或本地 clone 為前提。
- 上表是研究時的授權紀錄，未在本次文件整理中重新核驗。考慮採用程式或資產前，須重新確認對應版本的授權及本專案相依規範。
- 本區只作概念研究；本次整理不引入外部 code、CSS、圖片、字型、地圖或車輛資料。
- 歷史建議中的 HUDCore／onFrame、單位投影及資料流邊界，需對照目前程式重新確認；不沿用舊 PR 的「下一步」作為新任務指令。

其他技術與操作文件見 [文件索引](../README.md)。
