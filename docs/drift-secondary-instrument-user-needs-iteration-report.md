# Drift HUD 子儀表使用者需求迭代報告

日期：2026-08-12  
範圍：PR #185、`hud_overlay/drift` 子儀表重製前的需求與資訊架構研究

目前既定的畫面前提：主儀表沿用左側邊界作為新中心、放大 100%，並向下移動約 3/4 個主儀表高度；這是本報告後續評估子儀表避讓與可讀性的基準。

## 1. 結論摘要

下一版子儀表不應再被設計成「縮小版主儀表」。主儀表已經負責速度、轉速、檔位、扭力、甩尾角度與方向盤輸入指示；Style Meter 與遊戲原生 Drift Zone 分數也已經負責表現與得分回饋。子儀表的價值應該改成即時回答以下三個問題：

1. 後輪目前還能不能維持抓地，還是已經接近失控？
2. 車身的旋轉／轉向變化是否受控，是否正在進入 transition 或 spin？
3. 現在實際施加了哪些油門、煞車、手煞車與離合器輸入？

因此建議把子儀表重新定義為 **Drift Dynamics / Control Surface**：一個顯示「輸入 → 輪胎反應 → 車身旋轉狀態」的控制回饋面板，而不是另一個顯示角度與速度的儀表。

本報告先定義需求與迭代順序，不在資訊架構尚未確認前直接重寫 Canvas。

## 2. 使用者在甩尾中的實際判讀任務

一般玩家不會在甩尾過程中持續閱讀大量精確數值；他們通常是在極短時間內做以下判斷：

| 駕駛時刻 | 玩家想知道的事 | 最有用的訊息 | 適合的呈現方式 |
|---|---|---|---|
| 進入甩尾 | 車尾是否已經開始滑出、目前旋轉方向為何 | 甩尾方向、輪胎滑移、手煞車／離合器事件 | 大型狀態變化、短暫事件閃爍 |
| 維持角度 | 能否繼續加油，還是需要收油／反打 | 後輪抓地、油門、方向盤／反打關係 | 左右對稱的狀態帶、輸入條 |
| 轉換方向 | 車身旋轉是否正在加速、是否快要甩過頭 | yaw rate 或旋轉趨勢、橫向 G、輸入反轉 | 中央指示器、方向性動畫 |
| 接近失控 | 是抓地恢復、推頭，還是 spin | 前後輪滑移差、combined slip、旋轉狀態 | 琥珀色／粉紅色警示與明確狀態字 |
| 一次動作結束 | 這次操作是否成功、哪個部分造成失分 | hold、transition、輸入事件、輪胎狀態 | 短暫結果標籤；詳細分析留給 TelemetryView |

這個分類表示子儀表最需要的是「可操作的狀態」，不是再增加一組常駐的速度、RPM 或角度數字。

## 3. 外部參考顯示出的共同需求

### 3.1 Forza 遙測與 FH6 儀表專案

[TheBanHammer/fh6-tel](https://github.com/TheBanHammer/fh6-tel) 的 FH6 即時面板把 RPM 弧表、速度／檔位、G-meter、油門／煞車／離合器、手煞車、姿態指示、方向盤指示與每輪胎溫／滑移／懸吊放在不同區域。這個分組很有參考價值：駕駛中的核心讀值與四輪診斷資訊應該分層，而不是全部塞進同一個中心儀表。

[richstokes/Forza-data-tools](https://github.com/richstokes/Forza-data-tools) 則展示了 Forza Data Out 應同時服務即時畫面、WebSocket 廣播與 CSV／事後統計。這支持本專案維持單一 HUDCore frame source，並把細節分析留在第二螢幕，而不是為了子儀表再建立一條資料通道。

### 3.2 漂移專用產品的核心指標

[DriftCoach](https://drift.coach/) 將即時漂移回饋聚焦在 angle、line、speed、counter-steer，並以 yaw rate、wheel slip、steering input 與 speed 作為判讀來源；它另外把 style 與 consistency 放在每次 run 的評分與事後回饋。這說明「車身運動狀態」與「表現評分」應該分開，子儀表不需要重複 Style Meter 的評分語彙。

[Racetry](https://racetry.app/en/) 的 vehicle dynamics 區域則明確列出前／後輪 slip angle、yaw rate、drift angle 與四輪懸吊行程，並將 tire temperature、fuel 等維護型資訊放在另一層。這支持把輪胎反應與車身旋轉列為子儀表的主要候選資訊，但不代表每一個輪胎欄位都必須常駐顯示。

[SimHub Dash Studio](https://github.com/SHWotever/SimHub/wiki/Dash-Studio) 的設計價值主要在於「可使用所有遊戲資料、可匯入／匯出、可放到指定螢幕」的工作流。它適合作為資訊密度與可配置性的參考，但不能直接推導出 Drift HUD 應該顯示所有可取得的欄位。

### 3.3 Forza Data Out 的資料語意

[Forza Data Out 文件](https://support.forzamotorsport.net/hc/en-us/articles/21742934024211-Forza-Motorsport-Data-Out-Documentation) 將 `AngularVelocityY`、四輪 `TireSlipAngle` 與 `TireCombinedSlip` 定義為可用的車身／輪胎動態資料，並指出 normalized combined slip 的絕對值超過 1 代表抓地損失。該文件是 Motorsport 的官方資料文件，不能單獨視為 FH6 UI 規格；但本專案目前使用的封包欄位與本地 parser 已經包含相同資料區段，因此可以作為語意與單位校對依據。

## 4. 目前專案的資料與顯示責任

### 4.1 主儀表已經擁有的資訊

目前 Drift 主儀表已經顯示或計算：

- 速度、RPM、檔位與扭力。
- 漂移角度與左右方向。
- 方向盤輸入指示，以及既有的 counter-steer 判讀。
- 與主儀表視覺相關的轉速／角度刻度。

所以子儀表不應再以大型數字重複顯示速度、RPM、檔位或漂移角度。若需要保留角度方向，應只作為狀態上下文，不應再次成為中心主角。

### 4.2 目前可從既有 frame 取得的候選欄位

`hud_overlay/shared/coordinator.js` 已把下列資料整理成 HUD 可讀的欄位：

- `throttle`、`brake`、`clutch`、`hand_brake`、`steer`。
- `slip_fl` ... `slip_rr`、`slip_angle_fl` ... `slip_angle_rr`。
- `TireSlipRatio`、`TireSlipAngle`、`TireTemp`。
- `accel_x/y/z`、`vel_x/y/z`。
- `susp_fl` ... `susp_rr`、`boost`、`power`、`torque`。

`backend/telemetry_listener.py` 也已解析四輪 normalized suspension travel、slip ratio、slip angle、combined slip、加速度、速度與控制器輸入。這使「輪胎抓地／滑移」與「控制輸入」可以先在不新增 UDP socket 的前提下進入下一輪。

### 4.3 目前尚未形成穩定 HUD contract 的欄位

封包格式包含 angular velocity，但目前 backend parser 尚未把 `AngularVelocityX/Y/Z` 形成一致的 canonical HUD aliases。因此 yaw rate 可以列入下一階段，但必須先做 parser／coordinator contract、單位確認與實機樣本驗證，不能直接把它當成已驗證的畫面數值。

同樣地，`flowQuality`、`riskLevel`、`holdSeconds` 是目前 Drift HUD 的 heuristic／Style 狀態，不是 Forza 原生評分欄位。它們可作為過渡狀態，但不應再用模糊的 `FLOW / RISK` 名稱假裝是輪胎或物理測量值。

## 5. 候選資訊的優先級與責任分配

| 優先級 | 資訊 | 玩家用途 | 目前可用性 | 建議責任 |
|---|---|---|---|---|
| P0 | 油門／煞車／手煞車／離合器 | 立即知道自己正在施加什麼控制 | 已在 frame 中 | 子儀表；事件閃爍與短暫提示 |
| P0 | 前後輪或四輪的滑移／抓地狀態 | 判斷能否繼續加油、是否接近失控 | slip ratio、slip angle、combined slip 已有封包來源 | 子儀表，以前後分組的摘要為主 |
| P0 | 旋轉／抓地狀態文字 | 在低解析度與高速駕駛中快速判讀 | 可先用現有資料衍生，命名需保守 | 子儀表的狀態層 |
| P1 | yaw rate／旋轉速度 | 預判 transition、spin 或旋轉不足 | 封包有欄位；canonical parser 尚未完成 | 先擴充 contract，再進 Canvas |
| P1 | 橫向 G／合成 G | 判斷載荷與轉換強度 | `accel_x/y/z` 已有 | 子儀表或 TelemetryView，避免與 G-radar 重複 |
| P1 | 油門與後輪滑移的關係 | 判斷「加油造成推開」或「可以繼續維持」 | 可由輸入與 combined slip 衍生 | 子儀表的 traction 狀態 |
| P2 | 四輪胎溫 | 調校、長時間運行與抓地變化 | 已有資料 | TelemetryView／HUD card；子儀表只顯示異常摘要 |
| P2 | 懸吊行程、輪胎磨耗、路面 rumble | 診斷車輛設定與路面 | 已有或可取得 | TelemetryView／事後分析，不進常駐子儀表 |
| P2 | score、combo、style、hold | 了解得分與表現 | 原生 UI／Style Meter 已負責 | 保留在 Style Meter 與原生分數區 |
| P3 | line、zone 進度、個人最佳 | 路線與賽後比較 | 需要額外 zone／track context | 另開功能，不納入本次子儀表重製 |

## 6. 建議的子儀表資訊架構

改成單欄設計，僅顯示油門、煞車、手煞車與離合器四個控制輸入；其中手煞車與離合器採半高顯示並置於同一區域，使整體形成三柱結構：油門、煞車，以及手煞車／離合器。

## 7. 建議的視覺語彙

保留甚至遷移 Advanced Canvas 的技術型繪製能力，但重新定義各視覺元素的語意以及微調繪製方式：

- **外框**：深色半透明硬邊面板，使用切角或局部開放輪廓；避免大面積橢圓背景再次搶走畫面。
- **外層軌道**：固定的 instrument boundary，低亮度白／青色，代表量測範圍。
- **內層能量帶**：以分段 arc 或短條帶代表抓地／滑移，不用單一百分比填滿整圈。
- **輸入條**：使用與外層軌道不同的直向或橫向細條，避免把玩家輸入誤讀成輪胎物理量。
- **顏色**：青色表示可控制／輸入，白色表示基準，琥珀色表示轉換與注意，粉紅／紅色表示滑移或 spin risk。
- **動態**：數值與狀態可以 60Hz 更新；glow、事件脈衝與狀態文字必須有 hysteresis，避免每幀閃爍。
- **字體**：只保留一個主要狀態字與少量固定縮寫；精確四輪數值、溫度與懸吊資料交給 TelemetryView。

## 8. 分階段實作計畫

### Iteration 0：資料契約與樣本驗證

1. 新增 canonical aliases：四輪 `combined_slip`、前／後軸摘要、`angular_velocity_y`／yaw rate。
2. 確認 slip angle、combined slip 與 yaw rate 的實際單位、正負方向與 FH6 實機數值範圍。
3. 以 idle、直行、穩定左／右甩、transition、spin recovery、手煞車 entry、clutch kick 建立合成與實機 frame fixtures。
4. 確認 HUD 仍只接收現有 HUDCore frame；不新增 UDP、WebSocket 或 polling loop。

### Iteration 1：只建立新的 Canvas 骨架

1. 重寫 secondary renderer 的 layout primitives：外框、三欄區域、compound arc、輸入條、中心狀態 hub。
2. 先用固定 fixture 值渲染，不連接 heuristic `FLOW / RISK`。
3. 以 1920×1080、2560×1440、3440×1440 及全域 HUD scale 驗證右下 anchor、字體可讀性與 Drift Zone／原生 gauge 避讓。

### Iteration 2：接上物理摘要與輸入事件

1. 接入前後輪抓地／滑移摘要、四角異常點與 T/B/H/C 輸入。
2. 加入狀態機與 hysteresis：`GRIP` → `HOLD` → `TRANSITION` → `RECOVER`／`SPIN RISK`。
3. 只在 handbrake、clutch kick、spin risk 或 grip recovery 發生時播放短暫事件效果。

### Iteration 3：yaw rate 與實機校正

1. 將 `AngularVelocityY` 納入 parser／coordinator contract。
2. 用實機資料校準 transition 與 spin risk 閾值，檢查不同驅動形式與車輛設定。
3. 比較 yaw rate、漂移角度變化率與玩家主觀感受，決定中央狀態採用哪個作為主要來源。

### Iteration 4：驗收與收斂

1. 以使用者截圖確認主儀表下移後，子儀表不遮住原生 Drift Zone 分數與右下原生 gauge。
2. 確認子儀表與 Style Meter 不重複顯示 score／style／flow／risk 敘事。
3. 確認 TelemetryView 與 HUD cards 的開關、60Hz frame source 與 pause 行為不被改變。
4. 把精確數值、溫度、懸吊與賽後比較保留在 TelemetryView，不把第二螢幕內容全部搬回遊戲畫面。

## 9. 驗收條件

- 玩家在一眼內能辨識目前是維持抓地、轉換中、恢復中或接近失控。
- 玩家能看見 T/B/H/C 的即時輸入，並能辨識 handbrake／clutch kick 的短暫事件。
- 前後輪或四輪滑移的摘要能解釋「為什麼現在需要收油或反打」，而不是只顯示未定義的百分比。
- 子儀表不重複主儀表的速度、RPM、檔位、扭力與大型漂移角度。
- Style Meter、原生 Drift Zone 分數與子儀表各自有清楚責任，不互相覆蓋或使用相同的評分標籤。
- 60Hz 更新仍沿用單一 HUDCore frame；Canvas hot path 不新增每幀 DOM 操作、socket、polling 或不必要的物件配置。
- 缺少 yaw rate 或部分輪胎欄位時可以降級顯示，不得把缺失資料當成零值後渲染成錯誤的「安全」狀態。

## 10. 暫不納入本輪的內容

- Drift Zone 路線、line quality、分數預測與個人最佳比較。
- 四輪溫度、懸吊行程、磨耗等調校診斷的完整圖表。
- 將 TelemetryView 或所有 HUD telemetry cards 複製到遊戲內 overlay。
- 重新建立獨立資料源、第二個 WebSocket 或另一個 UDP listener。

這些資訊不是沒有價值，而是應該留在第二螢幕、HUD cards 或事後分析；本輪子儀表的任務是支援駕駛當下的控制決策。
