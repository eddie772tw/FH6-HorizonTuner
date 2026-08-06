"""Find all Astro islands and props in content.md."""

import json
import re
from pathlib import Path

CONTENT_MD_PATH = Path(
    r"C:\Users\eddie\.gemini\antigravity\brain\4795a90b-7496-4be0-9a25-ca7ce301739e\.system_generated\steps\288\content.md"
)

with open(CONTENT_MD_PATH, "r", encoding="utf-8") as f:
    html = f.read()

islands = re.findall(r'<astro-island[^>]+component-url=["\']([^"\']+)["\'][^>]*', html)
print("Astro components found on LabsGG:")
for comp in islands:
    print(" Component URL:", comp)

# Search for markers in script tags or fetch URLs in interactive map scripts
map_scripts = re.findall(r'src=["\'](/_astro/[^"\']+)["\']', html)
print("Script sources:", map_scripts)
