import re

manager_path = "hud_overlay/shared/telemetry-cards/manager.js"
with open(manager_path, "r") as f:
    content = f.read()

content = content.replace(
    """                    el: document.getElementById('tcCorner' + tag),
                    suspBlock: document.getElementById('tcSuspBlock' + tag),
                    slipBlock: document.getElementById('tcSlipBlock' + tag),
                    tempBlock: document.getElementById('tcTempBlock' + tag)""",
    """                    el: document.getElementById('tcCorner' + tag),
                    suspBlock: document.getElementById('tcSuspBlock' + tag),
                    slipBlock: document.getElementById('tcSlipBlock' + tag),
                    tempBlock: document.getElementById('tcTempBlock' + tag),
                    angEl: document.getElementById('tcTireAng' + tag),
                    ratEl: document.getElementById('tcTireRat' + tag),
                    rCanvas: document.getElementById('tcTireRadar' + tag),
                    tempEl: document.getElementById('tcTireTemp' + tag),
                    tCanvas: document.getElementById('tcTireHist' + tag),
                    txtEl: document.getElementById('tcSuspText' + tag),
                    barEl: document.getElementById('tcSuspBar' + tag),
                    minEl: document.getElementById('tcSuspMin' + tag),
                    maxEl: document.getElementById('tcSuspMax' + tag),
                    wCanvas: document.getElementById('tcSuspWave' + tag)""",
)

content = content.replace(
    "renderCorners(data, showSusp, showSlip, showTemp, this.tireHist, this.suspHist, this.suspMinMax, now);",
    "renderCorners(data, showSusp, showSlip, showTemp, this.tireHist, this.suspHist, this.suspMinMax, now, this.domCache);",
)

with open(manager_path, "w") as f:
    f.write(content)

corner_path = "hud_overlay/shared/telemetry-cards/corner-card.js"
with open(corner_path, "r") as f:
    content = f.read()

content = content.replace(
    "export function renderCorners(data, showSusp, showSlip, showTemp, tireHist, suspHist, suspMinMax, now) {",
    "export function renderCorners(data, showSusp, showSlip, showTemp, tireHist, suspHist, suspMinMax, now, domCache) {",
)

content = content.replace(
    "var angEl  = document.getElementById('tcTireAng' + tag);",
    "var cached = domCache && domCache.corners ? domCache.corners[tag] : null;\n            var angEl  = cached ? cached.angEl : document.getElementById('tcTireAng' + tag);",
)
content = content.replace(
    "var ratEl  = document.getElementById('tcTireRat' + tag);",
    "var ratEl  = cached ? cached.ratEl : document.getElementById('tcTireRat' + tag);",
)
content = content.replace(
    "var rCanvas = document.getElementById('tcTireRadar' + tag);",
    "var rCanvas = cached ? cached.rCanvas : document.getElementById('tcTireRadar' + tag);",
)
content = content.replace(
    "var tempEl = document.getElementById('tcTireTemp' + tag);",
    "var tempEl = cached ? cached.tempEl : document.getElementById('tcTireTemp' + tag);",
)
content = content.replace(
    "var tCanvas = document.getElementById('tcTireHist' + tag);",
    "var tCanvas = cached ? cached.tCanvas : document.getElementById('tcTireHist' + tag);",
)
content = content.replace(
    "var txtEl = document.getElementById('tcSuspText' + tag);",
    "var txtEl = cached ? cached.txtEl : document.getElementById('tcSuspText' + tag);",
)
content = content.replace(
    "var barEl = document.getElementById('tcSuspBar' + tag);",
    "var barEl = cached ? cached.barEl : document.getElementById('tcSuspBar' + tag);",
)
content = content.replace(
    "var minEl = document.getElementById('tcSuspMin' + tag);",
    "var minEl = cached ? cached.minEl : document.getElementById('tcSuspMin' + tag);",
)
content = content.replace(
    "var maxEl = document.getElementById('tcSuspMax' + tag);",
    "var maxEl = cached ? cached.maxEl : document.getElementById('tcSuspMax' + tag);",
)
content = content.replace(
    "var wCanvas = document.getElementById('tcSuspWave' + tag);",
    "var wCanvas = cached ? cached.wCanvas : document.getElementById('tcSuspWave' + tag);",
)
content = content.replace(
    "var wrapperEl = document.getElementById('tcClusterWrapper');",
    "var wrapperEl = domCache ? domCache.wrapper : document.getElementById('tcClusterWrapper');",
)

with open(corner_path, "w") as f:
    f.write(content)
