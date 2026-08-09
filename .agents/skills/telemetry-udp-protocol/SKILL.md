---
name: telemetry-udp-protocol
description: 處理 Forza Horizon UDP 遙測封包解析、128-byte 二進位 struct 格式、高頻 UDP 效能維護與物理單位轉換時觸發此技能。
---

# Forza UDP 遙測協議與位元組封包處理指南 (Telemetry UDP Protocol Skill)

## 🎯 核心原則

1. **零同步阻塞 (Zero Blocking I/O)**：
   - UDP 接收主循環 (`telemetry_listener.py`) 執行頻率高達 60Hz+。
   - **嚴禁**在主循環中放置檔案寫入、HTTP 請求或同步阻塞操作。

2. **結構與 Byte Offset 鎖定**：
   - 封包傳輸格式必須精確匹配二進位 struct（如 `TELEMETRY_STRUCT_FORMAT = "<iffffffffffff4f4f4f4f16s"`）。
   - 修改封包格式時，必須同步確認前後端 Struct 大小對齊（如 128 bytes 固定大小）。

3. **原生單位與顯示單位轉換規範**：
   - 速度：米/秒 ($m/s$) 轉 $km/h$ (乘 $3.6$)。
   - 增壓/壓力：帕斯卡 ($Pa$) 轉 $PSI$ (除以 $6894.75729$)。
   - 馬力：瓦特 ($W$) 轉 $HP$ (除以 $745.7$)。
   - 加速度：$m/s^2$ 轉 $G$ 值 (除以 $9.81$)。

## 🧪 驗證 SOP
- 修改 UDP 或數據打包邏輯後，必須執行 `pytest tests/test_telemetry_listener.py`。
