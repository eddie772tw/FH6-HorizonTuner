# AEGO 模型責任隔離

現行四模型保持獨立 owner；#658 已移除凍結舊公式與歷史執行路由。`gearing/mod.rs` 只依賽事路由，返回後不再改動齒比。

| Owner | 責任 |
|---|---|
| `gearing/road.rs` | Road launch-envelope/v3 的起步先驗、頂檔錨點、配置偏好、取位與診斷；不經歷史逐檔 RPM 上限 |
| `gearing/{rally,drift,drag}.rs` | 各自的正式目標、配置、取位、診斷與硬約束重驗 |
| `gearing` 內部 DangerSign 路徑 | 僅保留既有必要運算；不是第五個 AEGO 模型、ID 或獨立項目 |
| `gearing/kinematics.rs` | 單位明確的純滾動速度／RPM 換算，沒有賽事策略 |
| `gearing/allocation.rs` | 呼叫方明確提供總減速比、範圍、精度、終傳偏好與容差；全組取位後檢查，無可行解返回 None |
| `gearing/contracts.rs` | 範圍與候選結果的最小契約；來源及目標語意由模型診斷負責 |

歷史公式已移除，原記錄改為[封存](model-retirement.md)；不以舊模型缺陷當現行模型標準。四模型不得相互呼叫，線性 PR 順序只代表審查依賴。

共享配置工具沒有預設遊戲範圍、抓地係數、起步速度或賽事常數；`RatioRange` 只描述數值網格，不能證明 user-observed 或遊戲滑桿的來源。各候選必須自行揭露目標、實際值、取位誤差、受限原因及來源，並重新驗證模型硬目標。

`aego_isolation_contract.rs` 鎖定現行模型專屬欄位隔離，以及共享配置的可行和不可行行為。既有 Road、21 組 tuning golden、10 組 EV golden、CVT、DangerSign 及底盤契約繼續適用；無實車性能推論。
