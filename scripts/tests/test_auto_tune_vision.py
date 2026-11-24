"""The numeric parser is portable. Recorded game-frame regression checks require Windows OCR."""

import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts.auto_tune.collect import _read_card
from scripts.auto_tune.shop import forced_induction, read_tire_size, tire_size
from scripts.auto_tune.slider_digits import read_number
from scripts.auto_tune.vision import _number, read_tuning_page


class ShopReadings(unittest.TestCase):
    def test_selected_five_and_six_in_real_game_font(self):
        # Normalized glyphs from the DB5's spring and anti-roll bar readbacks.
        # In the selected front ARB row, a filled-pixel nearest match picked 5 for 6.
        samples = [
            ("5", 380441446521611435233530934335028390917218861455423563774),
            ("6", 773143428817114560038402692112784406753287456925818020344),
        ]
        for expected, mask in samples:
            with patch(
                "scripts.auto_tune.slider_digits.glyphs",
                return_value=[(4.125, 5.625, -0.125, mask)],
            ):
                self.assertEqual(read_number(None, 0, True), expected)

    def test_malformed_sizes_are_unknown(self):
        self.assertIsNone(tire_size("255160R15"))
        self.assertIsNone(tire_size("已擁有 255/60R15"))
        self.assertEqual(tire_size("255 / 60 R 15"), (255, 60, 15))

    def test_induction_uses_positive_part_evidence(self):
        self.assertEqual(forced_induction("雙渦輪增壓器"), "TwinTurbo")
        self.assertEqual(forced_induction("單渦輪增壓器"), "Turbo")
        for label in ("容積式機械增壓器", "離心式機械增壓器"):
            self.assertEqual(forced_induction(label), "Supercharger")
        self.assertIsNone(forced_induction("進氣系統"))
        self.assertIsNone(forced_induction("渦輪中冷器"))

    def test_values_preserve_sign_and_units(self):
        self.assertEqual(_number("1,398.6"), 1398.6)
        self.assertEqual(_number("−2.1°"), -2.1)
        self.assertIsNone(_number("1,39.6"))


@unittest.skipUnless(
    sys.platform == "win32" and os.environ.get("FH6_DB5_CAPTURE_DIR"),
    "Set FH6_DB5_CAPTURE_DIR to the recorded Traditional Chinese DB5 session",
)
class RecordedFrames(unittest.TestCase):
    root = Path(os.environ.get("FH6_DB5_CAPTURE_DIR", "."))

    def test_tuning_pages_after_adjustment(self):
        cases = [
            (
                "gears-adjusted-1795487974693526200.png",
                "gears",
                [3.99, 1.84, 1.43, 1.15, 0.96, 0.82, 0.72],
            ),
            (
                "gears-alignment_after-1795488405850772100.png",
                "alignment",
                [-2.1, -1.3, 0.1, -0.1, 6.0],
            ),
            (
                "gears-damping_after-1795488413420752300.png",
                "damping",
                [10.7, 10.3, 6.4, 6.2],
            ),
            ("probe-1795488380718582900.png", "springs", [851.2, 829.0, 5.7, 7.0]),
            ("probe-1795487846811782400.png", "tyres", [29.5, 28.0]),
            ("probe-1795486576851758000.png", "springs", [1398.6, 1398.6, 7.4, 8.7]),
        ]
        for filename, tab, values in cases:
            with self.subTest(filename=filename):
                page = read_tuning_page(self.root / filename)
                self.assertEqual(page["page"], "tuning." + tab)
                self.assertEqual(list(page["fields"].values()), values)
                self.assertTrue(all(page["units"].values()))
                self.assertEqual(page["car"], "1964 Aston Martin DB5")
                self.assertIn(page["selected"], page["rows"])

    def test_locked_aero_and_wrong_scene(self):
        page = read_tuning_page(self.root / "probe-1795487647272117800.png")
        self.assertEqual(page["fields"], {})
        self.assertTrue(all(r["locked"] for r in page["rows"].values()))
        with self.assertRaises(ValueError):
            read_tuning_page(self.root / "probe-1795487395724278200.png")

    def test_installed_tire_sources_and_current_card(self):
        for axle, frames, expected in [
            ("front", ["7410943610800", "8110932802700"], (255, 60, 15)),
            ("rear", ["7424386805300", "8097962764200"], (285, 55, 15)),
        ]:
            for n in frames:
                self.assertEqual(
                    read_tire_size(self.root / f"probe-179548{n}.png", axle), expected
                )
        card = _read_card(
            self.root / "5ee53940433d40afb0a2af65ed717317/screens/0011.png"
        )
        self.assertEqual(card["carName"], "1964 Aston Martin DB5")
        self.assertEqual(card["performanceIndex"], 600)
        with self.assertRaises(ValueError):
            _read_card(self.root / "probe-1795486434593088100.png")
