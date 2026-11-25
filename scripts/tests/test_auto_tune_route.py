"""Guard road selection with real captured runway scale evidence."""

import json
from contextlib import nullcontext
from pathlib import Path
from types import SimpleNamespace

import pytest

from scripts.auto_tune import measurement_route as route


@pytest.mark.parametrize(
    "case",
    json.loads(
        Path(__file__)
        .with_name("fixtures")
        .joinpath("auto_tune_runway_scale.json")
        .read_text()
    ),
)
def test_real_runway_scale_rejects_unzoomed_map(monkeypatch, case):
    px, py = case["point"]

    def pixel(x, y):
        return case["rows"][(y - py + 20) // 10][x - px + 8]

    monkeypatch.setattr(
        route, "Raster", lambda _: nullcontext(SimpleNamespace(pixel=pixel))
    )
    assert route._road_scale_valid("captured-samples", (px, py)) == case["expected"]


def test_far_markers_and_activity_card_false_matches_are_not_hovered(monkeypatch):
    monkeypatch.setattr(route, "_activity_title", lambda _: (236, 161, 390, 186))
    monkeypatch.setattr(
        route,
        "_starting_lights",
        lambda *_: [(354, 175), (300, 192), (511, 178), (784, 382)],
    )
    assert route._near_lights("frame", (517, 185)) == [(511, 178)]


def test_ambiguous_confirmed_event_does_not_choose_an_arbitrary_light(monkeypatch):
    monkeypatch.setattr(route, "_near_lights", lambda *_: [(510, 180), (520, 180)])
    monkeypatch.setattr(route, "_is_strip", lambda *_: True)
    device = SimpleNamespace(
        hover=lambda *_: None, wait=lambda _: None, capture=lambda _: "frame"
    )
    assert route._select_strip(device, "frame", (515, 180)) is None


@pytest.mark.parametrize("changed", ["road", "marker", None])
def test_fast_travel_requires_geometry_in_final_hover_frame(monkeypatch, changed):
    keys = []
    monkeypatch.setattr(route, "await_screen", lambda *_: "map")
    monkeypatch.setattr(route, "_select_strip", lambda *_: ((510, 180), "map"))
    monkeypatch.setattr(route, "_activity_title", lambda _: None)
    monkeypatch.setattr(
        route,
        "_road_scale_valid",
        lambda frame, _: not (frame == "道路傳送落點" and changed == "road"),
    )
    monkeypatch.setattr(
        route,
        "_near_lights",
        lambda frame, *_, **__: (
            [] if frame == "道路傳送落點" and changed == "marker" else [(510, 180)]
        ),
    )
    device = SimpleNamespace(
        tap=keys.append,
        hover=lambda *_: None,
        wait=lambda _: None,
        zoom=lambda _: None,
        capture=lambda label: label,
        ocr=lambda *_: {"footer": "關閉地圖 快速移動"},
        state=SimpleNamespace(artifact=lambda *_: None),
    )
    world = {"PositionX": route.SPAWN_X, "PositionZ": route.SPAWN_Z}
    if changed:
        with pytest.raises(RuntimeError, match="地圖位置已改變"):
            route.travel_to_strip(device, world)
        assert keys == ["M"]
    else:
        route.travel_to_strip(device, world)
        assert keys == ["M", "X", "ENTER"]
