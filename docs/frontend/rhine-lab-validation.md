# Rhine Lab 本地驗收紀錄

日期：2026-10-06。基準：`35cdb26b`；實作位於 `codex/rhine-lab-theme`。最終交付經使用者確認收斂為純 2D，保留紙頁版面、字體、刻度、短暫動畫與共用對話框改善。

## 已完成的自動檢查

| 檢查 | 結果 |
| --- | --- |
| `pnpm -C frontend run test` | 189 files passed、1 skipped；1,698 tests passed、1 skipped |
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
- Windows WebView2 **154.0.4258.53**：現有 debug Tauri host 載入目前開發前端，確認 1280×720 內容區的 Rhine 淺色儀表；[原生畫面](assets/rhine-lab/webview-live-light.png)。不是 release EXE 驗收。
- Companion 的既有 `/assets/` HTTP 路由可回傳 Rhine WOFF2（HTTP 200、`font/woff2`）；未修改後端 API。Android 實機尚未驗收。
- 原專案 `D:/RhineLabUI` 未修改。字體協議、分包工具授權及來源署名分別保留。

![Rhine Lab 淺色在 Windows WebView2 的實際畫面](assets/rhine-lab/webview-live-light.png)

新增的六個主選單紙頁面板均已透過 Edge 開啟、Escape 關閉並檢查背景 inert；沒有水平溢出。外觀／診斷保持掛載，共用關閉保護。附[外觀暗色畫面](assets/rhine-lab/appearance-dark.jpg)。寬度與關閉驗證仍需在窄画面及 WebView2 複核。

五卡 Canvas 已以隔離後端 600 個合成封包驗證：RPM／方向、踏板、動力散點、胎況與懸吊皆收到資料；懸吊顯示 0.20 至 0.80 的合成變化範圍。套用 Rhine 三色後無需再發送封包即可重畫；附[淺色](assets/rhine-lab/canvas-light.jpg)與[暗色](assets/rhine-lab/canvas-dark.jpg)。五卡逐元素研究由使用者指定的 Sol 子代理完成，見[設計研究](rhine-telemetry-design.md)。

Sol 獨立核對找出停用／重啟輪胎圖表會重設 effect 區域樣本，造成 Canvas 與保留讀值矛盾。最新輪胎樣本及原始時間、RPM／alert、散點轉速上限已改存 ref；重新訂閱後從同一份資料重畫。回歸測試涵蓋收到 230°F／1.1 ratio／1.2 angle 後停止封包，關閉／開啟圖表並切換至 Celsius，仍顯示 110°C 與原抓地讀值。

## 對比與包體

基礎色值的 WCAG 對比計算見 [contrast.json](assets/rhine-lab/contrast.json)：淺色三種表面上的輔助文字最低 **4.63:1**、主要文字最低 **15.50:1**；深色分別最低 **5.60:1**、**9.58:1**。必要控制項邊界在六種表面最低 **3.60:1**。這不代表任意使用者自訂三色都達標，也不取代完整畫面無障礙稽核。

以相同工具鏈建置 `35cdb26b` 與最終純 2D 工作樹，未壓縮 `dist` 清點如下；這是前端資產體積，不是安裝包大小或首屏網路下載量。詳細數據見 [bundle-sizes.json](assets/rhine-lab/bundle-sizes.json)。

| 類別 | 基準 | Rhine 2D |
| --- | ---: | ---: |
| JavaScript | 1,188,233 bytes | 1,189,447 bytes |
| CSS | 433,596 bytes | 743,420 bytes |
| WOFF2 | 0 bytes | 12,197,248 bytes |
| GLB | 0 bytes | 0 bytes |
| 全部前端檔案 | 1,629,549 bytes | 14,388,387 bytes |

JavaScript 增加 1,214 bytes；主要增量為計畫保留的 MiSans 原始分片與 unicode-range CSS。字體使用 `font-display: swap` 與系統回退。

## 效能與尚未完成的情境

本機 Edge 154、1422×800、相同合成 UDP 資料（324 bytes、約 60Hz、4500 RPM／120 km/h）的一次 10 秒 Rhine 2D Live 量測取得 601 個 frame interval，p50 16.7ms、p95 16.8ms。量測程式只存在忽略的 `scratch/rhine-evidence/`，不隨產品出貨。尚未完成對原基準版的同機 Live／Sessions 重複比較，因此**未宣告 p95 退化 ≤10% 的完整效能門檻通過**。合成封包不是真實遊戲證據。

後續 2124×978 的配對診斷中，Rhine 與基準版本分別只取得 56／58 幀，兩者 p95 均約 1016ms，雖然頁面的 hidden 標記為 false。這組環境沒有維持正常畫面更新頻率，不能用來判定主題效能差異；需在確實顯示於前景的視窗重做同資料比較。

前一輪互動畫面驗收曾因使用者按 Escape 停止；後續 PR 交付階段已補驗明暗設定與 Session 切換。下列項目仍待實際操作：

- 2D 動畫短錄影；目前留存明暗瀏覽器設定與淺色原生截圖。
- 200% 縮放、OS reduced motion、離線／字體載入失敗及三語完整字形。
- 調校草稿、各步驟及更多捲動位置的完整狀態保留驗收；已選 Session 的跨系統切換已驗證。
- WebView2 的快速開關、進入中關閉、退出中切主題、背景點擊與自訂 CSS 組合；現有單元測試不能代替這些實測。
- Windows release EXE、Companion Android 原生、獨立 HUD 及真實遊戲環境。
