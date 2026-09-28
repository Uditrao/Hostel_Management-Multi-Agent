/**
 * ApprovalsPage.jsx — Phase 7D & Student Approvals Management
 * ============================================================
 * Warden approves pending student registrations and manages enrolled students.
 * - Tab 1: Pending Approvals (review, verify/edit roll & room, 1-click approve)
 * - Tab 2: Approved Students (view active students, room assignments, face biometric status)
 */
import { useState, useEffect, useCallback } from 'react'
import {
  UserCheck, UserX, RefreshCw, Search,
  Hash, Home, ChevronDown, CheckCircle2, Clock,
  Eye, ShieldAlert, Sparkles, AlertCircle, Users
} from 'lucide-react'
import { wardenApi } from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'

export default function ApprovalsPage() {
  const [activeTab,   setActiveTab]   = useState('pending') // 'pending' | 'approved'
  const [loading,     setLoading]     = useState(true)
  const [refreshing,  setRefreshing]  = useState(false)
  const [pending,     setPending]     = useState([])
  const [approved,    setApproved]    = useState([])
  const [search,      setSearch]      = useState('')
  const [loadError,   setLoadError]   = useState(null)
  const [approving,   setApproving]   = useState({})  // { userId: true }
  const [expanded,    setExpanded]    = useState({})  // { userId: true }
  const [formData,    setFormData]    = useState({})  // { userId: { roll_no, room_no } }
  const [messages,    setMessages]    = useState({})  // { userId: { type, text } }

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    setLoadError(null)

    try {
      const [pendingRes, approvedRes] = await Promise.all([
        wardenApi.getPendingStudents(),
        wardenApi.getApprovedStudents().catch(() => ({ data: { students: [] } })),
      ])

      const pendingList = pendingRes.data?.pending ?? []
      setPending(pendingList)
      setApproved(approvedRes.data?.students ?? [])

      // Prefill formData for all pending students so 1-click approve works right away
      const initialForm = {}
      pendingList.forEach((s) => {
        initialForm[s.id] = {
          roll_no: s.roll_no || '',
          room_no: s.room_no || '',
        }
      })
      setFormData((prev) => ({ ...initialForm, ...prev }))
    } catch (err) {
      console.error('Failed to load student approvals data:', err)
      setLoadError(err?.response?.data?.detail || err?.message || 'Failed to load student data.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadData(false)
  }, [loadData])

  const toggleExpand = (student) => {
    setExpanded((e) => ({ ...e, [student.id]: !e[student.id] }))
    if (!formData[student.id]) {
      setFormData((f) => ({
        ...f,
        [student.id]: {
          roll_no: student.roll_no || '',
          room_no: student.room_no || '',
        },
      }))
    }
  }

  const handleFieldChange = (userId, field, value) => {
    setFormData((f) => ({ ...f, [userId]: { ...f[userId], [field]: value } }))
  }

  const handleApprove = async (student) => {
    const fd = formData[student.id] ?? {
      roll_no: student.roll_no || '',
      room_no: student.room_no || '',
    }

    if (!fd.roll_no?.trim() || !fd.room_no?.trim()) {
      setMessages((m) => ({
        ...m,
        [student.id]: { type: 'error', text: 'Roll number and room number are required to approve.' },
      }))
      return
    }

    setApproving((a) => ({ ...a, [student.id]: true }))
    setMessages((m) => ({ ...m, [student.id]: null }))

    try {
      await wardenApi.approveStudent(student.id, {
        roll_no: fd.roll_no.trim(),
        room_no: fd.room_no.trim(),
      })

      setMessages((m) => ({
        ...m,
        [student.id]: {
          type: 'success',
          text: `✓ Approved! ${student.full_name || student.email} is now activated and can enroll their face.`,
        },
      }))

      // Reload fresh data after short visual confirmation
      setTimeout(() => {
        loadData(true)
      }, 1200)
    } catch (err) {
      setMessages((m) => ({
        ...m,
        [student.id]: {
          type: 'error',
          text: err?.response?.data?.detail || err?.detail || err?.message || 'Approval failed. Please try again.',
        },
      }))
    } finally {
      setApproving((a) => ({ ...a, [student.id]: false }))
    }
  }

  const filteredPending = pending.filter((s) =>
    !search ||
    s.email?.toLowerCase().includes(search.toLowerCase()) ||
    s.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    s.roll_no?.toLowerCase().includes(search.toLowerCase())
  )

  const filteredApproved = approved.filter((s) =>
    !search ||
    s.name?.toLowerCase().includes(search.toLowerCase()) ||
    s.roll_no?.toLowerCase().includes(search.toLowerCase()) ||
    s.room_no?.toLowerCase().includes(search.toLowerCase())
  )

  const fmtDate = (iso) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs text-cyan-400 font-semibold uppercase tracking-widest mb-1">
            Admin · Student Onboarding &amp; Verification
          </p>
          <h1 className="page-header">Student Approvals &amp; Enrollment</h1>
          <p className="page-subheader">
            Verify student registration requests, assign official hostel rooms, and monitor biometric enrollment.
          </p>
        </div>
        <button
          onClick={() => loadData(true)}
          disabled={refreshing}
          className="btn-secondary flex items-center gap-2 self-start sm:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Error alert if load failed */}
      {loadError && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      {/* Tabs & Search Row */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 ${
              activeTab === 'pending'
                ? 'bg-violet-600 text-white shadow-glow-violet'
                : 'text-slate-400 hover:text-slate-200 bg-white/[0.03]'
            }`}
          >
            <Clock className="w-4 h-4" />
            Pending Requests
            {pending.length > 0 && (
              <span className="px-2 py-0.5 text-xs rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {pending.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('approved')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 ${
              activeTab === 'approved'
                ? 'bg-violet-600 text-white shadow-glow-violet'
                : 'text-slate-400 hover:text-slate-200 bg-white/[0.03]'
            }`}
          >
            <Users className="w-4 h-4" />
            Approved Students
            <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              {approved.length}
            </span>
          </button>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            className="input pl-9 w-full"
            placeholder={activeTab === 'pending' ? 'Search pending by name or email…' : 'Search approved by name, roll, room…'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: PENDING APPROVALS */}
      {/* ========================================================================= */}
      {activeTab === 'pending' && (
        <div className="space-y-3">
          {filteredPending.length === 0 && (
            <div className="card border border-white/[0.08] py-16 text-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
              <p className="text-slate-200 text-base font-semibold">
                {search ? 'No matching pending requests.' : 'All pending registrations approved!'}
              </p>
              <p className="text-slate-400 text-sm mt-1 max-w-md mx-auto">
                When new students sign up on the portal, their verification tickets will appear here for you to assign rooms and approve.
              </p>
            </div>
          )}

          {filteredPending.map((student) => {
            const isOpen = !!expanded[student.id]
            const fd     = formData[student.id] ?? { roll_no: student.roll_no || '', room_no: student.room_no || '' }
            const msg    = messages[student.id]
            const busy   = approving[student.id]

            return (
              <div
                key={student.id}
                className="card border border-white/[0.08] overflow-hidden transition-all duration-200"
              >
                {/* Summary Header */}
                <button
                  onClick={() => toggleExpand(student)}
                  className="w-full flex items-center gap-4 p-4 text-left hover:bg-white/[0.02] transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 font-bold text-sm shrink-0">
                    {(student.full_name ?? student.email)?.[0]?.toUpperCase() ?? '?'}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-100 truncate">
                        {student.full_name || 'Student'}
                      </p>
                      {student.roll_no && (
                        <span className="badge badge-cyan text-[11px]">
                          {student.roll_no}
                        </span>
                      )}
                      {student.room_no && (
                        <span className="badge badge-violet text-[11px]">
                          Room {student.room_no}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 truncate mt-0.5">{student.email}</p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="hidden sm:flex items-center gap-1 text-xs text-slate-500">
                      <Clock className="w-3.5 h-3.5" />
                      {fmtDate(student.created_at)}
                    </div>
                    <span className="badge badge-amber text-xs">Awaiting Approval</span>
                    <ChevronDown
                      className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </div>
                </button>

                {/* Expanded Approval Form */}
                {isOpen && (
                  <div className="border-t border-white/[0.06] p-5 bg-white/[0.015]">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h4 className="text-sm font-semibold text-slate-200">Verify Credentials &amp; Room Assignment</h4>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Confirm the student's Roll Number and assign their Hostel Room. Approving enables them to enroll their face biometrics.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="label text-xs">Roll Number *</label>
                        <div className="relative">
                          <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                          <input
                            className="input pl-9 w-full"
                            placeholder="e.g. 2024btech228"
                            value={fd.roll_no}
                            onChange={(e) => handleFieldChange(student.id, 'roll_no', e.target.value)}
                          />
                        </div>
                      </div>

                      <div>
                        <label className="label text-xs">Assigned Room Number *</label>
                        <div className="relative">
                          <Home className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                          <input
                            className="input pl-9 w-full"
                            placeholder="e.g. BH1-307"
                            value={fd.room_no}
                            onChange={(e) => handleFieldChange(student.id, 'room_no', e.target.value)}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Feedback message */}
                    {msg && (
                      <div className={`mb-4 p-3 rounded-xl text-xs flex items-center gap-2 ${
                        msg.type === 'success'
                          ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
                          : 'bg-rose-500/10 border border-rose-500/20 text-rose-300'
                      }`}>
                        {msg.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                        <span>{msg.text}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleApprove(student)}
                        disabled={busy}
                        className="btn-primary flex items-center gap-2 text-sm shadow-glow-violet"
                      >
                        {busy ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            Approving Student…
                          </>
                        ) : (
                          <>
                            <UserCheck className="w-4 h-4" />
                            Approve Student Account
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => toggleExpand(student)}
                        className="btn-ghost text-sm"
                      >
                        Collapse
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: APPROVED STUDENTS */}
      {/* ========================================================================= */}
      {activeTab === 'approved' && (
        <div className="space-y-3">
          {filteredApproved.length === 0 && (
            <div className="card border border-white/[0.08] py-16 text-center">
              <Users className="w-12 h-12 text-slate-500 mx-auto mb-3" />
              <p className="text-slate-300 font-semibold">
                {search ? 'No matching approved students found.' : 'No students approved yet.'}
              </p>
              <p className="text-slate-500 text-sm mt-1">
                Once you approve pending students from Tab 1, their active profiles will show here.
              </p>
            </div>
          )}

          {filteredApproved.map((student) => (
            <div
              key={student.id}
              className="card border border-white/[0.08] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-white/[0.12] transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold text-sm shrink-0">
                  {student.name?.[0]?.toUpperCase() ?? 'S'}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-100">{student.name}</p>
                    <span className="badge badge-cyan text-[11px] font-mono">{student.roll_no}</span>
                    <span className="badge badge-violet text-[11px]">Room {student.room_no}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    ID: <span className="font-mono text-[10px] text-slate-500">{student.id}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 self-end sm:self-center">
                {student.is_face_enrolled ? (
                  <span className="badge badge-emerald text-xs flex items-center gap-1.5 py-1 px-3">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    Face Enrolled (IRIS Active)
                  </span>
                ) : (
                  <span className="badge badge-amber text-xs flex items-center gap-1.5 py-1 px-3">
                    <Eye className="w-3.5 h-3.5 text-amber-400" />
                    Biometrics Pending
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
