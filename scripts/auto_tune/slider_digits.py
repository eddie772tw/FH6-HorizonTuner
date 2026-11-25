"""Numeric glyphs from the FH6 tuning rows. Keep signs and decimal points in the comparison."""

import json
from pathlib import Path


def glyphs(im, y, selected):
    left, right = round(662 * im.w / 960), round(697 * im.w / 960)
    top, bottom = round((y - 8) * im.h / 540), round((y + 8) * im.h / 540)
    points = set()
    for row in range(top, bottom):
        for col in range(left, right):
            offset = row * im.stride + 4 * col
            b, g, r = im.data[offset : offset + 3]
            if min(r, g, b) > 148 if selected else max(r, g, b) < 140:
                points.add((col, row))
    cols = sorted({x for x, _ in points})
    spans = []
    for x in cols:
        if not spans or x > spans[-1][-1] + 1:
            spans.append([])
        spans[-1].append(x)
    result = []
    for span in spans:
        pts = [(x, y) for x, y in points if span[0] <= x <= span[-1]]
        minx, maxx = span[0], span[-1]
        miny, maxy = min(y for _, y in pts), max(y for _, y in pts)
        width, height = maxx - minx + 1, maxy - miny + 1
        mask = 0
        for j in range(16):
            for i in range(12):
                if (
                    minx + min(width - 1, int((i + 0.5) * width / 12)),
                    miny + min(height - 1, int((j + 0.5) * height / 16)),
                ) in points:
                    mask |= 1 << (j * 12 + i)
        result.append(
            (
                width * 960 / im.w,
                height * 540 / im.h,
                (miny + maxy) / 2 * 540 / im.h - y,
                mask,
            )
        )
    return result


# Binary silhouettes were calibrated from the Traditional Chinese PC tuning screen.
# Variants reflect the font sizes, selected rows and subpixel rasterization used by FH6.
from functools import lru_cache


@lru_cache(maxsize=1024)
def counters(mask):
    """Find the vertical centers of enclosed white components in a glyph."""
    white = {
        (x, y) for y in range(16) for x in range(12) if not mask >> (12 * y + x) & 1
    }
    centers = []
    while white:
        todo = [white.pop()]
        edge = False
        size = total_y = 0
        while todo:
            x, y = todo.pop()
            edge |= x in (0, 11) or y in (0, 15)
            size += 1
            total_y += y
            for p in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if p in white:
                    white.remove(p)
                    todo.append(p)
        if not edge and size > 1:
            centers.append(total_y / (16 * size))
    return sorted(centers)


@lru_cache(maxsize=1)
def _templates():
    data = json.loads(
        Path(__file__).with_name("slider_glyphs.json").read_text(encoding="utf-8")
    )
    return {
        char: [(ratio, center, int(mask, 16)) for ratio, center, mask in entries]
        for char, entries in data.items()
    }


def read_number(im, y, selected):
    result = []
    for w, h, cy, mask in glyphs(im, y, selected):
        scores = []
        holes = counters(mask)
        for char, entries in _templates().items():
            distances = []
            for ratio, center, m in entries:
                reference = counters(m)
                if len(reference) != len(holes):
                    continue
                distances.append(
                    (mask ^ m).bit_count() / 192
                    + 0.20 * abs(w / h - ratio)
                    + 0.14 * abs(cy / h - center)
                    + 0.22 * sum(abs(a - b) for a, b in zip(reference, holes))
                )
            if distances:
                scores.append((min(distances), char))
        scores.sort()
        if (
            not scores
            or scores[0][0] > 0.29
            or (len(scores) > 1 and scores[1][0] - scores[0][0] < 0.045)
        ):
            return None
        result.append(scores[0][1])
    return "".join(result) or None
