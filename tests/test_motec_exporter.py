import os
import tempfile

import pytest
from backend.motec_exporter import parse_motec_csv_to_telemetry


def test_parse_motec_csv_missing_file():
    # If the file does not exist, the function returns a FileNotFoundError during open()
    # The try-except block catches it and prints a logger error, but it DOES return the default objects
    session_meta, points = parse_motec_csv_to_telemetry("non_existent_file.csv")
    assert session_meta["session_id"] == "Unknown"
    assert session_meta["car_name"] == "Unknown Vehicle"
    assert points == []


def test_parse_motec_csv_happy_path():
    content = """Format,MoTeC CSV Log File,Version,1.00
Device,FH6 Horizon Tuner Telemetry,Serial,FH6-HORIZON-TUNER
Date,session_123,Time,00:00:00
Driver,Driver,Vehicle,Porsche 911
Venue,Forza Circuit,Comment,Exported Telemetry Session
Sample Rate,10.0

Time,Distance,Lap Number,Speed,Engine RPM,Gear,Throttle Pos,Brake Pos,Steer Pos,G Force Lat,G Force Long,Susp Pos FL,Susp Pos FR,Susp Pos RL,Susp Pos RR,Slip Angle FL,Slip Angle FR,Slip Angle RL,Slip Angle RR,Slip Ratio FL,Slip Ratio FR,Slip Ratio RL,Slip Ratio RR,Tire Temp FL,Tire Temp FR,Tire Temp RL,Tire Temp RR
s,m,,km/h,rpm,,%,%,%,G,G,%,%,%,%,deg,deg,deg,deg,,,,,°C,°C,°C,°C
1.234,10.5,1,100.0,5000,3,100.0,0.0,0.5,1.2,0.8,50.0,50.0,50.0,50.0,5.0,5.0,5.0,5.0,0.1,0.1,0.1,0.1,90.0,90.0,90.0,90.0
"""
    with tempfile.NamedTemporaryFile("w", delete=False, suffix=".csv") as f:
        f.write(content)
        temp_path = f.name

    try:
        session_meta, points = parse_motec_csv_to_telemetry(temp_path)
        assert session_meta["session_id"] == "session_123"
        assert session_meta["car_name"] == "Porsche 911"
        assert len(points) == 1

        p = points[0]
        assert p["time"] == 1.234
        assert p["lap_distance"] == 10.5
        assert p["LapNumber"] == 1
        assert abs(p["SpeedMetersPerSecond"] - (100.0 / 3.6)) < 0.001
        assert p["CurrentEngineRpm"] == 5000
        assert p["Gear"] == 3
        # 100 * 2.55 = 255.0 => int(255.0) => 255 (due to float precision might be 254)
        assert p["AccelInput"] in [254, 255]
        assert p["BrakeInput"] == 0
        assert p["steer_pct"] == 0.5
        assert abs(p["AccelerationX"] - (1.2 * 9.81)) < 0.001
        assert abs(p["AccelerationZ"] - (0.8 * 9.81)) < 0.001
        assert p["SuspTravel"] == [0.5, 0.5, 0.5, 0.5]
        assert abs(p["TireSlipAngle"][0] - (5.0 / 57.29578)) < 0.001
        assert p["TireSlipRatio"] == [0.1, 0.1, 0.1, 0.1]
        assert p["TireTemp"] == [194.0, 194.0, 194.0, 194.0]
    finally:
        os.remove(temp_path)


def test_parse_motec_csv_no_data_parsing():
    content = """Format,MoTeC CSV Log File,Version,1.00
Device,FH6 Horizon Tuner Telemetry,Serial,FH6-HORIZON-TUNER
Date,session_456,Time,00:00:00
Driver,Driver,Vehicle,Ferrari F40
Venue,Forza Circuit,Comment,Exported Telemetry Session
Sample Rate,10.0

Time,Distance
s,m
"""
    with tempfile.NamedTemporaryFile("w", delete=False, suffix=".csv") as f:
        f.write(content)
        temp_path = f.name

    try:
        session_meta, points = parse_motec_csv_to_telemetry(temp_path, parse_data=False)
        assert session_meta["session_id"] == "session_456"
        assert session_meta["car_name"] == "Ferrari F40"
        assert points == []
    finally:
        os.remove(temp_path)


def test_parse_motec_csv_invalid_row_types():
    content = """Format,MoTeC CSV Log File,Version,1.00
Device,FH6 Horizon Tuner Telemetry,Serial,FH6-HORIZON-TUNER
Date,session_invalid,Time,00:00:00
Driver,Driver,Vehicle,Invalid Car
Venue,Forza Circuit,Comment,Exported Telemetry Session
Sample Rate,10.0

Time,Distance,Lap Number,Speed,Engine RPM,Gear,Throttle Pos,Brake Pos,Steer Pos,G Force Lat,G Force Long,Susp Pos FL,Susp Pos FR,Susp Pos RL,Susp Pos RR,Slip Angle FL,Slip Angle FR,Slip Angle RL,Slip Angle RR,Slip Ratio FL,Slip Ratio FR,Slip Ratio RL,Slip Ratio RR,Tire Temp FL,Tire Temp FR,Tire Temp RL,Tire Temp RR
s,m,,km/h,rpm,,%,%,%,G,G,%,%,%,%,deg,deg,deg,deg,,,,,°C,°C,°C,°C
invalid,invalid,invalid,invalid,invalid,invalid,invalid,invalid,invalid,invalid,invalid,invalid,invalid,invalid,invalid,invalid,invalid,invalid,invalid,invalid,invalid,invalid,invalid,invalid,invalid,invalid,invalid
"""
    with tempfile.NamedTemporaryFile("w", delete=False, suffix=".csv") as f:
        f.write(content)
        temp_path = f.name

    try:
        session_meta, points = parse_motec_csv_to_telemetry(temp_path)
        assert len(points) == 1
        p = points[0]
        assert p["time"] == 0.0
        assert p["LapNumber"] == 1
        assert p["SpeedMetersPerSecond"] == 0.0
        assert p["CurrentEngineRpm"] == 0
        assert p["Gear"] == 0
    finally:
        os.remove(temp_path)
