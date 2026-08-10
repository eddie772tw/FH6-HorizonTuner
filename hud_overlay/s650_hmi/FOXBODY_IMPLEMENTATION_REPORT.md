# S650 Fox Body '87–'93 儀表：實作報告

## 目的與範圍

本次將 S650 HMI 的最後一個待開發主題加入為獨立的 `foxbody` 模式，目標是重現 1987–1993 Fox Body 的雙圓類比錶語言，同時維持 S650 數位中央信息與統一的 overlay shell。此模式不會改動既有 Normal 或 Heritage '67 renderer。

實作重點鎖定兩個主環表：左側轉速錶、右側速度錶、原車風格的 55 mph 提示刻度，以及由 telemetry 驅動的轉速預警／紅線區。功率／增壓外環、中央資訊頁與排檔列則重用既有 S650 共用模組。

## 研究依據

Ford 的車主手冊確認，駕駛可從 My Mustang > Cluster Theme 選取儀表主題，亦可設定為依駕駛模式自動配對。[Ford 2024 Mustang Owner's Manual](https://www.fordservicecontent.com/Ford_Content/vdirsnet/OwnerManual/Home/Content?ProcUid=G2314409&Uid=G2314394&buildtype=web&countryCode=USA&div=f&languageCode=en&userMarket=USA&vFilteringEnabled=False&variantid=9122)

公開實車資料顯示，Fox Body 模式致敬 1987–1993 年的雙環儀表，並保留中央現代行車資訊；55 mph 的特別刻度是對歷史聯邦限速時代的復刻。[The Drive overview](https://www.thedrive.com/news/2024-ford-mustang-digital-gauges-can-mimic-80s-fox-body-cluster) [Fox Body cluster coverage](https://www.foxnews.com/auto/sly-fox-2024-ford-mustang-throwback)

## 已實作內容

| 項目 | 實作 |
| --- | --- |
| 主題合約 | 新增 `foxbody` 至前端 selector、後端 validation、HUD host 與 Canvas contract；舊 `s650_foxbody` 設定會遷移至統一的 `s650_hmi` + `foxbody`。 |
| 左主環：轉速 | 0 起點、每 1,000 rpm 大刻度與 5 等分小刻度；以 telemetry 的 redline 動態配置預警與紅線區。 |
| 右主環：速度 | 英制 0–160 mph／公制 0–240 km/h；英制模式保留 55 mph 提示刻度。 |
| 形狀語言 | 黑色平面錶底、無鍍鉻高光 bezel、直立窄字、方端刻度、淡色指針與低調中心軸，刻意與 Heritage '67 的金屬錶圈區隔。 |
| 快取更新 | S650 子模組 query version 已更新，避免開發版 WebView 重用舊 renderer。 |

## 驗證項目

- Vitest 覆蓋主題 union、selector、legacy migration、palette 與雙環 layout pipeline。
- Layout pipeline 測試確認 Fox Body 的中心資訊、固定狀態、排檔列、側邊環與兩個主環維持既有繪製順序。
- 後端 overlay API 測試已補上 `s650_foxbody` 的遷移情境。

## 後續微調建議

以實機或 16:9 overlay 截圖比對時，優先微調 `s650_tokens.js` 中的 Fox Body 字級、標籤半徑與刻度亮度；這些都是隔離 token，不會影響其他 S650 主題。若要追求更高保真度，下一個小項目可加入右錶中心的限速牌／巡航狀態與外側水溫／燃油小環。
