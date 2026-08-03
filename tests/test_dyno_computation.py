import math
import unittest

from backend.main import compute_dyno_value


class TestDynoComputation(unittest.TestCase):
    def test_empty_history(self):
        """Empty history list returns 0."""
        self.assertEqual(compute_dyno_value([]), 0)

    def test_less_than_four_samples(self):
        """History with less than 4 samples returns the maximum value."""
        self.assertEqual(compute_dyno_value([10]), 10)
        self.assertEqual(compute_dyno_value([10, 20]), 20)
        self.assertEqual(compute_dyno_value([10, 30, 20]), 30)

    def test_four_samples_no_outliers(self):
        """History with 4 samples without outliers calculates the correct recency-weighted mean."""
        self.assertEqual(compute_dyno_value([10, 20, 30, 40]), 30)

    def test_with_outlier(self):
        """History with an outlier correctly filters the outlier using the IQR method."""
        self.assertAlmostEqual(compute_dyno_value([100, 10, 12, 11, 10, 11]), 10.8)

    def test_recency_weighting_order(self):
        """History with same values in different orders yields different results due to recency weighting."""
        val1 = compute_dyno_value([10, 20, 30, 40])
        val2 = compute_dyno_value([40, 30, 20, 10])
        self.assertEqual(val1, 30.0)
        self.assertEqual(val2, 20.0)
        self.assertNotEqual(val1, val2)

    def test_all_outliers_fallback(self):
        """If all values are NaN, total weight is 0, so fallback to max returns NaN."""
        val = compute_dyno_value([math.nan, math.nan, math.nan, math.nan])
        self.assertTrue(math.isnan(val))


if __name__ == "__main__":
    unittest.main()
