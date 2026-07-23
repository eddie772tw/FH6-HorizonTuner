import sys
import os
import json
import time
import gc
import socket
import struct
import math
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] Worker: %(message)s")
logger = logging.getLogger(__name__)

# Basic paths matching the standard structure
DATA_ROOT = os.path.dirname(os.path.abspath(__file__))
if getattr(sys, "frozen", False) or os.path.basename(sys.executable).lower() in ["backend.exe", "fh6-horizontuner.exe"]:
    DATA_ROOT = os.path.dirname(sys.executable)

TUNINGS_DIR = os.path.join(DATA_ROOT, "tunings")
CAR_PARAMS_DIR = os.path.join(DATA_ROOT, "car_params")
SESSIONS_DIR = os.path.join(DATA_ROOT, "sessions")
DRAG_SESSIONS_DIR = os.path.join(DATA_ROOT, "drag_sessions")
CAR_DB_PATH = os.path.join(DATA_ROOT, "car_database.json")

# Ensure dirs
for d in [TUNINGS_DIR, CAR_PARAMS_DIR, SESSIONS_DIR, DRAG_SESSIONS_DIR]:
    os.makedirs(d, exist_ok=True)

# Settings (We will reload this periodically)
app_settings = {"race_recording": True, "dyno_recording": True, "dyno_test_gear": 4, "dyno_filter_transients": True, "dyno_filter_slip": True}
last_settings_load = 0

def reload_settings():
    global last_settings_load
    now = time.time()
    if now - last_settings_load > 2.0:
        try:
            with open(os.path.join(DATA_ROOT, "settings.json"), "r") as f:
                app_settings.update(json.load(f))
        except Exception:
            pass
        last_settings_load = now

car_database = {}
try:
    with open(CAR_DB_PATH, "r", encoding="utf-8") as f:
        car_database = json.load(f)
except Exception:
    pass

def load_car_params(car_id: str):
    path = os.path.join(CAR_PARAMS_DIR, f"{car_id}.json")
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return None

def save_car_params(car_id: str, data: dict):
    path = os.path.join(CAR_PARAMS_DIR, f"{car_id}.json")
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=4)
    except Exception as e:
        logger.error(f"Failed to save car params {car_id}: {e}")

# Dyno config
DYNO_BUCKET_SIZE = 50
DYNO_MAX_HISTORY = 10
DYNO_NEIGHBOR_OFFSETS = [-200, -150, -100, -50, 0, 50, 100, 150, 200]
DYNO_ANOMALY_THRESHOLD = 0.25

dyno_cache = {}
last_dyno_save_time = 0.0
last_gc_time = 0.0

def compute_dyno_value(history):
    if not history: return 0
    if len(history) <= 2: return sum(history) / len(history)
    sorted_hist = sorted(history)
    return sum(sorted_hist[1:-1]) / (len(sorted_hist) - 2)

def dyno_is_reasonable(new_val, neighbor_vals, threshold=DYNO_ANOMALY_THRESHOLD):
    if new_val < 5: return False
    valid_neighbors = [v for v in neighbor_vals if v > 5]
    if not valid_neighbors: return True
    avg_neighbor = sum(valid_neighbors) / len(valid_neighbors)
    if avg_neighbor == 0: return True
    diff_ratio = abs(new_val - avg_neighbor) / avg_neighbor
    return diff_ratio <= threshold

class RaceRecorder:
    def __init__(self):
        self.is_recording = False
        self.manual_mode = False
        self.current_session = []
        self.first_timestamp = None
        self.last_sample_time = 0
        self.max_samples = 20000
        self.downsample_interval = 0.1
        self.lap_start_times = {}
        self.last_write_time = 0
        self.total_count = 0
        self.latest_filepath = os.path.join(SESSIONS_DIR, "latest.json")

    def clear(self):
        self.is_recording = False
        self.manual_mode = False
        self.current_session = []
        self.first_timestamp = None
        self.last_sample_time = 0
        self.lap_start_times = {}
        self.last_write_time = 0
        self.total_count = 0

    def _flush_to_disk(self):
        if not self.current_session: return
        existing_data = []
        if os.path.exists(self.latest_filepath):
            try:
                with open(self.latest_filepath, "r", encoding="utf-8") as f:
                    existing_data = json.load(f)
                    if not isinstance(existing_data, list): existing_data = []
            except Exception:
                existing_data = []
        existing_data.extend(self.current_session)
        try:
            with open(self.latest_filepath, "w", encoding="utf-8") as f:
                json.dump(existing_data, f, indent=4)
            self.current_session = []
            self.last_write_time = time.time()
        except Exception:
            pass

    def record(self, data: dict):
        if not app_settings.get("race_recording", True):
            if self.is_recording or self.current_session:
                self.clear()
            return

        is_race_on = (data.get("IsRaceOn", 0) == 1) or self.manual_mode

        if is_race_on:
            if not self.is_recording:
                self.clear()
                self.is_recording = True
                if self.manual_mode: self.manual_mode = True
                try:
                    with open(self.latest_filepath, "w", encoding="utf-8") as f:
                        json.dump([], f)
                except Exception:
                    pass

            now = time.time()
            if now - self.last_sample_time >= self.downsample_interval:
                if self.total_count >= self.max_samples:
                    self.is_recording = False
                    return

                timestamp_ms = data.get("TimestampMS", 0)
                if self.first_timestamp is None: self.first_timestamp = timestamp_ms
                relative_time = (timestamp_ms - self.first_timestamp) / 1000.0
                current_lap = data.get("CurrentLap", 1)

                if current_lap not in self.lap_start_times:
                    self.lap_start_times[current_lap] = relative_time

                point = {
                    "time": round(relative_time, 2),
                    "SpeedMetersPerSecond": data.get("SpeedMetersPerSecond", 0.0),
                    "CurrentEngineRpm": data.get("CurrentEngineRpm", 0),
                    "Gear": data.get("Gear", 0),
                    "AccelInput": data.get("AccelInput", 0),
                    "BrakeInput": data.get("BrakeInput", 0),
                    "AccelerationX": data.get("AccelerationX", 0.0),
                    "AccelerationZ": data.get("AccelerationZ", 0.0),
                    "SuspTravel": list(data.get("NormalizedSuspensionTravel", [0]*4)),
                    "TireSlipAngle": list(data.get("TireSlipAngle", [0]*4)),
                    "TireSlipRatio": list(data.get("TireSlipRatio", [0]*4)),
                    "TireTemp": list(data.get("TireTemp", [0]*4)),
                    "PositionX": data.get("PositionX", 0.0),
                    "PositionY": data.get("PositionY", 0.0),
                    "PositionZ": data.get("PositionZ", 0.0),
                }
                self.current_session.append(point)
                self.total_count += 1
                self.last_sample_time = now

                if len(self.current_session) >= 150 or (now - self.last_write_time >= 30.0 and self.last_write_time > 0):
                    self._flush_to_disk()
        else:
            if self.is_recording:
                self.save_latest_and_clear(data)

    def save_latest_and_clear(self, last_data: dict):
        self._flush_to_disk()
        self.is_recording = False
        last_lap_num = last_data.get("CurrentLap", 1)
        last_lap_time = last_data.get("LastLap", 0.0)

        if last_lap_num in self.lap_start_times and last_lap_time > 0.0:
            cutoff_time = self.lap_start_times[last_lap_num] + last_lap_time
            if os.path.exists(self.latest_filepath):
                try:
                    with open(self.latest_filepath, "r", encoding="utf-8") as f:
                        all_points = json.load(f)
                    if isinstance(all_points, list):
                        filtered_points = [p for p in all_points if p.get("time", 0.0) <= cutoff_time]
                        with open(self.latest_filepath, "w", encoding="utf-8") as f:
                            json.dump(filtered_points, f, indent=4)
                except Exception:
                    pass
        self.clear()

class DragRecorder:
    def __init__(self):
        self.state = "IDLE"
        self.car_id = 0
        self.car_name = "Unknown"
        self.current_session = []
        self.first_timestamp = None
        self.start_speed = 0.0
        self.analysis_result = {}
        self.latest_filepath = os.path.join(DRAG_SESSIONS_DIR, "latest.json")

    def prepare(self):
        self.state = "PREPARED"
        self.current_session = []
        self.first_timestamp = None
        self.start_speed = 0.0
        self.analysis_result = {}
        logger.info("DragRecorder: PREPARED")

    def clear(self):
        self.state = "IDLE"
        self.current_session = []
        self.first_timestamp = None
        self.analysis_result = {}
        logger.info("DragRecorder: CLEARED")

    def record(self, data: dict):
        if self.state not in ["PREPARED", "RECORDING"]:
            return

        speed = data.get("SpeedMetersPerSecond", 0.0) * 3.6
        accel = data.get("AccelInput", 0)

        if self.state == "PREPARED":
            if accel > 250 and speed < 5.0:
                self.state = "RECORDING"
                self.car_id = data.get("CarOrdinal", 0)
                self.start_speed = speed
                logger.info(f"Drag test started for Car {self.car_id}")

        if self.state == "RECORDING":
            ts = data.get("TimestampMS", 0)
            if self.first_timestamp is None: self.first_timestamp = ts
            rel = (ts - self.first_timestamp) / 1000.0

            point = {
                "time": round(rel, 2),
                "SpeedMetersPerSecond": speed / 3.6,
                "CurrentEngineRpm": data.get("CurrentEngineRpm", 0.0),
                "Gear": data.get("Gear", 0),
                "AccelInput": accel,
                "BrakeInput": data.get("BrakeInput", 0),
                "ClutchInput": data.get("ClutchInput", 0),
                "TireSlipRatio": data.get("TireSlipRatio", [0]*4),
                "PositionX": data.get("PositionX", 0.0),
                "PositionZ": data.get("PositionZ", 0.0),
                "Yaw": data.get("Yaw", 0.0),
                "EngineMaxRpm": data.get("EngineMaxRpm", 0.0)
            }
            self.current_session.append(point)

            if len(self.current_session) > 500:
                if accel < 10 or speed < self.start_speed or (rel > 3.0 and speed < 1.0):
                    self.finish_recording()

    def finish_recording(self):
        self.state = "ANALYZING"
        try:
            self._analyze()
            with open(self.latest_filepath, "w", encoding="utf-8") as f:
                json.dump({"session": self.current_session, "analysis": self.analysis_result}, f, indent=4)
        except Exception as e:
            logger.error(f"Drag Analysis failed: {e}")
        self.state = "IDLE"

    def _analyze(self):
        if not self.current_session:
            return

        self.analysis_result = {
            "car_id": str(self.car_id),
            "car_name": car_database.get(str(self.car_id), {}).get("display_name", f"Car {self.car_id}"),
            "duration": self.current_session[-1]["time"],
            "max_speed_kmh": max(p["SpeedMetersPerSecond"] * 3.6 for p in self.current_session)
        }


race_recorder = RaceRecorder()
drag_recorder = DragRecorder()

def parse_udp(data: bytes):
    if len(data) < 232: return None
    try:
        is_race_on = struct.unpack_from("<i", data, 0)[0]
        ts = struct.unpack_from("<I", data, 4)[0]
        max_rpm = struct.unpack_from("<f", data, 8)[0]
        idle_rpm = struct.unpack_from("<f", data, 12)[0]
        rpm = struct.unpack_from("<f", data, 16)[0]
        accel_x, accel_y, accel_z = struct.unpack_from("<fff", data, 20)
        vel_x, vel_y, vel_z = struct.unpack_from("<fff", data, 32)
        yaw = struct.unpack_from("<f", data, 56)[0]
        susp = struct.unpack_from("<ffff", data, 68)
        slip = struct.unpack_from("<ffff", data, 84)
        rumble = struct.unpack_from("<ffff", data, 148)
        slip_angle = struct.unpack_from("<ffff", data, 164)
        comb_slip = struct.unpack_from("<ffff", data, 180)
        car_ord = struct.unpack_from("<i", data, 212)[0]

        parsed = {
            "IsRaceOn": is_race_on, "TimestampMS": ts, "EngineMaxRpm": max_rpm,
            "EngineIdleRpm": idle_rpm, "CurrentEngineRpm": rpm,
            "AccelerationX": accel_x, "AccelerationY": accel_y, "AccelerationZ": accel_z,
            "VelocityX": vel_x, "VelocityY": vel_y, "VelocityZ": vel_z,
            "Yaw": yaw, "NormalizedSuspensionTravel": list(susp), "TireSlipRatio": list(slip),
            "SurfaceRumble": list(rumble), "TireSlipAngle": list(slip_angle),
            "TireCombinedSlip": list(comb_slip), "CarOrdinal": car_ord
        }

        if len(data) >= 324:
            pos_x, pos_y, pos_z = struct.unpack_from("<fff", data, 244)
            speed = struct.unpack_from("<f", data, 256)[0]
            power = struct.unpack_from("<f", data, 260)[0]
            torque = struct.unpack_from("<f", data, 264)[0]
            tire_temp = struct.unpack_from("<ffff", data, 268)
            boost = struct.unpack_from("<f", data, 284)[0]
            fuel = struct.unpack_from("<f", data, 288)[0]
            dt = struct.unpack_from("<f", data, 292)[0]
            best, last, cur = struct.unpack_from("<fff", data, 296)
            crt = struct.unpack_from("<f", data, 308)[0]
            lap_num = struct.unpack_from("<H", data, 312)[0]
            rp = struct.unpack_from("<B", data, 314)[0]
            ain = struct.unpack_from("<B", data, 315)[0]
            bin = struct.unpack_from("<B", data, 316)[0]
            cin = struct.unpack_from("<B", data, 317)[0]
            hin = struct.unpack_from("<B", data, 318)[0]
            g = struct.unpack_from("<B", data, 319)[0]
            sin = struct.unpack_from("<b", data, 320)[0]

            parsed.update({
                "PositionX": pos_x, "PositionY": pos_y, "PositionZ": pos_z,
                "SpeedMetersPerSecond": speed, "PowerWatts": power, "TorqueNewtons": torque,
                "TireTemp": list(tire_temp), "Boost": boost, "Fuel": fuel,
                "DistanceTraveled": dt, "BestLap": best, "LastLap": last, "CurrentLap": cur,
                "CurrentRaceTime": crt, "LapNumber": lap_num, "RacePosition": rp,
                "AccelInput": ain, "BrakeInput": bin, "ClutchInput": cin,
                "HandBrakeInput": hin, "Gear": g, "SteerInput": sin
            })
        return parsed
    except Exception:
        return None

def main():
    prev_gear = 0
    last_gear_change_time = 0.0
    global last_dyno_save_time, last_gc_time

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind(("127.0.0.1", 8002))
    logger.info("Analysis worker listening on 127.0.0.1:8002")

    while True:
        try:
            data, _ = sock.recvfrom(1024)
            if not data:
                continue

            reload_settings()

            parsed = parse_udp(data)
            if not parsed:
                continue

            # Command packet emulation (if we wanted to send control packets to Python)
            if parsed.get("CarOrdinal") == -1:
                cmd = parsed.get("CurrentEngineRpm") # Using floats to pass command ID
                if cmd == 1.0: drag_recorder.prepare()
                elif cmd == 2.0: drag_recorder.clear()
                elif cmd == 3.0: race_recorder.clear()
                continue

            # Record
            race_recorder.record(parsed)
            drag_recorder.record(parsed)

            # Dyno
            car_id = str(parsed.get("CarOrdinal", 0))
            if car_id and car_id != "0":
                if car_id not in dyno_cache:
                    params = load_car_params(car_id)
                    if params: dyno_cache[car_id] = params
                    elif app_settings.get("race_recording", True):
                        params = {"drivetrain": "RWD", "dyno_curve": {}}
                        save_car_params(car_id, params)
                        dyno_cache[car_id] = params

                if app_settings.get("dyno_recording", True) and car_id in dyno_cache:
                    accel_input = parsed.get("AccelInput", 0)
                    gear = parsed.get("Gear", 0)
                    clutch_input = parsed.get("ClutchInput", 0)
                    brake_input = parsed.get("BrakeInput", 0)
                    handbrake_input = parsed.get("HandBrakeInput", 0)
                    rpm = parsed.get("CurrentEngineRpm", 0)

                    current_time = time.time()
                    if gear != prev_gear:
                        prev_gear = gear
                        last_gear_change_time = current_time

                    target_gear = app_settings.get("dyno_test_gear", 4)
                    gear_match = (target_gear == 0 or gear == target_gear)
                    no_braking = (brake_input == 0 and handbrake_input == 0)
                    no_transient = (current_time - last_gear_change_time >= 0.5) if app_settings.get("dyno_filter_transients", True) else True

                    no_slip = True
                    if app_settings.get("dyno_filter_slip", True):
                        drivetrain = dyno_cache[car_id].get("drivetrain", "RWD")
                        slip_ratios = parsed.get("TireSlipRatio", [0]*4)
                        if drivetrain == "RWD" and (abs(slip_ratios[2]) > 0.1 or abs(slip_ratios[3]) > 0.1): no_slip = False
                        elif drivetrain == "FWD" and (abs(slip_ratios[0]) > 0.1 or abs(slip_ratios[1]) > 0.1): no_slip = False
                        elif any(abs(s) > 0.1 for s in slip_ratios): no_slip = False

                    if rpm > 0 and accel_input == 255 and gear > 0 and clutch_input == 0 and gear_match and no_braking and no_transient and no_slip:
                        power_hp = parsed.get("PowerWatts", 0) / 745.7
                        torque_lbft = parsed.get("TorqueNewtons", 0) * 0.73756
                        bucket_int = int(rpm // DYNO_BUCKET_SIZE) * DYNO_BUCKET_SIZE
                        bucket = str(bucket_int)
                        curve = dyno_cache[car_id].get("dyno_curve", {})
                        existing = curve.get(bucket, {"hp": 0, "torque": 0, "hp_hist": [], "torque_hist": []})

                        neighbor_hp_vals = [curve[str(bucket_int + off)]["hp"] for off in DYNO_NEIGHBOR_OFFSETS if str(bucket_int + off) in curve]
                        neighbor_torque_vals = [curve[str(bucket_int + off)]["torque"] for off in DYNO_NEIGHBOR_OFFSETS if str(bucket_int + off) in curve]

                        updated = False
                        if dyno_is_reasonable(power_hp, neighbor_hp_vals):
                            existing["hp_hist"].append(power_hp)
                            if len(existing["hp_hist"]) > DYNO_MAX_HISTORY: existing["hp_hist"] = existing["hp_hist"][-DYNO_MAX_HISTORY:]
                            existing["hp"] = compute_dyno_value(existing["hp_hist"])
                            updated = True

                        if dyno_is_reasonable(torque_lbft, neighbor_torque_vals):
                            existing["torque_hist"].append(torque_lbft)
                            if len(existing["torque_hist"]) > DYNO_MAX_HISTORY: existing["torque_hist"] = existing["torque_hist"][-DYNO_MAX_HISTORY:]
                            existing["torque"] = compute_dyno_value(existing["torque_hist"])
                            updated = True

                        if updated:
                            curve[bucket] = existing
                            dyno_cache[car_id]["dyno_curve"] = curve
                            if time.time() - last_dyno_save_time > 5.0:
                                save_car_params(car_id, dyno_cache[car_id])
                                last_dyno_save_time = time.time()

            # GC
            if time.time() - last_gc_time > 60.0:
                gc.collect()
                last_gc_time = time.time()

        except Exception as e:
            logger.error(f"Worker loop error: {e}")

if __name__ == "__main__":
    main()
