# AEGO 模型責任隔離

本階段只搬移責任，正式推薦數值及 unsupported 語意保持不變。`gearing/mod.rs` 只依賽事路由，返回後不再改動齒比。

| Owner | 責任 |
|---|---|
| `gearing/road.rs` | Road launch-envelope/v3 的起步先驗、頂檔錨點、配置偏好、取位與診斷；不經歷史逐檔 RPM 上限 |
| `gearing/{rally,drift,drag}.rs` | 獨立入口；目前固定賽事委派凍結歷史 owner，後續另提供候選 API |
| `gearing/legacy/mod.rs` | Road joint/v2 與非 Road v1、DangerSign 的歷史行為，包括舊 secondary correction 及逐檔收尾；不依賴候選模型 |
| `gearing/kinematics.rs` | 單位明確的純滾動速度／RPM 換算，沒有賽事策略 |
| `gearing/allocation.rs` | 呼叫方明確提供總減速比、範圍、精度、終傳偏好與容差；全組取位後檢查，無可行解返回 None |
| `gearing/contracts.rs` | 範圍與候選結果的最小契約；來源及目標語意由模型診斷負責 |

歷史 owner 保有自己的 Road v2 配置與先驗，避免新公式變動污染已保存推薦。非 Road v1 暫時保留原逐檔上限，不把歷史缺陷當新模型標準。四模型不得相互呼叫，線性 PR 順序只代表審查依賴。

共享配置工具沒有預設遊戲範圍、抓地係數、起步速度或賽事常數；`RatioRange` 只描述數值網格，不能證明 user-observed 或遊戲滑桿的來源。各候選必須自行揭露目標、實際值、取位誤差、受限原因及來源，並重新驗證模型硬目標。

`aego_isolation_contract.rs` 鎖定其他模型專屬欄位不影響輸出、非 Road 原始／二次修正／拒絕與凍結 owner 一致，以及共享配置的可行和不可行行為。既有 Road、21 組 tuning golden、10 組 EV golden、CVT、DangerSign 及底盤契約繼續適用；無實車性能推論。
