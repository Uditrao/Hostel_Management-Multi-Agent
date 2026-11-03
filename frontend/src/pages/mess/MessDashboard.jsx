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
  CheckCircle2,
  Camera,
  ShoppingCart,
  Calendar,
  TrendingDown,
  X,
  AlertCircle,
  Trash2,
  Scale
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
  const [forecastData, setForecastData] = useState(null)
  const [forecastTab, setForecastTab] = useState('tomorrow')

  // Wastage dashboard stats
  const [wastageStats, setWastageStats] = useState({
    today_total_kg: 0,
    records: [],
  })

  // Hybrid Stock Issue & Wastage Modal states
  const [depletionModalOpen, setDepletionModalOpen] = useState(false)
  const [activeModalTab, setActiveModalTab] = useState('issue') // 'issue' | 'wastage'
  const [depletionMeal, setDepletionMeal] = useState('lunch')
  const [depletionHeadCount, setDepletionHeadCount] = useState('')
  const [depletionItems, setDepletionItems] = useState([])
  const [loadingEstimate, setLoadingEstimate] = useState(false)
  const [depletionNotes, setDepletionNotes] = useState('')
  const [depleting, setDepleting] = useState(false)
  const [depletionResult, setDepletionResult] = useState(null)
  const [depletionError, setDepletionError] = useState('')

  // Post-meal wastage input states
  const [wasteKg, setWasteKg] = useState('')
  const [wasteDishes, setWasteDishes] = useState('')
  const [wasteReason, setWasteReason] = useState('Normal variance')
  const [wasteNotes, setWasteNotes] = useState('')
  const [loggingWaste, setLoggingWaste] = useState(false)
  const [wasteSuccess, setWasteSuccess] = useState(null)
  const [wasteError, setWasteError] = useState('')

  // Fetch recipe estimate for hybrid pre-filled stock issue
  const fetchEstimate = async (meal, count) => {
    setLoadingEstimate(true)
    setDepletionError('')
    try {
      const res = await nourishApi.getDepletionEstimate(meal, count || null)
      if (res.data?.success && res.data?.items) {
        // Pre-fill editable quantity with suggested_qty
        const prefilled = res.data.items.map((item) => ({
          ...item,
          quantity: item.suggested_qty,
        }))
        setDepletionItems(prefilled)
      } else {
        setDepletionItems([])
        if (res.data?.message) {
          setDepletionError(res.data.message)
        }
      }
    } catch (err) {
      console.error('Estimate error:', err)
      setDepletionItems([])
    } finally {
      setLoadingEstimate(false)
    }
  }

  const handleOpenDepletionModal = (presetMeal = null, defaultTab = 'issue') => {
    const meal = presetMeal || statusInfo?.current_meal || 'lunch'
    setDepletionMeal(meal)
    setActiveModalTab(defaultTab)
    const count = entriesData?.by_meal?.[meal]?.count || forecastData?.head_count || 150
    setDepletionHeadCount(count)
    setDepletionResult(null)
    setDepletionError('')
    setWasteSuccess(null)
    setWasteError('')
    setWasteKg('')
    setWasteDishes('')
    setWasteNotes('')
    setDepletionModalOpen(true)
    fetchEstimate(meal, count)
  }

  const handleItemQtyChange = (index, val) => {
    setDepletionItems((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], quantity: val }
      return updated
    })
  }

  // Submit custom hybrid depletion
  const handleConfirmDepletion = async () => {
    setDepleting(true)
    setDepletionError('')
    setDepletionResult(null)
    try {
      const payload = {
        meal_type: depletionMeal,
        head_count: Number(depletionHeadCount) || null,
        items: depletionItems.map((i) => ({
          item_name: i.item_name,
          quantity: Number(i.quantity) || 0,
          unit: i.unit || 'kg',
        })),
        notes: depletionNotes || undefined,
      }
      const res = await nourishApi.runCustomDepletion(payload)
      if (res.data?.success) {
        setDepletionResult(res.data)
        loadDashboardData(true)
      } else {
        setDepletionError(res.data?.message || res.data?.error || 'Depletion failed')
      }
    } catch (err) {
      setDepletionError(err.response?.data?.detail || err.message || 'Failed to issue stock')
    } finally {
      setDepleting(false)
    }
  }

  // Submit post-meal food wastage
  const handleLogWastage = async (e) => {
    e?.preventDefault()
    if (!wasteKg || Number(wasteKg) < 0) {
      setWasteError('Please enter a valid leftover food weight in kg.')
      return
    }
    setLoggingWaste(true)
    setWasteError('')
    setWasteSuccess(null)
    try {
      const res = await nourishApi.logWastage({
        meal_type: depletionMeal,
        head_count_served: Number(depletionHeadCount) || entriesData?.by_meal?.[depletionMeal]?.count || 0,
        waste_kg: Number(wasteKg),
        leftover_dishes: wasteDishes || undefined,
        reason: wasteReason || undefined,
        notes: wasteNotes || undefined,
      })
      if (res.data?.success) {
        setWasteSuccess(res.data.record)
        setWasteKg('')
        setWasteDishes('')
        setWasteNotes('')
        loadDashboardData(true)
      } else {
        setWasteError(res.data?.error || 'Failed to log wastage')
      }
    } catch (err) {
      setWasteError(err.response?.data?.detail || err.message || 'Failed to log wastage')
    } finally {
      setLoggingWaste(false)
    }
  }

  // Load all dashboard data in parallel
  const loadDashboardData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true)
    else setRefreshing(true)

    try {
      const [stRes, entRes, invRes, altRes, logRes, fcastRes, wasteRes] = await Promise.all([
        nourishApi.getStatus().catch(() => ({ data: null })),
        nourishApi.getEntries().catch(() => ({ data: null })),
        nourishApi.getInventory().catch(() => ({ data: null })),
        nourishApi.getAlerts().catch(() => ({ data: null })),
        nourishApi.getCommandLogs(5).catch(() => ({ data: null })),
        nourishApi.getInventoryForecast().catch(() => ({ data: null })),
        nourishApi.getRecentWastage(5).catch(() => ({ data: null })),
      ])

      if (wasteRes.data?.success) {
        setWastageStats({
          today_total_kg: wasteRes.data.today_total_waste_kg || 0,
          records: wasteRes.data.records || [],
        })
      }

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
          (i) => Number(i.quantity_available ?? i.quantity ?? 0) <= Number(i.min_threshold || 10)
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

      if (fcastRes?.data?.success) {
        setForecastData(fcastRes.data)
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
              to="/mess/kiosk"
              className="btn-primary text-xs px-4 py-2 flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold shadow-glow-emerald"
            >
              <Camera className="w-4 h-4" />
              Mess Kiosk
            </Link>

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

        {/* Timings breakdown pills & Depletion trigger */}
        <div className="flex flex-wrap items-center gap-3">
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

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleOpenDepletionModal(null, 'issue')}
              className="btn-primary text-xs px-3.5 py-1.5 flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold shadow-md hover:shadow-glow-amber transition-all"
            >
              <Utensils className="w-3.5 h-3.5" />
              Issue Meal Stock
            </button>

            <button
              onClick={() => handleOpenDepletionModal(null, 'wastage')}
              className="btn-secondary text-xs px-3 py-1.5 flex items-center justify-center gap-1.5 text-slate-300 hover:text-slate-100 hover:bg-white/[0.08]"
              title="Log post-meal leftover food"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              Wastage
            </button>
          </div>
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
            {(forecastData?.summary?.total_alerts ?? activeAlerts.length)}
          </p>
          <p className="text-xs text-slate-500">
            {(forecastData?.summary?.advance_procurement_tomorrow_count || 0) > 0
              ? `${forecastData.summary.advance_procurement_tomorrow_count} advance item(s) for tomorrow`
              : activeAlerts.length > 0
              ? 'Ingredients below threshold'
              : 'All stocks optimal'}
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

        {/* Proactive Kitchen Procurement & Stock Radar */}
        <div className="card p-6 border border-white/[0.08] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.06]">
            <div>
              <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                Kitchen Procurement & Stock Radar
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Calculated for <span className="text-amber-400 font-bold">{forecastData?.head_count || 150}</span> planned diners
              </p>
            </div>

            {/* Tabs: Tomorrow's Advance Market List vs Today's Deficits */}
            <div className="flex rounded-lg bg-slate-950 p-1 border border-white/[0.06] text-xs">
              <button
                onClick={() => setForecastTab('tomorrow')}
                className={`px-3 py-1 rounded-md font-medium flex items-center gap-1.5 transition-all ${
                  forecastTab === 'tomorrow'
                    ? 'bg-amber-500 text-slate-950 shadow-sm font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                Tomorrow's Market List
                {(forecastData?.tomorrow_shortages?.length || 0) > 0 && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${forecastTab === 'tomorrow' ? 'bg-slate-950 text-amber-400' : 'bg-amber-500/20 text-amber-300'}`}>
                    {forecastData.tomorrow_shortages.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setForecastTab('today')}
                className={`px-3 py-1 rounded-md font-medium flex items-center gap-1.5 transition-all ${
                  forecastTab === 'today'
                    ? 'bg-rose-500 text-white shadow-sm font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                Today's Deficits
                {(forecastData?.today_shortages?.length || 0) > 0 && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${forecastTab === 'today' ? 'bg-slate-950 text-rose-300' : 'bg-rose-500/20 text-rose-300'}`}>
                    {forecastData.today_shortages.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Tab Content */}
          {forecastTab === 'tomorrow' ? (
            /* Tomorrow's Advance Market Procurement List */
            (forecastData?.tomorrow_shortages?.length || 0) === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 space-y-1">
                <CheckCircle2 className="w-7 h-7 text-emerald-400/60 mx-auto" />
                <p className="font-semibold text-slate-300">All Stocks Sufficient for Tomorrow</p>
                <p className="text-[11px] text-slate-500">Breakfast, Lunch, and Dinner menus have enough supplies in inventory.</p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1 scrollbar-thin">
                <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] flex items-center gap-2">
                  <Calendar className="w-4 h-4 shrink-0 text-amber-400" />
                  <span>
                    <strong>Advance Procurement Advice:</strong> Procure these ingredients today from the market before tomorrow's cooking!
                  </span>
                </div>
                {forecastData.tomorrow_shortages.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-slate-900/60 border border-amber-500/20 flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-100 capitalize text-sm">
                          {item.item_name}
                        </span>
                        <span className="badge badge-amber text-[10px]">
                          BUY +{item.deficit} {item.unit}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Needed Tomorrow: <span className="text-slate-200 font-mono">{item.needed} {item.unit}</span> • Available: <span className="text-slate-400 font-mono">{item.available} {item.unit}</span>
                      </p>
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5 truncate max-w-md">
                        Affected: {item.meals?.join(', ')} ({item.dishes?.join(', ')})
                      </p>
                    </div>

                    <Link
                      to="/mess/command"
                      className="btn-secondary py-1 px-2.5 text-[10px] shrink-0 hover:bg-amber-500/20 hover:text-amber-300 font-medium"
                    >
                      Quick Stock Add
                    </Link>
                  </div>
                ))}
              </div>
            )
          ) : (
            /* Today's Immediate Deficits */
            (forecastData?.today_shortages?.length || 0) === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 space-y-1">
                <CheckCircle2 className="w-7 h-7 text-emerald-400/60 mx-auto" />
                <p className="font-semibold text-slate-300">No Immediate Shortages Today</p>
                <p className="text-[11px] text-slate-500">Current available stock covers today's remaining meal services.</p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1 scrollbar-thin">
                <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-[11px] flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>
                    <strong>Urgent Kitchen Deficit:</strong> Immediate shortage for today's upcoming meal services!
                  </span>
                </div>
                {forecastData.today_shortages.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-slate-900/60 border border-rose-500/30 flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-100 capitalize text-sm">
                          {item.item_name}
                        </span>
                        <span className="badge badge-rose text-[10px]">
                          DEFICIT: {item.deficit} {item.unit}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Required Today: <span className="text-slate-200 font-mono">{item.needed} {item.unit}</span> • In Stock: <span className="text-rose-400 font-mono">{item.available} {item.unit}</span>
                      </p>
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5 truncate max-w-md">
                        Affected: {item.meals?.join(', ')} ({item.dishes?.join(', ')})
                      </p>
                    </div>

                    <Link
                      to="/mess/command"
                      className="btn-secondary py-1 px-2.5 text-[10px] shrink-0 hover:bg-rose-500/20 hover:text-rose-300 font-medium"
                    >
                      Stock In
                    </Link>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>

      {/* Hybrid Kitchen Stock Issue & Wastage Command Modal */}
      {depletionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
          <div className="card w-full max-w-2xl border border-amber-500/30 bg-slate-900/95 shadow-2xl p-6 relative overflow-hidden max-h-[90vh] flex flex-col">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500" />

            {/* Modal Header & Navigation Tabs */}
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08] shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center">
                  {activeModalTab === 'issue' ? <Utensils className="w-4 h-4" /> : <Trash2 className="w-4 h-4 text-rose-400" />}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">
                    {activeModalTab === 'issue' ? 'Kitchen Stock Issue (Pre-filled Depletion)' : 'Post-Meal Food Wastage Counter'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {activeModalTab === 'issue'
                      ? 'Recipe-based pre-fill with custom manager adjustments'
                      : 'Track leftover food to feed turnout predictions & prevent food loss'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Tab Switcher Pills */}
                <div className="flex items-center bg-slate-950/60 p-1 rounded-xl border border-white/[0.06] text-xs">
                  <button
                    type="button"
                    onClick={() => setActiveModalTab('issue')}
                    className={`px-3 py-1 rounded-lg font-medium transition-all ${
                      activeModalTab === 'issue'
                        ? 'bg-amber-500 text-slate-950 font-bold shadow'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Stock Issue
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveModalTab('wastage')}
                    className={`px-3 py-1 rounded-lg font-medium transition-all ${
                      activeModalTab === 'wastage'
                        ? 'bg-rose-500 text-white font-bold shadow'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Wastage
                  </button>
                </div>

                <button
                  onClick={() => setDepletionModalOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/[0.05] transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Meal Service Selector */}
            <div className="pt-3 pb-2 flex flex-wrap items-center justify-between gap-2 shrink-0 border-b border-white/[0.05]">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-400 font-semibold mr-1">Meal:</span>
                {['breakfast', 'lunch', 'dinner'].map((m) => {
                  const isSelected = depletionMeal === m
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setDepletionMeal(m)
                        const count = entriesData?.by_meal?.[m]?.count || forecastData?.head_count || 150
                        setDepletionHeadCount(count)
                        fetchEstimate(m, count)
                      }}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize border transition-all ${
                        isSelected
                          ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-glow-amber'
                          : 'bg-white/[0.02] border-white/[0.08] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {m}
                    </button>
                  )
                })}
              </div>

              {/* Headcount pill & recalculate */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Diners:</span>
                <input
                  type="number"
                  min="1"
                  value={depletionHeadCount}
                  onChange={(e) => {
                    setDepletionHeadCount(e.target.value)
                  }}
                  onBlur={() => fetchEstimate(depletionMeal, Number(depletionHeadCount))}
                  className="input-field w-20 py-0.5 px-2 text-xs font-mono text-center"
                />
                <button
                  type="button"
                  onClick={() => fetchEstimate(depletionMeal, Number(depletionHeadCount))}
                  className="p-1 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-white/[0.05]"
                  title="Recalculate recipe estimate"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingEstimate ? 'animate-spin text-amber-400' : ''}`} />
                </button>
                <span className="text-[10px] text-slate-500 font-mono">
                  (Kiosk: {entriesData?.by_meal?.[depletionMeal]?.count || 0})
                </span>
              </div>
            </div>

            {/* TAB 1: HYBRID KITCHEN STOCK ISSUE */}
            {activeModalTab === 'issue' && (
              <div className="overflow-y-auto flex-1 py-3 space-y-4 pr-1 scrollbar-thin">
                {/* Error Banner */}
                {depletionError && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>{depletionError}</span>
                  </div>
                )}

                {/* Success Screen */}
                {depletionResult ? (
                  <div className="space-y-4 animate-fade-in">
                    <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2.5">
                      <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
                      <div>
                        <p className="font-bold text-slate-100">{depletionResult.message || 'Stock Issued Successfully!'}</p>
                        <p className="text-[11px] text-emerald-400/90 mt-0.5">
                          {depletionResult.depletions?.length || 0} ingredient(s) deducted from inventory.
                        </p>
                      </div>
                    </div>

                    {/* Breakdown list */}
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-slate-300">Deduction Summary:</p>
                      <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
                        {depletionResult.depletions?.map((d, idx) => (
                          <div
                            key={idx}
                            className="px-3 py-2 rounded-lg bg-slate-950/60 border border-white/[0.06] flex items-center justify-between text-xs"
                          >
                            <span className="font-semibold text-slate-200 capitalize">{d.ingredient}</span>
                            <span className="font-mono font-bold text-amber-400">
                              -{d.consumed} {d.unit}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {depletionResult.alerts_raised?.length > 0 && (
                      <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
                        <p className="font-semibold">⚠️ Safety Buffer Alert:</p>
                        <p className="text-[11px] mt-0.5 text-amber-200/80">
                          {depletionResult.alerts_raised.length} item(s) dropped below recommended safety margins.
                        </p>
                      </div>
                    )}

                    <div className="pt-2 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setActiveModalTab('wastage')}
                        className="btn-secondary text-xs px-3.5 py-1.5 text-rose-300 hover:bg-rose-500/10 flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Log Leftover Wastage for this meal 👉
                      </button>

                      <button
                        onClick={() => setDepletionModalOpen(false)}
                        className="btn-primary text-xs px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold"
                      >
                        Done
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Hybrid Table Form */
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <p className="flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                        <span>Pre-filled from menu recipes. <strong>Adjust actual quantities</strong> if needed:</span>
                      </p>
                      {loadingEstimate && (
                        <span className="text-[11px] text-amber-400 flex items-center gap-1">
                          <RefreshCw className="w-3 h-3 animate-spin" /> Calculating…
                        </span>
                      )}
                    </div>

                    {depletionItems.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-white/[0.08] rounded-xl">
                        No recipe ingredients found for {depletionMeal}. Upload a menu first or adjust headcount.
                      </div>
                    ) : (
                      <div className="border border-white/[0.08] rounded-xl overflow-hidden bg-slate-950/40">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-white/[0.04] text-slate-400 font-semibold border-b border-white/[0.06]">
                            <tr>
                              <th className="py-2.5 px-3">Ingredient</th>
                              <th className="py-2.5 px-2">In Stock</th>
                              <th className="py-2.5 px-2 text-slate-400">Recipe Suggestion</th>
                              <th className="py-2.5 px-3 text-right">Actual to Issue</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/[0.04]">
                            {depletionItems.map((item, idx) => (
                              <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                                <td className="py-2.5 px-3">
                                  <div className="font-semibold text-slate-200 capitalize">
                                    {item.display_name || item.item_name}
                                  </div>
                                  {item.dishes?.length > 0 && (
                                    <div className="text-[10px] text-slate-500 truncate max-w-[180px]">
                                      {item.dishes.join(', ')}
                                    </div>
                                  )}
                                </td>
                                <td className="py-2.5 px-2 font-mono">
                                  <span className={item.is_low_stock ? 'text-rose-400 font-bold' : 'text-slate-300'}>
                                    {item.available_stock} {item.unit}
                                  </span>
                                </td>
                                <td className="py-2.5 px-2 font-mono text-slate-400">
                                  {item.suggested_qty} {item.unit}
                                </td>
                                <td className="py-2.5 px-3 text-right">
                                  <div className="inline-flex items-center gap-1.5 justify-end">
                                    <input
                                      type="number"
                                      step="0.1"
                                      min="0"
                                      value={item.quantity}
                                      onChange={(e) => handleItemQtyChange(idx, e.target.value)}
                                      className="input-field w-20 py-1 px-2 text-xs font-mono text-right text-amber-300 font-bold"
                                    />
                                    <span className="text-[11px] text-slate-400 w-6 text-left">{item.unit}</span>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Optional Notes */}
                    <div>
                      <input
                        type="text"
                        value={depletionNotes}
                        onChange={(e) => setDepletionNotes(e.target.value)}
                        placeholder="Optional note: e.g. Extra 2kg rice opened for guests"
                        className="input-field w-full text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: POST-MEAL FOOD WASTAGE COUNTER */}
            {activeModalTab === 'wastage' && (
              <div className="overflow-y-auto flex-1 py-3 space-y-4 pr-1 scrollbar-thin">
                {wasteError && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>{wasteError}</span>
                  </div>
                )}

                {wasteSuccess && (
                  <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2.5">
                    <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
                    <div>
                      <p className="font-bold text-slate-100">Wastage Logged Successfully!</p>
                      <p className="text-[11px] text-emerald-400/90 mt-0.5">
                        Recorded {wasteSuccess.waste_kg} kg leftover for {wasteSuccess.meal_type} ({wasteSuccess.waste_per_student_grams}g per diner).
                      </p>
                    </div>
                  </div>
                )}

                <form onSubmit={handleLogWastage} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Waste weight in kg */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Leftover Food Weight (kg) *
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          required
                          value={wasteKg}
                          onChange={(e) => setWasteKg(e.target.value)}
                          placeholder="e.g. 4.5"
                          className="input-field w-full text-sm font-mono font-bold pr-10"
                        />
                        <span className="absolute right-3 top-2.5 text-xs text-slate-500 font-mono">kg</span>
                      </div>
                    </div>

                    {/* Diners served */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Diners Served (Headcount)
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={depletionHeadCount}
                        onChange={(e) => setDepletionHeadCount(e.target.value)}
                        className="input-field w-full text-sm font-mono"
                      />
                    </div>
                  </div>

                  {/* Real-time Severity Feedback */}
                  {wasteKg && Number(wasteKg) > 0 && (
                    <div
                      className={`p-2.5 rounded-xl border text-xs flex items-center justify-between ${
                        Number(wasteKg) <= 3.0
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                          : Number(wasteKg) <= 8.0
                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                          : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                      }`}
                    >
                      <span className="font-medium">
                        Rating:{' '}
                        <strong>
                          {Number(wasteKg) <= 3.0
                            ? 'Optimal Kitchen Efficiency (< 3kg)'
                            : Number(wasteKg) <= 8.0
                            ? 'Moderate Leftover (3–8kg)'
                            : 'High Food Loss Alert (> 8kg)'}
                        </strong>
                      </span>
                      {depletionHeadCount > 0 && (
                        <span className="font-mono text-[11px]">
                          ~{Math.round((Number(wasteKg) * 1000) / Number(depletionHeadCount))}g / student
                        </span>
                      )}
                    </div>
                  )}

                  {/* Dishes Wasted */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Leftover Dishes (Summary)
                    </label>
                    <input
                      type="text"
                      value={wasteDishes}
                      onChange={(e) => setWasteDishes(e.target.value)}
                      placeholder="e.g. Rice (approx 3kg), Dal (approx 1.5kg)"
                      className="input-field w-full text-xs"
                    />
                  </div>

                  {/* Primary Reason */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Primary Reason</label>
                    <select
                      value={wasteReason}
                      onChange={(e) => setWasteReason(e.target.value)}
                      className="input-field w-full text-xs bg-slate-900"
                    >
                      <option value="Normal variance">Normal dining variance</option>
                      <option value="Rain / Low Attendance">Rain / Low turnout</option>
                      <option value="Overcooked / Excess batch">Overcooked / Excess preparation</option>
                      <option value="Exam day dining drop">Exam day dining drop</option>
                      <option value="Taste / Texture feedback">Student feedback / taste variation</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  {/* Action */}
                  <div className="pt-2 flex justify-end">
                    <button
                      type="submit"
                      disabled={loggingWaste || !wasteKg}
                      className="btn-primary text-xs px-5 py-2 bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-400 hover:to-orange-400 text-white font-bold flex items-center gap-2 shadow-lg disabled:opacity-50"
                    >
                      {loggingWaste ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          Logging…
                        </>
                      ) : (
                        <>
                          <Trash2 className="w-3.5 h-3.5" />
                          Record Wastage Entry
                        </>
                      )}
                    </button>
                  </div>
                </form>

                {/* Recent Wastage History */}
                {wastageStats.records?.length > 0 && (
                  <div className="pt-2 border-t border-white/[0.06] space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span className="font-semibold text-slate-300">Recent Wastage Logs</span>
                      <span className="font-mono text-[11px] text-amber-400">
                        Today's Total: {wastageStats.today_total_kg} kg
                      </span>
                    </div>
                    <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
                      {wastageStats.records.map((r, idx) => (
                        <div
                          key={idx}
                          className="px-3 py-2 rounded-lg bg-slate-950/60 border border-white/[0.06] flex items-center justify-between text-xs"
                        >
                          <div>
                            <span className="font-semibold text-slate-200 capitalize">{r.meal_type}</span>
                            <span className="text-[10px] text-slate-500 ml-2 font-mono">({r.date})</span>
                            {r.reason && <p className="text-[10px] text-slate-400 truncate max-w-xs">{r.reason}</p>}
                          </div>
                          <div className="text-right">
                            <span className="font-mono font-bold text-rose-400">{r.waste_kg} kg</span>
                            {r.waste_per_student_grams > 0 && (
                              <p className="text-[10px] text-slate-500">{r.waste_per_student_grams}g/diner</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Modal Footer for Tab 1 */}
            {activeModalTab === 'issue' && !depletionResult && (
              <div className="pt-3 border-t border-white/[0.08] flex items-center justify-between shrink-0">
                <button
                  type="button"
                  onClick={() => setDepletionModalOpen(false)}
                  disabled={depleting}
                  className="btn-secondary text-xs px-4 py-2 text-slate-300"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleConfirmDepletion}
                  disabled={depleting || depletionItems.length === 0}
                  className="btn-primary text-xs px-5 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold flex items-center gap-2 shadow-lg disabled:opacity-50"
                >
                  {depleting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Issuing Stock…
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Issue to Kitchen & Deplete
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
