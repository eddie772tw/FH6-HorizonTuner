import asyncio
import os
import logging
import json
import time
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from typing import List

from telemetry_listener import start_udp_listener

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Ensure directories exist
TUNINGS_DIR = os.path.join(os.path.dirname(__file__), "tunings")
CAR_PARAMS_DIR = os.path.join(os.path.dirname(__file__), "car_params")
CAR_DB_PATH = os.path.join(os.path.dirname(__file__), "car_database.json")
os.makedirs(TUNINGS_DIR, exist_ok=True)
os.makedirs(CAR_PARAMS_DIR, exist_ok=True)

car_database = {}
if os.path.exists(CAR_DB_PATH):
    try:
        with open(CAR_DB_PATH, "r", encoding="utf-8") as f:
            car_database = json.load(f)
    except Exception as e:
        logger.error(f"Failed to load car database: {e}")

app = FastAPI(title="FH6 Telemetry Tuning Tool API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"Client connected. Total clients: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info(f"Client disconnected. Total clients: {len(self.active_connections)}")

    async def broadcast_json(self, data: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(data)
            except Exception as e:
                logger.error(f"Error sending data to client: {e}")
                self.disconnect(connection)

manager = ConnectionManager()
telemetry_queue = asyncio.Queue(maxsize=100)

# Memory cache for dyno data to avoid disk I/O every frame
dyno_cache = {}
last_dyno_save_time = time.time()

# --- Settings File Paths & Defaults ---
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SETTINGS_FILE = os.path.join(ROOT_DIR, "settings.json")
LANG_DIR = os.path.join(ROOT_DIR, "lang")

# Ensure directories exist
os.makedirs(LANG_DIR, exist_ok=True)

DEFAULT_SETTINGS = {
    "dyno_recording": True,
    "race_recording": True,
    "language": "en-us",
    "units": {
        "speed": "kmh",
        "weight": "kg",
        "temperature": "C",
        "tirePressure": "bar",
        "boostPressure": "psi",
        "springRate": "kgfmm",
        "rideHeight": "cm",
        "suspensionForce": "kgf",
        "power": "kw",
        "torque": "nm"
    }
}

app_settings = {
    "dyno_recording": True,
    "race_recording": True,
    "language": "en-us",
    "units": dict(DEFAULT_SETTINGS["units"])
}

# Load settings from settings.json
if os.path.exists(SETTINGS_FILE):
    try:
        with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
            loaded = json.load(f)
            for k, v in loaded.items():
                if k == "units" and isinstance(v, dict):
                    app_settings["units"].update(v)
                else:
                    app_settings[k] = v
        logger.info(f"Loaded settings from {SETTINGS_FILE}")
    except Exception as e:
        logger.error(f"Failed to load settings from {SETTINGS_FILE}: {e}")
else:
    try:
        with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
            json.dump(app_settings, f, indent=4)
        logger.info(f"Created default settings at {SETTINGS_FILE}")
    except Exception as e:
        logger.error(f"Failed to save default settings to {SETTINGS_FILE}: {e}")

# --- Dyno Collection Constants ---
DYNO_BUCKET_SIZE = 50       # RPM per bucket (denser than 100 for higher resolution)
DYNO_ANOMALY_THRESHOLD = 0.30   # 30% neighbor deviation threshold
DYNO_NEIGHBOR_OFFSETS = [-200, -150, -100, -50, 50, 100, 150, 200]
DYNO_MAX_HISTORY = 50  # Max historical records per RPM bucket

def compute_dyno_value(history):
    """Compute robust value from history using IQR outlier filtering + recency weighting.
    
    1. If < 4 samples, return max (not enough for statistics)
    2. IQR filter: remove values outside [Q1 - 1.5*IQR, Q3 + 1.5*IQR]
    3. Recency-weighted mean of filtered values (newer entries = higher weight)
    """
    if not history:
        return 0
    n = len(history)
    if n < 4:
        return max(history)
    
    sorted_vals = sorted(history)
    q1 = sorted_vals[n // 4]
    q3 = sorted_vals[(3 * n) // 4]
    iqr = q3 - q1
    lower_fence = q1 - 1.5 * iqr
    upper_fence = q3 + 1.5 * iqr
    
    # Recency-weighted computation (history is oldest-first, index 0 = oldest)
    weighted_sum = 0.0
    total_weight = 0.0
    for i, val in enumerate(history):
        if lower_fence <= val <= upper_fence:
            weight = 1.0 + i  # newer = higher weight
            weighted_sum += val * weight
            total_weight += weight
    
    if total_weight == 0:
        return max(history)  # fallback if all filtered
    
    return weighted_sum / total_weight

def dyno_is_reasonable(new_val, neighbor_vals, threshold=DYNO_ANOMALY_THRESHOLD):
    """Check if new_val is within threshold of neighbor context."""
    if not neighbor_vals:
        return True  # No neighbors yet, accept any value
    max_neighbor = max(neighbor_vals)
    if max_neighbor <= 0:
        return True
    # Reject if new value exceeds neighbors by more than threshold
    return new_val <= max_neighbor * (1 + threshold)

def load_car_params(car_id: str):
    file_path = os.path.join(CAR_PARAMS_DIR, f"{car_id}.json")
    if os.path.exists(file_path):
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return None

def save_car_params(car_id: str, data: dict):
    file_path = os.path.join(CAR_PARAMS_DIR, f"{car_id}.json")
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4)

@app.on_event("startup")
async def startup_event():
    # Customizable IP and Port
    ip = os.getenv("TELEMETRY_IP", "0.0.0.0")
    port = int(os.getenv("TELEMETRY_PORT", "8000"))
    
    # Start UDP listener in the background
    asyncio.create_task(start_udp_listener(ip, port, telemetry_queue))
    # Start the broadcast loop
    asyncio.create_task(broadcast_telemetry())

async def broadcast_telemetry():
    global last_dyno_save_time
    logger.info("Broadcasting loop started.")
    while True:
        data = await telemetry_queue.get()
        
        # --- Dyno Collection Logic ---
        car_id = str(data.get("CarOrdinal", 0))
        if car_id and car_id != "0":
            # Load existing params into cache (always), auto-create only if race_recording
            if car_id not in dyno_cache:
                params = load_car_params(car_id)
                if params:
                    dyno_cache[car_id] = params
                elif app_settings.get("race_recording", True):
                    # Auto-create default profile
                    params = {
                        "weight": 1500,
                        "weight_distribution": 50,
                        "drivetrain": "RWD",
                        "frontTireWidth": 245,
                        "frontTireAspect": 40,
                        "frontTireRim": 18,
                        "rearTireWidth": 245,
                        "rearTireAspect": 40,
                        "rearTireRim": 18,
                        "adjustability": {
                            "gearbox": "Full",
                            "gears": 6,
                            "suspension": "Race",
                            "arb": "Adjustable"
                        },
                        "dyno_curve": {}
                    }
                    save_car_params(car_id, params)
                    dyno_cache[car_id] = params
            
            # Only collect dyno data if recording is enabled AND car is in cache
            if app_settings.get("dyno_recording", True) and car_id in dyno_cache:
                # --- WOT (Wide Open Throttle) Filter ---
                accel_input = data.get("AccelInput", 0)
                gear = data.get("Gear", 0)
                clutch_input = data.get("ClutchInput", 0)
                
                rpm = data.get("CurrentEngineRpm", 0)
                if rpm > 0 and accel_input == 255 and gear > 0 and clutch_input == 0:
                    power_hp = data.get("PowerWatts", 0) / 745.7
                    torque_lbft = data.get("TorqueNewtons", 0) * 0.73756
                    
                    bucket_int = int(rpm // DYNO_BUCKET_SIZE) * DYNO_BUCKET_SIZE
                    bucket = str(bucket_int)
                    curve = dyno_cache[car_id].get("dyno_curve", {})
                    
                    existing = curve.get(bucket, {"hp": 0, "torque": 0, "hp_hist": [], "torque_hist": []})
                    hp_hist = existing.get("hp_hist", [])
                    torque_hist = existing.get("torque_hist", [])
                    
                    # --- Multi-Neighbor Consistency Check (±200 RPM, 8 neighbors) ---
                    neighbor_hp_vals = []
                    neighbor_torque_vals = []
                    for offset in DYNO_NEIGHBOR_OFFSETS:
                        nb_key = str(bucket_int + offset)
                        if nb_key in curve:
                            neighbor_hp_vals.append(curve[nb_key]["hp"])
                            neighbor_torque_vals.append(curve[nb_key]["torque"])
                    
                    updated = False
                    
                    # Add to HP history if reasonable
                    if dyno_is_reasonable(power_hp, neighbor_hp_vals):
                        hp_hist.append(power_hp)
                        if len(hp_hist) > DYNO_MAX_HISTORY:
                            hp_hist = hp_hist[-DYNO_MAX_HISTORY:]
                        existing["hp_hist"] = hp_hist
                        existing["hp"] = compute_dyno_value(hp_hist)
                        updated = True
                    
                    # Add to Torque history if reasonable
                    if dyno_is_reasonable(torque_lbft, neighbor_torque_vals):
                        torque_hist.append(torque_lbft)
                        if len(torque_hist) > DYNO_MAX_HISTORY:
                            torque_hist = torque_hist[-DYNO_MAX_HISTORY:]
                        existing["torque_hist"] = torque_hist
                        existing["torque"] = compute_dyno_value(torque_hist)
                        updated = True
                    
                    if updated:
                        curve[bucket] = existing
                        dyno_cache[car_id]["dyno_curve"] = curve
                        
                        # Periodic save to disk (every 5 seconds max)
                        current_time = time.time()
                        if current_time - last_dyno_save_time > 5.0:
                            save_car_params(car_id, dyno_cache[car_id])
                            last_dyno_save_time = current_time

        if manager.active_connections:
            await manager.broadcast_json(data)
        
        # Give control back to event loop
        await asyncio.sleep(0.01)

@app.websocket("/ws/telemetry")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket)

# --- Car Params API Endpoints ---

@app.get("/api/cars/database")
async def get_car_database():
    return car_database

@app.get("/api/cars/with_params")
async def get_cars_with_params():
    try:
        files = [f.replace(".json", "") for f in os.listdir(CAR_PARAMS_DIR) if f.endswith(".json")]
        result = []
        for car_id in files:
            name = car_database.get(car_id, {}).get("display_name", f"Car {car_id}")
            result.append({"id": car_id, "name": name})
        result.sort(key=lambda x: x["name"])
        return result
    except Exception as e:
        logger.error(f"Failed to list cars with params: {e}")
        return []


@app.get("/api/car_params/{car_id}")
async def get_car_params(car_id: str):
    params = load_car_params(car_id)
    if params:
        return params
    return {"error": "Car parameters not found"}

@app.post("/api/car_params/{car_id}")
async def update_car_params(car_id: str, data: dict):
    # Merge with existing to avoid overwriting dyno curve if not provided
    params = load_car_params(car_id) or {}
    params.update(data)
    save_car_params(car_id, params)
    # Update cache
    dyno_cache[car_id] = params
    return {"message": "Car parameters saved successfully"}

@app.delete("/api/car_params/{car_id}/dyno_curve")
async def clear_dyno_curve(car_id: str):
    """Clear all dyno curve data for a specific car."""
    # Update memory cache
    if car_id in dyno_cache:
        dyno_cache[car_id]["dyno_curve"] = {}
        dyno_cache[car_id].pop("maxHpRpm", None)
        dyno_cache[car_id].pop("maxTorqueRpm", None)
        save_car_params(car_id, dyno_cache[car_id])
    else:
        # Also handle case where data is only on disk
        params = load_car_params(car_id)
        if params:
            params["dyno_curve"] = {}
            params.pop("maxHpRpm", None)
            params.pop("maxTorqueRpm", None)
            save_car_params(car_id, params)
            dyno_cache[car_id] = params
        else:
            return {"error": "Car parameters not found"}
    return {"message": "Dyno curve data cleared successfully"}

# --- Settings API ---

@app.get("/api/settings")
async def get_settings():
    return app_settings

@app.post("/api/settings")
async def update_settings(data: dict):
    if "dyno_recording" in data:
        app_settings["dyno_recording"] = bool(data["dyno_recording"])
    if "race_recording" in data:
        app_settings["race_recording"] = bool(data["race_recording"])
    if "language" in data:
        app_settings["language"] = str(data["language"])
    if "units" in data and isinstance(data["units"], dict):
        if "units" not in app_settings:
            app_settings["units"] = {}
        app_settings["units"].update(data["units"])
    
    # Save to file
    try:
        with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
            json.dump(app_settings, f, indent=4)
        logger.info(f"Saved settings to {SETTINGS_FILE}")
    except Exception as e:
        logger.error(f"Failed to save settings to {SETTINGS_FILE}: {e}")
        
    return app_settings

# --- Languages API ---

@app.get("/api/languages")
async def list_languages():
    # Always include English (US) which is hardcoded in the frontend
    languages = [{"code": "en-us", "name": "English (US)"}]
    
    if os.path.exists(LANG_DIR):
        for filename in os.listdir(LANG_DIR):
            if filename.endswith(".json"):
                code = filename[:-5].lower()
                # Skip en-us if it's somehow in the folder to prevent duplication
                if code == "en-us":
                    continue
                file_path = os.path.join(LANG_DIR, filename)
                try:
                    with open(file_path, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        name = data.get("__language_name__", filename[:-5])
                        languages.append({"code": code, "name": name})
                except Exception as e:
                    logger.error(f"Failed to read language file {filename}: {e}")
                    
    return languages

@app.get("/api/languages/{code}")
async def get_language(code: str):
    code = code.lower()
    if code == "en-us":
        return {}
        
    file_path = os.path.join(LANG_DIR, f"{code}.json")
    if os.path.exists(file_path):
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            return {"error": f"Failed to read language file: {e}"}
            
    return {"error": "Language not found"}

# --- Tuning API Endpoints ---

@app.get("/api/tunings")
async def list_tunings():
    files = [f.replace(".json", "") for f in os.listdir(TUNINGS_DIR) if f.endswith(".json")]
    return {"tunings": files}

@app.get("/api/tunings/{car_id}/{save_name}")
async def get_tuning(car_id: str, save_name: str):
    file_path = os.path.join(TUNINGS_DIR, f"{car_id}-{save_name}.json")
    if os.path.exists(file_path):
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"error": "Tuning not found"}

@app.post("/api/tunings/{car_id}/{save_name}")
async def save_tuning(car_id: str, save_name: str, data: dict):
    file_path = os.path.join(TUNINGS_DIR, f"{car_id}-{save_name}.json")
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4)
    return {"message": "Saved successfully"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001)
