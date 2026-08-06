"""LabsGG & MapGenie POI Coordinate Calibration & Exporter.

Performs 2D affine coordinate transformation from LabsGG / MapGenie
map space to Forza Horizon 6 UDP world space coordinates (meters X, Z),
ensuring strictly zero emojis and clean schema output.
"""

import json
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
CONFIG_PATH = Path(__file__).resolve().parent / "map_calibration_config.json"
LABSGG_RAW_PATH = Path(__file__).resolve().parent / "labsgg_raw_locations.json"
MAPGENIE_RAW_PATH = Path(__file__).resolve().parent / "mapgenie_raw_locations.json"
OUT_JSON_PATH = ROOT_DIR / "hud_overlay" / "assets" / "japan_pois.json"


def load_config():
    """Load calibration matrix config."""
    if CONFIG_PATH.exists():
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"centerX": 1200.0, "centerY": 800.0, "scaleX": 0.85, "scaleZ": -0.85}


CATEGORY_MAP = {
    "asphalt": {
        "category": "poi",
        "type": "road_asphalt",
        "symbol": "R",
        "color": "#00f0ff",
    },
    "dirt": {"category": "poi", "type": "road_dirt", "symbol": "D", "color": "#ffaa00"},
    "dirtSnow": {
        "category": "poi",
        "type": "road_snow",
        "symbol": "S",
        "color": "#ffffff",
    },
    "Festival Site": {
        "category": "poi",
        "type": "festival",
        "symbol": "F",
        "color": "#ff00aa",
    },
    "Horizon Event": {
        "category": "poi",
        "type": "festival",
        "symbol": "F",
        "color": "#ff00aa",
    },
    "Drift Zone": {
        "category": "pr_stunt",
        "type": "pr_drift",
        "symbol": "D",
        "color": "#ff9900",
    },
    "Speed Trap": {
        "category": "pr_stunt",
        "type": "pr_speed",
        "symbol": "S",
        "color": "#00f0ff",
    },
    "Speed Zone": {
        "category": "pr_stunt",
        "type": "pr_zone",
        "symbol": "Z",
        "color": "#00ff66",
    },
    "Danger Sign": {
        "category": "pr_stunt",
        "type": "pr_danger",
        "symbol": "J",
        "color": "#ff0055",
    },
    "Touge Racing Event": {
        "category": "poi",
        "type": "race_touge",
        "symbol": "T",
        "color": "#00e5ff",
    },
    "Road Racing Event": {
        "category": "poi",
        "type": "race_road",
        "symbol": "R",
        "color": "#ffcc00",
    },
    "Street Racing Event": {
        "category": "poi",
        "type": "race_street",
        "symbol": "S",
        "color": "#aa00ff",
    },
    "Dirt Racing Event": {
        "category": "poi",
        "type": "race_dirt",
        "symbol": "R",
        "color": "#ffaa00",
    },
    "Drag Racing Event": {
        "category": "poi",
        "type": "race_drag",
        "symbol": "D",
        "color": "#ff3300",
    },
    "Cross-Country Event": {
        "category": "poi",
        "type": "race_cross",
        "symbol": "C",
        "color": "#00ff99",
    },
    "Barn Find": {
        "category": "collectible",
        "type": "barn",
        "symbol": "B",
        "color": "#ffaa00",
    },
    "Bonus Board": {
        "category": "collectible",
        "type": "board",
        "symbol": "X",
        "color": "#00ffcc",
    },
    "Player House": {
        "category": "poi",
        "type": "house",
        "symbol": "H",
        "color": "#ffff00",
    },
    "Car Meet": {"category": "poi", "type": "meet", "symbol": "M", "color": "#3399ff"},
}


def sanitize_string(text: str) -> str:
    """Removes emojis and non-printable characters for clean presentation."""
    if not text:
        return "POI"
    cleaned = text.encode("ascii", "ignore").decode("ascii").strip()
    return cleaned if cleaned else text.split()[0] if text.split() else "POI"


def transform_labsgg_coords(px: float, py: float, cfg: dict) -> tuple[float, float]:
    """Transforms LabsGG 2D pixel coordinates (X, Y) to UDP meters (X, Z)."""
    cx = cfg.get("centerX", 1200.0)
    cy = cfg.get("centerY", 800.0)
    sx = cfg.get("scaleX", 0.85)
    sz = cfg.get("scaleZ", -0.85)

    world_x = (px - cx) * sx
    world_z = (py - cy) * sz
    return round(world_x, 2), round(world_z, 2)


def calibrate_and_export():
    """Reads raw locations, calibrates coordinates, and exports japan_pois.json."""
    cfg = load_config()
    raw_locs = []
    source = "LabsGG"

    if LABSGG_RAW_PATH.exists():
        with open(LABSGG_RAW_PATH, "r", encoding="utf-8") as f:
            labs_data = json.load(f)
            raw_locs = labs_data.get("locations", [])
            source = labs_data.get("source", "LabsGG")

    if not raw_locs and MAPGENIE_RAW_PATH.exists():
        with open(MAPGENIE_RAW_PATH, "r", encoding="utf-8") as f:
            raw_locs = json.load(f)

    if not raw_locs:
        print("[Calibrator] Error: No raw location dataset found.")
        sys.exit(1)

    calibrated_pois = []

    for item in raw_locs:
        raw_title = item.get("title", item.get("name", "POI Location"))
        title = sanitize_string(raw_title)
        cat_name = item.get("category", item.get("type", "asphalt"))

        px = float(item.get("x", 1200.0))
        py = float(item.get("y", 800.0))

        world_x, world_z = transform_labsgg_coords(px, py, cfg)

        cat_info = CATEGORY_MAP.get(
            cat_name,
            {
                "category": "poi",
                "type": "road_route",
                "symbol": "R",
                "color": "#00f0ff",
            },
        )

        poi = {
            "id": item.get("id", f"poi_{len(calibrated_pois) + 1}"),
            "name": title,
            "category": cat_info["category"],
            "type": cat_info["type"],
            "symbol": cat_info["symbol"],
            "color": cat_info["color"],
            "x": world_x,
            "z": world_z,
            "px": px,
            "py": py,
        }
        calibrated_pois.append(poi)

    output_data = {
        "map": "Japan",
        "game": "Forza Horizon 6",
        "source": source,
        "calibration": cfg,
        "pois_count": len(calibrated_pois),
        "pois": calibrated_pois,
    }

    OUT_JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)

    print(
        f"[Calibrator] Successfully calibrated & exported {len(calibrated_pois)} POIs to {OUT_JSON_PATH}."
    )


if __name__ == "__main__":
    calibrate_and_export()
