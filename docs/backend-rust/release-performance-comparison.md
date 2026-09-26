# Python v1.6 與 Rust 後端性能對照

測量日期：2026-09-26。Windows 11 build 26200、AMD Ryzen 7 5800XT、Rust 1.96.0；沒有啟動應用程式前端。這是同一台開發機的受控測量，不是遊戲、完整 HUD、多人併發或跨平台驗收。

## 比較對象與來源

- 最後一個引入 Rust 前的公開 Release 為 [v1.6](https://github.com/eddie772tw/FH6-HorizonTuner/releases/tag/v1.6)，tag commit `cd96d86f017fa43f4f3d429155a08aa77dc74bac`（2026-09-16 發布）。該版本的 `server-sidecar.spec` 打包 `backend/main.py`，沒有 `backend-rust`；v1.6.1 才引入 Rust Beta。不能用內嵌 OTA runtime version 代替 Release tag。
- API／程序基準使用實際 v1.6 `FH6-HorizonTuner-Portable-Bundle.zip` 裡 Full portable 的原始 PyInstaller sidecar。驗證 GitHub asset SHA-256，再解析 PE 與 PyInstaller archive 邊界抽出 `include_bytes!` payload，**沒有執行 Tauri portable**。
- bundle SHA-256：`d2bd59f59be411499db86fc0857dd5ae9c970773ba66c1259ce7f97bf4eb69aa`；portable SHA-256：`e40e254629a1ce56188e718eb12204f6cc16d62a271510767698b1ab276d28ae`。sidecar 位於 offset `9451518`，長 `39974624` bytes，SHA-256 `f15e7c9704d95f846ced8e854608484e34458f58628e3e3f9531d45d240324da`，內嵌 Python 3.13。
- 第一輪 Rust 使用 `caf518a5654a6e4088ccca0ba24caa484a7f26a0` 的 Windows default-feature release sidecar；完整 binary hash 保存在原始資料。下方七輪比較保留這個基準。依 UDP 延遲結果進一步調查後，本次另移除每幀 Drag car database 深複製；修正前後的固定 60 Hz 比較另列，不混入原始七輪數據。
- 工具記錄的是測試時 checkout HEAD 與輸入 binary hash，不能自動認證 binary 由該 HEAD 建置；重跑時必須先依下方命令建置。記憶體工具計入主程序及直接子程序，本輪 Python 每次正好為 bootloader＋worker 兩個程序；不宣稱適用任意多層程序樹。
- Road 函式測量另外從相同 v1.6 commit 抽出原始 Python 模組，以 Python 3.13.12 執行；這部分是 **release-tag source 對 Rust release library**，不宣稱在封裝後 Python interpreter 中執行。v1.6 之後合併的 Python perf PR 不在這個 Release 基準內，因此差異不能全歸因於 `caf518a` 單一 commit。

## 第一輪 sidecar：啟動、記憶體與 API（caf518a）

七輪交錯執行 Python→Rust、Rust→Python，每次全新 data directory、隔離 UDP port，測試程序以 stdin EOF 結束。兩邊皆啟用 Full backend，但沒有 overlay 訂閱者、遊戲或 recorder session。測量期間不執行 Cargo／前端測試。

啟動時間含 `Popen`、PyInstaller 解包／runtime 初始化、readiness file，直到第一個 `/api/settings` 回覆 HTTP 200；每次新資料目錄，但**沒有清除 OS 檔案快取**，不是嚴格冷機啟動。記憶體在 ready 後 1 秒觀測，Python 加總 bootloader 與 worker；Working Set 是當下駐留記憶體，Private Bytes 是私人 committed bytes，不能混稱為實體 RAM。

每個 HTTP 測項先暖機 10 次，再以 HTTP/1.1 keep-alive、單一 in-flight request 測 100 次。語言覆寫使用完全相同的 v1.6 `zh-tw.json`，兩端回應逐次解析並斷言內容相等（各 105,905 bytes）；settings 各 718 bytes，MCP initialize 為 951／943 bytes（版本／服務描述不同）。request 計時包含傳輸與完整 body 接收，不含 client JSON 解析。表中為七個「每輪中位數」的中位數；p95 同樣先每輪計算再取中位數，並非全體樣本混合後的 p95。

| 測項 | Python v1.6 | Rust | 觀測差異 |
| --- | ---: | ---: | ---: |
| 啟動至第一個 HTTP 200 | 1,757.33 ms | 89.25 ms | 耗時減少 94.9% |
| 閒置 Working Set | 83.33 MiB | 29.49 MiB | 減少 64.6% |
| 閒置 Private Bytes | 537.41 MiB | 9.52 MiB | 減少 98.2% |
| `GET /api/settings` 中位數／p95 | 0.524／0.661 ms | 0.147／0.192 ms | 中位數減少 71.9% |
| `GET /api/languages/zh-tw` 中位數／p95 | 4.486／5.041 ms | 0.565／0.638 ms | 中位數減少 87.4% |
| `POST /mcp` initialize 中位數／p95 | 0.690／0.890 ms | 0.170／0.216 ms | 中位數減少 75.4% |

原始逐次樣本、PID／記憶體、port、pipeline 診斷、artifact hash 在 [release-comparison-sidecars.json](release-comparison-sidecars.json)。MCP 僅量 initialize，不能延伸成所有 26 tools 的效能結論；SQLite 持久化與高併發 API 尚未做跨 Release 性能對照。

## 第一輪遙測路徑：觀測到退步

每輪使用 324-byte 合成封包，目標 60 Hz，10 個暖機後收集 120 個 UDP send→`/ws/telemetry` JSON receive 的時間。每次必須收到相同 `TimestampMS`，核對 car／speed；client 依序 send／receive 再等下一周期，這是低負載延遲測量，**不是飽和吞吐或固定時鐘的 open-loop 丟包壓測**。

| 測項 | Python v1.6 | Rust | 觀測差異 |
| --- | ---: | ---: | ---: |
| UDP→JSON WS 中位數 | 0.398 ms | 1.268 ms | Rust 增加 0.870 ms（218.6%） |
| UDP→JSON WS p95 | 0.483 ms | 1.897 ms | Rust 增加 1.414 ms |
| 每輪 processed／dropped | 130／0 | 130／0 | 七輪皆相同 |

此初始 Rust 版本在這個路徑未優於 Python。後續調查發現 `App::process` 在持有 engine mutex 時，每幀呼叫 `DragRecorder::set_context`，深複製不變的整份 car database（651 輛車、382,115 bytes 的來源 JSON），即使 Drag idle 亦如此。修正為 `App::new` 初始化一次；資料庫只在 Drag 開始錄製時查車名，公開 setter 保留，未改產品時效或節流條件。新增 App 整合測試驗證 clear／prepare 後切換兩輛車仍有正確的非 fallback 車名。

## 固定 60 Hz 調查與修正驗證

針對使用者提出的「是否會塞車」，改用獨立 sender thread 依固定 deadline 發送，完全不等待 WebSocket 回覆。每個 case 為 30 秒／1,800 個封包，前置 20 個暖機封包建立車輛 context；一個 JSON WS consumer，另每 200 ms 讀取 pipeline 診斷。分別測 recorder 關閉與開啟，Python 控制組在修正前後各重跑一次。sender 實際發送跨度約 29.983 秒；原始資料保留每次 scheduler lateness，沒有把發送不足 60 Hz 的慢 loop 誤當成無丟包。

| 30 秒 case | Python v1.6 中位數／p95 | Rust 修正前中位數／p95 | Rust 修正後中位數／p95 |
| --- | ---: | ---: | ---: |
| Recorder 關閉 | 0.447／0.534 ms | 1.309／2.031 ms | 0.231／0.276 ms |
| Recorder 開啟 | 0.452／0.573 ms | 1.294／2.007 ms | 0.230／0.271 ms |

表中 Python 列使用修正後同輪控制組；修正前控制組中位數為 0.452／0.453 ms，方向一致。每種負載各一次 30 秒 stream，表中 p95 是該 stream 的 1,800 個延遲樣本分位數，與前節七輪 p95 聚合方法不同。

- 所有八個 streams 都是 **1,800 sent／1,800 received**，沒有缺失 TimestampMS；包含暖機後 pipeline 是 **1,820 processed／0 dropped**。Rust telemetry queue 峰值均為 **1**，結束時為 **0**。
- 修正前兩個 Rust case 的前／後 10 秒延遲中位數分別為 1.334→1.343、1.244→1.319 ms，沒有逐步累積至多幀的現象；修正後為 0.230→0.230、0.230→0.231 ms。
- Recorder 開啟時，兩端修正前後均完成 **6 個持久化 batches**，writer queue 峰值 **1**，停止後 pendingWork **0**；droppedSamples／droppedBatches／failedWrites 均 **0**。這是實際 SQLite 錄製負載，不只是未啟動 recorder 的 API 空轉。
- Rust `App::process` total 的最後 240 幀平均值，在 recording case 從 **1.174 ms 降至 0.035 ms**，與移除整庫深複製的程式變更一致。此 stage 不包含 UDP 接收排隊及 WS 傳輸，不能把它與端到端延遲當成同一數字。

因此，**修正前在此 60 Hz 負載下已未觀察到塞車；修正後延遲與處理成本進一步下降**。這不保證遊戲佔滿 CPU、多個慢 consumer 或更高頻率的行為，也沒有把 localhost 單 consumer 結果當成網路吞吐上限。

每幀 latency／sender lateness、5 Hz queue／processing／writer 觀察、最終完整 pipeline 與前後 executable hash 在 [release-comparison-udp60.json](release-comparison-udp60.json)。測試工具在長 stream 後重建 HTTP 連線，避免把 Python Uvicorn 的 keep-alive idle timeout 誤當成後端故障；stdin EOF 結束須 exit 0。

## Road 函式：相同輸入及語義檢查

同一份 JSON fixture 產生 10,000 點 deterministic telemetry；matching 取前 4,000 點作兩側輸入。fixture SHA-256 為 `1c38ba01ea36a8e54cc9fa45aaa6b90ed4e2ea06226b4c30c1cb3fa785e1cb54`。Python 直接匯入 v1.6 tag 的原始模組；Rust 呼叫目前 library，沒有重新實作兩邊演算法來測量。

七輪交錯執行，每輪每個函式先暖機一次，再測三次，共 21 樣本；排除 process 啟動、fixture 生成／讀取及結果寫檔。比較完整 summary／matching 結構、陣列與離散值，JSON int／float 同視數字，絕對及相對容差皆 `1e-6`。除跨語言比較之外，所有回合的輸出也必須一致。

| 工作量 | Python v1.6 source 中位數 | Rust release 中位數 | 觀測耗時減少 |
| --- | ---: | ---: | ---: |
| Road summary，10,000 points | 252.750 ms | 30.769 ms | 87.8% |
| Road matching，4,000 points／側 | 228.158 ms | 13.579 ms | 94.0% |

本次 **semantic differences = 0**。原始 21 個時間樣本、每輪完整輸出、interpreter／binary hash 在 [release-comparison-algorithms.json](release-comparison-algorithms.json)。輸入為乾淨合成資料；這個一致性檢查補充既有短陣列、缺值及 frozen fixtures 契約，不能取代所有真實路線或資料異常案例。

## 重現方式

依 repository 的 uv 3.13 維護環境安裝既有 requirements；不需要把 Python runtime 加回產品。

```powershell
gh release download v1.6 --pattern FH6-HorizonTuner-Portable-Bundle.zip --dir scratch/python-release-benchmark
cargo build --locked -j 2 --release --manifest-path backend-rust/Cargo.toml --bins
uv run --no-project --python .venv/Scripts/python.exe python scripts/benchmark_release_sidecars.py --bundle scratch/python-release-benchmark/FH6-HorizonTuner-Portable-Bundle.zip --rust backend-rust/target/release/server-sidecar.exe --output scratch/python-release-benchmark/repeat.json
cargo test --locked -j 2 --release --manifest-path backend-rust/Cargo.toml --test release_comparison_probe --no-run
```

最後一個 Cargo 命令會列出 probe executable 的實際 hash 路徑，傳給：

```powershell
uv run --no-project --python .venv/Scripts/python.exe python scripts/benchmark_release_algorithms.py --python .venv/Scripts/python.exe --rust-test-exe backend-rust/target/release/deps/release_comparison_probe-<hash>.exe --output scratch/python-release-benchmark/algorithms.json
```

sidecar 工具拒絕覆寫既有 run 目錄，重跑請用新的 output 名稱。benchmark 沒有 CI timing 門檻；Rust probe 明確 ignored，只在 release profile 手動執行。上述百分比是本機觀測，不是所有電腦、播放器、儲存裝置或 Release 的保證。

固定 60 Hz 測試沿用同一 sidecar 命令，加上 `--rounds 1 --requests 5 --stream-seconds 30`；開啟 recorder 的 case 再加 `--record`，兩次使用不同 output 路徑。sender 的固定時鐘、WebSocket 接收與 5 Hz 診斷各自執行。

最終程式驗證：default Cargo **81 passed／3 ignored**；no-default-features **73 passed／2 ignored**；release bins build、兩個新工具 Ruff、Cargo fmt、維護工具 **53 passed**。前端沒有啟動。
