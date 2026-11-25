import os
import unittest
from pathlib import Path

from scripts.auto_tune.car_card import (
    _read_value,
    _solid_stem,
    canonical_stats,
    read_card_stats,
)


class CardUnits(unittest.TestCase):
    def test_rejects_attached_digit_or_unknown_suffix(self):
        for text in ("", "1", "I", "L"):
            with self.subTest(text=text), self.assertRaises(ValueError):
                _read_value("displacementLiters", "排氣量4.001", "4.00", text, False)
        with self.assertRaises(ValueError):
            _read_value("displacementLiters", "排氣量3.80gal", "3.80", "gal", True)
        with self.assertRaises(ValueError):
            _read_value("maxTorque", "扭力316ft·Ib", "316", "ft·Ib", False)

    def test_optically_separate_litre_unit_preserves_displayed_precision(self):
        self.assertEqual(
            _read_value("displacementLiters", "排氣量2.501", "2.50", "I", True),
            ("2.50", "l"),
        )
        self.assertEqual(
            _read_value("displacementLiters", "排氣量1498cc", "1498", "cc", False),
            ("1498", "cc"),
        )
        self.assertAlmostEqual(
            canonical_stats({"displacementLiters": ("1,498", "cc")})[
                "displacementLiters"
            ],
            1.498,
        )
        self.assertTrue(_solid_stem({(x, y) for x in range(3) for y in range(20)}))
        self.assertFalse(
            _solid_stem(
                {(x, y) for x in range(3) for y in range(20)} | {(-2, 3), (-1, 3)}
            )
        )

    def test_whole_row_and_isolated_value_must_agree(self):
        with self.assertRaises(ValueError):
            _read_value("displacementLiters", "排氣量4.001", "40.00", "I", True)
        with self.assertRaises(ValueError):
            _read_value("weight", "車重2,700Ibs", "2,100", "lb", False)
        with self.assertRaises(ValueError):
            _read_value("displacementLiters", "排氣量4.00l", "4.00", "1", False)
        with self.assertRaises(ValueError):
            _read_value("maxHp", "馬力175kW", "176", "kW", False)
        with self.assertRaises(ValueError):
            _read_value("weight", "車重1,201kg", "1,201", "lb", False)
        with self.assertRaises(ValueError):
            _read_value("maxHp", "扭力200hp", "200", "hp", False)

    @unittest.skipUnless(
        os.environ.get("FH6_OCR_CORPUS"),
        "Set FH6_OCR_CORPUS to the verified DB5 replay",
    )
    def test_recorded_raw_value_and_unit_pairs(self):
        path = Path(os.environ["FH6_OCR_CORPUS"]) / "frames/0005-current-car.png"
        self.assertEqual(
            read_card_stats(path),
            {
                "maxHp": ("316", "hp"),
                "maxTorque": ("316", "ft·lb"),
                "weight": ("2,700", "lb"),
                "weight_distribution": ("51", "%"),
                "displacementLiters": ("4.00", "l"),
            },
        )
