# HUD 設定頁：跨設計系統視覺審查

PR #615 的實際頁面截圖，取代先前只呈現獨立 HUD 面板的四張圖片。此版沿用 Tune 的面板與內縮標頭、移除重複工作區留白，由主題 tokens 負責各系統外觀。

## 來源與範圍 / Provenance

- 日期：2026-11-04；Windows、sandboxed Edge、繁體中文。
- 正式 AppShell、AppHeader、Live／Tune／HUD 元件與 theme/runtime providers；透過實際導覽列進入 HUD。HTTP 回應及無遊戲封包的 WebSocket 為隔離測試資料，未連接使用者後端。Sessions／Companion 未納入 fixture。
- 使用 frontend/src/features/overlay_control/tests/browser/verify.cjs，設定 PLAYWRIGHT_MODULE_PATH、PLAYWRIGHT_CHANNEL=msedge、OUTPUT_DIR=scratch/hud-settings-theme-review。命令見[擴充指南](../hud-settings-workspace.md#驗證入口)。
- 252 組版面涵蓋全部七核心、日夜、三語、1280／320px 的三分頁；另有 1920px、reduced motion、六種儀表表單及互動檢查。報告記錄 35 次保存、零 page errors、零未預期 API，共輸出 45 張圖；此目錄選用其中 24 張。
- 桌面 1280×720；窄幅 320×720。圖片直接複製，未合成、裁切或修圖；拍攝時停用 CSS 動畫以避免擷取到過渡幀。
- 遙測頁刻意展開詳細設定，示範同時展開多張卡片；進頁預設收合。捲動區下方內容不會全部出現在一張視窗截圖。
- 原生 HUD 啟閉與螢幕選擇在瀏覽器中不可用。Tune 參考使用未選擇車輛的空白資料，只比較既有面板樣式，不是調校計算驗收。
- 這批畫面不是原生 HUD、遊戲或 Narrator／NVDA 驗收；先前原生 smoke 的獨立紀錄見[驗證紀錄](../hud-settings-workspace.md#2026-11-04-驗證紀錄)。

These are unedited browser captures of the production application shell and real HUD forms, with isolated HTTP responses and idle WebSockets. They show three design systems; the automated layout matrix covers all seven cores. Native-only controls remain unavailable. Tune references use an empty vehicle selection for visual comparison, not calculation acceptance. No game or screen-reader acceptance is implied.

## Halfmoon Default

| 分頁 / Tab | 日間 / Light | 夜間 / Dark |
| --- | --- | --- |
| 主儀表 / Main gauge | ![Halfmoon Default 主儀表 / Main gauge light](default-light-1280-gauge.png) | ![Halfmoon Default 主儀表 / Main gauge dark](default-dark-1280-gauge.png) |
| 遙測卡片 / Telemetry cards | ![Halfmoon Default 遙測卡片 / Telemetry cards light](default-light-1280-telemetry.png) | ![Halfmoon Default 遙測卡片 / Telemetry cards dark](default-dark-1280-telemetry.png) |
| 一般 / General | ![Halfmoon Default 一般 / General light](default-light-1280-general.png) | ![Halfmoon Default 一般 / General dark](default-dark-1280-general.png) |

<details>
<summary>Halfmoon Default：既有 Tune 面板參考 / Existing Tune reference</summary>

![Halfmoon Default Tune light](default-light-1280-reference-tune.png)

</details>

## Swiss Technical

| 分頁 / Tab | 日間 / Light | 夜間 / Dark |
| --- | --- | --- |
| 主儀表 / Main gauge | ![Swiss Technical 主儀表 / Main gauge light](swiss-light-1280-gauge.png) | ![Swiss Technical 主儀表 / Main gauge dark](swiss-dark-1280-gauge.png) |
| 遙測卡片 / Telemetry cards | ![Swiss Technical 遙測卡片 / Telemetry cards light](swiss-light-1280-telemetry.png) | ![Swiss Technical 遙測卡片 / Telemetry cards dark](swiss-dark-1280-telemetry.png) |
| 一般 / General | ![Swiss Technical 一般 / General light](swiss-light-1280-general.png) | ![Swiss Technical 一般 / General dark](swiss-dark-1280-general.png) |

<details>
<summary>Swiss Technical：既有 Tune 面板參考 / Existing Tune reference</summary>

![Swiss Technical Tune light](swiss-light-1280-reference-tune.png)

</details>

## Rhine Lab

| 分頁 / Tab | 日間 / Light | 夜間 / Dark |
| --- | --- | --- |
| 主儀表 / Main gauge | ![Rhine Lab 主儀表 / Main gauge light](rhine-lab-light-1280-gauge.png) | ![Rhine Lab 主儀表 / Main gauge dark](rhine-lab-dark-1280-gauge.png) |
| 遙測卡片 / Telemetry cards | ![Rhine Lab 遙測卡片 / Telemetry cards light](rhine-lab-light-1280-telemetry.png) | ![Rhine Lab 遙測卡片 / Telemetry cards dark](rhine-lab-dark-1280-telemetry.png) |
| 一般 / General | ![Rhine Lab 一般 / General light](rhine-lab-light-1280-general.png) | ![Rhine Lab 一般 / General dark](rhine-lab-dark-1280-general.png) |

<details>
<summary>Rhine Lab：既有 Tune 面板參考 / Existing Tune reference</summary>

![Rhine Lab Tune light](rhine-lab-light-1280-reference-tune.png)

</details>

## 320px：完整外框與單欄表單 / Full shell and single-column forms

<img src="default-dark-320-gauge.png" alt="Halfmoon Default 320px dark main gauge" width="320">

<img src="swiss-dark-320-gauge.png" alt="Swiss Technical 320px dark main gauge" width="320">

<img src="rhine-lab-dark-320-gauge.png" alt="Rhine Lab 320px dark main gauge" width="320">
