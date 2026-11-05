# 手動終傳比等價重配 v1（#594）

正式 owner：`backend-rust/src/tuning/ratio_balance.rs`。這是使用者主動重配終傳與每檔齒比，並非更換 AEGO 起步／頂檔目標，也不是改變檔距的最佳化器。

## 數值契約

每次 workflow 都先從後端合格引擎證據重算原始推薦 `(F0,G0)`；原始總減速比 `Ri=F0×G0i` 不從前端回傳值或上次重配結果讀取。候選終傳 `F` 對應 `Gi=round(Ri/F,2)`。取位後每檔總比誤差為 `F×Gi−Ri`，其絕對值上界為 `F×.005`（計算比較加上 `1e-9` 浮點容差）。因此只保證這個容差內近似一致，不宣稱完全相等，也不宣稱遊戲中的加速時間／換檔性能相同。

Rust 枚舉使用者提供範圍內每一個 `.01` FD 格點；每個候選必須同時符合每檔觀察範圍、`.01` 格點、正數及嚴格遞減。越界或重合檔位不逐檔 clamp；不合法請求回 unavailable，並且沒有可套用的 gearing/recommendation。若仍有合法候選，診斷保留候選列表以便使用者改選。Reset 移除候選值，回到同一次證據重建的原推薦；若原推薦不符合輸入的觀察範圍，也會誠實回報 unavailable，不能假稱它合法。

## 支援邊界與來源

僅支援有目前合格推薦的 ICE、離散檔位、`adjustability.gearbox=Full`、4–10 檔。Fixed、僅 FD 可調、EV、CVT 與歷史 workflow 不開放此入口；未變更它們的原公式。現有 capability contract 中齒比範圍仍是 unknown，本功能不以 AEGO 模型內的滑桿先驗冒充實際遊戲範圍。

使用者須明確輸入自己從目前車輛／變速箱觀察到的 FD 與每檔範圍；來源記為 `user-observed`，不是後端已驗證的遊戲資料。本版只處理 `.01` 步進且端點落在 `.01` 網格的範圍；其他步進／精度暫不支援。每段範圍最多 10,001 個格點是運算複雜度防護，不是遊戲上限。仍需要實機確認輸入範圍及控制器／輔助科技體驗。

## API 與重播

沿用正式 workflow 的 `inputSnapshot.ratioBalance`：

```json
{
  "schemaVersion": "ratio-balance/v1",
  "candidateFinalDrive": 3.51,
  "bounds": {
    "source": "user-observed",
    "finalDrive": {"min": 2.0, "max": 6.1, "step": 0.01},
    "gears": [
      {"min": 0.4, "max": 6.0, "step": 0.01},
      {"min": 0.4, "max": 6.0, "step": 0.01},
      {"min": 0.4, "max": 6.0, "step": 0.01},
      {"min": 0.4, "max": 6.0, "step": 0.01}
    ]
  }
}
```

以上只是契約示例，**不是遊戲範圍來源**。未提供候選時回傳原推薦與合法候選；完全沒有此請求時維持既有 workflow。請求不接受額外 base／diagnostic 欄位。計算結果增加 `ratioBalance`，包含 base、legalFinalDrives、selectedFinalDrive、totalRatioErrors、totalRatioTolerance 與 status/reason。正式 `gearing`、recommendation fields 使用同一個被接受的結果。

推薦 snapshot 保存的是請求，不保存可由前端宣稱為真實的重配結果。保存／重啟驗證仍透過既有合格證據 owner 重算，重建 base、驗證能力／範圍／候選，並比較正式推薦。舊推薦沒有這個欄位時不改值；原 formulaVersion 的歷史重播規則保留。
