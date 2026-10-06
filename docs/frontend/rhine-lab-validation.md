# Rhine Lab 本地驗收紀錄

日期：2026-10-06。基準：`35cdb26b`；實作位於 `codex/rhine-lab-theme`。最終交付經使用者確認收斂為純 2D，保留紙頁版面、字體、刻度、短暫動畫與共用對話框改善。

## 已完成的自動檢查

| 檢查 | 結果 |
| --- | --- |
| `pnpm -C frontend run test` | 189 files passed、1 skipped；1,700 tests passed、1 skipped（含 Swiss 與跨頁圖表追加實作） |
| `pnpm -C frontend run build` | TypeScript 與 Vite 通過，含 Full／Lite／Companion 入口 |
| `pnpm install --frozen-lockfile --ignore-scripts` | 通過；不新增執行期相依 |
| `git diff --check` | 通過 |
| 主題契約 | 七 Core × 明暗模式的首幀／React 一致性，配色保留、預設三色模式轉換及 JSON schema 2 往返 |
| 共用對話框 | 事件未觸發的保護、只關閉一次、退出期間背景隔離、焦點還原、reduced motion／零 transition |
| 素材 | 匯入器鎖定來源提交；376 份原始字體分片逐一比對來源 SHA-256，匯入 manifest 的 382 個檔案雜湊再次通過 |
| 治理 | 13 個 canonical skill ID 與索引一致；修改的技能通過 validator；變更 Markdown 本地連結及 tracked path 大小寫檢查通過 |

已完整刪除實驗背景的場景程式、開關、localStorage 讀寫、三語文案、專用測試、GLB、Three.js 及其型別相依、專用 chunk、授權與操作文件。最終 source／manifest／lockfile 搜尋及 `dist` 清點沒有實驗背景殘留；資產匯入器只處理字體及署名，不再產生模型。

## 已完成的互動檢查

- Edge 154：七 Core 明暗切換、Rhine／Swiss 預覽隔離，資料見 [theme-matrix.json](assets/rhine-lab/theme-matrix.json)。
- 設定視窗：繁中／英／日測量未發現內容新增水平溢出；另在 transition 完成後複核 320、768、1024、1280×720、1920×1080 的邊界，見 [layout-settled.json](assets/rhine-lab/layout-settled.json)。前兩者保留抽屜，後三者置中並保留至少 24px 邊距。
- Escape：實際瀏覽器關閉後，`#root` 解除 inert，焦點回到「應用程式選單」。這項檢查找出原生 inert 會提早清除焦點的問題，已改為先保存觸發元素再隔離背景。
- 補驗修正：設定的共用 CSS 延後載入時會以同等優先序覆蓋 Rhine 的單欄規則；限定到設定對話框後，實際 computed grid 與明暗畫面均確認為單欄。附 [淺色設定](assets/rhine-lab/settings-light.jpg)及[暗色設定](assets/rhine-lab/settings-dark.jpg)。
- 狀態保留：在隔離後端以合成 UDP 錄製 26 個樣本，選取已儲存 Session 並捲至下方，再依序切換 Halfmoon／Swiss Editorial／Rhine；Session ID、26 筆資料與閱讀位置均保留。底部的 scrollTop 隨字體版面高度微調，沒有回到頁首，見 [session-theme-state.json](assets/rhine-lab/session-theme-state.json)。
- Windows WebView2 **154.0.4258.53**：現有 debug Tauri host 載入目前開發前端，確認 1280×720 內容區的 Rhine 淺色儀表；[原生畫面](assets/rhine-lab/webview-live-light.png)。後續使用 `--no-sidecar` 連接隔離測試後端，補驗同尺寸暗色儀表與外觀紙頁，以及最大化視窗中的系統設定。不是 release EXE 驗收。
- Companion 的既有 `/assets/` HTTP 路由可回傳 Rhine WOFF2（HTTP 200、`font/woff2`）；未修改後端 API。Android 實機尚未驗收。
- 原專案 `D:/RhineLabUI` 未修改。字體協議、分包工具授權及來源署名分別保留。

![Rhine Lab 淺色在 Windows WebView2 的實際畫面](assets/rhine-lab/webview-live-light.png)

新增的六個主選單紙頁面板均已透過 Edge 開啟、Escape 關閉並檢查背景 inert；沒有水平溢出。重新量測 transition 完成後的尺寸，設定寬 1040px、外觀 864px、診斷 928px、Companion 960px、MCP 800px、關於 608px（小數四捨五入），在 1422×800 內容區保留至少 24px 邊距，見 [menu-paper-dialogs.json](assets/rhine-lab/menu-paper-dialogs.json)。外觀／診斷保持掛載，共用關閉保護。附[外觀暗色畫面](assets/rhine-lab/appearance-dark.jpg)。寬度與關閉驗證仍需在窄畫面及 WebView2 複核。

原生補驗（產品程式碼與 `1ead3687` 相同）：在 WebView2 的外觀紙頁切換暗色，Escape 關閉後回到儀表，主選單觸發按鈕顯示焦點框；開啟系統設定時，無障礙樹只呈現對話框內容，點擊背景後對話框消失、主畫面重新可達。1,800 個合成封包下的 RPM、踏板、動力、胎況與懸吊皆有可見資料。附[暗色外觀](assets/rhine-lab/webview-appearance-dark.png)、[暗色遙測](assets/rhine-lab/webview-live-dark.png)與[最大化視窗中的設定](assets/rhine-lab/webview-settings-dark.png)。這些證據只涵蓋上述操作，不代表已完成六個原生面板、快速關閉、窄視窗、200% 縮放或全部鍵盤焦點循環。

五卡 Canvas 已以隔離後端 600 個合成封包驗證：RPM／方向、踏板、動力散點、胎況與懸吊皆收到資料；懸吊顯示 0.20 至 0.80 的合成變化範圍。套用 Rhine 三色後無需再發送封包即可重畫；附[淺色](assets/rhine-lab/canvas-light.jpg)與[暗色](assets/rhine-lab/canvas-dark.jpg)。五卡逐元素研究由使用者指定的 Sol 子代理完成，見[設計研究](rhine-telemetry-design.md)。

Sol 獨立核對找出停用／重啟輪胎圖表會重設 effect 區域樣本，造成 Canvas 與保留讀值矛盾。最新輪胎樣本及原始時間、RPM／alert、散點轉速上限已改存 ref；重新訂閱後從同一份資料重畫。回歸測試涵蓋收到 230°F／1.1 ratio／1.2 angle 後停止封包，關閉／開啟圖表並切換至 Celsius，仍顯示 110°C 與原抓地讀值。

Sol 已在 `1ead368749cd7ea31086c15af4d59df286e951b9` 重新執行原 P2 情境，另核對原始樣本時間、RPM 9000／上限 10000／alert、動力圖上限 10000 與既有歷史均保留。這是 React／jsdom 的資料生命週期複驗，不替代原生畫面驗收。

字體載入失敗：隔離靜態伺服器讓全部 WOFF2 請求回傳 HTTP 404，server log 確認 regular／demibold 分片確實請求失敗。Edge 的 Rhine 繁中遙測與設定仍使用系統回退字體可讀；設定可開啟、Escape 關閉，背景 inert 還原，未出現水平溢出。附[字體失敗時的設定畫面](assets/rhine-lab/font-fallback.png)。此項只涵蓋瀏覽器、目前可見文字及字體失敗，不代表離線 API、三語完整字形或 WebView2 已驗收。

200% 縮放：由使用者手動設定 Edge 工具列縮放，量測 `devicePixelRatio = 2`、CSS 內容區約 956×442；沒有以 CSS zoom 或 viewport override 代替。外觀與設定依 1024px 切換點恢復右側抽屜，兩者 clientWidth／scrollWidth 均為 635px，頁面為 956px。外觀可捲至 CSS 編輯器及匯入／匯出控制項；設定的繁中、英文、日文均未新增水平溢出，最末控制項 Tab 回到關閉按鈕，Escape 後解除 inert 並還原選單焦點。五張遙測卡片重新排版，四輪懸吊可捲到底部讀取。見 [量測](assets/rhine-lab/zoom-200.json)、[外觀](assets/rhine-lab/zoom-200-appearance.png)、[繁中設定](assets/rhine-lab/zoom-200-settings.png)、[日文設定](assets/rhine-lab/zoom-200-settings-ja.png)、[遙測](assets/rhine-lab/zoom-200-live.png)及[四輪讀值](assets/rhine-lab/zoom-200-live-bottom.png)。遙測圖使用 fixture 的引擎通道回放，其餘通道為測試值；沒有以這些資料判定物理準確性。此項不代表所有頁面、所有解析度與原生 WebView2 的 200% 驗收。

使用者於同輪明確表示「動畫效果不用測」，因此取消 Windows 系統動畫效果開關的人工驗收；不變更產品對 `prefers-reduced-motion` 的支援與既有契約測試，也不把未執行的 OS 驗收記為通過。

## Swiss 與跨頁圖表追加驗收

使用者追加 Swiss 五卡差異化與 AEGO／其他頁面的圖表風格後，將原遙測專用 `canvasTheme` 移到共用 utils。高頻圖表保留快取讀取，靜態圖表也會在 Core、明暗、配色及字體載入完成時重畫既有資料。Recharts SVG 沿用相同 CSS token；未修改 Rust 公式、步驟資格、遙測協定與圖表資料。

- Swiss Technical／Editorial／Contrast 各有明暗實際截圖，使用同一批 600 個合成封包後停止傳送，再切換 Core。平面 RPM／懸吊、清楚的功能色、實色圖例與圓形極座標保持 Swiss 的網格儀表語言；Rhine 保留線性方向尺、方形標記與實線刻度。見 [Swiss 研究](swiss-telemetry-design.md)、[矩陣與一次未選成功的操作診斷](assets/rhine-lab/core-chart-live-matrix.json)、[Swiss Editorial 淺色](assets/rhine-lab/swiss-editorial-light.png)、[Swiss Contrast 暗色](assets/rhine-lab/swiss-contrast-dark.png)及[Rhine 暗色](assets/rhine-lab/core-chart-rhine-dark.png)。
- AEGO 以同一份已保存引擎 fixture、780kg 測試 profile，經正常沿用流程產生齒比。Rhine 暗色／淺色與 Swiss Editorial 淺色間沒有新封包；終傳比與六檔數值均保持 `4.34 / 2.32 / 1.70 / 1.30 / 1.03 / 0.84 / 0.72`，六條 SVG 曲線路徑逐一相等。Rhine 使用實線格線，Swiss 使用 `2 4` 疏虛線；長小數 RPM 軸標籤改為整數顯示。見 [非空三組資料紀錄](assets/rhine-lab/gearing-theme-state.json)、[Rhine 淺色](assets/rhine-lab/gearing-rhine-light.png)及[Swiss 淺色](assets/rhine-lab/gearing-swiss-editorial-light.png)。
- 賽事頁在 Swiss Editorial 暗色、Rhine 暗色／淺色及 Halfmoon 淺色間切換，Session ID、26 筆樣本及 speed 指標保留；軌跡／圈速 Canvas 即時更新字體、格線與線色。實際畫面修正了圈速圖下方 0% 與 X 軸文字重疊、flex 內層高度超出固定 360px 面板的問題。見 [狀態紀錄](assets/rhine-lab/analysis-theme-state.json)、[Swiss](assets/rhine-lab/analysis-swiss-dark.png)與[Rhine](assets/rhine-lab/analysis-rhine-light.png)。這份合成 Session 的位置為零、速度固定，不代表真實賽道或雙圈比較負載。
- Sol 獨立檢查找出 `text-body !important` 壓過 ANG／RAT 危險色，以及 Rhine 暗色 Regen 對比不足；已移除衝突 class 並讓 Regen 使用 Rhine 油門功能色。實際 EV 合成封包下，八個 ANG／RAT 讀值皆為 `rgb(240,145,143)`，負功率／扭力與 Regen ON 為 `rgb(139,189,157)`。見 [DOM computed 色彩](assets/rhine-lab/safety-colors.json)與[畫面](assets/rhine-lab/safety-colors.png)。
- 新增 Core-only 變更時的快取字體／格線回歸。獨立 jsdom 檢查三個靜態 Canvas 的 font loadingdone 與 ResizeObserver，在切換後無持續增加，卸載後歸零。這是程式生命週期證據，不是 GPU 記憶體量測。

引擎收集 Canvas、車輛馬力／扭力 SVG、直線加速的速度與輪滑 SVG、遙測詳細歷史圖亦已套用共用契約；目前有資料的跨系統互動證據集中在上述五卡、AEGO 與賽事圖表。新增的所有圖表仍需區分瀏覽器實测與原生／真實遊戲驗收。

## 對比與包體

基礎色值的 WCAG 對比計算見 [contrast.json](assets/rhine-lab/contrast.json)：淺色三種表面上的輔助文字最低 **4.63:1**、主要文字最低 **15.50:1**；深色分別最低 **5.60:1**、**9.58:1**。必要控制項邊界在六種表面最低 **3.60:1**。這不代表任意使用者自訂三色都達標，也不取代完整畫面無障礙稽核。

以相同工具鏈建置 `35cdb26b` 與最終純 2D 工作樹，未壓縮 `dist` 清點如下；這是前端資產體積，不是安裝包大小或首屏網路下載量。詳細數據見 [bundle-sizes.json](assets/rhine-lab/bundle-sizes.json)。

| 類別 | 基準 | Rhine 2D |
| --- | ---: | ---: |
| JavaScript | 1,188,233 bytes | 1,191,806 bytes |
| CSS | 433,596 bytes | 746,925 bytes |
| WOFF2 | 0 bytes | 12,197,248 bytes |
| GLB | 0 bytes | 0 bytes |
| 全部前端檔案 | 1,629,549 bytes | 14,394,413 bytes |

JavaScript 增加 3,573 bytes；主要增量為計畫保留的 MiSans 原始分片與 unicode-range CSS。字體使用 `font-display: swap` 與系統回退。

## 效能與尚未完成的情境

使用者將 Edge 留在前景後，完成 `35cdb26b` 與 `aee773d0` 的同機配對比較。兩版使用同一分頁、淺色模式、1422×800 CSS 內容區，每個畫面各量測三輪、每輪 10 秒。Live 使用相同的 3,600 個合成 UDP 封包產生器（324 bytes、約 60Hz、RPM／踏板／輪胎／懸吊變化、120 km/h），至少預熱 10 秒後採樣；Sessions 載入同一份 26 筆合成資料並量測靜態顯示。完整每輪 frame count／p50／p95／max 見 [foreground-performance.json](assets/rhine-lab/foreground-performance.json)。

| 畫面 | 基準三輪 p95 | Rhine 三輪 p95 | 三輪 p95 中位數差異 | 最差輪 p95 差異 |
| --- | --- | --- | --- | --- |
| Live | 33.2／17.1／16.9ms | 16.9／33.3／17.1ms | 約 0% | 約 +0.3% |
| Sessions（26 筆） | 16.9／16.9／16.9ms | 16.9／16.9／16.9ms | 約 0% | 約 0% |

**這組受控 Edge 測試的中位數與最差輪 p95 比較均未超過 10% 退化門檻**。表中是每輪 p95 的比較，不是將所有幀合併後的 p95。Rhine Live 第二輪保留了一次 383.3ms 的最大間隔，未刪除該輪，也未判定其原因；Sessions 只有 26 筆，不能代表大型賽事負載。這些結果不涵蓋 WebView2 或真實遊戲。量測程式只存在忽略的 `scratch/rhine-evidence/`，不隨產品出貨。

先前沒有確認前景的配對診斷兩版均出現約 1016ms p95，已排除於正式比較；原先單次 601 幀／16.8ms 結果也不作配對結論。前景恢復後、尚未固定尺寸的三輪診斷另存於 JSON 的 `diagnosticRuns`。

調校狀態補驗：隔離 `default_car` 草稿將車重設為 1475，跨 Halfmoon／Swiss Editorial／Rhine 後保留；步驟 3 套用 Rhine 不跳回第一步，返回步驟 1 仍保留 1475，最後還原原值 1500，見 [tuning-draft-theme-state.json](assets/rhine-lab/tuning-draft-theme-state.json)。

四步驟補驗使用既有去識別 Beetle 引擎 fixture 的 2,020 筆資料及測試車輛 profile，經隔離 Rust 後端正常分析／保存／確認沿用流程取得 measured-engine 資格，沒有繞過第四步限制。步驟 1–3 各自跨 Halfmoon／Swiss Editorial／Rhine 保留作用中步驟，第一步未儲存的 785kg 草稿保留；Rhine／Halfmoon 齒比值均為 4.34、2.33、1.70、1.30、1.03、0.85、0.72。第四步的 Road 賽事名稱草稿跨三系統保留，沒有建立基準或開始錄製。見 [完整紀錄](assets/rhine-lab/measured-workflow-theme-state.json)與[第四步畫面](assets/rhine-lab/measured-workflow-step4.png)。第三步後瀏覽器分頁關閉，第四步於新分頁重新通過沿用流程後獨立驗證；不宣稱跨關閉分頁保留未儲存草稿，也不是新的真實遊戲量測。

前一輪互動畫面驗收曾因使用者按 Escape 停止；後續 PR 交付階段已補驗明暗設定與 Session 切換。下列項目仍待實際操作：

- 2D 動畫短錄影；目前留存明暗瀏覽器設定與明暗原生截圖。
- 離線、三語完整字形及 WebView2 字體失敗；Edge 200% 的上述畫面及繁中可見畫面的字體失敗回退已補驗。OS reduced motion 人工驗收依使用者要求取消。
- 更多調校捲動位置與長時間操作；四步驟分段、上述草稿及已選 Session 的跨系統切換已驗證。
- WebView2 的快速開關、進入中關閉、退出中切主題及自訂 CSS 組合；外觀的 Escape 與設定的背景點擊已補驗，現有單元測試不能代替其餘實測。
- Windows release EXE、Companion Android 原生、獨立 HUD 及真實遊戲環境。
