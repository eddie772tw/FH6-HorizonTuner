import os
import argparse
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, random_split
from data_loader import TuningDataset
from model import TuningCNN

def get_device():
    """
    動態檢測並設定硬體加速裝置 (支援 NVIDIA CUDA 與 AMD ROCm)
    """
    if torch.cuda.is_available():
        # ROCm 雖然驅動底層為 HIP，但 PyTorch API 仍將其歸類為 cuda
        # 可以檢查 hasattr(torch.version, 'hip') 來識別是否為 AMD ROCm 架構
        is_rocm = hasattr(torch.version, 'hip') and torch.version.hip is not None
        device_name = "AMD ROCm/HIP" if is_rocm else "NVIDIA CUDA"
        print(f"[Hardware] GPU Accelerated Device Detected: {device_name}")
        return torch.device("cuda")
    else:
        print("[Hardware] GPU not detected. Falling back to CPU.")
        return torch.device("cpu")

def physics_informed_loss(pred_y, target_y, mse_criterion, lambda_phys=0.1):
    """
    物理先驗約束損失函數。
    pred_y, target_y 的 shape 皆為 (batch_size, 1, 8, 8)，數值已被 Sigmoid 限制在 [0, 1] 之間。
    """
    # 1. 基礎數據擬合損失 (MSE)
    mse_loss = mse_criterion(pred_y, target_y)
    
    # 2. 物理先驗限制懲罰
    # 在我們的特徵圖中：
    # Row 1 (前軸): y_map[0, 2] = ReboundF / 20.0, y_map[0, 3] = BumpF / 20.0
    # Row 2 (後軸): y_map[1, 2] = ReboundR / 20.0, y_map[1, 3] = BumpR / 20.0
    # 物理限制：壓縮阻尼 (Bump) 必須小於回彈阻尼 (Rebound)。意即 Bump / 20.0 < Rebound / 20.0
    rebound_f = pred_y[:, 0, 0, 2]
    bump_f = pred_y[:, 0, 0, 3]
    rebound_r = pred_y[:, 0, 1, 2]
    bump_r = pred_y[:, 0, 1, 3]
    
    # 如果 Bump > Rebound，則計算懲罰值 (使用 ReLU)
    penalty_f = torch.relu(bump_f - rebound_f)
    penalty_r = torch.relu(bump_r - rebound_r)
    
    # 後輪驅動 (RWD) 時，如果 accelR < decelR (不符合物理常識)，加入額外懲罰
    # RWD 判定在 Row 4 的 Col 4 (drivetrain_val)，0.5 代表 RWD
    dt_val = pred_y[:, 0, 3, 4]
    accel_r = pred_y[:, 0, 1, 5]
    decel_r = pred_y[:, 0, 1, 6]
    penalty_diff = torch.where(dt_val == 0.5, torch.relu(decel_r - accel_r), torch.zeros_like(decel_r))
    
    physics_penalty = torch.mean(penalty_f + penalty_r + penalty_diff)
    
    # 總損失
    total_loss = mse_loss + lambda_phys * physics_penalty
    return total_loss, mse_loss, physics_penalty

def train_model(epochs, batch_size, data_dir, car_params_dir, lr):
    device = get_device()
    
    print("[Data] Loading expert profiles and preparing dataset...")
    # 載入數據，設定增強倍率為 50
    dataset = TuningDataset(data_dir=data_dir, car_params_dir=car_params_dir, augment_factor=50)
    
    if len(dataset) == 0:
        print("[Error] No valid expert profiles found in the specified directory.")
        return
        
    # 劃分 80% 訓練集，20% 驗證集
    train_size = int(0.8 * len(dataset))
    val_size = len(dataset) - train_size
    train_dataset, val_dataset = random_split(dataset, [train_size, val_size])
    
    train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=batch_size, shuffle=False)
    
    print(f"[Data] Dataset loaded. Train samples: {len(train_dataset)}, Val samples: {len(val_dataset)}")
    
    # 初始化小型 CNN 模型與優化器
    model = TuningCNN().to(device)
    optimizer = optim.Adam(model.parameters(), lr=lr)
    mse_criterion = nn.MSELoss()
    
    best_val_loss = float("inf")
    model_save_path = "ml_helper/best_tuning_cnn.pth"
    
    print("[Training] Starting epochs training...")
    for epoch in range(epochs):
        model.train()
        train_total_loss = 0.0
        train_mse_loss = 0.0
        
        for inputs, targets in train_loader:
            inputs, targets = inputs.to(device), targets.to(device)
            
            optimizer.zero_grad()
            outputs = model(inputs)
            
            loss, mse_l, phys_p = physics_informed_loss(outputs, targets, mse_criterion)
            loss.backward()
            optimizer.step()
            
            train_total_loss += loss.item() * inputs.size(0)
            train_mse_loss += mse_l.item() * inputs.size(0)
            
        train_total_loss /= len(train_dataset)
        train_mse_loss /= len(train_dataset)
        
        # 驗證步驟
        model.eval()
        val_total_loss = 0.0
        val_mse_loss = 0.0
        val_phys_p = 0.0
        
        with torch.no_grad():
            for inputs, targets in val_loader:
                inputs, targets = inputs.to(device), targets.to(device)
                outputs = model(inputs)
                loss, mse_l, phys_p = physics_informed_loss(outputs, targets, mse_criterion)
                
                val_total_loss += loss.item() * inputs.size(0)
                val_mse_loss += mse_l.item() * inputs.size(0)
                val_phys_p += phys_p.item() * inputs.size(0)
                
        val_total_loss /= len(val_dataset)
        val_mse_loss /= len(val_dataset)
        val_phys_p /= len(val_dataset)
        
        if (epoch + 1) % 10 == 0 or epoch == 0:
            print(f"Epoch [{epoch+1}/{epochs}] | Train Loss: {train_total_loss:.6f} (MSE: {train_mse_loss:.6f}) | Val Loss: {val_total_loss:.6f} (MSE: {val_mse_loss:.6f}, Phys Penalty: {val_phys_p:.6f})")
            
        # 儲存最佳模型
        if val_total_loss < best_val_loss:
            best_val_loss = val_total_loss
            os.makedirs(os.path.dirname(model_save_path), exist_ok=True)
            torch.save(model.state_dict(), model_save_path)
            
    print(f"[Success] Model training completed. Best Val Loss: {best_val_loss:.6f}")
    print(f"[Success] Best model state saved to {model_save_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Physics-Informed Tuning CNN Trainer")
    parser.add_argument("--epochs", type=int, default=100, help="Number of training epochs")
    parser.add_argument("--batch_size", type=int, default=16, help="Batch size for training")
    parser.add_argument("--data_dir", type=str, default="backend/tunings", help="Directory containing expert tunings")
    parser.add_argument("--car_params_dir", type=str, default="backend/car_params", help="Directory containing car parameters")
    parser.add_argument("--lr", type=float, default=0.001, help="Learning rate")
    
    args = parser.parse_args()
    train_model(args.epochs, args.batch_size, args.data_dir, args.car_params_dir, args.lr)
