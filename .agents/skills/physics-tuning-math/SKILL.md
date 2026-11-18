---
name: physics-tuning-math
description: 當新增、修改車輛物理計算（懸吊、彈簧、防傾桿 ARB、阻尼 Critical Damping、AEGO 齒輪比）或診斷邏輯時觸發此技能。
---

# 車輛物理與調校演算法規範

## 單一 owner 與版本

推薦數字、資格、預設、限制與診斷由 Rust `backend-rust/src/tuning/` 擁有；UI 只處理草稿、導覽、顯示與單位。TypeScript 凍結公式、舊 CLI／MCP quick solver 與 Developer Tuning 已移除，不得新增前端或舊版本 fallback。

- 現行 ICE：Road `aego-road-launch-envelope/v3`、Rally `aego-rally-joint/v1`、Drift `aego-drift-working/v1`、Drag `aego-drag-joint/v1`；各自保有目標與硬約束。
- DangerSign 只保留現有必要路徑，不是第五個 AEGO 模型或獨立項目。
- `chassis_load.rs` 是 Road／Rally 工程基準；`chassis.rs` 仍服務現行 schema v1 與其他模式。不可因歷史 wire ID 或舊命名誤刪仍使用的數值策略。
- EV／CVT、底盤、workflow schema、量測 reducer 與齒比模型版本彼此獨立；不能只升級一個共用版本並改寫舊記錄。
- 保存推薦必須從原始合格證據重建比對。已退役 ICE 只可封存檢視／匯出；版本字串不是可選 solver。未知或錯配 ID 不能選到 latest。

## 數值與證據原則

1. 公式為確定性的純函式，無全域狀態或 I/O。60Hz 接收路徑不得做重播、同步檔案或高成本工作。
2. 釐清遊戲原生、領域與顯示單位。逆向先驗需揭露來源、適用範圍與未驗證假設。
3. 新模型對缺失、非有限及非法必要輸入回 unavailable。合法目標受限時保留目標與原因，不靜默改目標或補造量測。
4. Drift 要求使用者主檔、工作 RPM 與輪速；輪速不是滑移中的地速，峰值不能宣稱完整合格工作帶。
5. 等價重配須同時滿足原目標與既有 observed 硬體範圍，更新實際值／誤差，不得放寬原鎖定。
6. 原21 tuning／10 EV fixtures不改值或容差；現行模型使用有來源的各自基準。退役 solver 或過渡測試在充分確認不能接通後可移除，不為維持 pass 數保留死套件，也不能更新舊數字偽裝相容。

## 正式入口與驗證

`fh6-agent solve workflow --args-file workflow-request.json --data-dir <資料目錄> --json` 與 HTTP／桌面／Companion／MCP `calculate_tuning_workflow` 共用 Rust owner。量測推薦需合格 saved evidence 或可重播原始 capture，不能使用裸峰值。

- Rust：`cargo test --locked --manifest-path backend-rust/Cargo.toml`；平台功能另驗證 `--no-default-features`。
- 前端：`pnpm -C frontend test` 與影響範圍的 build；UI 截圖遵循 ui-visual-review。
- 分開報告程式契約、瀏覽器、原生裝置與遊戲 A/B。有限數字、available 或 CI 成功不代表性能最佳。

參考：[調校責任契約](../../../docs/contracts/tuning_responsibilities.md)、[現行獨立版本](../../../docs/tuning/aego-version-contract.md)、[歷史封存與移除範圍](../../../docs/tuning/model-retirement.md)、[底盤基準](../../../docs/tuning/chassis-engineering-baseline-v1.md)。
