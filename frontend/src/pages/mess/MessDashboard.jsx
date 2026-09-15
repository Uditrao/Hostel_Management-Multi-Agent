/**
 * MessDashboard.jsx
 * =================
 * Mess Operations Mission Control Dashboard (Phase 7C).
 * Integrates live metrics across NOURISH agent: meal entry counts,
 * active inventory alerts, current service window, and quick actions.
 */
import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  Utensils,
  Package,
  AlertTriangle,
  Terminal,
  BookOpen,
  ArrowRight,
  RefreshCw,
  Sparkles,
  CheckCircle2
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { nourishApi } from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'

export default function MessDashboard() {
  const { user } = useAuth()
  const name = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Mess Staff'

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [statusInfo, setStatusInfo] = useState(null)
  const [entriesData, setEntriesData] = useState({
    total_allowed: 0,
    total_unrecognised: 0,
    by_meal: {
      breakfast: { count: 0, unrecognised: 0 },
      lunch:     { count: 0, unrecognised: 0 },
      dinner:    { count: 0, unrecognised: 0 },
    },
  })
  const [inventoryStats, setInventoryStats] = useState({
    totalItems: 0,
    lowStockCount: 0,
    items: [],
  })
  const [activeAlerts, setActiveAlerts] = useState([])
  const [recentLogs, setRecentLogs] = useState([])

  // Load all dashboard data in parallel
  const loadDashboardData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true)
    else setRefreshing(true)

    try {
      const [stRes, entRes, invRes, altRes, logRes] = await Promise.all([
        nourishApi.getStatus().catch(() => ({ data: null })),
        nourishApi.getEntries().catch(() => ({ data: null })),
        nourishApi.getInventory().catch(() => ({ data: null })),
        nourishApi.getAlerts().catch(() => ({ data: null })),
        nourishApi.getCommandLogs(5).catch(() => ({ data: null })),
      ])

      if (stRes.data?.status === 'online') {
        setStatusInfo(stRes.data)
      }

      if (entRes.data?.success) {
        setEntriesData({
          total_allowed: entRes.data.total_allowed || 0,
          total_unrecognised: entRes.data.total_unrecognised || 0,
          by_meal: entRes.data.by_meal || {
            breakfast: { count: 0, unrecognised: 0 },
            lunch:     { count: 0, unrecognised: 0 },
            dinner:    { count: 0, unrecognised: 0 },
          },
        })
      }

      if (invRes.data?.success) {
        const items = invRes.data.inventory || []
        const low = items.filter(
          (i) => Number(i.quantity) <= Number(i.min_threshold || 10)
        )
        setInventoryStats({
          totalItems: items.length,
          lowStockCount: low.length,
          items,
        })
      }

      if (altRes.data?.success) {
        setActiveAlerts(altRes.data.alerts || [])
      }

      if (logRes.data?.success) {
        setRecentLogs(logRes.data.logs || [])
      }
    } catch (err) {
      console.error('Error loading mess dashboard data:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadDashboardData()
  }, [loadDashboardData])

  // Resolve an alert directly from dashboard
  const handleResolveAlert = async (alertId) => {
    try {
      await nourishApi.resolveAlert(alertId)
      setActiveAlerts((prev) => prev.filter((a) => a.id !== alertId))
    } catch (err) {
      console.error('Error resolving alert:', err)
    }
  }

  // Active meal calculations
  const activeMeal = statusInfo?.current_meal
  const mealWindows = statusInfo?.meal_windows || {}
  const currentWindow = activeMeal ? mealWindows[activeMeal] : null

  if (loading) {
    return <LoadingSpinner message="Loading mess operations dashboard..." />
  }

  return (
    <div className="animate-fade-in space-y-8 pb-12">
      {/* Hero Header */}
      <div className="card relative overflow-hidden p-6 sm:p-8 border border-amber-500/20 bg-gradient-to-r from-slate-900/95 via-slate-900/80 to-slate-950">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-xs font-semibold uppercase tracking-widest text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full">
                NOURISH Operations
              </span>
              <span className="badge badge-emerald text-[11px]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Kiosk Gating Armed
              </span>
              <span className="badge badge-amber text-[11px]">
                <Sparkles className="w-3 h-3" />
                Gemini & Groq Enabled
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-slate-100 tracking-tight">
              Good day, {name} 🍽️
            </h1>
            <p className="text-sm text-slate-400 max-w-xl mt-1">
              Autonomous mess management — monitoring meal turnouts, ingredient depletion, and conversational stock updates.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start md:self-auto">
            <button
              onClick={() => loadDashboardData(true)}
              disabled={refreshing}
              className="btn-secondary text-xs px-3.5 py-2 flex items-center gap-2"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Syncing…' : 'Refresh'}
            </button>

            <Link
              to="/mess/command"
              className="btn-primary text-xs px-4 py-2 flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-glow-amber"
            >
              <Terminal className="w-4 h-4" />
              NLP Command Bar
            </Link>
          </div>
        </div>
      </div>

      {/* Active Service Status Banner */}
      <div
        className={`card p-5 border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
          activeMeal
            ? 'border-emerald-500/30 bg-emerald-500/5'
            : 'border-amber-500/20 bg-amber-500/5'
        }`}
      >
        <div className="flex items-center gap-3.5">
          <div
            className={`w-12 h-12 rounded-2xl border flex items-center justify-center ${
              activeMeal
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                : 'bg-amber-500/15 border-amber-500/30 text-amber-400'
            }`}
          >
            <Utensils className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-100 capitalize">
                {activeMeal ? `${activeMeal} Service Active` : 'Between Meal Services'}
              </h3>
              <span
                className={`badge text-[10px] ${
                  activeMeal ? 'badge-emerald' : 'badge-slate'
                }`}
              >
                {activeMeal ? 'Gate Scanner Open' : 'Gate Scanner Closed'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {currentWindow
                ? `Active operating window: ${currentWindow.start} – ${currentWindow.end} IST.`
                : 'Next service will open automatically based on configured schedule.'}
            </p>
          </div>
        </div>

        {/* Timings breakdown pills */}
        <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
          <span className="px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/[0.06]">
            B: {mealWindows.breakfast?.start || '07:00'}-{mealWindows.breakfast?.end || '09:30'}
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/[0.06]">
            L: {mealWindows.lunch?.start || '12:00'}-{mealWindows.lunch?.end || '14:30'}
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/[0.06]">
            D: {mealWindows.dinner?.start || '19:00'}-{mealWindows.dinner?.end || '21:30'}
          </span>
        </div>
      </div>

      {/* 4 Live KPI Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Today's Meals */}
        <Link
          to="/mess/dashboard"
          className="stat-card border border-emerald-500/20 hover:border-emerald-500/40 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Today's Meals Served</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
              <Utensils className="w-4 h-4" />
            </div>
          </div>
          <p className="text-3xl font-bold text-slate-100">{entriesData.total_allowed}</p>
          <p className="text-xs text-slate-500">Verified biometric entries</p>
        </Link>

        {/* Inventory Stock Health */}
        <Link
          to="/mess/inventory"
          className="stat-card border border-amber-500/20 hover:border-amber-500/40 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Tracked Stock Items</span>
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <p className="text-3xl font-bold text-slate-100">{inventoryStats.totalItems}</p>
          <p className="text-xs text-slate-500">Active ingredients in database</p>
        </Link>

        {/* Low-Stock Alerts */}
        <Link
          to="/mess/inventory"
          className={`stat-card border transition-all cursor-pointer group ${
            activeAlerts.length > 0
              ? 'border-rose-500/30 bg-rose-500/5 hover:border-rose-500/50'
              : 'border-white/10 hover:border-white/20'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Stock Alerts</span>
            <div
              className={`w-7 h-7 rounded-lg border flex items-center justify-center group-hover:scale-110 transition-transform ${
                activeAlerts.length > 0
                  ? 'bg-rose-500/20 border-rose-500/30 text-rose-400 animate-pulse'
                  : 'bg-white/5 border-white/10 text-slate-400'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <p
            className={`text-3xl font-bold ${
              activeAlerts.length > 0 ? 'text-rose-300' : 'text-slate-200'
            }`}
          >
            {activeAlerts.length}
          </p>
          <p className="text-xs text-slate-500">
            {activeAlerts.length > 0 ? 'Ingredients below threshold' : 'All stocks optimal'}
          </p>
        </Link>

        {/* NLP Commands Processed */}
        <Link
          to="/mess/command"
          className="stat-card border border-cyan-500/20 hover:border-cyan-500/40 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">NLP Commands</span>
            <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 group-hover:scale-110 transition-transform">
              <Terminal className="w-4 h-4" />
            </div>
          </div>
          <p className="text-3xl font-bold text-slate-100">{recentLogs.length}</p>
          <p className="text-xs text-slate-500">Recent natural language actions</p>
        </Link>
      </div>

      {/* Quick Action Navigation Grid */}
      <div>
        <p className="section-label">Operations Shortcuts</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link
            to="/mess/inventory"
            className="card p-5 border border-amber-500/20 hover:border-amber-500/40 hover:bg-slate-800/50 transition-all flex items-center justify-between group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Package className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-200">Manage Inventory</h3>
                <p className="text-xs text-slate-500">Live stock levels & threshold alerts</p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-amber-400 transition-colors" />
          </Link>

          <Link
            to="/mess/command"
            className="card p-5 border border-cyan-500/20 hover:border-cyan-500/40 hover:bg-slate-800/50 transition-all flex items-center justify-between group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Terminal className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-200">NLP Command Console</h3>
                <p className="text-xs text-slate-500">Type or speak updates in Hindi/Eng</p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 transition-colors" />
          </Link>

          <Link
            to="/mess/menu"
            className="card p-5 border border-emerald-500/20 hover:border-emerald-500/40 hover:bg-slate-800/50 transition-all flex items-center justify-between group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-200">Upload Menu PDF</h3>
                <p className="text-xs text-slate-500">Gemini multimodal meal parser</p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition-colors" />
          </Link>
        </div>
      </div>

      {/* Split Feeds Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Today's Meal Turnout Breakdown */}
        <div className="card p-6 border border-white/[0.08] space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Utensils className="w-4 h-4 text-amber-400" />
              Today's Meal Headcount Breakdown
            </h3>
            <span className="text-xs text-slate-500 font-mono">
              Unrecognised: {entriesData.total_unrecognised}
            </span>
          </div>

          <div className="space-y-3">
            {[
              { id: 'breakfast', label: 'Breakfast', time: '07:00 – 09:30', color: 'from-amber-500 to-amber-600', textColor: 'text-amber-400' },
              { id: 'lunch',     label: 'Lunch',     time: '12:00 – 14:30', color: 'from-emerald-500 to-emerald-600', textColor: 'text-emerald-400' },
              { id: 'dinner',    label: 'Dinner',    time: '19:00 – 21:30', color: 'from-cyan-500 to-cyan-600', textColor: 'text-cyan-400' },
            ].map((meal) => {
              const data = entriesData.by_meal[meal.id] || { count: 0, unrecognised: 0 }
              const count = data.count || 0
              return (
                <div
                  key={meal.id}
                  className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.04] space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-slate-200">{meal.label}</span>
                      <span className="text-[11px] text-slate-500 ml-2 font-mono">{meal.time}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${meal.textColor}`}>
                        {count} served
                      </span>
                      {data.unrecognised > 0 && (
                        <span className="badge badge-rose text-[10px]">
                          {data.unrecognised} unknown
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Visual bar */}
                  <div className="w-full h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${meal.color}`}
                      style={{ width: `${Math.min(100, Math.max(5, count * 2))}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Active Low-Stock Alerts */}
        <div className="card p-6 border border-white/[0.08] space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              Active Ingredient Alerts
            </h3>
            <Link
              to="/mess/inventory"
              className="text-xs text-amber-400 hover:underline flex items-center gap-1"
            >
              View inventory
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {activeAlerts.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500">
              <CheckCircle2 className="w-8 h-8 text-emerald-400/60 mx-auto mb-2" />
              All inventory levels are above safety thresholds.
            </div>
          ) : (
            <div className="space-y-2.5">
              {activeAlerts.slice(0, 4).map((alert) => (
                <div
                  key={alert.id}
                  className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
                    <div>
                      <p className="text-xs font-semibold text-slate-200 capitalize">
                        {alert.item_name || 'Ingredient'}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Current: <span className="text-rose-400 font-mono">{alert.current_stock ?? '—'}</span> (Min: {alert.threshold ?? '—'})
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`badge text-[10px] ${
                        alert.urgency === 'critical'
                          ? 'badge-rose'
                          : alert.urgency === 'high'
                          ? 'badge-amber'
                          : 'badge-slate'
                      }`}
                    >
                      {alert.urgency || 'alert'}
                    </span>
                    <button
                      onClick={() => handleResolveAlert(alert.id)}
                      className="btn-secondary text-[10px] py-1 px-2.5 rounded-lg hover:bg-emerald-500/20 hover:text-emerald-300"
                    >
                      Resolve
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
