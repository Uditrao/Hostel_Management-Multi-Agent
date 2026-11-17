/**
 * StudentDashboard.jsx — Architectural Monochromatic Resident Overview
 * ====================================================================
 */
import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarCheck, Wrench, Camera, Clock, AlertTriangle, ArrowRight,
  Eye, RefreshCw, Hash, Home, ShieldAlert
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { sentinelApi, fixrApi } from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'

export default function StudentDashboard() {
  const { user, profile, studentProfile, refreshProfile } = useAuth()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [attendanceStats, setAttendanceStats] = useState({
    rate: 100,
    present: 0,
    late: 0,
    total: 0,
    recentLogs: [],
  })
  const [complaintStats, setComplaintStats] = useState({
    openCount: 0,
    activeTickets: [],
  })
  const [gateWindow, setGateWindow] = useState(null)

  const loadDashboardData = useCallback(async (isSilent = false) => {
    if (!user?.id) return
    if (!isSilent) setLoading(true)
    else setRefreshing(true)

    try {
      const [attRes, compRes, winRes] = await Promise.all([
        sentinelApi.getAttendance(user.id, 5).catch(() => ({ data: null })),
        fixrApi.getMyComplaints(user.id, null, 4).catch(() => ({ data: null })),
        sentinelApi.getWindow().catch(() => ({ data: null })),
      ])

      if (attRes.data?.success) {
        const d = attRes.data
        const tot = d.total_records || 0
        const pres = d.present_count || 0
        setAttendanceStats({
          rate: tot > 0 ? Math.round((pres / tot) * 100) : 100,
          present: pres,
          late: d.late_count || 0,
          total: tot,
          recentLogs: d.logs || [],
        })
      }

      if (compRes.data?.success) {
        const d = compRes.data
        const open = (d.summary?.open || 0) + (d.summary?.assigned || 0)
        setComplaintStats({
          openCount: open,
          activeTickets: d.complaints || [],
        })
      }

      if (winRes.data?.window) {
        setGateWindow(winRes.data.window)
      }
    } catch (err) {
      console.error('Error loading resident dashboard data:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [user?.id])

  useEffect(() => {
    loadDashboardData()
  }, [loadDashboardData])

  const name =
    profile?.full_name ||
    user?.user_metadata?.full_name ||
    user?.email?.split('@')[0] ||
    'Resident'

  const rollNo = studentProfile?.roll_no || user?.user_metadata?.roll_no || 'Pending Allocation'
  const roomNo = studentProfile?.room_no || user?.user_metadata?.room_no || 'Room —'
  const isEnrolled = studentProfile?.is_face_enrolled

  return (
    <div className="space-y-6 font-mono text-[#e0e0e0]">
      {/* ── Pending Verification Banner ────────────────────────────────────── */}
      {(profile?.status === 'pending' || !studentProfile) && (
        <div className="p-4 bg-[#141414] border border-[#3b3b3b] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-white shrink-0 mt-0.5" />
            <div>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                REGISTRATION PENDING WARDEN VERIFICATION
              </h3>
              <p className="text-xs text-[#888888] font-sans mt-0.5 max-w-2xl">
                Your resident profile is queued for room and roll verification. Biometric face capture will be authorized once your record is verified by hostel administration.
              </p>
            </div>
          </div>
          <button
            onClick={() => refreshProfile && refreshProfile()}
            className="btn-secondary text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            CHECK STATUS
          </button>
        </div>
      )}

      {/* ── Resident Overview Banner ───────────────────────────────────────── */}
      <div className="p-6 bg-[#0e0e0e] border border-[#242424]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2 flex-wrap text-[11px]">
              <span className="px-2 py-0.5 bg-[#171717] border border-[#333333] text-white uppercase font-bold">
                RESIDENT HUB
              </span>
              <span className="px-2 py-0.5 bg-[#121212] border border-[#262626] text-[#aaaaaa]">
                ID: {rollNo}
              </span>
              <span className="px-2 py-0.5 bg-[#121212] border border-[#262626] text-[#aaaaaa]">
                ROOM: {roomNo}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight font-sans uppercase">
              RESIDENT // {name}
            </h1>
            <p className="text-xs text-[#888888] font-sans mt-1">
              Active facility control panel monitoring gate curfew compliance, biometric authorization, and facility maintenance requests.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => {
                loadDashboardData(true)
                if (refreshProfile) refreshProfile()
              }}
              disabled={refreshing}
              className="btn-secondary text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{refreshing ? 'SYNCING…' : 'REFRESH'}</span>
            </button>

            {!isEnrolled && (
              <Link
                to="/student/enroll"
                className="btn-primary text-xs"
              >
                <Camera className="w-3.5 h-3.5" />
                ENROLL BIOMETRICS
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* ── Biometrics Unenrolled Alert ────────────────────────────────────── */}
      {!isEnrolled && (
        <div className="p-4 bg-[#121212] border border-[#404040] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ShieldAlert className="w-5 h-5 text-white shrink-0" />
            <div>
              <h3 className="text-xs font-bold text-white uppercase">
                BIOMETRIC VECTOR REGISTRATION REQUIRED
              </h3>
              <p className="text-xs text-[#888888] font-sans mt-0.5">
                Your face is not registered with the IRIS vision engine. Contactless gate scanners and dining kiosks will not verify your entry.
              </p>
            </div>
          </div>
          <Link
            to="/student/enroll"
            className="btn-primary text-xs shrink-0"
          >
            START FACE ENROLLMENT →
          </Link>
        </div>
      )}

      {/* ── KPI Stat Cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Attendance Rate */}
        <Link
          to="/student/attendance"
          className="bg-[#0e0e0e] border border-[#242424] hover:border-[#666666] p-5 flex flex-col justify-between group transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[#777777] uppercase tracking-wider">GATE COMPLIANCE</span>
            <CalendarCheck className="w-4 h-4 text-[#777777] group-hover:text-white transition-colors" />
          </div>
          <div className="my-3">
            <div className="text-3xl font-bold text-white">
              {attendanceStats.rate}%
            </div>
            <p className="text-[10px] text-[#777777] font-sans uppercase mt-0.5">
              {attendanceStats.present} on-time • {attendanceStats.late} late arrivals
            </p>
          </div>
          <div className="flex items-center justify-between text-[10px] text-[#666666] pt-2 border-t border-[#1a1a1a]">
            <span>SCAN REGISTER</span>
            <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        {/* IRIS Biometrics Status */}
        <Link
          to="/student/enroll"
          className="bg-[#0e0e0e] border border-[#242424] hover:border-[#666666] p-5 flex flex-col justify-between group transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[#777777] uppercase tracking-wider">IRIS BIOMETRICS</span>
            <Eye className="w-4 h-4 text-[#777777] group-hover:text-white transition-colors" />
          </div>
          <div className="my-3">
            <div className="text-xl font-bold text-white flex items-center gap-2">
              <span className={`w-2 h-2 ${isEnrolled ? 'bg-white' : 'bg-[#666666]'}`} />
              <span>{isEnrolled ? 'ENROLLED' : 'MISSING'}</span>
            </div>
            <p className="text-[10px] text-[#777777] font-sans uppercase mt-0.5">
              {isEnrolled ? '512-d ArcFace Valid' : 'Vector Not Found'}
            </p>
          </div>
          <div className="flex items-center justify-between text-[10px] text-[#666666] pt-2 border-t border-[#1a1a1a]">
            <span>{isEnrolled ? 'RECALIBRATE' : 'CAPTURE FACE'}</span>
            <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        {/* Open Maintenance Tickets */}
        <Link
          to="/student/complaints"
          className="bg-[#0e0e0e] border border-[#242424] hover:border-[#666666] p-5 flex flex-col justify-between group transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[#777777] uppercase tracking-wider">MAINTENANCE TICKETS</span>
            <Wrench className="w-4 h-4 text-[#777777] group-hover:text-white transition-colors" />
          </div>
          <div className="my-3">
            <div className="text-3xl font-bold text-white">
              {complaintStats.openCount}
            </div>
            <p className="text-[10px] text-[#777777] font-sans uppercase mt-0.5">Active work orders</p>
          </div>
          <div className="flex items-center justify-between text-[10px] text-[#666666] pt-2 border-t border-[#1a1a1a]">
            <span>FILE / VIEW</span>
            <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        {/* Curfew Hours */}
        <Link
          to="/student/attendance"
          className="bg-[#0e0e0e] border border-[#242424] hover:border-[#666666] p-5 flex flex-col justify-between group transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[#777777] uppercase tracking-wider">CURFEW LOCK</span>
            <Clock className="w-4 h-4 text-[#777777] group-hover:text-white transition-colors" />
          </div>
          <div className="my-3">
            <div className="text-3xl font-bold text-white">
              {gateWindow?.end_time ? gateWindow.end_time.slice(0, 5) : '21:30'}
            </div>
            <p className="text-[10px] text-[#777777] font-sans uppercase mt-0.5">
              Open: {gateWindow?.start_time ? gateWindow.start_time.slice(0, 5) : '06:00'}
            </p>
          </div>
          <div className="flex items-center justify-between text-[10px] text-[#666666] pt-2 border-t border-[#1a1a1a]">
            <span>GATE POLICY</span>
            <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>
      </div>

      {/* ── Split Feeds: Recent Gate Check-Ins & Active Complaints ─────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Gate Attendance History */}
        <div className="bg-[#0e0e0e] border border-[#242424] p-5">
          <div className="flex items-center justify-between pb-3 border-b border-[#202020] mb-3">
            <span className="text-xs font-bold text-white tracking-wider uppercase">RECENT GATE CHECK-INS</span>
            <Link to="/student/attendance" className="text-xs text-[#888888] hover:text-white flex items-center gap-1">
              <span>ALL</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {loading ? (
            <div className="py-8 flex justify-center">
              <LoadingSpinner size="md" />
            </div>
          ) : attendanceStats.recentLogs.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#555555]">
              No recent gate check-ins logged. Scan face at hostel main gate.
            </div>
          ) : (
            <div className="space-y-2">
              {attendanceStats.recentLogs.map((log) => {
                const d = new Date(log.timestamp)
                const isPresent = log.status === 'present'
                return (
                  <div
                    key={log.id || log.timestamp}
                    className="p-3 bg-[#121212] border border-[#222222] flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={`w-2 h-2 ${isPresent ? 'bg-white' : 'bg-[#666666]'}`} />
                      <div>
                        <p className="font-bold text-white font-sans">
                          {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' }).toUpperCase()}
                        </p>
                        <p className="text-[11px] text-[#777777]">
                          {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • PERIMETER GATE
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 bg-[#181818] border border-[#303030] text-white">
                      {isPresent ? 'ON-TIME' : 'LATE ARRIVAL'}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Maintenance Tickets */}
        <div className="bg-[#0e0e0e] border border-[#242424] p-5">
          <div className="flex items-center justify-between pb-3 border-b border-[#202020] mb-3">
            <span className="text-xs font-bold text-white tracking-wider uppercase">SERVICE WORK ORDERS</span>
            <Link to="/student/complaints" className="text-xs text-[#888888] hover:text-white flex items-center gap-1">
              <span>ALL</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {loading ? (
            <div className="py-8 flex justify-center">
              <LoadingSpinner size="md" />
            </div>
          ) : complaintStats.activeTickets.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#555555]">
              No active maintenance tickets on file. Everything in order.
            </div>
          ) : (
            <div className="space-y-2">
              {complaintStats.activeTickets.slice(0, 3).map((item) => (
                <div
                  key={item.id}
                  className="p-3 bg-[#121212] border border-[#222222] text-xs space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-white font-sans font-medium truncate">
                      {item.short_summary || item.raw_text}
                    </p>
                    <span className="text-[10px] px-2 py-0.5 bg-[#181818] border border-[#303030] text-[#aaaaaa] shrink-0 uppercase">
                      {item.status}
                    </span>
                  </div>
                  {item.assigned_worker_note && (
                    <p className="text-[11px] text-[#cccccc] truncate">
                      NOTE: {item.assigned_worker_note}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
