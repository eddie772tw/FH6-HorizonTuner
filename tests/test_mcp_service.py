"""Tests for HorizonTunerMcpService reading and formatting methods."""

import json

import pytest

from backend.mcp.service import HorizonTunerMcpService


@pytest.fixture
def mcp_service(tmp_path):
    # Setup test car database
    car_db = {
        "101": {
            "ordinal": 101,
            "name": "2024 Ford Mustang Dark Horse",
            "drivetrain": "RWD",
            "class": "A",
            "pi": 780,
            "weight_kg": 1750,
            "front_weight_bias": 0.54,
            "max_rpm": 7500,
        },
        "102": {
            "ordinal": 102,
            "name": "2023 Subaru WRX",
            "drivetrain": "AWD",
            "class": "B",
            "pi": 650,
            "weight_kg": 1500,
            "front_weight_bias": 0.58,
            "max_rpm": 6800,
        },
    }
    car_db_file = tmp_path / "car_database.json"
    with open(car_db_file, "w", encoding="utf-8") as f:
        json.dump(car_db, f)

    # Setup settings file
    settings_file = tmp_path / "settings.json"
    with open(settings_file, "w", encoding="utf-8") as f:
        json.dump({"language": "en-us", "speedUnit": "kmh"}, f)

    service = HorizonTunerMcpService(
        data_root=str(tmp_path), resource_root=str(tmp_path)
    )
    service.car_db_path = str(car_db_file)
    return service


def test_driver_cockpit_telemetry_formatting(mcp_service):
    sample = {
        "CurrentEngineRpm": 6500.0,
        "EngineMaxRpm": 7500.0,
        "EngineIdleRpm": 800.0,
        "SpeedMetersPerSecond": 45.0,  # 162 km/h
        "Gear": 4,
        "AccelInput": 255,
        "BrakeInput": 0,
        "SteerInput": 64,
        "ClutchInput": 0,
        "HandBrakeInput": 0,
    }
    res = mcp_service.get_driver_cockpit_telemetry(sample)
    assert res["engine"]["rpm"] == 6500.0
    assert res["transmission"]["gear_display"] == "4"
    assert res["speed"]["kmh"] == 162.0
    assert res["driver_inputs"]["throttle_pct"] == 100.0
    assert res["driver_inputs"]["brake_pct"] == 0.0
    assert res["driver_inputs"]["steer_pct"] > 50.0


def test_vehicle_dynamics_telemetry_formatting(mcp_service):
    sample = {
        "AccelerationX": 9.81 * 1.2,  # 1.2 G lateral
        "AccelerationY": 9.81 * 1.0,  # 1.0 G vertical
        "AccelerationZ": -9.81 * 0.8,  # -0.8 G longitudinal
        "PowerWatts": 350000.0,
        "TorqueNewtons": 500.0,
        "Boost": 101325.0 * 1.5,  # Boost in Pa
        "Yaw": 0.05,
        "Pitch": -0.02,
        "Roll": 0.03,
        "PositionX": 100.0,
        "PositionY": 20.0,
        "PositionZ": 300.0,
    }
    res = mcp_service.get_vehicle_dynamics_telemetry(sample)
    assert res["g_forces"]["lateral_g"] == 1.2
    assert res["g_forces"]["vertical_g"] == 1.0
    assert res["power_train"]["power_kw"] == 350.0
    assert res["power_train"]["power_hp"] > 460.0
    assert res["power_train"]["torque_nm"] == 500.0
    assert res["power_train"]["boost_psi"] > 20.0


def test_tires_status_telemetry_formatting(mcp_service):
    sample = {
        "TireTemp": [200.0, 205.0, 190.0, 192.0],  # Fahrenheit
        "TireSlipAngle": [0.05, 0.06, 0.02, 0.02],
        "TireSlipRatio": [0.08, 0.08, 0.01, 0.01],
    }
    res = mcp_service.get_tires_status_telemetry(sample)
    corners = res["corners"]
    assert "front_left" in corners
    assert "front_right" in corners
    assert "rear_left" in corners
    assert "rear_right" in corners
    assert corners["front_left"]["temp_f"] == 200.0
    assert corners["front_left"]["temp_c"] == round((200.0 - 32.0) * 5.0 / 9.0, 1)
    assert res["summary"]["front_avg_temp_c"] > res["summary"]["rear_avg_temp_c"]


def test_suspension_telemetry_formatting(mcp_service):
    sample = {
        "SuspTravel": [0.45, 0.48, 0.96, 0.50],  # Rear Left bottoming
    }
    res = mcp_service.get_suspension_telemetry(sample)
    assert res["corners"]["front_left"]["is_bottoming"] is False
    assert res["corners"]["rear_left"]["is_bottoming"] is True
    assert res["corners"]["rear_left"]["travel_ratio"] == 0.96


def test_search_cars(mcp_service):
    results = mcp_service.search_cars(query="Mustang")
    assert len(results) == 1
    assert results[0]["name"] == "2024 Ford Mustang Dark Horse"

    awd_cars = mcp_service.search_cars(drivetrain="AWD")
    assert len(awd_cars) == 1
    assert awd_cars[0]["name"] == "2023 Subaru WRX"


def test_tuning_solver_deterministic_output(mcp_service):
    car_params = {
        "weight_kg": 1500,
        "front_weight_bias": 0.54,
        "drivetrain": "RWD",
        "max_rpm": 7500,
    }
    res = mcp_service.run_dev_tuning_solver(car_params, purpose="road")
    setup = res["calculated_setup"]
    assert "anti_roll_bars" in setup
    assert (
        setup["anti_roll_bars"]["front"] > setup["anti_roll_bars"]["rear"]
    )  # 54% front bias
    assert setup["dampers"]["rebound_front"] > setup["dampers"]["bump_front"]


def test_gearing_solver(mcp_service):
    res = mcp_service.run_gearing_solver(
        max_rpm=7500,
        peak_hp_rpm=6800,
        top_speed_kmh=300,
        gears_count=6,
    )
    assert res["gears_count"] == 6
    assert len(res["gears"]) == 6
    assert res["final_drive"] > 0
    assert res["gears"][0]["ratio"] > res["gears"][1]["ratio"]


def test_diagnose_telemetry_handling(mcp_service):
    # Front overheated test
    res = mcp_service.diagnose_telemetry_handling(
        tire_temps=[105.0, 106.0, 85.0, 86.0],
        symptom="understeer_entry",
    )
    assert res["convergence_status"] == "adjustment_required"
    assert any("Front axle overheat" in act for act in res["actionable_directives"])
    assert any("Entry Understeer" in act for act in res["actionable_directives"])


def test_query_capture_window_preserves_time_dimension(mcp_service, tmp_path):
    capture_dir = tmp_path / "calibration"
    capture_dir.mkdir()
    capture_file = capture_dir / "time-series.json"
    capture_file.write_text(
        json.dumps(
            {
                "schemaVersion": "tuning-capture/v1",
                "captureId": "time-series",
                "createdAt": "2026-08-14T00:00:00Z",
                "metadata": {
                    "carOrdinal": 101,
                    "installedParts": [],
                    "surface": "asphalt",
                },
                "samples": [
                    {"timestampMs": 0, "speedKmh": 10.0},
                    {"timestampMs": 100, "speedKmh": 20.0},
                    {"timestampMs": 200, "speedKmh": 30.0},
                    {"timestampMs": 300, "speedKmh": 40.0},
                ],
                "confidence": "in_game_capture",
            }
        ),
        encoding="utf-8",
    )
    mcp_service.calibration_dir = str(capture_dir)

    points = mcp_service.query_capture_window(
        "time-series",
        start_ms=100,
        end_ms=200,
        channels=["timestampMs", "speedKmh"],
        max_samples=10,
    )

    assert points == [
        {"timestampMs": 100, "speedKmh": 20.0},
        {"timestampMs": 200, "speedKmh": 30.0},
    ]
