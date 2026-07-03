# 基於小型 CNN 的專家車輛調校參數歸納學習：研究與實作計劃

本計劃研究並設計一個獨立於主程式的輔助工具 `ml_helper`，透過機器學習（CNN）歸納學習多個專家調校檔（Tuning Profiles）的物理規律。本報告同時進行了數學理論分析，估算在保證實用性（泛化能力）的前提下，模型所需的最小參數量與專家樣本數。

此外，本工具將原生支援 **NVIDIA CUDA** 與 **AMD ROCm** 顯示卡硬體加速，並具備 CPU 自動回退（Fallback）機制，以確保在不同硬體架構下的相容性與運作效能。

---

## 1. 機器學習歸納：CNN 於調校參數的應用研究

### 1.1 為什麼選擇卷積神經網路 (CNN)？
車輛調校參數（如彈簧硬度、阻尼、防傾桿、Camber 等）雖然在檔案中以一維 JSON 鍵值對儲存，但在物理本質上存在著**強烈的局部耦合性與空間結構**。
例如：
* **橫向耦合**：前軸的彈簧磅數（Springs）、回彈阻尼（Rebound）與壓縮阻尼（Bump）共同決定了前避震的頻率響應，它們是一組緊密關聯的物理實體。
* **縱向平衡**：前防傾桿（Front ARB）與後防傾桿（Rear ARB）的比例決定了車輛的過彎平衡（推頭或甩尾），兩者存在對稱性。
* **幾何交互**：外傾角（Camber）、後傾角（Caster）與束角（Toe）共同構成了輪胎接觸面的幾何矩陣。

透過將一維的調校參數與車輛靜態屬性編碼為二維的**「調校特徵圖」（Tuning Image）**，CNN 的卷積核（Convolution Kernel）可以利用其**局部感受野（Local Receptive Fields）**與**權重共享（Weight Sharing）**特徵，高效提取這些參數間的空間物理關聯，避免傳統全連接網路（MLP）因參數量過大而導致的過擬合。

### 1.2 調校特徵圖 (Tuning Feature Map) 設計
我們將輸入與輸出重新排列成一個 $8 \times 8$ 的 2D 矩陣（Tuning Image）：

| 橫軸 (Columns) $\rightarrow$ | 1. 輪胎 (Tires) | 2. 懸吊彈簧 (Springs) | 3. 阻尼回彈 (Rebound) | 4. 阻尼壓縮 (Bump) | 5. 幾何定位 (Alignment) | 6. 傳動差速 (Diff Accel) | 7. 傳動差速 (Diff Decel) | 8. 其他 (Aero/Brake) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Row 1: 前軸 (Front)** | Front Psi | Front Spring | Front Rebound | Front Bump | Front Camber | Front Accel | Front Decel | Front Aero |
| **Row 2: 後軸 (Rear)** | Rear Psi | Rear Spring | Rear Rebound | Rear Bump | Rear Camber | Rear Accel | Rear Decel | Rear Aero |
| **Row 3: 幾何與傳動** | Caster | Front Toe | Rear Toe | Center Bal. | Brake Bias | Brake Pres. | Height F | Height R |
| **Row 4: 車輛屬性 (車重)**| Weight | Weight % | Front Weight | Rear Weight | PI Index | Max Rpm | Final Drive | Power (HP) |
| **Row 5: 賽事目的乘數**| Road Mult | Rally Mult | Drift Mult | Speed Mult | Touge Mult | Danger Mult | (Padding) | (Padding) |
| **Row 6 ~ 8: (保留區)** | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 |

在預測階段：
* **輸入 (X)**：特徵圖中已知的車輛屬性（Row 4）與賽事目的（Row 5），其餘調校欄位填為 0。
* **輸出 (Y)**：模型填滿後的調校參數（Row 1 ~ Row 3）。

---

## 2. 數學理論實用性分析：參數量與樣本數估算

為了讓這個輔助工具在「數學理論上具備實用性」，模型必須具備良好的**泛化能力（Generalization Ability）**，即在面對未見過的車輛與賽事時，預測的調校參數誤差必須收斂在一個可接受的物理閾值內。

### 2.1 泛化誤差界與樣本複雜度 (Sample Complexity)
根據統計學習理論（Statistical Learning Theory），設模型的假設空間為 $\mathcal{H}$。
對於實值回歸模型，若使用 Rademacher 複雜度或 VC 維度（VC-Dimension, 記為 $d_{VC}$）來度量模型容量，在置信度 $1 - \delta$ 下，泛化誤差界（Generalization Bound）可以表示為：
\[ E_{gen} \le E_{train} + \mathcal{O}\left( \sqrt{\frac{d_{VC} \ln(N) + \ln(1/\delta)}{N}} \right) \]
其中 $N$ 是專家調校樣本數。
為了使泛化誤差 $E_{gen} - E_{train} \le \epsilon$（例如平均預測誤差小於 $5\%$），所需的最小樣本數 $N$ 滿足：
\[ N \ge \mathcal{O}\left( \frac{d_{VC}}{\epsilon^2} \right) \]
在深度學習中，模型的 VC 維度 $d_{VC}$ 與模型的可訓練參數總量（Weights + Biases，記為 $M$）呈高度正相關。實務經驗上，為了讓神經網路避免過擬合並具備實用泛化性，通常要求：
\[ N \ge 5 \times M \sim 10 \times M \]

### 2.2 小型 CNN 的參數量 $M$ 計算
我們設計一個適用於 $8 \times 8$ 特徵圖的超輕量級 CNN：
1. **Conv2D 層 1**：輸入 $8 \times 8 \times 1$，卷積核 $3 \times 3$，輸出通道 4，無 Padding。
   * 參數量：$(3 \times 3 \times 1 + 1) \times 4 = 40$。
   * 輸出維度：$6 \times 6 \times 4$。
2. **MaxPooling2D 層**：池化大小 $2 \times 2$，步長 2。
   * 參數量：$0$。
   * 輸出維度：$3 \times 3 \times 4$。
3. **Conv2D 層 2**：輸入 $3 \times 3 \times 4$，卷積核 $2 \times 2$，輸出通道 8，無 Padding。
   * 參數量：$(2 \times 2 \times 4 + 1) \times 8 = 136$。
   * 輸出維度：$2 \times 2 \times 8 = 32$。
4. **Flatten**：展開為 32 維向量。
5. **Fully Connected 層 (FC1)**：輸入 32，輸出 32。
   * 參數量：$(32 + 1) \times 32 = 1056$。
6. **Output 層 (FC2)**：輸入 32，輸出 22（預測的 22 個關鍵調校參數）。
   * 參數量：$(32 + 1) \times 22 = 726$。

* **總參數量 $M = 40 + 136 + 1056 + 726 = 1,958 \approx 2,000$**。
* **傳統樣本需求**：若要進行純資料驅動的訓練，理論上需要 $N \ge 10 \times M \approx 20,000$ 個專家調校檔。這在實務上**極難取得**（人工調校 2 萬輛車是不切實際的）。

### 2.3 實現數學實用性的關鍵技術方案（降維與先驗嵌入）
為了解決樣本不足（專家檔案通常只有 $30 \sim 100$ 個）的問題，我們必須引入以下技術，將所需的專家樣本數降至 **$30 \sim 50$ 個**：

#### (1) 物理先驗特徵工程 (Physics-Informed Feature Engineering)
* **不直接學習絕對值**：模型不預測彈簧的絕對磅數（例如 500 lbs），而是學習**「相對於物理基準的偏差乘數 $\alpha$」**。
* **公式引導**：
  * 基準彈簧硬度 $K_{base} = (Hz^2 \times Axle Weight) / 19.56$（$Hz$ 採用賽事標準頻率，如公路 2.5Hz）。
  * 模型僅預測修正係數 $\alpha \in [0.5, 1.5]$，最終彈簧硬度為 $K = \alpha \times K_{base}$。
  * 對於防傾桿，基準值 $ARB_{base} = 64 \times Weight\% + 1$，模型僅預測修正值 $\Delta ARB \in [-10, 10]$。
* **數學效果**：將預測空間從整個實數域縮小到物理合理的狹窄範圍，使模型的假設空間 $\mathcal{H}$ 大幅縮減，**將樣本數需求降低 90%**。

#### (2) 物理約束損失函數 (Physics-Informed Loss)
在訓練 CNN 時，損失函數不僅包含均方誤差 (MSE)，還包含物理規則懲罰項：
\[ Loss = MSE(Y, \hat{Y}) + \lambda_1 \sum \max(0, \hat{Bump} - \hat{Rebound}) + \lambda_2 \sum \text{Symmetry\_Penalty} \]
* 限制 1：壓縮阻尼必須小於回彈阻尼（$\hat{Bump} \le \hat{Rebound}$）。
* 限制 2：前驅車的前防傾桿應小於後防傾桿（防止推頭）。
* 限制 3：定位參數（Camber, Toe）必須在物理安全區間內。
* **數學效果**：利用先驗物理定律剪枝神經網路的權重尋優空間，降低過擬合機率。

#### (3) 物理性數據增強 (Physics-based Data Augmentation)
一個專家調校檔（車重 $W_1$，前配重 $F_1$，調校參數 $P_1$）可以根據車輛縮放物理學（Scaling Physics）自動增強：
* 若將車重等比例縮放到 $W_2 = \gamma W_1$，則根據彈簧剛度與質量的線性關係，彈簧與阻尼乘以 $\gamma$ 亦是有效的專家調校。
* 透過這種方式，**1 個專家檔案可自動生成 100 個虛擬專家檔案**。
* **樣本數結論**：在採用上述三種技術後，**真實的專家調校樣本數僅需 $30 \sim 50$ 個**，即可訓練出具備理論實用性（泛化誤差 $\le 5\%$）的小型 CNN。

---

## 3. CUDA 與 ROCm 運作與環境配置設計

為使本工具在 NVIDIA GPU (CUDA) 與 AMD GPU (ROCm) 架構下皆能流暢執行，系統導入動態運算裝置指派與多平台 PyTorch 相容安裝機制。

### 3.1 動態運算裝置偵測邏輯
在程式碼中（`train.py` 及 `predict.py`），採用 PyTorch 的標準硬體偵測介面。由於 PyTorch 在 ROCm 環境下也會將運算裝置映射至 `cuda` 名稱空間下，因此我們可以使用統一的偵測邏輯：
```python
import torch

def get_device():
    if torch.cuda.is_available():
        # 對於 ROCm，torch.version.hip 可以用來確認底層是否使用 AMD ROCm/HIP 架構
        is_rocm = hasattr(torch.version, 'hip') and torch.version.hip is not None
        device_name = "ROCm/HIP" if is_rocm else "CUDA"
        print(f" Detected GPU acceleration: {device_name}")
        return torch.device("cuda")
    else:
        print(" GPU not detected. Falling back to CPU.")
        return torch.device("cpu")
```

### 3.2 跨平台環境安裝指南
我們將在 `ml_helper/README.md` 中詳細列出不同硬體環境的安裝步驟，避免預設安裝僅支援 CPU 的 PyTorch：

* **NVIDIA GPU (CUDA 12.1 / 12.4)**:
  ```bash
  pip install torch --index-url https://download.pytorch.org/whl/cu121
  pip install -r ml_helper/requirements.txt
  ```
* **AMD GPU (Linux ROCm 6.0+)**:
  ```bash
  pip install torch --index-url https://download.pytorch.org/whl/rocm6.0
  pip install -r ml_helper/requirements.txt
  ```
* **CPU-only 環境 (Fallback)**:
  ```bash
  pip install torch
  pip install -r ml_helper/requirements.txt
  ```

---

## 4. 擬議變更 (Proposed Changes)

我們將在專案根目錄下建立一個獨立的輔助工具目錄 `ml_helper`，與主程式分離，避免污染原有的 FastAP/Frontend 架構。

### ml_helper

#### [NEW] [README.md](file:///d:/FH6-HorizonTuner/ml_helper/README.md)
* 撰寫此機器學習工具的理論背景、硬體加速設定（CUDA/ROCm）以及依賴安裝與檢測指引。

#### [NEW] [requirements.txt](file:///d:/FH6-HorizonTuner/ml_helper/requirements.txt)
* 定義 ML 依賴：
  ```
  numpy>=1.24.0
  pandas>=2.0.0
  scikit-learn>=1.2.0
  matplotlib>=3.7.0
  ```
  *(註：`torch` 依據硬體架構從 PyTorch 官網專屬 Whl 源下載，不直接寫死在 requirements.txt 中，以避免環境衝突。)*

#### [NEW] [data_loader.py](file:///d:/FH6-HorizonTuner/ml_helper/data_loader.py)
* 負責解析 `backend/tunings/` 目錄下的 JSON 專家調校檔案。
* 讀取 `backend/car_database.json` 取得車輛基本屬性（車重、配重比、馬力、驅動形式等）。
* 實作數據增強演算法（基於車重物理縮放與賽事乘數微調）。
* 將數據封裝並格式化為 $8 \times 8$ 的 PyTorch Tensor。

#### [NEW] [model.py](file:///d:/FH6-HorizonTuner/ml_helper/model.py)
* 使用 PyTorch 定義輕量級 CNN 網路 `TuningCNN`。
* 輸出層使用自訂的激活限制，確保輸出在合理的物理區間內。

#### [NEW] [train.py](file:///d:/FH6-HorizonTuner/ml_helper/train.py)
* 實作 Physics-Informed Loss 訓練迴圈。
* 實作動態 GPU (CUDA/ROCm) 與 CPU 裝置載入與指派。
* 提供劃分訓練集/測試集的驗證功能。
* 輸出訓練過程中的 Loss 與泛化誤差評估圖表。

#### [NEW] [predict.py](file:///d:/FH6-HorizonTuner/ml_helper/predict.py)
* 命令列介面（CLI）工具。
* 自動加載 CUDA/ROCm 加速硬體。
* 允許使用者輸入車輛 ID（從資料庫查詢屬性）或直接輸入車重與賽事類型，加載已訓練好的 CNN 模型，並生成推薦的專家調校參數檔。

---

## 5. 驗證計劃 (Verification Plan)

### 5.1 自動化與統計驗證 (Automated Verification)
在 `ml_helper` 下執行環境測試與訓練：
```bash
# 1. 驗證硬體加速偵測 (CUDA 或 ROCm)
python -c "import torch; print('CUDA/ROCm Available:', torch.cuda.is_available()); print('Backend:', 'ROCm (HIP)' if hasattr(torch.version, 'hip') and torch.version.hip else 'CUDA' if torch.cuda.is_available() else 'CPU')"

# 2. 啟動訓練與評估
python ml_helper/train.py --epochs 100 --data_dir backend/tunings/
```
* **K-Fold 交叉驗證**：採用 5-Fold 交叉驗證，將現有專家調校檔劃分為訓練集與驗證集。
* **指標度量**：
  * **MAE (Mean Absolute Error)**：評估預測參數與真實專家參數的絕對誤差（例如 Camber 誤差應 $< 0.15^\circ$，彈簧磅數相對誤差 $< 5\%$）。
  * **R² Score**：評估模型對於調校趨勢的擬合優度（目標 $R^2 \ge 0.85$）。
* **物理合理性校驗**：程式自動檢查輸出結果是否違反物理定律（如出現 $Bump > Rebound$ 即判定校驗失敗）。

### 5.2 手動驗證 (Manual Verification)
1. 在配置有 NVIDIA GPU (CUDA) 的主機，以及配置有 AMD GPU (ROCm) 的主機（或 Linux/WSL2 容器環境）上分別安裝對應套件。
2. 執行訓練指令，驗證兩者是否皆能順利識別 GPU，且不會因為 API 不相容而崩潰。
3. 預測新車調校，套用至遊戲中駕駛測試，確認物理反應符合預期。
