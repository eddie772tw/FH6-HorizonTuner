"""Closed-loop slider corrections with two independently chosen initial setups."""

from types import SimpleNamespace

import pytest

from scripts.auto_tune import sliders
from scripts.auto_tune.device import publish_snapshot


def test_snapshot_survives_a_reader_holding_the_previous_file(tmp_path, monkeypatch):
    from scripts.auto_tune import device

    latest = tmp_path / "state.json"
    pending = tmp_path / "state.tmp"
    latest.write_text("previous")
    pending.write_text("next")
    replace = device.os.replace
    attempts = []

    def held_once(source, destination):
        attempts.append(destination)
        if len(attempts) == 1:
            error = PermissionError("shared file")
            error.winerror = 32
            raise error
        return replace(source, destination)

    monkeypatch.setattr(device.os, "replace", held_once)
    publish_snapshot(pending, latest)
    assert latest.read_text() == "next"
    assert attempts == [latest, latest]


class Menu:
    def __init__(self, values, unit="psi"):
        self.values = dict(values)
        self.unit = unit
        self.selected = None
        self.writes = []
        self.reads = 0
        self.increments = {}
        self.state = SimpleNamespace(data={"observed": {}})

    def click(self, x, y):
        if x == 320:
            self.selected = "pressure.front" if y == 144.5 else "pressure.rear"

    def tap(self, key, count):
        delta = count * (1 if key == "RIGHT" else -1)
        self.writes.append((self.selected, delta))
        self.values[self.selected] += delta * (0.5 if self.unit == "psi" else 0.05)

    def wait(self, _):
        pass

    def capture(self, _):
        return self

    def observed(self, data):
        self.state.data["observed"].update(data)

    def read(self):
        self.reads += 1
        return dict(
            page="tuning.tyres",
            car="1964 Aston Martin DB5",
            fields=self.values.copy(),
            rows={
                k: dict(locked=False, y=(144.5 if k.endswith("front") else 171.5))
                for k in self.values
            },
            units=dict.fromkeys(self.values, self.unit),
        )


def target(front, rear):
    return {
        "pressure.front": dict(value=front, unit="psi"),
        "pressure.rear": dict(value=rear, unit="psi"),
    }


@pytest.mark.parametrize(
    ("initial", "taps"),
    [((33, 27), [("pressure.front", -10), ("pressure.rear", 2)]), ((28, 28), [])],
)
def test_batch_reads_initial_values_and_skips_matching_rows(monkeypatch, initial, taps):
    menu = Menu(dict(zip(("pressure.front", "pressure.rear"), initial)))
    monkeypatch.setattr(sliders, "read_tuning_page", lambda frame: frame.read())
    changed = sliders.adjust_page(
        menu, "tyres", target(28, 28), {"carName": "1964 Aston Martin DB5"}
    )
    assert changed == bool(taps)
    assert menu.writes == taps
    assert menu.values == dict.fromkeys(menu.values, 28)


def test_different_car_blocks_input(monkeypatch):
    menu = Menu({"pressure.front": 30, "pressure.rear": 30})
    monkeypatch.setattr(sliders, "read_tuning_page", lambda frame: frame.read())
    with pytest.raises(RuntimeError, match="車輛"):
        sliders.adjust_page(menu, "tyres", target(28, 28), {"carName": "other car"})
    assert not menu.writes


def test_unfamiliar_display_unit_calibrates_then_verifies_without_writing(monkeypatch):
    menu = Menu({"pressure.front": 2.3, "pressure.rear": 2.1}, "bar")
    monkeypatch.setattr(sliders, "read_tuning_page", lambda frame: frame.read())
    goals = target(29, 30)
    car = {"carName": "1964 Aston Martin DB5"}
    sliders.adjust_page(menu, "tyres", goals, car)
    assert menu.values["pressure.front"] == pytest.approx(2.0)
    assert menu.values["pressure.rear"] == pytest.approx(2.05)
    written = list(menu.writes)
    sliders.adjust_page(menu, "tyres", goals, car, verify_only=True)
    assert menu.writes == written


def test_stuck_slider_never_passes(monkeypatch):
    menu = Menu({"pressure.front": 30, "pressure.rear": 30})
    monkeypatch.setattr(sliders, "read_tuning_page", lambda frame: frame.read())
    monkeypatch.setattr(menu, "tap", lambda *args: None)
    with pytest.raises(RuntimeError, match="讀回不符"):
        sliders.adjust_page(
            menu, "tyres", target(28, 28), {"carName": "1964 Aston Martin DB5"}
        )
