/**
 * InventoryPage.jsx
 * =================
 * Full-featured mess ingredients inventory management (Phase 7C).
 * Features:
 *   - Live inventory table with search, status filtering, and threshold badges
 *   - Quick stock adjustment modal (Add / Subtract / Set)
 *   - Active low-stock alerts panel with one-click resolution
 *   - Manual post-meal depletion runner
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Package,
  AlertTriangle,
  Plus,
  Minus,
  Sliders,
  RefreshCw,
  Search,
  X,
  Utensils
} from 'lucide-react'
import { nourishApi } from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'

const POPULAR_UNITS = ['kg', 'L', 'packets', 'bags', 'units', 'grams']

export default function InventoryPage() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [inventory, setInventory] = useState([])
  const [alerts, setAlerts] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all') // 'all' | 'low' | 'normal'

  // Stock Adjustment Modal
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState('add') // 'add' | 'subtract' | 'set'
  const [selectedItem, setSelectedItem] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('kg')
  const [updating, setUpdating] = useState(false)
  const [modalFeedback, setModalFeedback] = useState(null)

  // Depletion Modal
  const [depletionOpen, setDepletionOpen] = useState(false)
  const [depletionMeal, setDepletionMeal] = useState('lunch')
  const [depleting, setDepleting] = useState(false)
  const [depletionResult, setDepletionResult] = useState(null)

  // Fetch inventory & alerts
  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true)
    else setRefreshing(true)

    try {
      const [invRes, altRes] = await Promise.all([
        nourishApi.getInventory().catch(() => ({ data: null })),
        nourishApi.getAlerts().catch(() => ({ data: null })),
      ])

      if (invRes.data?.success) {
        setInventory(invRes.data.inventory || [])
      }
      if (altRes.data?.success) {
        setAlerts(altRes.data.alerts || [])
      }
    } catch (err) {
      console.error('Error fetching inventory:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Open adjustment modal for a specific item
  const openAdjustment = (itemName = '', defaultMode = 'add', defaultUnit = 'kg') => {
    setSelectedItem(itemName)
    setModalMode(defaultMode)
    setQuantity('')
    setUnit(defaultUnit || 'kg')
    setModalFeedback(null)
    setModalOpen(true)
  }

  // Handle stock update
  const handleStockUpdate = async (e) => {
    e.preventDefault()
    if (!selectedItem.trim()) {
      setModalFeedback({ success: false, message: 'Please enter or select an item name.' })
      return
    }
    const num = parseFloat(quantity)
    if (isNaN(num) || num <= 0) {
      setModalFeedback({ success: false, message: 'Please enter a valid positive quantity.' })
      return
    }

    setUpdating(true)
    setModalFeedback(null)

    try {
      const res = await nourishApi.updateStock({
        item_name: selectedItem.trim().toLowerCase(),
        action: modalMode,
        quantity: num,
        unit: unit.trim(),
      })

      if (res.data?.success) {
        setModalFeedback({
          success: true,
          message: `Stock for '${selectedItem}' updated to ${res.data.item?.quantity} ${res.data.item?.unit}!`,
        })
        setTimeout(() => {
          setModalOpen(false)
          loadData(true)
        }, 1200)
      } else {
        setModalFeedback({
          success: false,
          message: res.data?.error || 'Failed to update stock.',
        })
      }
    } catch (err) {
      console.error('Stock update error:', err)
      setModalFeedback({
        success: false,
        message: err.detail || err.response?.data?.detail || 'Stock update failed.',
      })
    } finally {
      setUpdating(false)
    }
  }

  // Resolve alert
  const handleResolveAlert = async (alertId) => {
    try {
      await nourishApi.resolveAlert(alertId)
      setAlerts((prev) => prev.filter((a) => a.id !== alertId))
    } catch (err) {
      console.error('Error resolving alert:', err)
    }
  }

  // Trigger post-meal depletion
  const handleTriggerDepletion = async () => {
    setDepleting(true)
    setDepletionResult(null)

    try {
      const res = await nourishApi.runDepletion(depletionMeal)
      if (res.data?.success) {
        setDepletionResult({
          success: true,
          message: `Depletion applied for ${depletionMeal}! Depleted items: ${res.data.depleted_count || 0}. Alerts raised: ${res.data.alerts_raised || 0}.`,
        })
        loadData(true)
      } else {
        setDepletionResult({
          success: false,
          message: res.data?.message || 'Depletion failed.',
        })
      }
    } catch (err) {
      console.error('Depletion error:', err)
      setDepletionResult({
        success: false,
        message: err.detail || 'Depletion request failed. Check server logs.',
      })
    } finally {
      setDepleting(false)
    }
  }

  // Filtered inventory list
  const filteredInventory = useMemo(() => {
    let list = inventory
    if (statusFilter === 'low') {
      list = list.filter((i) => Number(i.quantity) <= Number(i.min_threshold || 10))
    } else if (statusFilter === 'normal') {
      list = list.filter((i) => Number(i.quantity) > Number(i.min_threshold || 10))
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(
        (i) =>
          i.item_name?.toLowerCase().includes(q) ||
          i.unit?.toLowerCase().includes(q)
      )
    }
    return list
  }, [inventory, statusFilter, searchQuery])

  return (
    <div className="animate-fade-in max-w-6xl mx-auto space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-widest text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-full">
              NOURISH Inventory
            </span>
            <span className="badge badge-emerald text-[11px]">Real-time Tracking</span>
          </div>
          <h1 className="page-header">Mess Stock & Ingredients</h1>
          <p className="page-subheader">
            Monitor live stock levels, configure safety thresholds, and log vendor deliveries.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto flex-wrap">
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="btn-secondary text-xs px-3 py-2 flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Syncing…' : 'Refresh'}
          </button>

          <button
            onClick={() => setDepletionOpen(true)}
            className="btn-secondary text-xs px-3.5 py-2 flex items-center gap-1.5 border-white/10 hover:border-amber-500/40"
          >
            <Utensils className="w-3.5 h-3.5 text-amber-400" />
            Run Meal Depletion
          </button>

          <button
            onClick={() => openAdjustment('', 'add', 'kg')}
            className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-glow-amber"
          >
            <Plus className="w-4 h-4" />
            Adjust / Add Stock
          </button>
        </div>
      </div>

      {/* Active Low Stock Alerts Banner */}
      {alerts.length > 0 && (
        <div className="p-5 rounded-2xl border border-rose-500/30 bg-rose-500/10 space-y-3 animate-slide-up">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 animate-pulse" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-rose-200">
                  {alerts.length} Ingredient{alerts.length > 1 ? 's' : ''} Below Safety Threshold
                </h3>
                <p className="text-xs text-rose-300/80">
                  Re-order required before next meal window to prevent preparation shortages.
                </p>
              </div>
            </div>
            <span className="badge badge-rose text-[10px]">Action Required</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
            {alerts.map((alt) => (
              <div
                key={alt.id}
                className="p-3 rounded-xl bg-slate-950/60 border border-rose-500/20 flex items-center justify-between gap-3"
              >
                <div>
                  <p className="text-xs font-semibold text-slate-200 capitalize">
                    {alt.item_name}
                  </p>
                  <p className="text-[11px] text-slate-400 font-mono">
                    Stock: <span className="text-rose-400 font-bold">{alt.current_stock}</span> / Min: {alt.threshold}
                  </p>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => openAdjustment(alt.item_name, 'add', 'kg')}
                    className="btn-primary text-[10px] py-1 px-2 bg-amber-500 text-slate-950 font-semibold"
                  >
                    + Add
                  </button>
                  <button
                    onClick={() => handleResolveAlert(alt.id)}
                    className="btn-secondary text-[10px] py-1 px-2"
                  >
                    Resolve
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="stat-card border border-white/10">
          <span className="text-xs text-slate-400">Total Items Tracked</span>
          <p className="text-3xl font-bold text-slate-100">{inventory.length}</p>
          <span className="text-[11px] text-slate-500">Database rows</span>
        </div>
        <div className="stat-card border border-amber-500/20">
          <span className="text-xs text-amber-400">Stock Alerts Active</span>
          <p className="text-3xl font-bold text-amber-300">{alerts.length}</p>
          <span className="text-[11px] text-slate-500">Below threshold</span>
        </div>
        <div className="stat-card border border-emerald-500/20">
          <span className="text-xs text-emerald-400">Optimal Stock Level</span>
          <p className="text-3xl font-bold text-emerald-300">
            {Math.max(0, inventory.length - alerts.length)}
          </p>
          <span className="text-[11px] text-slate-500">Healthy supplies</span>
        </div>
        <div className="stat-card border border-cyan-500/20">
          <span className="text-xs text-cyan-400">Depletion Status</span>
          <p className="text-xl font-bold text-slate-200">Automatic</p>
          <span className="text-[11px] text-slate-500">Post-meal subtraction</span>
        </div>
      </div>

      {/* Main Inventory Table Card */}
      <div className="card border border-white/[0.08] p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.06]">
          {/* Status Filter Pills */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900/60 border border-white/[0.06] w-fit">
            {[
              { id: 'all', label: 'All Items' },
              { id: 'low', label: 'Low Stock' },
              { id: 'normal', label: 'Adequate' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  statusFilter === tab.id
                    ? 'bg-amber-500 text-slate-950 shadow-glow-amber'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search box */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search ingredient…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-xl glass text-xs text-slate-200 placeholder-slate-500 border border-white/[0.08] focus:outline-none focus:border-amber-500/50"
            />
          </div>
        </div>

        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center">
            <LoadingSpinner size="lg" />
            <p className="text-xs text-slate-500 mt-3">Loading NOURISH stock table…</p>
          </div>
        ) : filteredInventory.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto mb-3">
              <Package className="w-7 h-7" />
            </div>
            <h3 className="text-sm font-semibold text-slate-200">No Ingredients Found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              Click &quot;Adjust / Add Stock&quot; or run an NLP command to add ingredients to the database.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead>
                <tr className="border-b border-white/[0.06] text-slate-500 uppercase tracking-wider font-semibold">
                  <th className="pb-3 pl-2">Ingredient Item</th>
                  <th className="pb-3">Current Stock</th>
                  <th className="pb-3">Min Safety Threshold</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3 text-right pr-2">Quick Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {filteredInventory.map((item) => {
                  const qty = Number(item.quantity)
                  const threshold = Number(item.min_threshold || 10)
                  const isLow = qty <= threshold
                  const isCritical = qty <= threshold / 2

                  return (
                    <tr
                      key={item.id || item.item_name}
                      className="hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="py-3.5 pl-2">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-2 h-2 rounded-full ${
                              isCritical
                                ? 'bg-rose-400 animate-pulse'
                                : isLow
                                ? 'bg-amber-400'
                                : 'bg-emerald-400'
                            }`}
                          />
                          <div>
                            <p className="font-semibold text-slate-100 capitalize">
                              {item.item_name}
                            </p>
                            <p className="text-[11px] text-slate-500 font-mono">
                              Unit: {item.unit}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5">
                        <span className="text-sm font-bold text-slate-100 font-mono">
                          {qty}
                        </span>{' '}
                        <span className="text-slate-400 text-xs">{item.unit}</span>
                      </td>

                      <td className="py-3.5 font-mono text-slate-400">
                        {threshold} {item.unit}
                      </td>

                      <td className="py-3.5">
                        <span
                          className={`badge ${
                            isCritical
                              ? 'badge-rose'
                              : isLow
                              ? 'badge-amber'
                              : 'badge-emerald'
                          }`}
                        >
                          {isCritical
                            ? 'Critical Low'
                            : isLow
                            ? 'Low Stock'
                            : 'Optimal'}
                        </span>
                      </td>

                      <td className="py-3.5 text-right pr-2">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openAdjustment(item.item_name, 'add', item.unit)}
                            title="Add stock"
                            className="p-1.5 rounded-lg bg-white/[0.03] hover:bg-emerald-500/20 hover:text-emerald-300 text-slate-400 transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => openAdjustment(item.item_name, 'subtract', item.unit)}
                            title="Subtract stock"
                            className="p-1.5 rounded-lg bg-white/[0.03] hover:bg-rose-500/20 hover:text-rose-300 text-slate-400 transition-colors"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => openAdjustment(item.item_name, 'set', item.unit)}
                            title="Set exact level"
                            className="p-1.5 rounded-lg bg-white/[0.03] hover:bg-cyan-500/20 hover:text-cyan-300 text-slate-400 transition-colors"
                          >
                            <Sliders className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Stock Adjustment Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="card max-w-md w-full p-6 border border-amber-500/30 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center">
                  <Package className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-semibold text-slate-100">Adjust Inventory Stock</h3>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleStockUpdate} className="space-y-4">
              {/* Action Mode Toggle */}
              <div className="flex rounded-xl bg-slate-900/60 p-1 border border-white/[0.06]">
                {[
                  { id: 'add', label: '+ Add Delivery', color: 'bg-emerald-500 text-slate-950' },
                  { id: 'subtract', label: '- Deduct Usage', color: 'bg-rose-500 text-white' },
                  { id: 'set', label: 'Set Exact', color: 'bg-cyan-500 text-slate-950' },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setModalMode(m.id)}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                      modalMode === m.id ? m.color : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Item Name */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Ingredient Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. rice, milk, dal, onions..."
                  value={selectedItem}
                  onChange={(e) => setSelectedItem(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl glass text-xs text-slate-100 border border-white/10 focus:outline-none focus:border-amber-500/50"
                />
              </div>

              {/* Quantity & Unit */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Quantity
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="e.g. 25"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl glass text-xs text-slate-100 border border-white/10 focus:outline-none focus:border-amber-500/50 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Unit
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="kg, L, bags..."
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl glass text-xs text-slate-100 border border-white/10 focus:outline-none focus:border-amber-500/50 font-mono"
                  />
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {POPULAR_UNITS.map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => setUnit(u)}
                        className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                          unit === u
                            ? 'border-amber-500/50 bg-amber-500/20 text-amber-300'
                            : 'border-white/10 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {u}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Feedback Alert */}
              {modalFeedback && (
                <div
                  className={`p-3 rounded-xl text-xs border ${
                    modalFeedback.success
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  }`}
                >
                  {modalFeedback.message}
                </div>
              )}

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="btn-secondary text-xs py-2 px-4"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updating}
                  className="btn-primary text-xs py-2 px-5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-glow-amber"
                >
                  {updating ? <LoadingSpinner size="sm" /> : 'Save Update'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manual Depletion Modal */}
      {depletionOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="card max-w-md w-full p-6 border border-amber-500/30 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center">
                  <Utensils className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-semibold text-slate-100">Run Post-Meal Depletion</h3>
              </div>
              <button
                onClick={() => setDepletionOpen(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              NOURISH will look up the verified biometric headcounts for this meal, cross-reference ingredients from the active menu, and decrement stock accordingly.
            </p>

            <div className="space-y-3">
              <label className="block text-xs font-medium text-slate-400">
                Select Meal Service to Deplete
              </label>
              <div className="flex rounded-xl bg-slate-900/60 p-1 border border-white/[0.06]">
                {['breakfast', 'lunch', 'dinner'].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setDepletionMeal(m)}
                    className={`flex-1 py-2 text-xs font-semibold rounded-lg capitalize transition-all ${
                      depletionMeal === m
                        ? 'bg-amber-500 text-slate-950 font-bold shadow-glow-amber'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {depletionResult && (
              <div
                className={`p-3 rounded-xl text-xs border ${
                  depletionResult.success
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}
              >
                {depletionResult.message}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDepletionOpen(false)}
                className="btn-secondary text-xs py-2 px-4"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleTriggerDepletion}
                disabled={depleting}
                className="btn-primary text-xs py-2 px-5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-glow-amber"
              >
                {depleting ? <LoadingSpinner size="sm" /> : 'Run Depletion Now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
