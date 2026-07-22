# FH6-HorizonTuner - 工作區邊界與驗證規範 (Workspace Rules)

## 核心物理與數學運算規範
1. **調校計算單一真理 (Source of Truth)**：所有懸吊、彈簧磅數、防傾桿 (ARB) 或齒輪比算牌公式，必須作為「無副作用純函數 (Pure Functions)」統一收攏於 `frontend/src/utils/tuningMath.ts`。
2. **確定性輸入**：嚴禁在物理計算演算法中引入非確定性狀態或副作用。

## 架構隔離原則
1. **後端 (Python / FastAPI)**：僅負責 60Hz 高頻遙測 UDP 封包解碼與 WebSockets 廣播，保持非同步主循環無阻塞 (Non-blocking)。
2. **前端 (Tauri / React)**：僅負責 UI 視覺化與互動展示。

## 任務完成驗證關卡 (Verification Gate)
- 在完成或宣佈任何開發與重構任務前，必須執行以下驗證測試：
  - 後端：`pytest tests/` (與語法檢查 `ruff check .`)
  - 前端：`cmd /c "npm --prefix frontend run test"`
- 嚴禁為了使測試通過而隨意放寬測試條件或修改斷言閾值。