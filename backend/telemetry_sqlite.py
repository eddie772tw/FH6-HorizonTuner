import json
import logging
import os
import re
import sqlite3
from typing import Any, Dict, List, Optional

from road_analysis import summarize_laps
from telemetry_contract import LEGACY_POINT_SCHEMA, decoded_point

logger = logging.getLogger(__name__)

DEFAULT_ARRAY = (0.0, 0.0, 0.0, 0.0)


class TelemetrySQLite:
    """SQLite telemetry storage engine aligned with MoTeC i2 Channel Standard.
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
                    susp_meters_fl REAL DEFAULT 0.0,
                    susp_meters_fr REAL DEFAULT 0.0,
                    susp_meters_rl REAL DEFAULT 0.0,
                    susp_meters_rr REAL DEFAULT 0.0,
                    power_watts REAL DEFAULT 0.0,
                    torque_newtons REAL DEFAULT 0.0,
                    boost REAL DEFAULT 0.0,
                    fuel REAL DEFAULT 1.0,
                    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
                );
            """)

            for table, additions in (
                ("sessions", (("metadata_json", "TEXT"),)),
                (
                    "laps",
                    (
                        ("lap_time_source", "TEXT DEFAULT 'sample-span-estimate'"),
                        ("complete", "INTEGER DEFAULT 0"),
                        ("observed_span", "REAL"),
                    ),
                ),
            ):
                existing = {
                    row[1] for row in conn.execute(f"PRAGMA table_info({table})")
                }
                for name, definition in additions:
                    if name not in existing:
                        conn.execute(
                            f"ALTER TABLE {table} ADD COLUMN {name} {definition}"
                        )

            # Column migration for existing tables
            cursor.execute("PRAGMA table_info(telemetry_channels);")
            existing_cols = {col[1] for col in cursor.fetchall()}
            new_columns = [
                ("raw_json", "TEXT"),
                ("susp_meters_fl", "REAL DEFAULT 0.0"),
                ("susp_meters_fr", "REAL DEFAULT 0.0"),
                ("susp_meters_rl", "REAL DEFAULT 0.0"),
                ("susp_meters_rr", "REAL DEFAULT 0.0"),
                ("power_watts", "REAL DEFAULT 0.0"),
                ("torque_newtons", "REAL DEFAULT 0.0"),
                ("boost", "REAL DEFAULT 0.0"),
                ("fuel", "REAL DEFAULT 1.0"),
            ]
            for col_name, col_def in new_columns:
                if col_name not in existing_cols:
                    # Validate column name and definition to prevent SQL injection in DDL statement
                    if not re.match(r"^[a-zA-Z0-9_]+$", col_name):
                        raise ValueError(f"Invalid column name: {col_name}")
                    if not re.match(r"^[a-zA-Z0-9_\. ]+$", col_def):
                        raise ValueError(f"Invalid column definition: {col_def}")

                    cursor.execute(
                        f"ALTER TABLE telemetry_channels ADD COLUMN {col_name} {col_def};"
                    )

            # Create Indexes for fast Lap & Distance querying
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_telemetry_session_lap ON telemetry_channels(session_id, lap_number);"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_telemetry_distance ON telemetry_channels(session_id, lap_distance);"
            )
            conn.commit()

    def create_session(
        self,
        session_id: str,
        car_ordinal: int = 0,
        car_name: str = "Unknown Car",
        car_class: int = 0,
        car_pi: int = 0,
        start_time: float = 0.0,
    ):
        with self._get_connection() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO sessions (session_id, car_ordinal, car_name, car_class, car_pi, start_time)
                VALUES (?, ?, ?, ?, ?, ?);
            """,
                (session_id, car_ordinal, car_name, car_class, car_pi, start_time),
            )
            conn.commit()

    def update_session_summary(
        self,
        session_id: str,
        total_laps: int,
        best_lap_time: float,
        total_distance: float,
    ):
        with self._get_connection() as conn:
            conn.execute(
                """
                UPDATE sessions
                SET total_laps = ?, best_lap_time = ?, total_distance = ?
                WHERE session_id = ?;
            """,
                (total_laps, best_lap_time, total_distance, session_id),
            )
            conn.commit()

    def save_laps_summary(self, session_id: str, laps_data: List[Dict[str, Any]]):
        if not laps_data:
            return

        with self._get_connection() as conn:
            # Optimize: use executemany instead of a loop of executes
            conn.executemany(
                """
                INSERT OR REPLACE INTO laps
                (session_id, lap_number, lap_time, start_distance, end_distance, max_speed_kmh, avg_speed_kmh, lap_time_source, complete, observed_span)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """,
                [
                    (
                        session_id,
                        lap.get("lap_number", 1),
                        lap.get("lap_time", 0.0),
                        lap.get("start_distance", 0.0),
                        lap.get("end_distance", 0.0),
                        lap.get("max_speed_kmh", 0.0),
                        lap.get("avg_speed_kmh", 0.0),
                        lap.get("lap_time_source", "sample-span-estimate"),
                        int(lap.get("complete", False)),
                        lap.get("observed_span"),
                    )
                    for lap in laps_data
                ],
            )
            conn.commit()

    def insert_points_batch(self, session_id: str, points: List[Dict[str, Any]]):
        if not points:
            return

        # New rows retain the explicit decoded contract in addition to the
        # compatibility columns. Old rows remain identifiable as lossy legacy
        # data; no migration invents measurements that were never saved.
        records = []
        for source in points:
            p = decoded_point(source)
            acceleration = [
                p[key] / 9.81 if p[key] is not None else None
                for key in ("AccelerationX", "AccelerationY", "AccelerationZ")
            ]
            records.append(
                (
                    session_id,
                    p["LapNumber"] if p["LapNumber"] is not None else 0,
                    p["time"] if p["time"] is not None else 0,
                    p["DistanceTraveled"],
                    p["SpeedMetersPerSecond"] * 3.6
                    if p["SpeedMetersPerSecond"] is not None
                    else None,
                    p["CurrentEngineRpm"],
                    p["Gear"],
                    p["accel_pct"],
                    p["brake_pct"],
                    p["steer_pct"],
                    p["clutch_pct"],
                    p["handbrake_pct"],
                    *acceleration,
                    p["Yaw"],
                    p["Pitch"],
                    p["Roll"],
                    p["PositionX"],
                    p["PositionY"],
                    p["PositionZ"],
                    *p["NormalizedSuspensionTravel"],
                    *p["TireSlipAngle"],
                    *p["TireSlipRatio"],
                    *p["TireTemp"],
                    *p["SuspensionTravelMeters"],
                    p["PowerWatts"],
                    p["TorqueNewtons"],
                    p["Boost"],
                    p["Fuel"],
                    json.dumps(p, allow_nan=False, separators=(",", ":")),
                )
            )
        columns = """
            session_id, lap_number, relative_time, lap_distance, speed, rpm, gear,
            accel_pct, brake_pct, steer_pct, clutch_pct, handbrake_pct,
            accel_x, accel_y, accel_z, yaw, pitch, roll, pos_x, pos_y, pos_z,
            susp_fl, susp_fr, susp_rl, susp_rr, slip_angle_fl, slip_angle_fr, slip_angle_rl, slip_angle_rr,
            slip_ratio_fl, slip_ratio_fr, slip_ratio_rl, slip_ratio_rr, temp_fl, temp_fr, temp_rl, temp_rr,
            susp_meters_fl, susp_meters_fr, susp_meters_rl, susp_meters_rr,
            power_watts, torque_newtons, boost, fuel, raw_json
        """
        # All identifiers above are static source, never user-provided SQL.
        with self._get_connection() as conn:
            conn.executemany(
                f"INSERT INTO telemetry_channels ({columns}) VALUES ({','.join('?' for _ in records[0])})",
                records,
            )
            conn.commit()

    def get_session_metadata(self, session_id: str) -> dict:
        with self._get_connection() as conn:
            row = conn.execute(
                "SELECT metadata_json FROM sessions WHERE session_id = ?", (session_id,)
            ).fetchone()
            return json.loads(row[0]) if row and row[0] else {}

    def set_session_metadata(self, session_id: str, metadata: dict) -> None:
        with self._get_connection() as conn:
            conn.execute(
                "UPDATE sessions SET metadata_json = ? WHERE session_id = ?",
                (json.dumps(metadata, allow_nan=False), session_id),
            )

    def finalize_session(
        self, session_id: str, metadata: dict | None = None
    ) -> Dict[str, Any]:
        """Persist attributed game times separately from partial sample spans."""
        points = self.get_telemetry_points(session_id)
        laps = summarize_laps(points)
        summary = [
            {
                "lap_number": lap["lapIndex"],
                "lap_time": lap["lapTimeSeconds"],
                "lap_time_source": lap["lapTimeSource"],
                "complete": lap["complete"],
                "observed_span": lap["observedSpanSeconds"],
                "start_distance": None,
                "end_distance": None,
                "max_speed_kmh": lap["maxSpeedKmh"],
                "avg_speed_kmh": lap["meanSpeedKmh"],
            }
            for lap in laps
        ]
        complete_times = [lap["lapTimeSeconds"] for lap in laps if lap["complete"]]
        distances = [
            p["lap_distance"]
            for p in points
            if isinstance(p.get("lap_distance"), (int, float))
        ]
        result = {
            "session_id": session_id,
            "total_laps": len(complete_times),
            "best_lap_time": min(complete_times) if complete_times else 0.0,
            "total_distance": max(distances) - min(distances) if distances else 0.0,
        }
        self.save_laps_summary(session_id, summary)
        self.update_session_summary(**result)
        record = self.get_session_metadata(session_id)
        record.update(metadata or {})
        record.update(
            {
                "state": "finalized",
                "lapTimingVersion": "road-observations/v1",
                "completeLaps": len(complete_times),
                "observedLaps": len(laps),
            }
        )
        self.set_session_metadata(session_id, record)
        return result

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
            cursor.execute(
                """
                SELECT lap_number, lap_time, start_distance, end_distance, max_speed_kmh, avg_speed_kmh, lap_time_source, complete, observed_span
                FROM laps
                WHERE session_id = ?
                ORDER BY lap_number ASC;
            """,
                (session_id,),
            )
            return [dict(row) for row in cursor.fetchall()]

    def get_telemetry_points(
        self, session_id: str, lap_number: Optional[int] = None, downsample: int = 1
    ) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            query = """
                SELECT
                    relative_time, lap_number, lap_distance,
                    speed / 3.6, rpm, gear,
                    accel_pct, brake_pct, steer_pct,
                    accel_x * 9.81, accel_y * 9.81, accel_z * 9.81,
                    pos_x, pos_y, pos_z,
                    susp_fl, susp_fr, susp_rl, susp_rr,
                    slip_angle_fl / 57.29578, slip_angle_fr / 57.29578, slip_angle_rl / 57.29578, slip_angle_rr / 57.29578,
                    slip_ratio_fl, slip_ratio_fr, slip_ratio_rl, slip_ratio_rr,
                    temp_fl, temp_fr, temp_rl, temp_rr,
                    clutch_pct, handbrake_pct,
                    susp_meters_fl, susp_meters_fr, susp_meters_rl, susp_meters_rr,
                    power_watts, torque_newtons, boost, fuel, raw_json
                FROM telemetry_channels
                WHERE session_id = ?
            """
            params: list[Any] = [session_id]
            if lap_number is not None:
                query += " AND lap_number = ?"
                params.append(lap_number)

            # Arrival order preserves clock regressions and missing timestamps.
            query += " ORDER BY id ASC"

            cursor.row_factory = None  # type: ignore # Bypass sqlite3.Row for raw tuple performance
            cursor.execute(query, params)
            rows = cursor.fetchall()

            return [
                json.loads(r[41])
                if r[41]
                else {
                    "sourceSchema": LEGACY_POINT_SCHEMA,
                    "time": r[0],
                    "LapNumber": r[1],
                    "lap_distance": r[2],
                    "SpeedMetersPerSecond": r[3],
                    "CurrentEngineRpm": r[4],
                    "Gear": r[5],
                    "accel_pct": r[6],
                    "brake_pct": r[7],
                    "steer_pct": r[8],
                    "AccelerationX": r[9],
                    "AccelerationY": r[10],
                    "AccelerationZ": r[11],
                    "PositionX": r[12],
                    "PositionY": r[13],
                    "PositionZ": r[14],
                    "SuspTravel": [r[15], r[16], r[17], r[18]],
                    "TireSlipAngle": [r[19], r[20], r[21], r[22]],
                    "TireSlipRatio": [r[23], r[24], r[25], r[26]],
                    "TireTemp": [r[27], r[28], r[29], r[30]],
                    "AccelInput": int(((r[6] or 0) / 100.0) * 255),
                    "BrakeInput": int(((r[7] or 0) / 100.0) * 255),
                    "clutch_pct": r[31] or 0.0,
                    "handbrake_pct": r[32] or 0.0,
                    "ClutchInput": int(((r[31] or 0) / 100.0) * 255),
                    "HandBrakeInput": int(((r[32] or 0) / 100.0) * 255),
                    "SuspensionTravelMeters": [
                        r[33] or 0.0,
                        r[34] or 0.0,
                        r[35] or 0.0,
                        r[36] or 0.0,
                    ],
                    "PowerWatts": r[37] or 0.0,
                    "Power": r[37] or 0.0,
                    "TorqueNewtons": r[38] or 0.0,
                    "Torque": r[38] or 0.0,
                    "Boost": r[39] or 0.0,
                    "Fuel": r[40] if r[40] is not None else 1.0,
                }
                for i in range(0, len(rows), max(1, downsample))
                if (r := rows[i]) or True
            ]

    def delete_session(self, session_id: str) -> bool:
        with self._get_connection() as conn:
            # Explicitly delete child records since ON DELETE CASCADE requires PRAGMA foreign_keys=ON,
            # which is not enabled by default or guaranteed across connections.
            conn.execute(
                "DELETE FROM telemetry_channels WHERE session_id = ?;", (session_id,)
            )
            conn.execute("DELETE FROM laps WHERE session_id = ?;", (session_id,))
            conn.execute("DELETE FROM sessions WHERE session_id = ?;", (session_id,))
            conn.commit()
            return True
