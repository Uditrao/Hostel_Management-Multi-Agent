/**
 * WardenContext.jsx
 * =================
 * Shared data cache for the entire Warden portal.
 *
 * - Fetches all warden data once on first mount.
 * - Caches for 60 seconds (STALE_MS). Tab switches within 60s are instant.
 * - Herald Summary fetched separately (non-blocking) so the rest of the
 *   page appears immediately even if the LLM is slow.
 * - Exposes granular refresh helpers so individual pages can re-fetch only
 *   what changed (anomalies, complaints, approvals) without busting the
 *   entire cache.
 * - Auto-destroyed on logout because <WardenProvider> only renders inside
 *   the protected warden route tree.
 */
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { wardenApi, sentinelApi } from '../services/api'

const WardenContext = createContext(null)

const STALE_MS = 60_000 // 60 seconds

const EMPTY_DATA = {
  // Dashboard stats
  stats: {
    defaultersToday:    null,
    pendingApprovals:   null,
    openComplaints:     null,
    criticalComplaints: null,
    unseenAnomalies:    null,
    gateWindow:         null,
  },
  heraldSummary:          null,  // loaded separately
  recentAnomalies:        [],
  recentComplaints:       [],
  // Per-page full lists
  defaulters:             [],    // DefaultersPage
  anomalies:              [],    // AnomaliesPage
  anomaliesTotal:         0,
  pending:                [],    // ApprovalsPage tab 1
  approved:               [],    // ApprovalsPage tab 2
  complaints:             [],    // WardenComplaintsPage
  complaintsGlobalSummary:{},
  fetchedAt:              null,  // timestamp of last full fetch
}

export function WardenProvider({ children }) {
  const [data,          setData]          = useState(EMPTY_DATA)
  const [loading,       setLoading]       = useState(true)   // first full load
  const [refreshing,    setRefreshing]    = useState(false)  // background refresh
  const [heraldLoading, setHeraldLoading] = useState(true)   // herald-only spinner

  // Ref to always have latest data available inside callbacks without stale closure
  const dataRef = useRef(data)
  dataRef.current = data

  // ── Full fetch (all pages) ──────────────────────────────────────────────────
  const fetchAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else         setRefreshing(true)

    try {
      // Group 1: fast calls — resolve in ~200–800ms
      const [
        defaultersRes,
        pendingRes,
        complaintsSummaryRes,
        anomaliesRes,
        recentComplaintsRes,
        windowRes,
        allDefaultersRes,
        allAnomaliesRes,
        allComplaintsRes,
        approvedRes,
      ] = await Promise.all([
        wardenApi.getDefaulters().catch(() => ({ data: null })),
        wardenApi.getPendingStudents().catch(() => ({ data: null })),
        wardenApi.getFixrSummary().catch(() => ({ data: null })),
        wardenApi.getAnomalies({ unseenOnly: true,  limit: 5  }).catch(() => ({ data: null })),
        wardenApi.getComplaints({ status: 'open', urgency: 'critical', limit: 3 }).catch(() => ({ data: null })),
        sentinelApi.getWindow().catch(() => ({ data: null })),
        // Full lists for per-page use
        wardenApi.getDefaulters().catch(() => ({ data: null })),
        wardenApi.getAnomalies({ limit: 100 }).catch(() => ({ data: null })),
        wardenApi.getComplaints({ limit: 100 }).catch(() => ({ data: null })),
        wardenApi.getApprovedStudents().catch(() => ({ data: { students: [] } })),
      ])

      const fixrData  = complaintsSummaryRes.data || {}
      const openCount = fixrData.by_status?.open ?? fixrData.open ?? 0
      const critCount = (fixrData.open_critical ?? 0) + (fixrData.open_high ?? 0)

      setData(prev => ({
        ...prev,
        stats: {
          defaultersToday:    defaultersRes.data?.defaulter_count ?? defaultersRes.data?.defaulters?.length ?? 0,
          pendingApprovals:   pendingRes.data?.count ?? null,
          openComplaints:     openCount,
          criticalComplaints: critCount,
          unseenAnomalies:    anomaliesRes.data?.unseen_count ?? anomaliesRes.data?.total ?? 0,
          gateWindow:         windowRes.data ?? null,
        },
        recentAnomalies:        anomaliesRes.data?.flags?.slice(0, 4) ?? [],
        recentComplaints:       recentComplaintsRes.data?.complaints?.slice(0, 3) ?? [],
        defaulters:             allDefaultersRes.data?.defaulters ?? [],
        anomalies:              allAnomaliesRes.data?.flags ?? [],
        anomaliesTotal:         allAnomaliesRes.data?.total ?? 0,
        pending:                pendingRes.data?.pending ?? [],
        approved:               approvedRes.data?.students ?? [],
        complaints:             allComplaintsRes.data?.complaints ?? [],
        complaintsGlobalSummary: allComplaintsRes.data?.global_summary ?? fixrData,
        fetchedAt:              Date.now(),
        // keep heraldSummary as-is (fetched independently)
      }))
    } catch {
      // keep existing data on error
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  // ── Herald Summary fetch (independent, non-blocking) ───────────────────────
  const fetchHerald = useCallback(async (forceGenerate = false) => {
    setHeraldLoading(true)
    try {
      const res = await wardenApi.getHeraldSummary(forceGenerate)
      setData(prev => ({ ...prev, heraldSummary: res.data?.summary ?? null }))
    } catch {
      // keep existing
    } finally {
      setHeraldLoading(false)
    }
  }, [])

  // ── Mount: load fast data, then herald in background ───────────────────────
  useEffect(() => {
    fetchAll(false).then(() => fetchHerald(false))
  }, [fetchAll, fetchHerald])

  // ── Stale check: re-fetch if cache expired ─────────────────────────────────
  const ensureFresh = useCallback(() => {
    const { fetchedAt } = dataRef.current
    if (!fetchedAt || Date.now() - fetchedAt > STALE_MS) {
      fetchAll(true).then(() => fetchHerald(false))
    }
  }, [fetchAll, fetchHerald])

  // ── Public refresh helpers ─────────────────────────────────────────────────

  /** Force full re-fetch, bypass cache. Called by Refresh buttons. */
  const refresh = useCallback(async () => {
    await fetchAll(true)
    await fetchHerald(false)
  }, [fetchAll, fetchHerald])

  /** Re-fetch anomalies only. Called after Mark Seen / Run HERALD. */
  const refreshAnomalies = useCallback(async () => {
    setRefreshing(true)
    try {
      const [recentRes, allRes] = await Promise.all([
        wardenApi.getAnomalies({ unseenOnly: true, limit: 5 }).catch(() => ({ data: null })),
        wardenApi.getAnomalies({ limit: 100 }).catch(() => ({ data: null })),
      ])
      setData(prev => ({
        ...prev,
        recentAnomalies: recentRes.data?.flags?.slice(0, 4) ?? prev.recentAnomalies,
        anomalies:       allRes.data?.flags ?? prev.anomalies,
        anomaliesTotal:  allRes.data?.total ?? prev.anomaliesTotal,
        stats: {
          ...prev.stats,
          unseenAnomalies: recentRes.data?.unseen_count ?? recentRes.data?.total ?? prev.stats.unseenAnomalies,
        },
      }))
    } catch {
      // keep
    } finally {
      setRefreshing(false)
    }
  }, [])

  /** Re-fetch complaints only. Called after Save Changes on a complaint. */
  const refreshComplaints = useCallback(async (filters = {}) => {
    setRefreshing(true)
    try {
      const [cRes, sRes] = await Promise.all([
        wardenApi.getComplaints({ limit: 100, ...filters }).catch(() => ({ data: null })),
        wardenApi.getFixrSummary().catch(() => ({ data: null })),
      ])
      const fixrData  = sRes.data || {}
      const openCount = fixrData.by_status?.open ?? fixrData.open ?? 0
      const critCount = (fixrData.open_critical ?? 0) + (fixrData.open_high ?? 0)
      setData(prev => ({
        ...prev,
        complaints:              cRes.data?.complaints ?? prev.complaints,
        complaintsGlobalSummary: cRes.data?.global_summary ?? fixrData,
        recentComplaints:        (cRes.data?.complaints ?? [])
                                   .filter(c => c.status === 'open' && (c.urgency === 'critical' || c.urgency === 'high'))
                                   .slice(0, 3),
        stats: {
          ...prev.stats,
          openComplaints:     openCount,
          criticalComplaints: critCount,
        },
      }))
    } catch {
      // keep
    } finally {
      setRefreshing(false)
    }
  }, [])

  /** Re-fetch pending + approved students. Called after approving a student. */
  const refreshApprovals = useCallback(async () => {
    setRefreshing(true)
    try {
      const [pendingRes, approvedRes] = await Promise.all([
        wardenApi.getPendingStudents().catch(() => ({ data: null })),
        wardenApi.getApprovedStudents().catch(() => ({ data: { students: [] } })),
      ])
      setData(prev => ({
        ...prev,
        pending:  pendingRes.data?.pending ?? prev.pending,
        approved: approvedRes.data?.students ?? prev.approved,
        stats: {
          ...prev.stats,
          pendingApprovals: pendingRes.data?.count ?? null,
        },
      }))
    } catch {
      // keep
    } finally {
      setRefreshing(false)
    }
  }, [])

  /** Update gate window in stats (called from AttendanceWindowModal). */
  const setGateWindow = useCallback((newWin) => {
    setData(prev => ({
      ...prev,
      stats: { ...prev.stats, gateWindow: newWin },
    }))
  }, [])

  const value = {
    data,
    loading,
    refreshing,
    heraldLoading,
    refresh,
    refreshAnomalies,
    refreshComplaints,
    refreshApprovals,
    setGateWindow,
    ensureFresh,
    fetchHerald,
  }

  return (
    <WardenContext.Provider value={value}>
      {children}
    </WardenContext.Provider>
  )
}

export function useWardenContext() {
  const ctx = useContext(WardenContext)
  if (!ctx) throw new Error('useWardenContext must be used inside <WardenProvider>')
  return ctx
}
