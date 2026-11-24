"""Telemetry-guarded loaded sweeps, starting in third gear."""

import math
import time

from .measurement_api import baseline, identify, request, solve, telemetry
from .measurement_route import (
    await_driving_hud,
    leave_garage,
    return_to_garage,
    travel_to_strip,
)

__all__ = ["baseline", "identify", "measure_and_return", "solve"]

CHANNELS = {
    "timestampMS": "TimestampMS",
    "isRaceOn": "IsRaceOn",
    "carOrdinal": "CarOrdinal",
    "carClass": "CarClass",
    "performanceIndex": "CarPerformanceIndex",
    "engineMaxRpm": "EngineMaxRpm",
    "rpm": "CurrentEngineRpm",
    "speedMps": "SpeedMetersPerSecond",
    "gear": "Gear",
    "powerWatts": "PowerWatts",
    "torqueNewtons": "TorqueNewtons",
    "accelInput": "AccelInput",
    "brakeInput": "BrakeInput",
    "clutchInput": "ClutchInput",
    "handBrakeInput": "HandBrakeInput",
    "tireSlipRatio": "TireSlipRatio",
}

START_X, START_Z, START_YAW = -1888.75, -352.76, math.pi


def _same_car(frame, profile):
    if str(frame["CarOrdinal"]) != str(profile["carId"]):
        raise RuntimeError(
            f"Data Out 車輛 {frame['CarOrdinal']} 與車庫 {profile['carId']} 不符"
        )
    if (
        profile.get("performanceIndex") is not None
        and int(profile["performanceIndex"]) != frame["CarPerformanceIndex"]
    ):
        raise RuntimeError("Data Out 性能指數與採集車輛不符")


def _launch_pose(frame):
    return (
        abs(frame["PositionX"] - START_X) <= 3.5
        and abs(frame["PositionZ"] - START_Z) <= 15
        and abs(math.remainder(frame["Yaw"] - START_YAW, math.tau)) <= 0.04
    )


def _await_world(device, profile, spawn=False):
    # Reconnect after timeouts: BufferedReader cannot be reused after a socket
    # timeout. Reopening also discards menu/loading and pre-teleport frames.
    end = time.monotonic() + 48
    last = ""
    while time.monotonic() < end:
        device.guard()
        try:
            with telemetry(device.port, timeout=0.8) as receive:
                frame = receive()
                if not frame["IsRaceOn"] or not frame["CarOrdinal"]:
                    device.wait(0.25)
                    continue
                _same_car(frame, profile)
                if not spawn or (
                    _launch_pose(frame) and frame["SpeedMetersPerSecond"] < 0.5
                ):
                    return frame
                last = f"道路落點 {frame['PositionX']:.1f}, {frame['PositionZ']:.1f}, 朝向 {frame['Yaw']:.3f}"
        except TimeoutError:
            last = "未收到新封包"
        device.wait(0.15)
    raise RuntimeError(f"等待自由駕駛 Data Out 逾時：{last}")


def _frame(device, receive, profile):
    device.guard()
    frame = receive()
    _same_car(frame, profile)
    if frame["IsRaceOn"] != 1:
        raise RuntimeError("自由駕駛已中斷")
    if "TimestampMS" in frame:
        timestamp = frame["TimestampMS"]
        now = time.monotonic()
        previous = getattr(device, "telemetry_progress", None)
        if previous is not None:
            delta = (timestamp - previous[0]) & 0xFFFFFFFF
            if delta > 0x80000000:
                raise RuntimeError("遙測時間倒退")
            if not delta and now - previous[1] > 0.5:
                raise RuntimeError("遙測時間停止，已停止駕駛輸入")
        if previous is None or timestamp != previous[0]:
            device.telemetry_progress = (timestamp, now)
    return frame


def _stop_car(device, receive, profile):
    if _frame(device, receive, profile)["SpeedMetersPerSecond"] < 0.35:
        return
    end = time.monotonic() + 8
    try:
        device.hold("S")
        while time.monotonic() < end:
            if _frame(device, receive, profile)["SpeedMetersPerSecond"] < 0.38:
                return
        raise RuntimeError("車輛未在煞車距離內停止")
    finally:
        device.release("S")


def _stage(device, receive, profile, gear=3):
    pose = _frame(device, receive, profile)
    device.state.artifact("launch-pose.json", pose)
    if (
        not _launch_pose(pose)
        or pose["Gear"] != 1
        or pose["SpeedMetersPerSecond"] > 0.55
        or pose["AccelInput"]
        or pose["BrakeInput"]
    ):
        raise RuntimeError("道路傳送後位置、朝向、檔位或車速不符；未送出油門")
    # Fast travel lands beyond the gate, already aligned with the straight.
    # No timed driving maneuver is needed, regardless of the current gear ratios.
    for target in range(2, gear + 1):
        device.tap("E")
        end = time.monotonic() + 1.6
        while (pose := _frame(device, receive, profile))["Gear"] != target:
            if time.monotonic() >= end:
                raise RuntimeError(f"無法切入 {target} 檔，請核對手排設定與升檔按鍵")
    device.staged_timestamp = pose.get("TimestampMS")


def _fresh_launch(device, receive, profile, gear):
    previous = getattr(device, "staged_timestamp", None)
    advancing = 0
    deadline = time.monotonic() + 1
    while time.monotonic() < deadline:
        start = _frame(device, receive, profile)
        if (
            not _launch_pose(start)
            or start["Gear"] != gear
            or start["SpeedMetersPerSecond"] > 0.65
            or start["AccelInput"]
            or start["BrakeInput"]
        ):
            raise RuntimeError(f"{gear} 檔靜止起跑條件未成立")
        timestamp = start["TimestampMS"]
        if previous is not None:
            delta = (timestamp - previous) & 0xFFFFFFFF
            if delta > 0x80000000:
                raise RuntimeError("起跑遙測時間倒退")
            if delta:
                advancing += 1
                if advancing >= 2:
                    return start
        previous = timestamp
    raise RuntimeError("起跑遙測時間未前進")


def _sweep(device, receive, profile, gear=3):
    start = _fresh_launch(device, receive, profile, gear)
    began = time.monotonic()
    last_steer = began
    samples = []
    redline_since = None
    reason = "timeout"
    distance = 0
    try:
        device.hold("W")
        while time.monotonic() - began < 45:
            f = _frame(device, receive, profile)
            samples.append({dst: f[src] for dst, src in CHANNELS.items()})
            if f["Gear"] != gear:
                raise RuntimeError("量測期間檔位改變")
            if time.monotonic() - began > 0.7 and f["AccelInput"] < 250:
                raise RuntimeError("遊戲未持續接受全油門")
            x_error = start["PositionX"] - f["PositionX"]
            yaw_delta = math.remainder(f["Yaw"] - start["Yaw"], math.tau)
            if abs(x_error) > 11 or abs(yaw_delta) > 0.24:
                raise RuntimeError("車輛偏離直線測試走廊")
            distance = abs(f["PositionZ"] - start["PositionZ"])
            if distance > 540:
                reason = "distance"
                break
            if f["CurrentEngineRpm"] >= f["EngineMaxRpm"] * 0.97:
                if redline_since is None:
                    redline_since = time.monotonic()
                elif time.monotonic() - redline_since >= 1:
                    reason = "redline"
                    break
            else:
                redline_since = None
            if f["SpeedMetersPerSecond"] > 5 and time.monotonic() - last_steer > 0.45:
                target = math.atan2(max(-0.07, min(0.07, x_error * 0.013)), -1)
                err = math.remainder(target - f["Yaw"], math.tau)
                if abs(err) > 0.024:
                    key = "D" if err > 0 else "A"
                    try:
                        device.hold(key)
                        device.wait(0.05)
                    finally:
                        device.release(key)
                    last_steer = time.monotonic()
    finally:
        device.release("W")
        _stop_car(device, receive, profile)
    return samples, {"gear": gear, "stopReason": reason, "distanceMeters": distance}


def _retry_gear(gear, report, readiness, maximum):
    if report["stopReason"] == "distance" and not readiness["highRpmCoverage"]:
        return gear - 1 if gear > 2 else None
    if (
        readiness["guidance"] == "duration-insufficient"
        and readiness["highRpmCoverage"]
    ):
        return gear + 1 if gear < maximum else None
    return None


def measure_and_return(device, profile):
    if (
        profile.get("isElectric")
        or profile.get("adjustability", {}).get("gears", 0) < 3
    ):
        raise ValueError("三檔引擎量測需要可切入三檔的燃油車")
    gear = 3
    tried = set()
    maximum = min(6, profile["adjustability"]["gears"])
    for attempt in range(1, 4):
        tried.add(gear)
        device.log(f"前往嘉年華一公里，第 {attempt} 趟使用 {gear} 檔")
        leave_garage(device)
        await_driving_hud(device)
        origin = _await_world(device, profile)
        travel_to_strip(device, origin)
        _await_world(device, profile, spawn=True)
        await_driving_hud(device)
        device.log("已直接到達起跑道路，正在以遙測核對位置與朝向")
        with telemetry(device.port) as receive:
            _stage(device, receive, profile, gear)
        device.capture(f"{gear}檔起跑位置")
        device.log(f"{gear} 檔已確認，開始直線量測")
        with telemetry(device.port) as receive:
            samples, report = _sweep(device, receive, profile, gear)
        device.state.artifact(f"sweep-{attempt}.json", {**report, "samples": samples})
        result = request(
            device,
            "/api/tuning/engine-batch",
            {
                "schemaVersion": "engine-batch/v1",
                "carId": str(profile["carId"]),
                "connected": True,
                "nowMs": int(time.monotonic() * 1000),
                "samples": samples,
            },
        )
        device.state.artifact(f"engine-batch-{attempt}.json", result)
        acceptance = result["readiness"]
        if acceptance["ready"] and result["readySnapshot"]:
            device.state.artifact("samples.json", samples)
            device.state.artifact("engine-batch.json", result)
            device.log(
                f"{gear} 檔量測完成，有效 {acceptance['acceptedMs'] / 1000:.3f} 秒，涵蓋 {acceptance['binCount']} 個轉速區間"
            )
            return_to_garage(device)
            return samples, result["readySnapshot"]
        next_gear = _retry_gear(gear, report, acceptance, maximum)
        if next_gear is None or next_gear in tried or attempt == 3:
            raise RuntimeError(f"量測未達 Rust 資格標準：{acceptance['guidance']}")
        device.log(
            f"{acceptance['guidance']}：{report['stopReason']}，改用 {next_gear} 檔重新量測"
        )
        # Returning via the garage separates the player icon from the target,
        # so the repeated map selection cannot snap back to the current car.
        return_to_garage(device)
        gear = next_gear
    raise RuntimeError("量測重試次數已用完")
