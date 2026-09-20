# Frontend IA：W4 候選與文件入口

本目錄的現行交接是 [W4-P8 candidate handoff](handoffs/w4-p8-candidate-20260920.md)。截至 2026-09-20，狀態為 **`candidate-pre-machine`**：W4 的指定 browser 工作與量測準備已交付，最後實機驗收仍未完成。

| 身分 | 固定值 |
| --- | --- |
| W4 candidate branch | `codex/frontend-ia-w4-20260920` |
| P8 candidate commit | `88cf28e6152c125c1cca18dc21c3c1f46e4fbcff` |
| 最後產品程式變更 | `30fedc3833383dc646c724fb918b19830c52451f`（P7-A） |
| W2/W3 integration parent | `147981c3ea0d68f146e0b2400d147e2346d7930e` |
| 文件清理分支 | `codex/frontend-ia-w4-doc-cleanup-20260920`；僅文件，沒有取代上述產品候選 |

這些是固定交付身分；再次工作前需讀取 live refs。cleanup 分支不代表 W4 已合併 `main`、通過 G5 或產生新的產品驗證。

## 現行 handoff 與證據

| 文件 | 用途與證據邊界 |
| --- | --- |
| [W4-P8 candidate](handoffs/w4-p8-candidate-20260920.md) | 最後實機 gate 的接手入口與 `not-run` 清單 |
| [W4 交付索引](handoffs/w4-plan-20260920.md) | 已完成里程碑與 exact commit；舊工作包已封存 |
| [W4-0 ledger](handoffs/w4-0-acceptance-ledger-20260920.md) | 鎖定當時的完整 acceptance snapshot；後續變更見其 Post-lock 段與 P8，不能把初始狀態當成最終狀態 |
| [P7-A adapter register](handoffs/w4-p7-a-adapter-register-20260920.md) / [browser reentry](evidence/w4-p7-a-browser-20260920.md) | Full provider owner 與有限重入；`reviewHistory` 仍是 `retained-gated` |
| [P7-B lifecycle](evidence/w4-p7-b-browser-lifecycle-20260920.md) | Full/Lite 已觀察的 canvas、page-owned requests 與 UI cleanup；不代表內部或 native 資源全數驗證 |
| [P7-C UI matrix](evidence/w4-p7-c-browser-ui-matrix-20260920.md) | 已測 theme、width、keyboard 與 layering 的 browser 範圍 |
| [P7-D protocol](evidence/w4-p7-d-measurement-protocol-20260920.md) / [baseline JSON](evidence/w4-p7-d-baseline-20260920.json) | 固定方法、環境及 `not-run` slots；沒有 X3 效能通過結論 |
| [P8 smoke](evidence/w4-p8-browser-smoke-20260920.md) | 已記錄 125 files / 884 tests、Full/Lite build 與 backend-disconnected browser smoke；本次文件清理未重跑 |
| [文件／refs cleanup handoff](handoffs/w4-doc-cleanup-20260920.md) | 文件修改範圍、remote 保留理由、驗證與 root 待決事項 |

## 仍未完成

以 P8 清單與各證據的實際 scope 為準。成功的 backend readback、儲存／重啟持久化、R1/R3/R4/R5 與完整 T1–T4 證據不得從 disconnected browser 畫面推得；`reviewHistory` 的移除條件仍有效。

Full/Lite Tauri、backend-ready/dynamic port、Windows HUD monitor/window/audio、真實 FH6 與 MoTeC、三組成對 X3 量測、same-head X4/G5 與 reviewer sign-off 仍是 `not-run`。locale catalog 補齊仍為獨立 maintenance。文件清理不調整任何 acceptance 結果。

## 歷史與引用規則

[歷史索引](archive/README.md) 收錄 W1/G2、W2/W3 的 handoff 與原 W4 工作包。舊檔保留原路徑與當時 evidence；頂端的 `superseded` 只取代舊進度／開工指令，不否定原測試結果、不解除 contract，也不把歷史 `not-run` 改為 `pass`。

W2/W3 refs 雖已包含於 W4，仍被 registered worktree 和 handoff 使用，本輪 **沒有刪除任何 remote branch/ref**。未追蹤的準備文件與其他 worktree 不在本次修改範圍。
