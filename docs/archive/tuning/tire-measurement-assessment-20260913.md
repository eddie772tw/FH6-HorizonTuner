# 輪胎可觀察證據評估（2026-09-13）

FH6 Data Out 可提供車速、縱向加速度、四輪 normalized slip、胎溫、懸吊行程與控制輸入。這些是遊戲遙測欄位，不等於摩擦係數、compound 或最大抓地力。Forza 官方 Data Out 結構說明：[Forza Motorsport Data Out](https://support.forzamotorsport.net/hc/en-us/articles/360005306553-Forza-Motorsport-Data-Out-Documentation)。

本 worktree 新增 `observeTireEvidence`：從既有 capture samples 篩選同車／PI／Class、時間遞增、直線、無煞車／手煞車、正檔、穩定車身與可用懸吊行程的樣本，輸出觀察到的縱向加速度、最大 normalized slip 與每輪平均胎溫。缺欄位、非有限值、身份不符、轉向、煞車或疑似離地時會拒收或回報 unavailable。

## 可識別與不可識別

- 可識別：在條件化樣本中觀察到的加速度、normalized slip 峰值與胎溫趨勢。
- 不可識別：僅靠 Data Out 反推出 μ、compound、峰值抓地力或自動最佳胎壓。車重分配、驅動扭矩、路面與輪胎狀態共同影響結果，且欄位沒有直接輪胎力／法向載荷。
- 目前 solver 不應把歷史 `tireType` 轉成 μ；新版 wizard 只保留可見輪胎尺寸，compound label 僅作歷史相容資料。

## 下一步實驗

同一車、PI、零件與路段，固定檔位與油門，分別做不同胎壓或 compound 的單一變量 A/B；每組至少三段連續直線，記錄速度、加速度、normalized slip、胎溫與地面條件。結果只能形成車輛／路段條件化證據，不能升格為通用抓地係數。

## 限制

懸吊行程邊界只是排除明顯離地的保守篩選，不能證明四輪均有相同載荷。UI 面板會顯示 unavailable，不會以零填補缺失，也不會自動改寫調校值。
