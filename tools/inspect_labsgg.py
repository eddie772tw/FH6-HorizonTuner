"""Inspect LabsGG webpage for map markers, roads, categories, and background map images."""

import json
import re
import ssl
import urllib.request
from pathlib import Path

LABSGG_URL = "https://forza.labsgg.com/interactive-map"
CONTENT_MD_PATH = Path(
    r"C:\Users\eddie\.gemini\antigravity\brain\4795a90b-7496-4be0-9a25-ca7ce301739e\.system_generated\steps\288\content.md"
)
OUT_RAW_PATH = Path(__file__).resolve().parent / "labsgg_raw_data.json"


def get_html_content():
    """Returns HTML content from local step log or HTTPS request with unverified SSL context."""
    if CONTENT_MD_PATH.exists():
        print(f"[LabsGG Parser] Reading cached HTML from {CONTENT_MD_PATH}...")
        with open(CONTENT_MD_PATH, "r", encoding="utf-8") as f:
            return f.read()

    print(f"[LabsGG Parser] Fetching live HTML from {LABSGG_URL}...")
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


def parse_labsgg():
    html = get_html_content()
    print(f"[LabsGG Parser] Total content length: {len(html)} bytes.")

    # 1. Extract roads
    roads = []
    match_roads = re.search(r"const\s+roads\s*=\s*(\[\{.+?\}\]);", html, re.DOTALL)
    if match_roads:
        try:
            roads = json.loads(match_roads.group(1))
            print(f"[LabsGG Parser] Extracted {len(roads)} road segments.")
        except Exception as e:
            print(f"[LabsGG Parser] Roads JSON parse error: {e}")

    # 2. Extract markers / POIs / locations
    markers = []
    # Search for all json arrays assigned to script variables
    var_matches = re.findall(
        r"const\s+([a-zA-Z0-9_$]+)\s*=\s*(\[\{.+?\}\]);", html, re.DOTALL
    )
    for var_name, var_json in var_matches:
        try:
            parsed = json.loads(var_json)
            print(
                f"[LabsGG Parser] Const '{var_name}' contains {len(parsed)} array items."
            )
            if var_name not in ["roads"] and len(parsed) > 5:
                markers = parsed
        except Exception:
            pass

    # 3. Check for Astro component props or script tags with JSON
    if not markers:
        # Search for inline JSON array of objects with x, y or lat, lng
        coord_matches = re.findall(
            r"(\[\s*\{\s*\"[^\"]+\"\s*:.+?\}\s*\])", html, re.DOTALL
        )
        for cand in coord_matches:
            if (
                "x" in cand
                or "y" in cand
                or "lat" in cand
                or "lng" in cand
                or "points" in cand
            ):
                try:
                    parsed = json.loads(cand)
                    if isinstance(parsed, list) and len(parsed) > 10:
                        print(
                            f"[LabsGG Parser] Found coordinate array candidate with {len(parsed)} items."
                        )
                        if not markers or len(parsed) > len(markers):
                            markers = parsed
                except Exception:
                    pass

    # 4. Extract Map Image URLs / Tile layer URLs
    map_images = re.findall(r"[\"']([^\"']+\.(?:png|jpg|jpeg|webp))[\"']", html)
    bg_images = [
        img
        for img in map_images
        if any(kw in img for kw in ["map", "tiles", "japan", "bg", "preview"])
    ]
    print(f"[LabsGG Parser] Found candidate map image URLs ({len(bg_images)} items):")
    for img in bg_images[:10]:
        print(" -", img)

    extracted = {
        "roads_count": len(roads),
        "markers_count": len(markers),
        "sample_road": roads[0] if roads else None,
        "sample_marker": markers[0] if markers else None,
        "bg_images": bg_images,
        "roads": roads,
        "markers": markers,
    }

    with open(OUT_RAW_PATH, "w", encoding="utf-8") as f:
        json.dump(extracted, f, ensure_ascii=False, indent=2)

    print(f"[LabsGG Parser] Exported raw data to {OUT_RAW_PATH}.")


if __name__ == "__main__":
    parse_labsgg()
