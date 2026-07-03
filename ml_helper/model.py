import torch
import torch.nn as nn

class TuningCNN(nn.Module):
    def __init__(self):
        super(TuningCNN, self).__init__()
        
        # 1. 卷積層提取局部物理關聯特徵
        self.conv1 = nn.Conv2d(in_channels=1, out_channels=4, kernel_size=3, padding=0) # Output: (batch, 4, 6, 6)
        self.pool1 = nn.MaxPool2d(kernel_size=2, stride=2)                            # Output: (batch, 4, 3, 3)
        self.conv2 = nn.Conv2d(in_channels=4, out_channels=8, kernel_size=2, padding=0) # Output: (batch, 8, 2, 2)
        
        self.relu = nn.ReLU()
        
        # 2. 全連接層進行非線性歸納與參數映射
        self.fc1 = nn.Linear(in_features=8 * 2 * 2, out_features=32)
        # 輸出 64 個神經元，對應 8x8 特徵圖
        self.fc2 = nn.Linear(in_features=32, out_features=64)
        
        # 3. 物理約束輸出層：使用 Sigmoid 約束特定參數的相對範圍
        # 最終模型輸出將透過物理約束層進行限制
        self.sigmoid = nn.Sigmoid()

    def forward(self, x):
        # 卷積提取
        out = self.relu(self.conv1(x))
        out = self.pool1(out)
        out = self.relu(self.conv2(out))
        
        # 扁平化
        out = out.view(out.size(0), -1) # (batch, 32)
        
        # 全連接
        out = self.relu(self.fc1(out))
        out = self.fc2(out)             # (batch, 64)
        
        # 重新整理回 (batch, 1, 8, 8) 的圖像結構
        out = out.view(-1, 1, 8, 8)
        
        # 使用 sigmoid 將輸出歸一化在 [0, 1] 區間，之後再進行物理反向常規化 (De-normalization)
        # 這可以保證輸出的數值不會出現不可預期的極端值（如無限大的彈簧磅數或負的胎壓）
        out = self.sigmoid(out)
        
        # 我們將輸入的 Row 4 (車輛特徵) 與 Row 5 (賽事特徵) 複製到輸出中，
        # 以確保 CNN 對這些已知輸入欄位保持恆等映射，只學習 Row 1~3 的調校參數。
        out_clone = out.clone()
        out_clone[:, :, 3, :] = x[:, :, 3, :] # 保留 Row 4
        out_clone[:, :, 4, :] = x[:, :, 4, :] # 保留 Row 5
        
        return out_clone

def decode_tuning_image(y_map, car_weight, weight_dist, base_params):
    """
    將 CNN 輸出的 1x8x8 特徵圖還原 (De-normalize) 為實際的遊戲調校參數數值，
    並結合物理基準進行修正。
    y_map: numpy array of shape (8, 8)
    car_weight: 實際車重 (lbs 或 kg)
    weight_dist: 前配重比 (0.0 ~ 1.0)
    base_params: 由 data_loader.get_base_physics_params 計算出的物理基準字典
    """
    # 數值還原與物理乘數結合
    # Row 1: Front Psi, Front Spring, Front Rebound, Front Bump, Front Camber, Front Accel, Front Decel, Front Aero
    tires_f = y_map[0, 0] * 3.0 * 15.0 + 15.0 # 常規胎壓 15 ~ 45 PSI
    # 彈簧磅數採用物理偏差修正：基準 * (0.5 + y_map * 1.0) -> 範圍為 0.5 到 1.5 倍基準
    spring_f = base_params["spring_f"] * (0.5 + y_map[0, 1] * 1.0)
    rebound_f = base_params["rebound_f"] * (0.5 + y_map[0, 2] * 1.0)
    bump_f = base_params["bump_f"] * (0.5 + y_map[0, 3] * 1.0)
    camber_f = y_map[0, 4] * 10.0 - 5.0  # cams: -5.0 to 0.0
    diff_acc_f = y_map[0, 5] * 100.0
    diff_dec_f = y_map[0, 6] * 100.0
    aero_f = y_map[0, 7] * 500.0
    
    # Row 2: Rear Psi, Rear Spring, Rear Rebound, Rear Bump, Rear Camber, Rear Accel, Rear Decel, Rear Aero
    tires_r = y_map[1, 0] * 3.0 * 15.0 + 15.0
    spring_r = base_params["spring_r"] * (0.5 + y_map[1, 1] * 1.0)
    rebound_r = base_params["rebound_r"] * (0.5 + y_map[1, 2] * 1.0)
    bump_r = base_params["bump_r"] * (0.5 + y_map[1, 3] * 1.0)
    camber_r = y_map[1, 4] * 10.0 - 5.0
    diff_acc_r = y_map[1, 5] * 100.0
    diff_dec_r = y_map[1, 6] * 100.0
    aero_r = y_map[1, 7] * 500.0
    
    # Row 3: Caster, Front Toe, Rear Toe, Center Bal., Brake Bias, Brake Pres., Height F, Height R
    caster = y_map[2, 0] * 10.0
    toe_f = y_map[2, 1] * 2.0 - 1.0     # -1.0 to 1.0
    toe_r = y_map[2, 2] * 2.0 - 1.0
    diff_center = y_map[2, 3] * 100.0
    brake_bias = y_map[2, 4] * 100.0
    brake_pres = y_map[2, 5] * 200.0
    height_f = y_map[2, 6] * 50.0
    height_r = y_map[2, 7] * 50.0
    
    # Row 6: ARB front, ARB rear
    arb_f = base_params["arb_f"] * (0.5 + y_map[5, 0] * 1.0)
    arb_r = base_params["arb_r"] * (0.5 + y_map[5, 1] * 1.0)
    # 限制在 Forza 的 ARB 區間 1 到 65 內
    arb_f = max(1.0, min(65.0, arb_f))
    arb_r = max(1.0, min(65.0, arb_r))
    
    # 物理合理性後處理：
    # 壓縮阻尼必須小於回彈阻尼
    if bump_f >= rebound_f:
        bump_f = rebound_f * 0.6
    if bump_r >= rebound_r:
        bump_r = rebound_r * 0.6

    return {
        "tires": {
            "front": round(tires_f, 1),
            "rear": round(tires_r, 1)
        },
        "alignment": {
            "camberF": round(camber_f, 1),
            "camberR": round(camber_r, 1),
            "toeF": round(toe_f, 1),
            "toeR": round(toe_r, 1),
            "caster": round(caster, 1)
        },
        "arb": {
            "front": round(arb_f, 2),
            "rear": round(arb_r, 2)
        },
        "springs": {
            "front": round(spring_f, 2),
            "rear": round(spring_r, 2),
            "heightF": round(height_f, 1),
            "heightR": round(height_r, 1)
        },
        "damping": {
            "reboundF": round(rebound_f, 1),
            "reboundR": round(rebound_r, 1),
            "bumpF": round(bump_f, 1),
            "bumpR": round(bump_r, 1)
        },
        "aero": {
            "front": round(aero_f, 1),
            "rear": round(aero_r, 1)
        },
        "brake": {
            "balance": round(brake_bias, 1),
            "pressure": round(brake_pres, 1)
        },
        "diff": {
            "accelF": round(diff_acc_f, 1),
            "decelF": round(diff_dec_f, 1),
            "accelR": round(diff_acc_r, 1),
            "decelR": round(diff_dec_r, 1),
            "center": round(diff_center, 1)
        }
    }
