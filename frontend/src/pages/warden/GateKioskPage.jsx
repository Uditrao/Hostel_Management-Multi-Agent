/**
 * GateKioskPage.jsx — Warden Portal Gate Attendance Scanner
 * ========================================================
 * High-tech biometric gate terminal for recording contactless student attendance.
 * Features:
 *   - Real-time webcam viewport with animated biometric reticle & scanline
 *   - 1-Click "Scan Face" (or Spacebar) + Continuous "Auto-Scan Mode"
 *   - Seamless multi-agent pipeline: IRIS (Face Vector) -> SENTINEL (Gate Curfew)
 *   - Satisfying Web Audio feedback chimes (success chime & error tone)
 *   - Live Gate Activity Feed (today's entries, present vs late)
 *   - Manual Roll-Number verification fallback
 *   - Fullscreen kiosk presentation mode
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Camera, Eye, ShieldCheck, CheckCircle2, AlertTriangle,
  RefreshCw, Sparkles, Clock, Users, Search, Volume2, VolumeX,
  Maximize2, Minimize2, UserCheck, DoorOpen, Hash, Home, ArrowRight
} from 'lucide-react'
import { wardenApi, sentinelApi } from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'

// Synthesize pleasant audio chimes using Web Audio API
function playChime(type = 'success') {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!AudioContext) return
    const ctx = new AudioContext()

    if (type === 'success') {
      // High pleasant two-tone chime (E5 -> B5)
      const now = ctx.currentTime
      const osc1 = ctx.createOscillator()
      const osc2 = ctx.createOscillator()
      const gain = ctx.createGain()

      osc1.type = 'sine'
      osc2.type = 'sine'
      osc1.frequency.setValueAtTime(659.25, now)       // E5
      osc1.frequency.setValueAtTime(987.77, now + 0.1) // B5

      gain.gain.setValueAtTime(0.2, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5)

      osc1.connect(gain)
      gain.connect(ctx.destination)

      osc1.start(now)
      osc1.stop(now + 0.5)
    } else {
      // Low dual warning buzz
      const now = ctx.currentTime
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(160, now)

      gain.gain.setValueAtTime(0.25, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(now)
      osc.stop(now + 0.4)
    }
  } catch {
    // Audio context may be restricted by browser autoplay policy
  }
}

export default function GateKioskPage() {
  // Tabs: 'kiosk' (scanner) | 'manual' (search check-in)
  const [activeTab, setActiveTab] = useState('kiosk')

  // Webcam states
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [autoScan, setAutoScan] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Last scan event / result
  const [lastScanResult, setLastScanResult] = useState(null)
  const [flashActive, setFlashActive] = useState(false)

  // Live gate activity logs
  const [todayLogs, setTodayLogs] = useState([])
  const [loadingLogs, setLoadingLogs] = useState(true)
  const [gateWindow, setGateWindow] = useState(null)

  // Manual check-in states
  const [studentsList, setStudentsList] = useState([])
  const [manualSearch, setManualSearch] = useState('')
  const [manualStatus, setManualStatus] = useState('present')
  const [manualSubmitting, setManualSubmitting] = useState({})

  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const containerRef = useRef(null)
  const autoScanTimerRef = useRef(null)

  // 1. Fetch Today's Logs and Gate Curfew Window
  const loadGateData = useCallback(async () => {
    try {
      const [logsRes, winRes, stuRes] = await Promise.all([
        wardenApi.getTodayGateLogs().catch(() => ({ data: { logs: [] } })),
        sentinelApi.getWindow().catch(() => ({ data: null })),
        wardenApi.getApprovedStudents().catch(() => ({ data: { students: [] } })),
      ])
      setTodayLogs(logsRes.data?.logs ?? [])
      setGateWindow(winRes.data ?? null)
      setStudentsList(stuRes.data?.students ?? [])
    } catch (err) {
      console.error('Failed to load gate data:', err)
    } finally {
      setLoadingLogs(false)
    }
  }, [])

  useEffect(() => {
    loadGateData()
    const interval = setInterval(loadGateData, 15000) // auto-refresh feed every 15s
    return () => clearInterval(interval)
  }, [loadGateData])

  // 2. Camera Controls
  const startCamera = useCallback(async () => {
    setCameraError(null)
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera device access is not supported by your browser.')
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
        audio: false,
      })

      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
      }
      setCameraActive(true)
    } catch (err) {
      console.error('Camera access failed:', err)
      setCameraError(err.message || 'Could not start webcam.')
    }
  }, [])

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    setCameraActive(false)
    setAutoScan(false)
  }, [])

  useEffect(() => {
    startCamera()
    return () => stopCamera()
  }, [startCamera, stopCamera])

  // 3. Process Face Recognition & Gate Event
  const performScan = useCallback(async () => {
    const video = videoRef.current
    if (!video || !cameraActive || scanning) return

    setScanning(true)
    setFlashActive(true)
    setTimeout(() => setFlashActive(false), 200)

    try {
      // Capture frame to Canvas
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth || 640
      canvas.height = video.videoHeight || 480
      const ctx = canvas.getContext('2d')
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.9)
      )

      if (!blob) throw new Error('Could not capture frame buffer.')

      // Prepare payload for IRIS Vision Agent
      const formData = new FormData()
      formData.append('location', 'gate')
      formData.append('mode', 'upload')
      formData.append('image', blob, 'kiosk_gate_scan.jpg')

      // 1. Call IRIS /iris/recognize
      const recognizeRes = await wardenApi.recognizeFace(formData)
      const irisEvent = recognizeRes.data

      if (!irisEvent || !irisEvent.recognized) {
        if (soundEnabled) playChime('error')
        setLastScanResult({
          recognized: false,
          error: irisEvent?.error || 'Face not recognized or not enrolled.',
          timestamp: new Date().toLocaleTimeString(),
        })
        return
      }

      // 2. Student recognized! Forward identity event to SENTINEL
      const gateRes = await wardenApi.sendGateEvent(irisEvent)
      const sentinelResult = gateRes.data

      if (soundEnabled) playChime('success')

      setLastScanResult({
        recognized: true,
        student_id: irisEvent.student_id,
        name: irisEvent.student_name,
        roll_no: irisEvent.roll_no,
        room_no: irisEvent.room_no,
        confidence: irisEvent.confidence,
        status: sentinelResult?.status || 'present',
        already_marked: sentinelResult?.already_marked || false,
        message: sentinelResult?.message,
        timestamp: new Date().toLocaleTimeString(),
      })

      // Refresh today's logs immediately
      loadGateData()
    } catch (err) {
      console.error('Scan error:', err)
      if (soundEnabled) playChime('error')
      setLastScanResult({
        recognized: false,
        error: err?.response?.data?.detail || err?.message || 'Scan error occurred.',
        timestamp: new Date().toLocaleTimeString(),
      })
    } finally {
      setScanning(false)
    }
  }, [cameraActive, scanning, soundEnabled, loadGateData])

  // Spacebar to capture
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space' && activeTab === 'kiosk' && !e.target.matches('input, textarea')) {
        e.preventDefault()
        performScan()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [performScan, activeTab])

  // Auto-scan timer loop
  useEffect(() => {
    if (autoScan && cameraActive && !scanning) {
      autoScanTimerRef.current = setTimeout(() => {
        performScan()
      }, 2500)
    }
    return () => clearTimeout(autoScanTimerRef.current)
  }, [autoScan, cameraActive, scanning, performScan])

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen?.()
      setIsFullscreen(false)
    }
  }

  // 4. Manual Check-in Handler
  const handleManualCheckin = async (student) => {
    setManualSubmitting((prev) => ({ ...prev, [student.id]: true }))
    try {
      await wardenApi.manualCheckin(student.id, manualStatus)
      if (soundEnabled) playChime('success')
      loadGateData()
    } catch (err) {
      console.error('Manual check-in failed:', err)
      if (soundEnabled) playChime('error')
    } finally {
      setManualSubmitting((prev) => ({ ...prev, [student.id]: false }))
    }
  }

  // Aggregate stats
  const presentCount = todayLogs.filter((l) => l.status === 'present').length
  const lateCount = todayLogs.filter((l) => l.status === 'late').length

  const filteredStudents = studentsList.filter((s) =>
    !manualSearch ||
    s.name?.toLowerCase().includes(manualSearch.toLowerCase()) ||
    s.roll_no?.toLowerCase().includes(manualSearch.toLowerCase()) ||
    s.room_no?.toLowerCase().includes(manualSearch.toLowerCase())
  )

  return (
    <div ref={containerRef} className="animate-fade-in space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-widest text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-0.5 rounded-full">
              SENTINEL Gate Security Terminal
            </span>
            <span className="badge badge-emerald text-[11px] flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live Kiosk Active
            </span>
          </div>
          <h1 className="page-header">Gate Attendance Scanner</h1>
          <p className="page-subheader">
            Real-time biometric facial scanner for students entering through the hostel main gate.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <button
            onClick={() => setSoundEnabled((s) => !s)}
            className={`btn-secondary text-xs flex items-center gap-1.5 ${soundEnabled ? 'text-cyan-300' : 'text-slate-500'}`}
            title={soundEnabled ? 'Mute Chimes' : 'Enable Chimes'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            {soundEnabled ? 'Sound ON' : 'Muted'}
          </button>

          <button
            onClick={toggleFullscreen}
            className="btn-secondary text-xs flex items-center gap-1.5"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          </button>

          <button
            onClick={loadGateData}
            className="btn-secondary text-xs flex items-center gap-1.5"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Metric Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="card p-4 border border-white/[0.08]">
          <p className="text-xs text-slate-400 uppercase font-semibold">Total Gate Entries</p>
          <p className="text-2xl font-bold text-slate-100 mt-1">{todayLogs.length}</p>
        </div>
        <div className="card p-4 border border-emerald-500/20 bg-emerald-500/5">
          <p className="text-xs text-emerald-400 uppercase font-semibold">On-Time (Present)</p>
          <p className="text-2xl font-bold text-emerald-300 mt-1">{presentCount}</p>
        </div>
        <div className="card p-4 border border-amber-500/20 bg-amber-500/5">
          <p className="text-xs text-amber-400 uppercase font-semibold">Late Entries</p>
          <p className="text-2xl font-bold text-amber-300 mt-1">{lateCount}</p>
        </div>
        <div className="card p-4 border border-violet-500/20 bg-violet-500/5">
          <p className="text-xs text-violet-400 uppercase font-semibold">Curfew Window</p>
          <p className="text-sm font-bold text-violet-300 mt-1.5">
            {gateWindow?.start_time ? `${gateWindow.start_time.slice(0, 5)} - ${gateWindow.end_time.slice(0, 5)}` : '07:00 - 21:00'}
          </p>
        </div>
      </div>

      {/* Tabs Switcher: Biometric Scanner vs Manual Verification */}
      <div className="flex gap-2 border-b border-white/[0.08] pb-3">
        <button
          onClick={() => setActiveTab('kiosk')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
            activeTab === 'kiosk'
              ? 'bg-violet-600 text-white shadow-glow-violet'
              : 'text-slate-400 hover:text-slate-200 bg-white/[0.03]'
          }`}
        >
          <Camera className="w-4 h-4" />
          Face Recognition Scanner
        </button>

        <button
          onClick={() => setActiveTab('manual')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
            activeTab === 'manual'
              ? 'bg-violet-600 text-white shadow-glow-violet'
              : 'text-slate-400 hover:text-slate-200 bg-white/[0.03]'
          }`}
        >
          <Users className="w-4 h-4" />
          Manual Student Check-in
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: BIOMETRIC SCANNER & LIVE ACTIVITY */}
      {/* ========================================================================= */}
      {activeTab === 'kiosk' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Live Camera & Scanner Reticle (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="card p-2 border border-cyan-500/30 bg-slate-950 relative overflow-hidden rounded-2xl shadow-2xl">
              {/* Flash effect */}
              {flashActive && (
                <div className="absolute inset-0 bg-white z-40 transition-opacity duration-200 opacity-90 pointer-events-none" />
              )}

              {/* Viewport Frame */}
              <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-slate-900 flex items-center justify-center">
                {cameraActive ? (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover scale-x-[-1]"
                  />
                ) : (
                  <div className="text-center p-8 space-y-3">
                    <Camera className="w-12 h-12 text-slate-600 mx-auto animate-pulse" />
                    <p className="text-sm text-slate-400 font-medium">Camera Feed Offline</p>
                    {cameraError && (
                      <p className="text-xs text-rose-400 max-w-xs">{cameraError}</p>
                    )}
                    <button onClick={startCamera} className="btn-secondary text-xs">
                      Retry Camera
                    </button>
                  </div>
                )}

                {/* Biometric HUD Overlay */}
                {cameraActive && (
                  <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-6">
                    {/* Corner Target Brackets */}
                    <div className="flex justify-between">
                      <div className="w-8 h-8 border-t-2 border-l-2 border-cyan-400 rounded-tl-lg shadow-glow-cyan" />
                      <div className="w-8 h-8 border-t-2 border-r-2 border-cyan-400 rounded-tr-lg shadow-glow-cyan" />
                    </div>

                    {/* Animated Scanning Laser Line */}
                    <div className="absolute inset-x-8 top-1/4 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-glow-cyan animate-pulse" />

                    {/* Center Face Target Reticle */}
                    <div className="self-center w-48 h-56 rounded-full border border-cyan-400/30 flex items-center justify-center">
                      <div className="w-40 h-48 rounded-full border border-dashed border-cyan-400/40" />
                    </div>

                    <div className="flex justify-between">
                      <div className="w-8 h-8 border-b-2 border-l-2 border-cyan-400 rounded-bl-lg shadow-glow-cyan" />
                      <div className="w-8 h-8 border-b-2 border-r-2 border-cyan-400 rounded-br-lg shadow-glow-cyan" />
                    </div>
                  </div>
                )}
              </div>

              {/* Viewport Control Bar */}
              <div className="p-4 bg-slate-900/80 backdrop-blur border-t border-white/[0.06] rounded-b-xl flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setAutoScan((a) => !a)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                      autoScan
                        ? 'bg-cyan-500 text-slate-950 shadow-glow-cyan'
                        : 'bg-white/[0.06] text-slate-300 hover:bg-white/[0.1]'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${autoScan ? 'bg-slate-950 animate-ping' : 'bg-slate-500'}`} />
                    {autoScan ? 'Auto-Scan Active (2.5s)' : 'Enable Auto-Scan'}
                  </button>

                  <span className="text-[11px] text-slate-400 hidden sm:inline">
                    or press <kbd className="px-1.5 py-0.5 rounded bg-white/[0.08] text-slate-300 font-mono text-[10px]">SPACE</kbd>
                  </span>
                </div>

                <button
                  onClick={performScan}
                  disabled={!cameraActive || scanning}
                  className="btn-primary text-sm px-6 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold shadow-glow-cyan flex items-center gap-2"
                >
                  {scanning ? (
                    <>
                      <LoadingSpinner size="sm" />
                      Scanning Biometrics…
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Scan Student (Space)
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Last Scan Result Card */}
            {lastScanResult && (
              <div
                className={`card p-5 border animate-slide-up ${
                  lastScanResult.recognized
                    ? lastScanResult.status === 'present'
                      ? 'border-emerald-500/40 bg-emerald-500/10'
                      : 'border-amber-500/40 bg-amber-500/10'
                    : 'border-rose-500/40 bg-rose-500/10'
                }`}
              >
                {lastScanResult.recognized ? (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-white/20 flex items-center justify-center text-xl font-black text-cyan-400 shrink-0">
                        {lastScanResult.name?.[0]?.toUpperCase() ?? 'S'}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-bold text-slate-100">{lastScanResult.name}</h3>
                          <span className="badge badge-cyan font-mono text-xs">{lastScanResult.roll_no}</span>
                          <span className="badge badge-violet text-xs">Room {lastScanResult.room_no}</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                          Cosine Similarity Match: <span className="text-cyan-300 font-semibold">{Math.round((lastScanResult.confidence || 0) * 100)}%</span> · Checked in at {lastScanResult.timestamp}
                        </p>
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div className="self-end sm:self-center">
                      <span
                        className={`text-sm font-bold uppercase tracking-wider px-4 py-2 rounded-xl border flex items-center gap-2 ${
                          lastScanResult.status === 'present'
                            ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-glow-emerald'
                            : 'bg-amber-500 text-slate-950 border-amber-400'
                        }`}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        {lastScanResult.status === 'present' ? '✓ PRESENT' : '⚠️ LATE ENTRY'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 text-rose-300">
                    <AlertTriangle className="w-8 h-8 text-rose-400 shrink-0" />
                    <div>
                      <h4 className="text-sm font-bold text-rose-200">Unknown Person — Access Denied</h4>
                      <p className="text-xs text-rose-300/80 mt-0.5">{lastScanResult.error}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Column: Live Today's Gate Entries Feed (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="card p-5 border border-white/[0.08]">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <DoorOpen className="w-5 h-5 text-cyan-400" />
                  <h3 className="text-base font-bold text-slate-100">Today's Gate Feed</h3>
                </div>
                <span className="badge badge-slate text-xs font-mono">{todayLogs.length} Entries</span>
              </div>

              {loadingLogs ? (
                <div className="py-12 flex justify-center">
                  <LoadingSpinner size="md" />
                </div>
              ) : todayLogs.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-sm">
                  <Clock className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                  No gate entries recorded today yet.
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1 scrollbar-thin">
                  {todayLogs.map((log) => {
                    const timeStr = log.timestamp
                      ? new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : '—'

                    return (
                      <div
                        key={log.id}
                        className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.12] transition-colors flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-bold text-xs flex items-center justify-center shrink-0">
                            {log.name?.[0]?.toUpperCase() ?? 'S'}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-200 truncate">{log.name}</p>
                            <p className="text-[11px] text-slate-400 truncate">
                              {log.roll_no} · Rm {log.room_no}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[11px] text-slate-500 font-mono">{timeStr}</span>
                          <span
                            className={`badge text-[10px] uppercase font-semibold ${
                              log.status === 'present' ? 'badge-emerald' : 'badge-amber'
                            }`}
                          >
                            {log.status}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: MANUAL ROLL-NUMBER VERIFICATION */}
      {/* ========================================================================= */}
      {activeTab === 'manual' && (
        <div className="card p-6 border border-white/[0.08] space-y-6">
          <div>
            <h3 className="text-base font-bold text-slate-100">Manual Attendance Verification</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Search a student by Name, Roll Number, or Room to manually log their gate check-in.
            </p>
          </div>

          {/* Search & Status Filters */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                className="input pl-9 w-full"
                placeholder="Search student by name, roll no, room…"
                value={manualSearch}
                onChange={(e) => setManualSearch(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Mark as:</span>
              <button
                onClick={() => setManualStatus('present')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  manualStatus === 'present'
                    ? 'bg-emerald-500 text-slate-950 font-bold'
                    : 'bg-white/[0.05] text-slate-400'
                }`}
              >
                Present
              </button>
              <button
                onClick={() => setManualStatus('late')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  manualStatus === 'late'
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'bg-white/[0.05] text-slate-400'
                }`}
              >
                Late
              </button>
            </div>
          </div>

          {/* Students Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredStudents.map((student) => {
              const isSubmitting = !!manualSubmitting[student.id]

              return (
                <div
                  key={student.id}
                  className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.12] transition-colors flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-200 truncate">{student.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      <span className="font-mono text-cyan-400">{student.roll_no}</span> · Room {student.room_no}
                    </p>
                  </div>

                  <button
                    onClick={() => handleManualCheckin(student)}
                    disabled={isSubmitting}
                    className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5 shrink-0"
                  >
                    {isSubmitting ? (
                      <LoadingSpinner size="sm" />
                    ) : (
                      <>
                        <UserCheck className="w-3.5 h-3.5" />
                        Mark {manualStatus === 'present' ? 'Present' : 'Late'}
                      </>
                    )}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
