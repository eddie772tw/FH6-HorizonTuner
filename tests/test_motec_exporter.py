"""Unit tests for MoTeC Exporter, GPS Projection, and Session Debrief Engine."""

import csv
import os
import sys
import tempfile

import pytest

sys.path.insert(
    0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
)

from motec_exporter import (
    calculate_session_debrief,
    export_session_to_motec_csv,
    parse_motec_csv_to_telemetry,
    position_to_gps,
)
from motec_template import generate_motec_workspace_xml


def test_position_to_gps_conversion():
    lat, lon, alt = position_to_gps(0.0, 100.0, 0.0)
    assert abs(lat - 19.432608) < 1e-4
    assert abs(lon - (-99.133209)) < 1e-4
    assert alt == 100.0

    # Moving 111139m North should increase Lat by 1 deg
    lat_n, lon_n, _ = position_to_gps(0.0, 0.0, 111139.0)
    assert abs(lat_n - (19.432608 + 1.0)) < 1e-4


def test_motec_workspace_template_xml():
    xml = generate_motec_workspace_xml("Test HorizonTuner Workspace")
    assert "<?xml version=" in xml
    assert "<MoTeCWorkspace" in xml
    assert "Test HorizonTuner Workspace" in xml
    assert "Driver &amp; Dynamics" in xml
    assert "Suspension &amp; Travel" in xml
    assert "Tires &amp; Slip Dynamics" in xml
    assert "Engine &amp; Gearing" in xml
    assert "Track Map &amp; GPS" in xml


def test_calculate_session_debrief_optimal():
    points = [
        {
            "LapNumber": 1,
            "TireTemp": [185.0, 185.0, 185.0, 185.0],
            "SuspTravel": [0.4, 0.4, 0.45, 0.45],
            "AccelerationX": 0.0,
            "SpeedMetersPerSecond": 25.0,
            "TireSlipAngle": [0.05, 0.05, 0.05, 0.05],
        }
        for _ in range(20)
    ]
    debrief = calculate_session_debrief(points)
    assert debrief["total_samples"] == 20
    assert debrief["valid_laps"] == 1
    assert debrief["tire_thermals"]["status"] == "Optimal"
    assert debrief["suspension"]["bottom_out_count"] == 0
    assert debrief["suspension"]["status"] == "Optimal"
    assert "Neutral" in debrief["handling_balance"]["tendency"]


def test_calculate_session_debrief_bottom_out_and_understeer():
    points = [
        {
            "LapNumber": 1,
            "TireTemp": [240.0, 240.0, 240.0, 240.0],  # Overheating
            "SuspTravel": [0.96, 0.96, 0.5, 0.5],  # Bottoming out
            "AccelerationX": 4.5,  # ~0.46G Lat
            "SpeedMetersPerSecond": 30.0,
            "TireSlipAngle": [
                0.15,
                0.15,
                0.05,
                0.05,
            ],  # Front slip >> Rear slip (Understeer)
        }
        for _ in range(15)
    ]
    debrief = calculate_session_debrief(points)
    assert debrief["tire_thermals"]["status"] == "Overheating"
    assert debrief["suspension"]["bottom_out_count"] > 10
    assert debrief["suspension"]["status"] == "Severe Bottoming"
    assert debrief["handling_balance"]["understeer_pct"] > 70.0
    assert debrief["handling_balance"]["tendency"] == "Understeer Biased"


def test_full_41_channel_export_and_parse_roundtrip():
    session_meta = {
        "session_id": "test_41_ch_session",
        "car_name": "Ferrari 488 Pista",
    }
    sample_points = [
        {
            "time": 1.25,
            "lap_distance": 150.0,
            "LapNumber": 2,
            "SpeedMetersPerSecond": 55.5,
            "CurrentEngineRpm": 7200,
            "Gear": 4,
            "AccelInput": 255,
            "BrakeInput": 0,
            "ClutchInput": 0,
            "HandBrakeInput": 0,
            "steer_pct": -15.0,
            "AccelerationX": 4.2,
            "AccelerationY": 0.5,
            "AccelerationZ": 6.8,
            "Boost": 18.5 * 6894.75729,
            "Fuel": 0.85,
            "PowerWatts": 500000.0,
            "Power": 500000.0,
            "TorqueNewtons": 650.0,
            "Torque": 650.0,
            "SuspTravel": [0.55, 0.52, 0.48, 0.46],
            "SuspensionTravelMeters": [0.08, 0.075, 0.07, 0.068],
            "TireSlipAngle": [0.08, 0.08, 0.05, 0.05],
            "TireSlipRatio": [0.02, 0.02, 0.01, 0.01],
            "TireTemp": [195.0, 192.0, 198.0, 196.0],
            "PositionX": 250.0,
            "PositionY": 15.0,
            "PositionZ": 500.0,
        }
    ]

    with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as tmp:
        csv_path = tmp.name

    try:
        success = export_session_to_motec_csv(session_meta, sample_points, csv_path)
        assert success is True
        assert os.path.exists(csv_path)

        # Check CSV content contains 41 headers
        with open(csv_path, "r", encoding="utf-8") as f:
            lines = f.readlines()
            # Line 7 is header row
            headers = [h.strip() for h in lines[7].split(",")]
            assert "Ground Speed" in headers
            assert "GPS Latitude" in headers
            assert "GPS Longitude" in headers
            assert "Engine Power" in headers
            assert "Boost Pressure" in headers
            assert len(headers) >= 40

        # Parse back
        meta, parsed_points = parse_motec_csv_to_telemetry(csv_path)
        assert meta["session_id"] == "test_41_ch_session"
        assert meta["car_name"] == "Ferrari 488 Pista"
        assert len(parsed_points) == 1
        assert parsed_points[0]["CurrentEngineRpm"] == 7200
        assert parsed_points[0]["Gear"] == 4
        assert parsed_points[0]["PowerWatts"] == pytest.approx(500000.0, rel=1e-3)
        assert parsed_points[0]["TorqueNewtons"] == pytest.approx(650.0, rel=1e-3)
        assert parsed_points[0]["Boost"] == pytest.approx(18.5 * 6894.75729, rel=1e-2)
    finally:
        if os.path.exists(csv_path):
            os.remove(csv_path)


def test_export_uses_canonical_power_and_boost_fields(tmp_path):
    point = {
        "PowerWatts": 745700.0,
        "TorqueNewtons": 500.0,
        "Boost": 6894.75729,
        "Fuel": 0.42,
        "TireTemp": [180] * 4,
        "SuspTravel": [0] * 4,
    }
    export_session_to_motec_csv({"session_id": "s"}, [point], str(tmp_path / "s.csv"))
    row = list(csv.reader((tmp_path / "s.csv").open()))[9]
    assert row[16] == "1000.0"
    assert row[17] == "500.0"
    assert row[14] == "1.00"


def test_debrief_converts_midrange_fahrenheit():
    result = calculate_session_debrief(
        [{"TireTemp": [140.0] * 4, "SuspTravel": [0.0] * 4}]
    )
    assert result["tire_thermals"]["fl_avg"] == pytest.approx(60.0)
    assert result["tire_thermals"]["status"] == "Cold"


def test_saved_points_retain_full_export_channels(tmp_path):
    from telemetry_sqlite import TelemetrySQLite

    db = TelemetrySQLite(str(tmp_path / "telemetry.sqlite"))
    db.create_session("s", start_time=1)
    db.insert_points_batch(
        "s",
        [
            {
                "PowerWatts": 745700,
                "TorqueNewtons": 500.0,
                "Boost": 6894.75729,
                "SuspensionTravelMeters": [0.1] * 4,
                "TireTemp": [180] * 4,
            }
        ],
    )
    point = db.get_telemetry_points("s")[0]
    assert point["PowerWatts"] == 745700
    assert point["SuspensionTravelMeters"] == [0.1] * 4
    assert point["TorqueNewtons"] == 500.0
    assert point["Boost"] == pytest.approx(6894.75729)
