# Drift Meta 研究與實作（2026-09-13）

## 範圍與證據分級

本次只調整 Drift 純函數算牌與其回歸測試。FH6 沒有可由本地程式直接驗證的官方調校 API；社群數字因此是起始點，不能宣稱為跨車最優 meta。來源的發布日期與本次查閱日期分開記錄，本次查閱日期均為 2026-09-13。

| 證據 | 結論 | 用途 |
|---|---|---|
| FH5 QuickTune 攻略（2026-09-13 查閱） | 四點 Drift 齒比形狀 2.89 / 1.99 / 1.34 / 1.00 | 只作相鄰版本的形狀先驗，不固定 FH6 輸出。[QuickTune FH5 tuning guide](https://forzaquicktune.com/tuning-guide/fh5/part2/) |
| FH6 Forza.guide（2026-09-13 查閱） | 建議 race 6-speed；主漂移檔按限轉與掉出動力帶調整終傳，檔位再按實車反應修正 | 支持把終傳與動力帶作 A/B 旋鈕，不支持固定齒比宣稱最佳。[Forza Guide](https://forza.guide/) |
| FH6 Reddit 原作者 JesusGodGod（2026-09-13 查閱；文章 2026-06-10） | 文章是 RWD guide，明確排除 AWD/FWD；前 ARB 約滑桿 1/3，後 ARB 較硬；機械平衡約 .45–.55 是獨立項目，不是 ARB 滑桿；彈簧與 rebound 依各自滑桿相對位置，bump 約 rebound 的 .6；RWD 差速 accel 75–95%、decel 0–40%；後車高比前高 1–2 clicks；齒比按限轉與動力帶測試 | 直接支持 RWD 方向與範圍；不把 RWD 數字套到 AWD/FWD。[A Guide to RWD Drift Tuning](https://www.reddit.com/r/ForzaHorizon6/comments/1u2d7ag/a_guide_to_rwddrift_tuning/) |

FH5 四點資料只是形狀先驗；FH6 的可公式化部分改由可見輪胎尺寸、車重、扭力與 `rpmT/rpmHp` 動力帶推導，仍須遊戲內 A/B 校正。

## 實作選擇

`calculateAEGOGearing('Drift', ...)` 將四點形狀按 normalized gear position 在 log 空間插值到 4–10 檔，並以 `rpmT/rpmHp` 的 bounded exponent 調整形狀。這保留來源的相對梯度，避免高檔複製；非有限或缺少動力帶時使用有限 fallback。終傳不使用隱藏 `tireType`→μ 常數，僅用車重、可見輪胎尺寸、驅動型式、扭力和可測速度作起點，實車以主漂移檔 A/B 修正。

底盤公式如下：

- RWD：前 ARB `1 + 64/3`（約滑桿三分之一），後 ARB `front * 1.2`；1.2 是工程先驗，非原文精確常數。彈簧保留重量分配公式 `weight * axleFraction * 0.035`。各軸 rebound 是彈簧值在該軸 min/max 的 fraction 映射到 1–20，bump=`0.6 * rebound`。前車高為 min+1 click，後車高為 min+2 clicks。後差速 90/15 是落在原作者範圍內的工程起始值，不是範圍中點或最佳值。
- AWD：前 85/5、後 60/15、中央後偏 75 是一般 AWD 起始先驗，並非已驗證的 FH6 Drift 專用數字；應獨立測試中央偏置與動力帶。
- FWD：不套用 RWD 動力滑胎基線；前 85/5 僅作手煞車／重心轉移相容 fallback，不能解讀為 FWD 動力滑胎支援。

## 拒絕的方案

- 拒絕把 Reddit 的機械平衡 .45–.55 誤當 ARB 數字，也拒絕捏造固定阻尼 4 或 decel 10–20 的來源。
- 拒絕把 RWD 齒比、差速器或滑胎假設直接套 AWD/FWD。
- 拒絕以固定四檔、複製第四檔冒充 5–10 檔 meta；可用來源形狀插值，但每車仍須按限轉與動力帶實測。
- 拒絕以輪胎配方或固定 μ 表推導抓地力；本迭代沒有隱藏 compound 輸入。

## 實車 A/B 方案

固定同一車、胎壓、路段、檔位與駕駛輸入，每次只改一個變數：

1. 先選能維持連續側滑且不長時間撞限轉的檔位，記錄檔位、引擎轉速、車速與滑移狀態。
2. 終傳只做相鄰 ±2 clicks A/B：撞限轉向 Speed，掉出動力帶向 Acceleration；保留完整圈與失敗樣本。
3. RWD、AWD、FWD 分開比較。AWD 一次只改中央後偏；FWD 只記錄手煞車／重心轉移，不與 RWD 動力滑胎分數直接比較。
4. 至少三段、同方向改善且重跑可重現，才考慮更新車輛基線；否則保留為車輛／駕駛者專屬調整。

## 限制

沒有 FH6 實機、跨車、跨控制器或排行榜驗證。公式測試只證明確定性、有限輸入與齒比邊界，不證明遊戲內最優解；AWD/FWD 數字與 ARB 後軸 1.2 仍是待 A/B 的工程先驗。

