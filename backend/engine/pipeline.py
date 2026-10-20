"""
Supabase PostgreSQL Commercial Snapshot & Booking Curve ETL Pipeline
"""

import os
from datetime import datetime, date, timedelta
from typing import Tuple
from dotenv import load_dotenv
import psycopg
from psycopg.rows import dict_row

# Load environment variables from backend/.env
env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
load_dotenv(dotenv_path=env_path)

DATABASE_URL = os.getenv("DATABASE_URL")

# Historical standard booking curve benchmark for 21-seat night routes:
BENCHMARK_CURVE = {
    30: 3.5,
    21: 6.8,
    14: 10.2,
    10: 12.0,
    7: 14.5,
    4: 16.5,
    2: 18.0,
    1: 19.0,
    0: 20.0
}

def get_connection():
    if not DATABASE_URL:
        raise ValueError("DATABASE_URL is not set in backend/.env!")
    # prepare_threshold=None disables prepared statement caching, required by PgBouncer transaction poolers
    return psycopg.connect(DATABASE_URL, row_factory=dict_row, prepare_threshold=None)

def get_expected_benchmark(days_out: int) -> float:
    for threshold in sorted(BENCHMARK_CURVE.keys()):
        if days_out <= threshold:
            return BENCHMARK_CURVE[threshold]
    return BENCHMARK_CURVE[30]

def evaluate_pace(seats_sold: int, expected_benchmark: float) -> Tuple[str, float]:
    if expected_benchmark <= 0:
        return ("ON_TRACK", 0.0)
    variance_pct = round(((seats_sold - expected_benchmark) / expected_benchmark) * 100, 1)
    if variance_pct >= 15.0:
        return ("AHEAD", variance_pct)
    elif variance_pct <= -15.0:
        return ("BEHIND", variance_pct)
    return ("ON_TRACK", variance_pct)

def evaluate_commercial_status(seats_sold: int, days_out: int, break_even: int = 15, capacity: int = 21) -> str:
    if seats_sold >= capacity:
        return "SOLD_OUT"
    if seats_sold >= 18:
        return "HIGH_DEMAND"
    if seats_sold >= break_even:
        return "BREAK_EVEN_REACHED"
    if days_out <= 7 and seats_sold < 10:
        return "CRITICAL_RISK"
    if days_out <= 7 and seats_sold < break_even:
        return "NEEDS_ATTENTION"
    return "ON_TRACK"

def run_daily_snapshot(snapshot_date: str = None) -> int:
    """
    Connects to Supabase, computes cumulative bookings and booking curves,
    and upserts into departure_daily_snapshots.
    """
    if snapshot_date is None:
        snapshot_date = date.today().isoformat()
        
    current_dt = datetime.fromisoformat(snapshot_date)

    with get_connection() as conn:
        with conn.cursor() as cur:
            # 1. Fetch all active scheduled departures
            cur.execute("""
                SELECT departure_id, route_id, departure_datetime, total_capacity, break_even_seats
                FROM departures
                WHERE status = 'SCHEDULED'
            """)
            departures = cur.fetchall()
            processed_count = 0

            for dep in departures:
                dep_id = dep["departure_id"]
                dep_dt = dep["departure_datetime"]
                days_to_departure = (dep_dt.date() - current_dt.date()).days

                # 2. Cumulative bookings up to snapshot date
                cur.execute("""
                    SELECT 
                        COALESCE(SUM(seats_count), 0) AS total_seats,
                        COALESCE(SUM(ticket_price_eur - discount_eur), 0) AS total_revenue
                    FROM bookings
                    WHERE departure_id = %s
                      AND is_cancelled = FALSE
                      AND booking_timestamp <= %s
                """, (dep_id, snapshot_date + " 23:59:59+00"))
                b_row = cur.fetchone()

                seats_sold = int(b_row["total_seats"])
                revenue = float(b_row["total_revenue"])
                avg_price = round(revenue / seats_sold, 2) if seats_sold > 0 else 0.0
                load_factor = round((seats_sold / dep["total_capacity"]) * 100, 1)
                gap_to_be = seats_sold - dep["break_even_seats"]

                # 3. Velocity 24h & 7d from historical snapshots
                prev_date = current_dt.date() - timedelta(days=1)
                cur.execute("""
                    SELECT seats_sold FROM departure_daily_snapshots
                    WHERE departure_id = %s AND snapshot_date = %s
                """, (dep_id, prev_date))
                prev_row = cur.fetchone()
                velocity_24h = max(0, seats_sold - prev_row["seats_sold"]) if prev_row else 0

                week_ago_date = current_dt.date() - timedelta(days=7)
                cur.execute("""
                    SELECT seats_sold FROM departure_daily_snapshots
                    WHERE departure_id = %s AND snapshot_date = %s
                """, (dep_id, week_ago_date))
                week_row = cur.fetchone()
                velocity_7d = max(0, seats_sold - week_row["seats_sold"]) if week_row else 0

                benchmark = get_expected_benchmark(days_to_departure)
                pace_status, _ = evaluate_pace(seats_sold, benchmark)
                comm_status = evaluate_commercial_status(seats_sold, days_to_departure, dep["break_even_seats"], dep["total_capacity"])

                # 4. Upsert Snapshot in Supabase PostgreSQL
                cur.execute("""
                    INSERT INTO departure_daily_snapshots (
                        snapshot_date, departure_id, days_to_departure, seats_sold,
                        load_factor_pct, gap_to_break_even, revenue_booked_eur,
                        avg_ticket_price_eur, velocity_24h, velocity_7d,
                        expected_benchmark_seats, pace_status, commercial_status
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (snapshot_date, departure_id) DO UPDATE SET
                        seats_sold = EXCLUDED.seats_sold,
                        load_factor_pct = EXCLUDED.load_factor_pct,
                        gap_to_break_even = EXCLUDED.gap_to_break_even,
                        revenue_booked_eur = EXCLUDED.revenue_booked_eur,
                        avg_ticket_price_eur = EXCLUDED.avg_ticket_price_eur,
                        velocity_24h = EXCLUDED.velocity_24h,
                        velocity_7d = EXCLUDED.velocity_7d,
                        pace_status = EXCLUDED.pace_status,
                        commercial_status = EXCLUDED.commercial_status
                """, (
                    snapshot_date, dep_id, days_to_departure, seats_sold,
                    load_factor, gap_to_be, revenue, avg_price,
                    velocity_24h, velocity_7d, benchmark, pace_status, comm_status
                ))
                processed_count += 1

            conn.commit()
    return processed_count