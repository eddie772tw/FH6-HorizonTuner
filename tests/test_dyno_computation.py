import math
import unittest

from backend.main import compute_dyno_value


class TestDynoComputation(unittest.TestCase):
    def test_empty_or_none_history(self):
        """Empty history list or None returns 0."""
        self.assertEqual(compute_dyno_value([]), 0)
        self.assertEqual(compute_dyno_value(None), 0)

    def test_less_than_four_samples(self):
        """History with less than 4 samples returns the maximum value."""
        self.assertEqual(compute_dyno_value([10]), 10)
        self.assertEqual(compute_dyno_value([10, 20]), 20)
        self.assertEqual(compute_dyno_value([10, 30, 20]), 30)

    def test_four_samples_no_outliers(self):
        """History with 4 samples without outliers calculates the correct recency-weighted mean."""
        # History: [10, 20, 30, 40]
        # weights: [1, 2, 3, 4] -> sum(weight) = 10
        # weighted_sum = 10*1 + 20*2 + 30*3 + 40*4 = 10 + 40 + 90 + 160 = 300
        # mean = 300 / 10 = 30.0
        self.assertEqual(compute_dyno_value([10, 20, 30, 40]), 30.0)

    def test_with_outliers_iqr_filtering(self):
        """History with upper/lower outliers correctly filters them using IQR bounds."""
        # Samples: [10, 10, 11, 12, 11, 100]
        # n = 6, sorted: [10, 10, 11, 11, 12, 100]
        # q1 = sorted[6//4 = 1] = 10
        # q3 = sorted[3*6//4 = 4] = 12
        # iqr = 12 - 10 = 2
        # lower_fence = 10 - 1.5*2 = 7, upper_fence = 12 + 1.5*2 = 15
        # 100 is > 15, so filtered out.
        # Remaining items in original order:
        # index 0: 10 (weight 1) -> 10
        # index 1: 10 (weight 2) -> 20
        # index 2: 11 (weight 3) -> 33
        # index 3: 12 (weight 4) -> 48
        # index 4: 11 (weight 5) -> 55
        # total_weight = 15, weighted_sum = 166 -> mean = 166 / 15
        self.assertAlmostEqual(
            compute_dyno_value([10, 10, 11, 12, 11, 100]), 166.0 / 15.0
        )

    def test_recency_weighting_order(self):
        """History with same values in different orders yields different results due to recency weighting."""
        val1 = compute_dyno_value([10, 20, 30, 40])
        val2 = compute_dyno_value([40, 30, 20, 10])
        self.assertEqual(val1, 30.0)
        self.assertEqual(val2, 20.0)
        self.assertNotEqual(val1, val2)

    def test_identical_values(self):
        """History with identical values returns that value."""
        self.assertEqual(compute_dyno_value([50, 50, 50, 50, 50]), 50.0)

    def test_negative_and_zero_values(self):
        """History with negative values and zeroes calculates correct IQR and recency-weighted mean."""
        # Samples: [-10, -5, 0, 5]
        # n = 4, sorted: [-10, -5, 0, 5]
        # q1 = -5, q3 = 5, iqr = 10
        # lower_fence = -20, upper_fence = 20
        # items: -10 (w=1), -5 (w=2), 0 (w=3), 5 (w=4)
        # total_weight = 10, sum = -10 + (-10) + 0 + 20 = 0
        self.assertEqual(compute_dyno_value([-10, -5, 0, 5]), 0.0)

    def test_all_outliers_fallback(self):
        """If all values are NaN, fallback returns max(history)."""
        val = compute_dyno_value([math.nan, math.nan, math.nan, math.nan])
        self.assertTrue(math.isnan(val))


if __name__ == "__main__":
    unittest.main()
