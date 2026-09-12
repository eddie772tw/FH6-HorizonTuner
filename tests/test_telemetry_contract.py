import math

from telemetry_contract import DECODED_POINT_SCHEMA, decoded_point
from telemetry_sqlite import TelemetrySQLite


def test_decoded_boundary_preserves_small_inputs_normalized_slip_and_missing_wheels():
    source = {
        "TimestampMS": 1200,
        "LapNumber": 0,
        "CurrentLap": 1.2,
        "AccelInput": 1,
        "SteerInput": -1,
        "AccelerationX": -0.03,
        "TireSlipAngle": [0.1, -0.2, 12.0, -12.0],
        "TireTemp": [180, None, math.nan],
        "NormalizedSuspensionTravel": [0.95, 0.2, 0.3, 0.4],
    }
    point = decoded_point(source)
    assert point["sourceSchema"] == DECODED_POINT_SCHEMA
    assert point["AccelerationX"] == -0.03
    assert point["AccelInput"] == 1
    assert point["SteerInput"] == -1
    assert point["TireSlipAngle"] == source["TireSlipAngle"]
    assert point["TireTemp"] == [180, None, None, None]
    assert point["LapNumber"] == 0
    assert point["CurrentLap"] == 1.2
    assert point["SuspTravel"] == source["NormalizedSuspensionTravel"]
    assert math.isnan(source["TireTemp"][2])


def test_new_sqlite_points_round_trip_without_unit_guessing(tmp_path):
    db = TelemetrySQLite(str(tmp_path / "telemetry.db"))
    db.create_session("roundtrip", start_time=1)
    source = {
        "LapNumber": 0,
        "CurrentLap": 0.1,
        "LastLap": 60.12,
        "TimestampMS": 100,
        "time": 0.1,
        "AccelInput": 1,
        "SteerInput": -1,
        "AccelerationX": 0.2,
        "TireSlipAngle": [-12, 12, -0.01, 0.01],
        "TireTemp": [None, 185],
        "NormalizedSuspensionTravel": [0.1, 0.2, 0.3, 0.4],
    }
    db.insert_points_batch("roundtrip", [source])
    loaded = db.get_telemetry_points("roundtrip")
    assert loaded == [decoded_point(source)]
    assert db.get_telemetry_points("roundtrip", lap_number=0) == loaded
    assert db.get_telemetry_points("roundtrip", lap_number=1) == []


def test_capture_declares_all_missing_extra_channels():
    from tuning_capture import capture_sample

    sample = capture_sample({"TimestampMS": 100, "WheelRotationSpeed": [0, None, 2, 3]})
    assert sample["timestampMS"] == 100
    assert sample["powerWatts"] is None
    assert sample["angularVelocity"] == [None, None, None]
    assert sample["wheelRotationSpeed"] == [0, None, 2, 3]
    assert {
        "PowerWatts",
        "AngularVelocityX",
        "AngularVelocityY",
        "AngularVelocityZ",
        "WheelRotationSpeed.1",
        "WheelOnRumbleStrip.0",
        "SuspensionTravelMeters.3",
    } <= set(sample["missingChannels"])
    assert "WheelRotationSpeed.0" not in sample["missingChannels"]
    assert "TimestampMS" not in sample["missingChannels"]
