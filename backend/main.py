"""
FastAPI Commercial Analytics API Server
Exposes deterministic KPIs, departure triage, and booking curves from Supabase.
"""

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, List
from backend.engine.pipeline import get_connection
from backend.engine.ai_brief import generate_commercial_briefing


app = FastAPI(
    title="Nocturne Mobility Commercial Analytics API",
    description="Automated BI & Decision-Making Engine for European Overnight Network",
    version="1.0.0"
)

# Enable CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
def health_check():
    return {"status": "healthy", "service": "mobility-bi-backend"}

@app.get("/api/kpis/summary")
def get_executive_summary():
    """Returns the 30-second executive summary KPIs for management."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            # Query latest snapshots
            cur.execute("""
                SELECT 
                    COUNT(*) as total_active_departures,
                    COALESCE(SUM(seats_sold), 0) as total_seats_sold,
                    COALESCE(SUM(revenue_booked_eur), 0) as total_revenue_eur,
                    COALESCE(AVG(load_factor_pct), 0) as avg_load_factor,
                    COUNT(*) FILTER (WHERE seats_sold >= 15) as departures_above_be,
                    COUNT(*) FILTER (WHERE commercial_status = 'CRITICAL_RISK') as departures_at_risk,
                    COUNT(*) FILTER (WHERE commercial_status = 'HIGH_DEMAND' OR commercial_status = 'SOLD_OUT') as departures_high_demand
                FROM departure_daily_snapshots
                WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM departure_daily_snapshots);
            """)
            stats = cur.fetchone()

            avg_ticket_price = 0.0
            if stats["total_seats_sold"] > 0:
                avg_ticket_price = round(float(stats["total_revenue_eur"]) / stats["total_seats_sold"], 2)

            return {
                "total_revenue_eur": round(float(stats["total_revenue_eur"]), 2),
                "total_seats_sold": stats["total_seats_sold"],
                "avg_load_factor_pct": round(float(stats["avg_load_factor"]), 1),
                "avg_ticket_price_eur": avg_ticket_price,
                "departures_above_break_even": stats["departures_above_be"],
                "departures_at_risk": stats["departures_at_risk"],
                "departures_high_demand": stats["departures_high_demand"],
                "total_active_departures": stats["total_active_departures"]
            }

@app.get("/api/departures")
def get_departure_control_center(route: Optional[str] = None, status: Optional[str] = None):
    """Returns departures ranked by commercial priority with break-even indicators."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            query = """
                SELECT 
                    d.departure_id,
                    d.route_id,
                    r.origin_city || ' → ' || r.destination_city as route_name,
                    d.departure_datetime,
                    d.total_capacity,
                    d.break_even_seats,
                    s.snapshot_date,
                    s.days_to_departure,
                    s.seats_sold,
                    s.load_factor_pct,
                    s.gap_to_break_even,
                    s.revenue_booked_eur,
                    s.avg_ticket_price_eur,
                    s.velocity_24h,
                    s.velocity_7d,
                    s.expected_benchmark_seats,
                    s.pace_status,
                    s.commercial_status
                FROM departures d
                JOIN routes r ON d.route_id = r.route_id
                JOIN departure_daily_snapshots s ON d.departure_id = s.departure_id
                WHERE s.snapshot_date = (SELECT MAX(snapshot_date) FROM departure_daily_snapshots)
            """
            params = []

            if route and route != "ALL":
                query += " AND r.route_id = %s"
                params.append(route)
            
            if status and status != "ALL":
                query += " AND s.commercial_status = %s"
                params.append(status)

            # Rank by urgency (Critical Risk first, then closest days out)
            query += """
                ORDER BY 
                    CASE 
                        WHEN s.commercial_status = 'CRITICAL_RISK' THEN 1
                        WHEN s.commercial_status = 'NEEDS_ATTENTION' THEN 2
                        WHEN s.commercial_status = 'HIGH_DEMAND' THEN 3
                        ELSE 4
                    END,
                    s.days_to_departure ASC;
            """
            cur.execute(query, params)
            return cur.fetchall()

@app.get("/api/booking-curve/{departure_id}")
def get_booking_curve(departure_id: str):
    """Returns historical daily booking progress vs expected benchmark curve for charts."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT 
                    snapshot_date,
                    days_to_departure,
                    seats_sold,
                    expected_benchmark_seats,
                    velocity_24h
                FROM departure_daily_snapshots
                WHERE departure_id = %s
                ORDER BY days_to_departure DESC;
            """, (departure_id,))

        
        
        
        
@app.get("/api/ai/daily-brief")
def get_ai_daily_brief():
    """Generates or retrieves the daily commercial morning executive briefing."""
    return generate_commercial_briefing()

@app.post("/api/alerts/dispatch-slack")
def dispatch_slack_alert(channel: str = "#commercial-lead"):
    """Simulates automated morning commercial brief dispatch to Slack or Email."""
    brief = generate_commercial_briefing()
    return {
        "status": "dispatched",
        "channel": channel,
        "dispatched_at": datetime.now().isoformat(),
        "headline": brief.get("headline"),
        "summary": brief.get("executive_summary")
    }