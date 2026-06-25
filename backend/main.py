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
    ip = os.getenv("TELEMETRY_IP", "127.0.0.1")
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
            # Auto-create if not exists
            if car_id not in dyno_cache:
                params = load_car_params(car_id)
                if not params:
                    # Default template
                    params = {
                        "weight": 1500,
                        "weight_distribution": 50,
                        "drivetrain": "RWD",
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
            
            # Extract power and torque
            rpm = data.get("CurrentEngineRpm", 0)
            if rpm > 0:
                power_hp = data.get("PowerWatts", 0) / 745.7
                torque_lbft = data.get("TorqueNewtons", 0) * 0.73756
                
                bucket = str(int(rpm // 100) * 100)
                curve = dyno_cache[car_id].get("dyno_curve", {})
                
                existing = curve.get(bucket, {"hp": 0, "torque": 0})
                updated = False
                if power_hp > existing["hp"]:
                    existing["hp"] = power_hp
                    updated = True
                if torque_lbft > existing["torque"]:
                    existing["torque"] = torque_lbft
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
    uvicorn.run(app, host="0.0.0.0", port=8001)
