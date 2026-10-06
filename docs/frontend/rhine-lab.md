# Rhine Lab 實作與驗收

Rhine 是第三個設計系統，`rhine-lab` 是第七個 Core。Full／Lite 共用紙面、檔案標頭、刻度導覽與 2D 動畫；Companion WebView 使用共用 CSS。Android 原生介面與獨立 HUD 不在本次範圍。

## 設定與視覺契約

- catalog 推導 `data-design-system="rhine"`，保留 `halfmoonCore`、`themeSettings`、後端 `theme` 及 JSON schema 2。切換 Core 不重設配色或重新掛載工作區。
- Rhine Lab 配色為 ink／bronze／muted 三色，完整匹配內建三色時隨明暗模式轉換；自訂三色保留原值。
- 版面全部限定於 `rhine.css`。六個主選單面板在寬度 1024px 以上統一置中：設定 65rem、外觀 54rem、診斷 58rem、Companion 60rem、MCP 50rem、關於 38rem；邊距 24px、最高為視窗減 48px，較窄時沿用抽屜。設定單欄分節，控制項依既有 container query 上下排列。
- 刻度 150ms、分頁底線 180ms、紙頁入場 220ms／退出 160ms、最多位移 8px。只有靜態頁首揭示；資料、表單、警示立即可讀。`prefers-reduced-motion` 直接到終態，Canvas／圖表／即時卡片排除 transition 與 animation。
- `AppDialog`、`ThemeView`、`DiagnosticConsole` 共用 `useDialogTransition`，使用 transform 完成事件及實際 transition duration／delay 計算關閉保護。關閉只完成一次，退出期間保留焦點限制與背景隔離，完成後才還原焦點。外觀 CSS 草稿及診斷篩選因常態掛載而保留。
- Core 預覽由 catalog 選擇色票或元件模式；元件預覽使用自己的 class，避免外層主題元件規則污染。

## 即時遙測 Canvas

五張遙測卡片中的 RPM、方向盤、踏板曲線、動力／扭力、G 值歷史點、輪胎雷達／胎溫與四輪懸吊共用 canvasTheme 的快取 token。Rhine 使用平直 RPM 刻度、細線方向盤、實線格線、方形扭力／歷史標記與無光暈表面；警示仍使用獨立紅色、胎溫保留冷／正常／熱分類與既有門檻。SHIFT 在 Rhine 保持靜態紅色提示，圖例與點形一致。

共用快取位於 `src/utils/canvasTheme.ts`。適用範圍已延伸至 AEGO 齒比（Recharts SVG）、引擎量測曲線、賽道地圖、圈速比較、遙測詳情、Dyno 與直線加速圖表。Rhine 使用 MiSans、實線尺規與較低飽和的齒輪分類色；Swiss 使用稀疏虛線與資料網格。Canvas 在靜止資料及字體完成載入時也會更新，資料、單位與資格不依主題改寫。完整責任與 token 見[跨頁圖表契約](design-systems.md#跨頁圖表契約)。

主題變更及 resize 只重畫既有樣本，不加入遙測、不重設歷史或最大值。CSS 計算在主題更新時執行，資料接收仍直接繪圖，不引入每幀 React state。停止接收後也能切換風格；切回其他 Core 時回到既有 token fallback。懸吊補回既有漏失的 update 事件訂閱，確保即時讀值與曲線能收到資料。

## 素材來源與重製

研究基準為 [LBEILC/RhineLabUI](https://github.com/LBEILC/RhineLabUI) 的 `3664b4abe3b7e852c7022a261e2d66d8f2e8c667`。不修改來源專案。

```powershell
node frontend/scripts/vendor-rhine.mjs D:/RhineLabUI
```

匯入器檢查來源提交與每個字體分片 SHA-256，只匯入字體、來源紀錄與授權。文字檔統一為 LF，並由 `.gitattributes` 固定 checkout 換行，確保 Windows／Linux 上的來源清單雜湊一致；字體及 PDF 二進位不變。不帶入模型、原 PV、故事文案、音訊、Novecento 或互動控制器，產品品牌維持 HorizonTuner。

MiSans `misans-webfont@4.3.1`／font 4.003 的 regular／demibold 原始 WOFF2 分片共 12,197,248 bytes，僅提供 400／600。沒有重新裁字、轉檔或修改字形；CSS family／路徑調整並保留 `font-display: swap`、Unicode range 與系統回退字體。

| 檔案 | 用途 |
| --- | --- |
| [SOURCE.json](../../frontend/public/assets/rhine/SOURCE.json) | 來源提交及匯入檔雜湊 |
| [font source.json](../../frontend/public/assets/rhine/fonts/misans-webfont-4.3.1/source.json) | 套件 integrity 與字體分片雜湊 |
| [MiSans NOTICE](../../frontend/public/assets/rhine/fonts/NOTICE.txt)／[字體協議](../../frontend/public/assets/rhine/fonts/MiSans-license.pdf) | 小米字體署名及使用條款 |
| [分包專案 Apache 2.0](../../frontend/public/assets/rhine/fonts/misans-webfont-4.3.1/TOOLING-LICENSE-APACHE-2.0.txt) | 保留分包專案的獨立授權，來源見 NOTICE；不取代字體協議 |
| [RhineLabUI MIT](../../frontend/public/assets/rhine/licenses/RhineLabUI-MIT.txt) | 視覺參考專案授權 |

素材統一放在 `/assets/rhine/`，適用 Vite、Tauri 與 Companion 既有靜態路由。About 提供署名與授權連結。分包專案 Apache 檔由上游 LICENSE 保留，不由 Rhine 匯入器重新下載。

## 驗證方式

```powershell
pnpm -C frontend run test
pnpm -C frontend run build
git diff --check
```

主題契約測試覆蓋七 Core 明暗模式、首幀／React 一致性、三色保留、模式配色與 JSON 往返。`AppDialog.test.tsx` 驗證關閉保護、退出期間隔離、焦點還原及零動效。mock 測試不代表 Windows WebView2 實測。

實際驗收須記錄瀏覽器／WebView2 版本、資料來源、viewport、縮放、reduced motion 與字體請求。檢查 320／768／1024／1280×720／1920×1080、三語、200% 縮放、草稿與 Session 選取保留、Escape／背景／快速關閉及自訂 CSS。Live／Sessions 用同機同資料比較 p95 畫面間隔，允許退化不超過 10%；2D 不新增持續動畫。測試結果及未完成的原生／真實遊戲驗收須分別記錄，見 [本次驗收紀錄](rhine-lab-validation.md)。

## 下一階段的設計方向

2026-10-06 使用者指出 Rhine 與 Swiss Editorial 在暖紙色、細框及低裝飾表面上仍相似。下一階段應以日常版面與操作區別兩者：Swiss Editorial 偏向閱讀編排、留白、字階與段落節奏；Rhine 偏向檔案／儀器工作台，強化標籤欄、資料對齊、刻度及狀態轉換。辨識度來自日常使用的介面本身。

Rhine 導入的預覽隔離、對話框時序、無障礙降級及素材管理可回饋三套設計系統，共用品質與系統個性分別推進。這是後續設計方向，本輪不改寫 Halfmoon／Swiss 的既有視覺定位。

五張遙測卡片的逐元素研究及下一階段優先序見[Rhine 遙測設計研究](rhine-telemetry-design.md)。
