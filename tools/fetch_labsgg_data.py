"""LabsGG Forza Horizon 6 Interactive Map Fetcher.

Downloads full-res map background image (3.24 MB) and extracts roads & POIs.
"""

import json
import re
import ssl
import urllib.request
from pathlib import Path

LABSGG_URL = "https://forza.labsgg.com/interactive-map"
LABSGG_FULL_MAP_URL = "https://forza.labsgg.com/_astro/FH6-full-map.59v5pH0D.jpg"

ROOT_DIR = Path(__file__).resolve().parent.parent
ASSETS_DIR = ROOT_DIR / "hud_overlay" / "assets"
RAW_OUT_PATH = Path(__file__).resolve().parent / "labsgg_raw_locations.json"
IMAGE_OUT_PATH = ASSETS_DIR / "live_map_bg.png"
CONTENT_MD_PATH = Path(
    r"C:\Users\eddie\.gemini\antigravity\brain\4795a90b-7496-4be0-9a25-ca7ce301739e\.system_generated\steps\288\content.md"
)


def get_html_content():
    """Fetch HTML page from LabsGG or read cached step log."""
    if CONTENT_MD_PATH.exists():
        print(f"[LabsGG Fetcher] Reading cached content from {CONTENT_MD_PATH}...")
        with open(CONTENT_MD_PATH, "r", encoding="utf-8") as f:
            return f.read()

    print(f"[LabsGG Fetcher] Fetching live HTML from {LABSGG_URL}...")
    ctx = ssl._create_unverified_context()
    req = urllib.request.Request(
        LABSGG_URL,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            ),
        },
    )
    with urllib.request.urlopen(req, context=ctx) as resp:
        return resp.read().decode("utf-8")


def download_full_map_image():
    """Download LabsGG full-resolution 3.24MB map background image."""
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    print(
        f"[LabsGG Fetcher] Downloading full-res 3.24MB map image from {LABSGG_FULL_MAP_URL}..."
    )
    ctx = ssl._create_unverified_context()
    req = urllib.request.Request(
        LABSGG_FULL_MAP_URL,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            ),
        },
    )
    try:
        with urllib.request.urlopen(req, context=ctx) as resp:
            data = resp.read()
            with open(IMAGE_OUT_PATH, "wb") as f:
                f.write(data)
            print(
                f"[LabsGG Fetcher] Successfully saved full-res map background image to {IMAGE_OUT_PATH} ({len(data)} bytes)."
            )
            return True
    except Exception as e:
        print(f"[LabsGG Fetcher] Failed to download map image: {e}")
        return False


def extract_labsgg_dataset():
    """Extract roads geometry and POI markers catalog from LabsGG page source."""
    html = get_html_content()

    # Extract 457 road segments
    roads = []
    match_roads = re.search(r"const\s+roads\s*=\s*(\[\{.+?\}\]);", html, re.DOTALL)
    if match_roads:
        try:
            roads = json.loads(match_roads.group(1))
            print(
                f"[LabsGG Fetcher] Successfully extracted {len(roads)} road geometry segments!"
            )
        except Exception as e:
            print(f"[LabsGG Fetcher] Roads parse error: {e}")

    # Extract marker category definitions
    marker_defs = []
    match_defs = re.search(
        r"const\s+markerDefinitions\s*=\s*(\[\{.+?\}\]);", html, re.DOTALL
    )
    if match_defs:
        try:
            marker_defs = json.loads(match_defs.group(1))
            print(
                f"[LabsGG Fetcher] Extracted {len(marker_defs)} marker category definitions!"
            )
        except Exception as e:
            print(f"[LabsGG Fetcher] Marker defs parse error: {e}")

    # Build standardized location list based on LabsGG POI catalog
    locations = []
    for road in roads:
        r_type = road.get("type", "asphalt")
        r_id = road.get("id", "")
        pts = road.get("points", [])
        if pts:
            mid_pt = pts[len(pts) // 2]
            locations.append(
                {
                    "id": f"labsgg_{r_id}",
                    "title": f"Japan Route Segment ({r_type.title()})",
                    "category": f"Road Route ({r_type})",
                    "type": r_type,
                    "x": mid_pt.get("x", 1000),
                    "y": mid_pt.get("y", 1000),
                    "points_count": len(pts),
                }
            )

    output_payload = {
        "source": "ForzaLabs LabsGG Interactive Map",
        "map_image": "FH6-full-map.59v5pH0D.jpg",
        "roads_count": len(roads),
        "marker_defs_count": len(marker_defs),
        "roads": roads,
        "marker_definitions": marker_defs,
        "locations": locations,
    }

    with open(RAW_OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output_payload, f, ensure_ascii=False, indent=2)

    print(
        f"[LabsGG Fetcher] Exported LabsGG dataset to {RAW_OUT_PATH} ({len(locations)} location route nodes)."
    )
    return locations


if __name__ == "__main__":
    download_full_map_image()
    extract_labsgg_dataset()
