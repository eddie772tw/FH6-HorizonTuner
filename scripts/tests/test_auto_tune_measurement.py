"""Prevent binding a sweep to the wrong car, gear or engine profile."""

from contextlib import nullcontext
from types import SimpleNamespace

import pytest

from scripts.auto_tune import measurement, measurement_api


def feed_identity(monkeypatch, frames):
    frames = iter(frames)

    def receive():
        try:
            return next(frames)
        except StopIteration:
            raise TimeoutError from None

    monkeypatch.setattr(
        measurement_api, "telemetry", lambda *_args, **_kwargs: nullcontext(receive)
    )
    return SimpleNamespace(port=8001, guard=lambda: None, log=lambda _: None)


@pytest.mark.parametrize(
    "name", ["2013 Cadillac XTS Limousine", "unlisted localized name", ""]
)
def test_live_ordinal_does_not_require_any_catalog_name(monkeypatch, name):
    frame = dict(
        CarOrdinal=2128, TimestampMS=100, CarPerformanceIndex=798, DrivetrainType=2
    )
    device = feed_identity(monkeypatch, [frame, {**frame, "TimestampMS": 116}])
    monkeypatch.setattr(
        measurement_api,
        "request",
        lambda *_: pytest.fail("catalog must not gate live identity"),
    )
    assert (
        measurement_api.identify(
            device, name, dict(performanceIndex=798, drivetrain="AWD")
        )
        == "2128"
    )


@pytest.mark.parametrize(
    "frames",
    [
        [],
        [dict(CarOrdinal=2128, TimestampMS=100)] * 3,
        [dict(CarOrdinal=2128, TimestampMS=100), dict(CarOrdinal=11, TimestampMS=116)],
        [dict(CarOrdinal=0, TimestampMS=100), dict(CarOrdinal=0, TimestampMS=116)],
        [dict(CarOrdinal=2128, TimestampMS=100), dict(CarOrdinal=2128, TimestampMS=90)],
    ],
)
def test_missing_stale_or_unstable_identity_falls_back_to_catalog(monkeypatch, frames):
    device = feed_identity(monkeypatch, frames)
    monkeypatch.setattr(
        measurement_api,
        "request",
        lambda *_: {"11": {"display_name": "1964 Aston Martin DB5"}},
    )
    assert measurement_api.identify(device, "1964 Aston Martin DB5") == "11"


def test_fresh_identity_wraparound_and_wrong_profile(monkeypatch):
    frame = dict(
        CarOrdinal=2128,
        TimestampMS=0xFFFFFFF0,
        CarPerformanceIndex=798,
        DrivetrainType=2,
    )
    frames = [frame, {**frame, "TimestampMS": 8}]
    assert (
        measurement_api._live_car_id(feed_identity(monkeypatch, frames), {}) == "2128"
    )
    with pytest.raises(ValueError, match="車卡不符"):
        measurement_api._live_car_id(
            feed_identity(monkeypatch, frames), {"performanceIndex": 600}
        )


@pytest.mark.parametrize(
    "expected, allowed",
    [
        ("2013 Cadillac XTS Limo", True),
        ("another localized spelling", True),
        ("1964 Aston Martin DB5", False),
    ],
)
def test_target_spelling_is_advisory_but_known_different_ordinal_is_rejected(
    monkeypatch, expected, allowed
):
    monkeypatch.setattr(measurement_api, "_live_car_id", lambda *_: "2128")
    monkeypatch.setattr(
        measurement_api,
        "request",
        lambda *_: {
            "2128": {"display_name": "2013 Cadillac XTS Limo"},
            "11": {"display_name": "1964 Aston Martin DB5"},
        },
    )
    device = SimpleNamespace(log=lambda _: None)
    assert (
        measurement_api.confirm_named_target(
            device, {"carName": "2013 Cadillac XTS Limousine"}, expected
        )
        is allowed
    )


def test_identify_limo_alias_keeps_year_and_unique_vehicle_guard(monkeypatch):
    monkeypatch.setattr(measurement_api, "_live_car_id", lambda *_: None)
    cars = {"2128": {"display_name": "2013 Cadillac XTS Limo"}}
    monkeypatch.setattr(measurement_api, "request", lambda *_: cars)
    assert measurement_api.identify(None, "2013 Cadillac XTS Limousine") == "2128"
    assert measurement_api.identify(None, "2013 Cadillac XTS Limo") == "2128"
    with pytest.raises(ValueError, match="無法唯一"):
        measurement_api.identify(None, "2014 Cadillac XTS Limousine")
    cars["other"] = {"display_name": "2013 Cadillac XTS Limousine"}
    with pytest.raises(ValueError, match="無法唯一"):
        measurement_api.identify(None, "2013 Cadillac XTS Limousine")


@pytest.mark.parametrize(
    "changes",
    [
        {"PositionX": -1952.65, "Yaw": 0},  # observed wrong parallel road
        {"PositionZ": -172.09},  # event fast travel: behind the gate
        {"PositionZ": -473.21},  # observed unzoomed road selection, too far south
        {"Yaw": 0},
        {"SpeedMetersPerSecond": 1},
        {"Gear": 3},
        {"AccelInput": 255},
    ],
)
def test_bad_road_landing_sends_no_driving_or_shift_input(changes):
    pose = {
        "CarOrdinal": 1105,
        "IsRaceOn": 1,
        "PositionX": -1888.75,
        "PositionZ": -352.76,
        "Yaw": -3.141592264,
        "SpeedMetersPerSecond": 0,
        "Gear": 1,
        "AccelInput": 0,
        "BrakeInput": 0,
        **changes,
    }
    device = SimpleNamespace(
        guard=lambda: None, state=SimpleNamespace(artifact=lambda *_: None)
    )
    with pytest.raises(RuntimeError, match="未送出油門"):
        measurement._stage(device, lambda: pose, {"carId": "1105"})


def test_confirmed_road_landing_only_shifts_into_third():
    pose = {
        "CarOrdinal": 1105,
        "IsRaceOn": 1,
        "PositionX": -1888.75,
        "PositionZ": -352.76,
        "Yaw": -3.141592264,
        "SpeedMetersPerSecond": 0,
        "Gear": 1,
        "AccelInput": 0,
        "BrakeInput": 0,
    }
    inputs = []

    def shift(key):
        inputs.append(key)
        pose["Gear"] += 1

    device = SimpleNamespace(
        guard=lambda: None,
        tap=shift,
        state=SimpleNamespace(artifact=lambda *_: None),
    )
    measurement._stage(device, lambda: pose, {"carId": "1105"})
    assert pose["Gear"] == 3
    assert inputs == ["E", "E"]


def test_repeated_udp_timestamp_cannot_keep_driving(monkeypatch):
    clock = iter([10.0, 10.51])
    monkeypatch.setattr(measurement.time, "monotonic", lambda: next(clock))
    device = SimpleNamespace(guard=lambda: None)
    pose = {"CarOrdinal": 1105, "IsRaceOn": 1, "TimestampMS": 50}
    measurement._frame(device, lambda: pose, {"carId": "1105"})
    with pytest.raises(RuntimeError, match="遙測時間停止"):
        measurement._frame(device, lambda: pose, {"carId": "1105"})


def test_agent_wrong_car_stops_before_upgrade_or_tuning_input(monkeypatch):
    monkeypatch.setattr(measurement_api, "_live_car_id", lambda *_: None)
    from contextlib import nullcontext

    from scripts.auto_tune import collect

    monkeypatch.setattr(collect, "_scene", lambda _: "card")
    monkeypatch.setattr(collect, "_frame", lambda *_: "unused.png")
    monkeypatch.setattr(collect, "Raster", lambda _: nullcontext(None))
    monkeypatch.setattr(collect, "selected_tile", lambda *_: True)
    monkeypatch.setattr(
        collect, "_read_card", lambda _: {"carName": "2022 Acura NSX Type S"}
    )
    # No input methods: an attempted input before identity validation fails this test.
    device = SimpleNamespace(expected_car_name="1964 Aston Martin DB5")
    with pytest.raises(ValueError, match="目標車輛不符"):
        collect.collect_profile(device)


def test_parent_exit_stops_before_checking_or_sending_game_input():
    from scripts.auto_tune.device import Device, Stopped

    device = Device.__new__(Device)
    device.parent = 123
    device.kernel = SimpleNamespace(WaitForSingleObject=lambda *_: 0)
    with pytest.raises(Stopped, match="桌面服務已結束"):
        device.guard()


def test_catalog_short_name_requires_unique_match(monkeypatch):
    monkeypatch.setattr(measurement_api, "_live_car_id", lambda *_: None)
    cars = {"11": {"display_name": "1964 Aston Martin DB5 Vantage"}}
    monkeypatch.setattr(measurement_api, "request", lambda *_: cars)
    assert measurement.identify(None, "1964 Aston Martin DB5") == "11"
    cars["12"] = {"display_name": "1964 Aston Martin DB5 Special"}
    with pytest.raises(ValueError):
        measurement.identify(None, "1964 Aston Martin DB5")


@pytest.mark.parametrize(
    "changes",
    [
        {"CarOrdinal": 7},
        {"CarPerformanceIndex": 777},
        {"Gear": 1},
        {"SpeedMetersPerSecond": 6},
        {"PositionX": -1952.65, "Yaw": 0},
    ],
)
def test_wrong_car_or_moving_launch_sends_no_throttle(changes):
    profile = {"carId": "83", "performanceIndex": 666}
    snapshot = {
        "CarOrdinal": 83,
        "CarPerformanceIndex": 666,
        "IsRaceOn": 1,
        "Gear": 3,
        "SpeedMetersPerSecond": 0,
        "AccelInput": 0,
        "BrakeInput": 0,
        "PositionX": -1888.75,
        "PositionZ": -352.76,
        "Yaw": -3.141592264,
        **changes,
    }
    device = SimpleNamespace(guard=lambda: None)
    with pytest.raises(RuntimeError):
        measurement._sweep(device, lambda: snapshot, profile)


def test_world_exit_or_lost_telemetry_releases_throttle():
    profile = {"carId": "83"}
    snapshot = {
        "CarOrdinal": 83,
        "IsRaceOn": 1,
        "Gear": 3,
        "SpeedMetersPerSecond": 0,
        "AccelInput": 0,
        "BrakeInput": 0,
        "PositionX": -1888.75,
        "PositionZ": -352.76,
        "Yaw": -3.141592264,
        "TimestampMS": 1,
    }
    held = set()
    device = SimpleNamespace(guard=lambda: None, hold=held.add, release=held.discard)
    frames = iter(
        [{**snapshot, "TimestampMS": i} for i in (1, 2, 3)]
        + [
            {**snapshot, "IsRaceOn": 0, "TimestampMS": 4},
            {**snapshot, "TimestampMS": 5},
        ]
    )
    with pytest.raises(RuntimeError, match="中斷"):
        measurement._sweep(device, lambda: next(frames), profile)
    assert not held


@pytest.mark.parametrize("timestamps", [(10, 9), (0xFFFFFFFE, 0xFFFFFFFF, 0, 1)])
def test_launch_timestamp_regression_and_u32_rollover(timestamps):
    pose = {
        "CarOrdinal": 1105,
        "IsRaceOn": 1,
        "Gear": 3,
        "PositionX": -1888.75,
        "PositionZ": -352.76,
        "Yaw": -3.141592264,
        "SpeedMetersPerSecond": 0,
        "AccelInput": 0,
        "BrakeInput": 0,
    }
    frames = iter([{**pose, "TimestampMS": t} for t in timestamps])
    device = SimpleNamespace(guard=lambda: None)
    if timestamps[0] == 10:
        with pytest.raises(RuntimeError, match="時間倒退"):
            measurement._fresh_launch(
                device, lambda: next(frames), {"carId": "1105"}, 3
            )
    else:
        assert (
            measurement._fresh_launch(
                device, lambda: next(frames), {"carId": "1105"}, 3
            )["TimestampMS"]
            == 0
        )


@pytest.mark.parametrize(
    "gear,reason,guidance,high,expected",
    [
        (3, "distance", "rpm-coverage-high", False, 2),
        (3, "redline", "duration-insufficient", True, 4),
        (2, "distance", "rpm-coverage-high", False, None),
        (6, "redline", "duration-insufficient", True, None),
        (3, "timeout", "timestamp-stalled", False, None),
    ],
)
def test_retry_changes_gear_only_for_supported_measurement_deficits(
    gear, reason, guidance, high, expected
):
    assert (
        measurement._retry_gear(
            gear,
            {"stopReason": reason},
            {"guidance": guidance, "highRpmCoverage": high},
            6,
        )
        == expected
    )


def test_displays_qualified_rpm_separately_from_slider_outputs(monkeypatch):
    recorded = {}
    device = SimpleNamespace(goal="Road", season="Winter", observed=recorded.update)
    profile = {
        "carId": "42",
        "drivetrain": "RWD",
        "induction": "NA",
        "maxHp": 300,
        "maxTorque": 400,
    }
    workflow = {
        "readiness": {"measuredEngine": True},
        "recommendation": {
            "fields": {"gearing.finalDrive": {"value": 3.9, "unit": "ratio"}},
            "inputSnapshot": {
                "engineCalculation": {
                    "peakPower": {"rpm": 5806.7},
                    "peakTorque": {"rpm": 4434.1},
                }
            },
        },
    }
    monkeypatch.setattr(
        measurement_api,
        "request",
        lambda _, path, body: profile if path.endswith("profile") else workflow,
    )
    result = measurement.solve(device, profile, [], {})
    assert recorded == {
        "engine.peakPowerRpm": "5807 rpm",
        "engine.peakTorqueRpm": "4434 rpm",
    }
    assert list(result["recommendation"]["fields"]) == ["gearing.finalDrive"]
