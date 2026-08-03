import os
import sys

import pytest

sys.path.insert(
    0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../backend"))
)

from main import dyno_is_reasonable


def test_dyno_is_reasonable_no_neighbors():
    """Test when neighbor_vals is empty or None."""
    assert dyno_is_reasonable(100, []) is True
    assert dyno_is_reasonable(100, None) is True


def test_dyno_is_reasonable_max_neighbor_zero_or_negative():
    """Test when the maximum neighbor value is 0 or negative."""
    assert dyno_is_reasonable(100, [0, -10, -5]) is True
    assert dyno_is_reasonable(100, [-20, -10, -5]) is True


def test_dyno_is_reasonable_within_threshold():
    """Test when new_val is within the acceptable threshold."""
    # With default threshold 0.30
    # max_neighbor = 100
    # max_acceptable = 100 * 1.30 = 130
    assert dyno_is_reasonable(130, [80, 90, 100]) is True
    assert dyno_is_reasonable(129, [80, 90, 100]) is True
    assert dyno_is_reasonable(100, [80, 90, 100]) is True


def test_dyno_is_reasonable_exceeds_threshold():
    """Test when new_val exceeds the acceptable threshold."""
    # With default threshold 0.30
    # max_neighbor = 100
    # max_acceptable = 100 * 1.30 = 130
    assert dyno_is_reasonable(131, [80, 90, 100]) is False
    assert dyno_is_reasonable(200, [80, 90, 100]) is False


def test_dyno_is_reasonable_custom_threshold():
    """Test with a custom threshold."""
    # With custom threshold 0.50
    # max_neighbor = 100
    # max_acceptable = 100 * 1.50 = 150
    assert dyno_is_reasonable(150, [80, 90, 100], threshold=0.50) is True
    assert dyno_is_reasonable(151, [80, 90, 100], threshold=0.50) is False
