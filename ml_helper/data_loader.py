import os
import json
import re
import numpy as np
import torch
from torch.utils.data import Dataset

class TuningDataset(Dataset):
    def __init__(self, data_dir="backend/tunings", car_params_dir="backend/car_params", augment_factor=50):
        self.data_dir = data_dir
        self.car_params_dir = car_params_dir
        self.augment_factor = augment_factor
        self.samples = []
        
        self.load_data()
        
    def parse_car_id(self, filename):
        # 匹配檔名前面的數字，例如 "325-Optimized.json" -> 325
        match = re.match(r"^(\d+)", filename)
        if match:
            return match.group(1)
        return None

    def classify_event(self, filename):
        fn_lower = filename.lower()
        # 預設為 Road
        road, rally, drift, speed, touge, danger = 1.0, 0.0, 0.0, 0.0, 0.0, 0.0
        
        if any(k in fn_lower for k in ["rally", "trail", "dirt", "offroad", "cross"]):
            road, rally = 0.0, 1.0
        elif "drift" in fn_lower:
            road, drift = 0.0, 1.0
        elif "speed" in fn_lower:
            road, speed = 0.0, 1.0
        elif "touge" in fn_lower:
            road, touge = 0.0, 1.0
        elif "danger" in fn_lower:
            road, danger = 0.0, 1.0
            
        return [road, rally, drift, speed, touge, danger]

    def encode_drivetrain(self, dt_str):
        if not dt_str:
            return 0.5
        dt_str = dt_str.upper()
        if "FWD" in dt_str:
            return 0.0
        elif "RWD" in dt_str:
            return 0.5
        elif "AWD" in dt_str:
            return 1.0
        return 0.5

    def load_data(self):
        if not os.path.exists(self.data_dir):
            print(f"Directory {self.data_dir} does not exist.")
            return

        files = [f for f in os.listdir(self.data_dir) if f.endswith(".json")]
        
        for f in files:
            car_id = self.parse_car_id(f)
            if not car_id:
                continue
                
            tuning_path = os.path.join(self.data_dir, f)
            car_param_path = os.path.join(self.car_params_dir, f"{car_id}.json")
            
            # 若無特定車輛屬性，則使用 default_car.json
            if not os.path.exists(car_param_path):
                car_param_path = os.path.join(self.car_params_dir, "default_car.json")
                if not os.path.exists(car_param_path):
                    continue
            
            try:
                with open(tuning_path, "r", encoding="utf-8") as tf:
                    tuning_data = json.load(tf)
                with open(car_param_path, "r", encoding="utf-8") as cf:
                    car_params = json.load(cf)
            except Exception as e:
                print(f"Error loading {f} or its car params: {e}")
                continue
                
            event_mults = self.classify_event(f)
            self.process_sample(car_params, tuning_data, event_mults)

    def process_sample(self, car_params, tuning_data, event_mults):
        # 1. 提取車輛靜態特徵
        weight = float(car_params.get("weight", 1500.0))
        weight_dist = float(car_params.get("weight_distribution", 50.0)) / 100.0
        front_weight = weight * weight_dist
        rear_weight = weight * (1.0 - weight_dist)
        drivetrain_val = self.encode_drivetrain(car_params.get("drivetrain", "AWD"))
        max_hp = float(car_params.get("maxHp", 400.0))
        max_rpm = float(car_params.get("maxRpm", 7000.0))
        
        # 2. 提取專家調校目標參數 (做合理的安全取值)
        try:
            tires_f = float(tuning_data["tires"]["front"])
            tires_r = float(tuning_data["tires"]["rear"])
            
            gearing_fd = float(tuning_data["gearing"]["finalDrive"])
            
            camber_f = float(tuning_data["alignment"]["camberF"])
            camber_r = float(tuning_data["alignment"]["camberR"])
            toe_f = float(tuning_data["alignment"]["toeF"])
            toe_r = float(tuning_data["alignment"]["toeR"])
            caster = float(tuning_data["alignment"]["caster"])
            
            arb_f = float(tuning_data["arb"]["front"])
            arb_r = float(tuning_data["arb"]["rear"])
            
            spring_f = float(tuning_data["springs"]["front"])
            spring_r = float(tuning_data["springs"]["rear"])
            height_f = float(tuning_data["springs"]["heightF"])
            height_r = float(tuning_data["springs"]["heightR"])
            
            rebound_f = float(tuning_data["damping"]["reboundF"])
            rebound_r = float(tuning_data["damping"]["reboundR"])
            bump_f = float(tuning_data["damping"]["bumpF"])
            bump_r = float(tuning_data["damping"]["bumpR"])
            
            aero_f = float(tuning_data.get("aero", {}).get("front", 100.0))
            aero_r = float(tuning_data.get("aero", {}).get("rear", 100.0))
            
            brake_bias = float(tuning_data.get("brake", {}).get("balance", 50.0))
            brake_pres = float(tuning_data.get("brake", {}).get("pressure", 100.0))
            
            diff_acc_f = float(tuning_data.get("diff", {}).get("accelF", 50.0))
            diff_dec_f = float(tuning_data.get("diff", {}).get("decelF", 0.0))
            diff_acc_r = float(tuning_data.get("diff", {}).get("accelR", 50.0))
            diff_dec_r = float(tuning_data.get("diff", {}).get("decelR", 0.0))
            diff_center = float(tuning_data.get("diff", {}).get("center", 65.0))
        except KeyError as ke:
            print(f"Skipping profile due to missing key: {ke}")
            return

        # 3. 數據增強 (Data Augmentation)
        # 對車重進行隨機微調，並按物理公式縮放彈簧與阻尼，同時加上輕微雜訊
        for _ in range(self.augment_factor):
            # 重量縮放因子在 0.85 ~ 1.15
            gamma = np.random.uniform(0.85, 1.15)
            aug_weight = weight * gamma
            aug_front_weight = front_weight * gamma
            aug_rear_weight = rear_weight * gamma
            
            # 物理縮放：彈簧剛度與重量呈線性關係，阻尼回彈/壓縮與重量平方根或線性呈正相關
            # 這裡彈簧乘以 gamma，阻尼乘以 sqrt(gamma) 來維持阻尼比 (damping ratio)
            aug_spring_f = spring_f * gamma
            aug_spring_r = spring_r * gamma
            aug_rebound_f = rebound_f * np.sqrt(gamma)
            aug_rebound_r = rebound_r * np.sqrt(gamma)
            aug_bump_f = bump_f * np.sqrt(gamma)
            aug_bump_r = bump_r * np.sqrt(gamma)
            
            # 其他非物理線性縮放參數加上 2% 內的輕微白噪聲
            def add_noise(val, scale=0.02):
                return val + np.random.normal(0, abs(val) * scale) if val != 0 else np.random.normal(0, scale)

            aug_tires_f = add_noise(tires_f)
            aug_tires_r = add_noise(tires_r)
            aug_camber_f = add_noise(camber_f)
            aug_camber_r = add_noise(camber_r)
            aug_toe_f = toe_f + np.random.normal(0, 0.02)
            aug_toe_r = toe_r + np.random.normal(0, 0.02)
            aug_caster = add_noise(caster)
            aug_arb_f = add_noise(arb_f)
            aug_arb_r = add_noise(arb_r)
            aug_height_f = add_noise(height_f)
            aug_height_r = add_noise(height_r)
            aug_aero_f = add_noise(aero_f)
            aug_aero_r = add_noise(aero_r)
            
            # 差速器與制動
            aug_diff_acc_f = np.clip(add_noise(diff_acc_f), 0, 100)
            aug_diff_dec_f = np.clip(add_noise(diff_dec_f), 0, 100)
            aug_diff_acc_r = np.clip(add_noise(diff_acc_r), 0, 100)
            aug_diff_dec_r = np.clip(add_noise(diff_dec_r), 0, 100)
            aug_diff_center = np.clip(add_noise(diff_center), 0, 100)
            
            aug_brake_bias = np.clip(add_noise(brake_bias), 30, 70)
            aug_brake_pres = np.clip(add_noise(brake_pres), 50, 150)
            aug_gearing_fd = add_noise(gearing_fd)

            # 建立 8x8 特徵圖
            # 輸入特徵圖 (X)：包含已知的車輛基本資訊 (Row 4) 與賽事目的 (Row 5)，其餘調校欄位在輸入時設為 0，但在目標 (Y) 中則為專家設定值
            # 為了讓 CNN 進行歸納學習，我們輸入 X 包含車輛與賽事資料，輸出 Y 則包含完整的調校特徵圖（包含原本在 X 中已填好的屬性）
            x_map = np.zeros((8, 8), dtype=np.float32)
            y_map = np.zeros((8, 8), dtype=np.float32)
            
            # Row 4 (車輛屬性) - 輸入與輸出一致
            row4 = [aug_weight / 2000.0, weight_dist, aug_front_weight / 1000.0, aug_rear_weight / 1000.0, drivetrain_val, max_rpm / 10000.0, aug_gearing_fd / 5.0, max_hp / 1000.0]
            for col_idx, val in enumerate(row4):
                x_map[3, col_idx] = val
                y_map[3, col_idx] = val
                
            # Row 5 (賽事目的乘數) - 輸入與輸出一致
            row5 = event_mults + [0.0, 0.0]
            for col_idx, val in enumerate(row5):
                x_map[4, col_idx] = val
                y_map[4, col_idx] = val
                
            # 填寫輸出圖 (Y) 的專家調校參數，並進行數值常規化 (Normalization) 以利 CNN 訓練
            # Row 1: Front Psi, Front Spring, Front Rebound, Front Bump, Front Camber, Front Accel, Front Decel, Front Aero
            y_map[0, 0] = aug_tires_f / 3.0
            y_map[0, 1] = aug_spring_f / 1000.0
            y_map[0, 2] = aug_rebound_f / 20.0
            y_map[0, 3] = aug_bump_f / 20.0
            y_map[0, 4] = (aug_camber_f + 5.0) / 10.0  # 使 camber 保持正值
            y_map[0, 5] = aug_diff_acc_f / 100.0
            y_map[0, 6] = aug_diff_dec_f / 100.0
            y_map[0, 7] = aug_aero_f / 500.0
            
            # Row 2: Rear Psi, Rear Spring, Rear Rebound, Rear Bump, Rear Camber, Rear Accel, Rear Decel, Rear Aero
            y_map[1, 0] = aug_tires_r / 3.0
            y_map[1, 1] = aug_spring_r / 1000.0
            y_map[1, 2] = aug_rebound_r / 20.0
            y_map[1, 3] = aug_bump_r / 20.0
            y_map[1, 4] = (aug_camber_r + 5.0) / 10.0
            y_map[1, 5] = aug_diff_acc_r / 100.0
            y_map[1, 6] = aug_diff_dec_r / 100.0
            y_map[1, 7] = aug_aero_r / 500.0
            
            # Row 3: Caster, Front Toe, Rear Toe, Center Bal., Brake Bias, Brake Pres., Height F, Height R
            y_map[2, 0] = aug_caster / 10.0
            y_map[2, 1] = (aug_toe_f + 1.0) / 2.0
            y_map[2, 2] = (aug_toe_r + 1.0) / 2.0
            y_map[2, 3] = aug_diff_center / 100.0
            y_map[2, 4] = aug_brake_bias / 100.0
            y_map[2, 5] = aug_brake_pres / 200.0
            y_map[2, 6] = aug_height_f / 50.0
            y_map[2, 7] = aug_height_r / 50.0
            
            # 為了讓 CNN 易於訓練，我們也把 Row 1~3 的 ARB 資訊嵌入到 Padding 或是對應的位置
            # 這裡我們將 ARB 前後分別嵌入 Row 6 的 0 和 1 位置
            y_map[5, 0] = aug_arb_f / 65.0
            y_map[5, 1] = aug_arb_r / 65.0

            # 轉化為 Tensor
            self.samples.append((
                torch.tensor(x_map, dtype=torch.float32).unsqueeze(0), # (1, 8, 8)
                torch.tensor(y_map, dtype=torch.float32).unsqueeze(0)  # (1, 8, 8)
            ))
            
        print(f"Successfully processed profile with car ID {car_id}, generated {self.augment_factor} augmented samples.")

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        return self.samples[idx]

def get_base_physics_params(weight, weight_dist, drive_type, event_type):
    """
    計算物理學基準參數公式，以作為預測修正比例的基礎
    """
    # 1. 彈簧自然頻率法基礎計算
    # 公路車基準頻率 2.5Hz, 拉力車 1.6Hz, 甩尾車前 3.0Hz 後 2.0Hz
    if event_type == "rally":
        hz_f, hz_r = 1.6, 1.6
    elif event_type == "drift":
        hz_f, hz_r = 3.0, 2.0
    else:
        hz_f, hz_r = 2.5, 2.5
        
    front_weight = weight * weight_dist
    rear_weight = weight * (1.0 - weight_dist)
    
    # 彈簧剛度基準 (K = Hz^2 * Weight / 19.56)
    k_base_f = (hz_f**2 * front_weight) / 19.56
    k_base_r = (hz_r**2 * rear_weight) / 19.56
    
    # 2. 防傾桿基準 (64 * Weight% + 1)
    arb_base_f = 64.0 * weight_dist + 1.0
    arb_base_r = 64.0 * (1.0 - weight_dist) + 1.0
    
    # 3. 阻尼基準 (與彈簧磅數平方根呈正比)
    # 回彈阻尼基準
    rebound_base_f = np.sqrt(k_base_f) * 0.7
    rebound_base_r = np.sqrt(k_base_r) * 0.7
    # 壓縮阻尼為回彈的 60%
    bump_base_f = rebound_base_f * 0.6
    bump_base_r = rebound_base_r * 0.6
    
    return {
        "spring_f": k_base_f,
        "spring_r": k_base_r,
        "arb_f": arb_base_f,
        "arb_r": arb_base_r,
        "rebound_f": rebound_base_f,
        "rebound_r": rebound_base_r,
        "bump_f": bump_base_f,
        "bump_r": bump_base_r
    }
