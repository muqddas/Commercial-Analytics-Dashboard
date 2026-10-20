"""
Seeds Supabase PostgreSQL with realistic European routes, departures, and bookings.
"""

import sys
import os

# Ensure the project root is in the Python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from backend.engine.pipeline import get_connection, run_daily_snapshot

def seed_supabase():
    print("Connecting to Supabase PostgreSQL...")
    with get_connection() as conn:
        with conn.cursor() as cur:
            # 1. Routes
            cur.execute("""
                INSERT INTO routes (route_id, origin_city, destination_city, distance_km, standard_capacity, default_break_even_seats)
                VALUES 
                    ('ZRH-BCN', 'Zurich', 'Barcelona', 1050, 21, 15),
                    ('BCN-ZRH', 'Barcelona', 'Zurich', 1050, 21, 15),
                    ('ZRH-AMS', 'Zurich', 'Amsterdam', 820, 21, 15),
                    ('AMS-ZRH', 'Amsterdam', 'Zurich', 820, 21, 15)
                ON CONFLICT (route_id) DO NOTHING;
            """)

            # 2. Departures for late October 2026
            cur.execute("""
                INSERT INTO departures (departure_id, route_id, departure_datetime, total_capacity, break_even_seats, base_cost_eur)
                VALUES 
                    ('DEP-ZRHBCN-1024', 'ZRH-BCN', '2026-10-24 20:30:00+00', 21, 15, 1850.0),
                    ('DEP-BCNZRH-1025', 'BCN-ZRH', '2026-10-25 21:00:00+00', 21, 15, 1850.0),
                    ('DEP-ZRHAMS-1023', 'ZRH-AMS', '2026-10-23 21:15:00+00', 21, 15, 1600.0),
                    ('DEP-AMSZRH-1026', 'AMS-ZRH', '2026-10-26 21:00:00+00', 21, 15, 1600.0),
                    ('DEP-ZRHBCN-1031', 'ZRH-BCN', '2026-10-31 20:30:00+00', 21, 15, 1850.0)
                ON CONFLICT (departure_id) DO NOTHING;
            """)

            # 3. Simulate Bookings:
            # High Demand on ZRH-BCN (19 seats sold at €195)
            for i in range(1, 20):
                cur.execute("""
                    INSERT INTO bookings (booking_id, departure_id, customer_id, booking_timestamp, seats_count, ticket_price_eur)
                    VALUES (%s, 'DEP-ZRHBCN-1024', %s, '2026-10-18 14:00:00+00', 1, 195.0)
                    ON CONFLICT (booking_id) DO NOTHING;
                """, (f'BK-ZRHBCN-{i}', f'CUST-{100+i}'))

            # Critical Risk on ZRH-AMS (8 seats sold, D-3)
            for i in range(1, 9):
                cur.execute("""
                    INSERT INTO bookings (booking_id, departure_id, customer_id, booking_timestamp, seats_count, ticket_price_eur)
                    VALUES (%s, 'DEP-ZRHAMS-1023', %s, '2026-10-15 11:30:00+00', 1, 145.0)
                    ON CONFLICT (booking_id) DO NOTHING;
                """, (f'BK-ZRHAMS-{i}', f'CUST-{200+i}'))

            # Break-Even reached on BCN-ZRH (16 seats sold)
            for i in range(1, 17):
                cur.execute("""
                    INSERT INTO bookings (booking_id, departure_id, customer_id, booking_timestamp, seats_count, ticket_price_eur)
                    VALUES (%s, 'DEP-BCNZRH-1025', %s, '2026-10-19 09:20:00+00', 1, 180.0)
                    ON CONFLICT (booking_id) DO NOTHING;
                """, (f'BK-BCNZRH-{i}', f'CUST-{300+i}'))

            conn.commit()
    print("✅ Supabase successfully seeded with routes, departures, and bookings!")

    # Run snapshot calculation for 2026-10-20
    count = run_daily_snapshot('2026-10-20')
    print(f"✅ Successfully processed {count} daily departure snapshots into Supabase!")

if __name__ == '__main__':
    seed_supabase()