import React, { useState, useEffect, useMemo } from 'react';
import { 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Sparkles, 
  ArrowUpRight, 
  Filter, 
  Send,
  Bus,
  RefreshCw,
  ChevronRight,
  Flame
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  ReferenceLine 
} from 'recharts';

interface SummaryKpis {
  total_revenue_eur: number;
  total_seats_sold: number;
  avg_load_factor_pct: number;
  avg_ticket_price_eur: number;
  departures_above_break_even: number;
  departures_at_risk: number;
  departures_high_demand: number;
  total_active_departures: number;
}

interface DepartureItem {
  departure_id: string;
  route_id: string;
  route_name: string;
  departure_datetime: string;
  total_capacity: number;
  break_even_seats: number;
  days_to_departure: number;
  seats_sold: number;
  load_factor_pct: number;
  gap_to_break_even: number;
  revenue_booked_eur: number;
  avg_ticket_price_eur: number;
  velocity_24h: number;
  velocity_7d: number;
  expected_benchmark_seats: number;
  pace_status: 'AHEAD' | 'ON_TRACK' | 'BEHIND';
  commercial_status: 'CRITICAL_RISK' | 'NEEDS_ATTENTION' | 'BREAK_EVEN_REACHED' | 'HIGH_DEMAND' | 'SOLD_OUT';
}

const DEFAULT_BOOKING_CURVE = [
  { daysOut: 'D-30', actual: 4, benchmark: 3.5 },
  { daysOut: 'D-21', actual: 7, benchmark: 6.8 },
  { daysOut: 'D-14', actual: 11, benchmark: 10.2 },
  { daysOut: 'D-10', actual: 14, benchmark: 12.0 },
  { daysOut: 'D-7',  actual: 16, benchmark: 14.5 },
  { daysOut: 'D-4',  actual: 19, benchmark: 16.5 },
  { daysOut: 'D-1',  actual: null, benchmark: 19.0 },
  { daysOut: 'D-0',  actual: null, benchmark: 20.0 },
];

export default function App() {
  const [kpis, setKpis] = useState<SummaryKpis | null>(null);
  const [departures, setDepartures] = useState<DepartureItem[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedDeparture, setSelectedDeparture] = useState<DepartureItem | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [showAiModal, setShowAiModal] = useState<boolean>(false);
  const [isAiGenerating, setIsAiGenerating] = useState<boolean>(false);

  // Fetch Live Data from FastAPI backend
  const fetchData = async () => {
    try {
      setLoading(true);
      const [kpiRes, depRes] = await Promise.all([
        fetch('/api/kpis/summary'),
        fetch('/api/departures')
      ]);
      const kpiData = await kpiRes.json();
      const depData = await depRes.json();
      setKpis(kpiData);
      setDepartures(depData);
      if (depData && depData.length > 0) {
        setSelectedDeparture(depData[0]);
      }
    } catch (err) {
      console.error('Failed to fetch from API:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredDepartures = useMemo(() => {
    return departures.filter(d => {
      const routeMatch = selectedRoute === 'ALL' || d.route_id === selectedRoute;
      const statusMatch = selectedStatus === 'ALL' || d.commercial_status === selectedStatus;
      return routeMatch && statusMatch;
    });
  }, [departures, selectedRoute, selectedStatus]);

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'SOLD_OUT':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-purple-900/60 text-purple-300 border border-purple-700"><Flame className="w-3 h-3 mr-1"/> Sold Out</span>;
      case 'HIGH_DEMAND':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-900/60 text-emerald-300 border border-emerald-700"><TrendingUp className="w-3 h-3 mr-1"/> High Demand</span>;
      case 'BREAK_EVEN_REACHED':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-blue-900/60 text-blue-300 border border-blue-700"><CheckCircle2 className="w-3 h-3 mr-1"/> BE Reached</span>;
      case 'NEEDS_ATTENTION':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-900/60 text-amber-300 border border-amber-700"><Clock className="w-3 h-3 mr-1"/> Needs Attention</span>;
      case 'CRITICAL_RISK':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-rose-900/60 text-rose-300 border border-rose-700 animate-pulse"><AlertTriangle className="w-3 h-3 mr-1"/> Critical Risk</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs text-slate-400 bg-slate-800 border border-slate-700">On Track</span>;
    }
  };

  const getRecommendedAction = (dep: DepartureItem) => {
    if (dep.commercial_status === 'SOLD_OUT') return 'Activate waitlist & reroute traffic to adjacent departure';
    if (dep.commercial_status === 'HIGH_DEMAND') return 'Protect yield: increase base fare by +15% and remove promo tiers';
    if (dep.commercial_status === 'BREAK_EVEN_REACHED') return 'Break-even reached: protect cabin yield at standard fare';
    if (dep.commercial_status === 'CRITICAL_RISK') return 'EMERGENCY: push flash CRM campaign and partner flash pricing';
    if (dep.commercial_status === 'NEEDS_ATTENTION') return 'Approaching BE: allocate targeted Meta & Google Ads';
    return 'Pace normal: monitor booking velocity';
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased">
      {/* Top Navigation */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
              <Bus className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-base font-bold text-white tracking-tight">NOCTURNE MOBILITY</h1>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">Supabase Connected</span>
              </div>
              <p className="text-xs text-slate-400">Automated European Commercial Intelligence</p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button 
              onClick={fetchData} 
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
              title="Refresh Live Data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-400' : ''}`} />
            </button>

            <button 
              onClick={() => {
                setShowAiModal(true);
                setIsAiGenerating(true);
                setTimeout(() => setIsAiGenerating(false), 900);
              }}
              className="inline-flex items-center space-x-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Daily AI Briefing</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        
        {/* 1. Executive KPI Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
            <span className="text-xs text-slate-400 uppercase tracking-wider font-mono">Revenue Booked</span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-xl font-bold text-white">€{kpis?.total_revenue_eur?.toLocaleString() ?? 0}</span>
              <span className="text-xs text-emerald-400 flex items-center"><ArrowUpRight className="w-3 h-3"/>+14%</span>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
            <span className="text-xs text-slate-400 uppercase tracking-wider font-mono">Seats Sold</span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-xl font-bold text-white">{kpis?.total_seats_sold ?? 0}</span>
              <span className="text-xs text-slate-400 font-mono">/ {kpis ? kpis.total_active_departures * 21 : 105} cap</span>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
            <span className="text-xs text-slate-400 uppercase tracking-wider font-mono">Avg Load Factor</span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-xl font-bold text-indigo-400">{kpis?.avg_load_factor_pct ?? 0}%</span>
              <span className="text-xs text-slate-400 font-mono">BE: 71%</span>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
            <span className="text-xs text-slate-400 uppercase tracking-wider font-mono">Avg Fare</span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-xl font-bold text-white">€{kpis?.avg_ticket_price_eur ?? 0}</span>
              <span className="text-xs text-slate-400 font-mono">Target: €175</span>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
            <span className="text-xs text-slate-400 uppercase tracking-wider font-mono">Above Break-Even</span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-xl font-bold text-emerald-400">{kpis?.departures_above_break_even ?? 0} / {kpis?.total_active_departures ?? 0}</span>
              <span className="text-xs text-emerald-400">BE: 15 seats</span>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm border-l-4 border-l-rose-500">
            <span className="text-xs text-rose-400 uppercase tracking-wider font-mono">Critical Risk</span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-xl font-bold text-rose-400">{kpis?.departures_at_risk ?? 0} Dep</span>
              <span className="text-xs text-rose-400 flex items-center font-semibold">&lt; 10 seats</span>
            </div>
          </div>
        </div>

        {/* 2. Visual Booking Curve & Quick Dispatch Control */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recharts Booking Curve */}
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-slate-800 gap-2">
              <div>
                <h2 className="text-sm font-semibold text-white flex items-center">
                  <TrendingUp className="w-4 h-4 mr-2 text-indigo-400"/>
                  Historical Booking Curve Dynamics
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {selectedDeparture ? `${selectedDeparture.route_name} • ${selectedDeparture.days_to_departure} days to departure` : 'Select a departure below'}
                </p>
              </div>
              <div className="flex items-center space-x-3 text-xs">
                <span className="flex items-center text-indigo-400 font-medium">
                  <span className="w-3 h-0.5 bg-indigo-400 inline-block mr-1"></span> Current Pace
                </span>
                <span className="flex items-center text-slate-400 font-medium">
                  <span className="w-3 h-0.5 bg-slate-500 inline-block mr-1 border-dashed"></span> Historical Benchmark
                </span>
              </div>
            </div>

            <div className="h-64 mt-4 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={DEFAULT_BOOKING_CURVE} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="daysOut" stroke="#64748b" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 21]} stroke="#64748b" tick={{ fontSize: 11 }} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }} 
                  />
                  <ReferenceLine y={15} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'BE (15 seats)', fill: '#f59e0b', fontSize: 10, position: 'right' }} />
                  <Line 
                    type="monotone" 
                    dataKey="actual" 
                    name="Current Departure" 
                    stroke="#818cf8" 
                    strokeWidth={3} 
                    dot={{ r: 4, fill: '#818cf8' }} 
                  />
                  <Line 
                    type="monotone" 
                    dataKey="benchmark" 
                    name="Historical Benchmark" 
                    stroke="#64748b" 
                    strokeWidth={2} 
                    strokeDasharray="4 4" 
                    dot={false} 
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Decision Control Card */}
          {selectedDeparture && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <span className="text-xs font-mono text-indigo-400">DISPATCH DIRECTIVE</span>
                  {renderStatusBadge(selectedDeparture.commercial_status)}
                </div>

                <div className="mt-4">
                  <h3 className="text-lg font-bold text-white">{selectedDeparture.route_name}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">{selectedDeparture.departure_id}</p>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-4 text-xs">
                  <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-500 block">Sold / Cap</span>
                    <span className="text-base font-bold text-white mt-0.5 block">{selectedDeparture.seats_sold} / {selectedDeparture.total_capacity}</span>
                    <span className="text-[10px] text-slate-400">{selectedDeparture.total_capacity - selectedDeparture.seats_sold} seats left</span>
                  </div>
                  <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-500 block">Break-Even Gap</span>
                    <span className={`text-base font-bold mt-0.5 block ${selectedDeparture.gap_to_break_even >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {selectedDeparture.gap_to_break_even >= 0 ? `+${selectedDeparture.gap_to_break_even}` : selectedDeparture.gap_to_break_even} seats
                    </span>
                    <span className="text-[10px] text-slate-400">Target: 15 seats</span>
                  </div>
                  <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-500 block">Pace Status</span>
                    <span className="text-base font-bold text-indigo-400 mt-0.5 block">{selectedDeparture.pace_status}</span>
                    <span className="text-[10px] text-slate-400">Benchmark: {selectedDeparture.expected_benchmark_seats} seats</span>
                  </div>
                  <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-500 block">Revenue Booked</span>
                    <span className="text-base font-bold text-white mt-0.5 block">€{selectedDeparture.revenue_booked_eur}</span>
                    <span className="text-[10px] text-slate-400">Avg €{selectedDeparture.avg_ticket_price_eur}/seat</span>
                  </div>
                </div>

                <div className="mt-5 p-3 rounded-lg bg-indigo-950/40 border border-indigo-800/50">
                  <span className="text-[11px] font-mono text-indigo-300 font-semibold uppercase flex items-center">
                    <Sparkles className="w-3.5 h-3.5 mr-1 text-amber-300"/> Recommended Action Today
                  </span>
                  <p className="text-xs text-slate-200 mt-1 font-medium">
                    {getRecommendedAction(selectedDeparture)}
                  </p>
                </div>
              </div>

              <button 
                onClick={() => alert(`Executed action for departure ${selectedDeparture.departure_id}: ${getRecommendedAction(selectedDeparture)}`)}
                className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 rounded-lg text-xs flex items-center justify-center space-x-1.5 transition-colors cursor-pointer"
              >
                <span>Execute Commercial Directive</span>
                <ChevronRight className="w-4 h-4"/>
              </button>
            </div>
          )}
        </div>

        {/* 3. Core Departure Commercial Control Center Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-bold text-white">Departure Commercial Triage (Control Center)</h2>
              <p className="text-xs text-slate-400">Departures ranked by commercial priority and proximity to departure date</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center space-x-2 bg-slate-950 border border-slate-800 px-2.5 py-1 rounded-lg text-xs">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                <select 
                  value={selectedRoute} 
                  onChange={(e) => setSelectedRoute(e.target.value)}
                  className="bg-transparent text-slate-200 focus:outline-none cursor-pointer"
                >
                  <option value="ALL">All Routes</option>
                  <option value="ZRH-BCN">Zurich → Barcelona</option>
                  <option value="BCN-ZRH">Barcelona → Zurich</option>
                  <option value="ZRH-AMS">Zurich → Amsterdam</option>
                  <option value="AMS-ZRH">Amsterdam → Zurich</option>
                </select>
              </div>

              <div className="flex items-center space-x-2 bg-slate-950 border border-slate-800 px-2.5 py-1 rounded-lg text-xs">
                <select 
                  value={selectedStatus} 
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="bg-transparent text-slate-200 focus:outline-none cursor-pointer"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="CRITICAL_RISK">Critical Risk</option>
                  <option value="NEEDS_ATTENTION">Needs Attention</option>
                  <option value="BREAK_EVEN_REACHED">Break-Even Reached</option>
                  <option value="HIGH_DEMAND">High Demand</option>
                </select>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/80 uppercase text-[10px] tracking-wider text-slate-400 font-mono border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Route & ID</th>
                  <th className="py-3 px-3">Days Out</th>
                  <th className="py-3 px-3">Seats / Cap</th>
                  <th className="py-3 px-3">Load Factor</th>
                  <th className="py-3 px-3">Gap to BE</th>
                  <th className="py-3 px-3">Avg Fare</th>
                  <th className="py-3 px-3">Pace Status</th>
                  <th className="py-3 px-3">Commercial Urgency</th>
                  <th className="py-3 px-4">Action Directive</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredDepartures.map((dep) => {
                  const isSelected = selectedDeparture?.departure_id === dep.departure_id;

                  return (
                    <tr 
                      key={dep.departure_id} 
                      onClick={() => setSelectedDeparture(dep)}
                      className={`hover:bg-slate-800/40 transition-colors cursor-pointer ${isSelected ? 'bg-indigo-950/30 border-l-2 border-indigo-500' : ''}`}
                    >
                      <td className="py-3 px-4 font-medium text-white">
                        <div className="font-semibold">{dep.route_name}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{dep.departure_id}</div>
                      </td>

                      <td className="py-3 px-3 font-mono font-medium">
                        <span className={`px-2 py-0.5 rounded text-[11px] ${dep.days_to_departure <= 3 ? 'bg-rose-950 text-rose-300 border border-rose-800' : 'text-slate-300'}`}>
                          {dep.days_to_departure}d
                        </span>
                      </td>

                      <td className="py-3 px-3 font-mono font-semibold text-slate-200">
                        {dep.seats_sold} <span className="text-slate-500 font-normal">/ {dep.total_capacity}</span>
                      </td>

                      <td className="py-3 px-3">
                        <div className="w-24">
                          <div className="flex justify-between text-[10px] font-mono mb-1">
                            <span>{dep.load_factor_pct}%</span>
                            <span className="text-slate-500">15 BE</span>
                          </div>
                          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${
                                dep.load_factor_pct >= 100 ? 'bg-purple-500' : 
                                dep.load_factor_pct >= 71 ? 'bg-emerald-500' : 
                                dep.load_factor_pct >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                              }`} 
                              style={{ width: `${Math.min(100, dep.load_factor_pct)}%` }} 
                            />
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-3 font-mono font-bold">
                        {dep.gap_to_break_even >= 0 ? (
                          <span className="text-emerald-400">+{dep.gap_to_break_even}</span>
                        ) : (
                          <span className="text-rose-400">{dep.gap_to_break_even}</span>
                        )}
                      </td>

                      <td className="py-3 px-3 font-mono text-slate-200">
                        €{dep.avg_ticket_price_eur}
                      </td>

                      <td className="py-3 px-3 font-mono text-slate-300">
                        <span className={dep.pace_status === 'AHEAD' ? 'text-emerald-400 font-bold' : (dep.pace_status === 'BEHIND' ? 'text-rose-400 font-bold' : 'text-slate-400')}>
                          {dep.pace_status}
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        {renderStatusBadge(dep.commercial_status)}
                      </td>

                      <td className="py-3 px-4 max-w-xs truncate text-[11px] text-slate-300" title={getRecommendedAction(dep)}>
                        {getRecommendedAction(dep)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* 4. AI Commercial Morning Brief Modal */}
      {showAiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white">
                  <Sparkles className="w-4 h-4 text-amber-200" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Automated Daily Commercial Briefing</h3>
                  <p className="text-[11px] text-slate-400">Synthesized from Supabase snapshot metrics at 04:00 CET</p>
                </div>
              </div>
              <button 
                onClick={() => setShowAiModal(false)}
                className="text-slate-400 hover:text-white text-sm font-mono p-1 rounded hover:bg-slate-800 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs text-slate-300 leading-relaxed">
              {isAiGenerating ? (
                <div className="py-12 flex flex-col items-center justify-center space-y-3">
                  <RefreshCw className="w-6 h-6 text-indigo-400 animate-spin" />
                  <p className="text-slate-400 font-mono text-xs">Synthesizing network revenue metrics with Gemini API...</p>
                </div>
              ) : (
                <>
                  <div className="p-3 bg-emerald-950/30 border border-emerald-800/50 rounded-xl text-emerald-200">
                    <strong className="block font-semibold mb-0.5">Route Health Summary:</strong>
                    <strong>Barcelona services continue to outperform network targets.</strong> Zurich → Barcelona departures are averaging 19.0 seats sold (90.5% load factor), generating an average yield of €195 per cabin. In contrast, Zurich → Amsterdam is underperforming at 8.0 seats average (Critical Risk).
                  </div>

                  <div>
                    <h4 className="text-white font-bold mb-2 uppercase tracking-wider font-mono text-[11px]">Break-Even Shortfall Alerts</h4>
                    <ul className="space-y-1.5 list-disc list-inside text-slate-300">
                      <li><strong>Zurich → Amsterdam (DEP-ZRHAMS-1023, D-3):</strong> Critical shortfall. Currently at 8 seats, requiring <strong>7 additional seats</strong> to hit the 15-seat break-even mark. High risk of cash negative departure without immediate promotional push.</li>
                      <li><strong>Zurich → Barcelona (DEP-ZRHBCN-1024, D-4):</strong> Break-even achieved (+4 seats above BE). High demand pace. 2 seats remaining before full sell-out.</li>
                    </ul>
                  </div>

                  <div className="border-t border-slate-800 pt-4">
                    <h4 className="text-white font-bold mb-2 uppercase tracking-wider font-mono text-[11px]">Priority Actions Today</h4>
                    <div className="space-y-2">
                      <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-start space-x-2">
                        <span className="w-5 h-5 rounded bg-rose-500/20 text-rose-400 flex items-center justify-center font-bold text-[10px] mt-0.5">1</span>
                        <div>
                          <strong className="text-white">Zurich → Amsterdam 23 Oct:</strong> Trigger emergency flash email blast to past business travelers offering €129 promo fare to capture 5-7 seats.
                        </div>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-start space-x-2">
                        <span className="w-5 h-5 rounded bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-[10px] mt-0.5">2</span>
                        <div>
                          <strong className="text-white">Zurich → Barcelona 24 Oct:</strong> Remove all promo codes immediately. Increase standard fare to €215 to harvest maximum yield on last 2 cabins.
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">Automated dispatch configured for Slack channel #commercial-lead</span>
              <button 
                onClick={() => {
                  alert("Simulated: Daily Briefing forwarded to Slack channel #commercial-lead!");
                  setShowAiModal(false);
                }}
                className="inline-flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Dispatch to Slack</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}