import pytest

def calculate_load_factor(seats_sold: int, capacity: int = 21) -> float:
    return round((seats_sold / capacity) * 100, 2)

def calculate_break_even_gap(seats_sold: int, break_even_target: int = 15) -> int:
    return seats_sold - break_even_target

def test_load_factor():
    assert calculate_load_factor(17, 21) == 80.95
    assert calculate_load_factor(21, 21) == 100.0
    assert calculate_load_factor(0, 21) == 0.0

def test_break_even_gap():
    # 17 seats -> 2 seats above break even
    assert calculate_break_even_gap(17, 15) == 2
    # 8 seats -> 7 seats shortfall
    assert calculate_break_even_gap(8, 15) == -7
    # Exactly break even
    assert calculate_break_even_gap(15, 15) == 0