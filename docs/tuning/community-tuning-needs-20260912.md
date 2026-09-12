# 社群調校工具需求與工作流 UX 觀察

文件日期：2026-09-12
適用範圍：FH6 目前六階段入口與 Road 驗證閉環的產品 UX；FH5 資料只用於辨識可遷移的使用流程需求，不用來推導 FH6 物理係數。
研究者：Luna subagent
寫入 ownership：本文件單一 owner；本輪不修改程式、公式、翻譯或測試。

## 先給整合者的結論

就本次抽樣到的 Reddit、工具作者文件與 FH6 早期工具討論而言，部分參與者對「一次輸入、直接得到最佳設定」持保留態度；相較之下，他們較明確接受「少量必要輸入、清楚標示單位與遊戲可用步進、保留基準、以重複測試縮小下一個可試變量」的助理工作流。這不是一個可以靠更多通用係數解決的問題：抽樣中的失敗回報常涉及輸入不完整、設定值與遊戲步進不一致、路況／駕駛風格不同，或工具把未驗證推測說成最佳答案。樣本是自選社群貼文與早期工具回報，不能外推成整個 Forza 社群的比例或共識。

對現行六階段實作，最值得立即做的 UX 是把既有的資料門檻變成更具體的「下一步」提示，讓使用者少猜、少手抄，並把 `A → B` 的一個遊戲步驟與可回復性顯示在同一處。FH6 Data Out 已提供 RPM、功率、扭矩、速度、四輪溫度、四輪 slip、懸吊行程、輸入與圈次等欄位，但它是單向、僅駕駛中傳送的 UDP 資料；這足以支持測量與描述性驗證，不能單獨證明任何通用 solver 或最佳設定。

以下建議刻意不改 `tuningMath` 係數、不把 FH5 公式當成 FH6 真理，也不把 Rally／Drag／Drift 的相容性入口描述成已完成原生驗證。

## 證據分層與研究限制

- **高**：官方 FH6 Data Out 文件，證明 FH6 目前可輸出的欄位與限制；或工具作者自己的操作文件，只能證明該工具如何要求輸入／呈現流程，不能證明結果正確。
- **中**：近期 Reddit／官方社群討論中有具體操作、重複測試或多位回覆者呼應；仍是自選樣本、未控制車輛／改裝／駕駛條件的觀察。
- **低**：單一作者、單一車、單一圈速、宣傳頁或早期 WIP 回報；可作 UX 假設，不作物理結論。

FH5 與 FH6 的差異要分開看：FH5 來源能支持「使用者如何理解計算器、哪裡卡住、何種歷史／分享需求反覆出現」；不能支持 FH6 的輪胎、懸吊、胎壓或齒比數字。FH6 來源能支持 Data Out 與 telemetry-first 流程，但目前多為早期社群工具，尚無跨車、跨輸入設備的驗收證據。部分 Reddit 頁面只顯示「幾個月前」或動態相對時間，本文在表格中保留可觀察到的日期範圍，不把相對時間硬轉成精確日期。

## 來源與具體觀察

| # | 來源（觀察日期／出版日期） | 適用性與證據 | 可採用的 UX 訊號 | 不能推出的結論 |
| --- | --- | --- | --- | --- |
| 1 | [Tuning calculators and their quirks，r/ForzaOpenTunes](https://www.reddit.com/r/ForzaOpenTunes/comments/1udw4a4/tuning_calculators_and_their_quirks/)（2026-06-23，頁面回覆約 2 個月前） | FH5；中，原作者與多位回覆者描述實際使用 | 使用者想要「真實／可駕駛」而非一味競技的硬懸吊；有人認為不同計算器輸出相似或偶爾失效，最後仍需自己小幅、逐項調整。計算器應顯示起點、假設與可逆試驗，而不是 fire-and-forget。 | 回覆彼此衝突；不能證明哪套係數錯，也不能把「硬」或「understeer」變成 FH6 通用規則。 |
| 2 | [Gearing / Speed Tuning Calculator，r/ForzaHorizon](https://www.reddit.com/r/ForzaHorizon/comments/1u7m1pk/gearing_speed_tuning_calculator/)（2026-06-16，頁面回覆約 2 個月前） | FH5／Horizon 一般；中，作者公開 Google Sheet，回覆者描述使用經驗 | 齒比是高摩擦點；使用者不想猜，且用 share code 反向研究別人的設定。輸出應以功率帶、檔位、目標速度與遊戲可用值解釋，並把設定歷史保留下來。 | 一份試算表與少量留言不證明其齒比最佳；不能用來校準 FH6 powerband。 |
| 3 | [Let us modify downloaded tunings](https://www.reddit.com/r/ForzaHorizon5/comments/127tt79)（2023，頁面顯示約 3.5 年前，精確日期未呈現） | FH5；中偏低，需求貼與回覆 | 使用者希望下載後能以現有設定為起點，只改成符合自己風格的少量項目；時間不足使「從零調完」成本過高。這支持 immutable baseline、派生 candidate、差異摘要與復原。 | 這是 FH5 舊貼，不代表 FH6 的匯入／分享 API 或遊戲限制；不應直接承諾跨遊戲移植。 |
| 4 | [Easy tuning flow chart for newbies](https://www.reddit.com/r/ForzaHorizon/comments/1tw3gs5/easy_tuning_flow_chart_for_newbies/)（2026，頁面顯示約 3 個月前；精確日期未呈現） | FH5／Horizon 一般；中，流程圖與多位新手回覆 | 新手希望用簡單語言理解「車頭推頭／車尾甩」；有人直說不知道 understeer／oversteer，也有人偏好先載入別人的 tune 再判斷是否更好。應提供症狀→可檢查項目→一次小改動，而非要求先懂所有名詞。 | 這是學習與導覽需求，不是證明某個調校順序或輸入範圍；「好」也受駕駛者影響。 |
| 5 | [I built “tuners”, a free app that gives telemetry based tuning advice](https://www.reddit.com/r/ForzaHorizon6/comments/1vdt1zf/i_built_tuners_a_free_app_that_gives_telemetry/)（2026-08 左右，頁面顯示約 1 個月前） | FH6；中偏低，WIP 作者公開設計與回報 | 工具以多圈建立 confidence，試圖把失誤、rewind、分段資料分開；回覆者也指出遊戲不接受的 40.8% 這類小數建議，以及設定改動後歷史／分析狀態可能卡住。要把 confidence、資料狀態、遊戲步進與失效原因說清楚。 | 作者明確稱 WIP；confidence 不是 FH6 物理準確率，也沒有跨車驗證。小數問題是其他工具的回報，應用作輸入驗證 UX 需求而非指控本專案。 |
| 6 | [FH6 Tuning Overlay — Early Access Release](https://www.reddit.com/r/ForzaHorizon/comments/1tsyj10/fh6_tuning_overlay_early_access_release_is_here/)（頁面抓取時顯示相對日期；精確出版日不穩定） | FH6；中偏低，早期工具公告 | 另一個 FH6 工具把重點放在輪胎溫度、輸入、懸吊行程、slip、髒資料偵測、測試 session 與重複 telemetry pattern；作者明確說是 setup assistant，不宣稱完美 auto-tune。這與現行 Road「描述性比較、保留全部 run」方向一致。 | 無留言與無 controlled benchmark；不能證明任何 pattern 對應哪個旋鈕，或能跨路線泛化。 |
| 7 | [Forza Horizon 6 “Data Out” Documentation](https://support.forza.net/hc/en-us/articles/51744149102611-Forza-Horizon-6-Data-Out-Documentation)（官方 2026-05-15，2026-09-12 查閱） | FH6；高，官方一次封包規格 | 官方列出 324-byte UDP、localhost、RPM、功率 W、扭矩 N·m、速度、輪胎溫度、normalized slip、懸吊行程、輸入、圈時間與 `LapNumber`；資料僅在駕駛中發送，單向，且不含 TireWear／TrackOrdinal。UI 可優先引導能直接量到的欄位，並對缺失欄位顯示 unknown。 | 欄位存在不等於欄位足以辨識設定效果；沒有 route ID、胎耗或天氣自動辨識，仍需使用者確認與可比性條件。 |
| 8 | [FH6: The Physics of Tuning](https://forums.forza.net/t/fh6-the-physics-of-tuning/832103/12)（搜尋結果／先前快取正文顯示 2026-06-08；2026-09-12 重新開啟已導向論壇退休頁） | FH6；中偏低，歷史官方論壇貼的搜尋／快取證據，現行原文不可即時重開 | 先前可讀的回覆記錄使用 FFB wheel／simulation，並說 gamepad／assists 可能不同；同時把「先用未驗證值、再用 telemetry 檢查」說成暫時做法。Goal & Setup 應把輸入設備與 assists 當作可比性 context。 | 現行連結只顯示 Forza Forums retired notice，本文不把先前快取當作目前可驗證頁面；一輛車與一次分享不能證明通用方向或數值，也不能把作者的胎壓、ARB、阻尼升格為係數。 |
| 9 | [Engine Graphs in gearshift tuning applet](https://forums.forza.net/t/engine-graphs-power-torque-powerband-in-gearshift-tuning-applet/819060)（搜尋結果／先前快取正文顯示 2026-03-22；2026-09-12 重新開啟已導向論壇退休頁） | FH6；中，歷史官方論壇 QoL 建議的搜尋／快取證據，現行原文不可即時重開 | 先前可讀的貼文指出使用者為了調齒比必須離開自由駕駛、回升級店抄 powerband，再回來調整；這支持「測量／記錄一次，之後可重用」與在 Stage 5 顯示資料來源、RPM 覆蓋、峰值位置。 | 現行連結只顯示 Forza Forums retired notice；本文不把快取內容當作當前官方頁面或可重現引用。它仍不證明遊戲內 graph 的數學語意或最佳齒比。 |
| 10 | [Forza Horizon 5 Gear Tuning with ForzaTune Pro](https://forzatune.com/support/forza-horizon-5-gear-tuning/)（頁面無明顯出版日期，2026-09-12 查閱） | FH5；工具作者文件，高（僅限流程），結果效力低 | 文件列出先判斷是否需要 race transmission，再查看遊戲內 power／torque graph，最後把資訊輸入計算器；它把齒比流程定位成約 5 分鐘的輸入工作。可借鑑「只收集目前這一項所需欄位」與階段化提示。 | 作者文件不是獨立驗證，且內容是 FH5；不能用來確認 FH6 的齒比公式或 UI 可用範圍。 |

### 交叉讀法

1. **可重複出現的痛點**：齒比與 powerband 手抄、輸入欄位太多、遊戲步進不接受小數、下載 tune 後難以只改一項、understeer／oversteer 名詞不易理解。這些在 FH5 需求與 FH6 早期工具回報中都出現，但出現頻率只是來源樣本的訊號，不是社群統計。
2. **可遷移的是流程，不是係數**：FH5 的計算器爭議提醒要顯示假設與個人偏好；FH6 的 Data Out 與兩個 WIP 工具提醒要用重複 telemetry、髒資料排除與輸入設備 context。兩者都不足以證明 FH6 的彈簧、ARB、胎壓或齒比常數。
3. **反例很重要**：同一串 FH5 討論有人只把計算器用於 race transmission 齒比，有人完全不信計算器，有人認為 stock 值已經更好；FH6 工具又出現不可調整的小數建議與歷史狀態卡住。故 UI 應允許「保留 A／不採用建議／重新測試」，並把結果寫成描述性 evidence level，而不是勝負分數。

## 現行版本可落地的 4 個小 UX 調整

以下調整只使用現有六階段、measured engine archive、Road baseline／run／A-B 與 unit preference；不新增物理公式，不要求先收集大量手動數值。

### 1. 六階段導航顯示「下一個必要動作」

現行 Stage 1–6 按 readiness 禁用入口，也有一行狀態提示；可把它改成每次只列一個可操作的缺口，例如「需要：完成 6 秒 WOT capture（目前 4/8 RPM bins）」「需要：在遊戲確認 baseline A 的胎壓單位」「需要：選擇相同 Road event」。每個缺口顯示 `source = telemetry / game-confirmed / user-note` 與目前單位。這能把「為什麼被鎖住」變成「下一步做什麼」，符合新手流程圖與少猜測需求。

### 2. Stage 5 做「只填缺少的資料」與遊戲步進預覽

在 Engine Data & Gearing 頂端顯示已重用 observation 的車輛／改裝 dependency、capture span、RPM 覆蓋與 peak source；已測量欄位不再要求手動重打，只列真正缺少的遊戲欄位。輸出每個 candidate 時同時顯示 `A: current game value → B: one game step`、最小／最大、unit，並在送出前檢查 step 對齊。這是對 powerband 手抄痛點與「40.8% 不存在」反例的低風險回應；任何無法由 telemetry 識別的內容仍保留 `unknown`。

### 3. Road A/B 卡片加入「症狀／操作／預期觀察」短句

在 `Try one reversible change` 的參數選擇旁，用一般語言補一行「你要驗證什麼」：例如「出彎加油時車頭推向外（understeer／推頭）→ 只改一個遊戲 step → 比較同一路段的 normalized slip 與完整事件時間」。同時保留現行的 optional hypothesis 欄位，不替使用者決定方向。這直接回應不知道 understeer／oversteer 的新手，且不把症狀文字轉成固定係數。

### 4. Verification 結果先顯示可比性，再顯示 A/B 差異

在 Road report 摘要上方固定顯示 route、lap completeness、起始胎溫、driver assists、輸入設備（若已記錄）與 `unknown` 項目；若條件不足，第一個 CTA 應是「補哪一項」而非「套用 B」。報告仍可顯示時間差、slip 與所有 run，但把「insufficient-data／tradeoff／descriptive」放在差異數字前。FH6 Data Out 無法自動知道天氣、輪胎、assists、TrackOrdinal，因此這是資料誠實性的 UI，不是新增推算。

## 之後迭代的 meta／調校偏好（與係數分離）

這些是長期產品契約，暫不等同於本輪程式變更：

- **輸入優先級**：`measured telemetry > game-confirmed setting > user estimate > unknown`。估計值可以作起點，但要在推薦卡上明示來源、時間與依賴車輛／改裝；不能用預設數字把 unknown 填成確定值。
- **推薦物件要可追溯、可撤回**：每次建議保存 input snapshot、formula／method version、unit、game range／step、evidence level、適用賽事與父層 setup；A、B、retest 均為 immutable history，不覆寫原始 run。
- **先證據再抽象化**：Road 的原生驗證與 Rally／Drag／Drift compatibility 要分開標示；單車或單一路線的趨勢最多是「本次可觀察」，不直接成為跨車係數或最佳化結論。
- **以最少必要輸入換取可行下一步**：優先從 FH6 Data Out、capture archive 與遊戲畫面讀取能驗證的資料；只有真正無法讀取的欄位才要求手動輸入，並說明它為何必要、要填什麼單位。
- **語言以行為為中心**：顯示「入彎轉向不足／出彎後輪滑動／煞車時車尾不穩」等症狀，再連到可檢查參數與單一變量試驗；保留 understeer／oversteer 原文與簡短定義，避免把玩家的主觀感受冒充數學真值。
- **個人偏好與測試條件是 context**：Road／Rally／Drag／Drift、路線、胎溫、天氣、assist、keyboard／controller／wheel、simulation／assist mode 都應可進入比較與歷史；它們目前是分組與可比性條件，不是未驗證的 solver 係數。
- **分享與學習要分享差異而不是只分享結果**：未來若加入 setup export／share code，應帶上車輛、改裝、遊戲版本、路線、A→B 單一變量、units 與 evidence level；下載者可以先複製 baseline，再選擇只套用某項變更，並保留 revert。
- **品質指標要避免「最快圈」單一化**：保留未改善、反向、tradeoff、髒資料與不完整圈；以重複 run 的一致性、可比性、完整性與使用者是否能重現下一步衡量流程品質，不把一圈較快變成因果證明。

### 從來源直接觀察的偏好分支

這些是來源中的實際偏好表述，作為 UI 的 context 分類；它們不是調校係數，也不代表每位玩家都採用同一偏好：

- **可駕駛／符合車格 vs. 純競技速度**：`r/ForzaOpenTunes` 原作者描述自己想要較真實、保留車輛性格且不過度僵硬的設定，同一討論也有人認為個人偏好與追求最快圈會導向不同選擇。[原文](https://www.reddit.com/r/ForzaOpenTunes/comments/1udw4a4/tuning_calculators_and_their_quirks/)
- **輪上輸入與輔助設定會改變感受**：FH6 調校討論的先前搜尋／快取正文標記 FFB wheel、simulation 與 gamepad／assists 可能產生不同效果；由於目前論壇原文已退休，這只能作為歷史觀察，不是現行頁面證據。[原文連結（目前導向退休頁）](https://forums.forza.net/t/fh6-the-physics-of-tuning/832103/12)
- **時間有限 vs. 願意長時間學習**：近期 FH5 討論同時出現「沒有時間逐項調整」與「願意花數小時把單車調好」兩種使用者；流程應提供快速 baseline，也保留可展開的理由、差異與重複測試入口。[時間成本與細調回覆](https://www.reddit.com/r/ForzaHorizon/comments/1tw3gs5/easy-tuning-flow-chart-for-newbies/)
- **分享 tune 是學習入口，不只是下載成品**：齒比試算表回覆者提到以 share code 載入設定並反向研究，FH5 舊需求貼則希望下載後可只修改符合自己風格的部分；因此分享／歷史應把來源與 A→B 差異一起保存。[齒比分享回覆](https://www.reddit.com/r/ForzaHorizon/comments/1u7m1pk/gearing_speed_tuning_calculator/)、[下載後修改需求](https://www.reddit.com/r/ForzaHorizon5/comments/127tt79)

## 不應在本輪採用的推論

- 不因 Reddit 回覆中的胎壓、ARB、彈簧、阻尼、ride height 或齒比數字而改 `tuningMath`。
- 不把 FH5 的計算器、舊官方論壇指南或單一 FH6 tune 轉成 FH6 通用 preset。
- 不把 community 的「meta」或某工具的 confidence 直接顯示成「最佳」「保證更快」。
- 不把 FH6 Data Out 的 slip、溫度或懸吊行程單欄位當成輪胎抓地、因果效果或跨車最佳值；仍需 Road 的 matched route、重複 run、套用確認與描述性報告。

## 審閱與後續更新規則

本文件是 2026-09-12 的 web snapshot。Reddit／論壇貼文的投票、回覆與工具狀態會變動；若之後要把某項社群訊號升格為產品規則，應重新查閱原文，補記新的觀察日期、FH6／FH5 applicability、證據等級與反例。只要沒有實機 FH6、跨車與跨輸入設備的人工審核資料，保持 `unverified`／`in-calibration` 比更新係數更合適。
