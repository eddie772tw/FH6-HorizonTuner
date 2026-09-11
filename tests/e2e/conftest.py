"""Pytest configuration and fixtures for E2E opaque-box test suite."""

from __future__ import annotations

from pathlib import Path

import pytest

from tests.e2e.harness import E2ETestHarness, pack_324b_telemetry


@pytest.fixture
def harness(tmp_path: Path) -> E2ETestHarness:
    """Fixture providing isolated E2E test harness per test."""
    return E2ETestHarness(tmp_path)


@pytest.fixture
def opaque_client(harness: E2ETestHarness):
    """Fixture providing opaque HTTP client."""
    return harness.client


@pytest.fixture
def store(harness: E2ETestHarness):
    """Fixture providing direct SQLite document store."""
    return harness.store


@pytest.fixture
def simulator(harness: E2ETestHarness):
    """Fixture providing standalone workflow simulator."""
    return harness.simulator


@pytest.fixture
def offroad_packets():
    """Generate 100 frames of representative offroad rally telemetry with bottoming events."""
    frames = []
    for i in range(100):
        # Introduce severe bottoming around frames 40-45
        is_bottoming = 40 <= i <= 45
        norm_t = (0.99, 0.99, 0.85, 0.85) if is_bottoming else (0.55, 0.55, 0.50, 0.50)
        travel_m = (
            (0.28, 0.28, 0.22, 0.22) if is_bottoming else (0.14, 0.14, 0.12, 0.12)
        )
        accel_y = -35.0 if is_bottoming else -9.81  # ~3.5G landing impact
        rumble = (0.75, 0.80, 0.70, 0.72)
        frames.append(
            pack_324b_telemetry(
                timestamp_ms=1000 + i * 50,
                speed_mps=30.0,
                norm_travel=norm_t,
                travel_meters=travel_m,
                accel_y=accel_y,
                surface_rumble=rumble,
                distance_traveled=i * 1.5,
                race_time=i * 0.05,
            )
        )
    return frames


@pytest.fixture
def drag_packets():
    """Generate 120 frames of representative drag strip telemetry with launch slip and gear shifts."""
    frames = []
    # 0 to 400m acceleration run
    speed = 0.0
    dist = 0.0
    gear = 1
    for i in range(120):
        t = i * 0.08
        if i < 15:  # Launch phase
            gear = 1
            slip = (0.05, 0.05, 0.35, 0.35)  # Heavy rear wheelspin
            accel_z = 12.0
        elif i < 50:  # 2nd gear
            gear = 2
            slip = (0.03, 0.03, 0.08, 0.08)
            accel_z = 8.0
        elif i < 90:  # 3rd gear
            gear = 3
            slip = (0.02, 0.02, 0.04, 0.04)
            accel_z = 6.0
        else:  # 4th gear to 400m
            gear = 4
            slip = (0.01, 0.01, 0.02, 0.02)
            accel_z = 4.0

        speed += accel_z * 0.08
        dist += speed * 0.08
        frames.append(
            pack_324b_telemetry(
                timestamp_ms=1000 + int(t * 1000),
                speed_mps=speed,
                slip_ratio=slip,
                distance_traveled=dist,
                race_time=t,
                gear=gear,
            )
        )
    return frames


@pytest.fixture
def drift_packets():
    """Generate 100 frames of representative drift telemetry with sustained sideslip angle beta."""
    frames = []
    base_temp = 180.0
    for i in range(100):
        # Sustained drift angle beta ~ 25-30 degrees (slip angle ~ 0.45 - 0.55)
        slip_angle = (0.15, 0.15, 0.50, 0.50)
        rear_spin = (0.05, 0.05, 0.28, 0.28)
        temp_rise = i * 0.4  # Thermal rise in rear tires
        temps = (
            base_temp + 5.0,
            base_temp + 5.0,
            base_temp + temp_rise,
            base_temp + temp_rise,
        )
        frames.append(
            pack_324b_telemetry(
                timestamp_ms=1000 + i * 50,
                speed_mps=22.0,
                slip_angle=slip_angle,
                slip_ratio=rear_spin,
                tire_temps_f=temps,
                distance_traveled=i * 1.1,
                race_time=i * 0.05,
            )
        )
    return frames
