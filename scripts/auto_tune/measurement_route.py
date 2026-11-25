"""Navigate the Traditional Chinese festival menus and the Festival Kilometer map marker."""

import math
import time

from .vision import Raster, compact

SPAWN_X, SPAWN_Z = -1888.74, -172.09
MENU = (27, 72, 278, 111)
DIALOG = (312, 199, 650, 273)
FOOTER = (32, 485, 864, 526)


def await_screen(device, label, boxes, words, timeout=13):
    end = time.monotonic() + timeout
    last = ""
    while time.monotonic() < end:
        frame = device.capture(label)
        last = compact(" ".join(device.ocr(frame, boxes).values()))
        if any(word in last for word in words):
            return frame
        device.wait(0.35)
    raise RuntimeError(f"未辨識到{label}（讀回 {last[:100]}）")


def leave_garage(device):
    await_screen(device, "升級套件", {"title": MENU}, ["升級套件"])
    device.tap("ESC")
    device.wait(0.35)
    await_screen(
        device,
        "嘉年華車庫",
        {"items": (33, 267, 226, 452)},
        ["我的車輛", "升級套件與調校"],
    )
    device.tap("ESC")


def await_driving_hud(device):
    # Some garage menus continue sending IsRaceOn=1 at the last road position.
    # Wait for an actual driving HUD before sending a map or throttle command.
    end = time.monotonic() + 45
    while time.monotonic() < end:
        frame = device.capture("等待自由駕駛")
        text = device.ocr(
            frame,
            {"nav": (24, 484, 205, 532), "speed": (761, 410, 953, 523)},
            language="en-US",
        )
        nav = compact(text["nav"]).upper()
        speed = compact(text["speed"]).upper()
        if (
            "ANNA" in nav
            or "LINK" in nav
            or any(unit in speed for unit in ("MPH", "KM/H", "KMH", "KPH"))
        ):
            return
        device.wait(0.5)
    raise RuntimeError("未看到自由駕駛的導航提示或速度表")


def return_to_garage(device):
    device.tap("ESC")
    await_screen(
        device, "暫停選單", {"tabs": (260, 95, 690, 125)}, ["車輛", "我的HORIZON"]
    )
    device.click(360, 110)
    await_screen(
        device, "車輛選單", {"tile": (124, 272, 260, 362)}, ["購買新車", "與二手車"]
    )
    device.click(189, 310)
    await_screen(
        device, "移動到嘉年華", {"dialog": DIALOG}, ["移動到嘉年華", "最近的嘉年華"]
    )
    device.tap("ENTER")
    await_screen(
        device, "嘉年華商店", {"title": (31, 103, 251, 155)}, ["購買與賣出"], timeout=45
    )
    device.click(260, 87)
    await_screen(
        device, "車庫改裝入口", {"items": (33, 267, 226, 323)}, ["升級套件與調校"]
    )
    device.click(94, 310)
    await_screen(device, "升級套件", {"title": MENU}, ["升級套件"])


def _starting_lights(frame, expected):
    """Rank the white/red starting-tree glyph even if other map markers cover its bottom."""
    with Raster(frame) as im:
        # Classify once at the map UI's reference resolution.
        rows = []
        for y in range(540):
            row = bytearray(960)
            for x in range(960):
                r, g, b = im.pixel(x, y)
                if r > 180 and r - g > 85 and r - b > 60:
                    row[x] = 1
                elif min(r, g, b) > 203 and max(r, g, b) - min(r, g, b) < 65:
                    row[x] = 2
            rows.append(row)

    red = ((-3, 0), (0, 0), (4, 0), (7, 0), (2, 3), (5, 3), (6, 7))
    white = ((-2, 1), (0, 1), (3, 1), (5, 1), (0, 4), (4, 5), (0, 5))
    hits = []
    for y in range(35, 485):
        start = 12
        while (x := rows[y].find(b"\x01" * 7, start, 947)) >= 0:
            start = x + 1
            x += 3
            score = sum(rows[y + dy][x + dx] == 1 for dx, dy in red)
            score += sum(rows[y + dy][x + dx] == 2 for dx, dy in white)
            if score >= 12:
                point = (x, y + 4)
                hits.append((score, math.dist(point, expected), point))
    candidates = []
    for _, _, point in sorted(hits, key=lambda item: (-item[0], item[1])):
        if all(math.dist(point, other) > 12 for other in candidates):
            candidates.append(point)
    return candidates


def _activity_title(frame):
    # Festival activity popovers share the same pink title bar. Anchor the OCR
    # to its lower edge so map labels and challenge text cannot mix with the name.
    with Raster(frame) as im:
        bars = []
        for y in range(32, 397, 2):
            first = None
            for x in range(4, 960, 3):
                r, g, b = im.pixel(x, y)
                if r > 199 and g < 95 and 115 < b < 201:
                    if first is None:
                        first = x
                elif first is not None:
                    if 188 <= x - first <= 216:
                        bars.append((first, y))
                    first = None
    if bars:
        left, bottom = bars[-1]
        return (left - 2, bottom + 1, min(958, left + 152), bottom + 26)
    return None


def travel_to_strip(device, world):
    device.tap("M")
    frame = await_screen(
        device, "世界地圖", {"footer": FOOTER}, ["關閉地圖", "切換地圖區域"]
    )
    # The opened map centers on the player. At the measured default zoom 881 m
    # along the strip corresponds to 98 UI pixels; +world Z is north.
    x = 480 + (SPAWN_X - world["PositionX"]) * 0.111
    y = 270 - (SPAWN_Z - world["PositionZ"]) * 0.111
    for _ in range(6):
        if 65 < x < 900 and 55 < y < 460:
            break
        dx = max(-290, min(290, 480 - x))
        dy = max(-196, min(196, 260 - y))
        device.drag(480, 260, 480 + dx, 260 + dy)
        device.wait(0.35)
        x, y = x + dx, y + dy
        frame = device.capture("移動世界地圖")
    expected = (max(25, min(925, x)), max(34, min(476, y)))
    selection = _select_strip(device, frame, expected)
    if not selection:
        # Expand stacked event markers near the estimated destination. An exact
        # activity title is still required before the fast-travel dialog.
        device.hover(*expected)
        device.zoom(1)
        device.wait(0.5)
        selection = _select_strip(device, device.capture("展開重疊活動"), expected)
        if not selection:
            raise RuntimeError("世界地圖未確認嘉年華一公里，請檢查地圖縮放與篩選器。")
    # Road fast travel avoids the gate behind the launch line. Zoom around the
    # identified event, then acquire its glyph again: zoom changes coordinates.
    anchor, _ = selection
    device.hover(*anchor)
    for _ in range(4):
        device.zoom(8)
    # Hovering another activity fades every other icon and defeats the color
    # template. Move into the map interior before acquiring the full-color glyph.
    device.hover(700, 300)
    device.wait(0.6)
    frame = device.capture("放大起跑道路")
    candidates = _near_lights(frame, anchor, radius=100)
    if len(candidates) != 1:
        raise RuntimeError("放大後無法唯一定位起跑燈，未執行傳送")
    px, py = candidates[0]
    road = (px - 1, py + 96)
    if not (65 < road[0] < 900 and 55 < road[1] < 460):
        raise RuntimeError("起跑道路超出地圖安全範圍")
    if not _road_scale_valid(frame, road):
        raise RuntimeError("未確認放大後的跑道寬度，未執行傳送")
    device.hover(*road)
    device.wait(0.6)
    frame = device.capture("道路傳送落點")
    # Hovering can scroll/snap the map. Bind the final input to this same frame,
    # not to the road geometry observed before moving the pointer.
    if (
        not _road_scale_valid(frame, road)
        or len(_near_lights(frame, (px, py), radius=3)) != 1
    ):
        raise RuntimeError("道路傳送前地圖位置已改變，未執行傳送")
    footer = compact(device.ocr(frame, {"footer": FOOTER})["footer"])
    if _activity_title(frame) or "關閉地圖" not in footer or "快速移動" not in footer:
        raise RuntimeError("地圖游標仍吸附活動，未執行道路傳送")
    device.state.artifact(
        "travel-target.json", {"event": anchor, "zoomedEvent": [px, py], "road": road}
    )
    device.tap("X")
    await_screen(device, "快速移動確認", {"modal": DIALOG}, ["快速移動"])
    device.tap("ENTER")


def _is_strip(device, frame):
    title = _activity_title(frame)
    return bool(
        title
        and "嘉年華一公里"
        in compact(device.ocr(frame, {"activity": title})["activity"])
    )


def _road_scale_valid(frame, road):
    """The two long pale runway borders provide a scale check independent of icons."""
    px, py = road
    with Raster(frame) as im:
        columns = []
        for x in range(px - 8, px + 21):
            matches = 0
            for dy in (-20, -10, 0, 10, 20):
                rgb = im.pixel(x, py + dy)
                matches += min(rgb) > 215 and max(rgb) - min(rgb) < 35
            if matches >= 4:
                columns.append(x)
    left = [x for x in columns if x <= px]
    right = [x for x in columns if x >= px + 4]
    return bool(left and right and 9 <= min(right) - max(left) <= 15)


def _near_lights(frame, expected, radius=35):
    title = _activity_title(frame)
    return sorted(
        [
            p
            for p in _starting_lights(frame, expected)
            if math.dist(p, expected) <= radius
            and not (
                title
                and title[0] <= p[0] <= title[0] + 212
                and title[1] - 30 <= p[1] <= 480
            )
        ],
        key=lambda p: math.dist(p, expected),
    )


def _select_strip(device, frame, expected):
    candidates = _near_lights(frame, expected)
    if _is_strip(device, frame) and len(candidates) == 1:
        return candidates[0], frame
    points = [
        *candidates[:4],
        expected,
        (expected[0], expected[1] - 6),
        (expected[0], expected[1] + 6),
    ]
    for px, py in points:
        device.hover(px, py)
        device.wait(0.45)
        frame = device.capture("辨識直線測試場")
        if _is_strip(device, frame):
            anchors = _near_lights(frame, expected)
            if len(anchors) == 1:
                return anchors[0], frame
    return None
