-- 1. Routes and Corridors
CREATE TABLE IF NOT EXISTS routes (
    route_id VARCHAR(50) PRIMARY KEY, -- e.g. 'ZRH-BCN'
    origin_city VARCHAR(100) NOT NULL,
    destination_city VARCHAR(100) NOT NULL,
    distance_km INT,
    standard_capacity INT DEFAULT 21,
    default_break_even_seats INT DEFAULT 15,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Departures (Individual scheduled coach journeys)
CREATE TABLE IF NOT EXISTS departures (
    departure_id VARCHAR(100) PRIMARY KEY, -- e.g. 'DEP-20261024-ZRHBCN'
    route_id VARCHAR(50) REFERENCES routes(route_id),
    departure_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
    total_capacity INT DEFAULT 21,
    break_even_seats INT DEFAULT 15,
    base_cost_eur NUMERIC(10, 2) DEFAULT 1850.00,
    status VARCHAR(30) DEFAULT 'SCHEDULED', -- 'SCHEDULED', 'DEPARTED', 'CANCELLED'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Live Bookings
CREATE TABLE IF NOT EXISTS bookings (
    booking_id VARCHAR(100) PRIMARY KEY,
    departure_id VARCHAR(100) REFERENCES departures(departure_id),
    customer_id VARCHAR(100),
    booking_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    seats_count INT NOT NULL DEFAULT 1,
    ticket_price_eur NUMERIC(10, 2) NOT NULL,
    discount_eur NUMERIC(10, 2) DEFAULT 0.00,
    booking_channel VARCHAR(50) DEFAULT 'DIRECT_WEB', -- 'DIRECT_WEB', 'OTA', 'PARTNER'
    is_cancelled BOOLEAN DEFAULT FALSE,
    cancellation_timestamp TIMESTAMP WITH TIME ZONE
);

-- 4. Historical Daily Snapshots (For D-30 to D-0 Booking Curves)
CREATE TABLE IF NOT EXISTS departure_daily_snapshots (
    snapshot_id SERIAL PRIMARY KEY,
    snapshot_date DATE NOT NULL,
    departure_id VARCHAR(100) REFERENCES departures(departure_id),
    days_to_departure INT NOT NULL,
    seats_sold INT NOT NULL,
    load_factor_pct NUMERIC(5, 2) NOT NULL,
    gap_to_break_even INT NOT NULL,
    revenue_booked_eur NUMERIC(10, 2) NOT NULL,
    avg_ticket_price_eur NUMERIC(10, 2) NOT NULL,
    velocity_24h INT DEFAULT 0,
    velocity_7d INT DEFAULT 0,
    expected_benchmark_seats NUMERIC(5, 2),
    pace_status VARCHAR(50), -- 'AHEAD', 'ON_TRACK', 'BEHIND'
    commercial_status VARCHAR(50), -- 'CRITICAL_RISK', 'NEEDS_ATTENTION', 'BREAK_EVEN_REACHED', 'HIGH_DEMAND', 'SOLD_OUT'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_departure_daily_snapshot UNIQUE(snapshot_date, departure_id)
);

-- Indexes for lightning fast BI queries
CREATE INDEX IF NOT EXISTS idx_snapshots_departure ON departure_daily_snapshots(departure_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_departures_datetime ON departures(departure_datetime);
CREATE INDEX IF NOT EXISTS idx_bookings_departure ON bookings(departure_id, is_cancelled);