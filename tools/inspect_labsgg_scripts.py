"""Find all Astro islands and props in content.md."""

import json
import re
import sys
from pathlib import Path

CONTENT_MD_PATH = Path("content.md")

if not CONTENT_MD_PATH.exists():
    print(f"Error: {CONTENT_MD_PATH} not found.")
    sys.exit(0)

with open(CONTENT_MD_PATH, "r", encoding="utf-8") as f:
    html = f.read()

islands = re.findall(r'<astro-island[^>]+component-url=["\']([^"\']+)["\'][^>]*', html)
print("Astro components found on LabsGG:")
for comp in islands:
    print(" Component URL:", comp)

# Search for markers in script tags or fetch URLs in interactive map scripts
map_scripts = re.findall(r'src=["\'](/_astro/[^"\']+)["\']', html)
print("Script sources:", map_scripts)
