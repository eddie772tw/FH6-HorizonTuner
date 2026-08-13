---
name: telemetry-udp-protocol
description: 處理 Forza Horizon UDP 遙測封包解析、324-byte 二進位 struct、offset/單位轉換與 60Hz 高頻 UDP 效能時觸發此技能。
---

# Forza UDP 遙測協議與封包處理

## 不可混用的連接埠契約

- UDP 遙測開發預設為 `127.0.0.1:8000`，由 `TELEMETRY_IP` / `TELEMETRY_PORT` 控制。
- FastAPI REST/WebSocket 是獨立 HTTP/TCP 服務，開發預設為 `127.0.0.1:8001`，由 `BACKEND_PORT` 控制。
- portable release 的 HTTP port 可能是動態值；讀取 `logs/web_port.txt` 或 sidecar readiness event。UDP port 仍依 telemetry 設定。
- `--scan --port 8000` 是 UDP 探針，不是 FastAPI HTTP port。

## 封包與高頻路徑規則

- Data Out 封包固定為 324 bytes、Little-Endian；未有證據前不得修改欄位 offset 或 padding 解讀。
- V2 的保留區是 232~243 bytes，因此 `Position` 從 244、`Speed` 從 256 起算。
- 封包沒有獨立 Float32 `DeltaT`；由 Offset 4 的 `TimestampMS` 兩幀相減後除以 1000 計算。
- `telemetry_listener.py` 主循環禁止同步檔案寫入、HTTP 請求與高開銷配置。
- 封包解析的原生單位、domain 單位與 UI 顯示單位必須分層，不能在 UI 重複轉換。

## Offset 變更與回放流程

1. 先比對 `references/packet_format_reference.md`、目前 parser 與實際 fixture。
2. 為每個變更的 offset、padding、型別與單位補固定封包 fixture 或 regression test。
3. 使用固定封包 replay 驗證 raw value、normalized value 與 UI display value。
4. 執行 `uv run --no-project --python .venv\\Scripts\\python.exe python -m pytest tests/`，若涉及前端資料流再執行 `cmd /c "pnpm -C frontend run test"`。
5. 只有測試與文件一致後，才把結論記錄到 Journal；未確認的欄位標為假設，不得寫成正式規格。

## 常用轉換

- `m/s -> km/h`: 乘以 `3.6`。
- `W -> hp`: 除以 `745.7`。
- `m/s² -> G`: 除以 `9.81`。
- `℉ -> ℃`: `(℉ - 32) * 5 / 9`。

## 驗證命令

- UDP 探針：`python tools/verify_telemetry_v2_v3.py --scan --port 8000`
- 後端測試：`uv run --no-project --python .venv\\Scripts\\python.exe python -m pytest tests/`
- 前端測試：`cmd /c "pnpm -C frontend run test"`
