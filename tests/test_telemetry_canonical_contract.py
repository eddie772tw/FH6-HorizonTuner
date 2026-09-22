"""Tests validating cross-stack Canonical Telemetry Fixtures against McpService and conversion contracts."""

from __future__ import annotations

import json
import math
from pathlib import Path

import pytest

from backend.mcp.service import HorizonTunerMcpService

FIXTURES_PATH = (
    Path(__file__).resolve().parent / "fixtures" / "telemetry_canonical_fixtures.json"
)
FIXTURE_DATA = json.loads(FIXTURES_PATH.read_text(encoding="utf-8"))["fixtures"]


@pytest.fixture
def mcp_service(tmp_path):
    settings_file = tmp_path / "settings.json"
    settings_file.write_text(
        json.dumps({"language": "en-us", "speedUnit": "kmh"}), encoding="utf-8"
    )
    service = HorizonTunerMcpService(
        data_root=str(tmp_path), resource_root=str(tmp_path)
    )
    return service


def assert_approx_equal(actual, expected, path=""):
    """Recursively compare actual and expected data structures with floating tolerance."""
    if isinstance(expected, dict):
        assert isinstance(actual, dict), f"{path}: expected dict, got {type(actual)}"
        assert actual.keys() == expected.keys(), (
            f"{path}: keys mismatch\nActual: {sorted(actual.keys())}\nExpected: {sorted(expected.keys())}"
        )
        for k, v in expected.items():
            assert_approx_equal(actual[k], v, f"{path}.{k}")
    elif isinstance(expected, list):
        assert isinstance(actual, list), f"{path}: expected list, got {type(actual)}"
        assert len(actual) == len(expected), (
            f"{path}: length mismatch ({len(actual)} != {len(expected)})"
        )
        for i, (a, e) in enumerate(zip(actual, expected)):
            assert_approx_equal(a, e, f"{path}[{i}]")
    elif isinstance(expected, float):
        assert isinstance(actual, (int, float)), (
            f"{path}: expected number, got {type(actual)}"
        )
        assert math.isclose(actual, expected, abs_tol=0.15, rel_tol=1e-3), (
            f"{path}: value mismatch ({actual} != {expected})"
        )
    else:
        assert actual == expected, (
            f"{path}: value mismatch ({actual!r} != {expected!r})"
        )


@pytest.mark.parametrize("fixture", FIXTURE_DATA, ids=lambda f: f["id"])
def test_mcp_driver_cockpit_matches_canonical_fixture(mcp_service, fixture):
    raw = fixture["raw_packet"]
    expected_mcp = fixture["expected_presentation"]["mcp_driver_cockpit"]
    actual_mcp = mcp_service.get_driver_cockpit_telemetry(raw)
    assert_approx_equal(
        actual_mcp, expected_mcp, path=f"{fixture['id']}.driver_cockpit"
    )


@pytest.mark.parametrize("fixture", FIXTURE_DATA, ids=lambda f: f["id"])
def test_mcp_vehicle_dynamics_matches_canonical_fixture(mcp_service, fixture):
    raw = fixture["raw_packet"]
    expected_mcp = fixture["expected_presentation"]["mcp_vehicle_dynamics"]
    actual_mcp = mcp_service.get_vehicle_dynamics_telemetry(raw)
    assert_approx_equal(
        actual_mcp, expected_mcp, path=f"{fixture['id']}.vehicle_dynamics"
    )


@pytest.mark.parametrize("fixture", FIXTURE_DATA, ids=lambda f: f["id"])
def test_mcp_tires_status_matches_canonical_fixture(mcp_service, fixture):
    raw = fixture["raw_packet"]
    expected_mcp = fixture["expected_presentation"]["mcp_tires_status"]
    actual_mcp = mcp_service.get_tires_status_telemetry(raw)
    assert_approx_equal(actual_mcp, expected_mcp, path=f"{fixture['id']}.tires_status")


@pytest.mark.parametrize("fixture", FIXTURE_DATA, ids=lambda f: f["id"])
def test_mcp_suspension_matches_canonical_fixture(mcp_service, fixture):
    raw = fixture["raw_packet"]
    expected_mcp = fixture["expected_presentation"]["mcp_suspension"]
    actual_mcp = mcp_service.get_suspension_telemetry(raw)
    assert_approx_equal(actual_mcp, expected_mcp, path=f"{fixture['id']}.suspension")


@pytest.mark.parametrize("fixture", FIXTURE_DATA, ids=lambda f: f["id"])
def test_canonical_domain_conversions(fixture):
    raw = fixture["raw_packet"]
    canonical = fixture["expected_canonical"]

    # Speed, Power, Torque, Boost
    assert raw["SpeedMetersPerSecond"] == canonical["speed_ms"]
    assert raw["PowerWatts"] == canonical["power_w"]
    assert raw["TorqueNewtons"] == canonical["torque_nm"]
    assert raw["Boost"] == canonical["boost_pa"]

    # Accelerations
    assert raw["AccelerationX"] == canonical["accel_x_ms2"]
    assert raw["AccelerationY"] == canonical["accel_y_ms2"]
    assert raw["AccelerationZ"] == canonical["accel_z_ms2"]

    # Driver Inputs
    assert round(raw["AccelInput"] / 255.0 * 100.0, 1) == canonical["throttle_pct"]
    assert round(raw["BrakeInput"] / 255.0 * 100.0, 1) == canonical["brake_pct"]
    assert round(raw["ClutchInput"] / 255.0 * 100.0, 1) == canonical["clutch_pct"]
    assert round(raw["HandBrakeInput"] / 255.0 * 100.0, 1) == canonical["handbrake_pct"]
    assert round(raw["SteerInput"] / 127.0 * 100.0, 1) == canonical["steer_pct"]

    # Transmission
    assert raw["Gear"] == canonical["gear_raw"]
    expected_gear_str = (
        "R" if raw["Gear"] == 0 else "N" if raw["Gear"] == 11 else str(raw["Gear"])
    )
    assert expected_gear_str == canonical["gear_display"]

    # Tires
    for t_raw, t_f, t_c in zip(
        raw["TireTemp"], canonical["tire_temps_f"], canonical["tire_temps_c"]
    ):
        assert round(t_raw, 1) == t_f
        assert round((t_raw - 32.0) * 5.0 / 9.0, 1) == t_c

    for a_raw, a_rad in zip(raw["TireSlipAngle"], canonical["slip_angles_rad"]):
        assert a_raw == a_rad

    for r_raw, r_ratio in zip(raw["TireSlipRatio"], canonical["slip_ratios"]):
        assert r_raw == r_ratio

    # Suspension
    travel = raw.get("NormalizedSuspensionTravel") or raw.get("SuspTravel")
    for t_raw, t_ratio, b_expected in zip(
        travel, canonical["suspension_travel_ratio"], canonical["is_bottoming"]
    ):
        assert t_raw == t_ratio
        assert (t_raw >= 0.95) == b_expected


@pytest.mark.parametrize("fixture", FIXTURE_DATA, ids=lambda f: f["id"])
def test_presentation_layer_conversions(fixture):
    raw = fixture["raw_packet"]
    pres = fixture["expected_presentation"]

    # Boost conversions (Pascal -> bar, psi, kPa)
    boost_pa = raw["Boost"]
    assert round(boost_pa / 100000.0, 3) == pres["boost_bar"]
    assert round(boost_pa * 0.0001450377, 2) == pres["boost_psi"]
    assert round(boost_pa / 1000.0, 1) == pres["boost_kpa"]

    # Speed conversions (m/s -> km/h, mph)
    speed_ms = raw["SpeedMetersPerSecond"]
    assert round(speed_ms * 3.6, 1) == pres["speed_kmh"]
    assert round(speed_ms * 2.23694, 2) == pres["speed_mph"]

    # Power conversions (Watts -> kW, HP, PS)
    power_w = raw["PowerWatts"]
    assert round(power_w / 1000.0, 1) == pres["power_kw"]
    assert round(power_w / 745.7, 2) == pres["power_hp"]
    assert round((power_w / 1000.0) * 1.35962, 2) == pres["power_ps"]

    # Torque conversions (N*m -> lb-ft)
    torque_nm = raw["TorqueNewtons"]
    assert round(torque_nm, 1) == pres["torque_nm"]
    assert round(torque_nm * 0.737562, 2) == pres["torque_ftlb"]

    # G-Force conversions (m/s² -> G)
    assert round(raw["AccelerationX"] / 9.81, 1) == pres["lateral_g"]
    assert round(raw["AccelerationZ"] / 9.81, 1) == pres["longitudinal_g"]
    assert round(raw["AccelerationY"] / 9.81, 1) == pres["vertical_g"]

    # Slip angles in degrees
    for a_raw, deg_expected in zip(raw["TireSlipAngle"], pres["slip_angles_deg"]):
        assert round(math.degrees(a_raw), 2) == deg_expected

    # Slip ratios in percent
    for r_raw, pct_expected in zip(raw["TireSlipRatio"], pres["slip_ratios_pct"]):
        assert round(r_raw * 100.0, 1) == pct_expected
