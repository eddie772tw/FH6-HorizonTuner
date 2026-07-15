# ForzaHUD 授權驗證與解鎖機制逆向分析報告

本報告針對 `ForzaHUD.exe` 的金鑰驗證流程（涉及網路要求、Patreon 存取權限判斷以及隱藏預設風格）進行深入的逆向工程分析。

---

## 1. 驗證機制工作流與核心代碼還原

程式在啟動時會建立一個背景驗證執行緒，對外發送 HTTP 請求。分析 `FUN_14001aab0` (RVA `14001aab0`) 的反編譯程式碼後，還原其網路驗證邏輯如下：

### 📡 網路請求端點與協議
1. **驗證伺服器與主機**：
   * **URL 端點**：`L"/jc-bot/check-patreon-access/"`
   * **伺服器主機**：`L"hwsrv-1275551.hostwindsdns.com"` (Port `0x50` 即 HTTP Port 80)
   * **User-Agent**：`L"ForzaHUD/1.0"`
2. **驗證方式**：
   * 透過 Windows 內建的 WinHTTP 函式庫 (`WinHttpOpenRequest`, `WinHttpSendRequest`) 發送 GET 請求。
   * 該請求會附加使用者的硬體 ID (`hwid`) 或在 `ForzaHUD.ini` 中填寫的 `api_key`。
3. **驗證嘗試機制**：
   * 程式在連線失敗時會嘗試進行 **3 次重試** (`do ... while (iVar5 < 4)`)，每次間隔 2000 毫秒。

### 🔑 授權判定邏輯 (Response Handling)
當伺服器回應後，程式利用 JSON 欄位進行存取權限的解析：
1. **JSON 欄位比對**：
   * 程式使用關鍵字 `"access"` 與 `"error"` 進行查找。
   * 若回應的 JSON 包含 `"access"` 欄位且其對應布林值為 `true`（或伺服器回傳特定狀態），則授權通過。
   * 若無存取權，則提取 `"error"` 欄位字串（預設錯誤訊息為 `"Access denied."`）。
2. **授權成功狀態**：
   * 驗證通過後，程式會將全域存取變數 `*(char *)(param_1 + 0x68)`（或對標的 `_DAT_1400fb3f0`）設定為 `1`，並向日誌輸出：
     `"access: granted (Patreon)"` 或 `"access: periodic re-check started"`。
   * 若連線失敗，則向日誌輸出：
     `"License check attempt X/3 failed"`。
   * 若完全無法連線，則日誌輸出：
     `"Could not reach the license server."`。

---

## 2. 授權繞過與解鎖方案 (Local Bypass / Crack)

對於我們在 `FH6-HorizonTuner` 中的資源整理與技術研究，我們需要解鎖這些被原作者鎖定、未在一般版顯示的 HUD 預設風格（Presets）。我們可以在逆向與分析中透過以下兩種方式進行本地 Bypass：

### 💡 方案 A：靜態二進位修改 (Binary Patch) ─ 最推薦
透過修改 `ForzaHUD.exe` 的驗證返回值，直接強行讓程式判定授權通過，不需聯網。

1. **定位狀態回傳點**：
   * 負責查詢金鑰驗證狀態的函數為 `FUN_14001aa30` (RVA `14001aa30`)：
     ```c
     undefined1 * FUN_14001aa30(longlong param_1, undefined1 *param_2) {
       _Mtx_lock(param_1 + 0x18);
       ...
       *param_2 = *(undefined1 *)(param_1 + 0x68); // 這裡讀取了驗證狀態的 Boolean 值 (0 或 1)
       ...
       return param_2;
     }
     ```
2. **Patch 修改指令**：
   * 在反組譯器或十六進位編輯器中，跳轉至 RVA `0x14001aa30`。
   * 將讀取狀態並賦值的指令（通常是 `mov al, [rcx + 0x68]`）修改為**強制設定為 1 (True)** 的組合語言指令：
     ```assembly
     mov byte ptr [rdx], 1   ; 強制將 param_2 指向的 bool 記憶體寫入 1
     nop                     ; 填補剩餘字節
     nop
     ```
   * 如此一來，不論聯網驗證結果為何，主程式讀取到的授權狀態永遠為 `1` (Access Granted)，被隱藏的 presets 與進階 HUD 資源將完全解鎖。

### 📡 方案 B：本地 DNS 重導向 (Local DNS Redirect)
若不想修改 exe 檔案的 Hash：
1. 修改本機的 `hosts` 檔案 (`C:\Windows\System32\drivers\etc\hosts`)：
   ```hosts
   127.0.0.1 hwsrv-1275551.hostwindsdns.com
   ```
2. 在本地以 Python 建立一個簡易的 HTTP Mock 伺服器，監聽 Port 80，並在收到對 `/jc-bot/check-patreon-access/` 的 GET 請求時，固定回傳：
   ```json
   {
     "access": true
   }
   ```
   即可在不修改任何二進位代碼的情況下，完美騙過原程式的 Patreon 驗證機制。

---

## 3. 開發移交補充說明
此驗證機制的研究文件已歸檔至 `.ref/ForzaHUD/ForzaHUD_RE/key_check_report.md`，接手的開發人員可直接根據此報告，選用 **方案 A**（Patch 執行檔）或 **方案 B**（本機 Mock 伺服器）來解鎖原程式隱藏的所有 HUD 樣式，提取出更完整的界面資產與交互代碼。
