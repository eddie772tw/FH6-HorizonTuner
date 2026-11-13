<!-- Autonomous work log for Vector. Promote only after local verification; see .agents/Journal.md. -->

## 2026-10-30 - Initialized Autonomous Vector Persona
**Rendering Learning:** Formalized the Vector persona for specialized maintenance of `hud_overlay/` and telemetry Canvas 2D rendering. Key constraint: prevent per-frame dynamic object allocations (`new Path2D`), respect `shadowBlur` composite blending order, and preserve DPR scaling.
**Action:** Enforce zero-allocation render loops and semantic tests over micro-pixel assertions for all HUD cluster components.
**署名:** Vector as Antigravity

## 2026-11-01 - ArcSteerGauge 刻度路徑批次化與光弧端點平滑
**渲染洞察 (Rendering Learning):** 圓弧轉向儀表在高頻繪製時，若每根刻度單獨呼叫 `beginPath` 與 `stroke` 會造成大量的 Canvas 狀態切換開銷；透過將非中心常規刻度收納為單一連續路徑進行單次 `stroke`，可大幅降低繪製開銷。此外，粗線寬（≥4px）之主動轉向弧線在預設 `butt` 端點下會呈現生硬的直角截斷，設定 `lineCap = 'round'` 能與 `shadowBlur` 光暈自然融合為圓潤科技弧光；同時必須以對稱之 `ctx.save()` / `ctx.restore()` 封閉狀態範圍，杜絕發光與樣式滲漏至相鄰圖層。
**行動 (Action):** 在所有圓弧形 HUD 儀表（如 ArcSteerGauge、轉速弧形儀表）中推廣刻度路徑批次化與 `lineCap` 弧線光暈設計，並將成對 `ctx.save()` / `ctx.restore()` 列為標準渲染防護合約。
**署名:** Vector as Antigravity


## 2026-11-02 - 懸吊波形漸層快取、DPR 線寬補正與光弧端點平滑
**渲染洞察 (Rendering Learning):** 在 60Hz/120Hz 遙測高頻繪圖循環中，若每幀針對動態波形重新調用 `ctx.createLinearGradient()` 並添加多個色標，四輪懸吊組件會每秒產生數百次微小 CanvasGradient 物件配置，誘發週期性垃圾回收卡頓。透過在畫布高度與主題未變時快取 gradient 實例，可達成零每幀記憶體配置；同時，背景上下極限警戒線須將線寬與虛線陣列完全乘上 `dpr` 並取整對齊，避免高解析螢幕下淡化模糊；軌跡端點設定 `lineCap = 'round'` 與成對 `ctx.save()` / `ctx.restore()` 封閉發光範圍，能保證跳動波形具備乾淨圓潤的賽車霓虹光弧而不污染相鄰圖層。
**行動 (Action):** 在高頻 Canvas 軌跡組件中，將漸層與複合筆刷的快取模式列為標準原則；繪圖函式全面強制以成對 `ctx.save()` / `ctx.restore()` 封裝，並落實所有線寬與虛線 pattern 的 DPR 縮放。
**署名:** Vector as Antigravity

## 2026-11-03 - 踏板波形折線圓角平滑、即時 Leading Marker 與狀態防護封裝
**渲染洞察 (Rendering Learning):** 踏板波形畫布（PedalTraceCanvas）在 60Hz 即時渲染下，玩家急踩或點煞時的陡峭數值變動在預設 `butt` 端點與 `miter` 轉角下易產生突波尖刺與平截截面；透過設定 `lineCap = 'round'` 與 `lineJoin = 'round'` 能確保折線與動態光暈圓潤融合。在最新採樣端點加入同軸半徑 2.5*dpr 的 Leading Pulse Marker，可顯著提升賽車即時踩踏深度感知。此外，繪圖主體改用提升之函式宣告並以成對 `try { ctx.save(); ... } finally { ctx.restore(); }` 封閉狀態範圍，能防止 `shadowBlur` 樣式滲漏，並徹底杜絕同步 ResizeObserver 觸發時的 TDZ 錯誤。
**行動 (Action):** 所有時間序列高頻畫布均應配置 Leading Marker 提供即時焦點，繪圖邏輯強制使用 `try/finally` 成對還原 context 狀態，並優先採用具 Hoisting 特性之函式定義以防禦觀察器生命週期時序問題。
**署名:** Vector as Antigravity


## 2026-11-04 - 馬力扭力散點畫布同軸脈衝光環、交會透明度與狀態防護
**渲染洞察 (Rendering Learning):** 在 60Hz 馬力扭力轉速散點畫布（PowerTorqueCanvas）中，過去即時點僅以單一微小實心圓（4*dpr）標示，在高密度散點中極易失去焦點；透過引進同軸雙層「外圈脈衝光環 (Pulse Halo Ring, 6.2*dpr) + 內核定位點 (Core Dot, 3.2*dpr)」設計，並嚴格匹配 linear 工業模式的矩形光環，大幅強化了動態轉速拉升時的即時牽引視認性。同時，在 5252 RPM 等馬力與扭力交錯區間，全不透明散點會導致後繪之 Power 散點徹底掩蓋先繪之 Torque 散點；透過在散點批次繪製前設定 `ctx.globalAlpha = 0.75`，可使雙曲線交會處呈現半透明自然疊合光彩。此外，繪圖主體改採具 Hoisting 特性之函式宣告，並以成對 `ctx.save()` / `try { ... } finally { ctx.restore(); }` 嚴格包裹，杜絕 `shadowBlur`、`shadowColor` 與透明度污染外部 Canvas 狀態。
**行動 (Action):** 在所有散點與多曲線重疊型遙測畫布中，推行 Alpha 混合交錯透光模式以防覆蓋遮蔽；即時焦點點位統一採用同軸脈衝光環（Halo + Core）增強視覺追蹤，並強制將 `try/finally` context 狀態保護列為 Canvas 渲染標準防護契約。
**署名:** Vector as Antigravity

## 2026-11-05 - GForceRadar 歷史極值同軸光環、零配置槽位與狀態防護
**渲染洞察 (Rendering Learning):** 在 G-Force 雷達畫布（GForceRadar）中，歷史極值標記（Apex G-force Markers）在定時 5Hz rAF 循環中過去每幀皆動態分配 8 個座標物件與 1 個陣列，造成週期性微小 GC 壓力；透過宣告常駐預分配的 8 個 markerSlots 槽位進行就地極值更新，達成了零每幀記憶體配置。視覺上，過去單層 3*dpr 純色圓點在暗色十字分割線與外圈交會處對比度薄弱；透過引入同軸雙層「外圈脈衝光環 (Halo Ring, 4.2*dpr) + 實心焦點內核 (Core Dot, 2.0*dpr)」架構，外圈以單次路徑批次 `ctx.stroke()` 激發柔和光暈（`shadowBlur = 4*dpr`），內核以單次路徑批次 `ctx.fill()` 凝練實心焦點，僅需 2 次繪製調用即賦予賽車過彎 Apex 點極具科技感的同軸立體深度。此外，繪圖主體全面轉換為具 Hoisting 特性之函式宣告，並以成對 `ctx.save()` / `try { ... } finally { ctx.restore(); }` 嚴格包裹，在 flat 主題自動抑制陰影，徹底阻絕狀態樣式滲漏。
**行動 (Action):** 在所有儀表極值與歷史取樣標記中推廣就地槽位（pre-allocated slots）零配置模式；多層同軸幾何優先採用分離批次路徑（batch stroke + batch fill）以最小 draw call 達成層次化光暈，並強制將 `try/finally` context 狀態保護列為 Canvas 標準合約。
**署名:** Vector as Antigravity
## 2026-11-06 - TireRadar 同軸脈衝光環、抓地力警戒發光與狀態防護契約
**渲染洞察 (Rendering Learning):** 在輪胎抓地力雷達畫布（TireRadar）中，過去即時焦點（Active Grip Point）僅使用固定透明度的半透明大圓盤填充，缺乏科技層次且在有 glowStrength 主題下未激發真實 shadowBlur 霓虹光暈；透過引入同軸「外圈脈衝光環 (Halo Ring, 5.8*dpr, stroke) + 內核定位點 (Core Dot, 3.2*dpr, fill)」架構，並在突破極限（|slipRatio| > 1.0 或 |slipAngle| > 1.0）時即時將光暈切換為危險警戒色（theme.danger），大幅提升賽車激烈操駕時的極限滑移可讀性；在 linear 工業模式下自適應切換為同軸矩形光環（strokeRect + fillRect）。同時，歷史軌跡補齊 lineCap = 'round' 消除端點生硬截斷。此外，Radar Canvas 與 Temp Canvas 全面導入成對 ctx.save() / try { ... } finally { ctx.restore(); } 防護契約，杜絕陰影與樣式滲漏至相鄰畫布。
**行動 (Action):** 在所有極限邊界與抓地力雷達畫布中推行同軸脈衝光環與極限警戒發光模式；高頻時間序列折線一律補齊 lineCap = 'round'，並將成對 ctx.save() / try / finally { ctx.restore(); } 列為所有 HUD / Telemetry Canvas 必須遵守的最高防護合約。
**署名:** Vector as Antigravity

## 2026-11-07 - 引擎轉速條斜角幾何補正、同軸領航高光與狀態防護
**渲染洞察 (Rendering Learning):** 在 60Hz 引擎轉速儀表（EngineRpmDisplay）中，斜切角幾何（slant = 3*dpr）若未納入可用寬度計算，在最右端 segment（i = numSegments - 1）其右上頂點會延伸至 w + slant，造成右側邊界生硬裁切（hard clipping）與 Redline Alert 發光邊緣截斷；透過將可用寬度預扣 slant（availableWidth = Math.max(0, w - slant)），可使最右端頂點精確貼合畫布邊緣。在視覺引導上，透過在頂端活躍格（activeSegs - 1）疊加半透明同軸領航高光（Coaxial Tip Highlight），能強化高速拉轉時車手周邊視覺的即時鎖定。此外，繪圖主體提升為標準函式宣告並以 ctx.save() / try { ... } finally { ctx.restore(); } 嚴格包裹，在 flat 主題自動抑制陰影，杜絕發光與樣式滲漏。
**行動 (Action):** 所有具斜切角（Slanted Segment）與非正交幾何的儀表，必須將幾何傾斜量計入畫布可用寬高防禦邊界裁切；高頻繪圖一律落實成對狀態防護與 flat 主題無陰影合約。
**署名:** Vector as Antigravity

## 2026-11-08 - 懸吊即時同軸脈衝標記、邊界裁切補償與狀態安全隔離
**渲染洞察 (Rendering Learning):** 在懸吊行程波形（SuspensionBar）渲染中，最新採樣端點過去直接對齊畫布邊界 x = w，導致 2*dpr 線寬與發光光暈有近半徑被畫布硬裁切（edge clipping），且折線終點在激進操駕時缺乏焦點標示；透過導入 rightPadding = 4.2*dpr 邊界邊距預留，並在最新點加入同軸雙層「外圈脈衝光環 (Halo Ring, 3.6*dpr) + 實心定位內核 (Core Dot, 1.8*dpr)」，能在極限壓縮（bottoming-out）或拉伸（bump-stop）時精準觸發 danger 警戒發光，同時兼顧單一取樣點（history.size === 1）時的即時可見性。此外，繪圖主體全面採用成對 ctx.save() / try { ... } finally { ctx.restore(); } 防護合約，徹底阻絕 shadowBlur 與樣式滲漏至外部 Canvas 狀態。
**行動 (Action):** 所有時間序列與動態軌跡畫布在最新端點均應配置邊界保護 padding 與同軸 Leading Pulse Marker；狀態管理強制採用 try/finally 確保 Context 乾淨復原，嚴格落實零每幀物件配置。
**署名:** Vector as Antigravity

## 2026-11-09 - TrendChart 多曲線同軸前緣脈衝光環、零配置端點與狀態安全隔離
**渲染洞察 (Rendering Learning):** 在多曲線時間序列趨勢圖（TrendChart，涵蓋懸吊、輪胎、動態等）中，過去僅單純繪製折線至最新採樣點，折線末端在數值高頻劇烈跳動時缺乏即時視覺焦點，且原有繪圖流程缺少 `ctx.save()` 與 `try/finally` 狀態保護，使 `font`、`fillStyle`、`strokeStyle` 與 `shadowBlur` 容易滲漏至外部或後續 Canvas 操作；透過在每條線條折線閉合後，就地（in-place）使用區域純量變數記錄最後有效座標 `lastX`, `lastY`（零每幀物件與陣列配置），繪製同軸雙層「外圈脈衝光環 (Halo Ring, 3.2px, stroke) + 內核定位點 (Core Dot, 1.6px, fill)」，並於非 flat 主題激發柔和光暈（`shadowBlur = 4 * glowStrength`），在 linear 工業主題自動切換為方形標記（strokeRect + fillRect），大幅提升多輪動態趨勢辨識度。此外，以成對 `ctx.save()` / `try { ... } finally { ctx.restore(); }` 嚴密隔離 Context 狀態，杜絕樣式滲漏。
**行動 (Action):** 所有多通道曲線圖表與折線趨勢畫布均應配置同軸 Leading Active Pulse Marker 提供即時焦點；繪圖邏輯強制使用 `try/finally` 成對還原 context 狀態，並維持零每幀記憶體配置。
**署名:** Vector as Antigravity

## 2026-11-14 - Telemetry Cards 踏板波形圓角平滑、同軸前緣光環與邊界保護
**渲染洞察 (Rendering Learning):** 在 `hud_overlay/shared/telemetry-cards/pedal-wave.js` 的 60Hz 踏板波形畫布中，過去缺少 `save()` / `try-finally restore()` 狀態防護、未設定 `lineCap = 'round'` / `lineJoin = 'round'` 導致急踩急放產生銳角突刺，且水平步距直接鋪滿 `pw` 造成滿載（300 點）與 0%/100% 端點及發光被畫布邊界裁切，單一採樣（`len === 1`）時亦完全不可見。透過將雙通道繪製抽離為零配置輔助函式 `drawTraceChannel`，預留與 `shadowBlur` 及光環半徑相稱的 `padX` / `padY` 邊界（`5.5 * dpr`），補齊 25%/75% 批次參考線，並於最新採樣端點繪製同軸雙層脈衝標記（Halo Ring `4.2 * dpr` + Core Dot `2.0 * dpr`），即可在不增加任何每幀物件配置的前提下顯著提升動態鎖定感與高 DPI 邊緣完整性。
**行動 (Action):** 在所有 `hud_overlay/shared/telemetry-cards/` 高頻時間序列畫布中維持 `try/finally` Context 狀態隔離、`padX/padY` 邊界保護與單點可讀之同軸前緣脈衝標記，並優先抽離共用通道繪圖函式消除重複邏輯。
**署名:** Vector as Antigravity
