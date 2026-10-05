# Stack ST8100 Inspired HUD

## 參考與適用玩家

以 Stack ST8100 的壓縮類比轉速錶、斜肩外殼、下方綠色兩列點陣 LCD 為基礎，適合 club racing、trackday、Caterham／kit-car 與改裝賽車玩家。這是 aftermarket 賽車儀表，不宣稱特定量產車年式。

- [Stack 官方 ST8100 型號表](https://www.stackltd.com/st8100.html)：C/D 的 0–3–8k、F 的 0–4–10k、H/I 的 0–3–10.5k、P/Q 的 0–6–13k 等黑白盤面型號
- [原廠 ST54030-007 使用手冊](https://d32vzsop7y1h3k.cloudfront.net/c1afd2ffb4e5107d8445cfbdef36a55a.PDF)：印刷頁 4 的模組圖、6–9 的顯示層、12–13 的警報、14 的圈速 popup、15 的換檔燈、18 的 lap popup 時間設定
- [官方安裝照片](https://www.stackltd.com/images/Stack_st8100.jpg)及[黑底 0–4–10k 實物照片](https://saboulautosport.com/109071-large_default/tableau-de-bord-stack-st8100-0-4-10000.jpg)：已實際查看後重新繪製比例，不打包原照片
- [官方 configurable upgrade](https://www.stackltd.com/configupgrade.html)：可選 channel／alarm 的參考方向，不宣稱完整六層硬體模擬
- [官方 STACK 標誌外觀參考](https://www.stackltd.com/images/footerlogo.png)：右側 SVG 由程式重新繪製以識別原儀表，沒有複製下載的 logo 圖檔

Canvas 外殼、刻度、指針與 5×7 點陣字元為原創程式。`assets/stack-wordmark.svg` 是重新繪製的 STACK 標誌識別；STACK 名稱與標誌仍屬其權利人，不主張擁有該商標、不另行宣稱商標授權，也不表示官方合作、認證或背書。

## 外觀與轉速

- LCD 以外殼中心對齊；右側放置垂直三列 STACK SVG，不把 logo 空間算入 LCD 置中
- 黑／白盤面可在 GUI 選擇並保存；警示燈及超轉燈的直徑為首版的 135%，不增加多餘尺寸滑桿
- 量程提供 `0–3–8k`、`0–4–10k`、`0–3–10.5k`、`0–6–13k` 及預設 `Auto`
- Auto 選擇能容納原始 `EngineMaxRpm` 的最小上限，例：10200 RPM 選 10.5k；超過 13k 仍保留最高原廠量程並顯示 `RPM > 上限`
- 指針超過固定或自動量程時會限制在刻度尾端，但另有明確 overflow 文字，沒有把超範圍轉速假裝成較低讀值
- 低轉段約占 35°、工作區約占 215°，是依實物觀察重新繪製的比例，不是原廠校準數據
- 超轉燈的百分比始終乘上封包 `EngineMaxRpm`，不受所選量程影響；預設 90%，可設 50–100%。缺少有效 max RPM 時不產生超轉門檻，不使用共用 `max−1000` 估計紅線
- Glow 調整指針／燈光；Custom Gauge Color 改指針，保留 LCD 綠底深字對比

## LCD 即時欄位與計時

預設上列為速度／檔位，下列為比賽經過時間／四輪平均胎溫。四格可選：速度、檔位、平均／最高胎溫、增壓、RPM、功率、扭力、油門、煞車、當圈時間、比賽經過時間、上圈／最佳圈、已完成圈數及本 session 最高 RPM／速度。燃油餘量已移除，不留隱藏燃油警示。

所有時間來自封包：`CurrentLap` 為目前圈經過秒數，`CurrentRaceTime` 為遊戲回報的經過秒數；不是瀏覽器自己計時，也不從牆鐘補算。0／缺少的 BestLap、LastLap 與 RacePosition=0 顯示 N/A。

`Peak values` 基礎頁顯示本次 session 最高 RPM、最高速度、最高增壓、最高單輪胎溫；不是逐圈 Memory，也不保存永久歷史。換車、已確認的新 session 或 HUD 重載會重設。

### 自動計時輪播

兩個連續有效原始封包的正值 `CurrentLap` 有前進，才確認正在計時；`IsRaceOn` 或初始零值本身不足。正常換圈（圈數 +1 或有效 LastLap 更新）保留計時狀態。持續收到封包，但 CurrentLap 3 秒未前進或缺失，就退出計時頁；不是持續把凍結計時當作進行中的比賽。

計時頁四格為當圈／最佳圈／上圈／目前排名。每個畫面週期 2.5 秒：

- 無警示：基礎四格 → 計時四格 → 基礎四格
- 有警示：基礎四格 → 警示 → 計時四格 → 警示
- 不在進行中的計時：只使用基礎頁與需要的警示頁

「基礎頁」使用玩家選擇的 Live 或 Peak page。計時頁只占一般資訊週期，不占用警示週期；當計時狀態消失，正在顯示的計時頁即回基礎頁，保留原週期截止時間。

### Last Lap popup 與優先序

新的已完成圈會顯示 2.5 秒圈速 popup。若有警示，它取代「下一次警示訊息週期」，不搶走中間的資訊頁，也不讓多警示輪播跳過一個指標。沒有警示時 popup 暫時插入，結束後恢復被打斷資訊頁的剩餘時間。

- 有圈數時使用完成圈 identity：連續兩圈 LastLap 數值完全相同，仍是兩次不同事件
- 同一圈的延遲 LastLap 修正只更新尚待顯示／正在顯示的 popup，不重新開始計時，也不再跳出一次
- 圈數缺失時退回使用有效 LastLap 數值變化；初始值和重複封包不產生 popup
- 只保留一個最新待顯示事件；無警示 popup 期間若再來新圈，更新該 popup，仍沿用原截止時間
- 第一次警示若在無警示 popup 中觸發，立即優先顯示警示；已經展示的 popup 不重新排隊
- 暫停、過期、錯誤、設定重建、session 重設會清除 popup／計時基線，重連不補播舊圈速

原廠手冊印刷頁 13 只說警報顯示類型／數值並可手動清除，未指定本需求的警報／即時頁交替頻率。頁 14、18 說 lap popup 時間可設定，沒有給固定預設秒數。因此上述 **2.5 秒是本 HUD 配合需求的互動設計，不是 OEM 固定時序聲明**。

## 三組通用遙測警示

每組都有啟用、指標、高於／低於、自填門檻。可選 RPM、速度、平均胎溫、最高胎溫、增壓、功率、扭力、油門、煞車；允許多組選同一指標。三組預設皆關閉，預填值只是示例，不是安全值或調校建議。

值持續越界至少 500ms，且相鄰有效樣本小於 500ms 才觸發。High 以 `>=` 觸發，降至 `threshold−hysteresis` 解除；Low 以 `<=` 觸發，升至 `threshold+hysteresis` 解除。缺少／錯誤型別／非有限感測值立即解除該組，不能用別的 alias 補 0。

| 指標 | 持久化單位 | hysteresis |
| --- | --- | --- |
| RPM | RPM | 150 RPM |
| 速度 | km/h | 3 km/h |
| 平均／最高胎溫 | °C | 5°C |
| 增壓 | bar | 0.1 bar |
| 功率 | kW | 5 kW |
| 扭力 | N·m | 10 N·m |
| 油門／煞車 | 百分比 | 2 個百分點 |

觸發後 ALARM 燈一直反映「目前存在有效警示」，即使 LCD 當下顯示資訊或圈速也不熄滅；不閃爍，不播聲音。多警示按組別 1→2→3 循環，只有真正開始顯示某組訊息才前進，圈速替代週期不消耗它的順序。

當前警示解除但其他組仍成立時，可改顯示下一組，沿用原警示週期截止時間。所有警示解除後的資訊週期有完整保護；反覆解除／重新觸發不能無限推遲資訊頁。第一次觸發仍立即優先顯示。

門檻支援空白／小數編輯草稿，Enter／離開欄位保存、Escape 取消，無效數字回復。更換指標會套用新指標示例值並先關閉該組，避免舊單位門檻誤套到新指標。單位由既有 HUD Unit Settings 控制，胎溫另選 °C／°F；更換顯示單位不改變 canonical 門檻，未編輯的四捨五入文字也不重寫門檻。

舊設定自動遷移：胎溫警示→第 1 組，增壓警示→第 2 組，保留其啟用／canonical 門檻；舊 Fuel 欄位改成 race elapsed，燃油警示與六個舊警示鍵清除。已有新三組設定時以新設定為準。其他 HUD 和未知第三方鍵不受影響。

## 遙測來源與不中斷契約

- 原始 `CurrentEngineRpm`、`EngineMaxRpm`、`Gear`（0=R、11=N、1–10=前進檔）
- `SpeedMetersPerSecond`→km/h／mph；signed `Boost`（PSI above atmospheric）→bar／PSI／kPa，保留負值
- `TireTemp`／canonical `tire_temp_f` 為 °F，完整四輪有限值才計算平均／最高，不以三輪冒充四輪
- `PowerWatts`→kW／hp／PS、`TorqueNewtons`→N·m／lb-ft、`AccelInput`／`BrakeInput` 0–255→百分比
- `CurrentLap`／`CurrentRaceTime`／`LastLap`／`BestLap`／`LapNumber`／`RacePosition` 全部由遊戲提供

不合成油壓、油溫、水溫、電瓶電壓、燃油壓力、胎壓或煞車偏壓。Coordinator 的唯讀 `sourceTelemetry` 提供未平滑原始封包；LCD、警示、換檔燈、計時事件與峰值全部使用這個來源，只有指針使用既有 smoothing 視覺數據，外插尖峰不能成為永久峰值或警示證據。

`TimestampMS` 前進才證明新資料。1.5 秒未前進→`NO SIGNAL`；`IsRaceOn=0`→`PAUSED`；錯誤→`DATA ERROR`；缺少有效 timestamp／race state→`NO DATA`。這些狀態停用指針／警示與 popup，不延續假讀數。uint32 wrap 保持 session；逆序的新 epoch 必須有第二個一致前進封包才接受，單一看似 race reset 的舊封包不回滾 peak／popup 狀態。

## 設定、測試與實際預覽

GUI ownership：`frontend/src/features/overlay_control/stack_st8100/`。HUD ownership：`hud_overlay/stack_st8100/`，含獨立 config、source model、monitor、bounded scheduler、dot font、renderer、controller。標準 GUI runtime→POST 原子保存／BroadcastChannel→Rust relay→Launcher→HUDCore 資料流不變。

採用 `halfmoon-design-system`、`huge-component-refactoring`、`modular-refactoring`、`telemetry-udp-protocol`、`cross-agent-collaboration`，遵循 workspace／ui-architecture／testing-strategy，不加微觀 Canvas 呼叫次數測試。

- `pnpm -C frontend exec vitest run ../hud_overlay/stack_st8100/tests/unit src/features/overlay_control/stack_st8100`
- `pnpm -C frontend test`；Windows／LAN 的 `pnpm -C frontend build`
- `cargo test --locked --manifest-path backend-rust/Cargo.toml --test stack_st8100_config_contract`
- `node hud_overlay/stack_st8100/tests/visual/render.mjs`
- `node hud_overlay/stack_st8100/tests/visual/launcher.cjs`
- `node frontend/src/features/overlay_control/stack_st8100/tests/browser/verify.cjs`

視覺工具使用獨立 Playwright、`PLAYWRIGHT_MODULE_PATH`、`PLAYWRIGHT_CHANNEL=chrome`、`OUTPUT_DIR`，保持 `chromiumSandbox: true`；雲端 workflow 產出黑白盤面／五種量程、警報／計時／圈速週期、missing states，以及真實 GUI 鍵盤編輯、單位、重載、六種主題與中日窄版截圖。這些不是 Windows 原生透明度、click-through、多螢幕或 FH6 遊戲實機驗收。

[黑底預覽](../assets/stack-st8100/preview.png)、[白底預覽](../assets/stack-st8100/white-face.png)、警示／計時／上圈時間與完整設定 PNG 均來自 source `60dfae6a8dbb55b1b809b0bda1ef229c4f71d80d` 的 [Visual run37291320148](https://github.com/eddie772tw/FH6-HorizonTuner/actions/runs/37291320148)。已實際查看並獨立複審；[provenance.json](../assets/stack-st8100/provenance.json) 保存來源 artifact 與個別 PNG 雜湊。設定頁先在原始 viewport（窄版390×844）逐項捲動，驗證31個內容目標／22個控制項的垂直可見、hit-test與focus；完整卡片圖保留相同寬度，使用明列的較高viewport，沒有改動產品CSS隱藏遮擋物。六主題及英／繁中／日文皆完成，舊的裁切證據不再沿用。

造型仍明確屬於 ST8100-inspired：相較實物，轉速盤比例、工作區刻度密度、Arial數字及全大寫LCD是HUD適配，不能宣稱精確復刻。原廠照片與商標外觀僅供參考查證。

可選配的預測圈速、實體紅外線跨線、逐圈 Memory、Corner/straight/HOLD 只做研究並列入 PR，這次沒有新增其模擬實作；已授權實作範圍僅上述修訂與計時輪播。
