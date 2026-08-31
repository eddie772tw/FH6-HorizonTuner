from backend.dyno_quality import (
    DynoQualityGate,
    DynoQualityGateRegistry,
    reconcile_dyno_profile_segment,
    vehicle_profile_fingerprint,
)


def frame(
    timestamp=1000,
    *,
    position=(0.0, 0.0, 0.0),
    speed=20.0,
    gear=4,
    ordinal=10,
    car_class=3,
    pi=800,
):
    return {
        "TimestampMS": timestamp,
        "PositionX": position[0],
        "PositionY": position[1],
        "PositionZ": position[2],
        "SpeedMetersPerSecond": speed,
        "Gear": gear,
        "CarOrdinal": ordinal,
        "CarClass": car_class,
        "CarPerformanceIndex": pi,
    }


def test_quality_gate_uses_telemetry_timestamp_and_reaches_confidence():
    gate = DynoQualityGate()
    assessments = [
        gate.observe(frame(1000 + index * 16, position=(0.0, 0.0, index * 0.32)))
        for index in range(8)
    ]

    assert all(item.can_collect for item in assessments)
    assert assessments[-1].status == "confident"
    assert assessments[-1].confidence == 1.0


def test_quality_gate_marks_missing_or_non_monotonic_timestamps_unavailable_or_suspect():
    gate = DynoQualityGate()

    assert gate.observe({}).status == "unavailable"
    gate.observe(frame(1000))
    assessment = gate.observe(frame(1000, position=(0.0, 0.0, 0.1)))

    assert assessment.status == "suspect"
    assert assessment.reasons == ("timestamp-non-monotonic",)
    assert not assessment.can_collect


def test_quality_gate_detects_timestamp_and_position_discontinuities():
    gate = DynoQualityGate()
    gate.observe(frame(1000, position=(0.0, 0.0, 0.0)))
    gate.observe(frame(1016, position=(0.0, 0.0, 0.32)))
    gate.observe(frame(1032, position=(0.0, 0.0, 0.64)))

    assert (
        "timestamp-discontinuity"
        in gate.observe(frame(1200, position=(0.0, 0.0, 4.0))).reasons
    )

    gate = DynoQualityGate()
    gate.observe(frame(1000, position=(0.0, 0.0, 0.0), speed=10.0))
    assessment = gate.observe(frame(1016, position=(0.0, 0.0, 100.0), speed=10.0))
    assert assessment.reasons == ("position-discontinuity",)


def test_quality_gate_resets_when_observable_vehicle_fingerprint_changes():
    gate = DynoQualityGate()
    gate.observe(frame())
    assessment = gate.observe(frame(1016, ordinal=11))

    assert vehicle_profile_fingerprint(frame()) == (10, 3, 800)
    assert assessment.segment_reset is True
    assert assessment.reasons == ("vehicle-profile-changed",)
    assert assessment.can_collect is False


def test_shift_elapsed_is_derived_from_telemetry_timestamp_not_wall_clock():
    gate = DynoQualityGate()
    gate.observe(frame(1000, gear=4))
    gate.observe(frame(1016, gear=5, position=(0.0, 0.0, 0.32)))

    assert gate.milliseconds_since_gear_change(1516) == 500


def test_car_ordinal_transition_does_not_reset_the_destination_profile_curve():
    gates = DynoQualityGateRegistry()
    destination = {"dyno_curve": {"6000": {"hp": 500, "torque": 400}}}

    gates.observe("10", frame(1000, ordinal=10))
    destination_quality = gates.observe("11", frame(1016, ordinal=11))

    assert not destination_quality.segment_reset
    assert not reconcile_dyno_profile_segment(destination, destination_quality)
    assert destination["dyno_curve"] == {"6000": {"hp": 500, "torque": 400}}


def test_same_car_fingerprint_change_segments_its_profile_while_recording_is_paused():
    gates = DynoQualityGateRegistry()
    profile = {"dyno_curve": {"6000": {"hp": 500, "torque": 400}}}

    gates.observe("10", frame(1000, ordinal=10, pi=800))
    quality = gates.observe("10", frame(1016, ordinal=10, pi=801))

    assert quality.segment_reset
    assert reconcile_dyno_profile_segment(profile, quality)
    assert profile["dyno_curve"] == {}
    assert profile["dyno_curve_segments"] == [
        {
            "fingerprint": [10, 3, 800],
            "curve": {"6000": {"hp": 500, "torque": 400}},
            "ended_reason": "vehicle-profile-changed",
        }
    ]
