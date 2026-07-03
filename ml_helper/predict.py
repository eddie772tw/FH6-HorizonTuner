import os
import json
import argparse
import numpy as np
import torch
from data_loader import get_base_physics_params
from model import TuningCNN, decode_tuning_image

def get_device():
    if torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")

def encode_drivetrain(dt_str):
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

def get_event_multipliers(event_str):
    event_str = event_str.lower()
    road, rally, drift, speed, touge, danger = 0.0, 0.0, 0.0, 0.0, 0.0, 0.0
    
    if event_str == "rally":
        rally = 1.0
    elif event_str == "drift":
        drift = 1.0
    elif event_str == "speed":
        speed = 1.0
    elif event_str == "touge":
        touge = 1.0
    elif event_str == "danger":
        danger = 1.0
    else:
        road = 1.0  # 預設公路賽
        
    return [road, rally, drift, speed, touge, danger]

def predict_tuning(args):
    device = get_device()
    model_path = "ml_helper/best_tuning_cnn.pth"
    
    # 1. 取得車輛特徵參數
    car_id = args.car_id
    weight = args.weight
    weight_dist = args.weight_dist
    drivetrain = args.drive
    max_hp = args.max_hp
    max_rpm = args.max_rpm
    gearing_fd = args.gearing_fd
    
    # 如果指定了 car_id，嘗試從檔案讀取
    if car_id:
        car_json_path = f"backend/car_params/{car_id}.json"
        if os.path.exists(car_json_path):
            try:
                with open(car_json_path, "r", encoding="utf-8") as f:
                    car_data = json.load(f)
                weight = float(car_data.get("weight", weight))
                weight_dist = float(car_data.get("weight_distribution", weight_dist * 100.0)) / 100.0
                drivetrain = car_data.get("drivetrain", drivetrain)
                max_hp = float(car_data.get("maxHp", max_hp))
                max_rpm = float(car_data.get("maxRpm", max_rpm))
                print(f"[Info] Successfully loaded properties for car ID {car_id} from database.")
            except Exception as e:
                print(f"[Warning] Failed to load car parameter file: {e}. Using command line values instead.")
        else:
            print(f"[Warning] Car ID {car_id} parameter file not found. Using default/CLI values.")
    else:
        car_id = "CustomCar"

    # 車重計算
    front_weight = weight * weight_dist
    rear_weight = weight * (1.0 - weight_dist)
    drivetrain_val = encode_drivetrain(drivetrain)
    event_mults = get_event_multipliers(args.event)
    
    # 2. 建立輸入的 8x8 特徵圖
    x_map = np.zeros((8, 8), dtype=np.float32)
    # Row 4 (車輛屬性)
    row4 = [weight / 2000.0, weight_dist, front_weight / 1000.0, rear_weight / 1000.0, drivetrain_val, max_rpm / 10000.0, gearing_fd / 5.0, max_hp / 1000.0]
    for col_idx, val in enumerate(row4):
        x_map[3, col_idx] = val
        
    # Row 5 (賽事特徵)
    row5 = event_mults + [0.0, 0.0]
    for col_idx, val in enumerate(row5):
        x_map[4, col_idx] = val
        
    # 轉為 Tensor (1, 1, 8, 8)
    input_tensor = torch.tensor(x_map, dtype=torch.float32).unsqueeze(0).unsqueeze(0).to(device)
    
    # 3. 載入模型並預測
    model = TuningCNN().to(device)
    if os.path.exists(model_path):
        model.load_state_dict(torch.load(model_path, map_location=device))
        print(f"[Inference] Loaded trained model weights from {model_path}")
    else:
        print(f"[Warning] Trained weights {model_path} not found! Model will use random initialization for demonstration.")
        print("[Tip] Run 'python ml_helper/train.py' first to train the model on expert profiles.")
        
    model.eval()
    with torch.no_grad():
        output_tensor = model(input_tensor)
        
    # 將預測結果轉換回 Numpy (8, 8)
    y_map = output_tensor.squeeze().cpu().numpy()
    
    # 4. 計算物理基準
    base_params = get_base_physics_params(weight, weight_dist, drivetrain, args.event)
    
    # 5. 解碼生成最終調校參數
    predicted_tuning = decode_tuning_image(y_map, weight, weight_dist, base_params)
    
    # 6. 生成變速箱齒比 (變速箱齒比常為特定陣列，若模型無法精準生成，此處給予合理的專家齒比基礎設定)
    predicted_tuning["gearing"] = {
        "finalDrive": round(gearing_fd, 2),
        "gears": [4.14, 2.82, 2.10, 1.67, 1.41, 1.25, 0.65, 0.55, 0.50, 0.45],
        "maxRpm": int(max_rpm)
    }
    
    # 7. 輸出結果至 JSON 檔案
    output_dir = "backend/tunings"
    os.makedirs(output_dir, exist_ok=True)
    save_filename = f"{car_id}-ML_Optimized.json"
    save_path = os.path.join(output_dir, save_filename)
    
    try:
        with open(save_path, "w", encoding="utf-8") as out_file:
            json.dump(predicted_tuning, out_file, indent=4)
        print(f"\n[Success] Generated optimized expert tuning profile for {args.event} event.")
        print(f"[Success] Saved tuning file to: {save_path}")
    except Exception as e:
        print(f"[Error] Failed to save predicted tuning file: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Tuning CNN Predictor CLI")
    parser.add_argument("--car_id", type=str, default=None, help="Car ID to load parameters from database")
    parser.add_argument("--weight", type=float, default=1500.0, help="Car weight in kilograms")
    parser.add_argument("--weight_dist", type=float, default=0.50, help="Front weight distribution (0.0 to 1.0)")
    parser.add_argument("--drive", type=str, default="AWD", choices=["AWD", "RWD", "FWD"], help="Drivetrain type")
    parser.add_argument("--max_hp", type=float, default=400.0, help="Maximum horsepower")
    parser.add_argument("--max_rpm", type=float, default=7000.0, help="Maximum engine RPM")
    parser.add_argument("--gearing_fd", type=float, default=3.5, help="Final drive ratio")
    parser.add_argument("--event", type=str, default="road", choices=["road", "rally", "drift", "speed", "touge", "danger"], help="Event tuning style target")
    
    args = parser.parse_args()
    predict_tuning(args)
