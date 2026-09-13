# G2 原生驗收產物與視窗操作狀態

日期：2026-09-14。Owner：IA Coordinator as Codex。狀態：產物已建置，C5 只有 Full 啟動的局部證據，H5 尚未執行；G2 保持 partial。

## 來源與產物

程式候選 `2cb2983c763cce4ca86e2d4c79b0d7bfba3295fe`，位於 `D:/FH6-frontend-ia-20260913/shell-race-fix`。該提交將先前已驗證的 Context blob `4b53495569904fb95a19d6195037834f3f8f14ca` 正式交付至 PR #345；前端程式未再修改。產物留在忽略目錄，不提交二進位檔、不發布 release、不修改版本號。

本次 Tauri 使用既有 05:05 的 Full/Lite frontend distribution，其 source 是 parent `5416530` 加上述 Context blob，和 `2cb2983` 的產品程式相同。Vite 於提交前產生的 build-info 因此顯示 `post-5416530`；此字樣不是新版 Git HEAD，不能只用畫面文字推斷 candidate。以下內容指紋、來源 blob 與 build 命令共同固定本次驗收產物；未聲稱已產生帶新 commit 標籤的正式發行版。

| 產物（相對 shell-race-fix） | Bytes | SHA-256 | FileVersion / ProductVersion |
| --- | --- | --- | --- |
| `dist/FH6-HorizonTuner.exe` | 54262784 | `bee8723205528026f2e9516c17c6f616156d2c9b4978abf9c8e6de7c0e341219` | 11.45.17 / 11.45.17 |
| `dist/FH6-HorizonTuner_lite.exe` | 54262784 | `d30a18c0a36ff87c53a2086cc4635f84e7d16b87b3cd46210ab773150cad1892` | 11.45.17 / 11.45.17 |
| `frontend/src-tauri/bin/server-sidecar-x86_64-pc-windows-msvc.exe` | 39939952 | `e391329af08feb19631b6e6dbfdd58bf231d339250b509f8976df3ffea297533` | 11.45.17.0 / 11.45.17.0 |

測試副本各自位於 `dist/g2-full/FH6-HorizonTuner.exe` 與 `dist/g2-lite/FH6-HorizonTuner_lite.exe`。Full 只在自己的資料目錄寫設定，合成測試 UDP 指定 8124、forwarding/dyno/race recording 為 false。Lite 尚未啟動，其資料目錄須在操作前獨立準備。原 `shell` 的 c5 工作樹保留，不 pull 或替換。

## 本地建置與檢查

以下命令使用既有依賴與指定 interpreter，沒有安裝或更動共用環境：

```powershell
uv run --offline --no-project --python D:/FH6-HorizonTuner/.venv/Scripts/python.exe python scripts/validate_version_consistency.py
uv run --offline --no-project --python D:/FH6-HorizonTuner/.venv/Scripts/python.exe python -m pytest tests/
uv run --offline --no-project --python D:/FH6-HorizonTuner/.venv/Scripts/python.exe ruff check .
uv run --offline --no-project --python D:/FH6-HorizonTuner/.venv/Scripts/python.exe ruff format --check .
uv run --offline --no-project --python D:/FH6-HorizonTuner/.venv/Scripts/python.exe python scripts/build_sidecar.py server-sidecar.spec --noconfirm --distpath scratch/g2-native-build/sidecar --workpath scratch/g2-native-build/pyinstaller
# 將新 sidecar 複製到 src-tauri/bin，再從 frontend 依序執行；兩版之間保存 Full 產物。
cmd /c "pnpm exec tauri build --no-bundle --ci --config src-tauri/tauri.full.conf.json -- --locked"
cmd /c "pnpm exec tauri build --no-bundle --ci --config src-tauri/tauri.lite.conf.json -- --locked"
# 回到工作樹根目錄；dist 中 Full/Lite 均存在後：
uv run --offline --no-project --python D:/FH6-HorizonTuner/.venv/Scripts/python.exe python -m pytest tests/test_executable_bundle.py -m executable_bundle -q
```

結果：版本 11.45.17 合約 PASS；backend **334 passed／8 deselected**；Ruff check PASS、format check 214 files PASS；sidecar 52.45 秒、Full release 2 分 05 秒、Lite release 42.96 秒完成；metadata **2 passed、0 skipped**。Tauri CLI 只改 Cargo.toml 換行，確認 Git blob 與 HEAD 同為 `b73793333f1d19f52561ee4abeee4e25003d1943` 後正規化回 CRLF，產品工作樹 clean。沒有執行 host diagnostics 或以單元測試冒稱原生視窗成功。

## Windows 工具的新核對與實際操作

先前只確認 `cua_repl` 不提供 native app。這次重新按 Computer Use skill 探索工具，找到 `mcp__node_repl__js`，成功載入 `@oai/sky`，`list_windows()` 正常回傳。原生操作不再應描述為「所有工具不可用」；以下是實際嘗試的範圍與失敗。

1. 使用 `sky.launch_app` 啟動 Full 測試副本；`list_windows` 回傳該精確 process path 的單一 `FH6-Horizon Tuner` 視窗。
2. `get_window_state` 的 native accessibility tree 顯示真實 WebView、四個工作區即時／調校／賽事紀錄／HUD、後端已連線與 Live 內容。沒有透過 browser fixture 繞過 entry。
3. 查詢當下的精確 process snapshot：Full root process PID 64244，path 為 `D:/FH6-frontend-ia-20260913/shell-race-fix/dist/g2-full/FH6-HorizonTuner.exe`；該副本 `logs/web_port.txt` 回報 8001，sidecar PID 52408 在 TCP 8001／UDP 8124 監聽。這是正常預設 port 的局部啟動證據，不是動態 fallback 通過；接手必須重新列舉 process/port，不能假定此 PID 仍存在。
4. 截圖未呈現應用程式內容；`activate_window` 回報 `failed to activate captured window`。依 skill recovery 重新取得單一 target 並重試一次，仍為相同錯誤；沒有繼續使用舊 screenshot/index 點擊。
5. 已請使用者將上述 Full 視窗帶到前景並回覆；目前保留 Full 與其 sidecar，等待外部視窗狀態改變。下一位接手先重新列出當前 windows/process/ports，不依本文件 PID 假設程序仍存在。不要另啟第二個同資料目錄的 Full，也不要終止使用者其他程序。

這裡的成功僅是 launch、backend port 與 native accessibility 可讀；不能推論使用者看得到正確首幀、HUD 已啟動或離頁仍存在。若後續仍不能操作，保留精確錯誤與未完成子項，不更換 G2 定義。

## 下一步與缺项

- Full 視窗可操作後，先觀察實際畫面，再按 [G2 remaining](g2-remaining-20260914.md) 完成 C5 的入口、theme/core 首幀與正常 dynamic-port path，以及 H5 的啟動／離頁／重入／明確關閉與 config readback。
- Full 完整結束並確認 owned backend 釋放後，以獨立 Lite 目錄重複所需場景；記錄兩入口及缺少 Full-only mount。不要把已編譯的 Lite 當成已啟動。
- G0 native/performance baseline、後期完整 state/channel/device/MoTeC、真實 FH6 與三次成對效能證據仍按原 [驗收矩陣](../acceptance.md) 取得。
- [受控 mounted 證據](https://github.com/eddie772tw/FH6-HorizonTuner/blob/2cb2983c763cce4ca86e2d4c79b0d7bfba3295fe/docs/frontend/ia-refactor-20260913/evidence/g2-mounted-reentry-20260914.md) 已補完 G2 操作 1–3；以上 C5/H5 尚未完成前不發布 WAVE2_BASE_SHA，PR #345 保持 draft。
