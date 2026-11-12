# AEGO Rust 歷史基線與 TS 對照（2026-11-12）

來源基準 `1ddb092d90f3aca4c02c86d633e6cfe3e7fc587b`。這是 #652 的合成工程反例重播，不是遊戲擷取或四台實車；不宣稱實際可達速度、最佳起步、漂移分數或圈速。

`tests/fixtures/aego_rust_characterization_v1.json` 固定正式 Rust `calculate_aego_gearing`、`workflow::measured_gearing` 與相同輸入的底盤完整結果。11 案涵蓋 Road、Rally Mixed／Cross、Drift 200／400／600／1000 Nm、Drag 先驗／profile manual 40／secondary manual 40 與 DangerSign。每案保存完整 JSON 輸入、量測摘要及次要修正；量測摘要仍是合成值，不是合格 capture。正常 Cargo 測試不產生或更新 fixture。

共同輸入：1400 kg、前配重 55%、AWD、300 HP、400 Nm（Drift 敏感度案另列）、功率峰值 5000 RPM、扭力峰值 3500 RPM、最高 7500 RPM、6 檔、後輪 245/40R18、空力效率 0.5；彈簧範圍前後 3–16 kgf/mm，未提供其餘欄位維持該版本既有語意。沒有二次修正的案明確記錄 null。

## 本輪 Rust 實跑結果

| 案例 | FD | 完整檔位 | 判讀 |
| --- | --- | --- | --- |
| Road current | 3.43 | 3.63, 2.41, 1.68, 1.22, 0.92, 0.72 | 現行 Road v3 保持原值 |
| Rally Mixed | 3.52 | 2.70, 1.81, 1.21, 0.81, 0.54, **0.36** | 5000 RPM 末檔運動學約 **485.816 km/h**，遠離工程先驗約 187.441 km/h |
| Rally Cross | 3.92 | 2.70, 1.81, 1.21, 0.81, 0.54, **0.36** | 雖然 FD 方向較短，末檔仍被共用收尾改寫 |
| Drift 200/400/600 Nm | 6.10 | 3.47, 2.67, 2.04, 1.55, 1.23, 1.00 | 同終傳飽和；不要求每次改扭力一定改結果 |
| Drift 1000 Nm | 5.80 | 3.47, 2.67, 2.04, 1.55, 1.23, 1.00 | 顯示歷史模型何時離開飽和 |
| Drag 工程先驗 | 2.50 | 2.24, 1.87, 1.56, 1.30, 1.08, 0.90 | 未指定明確末速 |
| Drag profile manual 40 | 6.10 | 2.20, 2.02, 1.85, 1.70, 1.56, 1.43 | 運動學約 70.575 km/h，Rust 未標 unsupported，`measured_gearing` 仍回可用齒比 |
| Drag secondary manual 40 | 6.10 | 2.20, 1.94, 1.75, 1.60, 1.47, 1.35 | 運動學約 74.757 km/h，Rust 未標 unsupported |
| DangerSign | 3.52 | 2.70, 1.81, 1.21, 0.81, 0.54, 0.36 | 獨立保留既有歷史結果 |

`measured_gearing` 的現行正式呼叫把 secondaryCorrection 傳入 `None`，因此 secondary-only 案在此入口回到 Drag 先驗結果；profile 的 manual 40 則確實傳遞到正式求解器。新 Drag 候選及正式切換必須同時涵蓋兩種入口，不能只修次要修正支線。

## 確切歷史 TS 重播

`tests/fixtures/aego_historical_ts_comparison_v1.json` 保存本輪以 Node 24.13 的 `stripTypeScriptTypes` 與 VM ES modules 執行以下未改動的 git source 及相同輸入之輸出（#266 同 SHA 的 `tireCoefficients.ts` 相依一併載入）：

- #266：`6a74ba806db8307134515f48f8b78d5a93a8d519:frontend/src/utils/tuningMath.ts`。
- #335：`99850aca72d6947bb3ba24ced49c57bc9c62cb0a:frontend/src/utils/tuningMath.ts`。
- 現行凍結參考：`1ddb092d90f3aca4c02c86d633e6cfe3e7fc587b:frontend/test-reference/tuning/utils/tuningMath.ts`。

差異逐項說明：

1. #266 的 Rally Mixed 末檔是 **0.40**，5000 RPM 約 **437.235 km/h**；#335 與目前凍結 TS 仍相同。本輪 Rust 已納入 `150906d3` 後續逐檔取位上限，末檔變為 **0.36**，問題更明顯。原 PR body 的 0.40 是歷史 TS 證據，不能當作目前 Rust 驗收值。
2. #266 尚無本輪 Cross 分流，Mixed／Cross 同 FD 3.52；#335／凍結 TS／Rust 的 Cross 都是 FD 3.92。新模型須保持相對較短方向並揭露受限情況。
3. #335／目前凍結 TS 的 Drift 四組輸出與本輪 Rust 一致。更早 #266 的形狀為 1.81/1.49/1.22/1/1/1 且四組 FD 都是 6.10，屬不同歷史版本，不拿來要求目前 Rust 回退。
4. #335／目前凍結 TS 的 Drag 三組齒比與 Rust 一致；兩個 manual 40 案在 TS 另有 `unsupported=true` 與明確末速錯誤訊息，Rust 缺少這個最終資格拒絕。這是數值相同、可套用資格不同的缺陷；本 PR 只鎖定歷史，不提前修模型或正式 readiness。
5. 更早 #266 的 Drag 尚使用四個活動檔及高檔複製，三組均 FD 2.25、[2.49,1.84,1.36,1,1,1]；不可把當時沒有 manual 末速支援誤稱目前應維持的產品行為。

上述新 fixture 不覆寫原 21 組 tuning 或 10 組 EV golden，也不變更其容差。Rust 產品測試保護原行為，後續候選各自以目標、範圍、取位後可行性及診斷驗收；歷史缺陷不是新模型正確性標準。實車 A/B、實際滑移／抓地及速度能力本輪均未驗證。
