"""Opt-in native OCR replay of immutable, manually transcribed game screenshots."""

import json
import os
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts.auto_tune.native_ocr import NativeOcrSession
from scripts.auto_tune.replay import replay

MANIFEST = Path(__file__).with_name("fixtures") / "auto_tune_cross_car.json"


@unittest.skipUnless(
    os.environ.get("FH6_CROSS_CAR_CAPTURE_DIR") and os.environ.get("FH6_OCR_RUNTIME"),
    "Set FH6_CROSS_CAR_CAPTURE_DIR and FH6_OCR_RUNTIME for game-frame replay",
)
class CrossCarReplay(unittest.TestCase):
    def test_recorded_game_screens(self):
        cases = json.loads(MANIFEST.read_text(encoding="utf-8"))["cases"]
        root = Path(os.environ["FH6_CROSS_CAR_CAPTURE_DIR"])
        session = NativeOcrSession()
        self.addCleanup(session.close)
        with patch("scripts.auto_tune.vision.read_ocr", session.read):
            for case in cases:
                with self.subTest(file=case["file"]):
                    self.assertEqual(replay(case, root), case["expected"])
