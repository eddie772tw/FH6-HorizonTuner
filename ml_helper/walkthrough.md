# ml_helper 開發歷程與銜接指南 (Development Walkthrough)

本文件詳細記錄了基於 CNN 的專家調校參數機器學習輔助工具 `ml_helper` 的開發過程、物理數學建模、硬體加速設計與代碼結構，旨在協助後續的工程師與 AI 協同 Agent 快速銜接工作流。

---

## 1. 物理數學建模與特徵矩陣設計 (Tuning Image Design)

### 1.1 特徵排列邏輯
為配合卷積神經網路（CNN）提取局部關聯特徵的優勢，我們將一維的車輛調校參數編碼為一個 $8 \times 8$ 的「調校特徵圖」（Tuning Image）：
- **Row 1 & 2**：分別為前、後軸的輪胎、彈簧、回彈/壓縮阻尼、外傾角、差速鎖定率與空力參數，這些參數在物理上是高度橫向耦合的。
- **Row 3**：包含後傾角、束角、中央差速比、煞車分配、煞車壓力與前後車身高度，這些是影響整體操控平衡的幾何/制動參數。
- **Row 4**：車輛靜態屬性（車重、配重比、馬力、轉速限制、終傳比、驅動形式），作為輸入特徵。
- **Row 5**：賽事目的乘數，用以告訴 CNN 當前調校是針對 Road, Rally, Drift, Speed, Touge 或是 Danger Sign。

### 1.2 數學實用性與少樣本訓練方案
1. **參數量 vs 樣本數需求**：我們設計的超輕量級 CNN 僅含兩層卷積與兩層全連接層，總參數量 $M \approx 1,958$。在純數據驅動下，通常需要 $N \ge 10 \times M \approx 20,000$ 個專家檔案才能避免過擬合。
2. **物理先驗特徵工程 (De-normalization)**：
   - 為了降低樣本數需求，我們不讓 CNN 直接預測彈簧與阻尼的絕對值。
   - 我們在 `data_loader.py` 中實作了**彈簧自然頻率公式**（$K = Hz^2 \times Weight / 19.56$）與阻尼比公式以計算出「物理基準」。
   - CNN 僅預測修正乘數 $\alpha \in [0.5, 1.5]$。這使模型只需預測物理合理的微調區間，大幅壓縮了假設空間。
3. **數據增強（Data Augmentation）**：
   - 實作了「車重物理縮放」：對於每個專家調校檔，在 $\pm 15\%$ 的範圍內隨機變更車重，並根據彈簧剛度與質量的線性物理關係等比例縮放彈簧與阻尼，同時加上輕微的高斯雜訊。
   - 這讓 **30 ~ 50 個**真實專家調校檔案，即可增強生成數千個訓練樣本，使模型在數學與物理上具備高度的泛化實用性。

---

## 2. CUDA 與 ROCm 多硬體加速平台設計

為了確保跨平台的運作相容性，我們加入了以下設計：
* **裝置偵測機制**：在 `train.py` 與 `predict.py` 中利用 `torch.cuda.is_available()` 進行硬體偵測。由於 PyTorch 將 AMD ROCm/HIP 映射在 `cuda` 下，此統一接口能同時指派 NVIDIA 與 AMD 的 GPU 加速運作，若皆無偵測到則自動回退（Fallback）至 CPU。
* **安裝分離策略**：在 [requirements.txt](file:///d:/FH6-HorizonTuner/ml_helper/requirements.txt) 中排除 `torch`，並在 [README.md](file:///d:/FH6-HorizonTuner/ml_helper/README.md) 中提供專門的 Whl 源安裝指令，避免因為直接寫死 torch 版本而導致使用者在 CUDA 或 ROCm 平台上安裝到僅支援 CPU 的編譯版本。

---

## 3. 專案結構與模組文件鏈結

輔助工具位於獨立目錄 `ml_helper` 中，結構如下：

1. **[requirements.txt](file:///d:/FH6-HorizonTuner/ml_helper/requirements.txt)**：定義 `numpy`, `pandas`, `scikit-learn`, `matplotlib` 等基礎依賴。
2. **[README.md](file:///d:/FH6-HorizonTuner/ml_helper/README.md)**：使用說明、CUDA/ROCm 安裝指引、CLI 命令說明。
3. **[data_loader.py](file:///d:/FH6-HorizonTuner/ml_helper/data_loader.py)**：
   - 讀取 `backend/tunings/` 下的專家調校 JSON 檔案，解析 Car ID 並與 `backend/car_params/` 對齊。
   - 實作車重物理等比例縮放的數據增強。
   - 計算彈簧剛度與阻尼的物理基準，並映射為 $8 \times 8$ 二維 Tensor。
4. **[model.py](file:///d:/FH6-HorizonTuner/ml_helper/model.py)**：
   - 定義 `TuningCNN` 網路結構，輸出層使用 Sigmoid 限制輸出在 $[0, 1]$ 區間。
   - 定義 `decode_tuning_image` 函數，將二維特徵圖反向常規化，結合物理基準計算出實際的遊戲調校參數，並在最後加入物理合理性校驗（如限制 $Bump < Rebound$）。
5. **[train.py](file:///d:/FH6-HorizonTuner/ml_helper/train.py)**：
   - 實作動態 GPU/CPU 硬體檢測。
   - 實作 **Physics-Informed 損失函數**：在 MSE 擬合誤差上加入了物理約束懲罰項（例：若 $Bump > Rebound$ 則給予 ReLU 懲罰值，後驅車差速鎖限制等）。
   - 將訓練好的模型存檔至 `ml_helper/best_tuning_cnn.pth`。
6. **[predict.py](file:///d:/FH6-HorizonTuner/ml_helper/predict.py)**：
   - 推理 CLI 工具。輸入車輛屬性（或車輛 ID）與賽事類型（如 `road`, `rally`, `drift`），自動載入模型預測出推薦的專家調校，並在 `backend/tunings/` 下生成調校 JSON 檔。

---

## 4. 給後續工程師或 Agent 的工作銜接指南

如果您是接續此專案的工程師或 Agent，以下是建議的後續擴充方向：

### 4.1 對接主程式前端與 API
目前 `predict.py` 會在 `backend/tunings/` 中寫入 `[CarID]-ML_Optimized.json`。
* **銜接點**：可在 `backend/main.py` 中新增一個 Endpoint：
  `POST /api/ml/predict/{car_id}`，內部使用 Python 的 `subprocess` 呼叫 `predict.py`，或直接 import `predict_tuning` 函數來進行即時生成，並讓前端「調校設定」頁面可以一鍵匯入此機器歸納推薦。

### 4.2 引入遙測時序分析（進階版 CNN）
若想進一步提升模型在多地形上的適應性，可以收集玩家在測試操駕時的 60Hz 遙測資料：
1. **數據源**：主程式目前的 UDP 遙測紀錄（在 `backend/sessions/` 目錄中以 JSON 或 CSV 儲存）。
2. **圖像化映射**：將過彎或重煞車時的 Suspension Travel、Tire Slip Ratio 進行短時傅立葉轉換（STFT），生成 2D 頻譜圖或熱圖。
3. **模型對接**：將原本的 `TuningCNN` 輸入修改為「遙測熱圖」，讓 CNN 學習「此種遙測波形下，專家做出的阻尼與彈簧微調幅度」。

### 4.3 擴充數據集
目前 `backend/tunings/` 下只有 5 個專家調校檔。
* **銜接點**：在使用本工具前，建議先在 `backend/tunings/` 下手動放入更多針對不同車輛人工調校好的設定檔（副檔名為 `.json`），然後執行：
  ```bash
  python ml_helper/train.py --epochs 150
  ```
  以重新訓練出更高擬合優度的 `best_tuning_cnn.pth` 權重。
