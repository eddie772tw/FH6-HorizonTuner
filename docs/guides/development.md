# 開發啟動與打包

安裝 Node.js／pnpm、Rust stable 與 Tauri 的 Windows 開發工具（MSVC Build Tools、Windows SDK、WebView2）。產品後端位於 `backend-rust/`，與 Tauri host 各自編譯，透過 HTTP／WebSocket 通訊。

## 日常開發

```powershell
.\setup_dev.bat
.\dev_full.bat
# 或 .\dev_lite.bat
```

setup 下載 Cargo.lock 與 pnpm-lock.yaml 所列依賴。開發入口先執行 `pnpm run build:backend` 增量編譯後端，再啟動 Vite 與 Tauri。Tauri 直接執行 `backend-rust/target/debug/server-sidecar.exe --dev --data-dir backend`，不需要 Python／uv。React 使用 Vite HMR；修改 Rust 後重啟入口。

Full／Lite 共用 HTTP 8001、UDP 8000 與 Vite 1420，一次執行一個。Dev HTTP 8001 被占用時直接失敗。Tauri 關閉 stdin 時，所擁有的後端會保存紀錄並退出。

## 獨立後端與外接前端

```powershell
cargo run --locked --manifest-path backend-rust/Cargo.toml -- --dev
```

獨立模式預設使用 `backend/` 資料目錄，Ctrl+C 關閉。要指定目錄可加 `--data-dir <path>`；此參數也啟用 stdin EOF 關閉合約，呼叫端須保留 stdin 管道。

另一個終端啟動外接 host：

```powershell
$env:FH6_NO_SIDECAR = '1'
$env:BACKEND_PORT = '8001'
.\dev_full.bat
Remove-Item Env:FH6_NO_SIDECAR, Env:BACKEND_PORT
```

外接模式不擁有或關閉外部後端。純瀏覽器前端使用 `pnpm -C frontend run dev`。HTTP 與 UDP 分別配置；`TELEMETRY_PORT` 僅覆寫 UDP。正式模式優先使用 HTTP 8001，占用時 fallback；實際埠以 stdout `FH6_BACKEND_READY` 與 `logs/web_port.txt` 為準。

## 測試與打包

```powershell
cargo test --locked --manifest-path backend-rust/Cargo.toml
cargo fmt --manifest-path backend-rust/Cargo.toml -- --check
.\setup_build.bat
.\build_all.bat
```

後端測試以接受的輸入及前端可觀察輸出為基準；詳見 [Rust 後端測試分層](../backend-rust/README.md)。build 先建置共用前端，再執行 `scripts/build_backend.ps1` 建置並放置 sidecar，最後打包 Full／Lite。兩種 host 都嵌入相同 sidecar；使用者資料保持在既有位置。

`backend-rust/build.rs` 直接嵌入 HUD、翻譯與車輛資源，並檢查版本與 Tauri manifest 一致。Discord application ID 可由建置環境的 `DISCORD_APPLICATION_ID` 或忽略追蹤的 `config/discord.local.json` 提供。沒有設定時，其餘功能仍正常運作。Cargo／pnpm 初次建置可能下載鎖定依賴，build 不安裝 Python、修改虛擬環境或執行 PyInstaller。

## Rust Agent CLI 與選用的 Python 維護工具

`fh6-agent.bat` 由 Cargo 執行 Rust CLI，不需 Python。`backend/` 只保留車庫資源及既有開發資料路徑。Python 僅用於發行、診斷與車庫維護；舊後端參考可由 Git `ec7d769` 取得，固定輸出仍由 Rust tests 驗證。

```powershell
.\setup_venv.bat
.\fh6-agent.bat status --json
uv run --no-project --python .venv\Scripts\python.exe python -m pytest tests/ scripts/tests/
```

## 排查

缺少 cargo／MSVC 時先修復 Rust 工具鏈；缺少前端依賴執行 setup。HTTP／UDP／Vite 被占用時關閉原有執行個體，腳本不會按程序名稱強制終止其他工作。後端啟動錯誤看終端與資料目錄的 `logs/backend.log`；關閉逾時由 Tauri 只清理自己建立的程序樹。

Windows 原生裝置與真實遊戲驗收仍須在對應環境執行。迴路測試只證明程序、資料與傳輸契約。
