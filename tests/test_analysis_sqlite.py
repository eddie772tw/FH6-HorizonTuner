import os
import tempfile

import pytest
from motec_exporter import calculate_session_debrief, export_session_to_motec_csv
from telemetry_sqlite import TelemetrySQLite


@pytest.fixture
def temp_sqlite_db():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        db_path = tmp.name

    db = TelemetrySQLite(db_path)
    yield db

    # Cleanup
    if os.path.exists(db_path):
        try:
            os.remove(db_path)
        except Exception:
            pass


def test_sqlite_session_and_points(temp_sqlite_db):
    db = temp_sqlite_db
    session_id = "test_session_001"

    # Create session
    db.create_session(
        session_id=session_id, car_name="2020 Porsche 911 GT3", start_time=1000.0
    )

    # Insert batch points
    sample_points = [
        {
            "time": 0.1,
            "LapNumber": 1,
            "DistanceTraveled": 10.0,
            "SpeedMetersPerSecond": 30.0,
            "CurrentEngineRpm": 4000,
            "Gear": 3,
            "AccelInput": 255,
            "BrakeInput": 0,
            "AccelerationX": 0.5 * 9.81,
            "AccelerationZ": 1.2 * 9.81,
            "PositionX": 100.0,
            "PositionY": 5.0,
            "PositionZ": 200.0,
            "NormalizedSuspensionTravel": [0.4, 0.4, 0.5, 0.5],
            "TireSlipAngle": [0.1, 0.1, 0.05, 0.05],
            "TireSlipRatio": [0.02, 0.02, 0.01, 0.01],
            "TireTemp": [180.0, 180.0, 185.0, 185.0],
        },
        {
            "time": 0.2,
            "LapNumber": 1,
            "DistanceTraveled": 25.0,
            "SpeedMetersPerSecond": 40.0,
            "CurrentEngineRpm": 5200,
            "Gear": 3,
            "AccelInput": 255,
            "BrakeInput": 0,
            "AccelerationX": 0.8 * 9.81,
            "AccelerationZ": 1.5 * 9.81,
            "PositionX": 110.0,
            "PositionY": 5.0,
            "PositionZ": 220.0,
            "NormalizedSuspensionTravel": [0.42, 0.42, 0.51, 0.51],
            "TireSlipAngle": [0.12, 0.12, 0.06, 0.06],
            "TireSlipRatio": [0.03, 0.03, 0.01, 0.01],
            "TireTemp": [182.0, 182.0, 187.0, 187.0],
        },
    ]

    db.insert_points_batch(session_id, sample_points)

    # Retrieve sessions list
    sessions = db.list_all_sessions()
    assert len(sessions) == 1
    assert sessions[0]["car_name"] == "2020 Porsche 911 GT3"

    # Retrieve points
    retrieved = db.get_telemetry_points(session_id)
    assert len(retrieved) == 2
    assert retrieved[0]["CurrentEngineRpm"] == 4000
    assert abs(retrieved[0]["SpeedMetersPerSecond"] - 30.0) < 0.1
    assert retrieved[0]["Gear"] == 3


def test_motec_csv_export(temp_sqlite_db):
    db = temp_sqlite_db
    session_id = "test_motec_export"
    db.create_session(
        session_id=session_id, car_name="Test Race Car", start_time=2000.0
    )

    points = [
        {
            "time": 0.5,
            "LapNumber": 1,
            "lap_distance": 50.0,
            "SpeedMetersPerSecond": 50.0,
            "CurrentEngineRpm": 6000,
            "Gear": 4,
            "AccelInput": 200,
            "BrakeInput": 0,
            "AccelerationX": 2.0,
            "AccelerationZ": 5.0,
            "SuspTravel": [0.5, 0.5, 0.5, 0.5],
            "TireSlipAngle": [0.05, 0.05, 0.05, 0.05],
            "TireSlipRatio": [0.01, 0.01, 0.01, 0.01],
            "TireTemp": [190.0, 190.0, 195.0, 195.0],
        }
    ]
    db.insert_points_batch(session_id, points)

    with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as tmp:
        csv_path = tmp.name

    try:
        session_meta = {"session_id": session_id, "car_name": "Test Race Car"}
        success = export_session_to_motec_csv(
            session_meta, db.get_telemetry_points(session_id), csv_path
        )
        assert success is True
        assert os.path.exists(csv_path)

        with open(csv_path, "r", encoding="utf-8") as f:
            content = f.read()
            assert "MoTeC CSV Log File" in content
            assert "Speed" in content
            assert "Test Race Car" in content
    finally:
        if os.path.exists(csv_path):
            os.remove(csv_path)


def test_sqlite_decoded_null_channels_reach_debrief_without_invented_values(
    temp_sqlite_db,
):
    db = temp_sqlite_db
    session_id = "test_partial_decoded_session"
    db.create_session(session_id=session_id, start_time=3000.0)
    db.insert_points_batch(
        session_id,
        [
            {
                "time": 0.1,
                "LapNumber": None,
                "SpeedMetersPerSecond": 20.0,
                "TireTemp": [185.0, None, None, 195.0],
                "NormalizedSuspensionTravel": [0.4, None, None, 0.97],
                "TireSlipAngle": [None, None, None, None],
                "TireSlipRatio": [None, None, None, None],
                "AccelerationX": None,
            }
        ],
    )

    point = db.get_telemetry_points(session_id)[0]
    result = calculate_session_debrief([point])

    assert point["LapNumber"] is None
    assert point["SuspTravel"] == [0.4, None, None, 0.97]
    assert point["TireTemp"] == [185.0, None, None, 195.0]
    assert result["valid_laps"] == 0
    assert result["tire_thermals"]["fr_avg"] is None
    assert result["tire_thermals"]["rl_avg"] is None
    assert result["suspension"]["bottom_out_count"] == 1
    assert result["handling_balance"]["tendency"] == "no_data"
