import os
import sqlite3
import logging
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)


class TelemetrySQLite:
    """
    SQLite telemetry storage engine aligned with MoTeC i2 Channel Standard.
    Uses WAL (Write-Ahead Logging) mode for zero-latency high frequency batch writes.
    """

    def __init__(self, db_path: str):
        self.db_path = db_path
        os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=10.0)
        conn.row_factory = sqlite3.Row
        # Enable WAL mode for high frequency concurrent writes
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        return conn

    def _init_db(self):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            
            # Sessions table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    session_id TEXT PRIMARY KEY,
                    car_ordinal INTEGER DEFAULT 0,
                    car_name TEXT DEFAULT 'Unknown Car',
                    car_class INTEGER DEFAULT 0,
                    car_pi INTEGER DEFAULT 0,
                    start_time REAL NOT NULL,
                    total_laps INTEGER DEFAULT 0,
                    best_lap_time REAL DEFAULT 0.0,
                    total_distance REAL DEFAULT 0.0
                );
            """)

            # Laps summary table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS laps (
                    session_id TEXT NOT NULL,
                    lap_number INTEGER NOT NULL,
                    lap_time REAL DEFAULT 0.0,
                    start_distance REAL DEFAULT 0.0,
                    end_distance REAL DEFAULT 0.0,
                    max_speed_kmh REAL DEFAULT 0.0,
                    avg_speed_kmh REAL DEFAULT 0.0,
                    PRIMARY KEY (session_id, lap_number),
                    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
                );
            """)

            # Telemetry channels table (MoTeC Standard Channels)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS telemetry_channels (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    lap_number INTEGER NOT NULL,
                    relative_time REAL NOT NULL,
                    lap_distance REAL DEFAULT 0.0,
                    speed REAL DEFAULT 0.0,
                    rpm REAL DEFAULT 0.0,
                    gear INTEGER DEFAULT 0,
                    accel_pct REAL DEFAULT 0.0,
                    brake_pct REAL DEFAULT 0.0,
                    steer_pct REAL DEFAULT 0.0,
                    clutch_pct REAL DEFAULT 0.0,
                    handbrake_pct REAL DEFAULT 0.0,
                    accel_x REAL DEFAULT 0.0,
                    accel_y REAL DEFAULT 0.0,
                    accel_z REAL DEFAULT 0.0,
                    yaw REAL DEFAULT 0.0,
                    pitch REAL DEFAULT 0.0,
                    roll REAL DEFAULT 0.0,
                    pos_x REAL DEFAULT 0.0,
                    pos_y REAL DEFAULT 0.0,
                    pos_z REAL DEFAULT 0.0,
                    susp_fl REAL DEFAULT 0.0,
                    susp_fr REAL DEFAULT 0.0,
                    susp_rl REAL DEFAULT 0.0,
                    susp_rr REAL DEFAULT 0.0,
                    slip_angle_fl REAL DEFAULT 0.0,
                    slip_angle_fr REAL DEFAULT 0.0,
                    slip_angle_rl REAL DEFAULT 0.0,
                    slip_angle_rr REAL DEFAULT 0.0,
                    slip_ratio_fl REAL DEFAULT 0.0,
                    slip_ratio_fr REAL DEFAULT 0.0,
                    slip_ratio_rl REAL DEFAULT 0.0,
                    slip_ratio_rr REAL DEFAULT 0.0,
                    temp_fl REAL DEFAULT 0.0,
                    temp_fr REAL DEFAULT 0.0,
                    temp_rl REAL DEFAULT 0.0,
                    temp_rr REAL DEFAULT 0.0,
                    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
                );
            """)

            # Create Indexes for fast Lap & Distance querying
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_telemetry_session_lap ON telemetry_channels(session_id, lap_number);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_telemetry_distance ON telemetry_channels(session_id, lap_distance);")
            conn.commit()

    def create_session(self, session_id: str, car_ordinal: int = 0, car_name: str = "Unknown Car", car_class: int = 0, car_pi: int = 0, start_time: float = 0.0):
        with self._get_connection() as conn:
            conn.execute("""
                INSERT OR REPLACE INTO sessions (session_id, car_ordinal, car_name, car_class, car_pi, start_time)
                VALUES (?, ?, ?, ?, ?, ?);
            """, (session_id, car_ordinal, car_name, car_class, car_pi, start_time))
            conn.commit()

    def update_session_summary(self, session_id: str, total_laps: int, best_lap_time: float, total_distance: float):
        with self._get_connection() as conn:
            conn.execute("""
                UPDATE sessions 
                SET total_laps = ?, best_lap_time = ?, total_distance = ?
                WHERE session_id = ?;
            """, (total_laps, best_lap_time, total_distance, session_id))
            conn.commit()

    def save_laps_summary(self, session_id: str, laps_data: List[Dict[str, Any]]):
        with self._get_connection() as conn:
            for lap in laps_data:
                conn.execute("""
                    INSERT OR REPLACE INTO laps 
                    (session_id, lap_number, lap_time, start_distance, end_distance, max_speed_kmh, avg_speed_kmh)
                    VALUES (?, ?, ?, ?, ?, ?, ?);
                """, (
                    session_id,
                    lap.get("lap_number", 1),
                    lap.get("lap_time", 0.0),
                    lap.get("start_distance", 0.0),
                    lap.get("end_distance", 0.0),
                    lap.get("max_speed_kmh", 0.0),
                    lap.get("avg_speed_kmh", 0.0)
                ))
            conn.commit()

    def insert_points_batch(self, session_id: str, points: List[Dict[str, Any]]):
        if not points:
            return

        records = []
        for p in points:
            susp = p.get("SuspTravel", [0.0, 0.0, 0.0, 0.0])
            s_angle = p.get("TireSlipAngle", [0.0, 0.0, 0.0, 0.0])
            s_ratio = p.get("TireSlipRatio", [0.0, 0.0, 0.0, 0.0])
            temp = p.get("TireTemp", [0.0, 0.0, 0.0, 0.0])

            records.append((
                session_id,
                p.get("LapNumber", p.get("CurrentLap", 1)),
                p.get("time", p.get("relative_time", 0.0)),
                p.get("lap_distance", p.get("DistanceTraveled", 0.0)),
                p.get("SpeedMetersPerSecond", p.get("speed", 0.0)) * 3.6, # Store in km/h standard
                p.get("CurrentEngineRpm", p.get("rpm", 0.0)),
                p.get("Gear", p.get("gear", 0)),
                (p.get("AccelInput", p.get("accel_pct", 0)) / 255.0) * 100.0 if p.get("AccelInput") is not None and p.get("AccelInput") > 1 else p.get("accel_pct", 0.0),
                (p.get("BrakeInput", p.get("brake_pct", 0)) / 255.0) * 100.0 if p.get("BrakeInput") is not None and p.get("BrakeInput") > 1 else p.get("brake_pct", 0.0),
                (p.get("SteerInput", p.get("steer_pct", 0)) / 127.0) * 100.0 if p.get("SteerInput") is not None and abs(p.get("SteerInput")) > 1 else p.get("steer_pct", 0.0),
                (p.get("ClutchInput", p.get("clutch_pct", 0)) / 255.0) * 100.0 if p.get("ClutchInput") is not None and p.get("ClutchInput") > 1 else p.get("clutch_pct", 0.0),
                (p.get("HandBrakeInput", p.get("handbrake_pct", 0)) / 255.0) * 100.0 if p.get("HandBrakeInput") is not None and p.get("HandBrakeInput") > 1 else p.get("handbrake_pct", 0.0),
                p.get("AccelerationX", p.get("accel_x", 0.0)) / 9.81 if abs(p.get("AccelerationX", 0)) > 5 else p.get("accel_x", 0.0),
                p.get("AccelerationY", p.get("accel_y", 0.0)) / 9.81 if abs(p.get("AccelerationY", 0)) > 5 else p.get("accel_y", 0.0),
                p.get("AccelerationZ", p.get("accel_z", 0.0)) / 9.81 if abs(p.get("AccelerationZ", 0)) > 5 else p.get("accel_z", 0.0),
                p.get("Yaw", p.get("yaw", 0.0)),
                p.get("Pitch", p.get("pitch", 0.0)),
                p.get("Roll", p.get("roll", 0.0)),
                p.get("PositionX", p.get("pos_x", 0.0)),
                p.get("PositionY", p.get("pos_y", 0.0)),
                p.get("PositionZ", p.get("pos_z", 0.0)),
                susp[0] if len(susp) > 0 else 0.0,
                susp[1] if len(susp) > 1 else 0.0,
                susp[2] if len(susp) > 2 else 0.0,
                susp[3] if len(susp) > 3 else 0.0,
                s_angle[0] * 57.29578 if len(s_angle) > 0 and abs(s_angle[0]) < 10 else (s_angle[0] if len(s_angle) > 0 else 0.0),
                s_angle[1] * 57.29578 if len(s_angle) > 1 and abs(s_angle[1]) < 10 else (s_angle[1] if len(s_angle) > 1 else 0.0),
                s_angle[2] * 57.29578 if len(s_angle) > 2 and abs(s_angle[2]) < 10 else (s_angle[2] if len(s_angle) > 2 else 0.0),
                s_angle[3] * 57.29578 if len(s_angle) > 3 and abs(s_angle[3]) < 10 else (s_angle[3] if len(s_angle) > 3 else 0.0),
                s_ratio[0] if len(s_ratio) > 0 else 0.0,
                s_ratio[1] if len(s_ratio) > 1 else 0.0,
                s_ratio[2] if len(s_ratio) > 2 else 0.0,
                s_ratio[3] if len(s_ratio) > 3 else 0.0,
                temp[0] if len(temp) > 0 else 0.0,
                temp[1] if len(temp) > 1 else 0.0,
                temp[2] if len(temp) > 2 else 0.0,
                temp[3] if len(temp) > 3 else 0.0,
            ))

        with self._get_connection() as conn:
            conn.executemany("""
                INSERT INTO telemetry_channels (
                    session_id, lap_number, relative_time, lap_distance,
                    speed, rpm, gear, accel_pct, brake_pct, steer_pct, clutch_pct, handbrake_pct,
                    accel_x, accel_y, accel_z, yaw, pitch, roll, pos_x, pos_y, pos_z,
                    susp_fl, susp_fr, susp_rl, susp_rr,
                    slip_angle_fl, slip_angle_fr, slip_angle_rl, slip_angle_rr,
                    slip_ratio_fl, slip_ratio_fr, slip_ratio_rl, slip_ratio_rr,
                    temp_fl, temp_fr, temp_rl, temp_rr
                ) VALUES (
                    ?, ?, ?, ?,
                    ?, ?, ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?,
                    ?, ?, ?, ?,
                    ?, ?, ?, ?,
                    ?, ?, ?, ?
                );
            """, records)
            conn.commit()

    def list_all_sessions(self) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT session_id, car_ordinal, car_name, car_class, car_pi, start_time, total_laps, best_lap_time, total_distance
                FROM sessions
                ORDER BY start_time DESC;
            """)
            return [dict(row) for row in cursor.fetchall()]

    def get_session_laps(self, session_id: str) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT lap_number, lap_time, start_distance, end_distance, max_speed_kmh, avg_speed_kmh
                FROM laps
                WHERE session_id = ?
                ORDER BY lap_number ASC;
            """, (session_id,))
            return [dict(row) for row in cursor.fetchall()]

    def get_telemetry_points(self, session_id: str, lap_number: Optional[int] = None, downsample: int = 1) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            query = """
                SELECT 
                    relative_time as time, lap_number as LapNumber, lap_distance,
                    speed / 3.6 as SpeedMetersPerSecond, rpm as CurrentEngineRpm, gear as Gear,
                    accel_pct, brake_pct, steer_pct,
                    accel_x * 9.81 as AccelerationX, accel_z * 9.81 as AccelerationZ,
                    pos_x as PositionX, pos_y as PositionY, pos_z as PositionZ,
                    susp_fl, susp_fr, susp_rl, susp_rr,
                    slip_angle_fl, slip_angle_fr, slip_angle_rl, slip_angle_rr,
                    slip_ratio_fl, slip_ratio_fr, slip_ratio_rl, slip_ratio_rr,
                    temp_fl, temp_fr, temp_rl, temp_rr
                FROM telemetry_channels
                WHERE session_id = ?
            """
            params: list[Any] = [session_id]
            if lap_number is not None and lap_number > 0:
                query += " AND lap_number = ?"
                params.append(lap_number)
            
            query += " ORDER BY relative_time ASC"

            cursor.execute(query, params)
            rows = cursor.fetchall()
            
            result = []
            for idx, r in enumerate(rows):
                if downsample > 1 and idx % downsample != 0:
                    continue
                d = dict(r)
                d["SuspTravel"] = [d.pop("susp_fl"), d.pop("susp_fr"), d.pop("susp_rl"), d.pop("susp_rr")]
                d["TireSlipAngle"] = [d.pop("slip_angle_fl") / 57.29578, d.pop("slip_angle_fr") / 57.29578, d.pop("slip_angle_rl") / 57.29578, d.pop("slip_angle_rr") / 57.29578]
                d["TireSlipRatio"] = [d.pop("slip_ratio_fl"), d.pop("slip_ratio_fr"), d.pop("slip_ratio_rl"), d.pop("slip_ratio_rr")]
                d["TireTemp"] = [d.pop("temp_fl"), d.pop("temp_fr"), d.pop("temp_rl"), d.pop("temp_rr")]
                d["AccelInput"] = int((d.get("accel_pct", 0) / 100.0) * 255)
                d["BrakeInput"] = int((d.get("brake_pct", 0) / 100.0) * 255)
                result.append(d)
            return result

    def delete_session(self, session_id: str) -> bool:
        with self._get_connection() as conn:
            conn.execute("DELETE FROM sessions WHERE session_id = ?;", (session_id,))
            conn.commit()
            return True
