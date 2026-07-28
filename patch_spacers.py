import sys

with open("hud_overlay/shared/telemetry-cards.js", "r") as f:
    content = f.read()

# Revert previous incorrect corner changes and apply proper row logic
# Corner FL was row 1 -> row 3
# Corner FR was row 1 -> row 3
# Corner RL was row 3 -> row 5
# Corner RR was row 3 -> row 5

content = content.replace(
    """<div id="tcCornerRL" class="tele-corner" style="grid-column:1; grid-row:3; display:flex; flex-direction:column; gap:0.5rem; align-items:flex-start; background:rgba(0,0,0,0.35); backdrop-filter:blur(6px); padding:0.6rem 0.8rem; border-radius:8px; border:1px solid rgba(0,240,255,0.2);">""",
    """<div id="tcCornerRL" class="tele-corner" style="grid-column:1; grid-row:5; display:flex; flex-direction:column; gap:0.5rem; align-items:flex-start; background:rgba(0,0,0,0.35); backdrop-filter:blur(6px); padding:0.6rem 0.8rem; border-radius:8px; border:1px solid rgba(0,240,255,0.2);">"""
)

content = content.replace(
    """<div id="tcCornerRR" class="tele-corner" style="grid-column:3; grid-row:3; display:flex; flex-direction:column; gap:0.5rem; align-items:flex-end; background:rgba(0,0,0,0.35); backdrop-filter:blur(6px); padding:0.6rem 0.8rem; border-radius:8px; border:1px solid rgba(0,240,255,0.2);">""",
    """<div id="tcCornerRR" class="tele-corner" style="grid-column:3; grid-row:5; display:flex; flex-direction:column; gap:0.5rem; align-items:flex-end; background:rgba(0,0,0,0.35); backdrop-filter:blur(6px); padding:0.6rem 0.8rem; border-radius:8px; border:1px solid rgba(0,240,255,0.2);">"""
)

with open("hud_overlay/shared/telemetry-cards.js", "w") as f:
    f.write(content)
