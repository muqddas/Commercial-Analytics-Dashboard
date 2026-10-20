# Milestone 1: Discovery & Architecture Specification
**Company:** European Premium Overnight Mobility Network  
**System:** Automated Commercial Analytics & AI Insights Engine  

---

## 1. Executive Summary & Problem Framing
We operate premium overnight sleeper services between major European hubs (e.g., Zurich ↔ Barcelona, Zurich ↔ Amsterdam).
- Vehicle Capacity: **21 private sleeper berths / cabins**
- Break-Even Baseline: **15 seats** per departure
- Core Economic Driver: Operating profit is heavily leveraged on the final 6 seats (seats 16 to 21).

---

## 2. Source-to-Warehouse Data Mapping

| Field Description | Booking Engine Source | Operations / Excel Source | Warehouse Target Field | Type |
| :--- | :--- | :--- | :--- | :--- |
| Departure Identifier | `departure_id` | `trip_id` | `departures.departure_id` | `VARCHAR(100)` |
| Route Pair | `route_code` | `corridor` | `routes.route_id` | `VARCHAR(50)` |
| Origin Hub | `origin` | `from_city` | `routes.origin_city` | `VARCHAR(100)` |
| Destination Hub | `destination` | `to_city` | `routes.destination_city` | `VARCHAR(100)` |
| Booking Time | `booked_at` | - | `bookings.booking_timestamp` | `TIMESTAMPTZ` |
| Scheduled Journey Date | `travel_date` | `service_date` | `departures.departure_datetime` | `TIMESTAMPTZ` |
| Ticket Price (EUR) | `gross_fare` | - | `bookings.ticket_price_eur` | `NUMERIC(10,2)` |
| Promo / Discount | `discount_code_amt`| - | `bookings.discount_eur` | `NUMERIC(10,2)` |
| Cabins Booked | `qty` | - | `bookings.seats_count` | `INT` |
| Trip Operating Cost | - | `bus_operating_cost` | `departures.base_cost_eur` | `NUMERIC(10,2)` |
| Booking Channel | `channel` | - | `bookings.booking_channel` | `VARCHAR(50)` |

---

## 3. The Snapshot Pattern (How We Track Booking Curves Over Time)
Rather than executing expensive, slow aggregations across millions of raw ticket transactions, the system captures an **immutable daily snapshot** at 23:59 UTC for all future departures:

- Table: `departure_daily_snapshots`
- Grain: **1 row per departure per calendar date**
- Attributes recorded:
  - `days_to_departure` ($D_{\text{rem}}$)
  - `cumulative_seats_sold`
  - `cumulative_revenue_eur`
  - `velocity_24h` (Seats booked in last 24h)
  - `velocity_7d` (Seats booked in last 7 days)
  - `pace_variance_pct` (Variance against historical average for this route and weekday)

---

## 4. KPI Formulas

1. **Load Factor ($\text{LF}$):**
   $$\text{LF} = \left(\frac{\text{Seats Sold}}{\text{Capacity}}\right) \times 100$$
2. **Break-Even Gap ($\Delta\text{BE}$):**
   $$\Delta\text{BE} = \text{Seats Sold} - 15$$
3. **Booking Velocity 24h ($V_{24h}$):**
   $$V_{24h} = \text{Seats Sold}_{T} - \text{Seats Sold}_{T-1}$$
4. **Historical Benchmark Curve at Day $d$:**
   $$\mu(d, \text{route}, \text{dow}) = \frac{1}{N} \sum_{i=1}^N \text{Historical Seats Sold at } d \text{ days out}$$