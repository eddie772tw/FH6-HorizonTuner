#!/usr/bin/env python3
"""
FH6-HorizonTuner - 遙測封包區塊 2 與區塊 3 位元組對照驗證腳本
(Verification Script for Telemetry Block 2 & Block 3 Data Out Offsets)

本腳本用於核對與驗證 324-Byte Forza Data Out 封包在中：
- 方法 A：標準 Dash 官方規範 (Standard Spec Offset)
- 方法 B：目前 telemetry_listener.py 舊解包邏輯 (Current Code Offset)

功能：
1. 建立標準 324 位元組測試封包（包含區塊 1、區塊 2、區塊 3）。
2. 可同時開啟 UDP 監聽模式接收真實遊戲/模擬遙測封包。
3. 對兩種解包方法進行數值解析與物理合理性對比印出。
"""

import sys
import struct
import socket
import argparse
from typing import Dict, Any

# ==============================================================================
# 方法 A：標準 Dash 官方規範解包函數 (Standard Spec: 0~231 / 232~311 / 312~323)
# ==============================================================================
def parse_spec_standard(data: bytes) -> Dict[str, Any]:
    """依照標準規範解析 324 位元組 Data Out 封包"""
    if len(data) < 324:
        return {"error": f"Packet length too short ({len(data)} < 324 bytes)"}

    parsed = {}

    # --- 區塊 1: 遊戲基礎狀態 (0 ~ 231 Bytes) ---
    parsed["IsRaceOn"] = struct.unpack_from("<i", data, 0)[0]
    parsed["TimestampMS"] = struct.unpack_from("<I", data, 4)[0]
    parsed["EngineMaxRpm"] = struct.unpack_from("<f", data, 8)[0]
    parsed["EngineIdleRpm"] = struct.unpack_from("<f", data, 12)[0]
    parsed["CurrentEngineRpm"] = struct.unpack_from("<f", data, 16)[0]
    parsed["Acceleration"] = struct.unpack_from("<fff", data, 20)
    parsed["Velocity"] = struct.unpack_from("<fff", data, 32)
    parsed["AngularVelocity"] = struct.unpack_from("<fff", data, 44)
    parsed["Yaw_Pitch_Roll"] = struct.unpack_from("<fff", data, 56)
    parsed["NormalizedSuspTravel"] = struct.unpack_from("<ffff", data, 68)
    parsed["WheelSlipRatio"] = struct.unpack_from("<ffff", data, 84)
    parsed["WheelRotationSpeed"] = struct.unpack_from("<ffff", data, 100)
    parsed["WheelOnRumbleStrip"] = struct.unpack_from("<iiii", data, 116)
    parsed["WheelInPuddleDepth"] = struct.unpack_from("<ffff", data, 132)
    parsed["SurfaceRumble"] = struct.unpack_from("<ffff", data, 148)
    parsed["WheelSlipAngle"] = struct.unpack_from("<ffff", data, 164)
    parsed["WheelCombinedSlip"] = struct.unpack_from("<ffff", data, 180)
    parsed["SuspensionTravelMeters"] = struct.unpack_from("<ffff", data, 196)
    parsed["CarOrdinal"] = struct.unpack_from("<i", data, 212)[0]
    parsed["CarClass"] = struct.unpack_from("<i", data, 216)[0]
    parsed["CarPI"] = struct.unpack_from("<i", data, 220)[0]
    parsed["DrivetrainType"] = struct.unpack_from("<i", data, 224)[0]
    parsed["NumCylinders"] = struct.unpack_from("<i", data, 228)[0]

    # --- 區塊 2: V2 儀表板擴充欄位 (232 ~ 311 Bytes) ---
    parsed["Position"] = struct.unpack_from("<fff", data, 232)
    parsed["Speed_Mps"] = struct.unpack_from("<f", data, 244)[0]
    parsed["Speed_Kmh"] = parsed["Speed_Mps"] * 3.6
    parsed["Power_Watts"] = struct.unpack_from("<f", data, 248)[0]
    parsed["Power_HP"] = parsed["Power_Watts"] / 745.7
    parsed["Torque_Nm"] = struct.unpack_from("<f", data, 252)[0]
    parsed["TireTemp_F"] = struct.unpack_from("<ffff", data, 256)
    parsed["TireTemp_C"] = tuple((f - 32) * 5 / 9 for f in parsed["TireTemp_F"])
    parsed["Boost_PSI"] = struct.unpack_from("<f", data, 272)[0]
    parsed["Fuel"] = struct.unpack_from("<f", data, 276)[0]
    parsed["DistanceTraveled"] = struct.unpack_from("<f", data, 280)[0]
    parsed["BestLap"] = struct.unpack_from("<f", data, 284)[0]
    parsed["LastLap"] = struct.unpack_from("<f", data, 288)[0]
    parsed["CurrentLap"] = struct.unpack_from("<f", data, 292)[0]
    parsed["CurrentRaceTime"] = struct.unpack_from("<f", data, 296)[0]
    parsed["LapNumber"] = struct.unpack_from("<H", data, 300)[0]
    parsed["RacePosition"] = struct.unpack_from("<B", data, 302)[0]
    parsed["AccelInput"] = struct.unpack_from("<B", data, 303)[0]
    parsed["BrakeInput"] = struct.unpack_from("<B", data, 304)[0]
    parsed["ClutchInput"] = struct.unpack_from("<B", data, 305)[0]
    parsed["HandBrakeInput"] = struct.unpack_from("<B", data, 306)[0]
    parsed["Gear"] = struct.unpack_from("<B", data, 307)[0]
    parsed["Steering"] = struct.unpack_from("<b", data, 308)[0]
    parsed["DrivingLine"] = struct.unpack_from("<b", data, 309)[0]
    parsed["AIPrbBrake"] = struct.unpack_from("<b", data, 310)[0]

    # --- 區塊 3: 尾部增強校驗 (312 ~ 323 Bytes) ---
    parsed["DeltaT"] = struct.unpack_from("<f", data, 312)[0]
    parsed["NormalizedDrivingLine"] = struct.unpack_from("<f", data, 316)[0]
    parsed["DataPacketId"] = struct.unpack_from("<i", data, 320)[0]

    return parsed


# ==============================================================================
# 方法 B：目前 telemetry_listener.py 實作解包函數 (Current Implementation Offset)
# ==============================================================================
def parse_current_code(data: bytes) -> Dict[str, Any]:
    """依照目前 telemetry_listener.py 實作邏輯解析"""
    if len(data) < 232:
        return {"error": "Packet short"}

    parsed = {}
    parsed["IsRaceOn"] = struct.unpack_from("<i", data, 0)[0]
    parsed["TimestampMS"] = struct.unpack_from("<I", data, 4)[0]
    parsed["EngineMaxRpm"] = struct.unpack_from("<f", data, 8)[0]
    parsed["EngineIdleRpm"] = struct.unpack_from("<f", data, 12)[0]
    parsed["CurrentEngineRpm"] = struct.unpack_from("<f", data, 16)[0]
    parsed["Acceleration"] = struct.unpack_from("<fff", data, 20)
    parsed["Velocity"] = struct.unpack_from("<fff", data, 32)
    parsed["CarOrdinal"] = struct.unpack_from("<i", data, 212)[0]
    parsed["CarClass"] = struct.unpack_from("<i", data, 216)[0]

    if len(data) >= 324:
        # 目前程式碼解包位址 (偏移 +12)
        parsed["Position"] = struct.unpack_from("<fff", data, 244)
        parsed["Speed_Mps"] = struct.unpack_from("<f", data, 256)[0]
        parsed["Power_Watts"] = struct.unpack_from("<f", data, 260)[0]
        parsed["Torque_Nm"] = struct.unpack_from("<f", data, 264)[0]
        parsed["TireTemp_F"] = struct.unpack_from("<ffff", data, 268)
        parsed["Boost_PSI"] = struct.unpack_from("<f", data, 284)[0]
        parsed["Fuel"] = struct.unpack_from("<f", data, 288)[0]
        parsed["DistanceTraveled"] = struct.unpack_from("<f", data, 292)[0]
        parsed["BestLap"] = struct.unpack_from("<f", data, 296)[0]
        parsed["LastLap"] = struct.unpack_from("<f", data, 297)[0]  # wait, <fff at 296
        parsed["CurrentLap"] = struct.unpack_from("<f", data, 304)[0]
        parsed["CurrentRaceTime"] = struct.unpack_from("<f", data, 308)[0]
        parsed["LapNumber"] = struct.unpack_from("<H", data, 312)[0]
        parsed["RacePosition"] = struct.unpack_from("<B", data, 314)[0]
        parsed["AccelInput"] = struct.unpack_from("<B", data, 315)[0]
        parsed["BrakeInput"] = struct.unpack_from("<B", data, 316)[0]
        parsed["ClutchInput"] = struct.unpack_from("<B", data, 317)[0]
        parsed["HandBrakeInput"] = struct.unpack_from("<B", data, 318)[0]
        parsed["Gear"] = struct.unpack_from("<B", data, 319)[0]
        parsed["SteerInput"] = struct.unpack_from("<b", data, 320)[0]
        # 區塊 3 (312~323) 目前程式碼未獨立讀取 DeltaT / DataPacketId

    return parsed


# ==============================================================================
# 測試封包產生器 (Synthetic Packet Generator for Demonstration)
# ==============================================================================
def create_synthetic_324_packet() -> bytes:
    """構建符合 Dash 規格標準的 324 位元組測試封包"""
    buf = bytearray(324)

    # 區塊 1 (0 ~ 231)
    struct.pack_into("<i", buf, 0, 1)          # IsRaceOn = 1
    struct.pack_into("<I", buf, 4, 150000)     # TimestampMS = 150000
    struct.pack_into("<f", buf, 8, 8500.0)     # EngineMaxRpm = 8500.0
    struct.pack_into("<f", buf, 12, 900.0)     # EngineIdleRpm = 900.0
    struct.pack_into("<f", buf, 16, 6200.0)    # CurrentEngineRpm = 6200.0
    struct.pack_into("<fff", buf, 20, 0.2, 1.0, 0.5)  # Acceleration
    struct.pack_into("<fff", buf, 32, 10.0, 0.0, 45.0) # Velocity
    struct.pack_into("<i", buf, 212, 3847)     # CarOrdinal = 3847
    struct.pack_into("<i", buf, 216, 4)        # CarClass = 4 (S1)
    struct.pack_into("<i", buf, 220, 899)      # CarPI = 899
    struct.pack_into("<i", buf, 224, 1)        # DrivetrainType = 1 (RWD)

    # 區塊 2 (232 ~ 311)
    struct.pack_into("<fff", buf, 232, 123.4, 45.6, 789.0)  # Position (232~243)
    struct.pack_into("<f", buf, 244, 52.5)                  # Speed = 52.5 m/s (189 km/h) (244~247)
    struct.pack_into("<f", buf, 248, 372850.0)              # Power = 372.85 kW (500 HP) (248~251)
    struct.pack_into("<f", buf, 252, 610.0)                 # Torque = 610 Nm (252~255)
    struct.pack_into("<ffff", buf, 256, 185.0, 186.0, 190.0, 191.0) # TireTemp F (256~271)
    struct.pack_into("<f", buf, 272, 14.7)                  # Boost = 14.7 psi (272~275)
    struct.pack_into("<f", buf, 276, 0.95)                  # Fuel = 0.95 (276~279)
    struct.pack_into("<f", buf, 280, 12500.0)               # DistanceTraveled = 12500 m (280~283)
    struct.pack_into("<f", buf, 284, 62.4)                  # BestLap = 62.4 s (284~287)
    struct.pack_into("<f", buf, 288, 63.1)                  # LastLap = 63.1 s (288~291)
    struct.pack_into("<f", buf, 292, 18.5)                  # CurrentLap = 18.5 s (292~295)
    struct.pack_into("<f", buf, 296, 144.0)                 # CurrentRaceTime = 144 s (296~299)
    struct.pack_into("<H", buf, 300, 3)                     # LapNumber = 3 (300~301)
    struct.pack_into("<B", buf, 302, 1)                     # RacePosition = 1 (302)
    struct.pack_into("<BBBBB", buf, 303, 255, 0, 0, 0, 4)   # Accel=255, Brake=0, Clutch=0, HBK=0, Gear=4 (303~307)
    struct.pack_into("<b", buf, 308, -15)                   # Steering = -15 (308)
    struct.pack_into("<b", buf, 309, 0)                     # DrivingLine = 0 (309)
    struct.pack_into("<b", buf, 310, 0)                     # AIPrbBrake = 0 (310)

    # 區塊 3 (312 ~ 323)
    struct.pack_into("<f", buf, 312, 0.0166)                # DeltaT = 0.0166 s (60Hz) (312~315)
    struct.pack_into("<f", buf, 316, 0.0)                   # NormalizedDrivingLine (316~319)
    struct.pack_into("<i", buf, 320, 1042)                  # DataPacketId = 1042 (320~323)

    return bytes(buf)


# ==============================================================================
# 比對輸出報告生成器
# ==============================================================================
def print_comparison_report(raw_data: bytes, source_label: str = "Synthetic Test Packet"):
    print("=" * 80)
    print(f"  Forza Horizon Data Out 遙測封包區塊 2 / 區塊 3 核對報告")
    print(f"  數據來源: {source_label} | 封包總長度: {len(raw_data)} 位元組")
    print("=" * 80)

    spec = parse_spec_standard(raw_data)
    code = parse_current_code(raw_data)

    print("\n【區塊 2：V2 儀表板擴充欄位 (232 ~ 311 位元組) 比對】")
    print("-" * 80)
    print(f"{'欄位名稱':<22} | {'標準規範 (Spec Method A)':<28} | {'目前實作 (Code Method B)':<28}")
    print("-" * 80)

    comparisons = [
        ("Position (X, Y, Z)", f"({spec['Position'][0]:.1f}, {spec['Position'][1]:.1f}, {spec['Position'][2]:.1f})",
                               f"({code.get('Position', (0,0,0))[0]:.1f}, {code.get('Position', (0,0,0))[1]:.1f}, {code.get('Position', (0,0,0))[2]:.1f})"),
        ("Speed (km/h)", f"{spec['Speed_Kmh']:.2f} km/h ({spec['Speed_Mps']:.1f} m/s)",
                         f"{code.get('Speed_Mps', 0.0)*3.6:.2f} km/h ({code.get('Speed_Mps', 0.0):.1f} m/s)"),
        ("Power (HP)", f"{spec['Power_HP']:.1f} HP ({spec['Power_Watts']:.0f} W)",
                       f"{code.get('Power_Watts', 0.0)/745.7:.1f} HP ({code.get('Power_Watts', 0.0):.0f} W)"),
        ("Torque (N·m)", f"{spec['Torque_Nm']:.1f} N·m", f"{code.get('Torque_Nm', 0.0):.1f} N·m"),
        ("TireTemp (℉)", f"FL:{spec['TireTemp_F'][0]:.0f} FR:{spec['TireTemp_F'][1]:.0f} RL:{spec['TireTemp_F'][2]:.0f} RR:{spec['TireTemp_F'][3]:.0f}",
                         f"FL:{code.get('TireTemp_F', (0,0,0,0))[0]:.0f} FR:{code.get('TireTemp_F', (0,0,0,0))[1]:.0f} RL:{code.get('TireTemp_F', (0,0,0,0))[2]:.0f} RR:{code.get('TireTemp_F', (0,0,0,0))[3]:.0f}"),
        ("Boost (psi)", f"{spec['Boost_PSI']:.2f} psi", f"{code.get('Boost_PSI', 0.0):.2f} psi"),
        ("Fuel (0.0~1.0)", f"{spec['Fuel']:.2f}", f"{code.get('Fuel', 0.0):.2f}"),
        ("DistanceTraveled (m)", f"{spec['DistanceTraveled']:.1f} m", f"{code.get('DistanceTraveled', 0.0):.1f} m"),
        ("BestLap (s)", f"{spec['BestLap']:.2f} s", f"{code.get('BestLap', 0.0):.2f} s"),
        ("LastLap (s)", f"{spec['LastLap']:.2f} s", f"{code.get('LastLap', 0.0):.2f} s"),
        ("CurrentLap (s)", f"{spec['CurrentLap']:.2f} s", f"{code.get('CurrentLap', 0.0):.2f} s"),
        ("CurrentRaceTime (s)", f"{spec['CurrentRaceTime']:.1f} s", f"{code.get('CurrentRaceTime', 0.0):.1f} s"),
        ("LapNumber", f"{spec['LapNumber']}", f"{code.get('LapNumber', 0)}"),
        ("RacePosition", f"{spec['RacePosition']}", f"{code.get('RacePosition', 0)}"),
        ("Accel / Brake Input", f"{spec['AccelInput']} / {spec['BrakeInput']}", f"{code.get('AccelInput', 0)} / {code.get('BrakeInput', 0)}"),
        ("Gear / Steering", f"Gear {spec['Gear']} / Steering {spec['Steering']}", f"Gear {code.get('Gear', 0)} / Steering {code.get('SteerInput', 0)}"),
    ]

    for label, s_val, c_val in comparisons:
        print(f"{label:<22} | {s_val:<28} | {c_val:<28}")

    print("-" * 80)
    print("\n【區塊 3：尾部增強校驗 (312 ~ 323 位元組) 比對】")
    print("-" * 80)
    print(f"{'欄位名稱':<22} | {'標準規範 (Spec Method A)':<28} | {'目前實作 (Code Method B)':<28}")
    print("-" * 80)

    block3_items = [
        ("DeltaT (s)", f"{spec['DeltaT']:.4f} s", "未解析 (Unparsed)"),
        ("NormalizedDrivingLine", f"{spec['NormalizedDrivingLine']:.2f}", "未解析 (Unparsed)"),
        ("DataPacketId", f"{spec['DataPacketId']}", "未解析 (Unparsed)"),
    ]
    for label, s_val, c_val in block3_items:
        print(f"{label:<22} | {s_val:<28} | {c_val:<28}")

    print("-" * 80)
    print("\n【尾部 300 ~ 323 位元組 Raw Hex & Unpack 分析】")
    print("-" * 80)
    tail_bytes = raw_data[300:324]
    print(f"Hex Dump (300-323): {tail_bytes.hex(' ')}")
    
    # Try unpacking as Method A (312~323 spec)
    try:
        f_delta_t = struct.unpack_from("<f", raw_data, 312)[0]
        f_norm_line = struct.unpack_from("<f", raw_data, 316)[0]
        i_packet_id = struct.unpack_from("<i", raw_data, 320)[0]
        print(f"Spec (312-323): DeltaT={f_delta_t}, NormLine={f_norm_line}, PacketID={i_packet_id}")
    except Exception as e:
        print(f"Spec Unpack Error: {e}")

    # Try unpacking as Method B (312~320 code)
    try:
        u_lap = struct.unpack_from("<H", raw_data, 312)[0]
        u_pos = struct.unpack_from("<B", raw_data, 314)[0]
        u_acc = struct.unpack_from("<B", raw_data, 315)[0]
        u_brk = struct.unpack_from("<B", raw_data, 316)[0]
        u_clt = struct.unpack_from("<B", raw_data, 317)[0]
        u_hbk = struct.unpack_from("<B", raw_data, 318)[0]
        u_gear = struct.unpack_from("<B", raw_data, 319)[0]
        s_steer = struct.unpack_from("<b", raw_data, 320)[0]
        s_line = struct.unpack_from("<b", raw_data, 321)[0]
        s_ai_brk = struct.unpack_from("<b", raw_data, 322)[0]
        print(f"Code (312-322): Lap={u_lap}, Pos={u_pos}, Accel={u_acc}, Brake={u_brk}, Clutch={u_clt}, HBK={u_hbk}, Gear={u_gear}, Steer={s_steer}, Line={s_line}, AIBrk={s_ai_brk}")
    except Exception as e:
        print(f"Code Unpack Error: {e}")

    print("=" * 80)


# ==============================================================================
# 實時多封包掃描引擎 (Field Address Scanner for DeltaT & DataPacketId)
# ==============================================================================
def scan_packets_for_tail_fields(port: int, count: int = 15, timeout: float = 5.0):
    """收集多個連續 Live UDP 封包並全面掃描全封包 Offset，尋找 DeltaT, DataPacketId, DrivingLine 候選位址"""
    print(f"\n" + "=" * 80)
    print(f"  [實時多封包連貫掃描引擎] 監聽 Port {port}，收集 {count} 個連續封包進行 Offset 探測...")
    print("=" * 80)

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind(("0.0.0.0", port))
    sock.settimeout(timeout)

    packets = []
    try:
        while len(packets) < count:
            data, addr = sock.recvfrom(2048)  # 使用 2048 Bytes 緩衝區探測實際接收大小
            if len(data) >= 232:
                packets.append((data, addr))
    except socket.timeout:
        print(f"\n[警告] 收集封包超時，僅接收到 {len(packets)} 個封包。")
    except Exception as e:
        print(f"\n[錯誤] UDP 接收失敗: {e}")
    finally:
        sock.close()

    if not packets:
        print("\n未接收到任何有效 UDP 封包，無法執行掃描。")
        return

    pkt_lens = set(len(p[0]) for p in packets)
    print(f"\n成功收集 {len(packets)} 個封包！接收位元組長度集合: {pkt_lens} Bytes")
    min_len = min(len(p[0]) for p in packets)

    # 1. 探測遞增 DataPacketId (要求所有連續封包在該 Offset 的 Int32 值精確 +1 遞增)
    packet_id_candidates = []
    for offset in range(0, min_len - 3):
        is_seq = True
        first_val = struct.unpack_from("<i", packets[0][0], offset)[0]
        for idx in range(1, len(packets)):
            curr_val = struct.unpack_from("<i", packets[idx][0], offset)[0]
            prev_val = struct.unpack_from("<i", packets[idx-1][0], offset)[0]
            if curr_val != prev_val + 1:
                is_seq = False
                break
        if is_seq:
            packet_id_candidates.append((offset, first_val, first_val + len(packets) - 1))

    # 2. 探測 DeltaT (要求所有連續封包在該 Offset 的 Float32 值在 0.005 ~ 0.050 秒之間，即 20Hz~200Hz)
    deltat_candidates = []
    for offset in range(0, min_len - 3):
        is_deltat = True
        vals = []
        for p in packets:
            val = struct.unpack_from("<f", p[0], offset)[0]
            if not (0.005 <= val <= 0.050):
                is_deltat = False
                break
            vals.append(val)
        if is_deltat:
            avg_val = sum(vals) / len(vals)
            deltat_candidates.append((offset, avg_val, vals[0]))

    # 3. 探測 TimestampMS 計算得到的 DeltaT 參考值
    ts_diffs = []
    for idx in range(1, len(packets)):
        t_prev = struct.unpack_from("<I", packets[idx-1][0], 4)[0]
        t_curr = struct.unpack_from("<I", packets[idx][0], 4)[0]
        ts_diffs.append((t_curr - t_prev) / 1000.0)
    avg_frame_time = sum(ts_diffs) / len(ts_diffs) if ts_diffs else 0.0

    print("\n【探測結果 1：DataPacketId (連續 +1 遞增 Int32 欄位)】")
    print("-" * 80)
    if packet_id_candidates:
        for off, start_v, end_v in packet_id_candidates:
            print(f"-> 發現候選 Offset {off} (0x{off:03X}): 數值 {start_v} -> {end_v} (精確 +1 遞增)")
    else:
        print("  未發現任何呈 +1 遞增的 Int32/UInt32 欄位。")

    print("\n【探測結果 2：DeltaT (0.005s ~ 0.050s 之 Float32 模擬時間間隔欄位)】")
    print(f"註：由 TimestampMS (Offset 4) 計算得出的實際影格間隔平均值為: {avg_frame_time:.6f} 秒")
    print("-" * 80)
    if deltat_candidates:
        for off, avg_v, sample_v in deltat_candidates:
            print(f"-> 發現候選 Offset {off} (0x{off:03X}): 平均值 {avg_v:.6f} s (範例: {sample_v:.6f} s)")
    else:
        print("  未在封包任何 Offset 發現數值界於 0.005s ~ 0.050s 之間的固定/動態 Float32 欄位。")

    print("\n【探測結果 3：全封包末端 (232 ~ 末尾) Float32 欄位快照】")
    print("-" * 80)
    print(f"{'Offset':<10} | {'Float32 數值':<20} | {'Int32 數值':<15} | {'說明/備註':<25}")
    print("-" * 80)
    sample_pkt = packets[0][0]
    for off in range(232, min_len - 3, 4):
        f_val = struct.unpack_from("<f", sample_pkt, off)[0]
        i_val = struct.unpack_from("<i", sample_pkt, off)[0]
        note = ""
        if off == 244: note = "PositionX (實測)"
        elif off == 256: note = "Speed (實測)"
        elif off == 260: note = "Power (實測)"
        elif off == 264: note = "Torque (實測)"
        elif off == 268: note = "TireTemp FL (實測)"
        elif off == 284: note = "Boost (實測)"
        elif off == 288: note = "Fuel (實測)"
        elif off == 292: note = "DistanceTraveled (實測)"
        elif off == 296: note = "BestLap (實測)"
        elif off == 308: note = "CurrentRaceTime (實測)"
        print(f"Offset {off:<3} (0x{off:02X}) | {f_val:<20.6f} | {i_val:<15} | {note}")

    print("=" * 80)


# ==============================================================================
# 主程式：提供線下測試與 Live UDP 監聽兩種模式
# ==============================================================================
def main():
    parser = argparse.ArgumentParser(description="Forza Horizon Telemetry Block 2 & 3 Verification Tool")
    parser.add_argument("--live", action="store_true", help="開啟實時 UDP 監聽模式 (預設監聽 127.0.0.1:20440)")
    parser.add_argument("--scan", action="store_true", help="開啟全封包 Offset 探測掃描模式 (尋找 DeltaT, DataPacketId)")
    parser.add_argument("--port", type=int, default=20440, help="UDP 監聽埠號 (預設: 20440)")
    args = parser.parse_args()

    if args.scan:
        scan_packets_for_tail_fields(port=args.port, count=15)
    elif args.live:
        print(f"\n[模式 2: 實時 UDP 監聽模式 (UDP Port: {args.port})]")
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.bind(("0.0.0.0", args.port))
        sock.settimeout(5.0)
        print(f"正在等待 Forza 遊戲 UDP 遙測封包 (5 秒超時)...")
        try:
            while True:
                data, addr = sock.recvfrom(1024)
                if len(data) >= 232:
                    print_comparison_report(data, source_label=f"Live UDP from {addr[0]}:{addr[1]}")
                    break
        except socket.timeout:
            print(f"\n[提示] 5 秒內未在 UDP {args.port} 埠接收到遙測封包。")
        except KeyboardInterrupt:
            print("\n已中斷 UDP 監聽。")



if __name__ == "__main__":
    main()
