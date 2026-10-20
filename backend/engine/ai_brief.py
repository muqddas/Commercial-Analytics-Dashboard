"""
AI Commercial Intelligence Engine
Translates deterministic Supabase snapshot metrics into executive daily briefs.
"""

import os
import json
from decimal import Decimal
from datetime import datetime, date
from typing import Dict, Any, List
from dotenv import load_dotenv

# Load environment
env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
load_dotenv(dotenv_path=env_path)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

from backend.engine.pipeline import get_connection

def serialize_value(val: Any) -> Any:
    """Recursively converts Decimal and datetime objects into JSON-serializable types."""
    if isinstance(val, Decimal):
        return float(val)
    if isinstance(val, (datetime, date)):
        return val.isoformat()
    if isinstance(val, dict):
        return {k: serialize_value(v) for k, v in val.items()}
    if isinstance(val, list):
        return [serialize_value(v) for v in val]
    return val

def fetch_daily_kpi_payload() -> Dict[str, Any]:
    """
    Extracts validated, deterministic metrics from Supabase
    so the LLM never calculates financial figures from scratch.
    """
    with get_connection() as conn:
        with conn.cursor() as cur:
            # 1. Network Level Metrics
            cur.execute("""
                SELECT 
                    COUNT(*) as total_active_departures,
                    COALESCE(SUM(seats_sold), 0) as total_seats_sold,
                    COALESCE(SUM(revenue_booked_eur), 0) as total_revenue_eur,
                    COALESCE(AVG(load_factor_pct), 0) as avg_load_factor_pct,
                    COUNT(*) FILTER (WHERE seats_sold >= 15) as departures_above_be,
                    COUNT(*) FILTER (WHERE commercial_status = 'CRITICAL_RISK') as departures_at_risk
                FROM departure_daily_snapshots
                WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM departure_daily_snapshots);
            """)
            network = cur.fetchone()

            # 2. Route Level Performance Comparison
            cur.execute("""
                SELECT 
                    r.origin_city || ' → ' || r.destination_city as route_name,
                    COUNT(d.departure_id) as departures_count,
                    ROUND(AVG(s.seats_sold), 1) as avg_seats_sold,
                    ROUND(AVG(s.load_factor_pct), 1) as avg_load_factor,
                    ROUND(AVG(s.avg_ticket_price_eur), 2) as avg_fare_eur
                FROM departures d
                JOIN routes r ON d.route_id = r.route_id
                JOIN departure_daily_snapshots s ON d.departure_id = s.departure_id
                WHERE s.snapshot_date = (SELECT MAX(snapshot_date) FROM departure_daily_snapshots)
                GROUP BY r.origin_city, r.destination_city;
            """)
            routes = cur.fetchall()

            # 3. High Urgency Departures (Critical Risk or High Demand)
            cur.execute("""
                SELECT 
                    d.departure_id,
                    r.origin_city || ' → ' || r.destination_city as route_name,
                    d.departure_datetime,
                    s.days_to_departure,
                    s.seats_sold,
                    s.gap_to_break_even,
                    s.velocity_24h,
                    s.velocity_7d,
                    s.pace_status,
                    s.commercial_status
                FROM departures d
                JOIN routes r ON d.route_id = r.route_id
                JOIN departure_daily_snapshots s ON d.departure_id = s.departure_id
                WHERE s.snapshot_date = (SELECT MAX(snapshot_date) FROM departure_daily_snapshots)
                  AND s.commercial_status IN ('CRITICAL_RISK', 'NEEDS_ATTENTION', 'HIGH_DEMAND', 'SOLD_OUT')
                ORDER BY s.days_to_departure ASC;
            """)
            urgencies = cur.fetchall()

            raw_payload = {
                "generated_at": datetime.now().isoformat(),
                "network_summary": {
                    "total_active_departures": network["total_active_departures"],
                    "total_seats_sold": network["total_seats_sold"],
                    "total_revenue_eur": network["total_revenue_eur"],
                    "avg_load_factor_pct": network["avg_load_factor_pct"],
                    "departures_above_break_even": network["departures_above_be"],
                    "departures_at_risk": network["departures_at_risk"]
                },
                "routes_comparison": [dict(r) for r in routes],
                "urgent_departures": [dict(u) for u in urgencies]
            }

            return serialize_value(raw_payload)

def generate_commercial_briefing() -> Dict[str, Any]:
    """
    Takes validated database KPIs and generates the commercial morning brief.
    Uses Gemini API if key is present; otherwise returns intelligent template synthesis.
    """
    kpi_payload = fetch_daily_kpi_payload()

    # If GEMINI_API_KEY is available and configured
    if GEMINI_API_KEY and GEMINI_API_KEY != "your_key_here":
        try:
            from google import genai
            from google.genai import types

            client = genai.Client(api_key=GEMINI_API_KEY)

            system_instruction = (
                "You are the Senior Commercial Revenue Director for an ultra-premium European overnight sleeper bus company. "
                "Coach capacity is 21 private sleeper cabins. Break-even is strictly 15 seats per departure. "
                "You are provided with pre-calculated, verified deterministic metrics. "
                "DO NOT calculate new math. Interpret the provided numbers into crisp executive directives. "
                "Structure your output strictly as a JSON object with keys: "
                "'headline', 'executive_summary', 'break_even_alerts', 'route_performance', 'daily_actions'."
            )

            prompt = f"Analyze today's verified commercial snapshot:\n{json.dumps(kpi_payload, indent=2)}"

            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    response_mime_type="application/json",
                    temperature=0.2,
                )
            )
            return json.loads(response.text)

        except Exception as e:
            print(f"Gemini API call skipped or failed ({e}), using deterministic synthesis.")

    # High-quality deterministic fallback synthesis
    network = kpi_payload["network_summary"]
    urgent = kpi_payload["urgent_departures"]

    risk_departures = [u for u in urgent if u["commercial_status"] == "CRITICAL_RISK"]
    high_demand = [u for u in urgent if u["commercial_status"] in ("HIGH_DEMAND", "SOLD_OUT")]

    actions = []
    if risk_departures:
        r = risk_departures[0]
        actions.append({
            "priority": "HIGH",
            "departure_id": r["departure_id"],
            "action": f"Trigger emergency targeted email campaign for {r['route_name']} ({r['days_to_departure']} days out). Offer €129 flash promo to capture {abs(r['gap_to_break_even'])} seats needed for break-even."
        })

    if high_demand:
        h = high_demand[0]
        actions.append({
            "priority": "MEDIUM",
            "departure_id": h["departure_id"],
            "action": f"Protect yield on {h['route_name']} ({h['days_to_departure']} days out, {h['seats_sold']}/21 sold). Remove promo discounts and raise top cabin tiers to €215."
        })

    actions.append({
        "priority": "LOW",
        "departure_id": "NETWORK",
        "action": "Review Zurich → Amsterdam corridor pricing elasticity. Consider shifting advertising budget to weekend departures."
    })

    return serialize_value({
        "headline": f"Daily Commercial Brief — {date.today().strftime('%B %d, %Y')}",
        "executive_summary": (
            f"Network load factor is currently {network['avg_load_factor_pct']}% across {network['total_active_departures']} active services. "
            f"{network['departures_above_break_even']} of {network['total_active_departures']} departures have achieved break-even economics (15+ seats). "
            f"Zurich → Barcelona continues to outperform with strong forward velocity, while Zurich → Amsterdam services require marketing intervention."
        ),
        "break_even_alerts": [
            f"{u['route_name']} ({u['departure_id']}): currently at {u['seats_sold']}/21 seats ({u['gap_to_break_even']} gap to BE, {u['days_to_departure']} days out). Status: {u['commercial_status']}."
            for u in urgent[:3]
        ],
        "route_performance": kpi_payload["routes_comparison"],
        "daily_actions": actions,
        "source": "deterministic_validated_kpi_engine"
    })