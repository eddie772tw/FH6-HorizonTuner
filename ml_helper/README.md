# FH6 Telemetry Tuning - Machine Learning Helper (ml_helper)

這個輔助工具獨立於主程式，旨在透過機器學習（CNN）歸納學習多個專家調校檔（Tuning Profiles）的物理規律。工具透過將車輛靜態特徵與專家調校參數映射至二維的「調校特徵圖（Tuning Image）」，利用 2D 卷積層提取參數之間的物理耦合關係。

---

## 🛠️ 環境配置與安裝指引

為使本工具在 NVIDIA GPU (CUDA) 與 AMD GPU (ROCm) 架構下皆能流暢執行，請根據您的硬體平台安裝對應版本的 PyTorch。

### 1. 安裝 PyTorch (硬體加速版)

* **NVIDIA GPU (CUDA 12.1 / 12.4)**:
  ```bash
  pip install torch --index-url https://download.pytorch.org/whl/cu121
  ```
* **AMD GPU (Linux ROCm 6.0+)**:
  ```bash
  pip install torch --index-url https://download.pytorch.org/whl/rocm6.0
  ```
* **CPU-only 環境 (自動回退)**:
  ```bash
  pip install torch
  ```

### 2. 安裝其他 Python 依賴
```bash
pip install -r ml_helper/requirements.txt
```

---

## 📂 檔案結構與模組說明

* `data_loader.py`: 讀取並整合 `backend/tunings/` 中的 JSON 專家調校檔案以及 `backend/car_database.json` 中的車輛基本屬性，並實作數據增強與特徵圖映射。
* `model.py`: 定義輕量級 2D CNN 模型 `TuningCNN`，內含物理邊界值限制輸出層。
* `train.py`: Physics-Informed 訓練腳本，支援動態 CPU/GPU 加速，評估泛化誤差。
* `predict.py`: CLI 推理工具，輸入新車參數或車輛 ID，直接推薦專家調校配置。

---

## 🚀 使用說明

### 1. 訓練模型
確保 `backend/tunings/` 目錄下有專家調校的 `.json` 檔案。
```bash
python ml_helper/train.py --epochs 100 --data_dir backend/tunings/
```
訓練完成後，模型會被保存在 `ml_helper/best_tuning_cnn.pth`。

### 2. 預測調校
使用已訓練好的模型預測指定車輛的調校參數：
```bash
# 依據車輛資料庫的車輛 ID 預測 (例如車輛 ID 為 325)
python ml_helper/predict.py --car_id 325 --event road

# 或者手動輸入車輛重量與驅動形式預測
python ml_helper/predict.py --weight 2800 --weight_dist 52 --drive AWD --event rally
```
預測後會在 `backend/tunings/` 下生成一份 `[CarID]-ML_Optimized.json` 調校檔，可以直接用主程式讀取。
