/**
 * MessKioskPage.jsx — NOURISH Dining Hall Kiosk & Head Count Engine
 * =================================================================
 * Real-time contactless biometric scanner at the hostel mess dining gate.
 * Features:
 *   - Continuous / 1-Click Face Scan via IRIS -> NOURISH pipeline
 *   - Ground-truth Head Count incrementing in real-time
 *   - Duplicate meal check-in prevention (cannot eat twice per meal)
 *   - Unknown person entry rejection
 *   - Web Audio acoustic feedback chimes (allowed vs warning vs denied)
 *   - Active Meal Selector (Auto-Detect or manual session override)
 *   - Real-time Check-in Activity Feed
 *   - Manual Roll No Search & Check-in fallback
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Camera, Eye, CheckCircle2, AlertTriangle, ShieldAlert,
  RefreshCw, Sparkles, Clock, Users, Search, Volume2, VolumeX,
  Maximize2, Minimize2, Utensils, UserCheck, Flame, Moon, Sun
} from 'lucide-react'
import { irisApi, nourishApi, wardenApi } from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'

// Synthesize audio feedback via Web Audio API
function playChime(type = 'success') {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!AudioContext) return
    const ctx = new AudioContext()

    if (type === 'success') {
      // Pleasant two-tone chime (F5 -> C6)
      const now = ctx.currentTime
      const osc1 = ctx.createOscillator()
      const gain = ctx.createGain()

      osc1.type = 'sine'
      osc1.frequency.setValueAtTime(698.46, now)        // F5
      osc1.frequency.setValueAtTime(1046.50, now + 0.12) // C6

      gain.gain.setValueAtTime(0.2, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5)

      osc1.connect(gain)
      gain.connect(ctx.destination)

      osc1.start(now)
      osc1.stop(now + 0.5)
    } else if (type === 'warning') {
      // Mid warning tone for duplicate entry
      const now = ctx.currentTime
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'triangle'
      osc.frequency.setValueAtTime(440, now)
      osc.frequency.setValueAtTime(370, now + 0.15)

      gain.gain.setValueAtTime(0.25, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(now)
      osc.stop(now + 0.45)
    } else {
      // Low dual rejection buzz
      const now = ctx.currentTime
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(140, now)

      gain.gain.setValueAtTime(0.3, now)
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

export default function MessKioskPage() {
  // Tabs: 'kiosk' (scanner) | 'manual' (search check-in)
  const [activeTab, setActiveTab] = useState('kiosk')

  // Meal selection: 'auto' | 'breakfast' | 'lunch' | 'dinner'
  const [selectedMeal, setSelectedMeal] = useState('auto')
  const [detectedMeal, setDetectedMeal] = useState('lunch')

  // Webcam states
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [autoScan, setAutoScan] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Last scan result
  const [lastScanResult, setLastScanResult] = useState(null)
  const [flashActive, setFlashActive] = useState(false)

  // Live counts & today's entries
  const [headCounts, setHeadCounts] = useState({
    breakfast: 0,
    lunch: 0,
    dinner: 0,
    total: 0,
  })
  const [recentEntries, setRecentEntries] = useState([])
  const [loadingEntries, setLoadingEntries] = useState(true)

  // Manual fallback search
  const [studentsList, setStudentsList] = useState([])
  const [manualSearch, setManualSearch] = useState('')
  const [manualSubmitting, setManualSubmitting] = useState({})

  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const autoScanTimerRef = useRef(null)

  // Effective meal in operation
  const currentMealType = selectedMeal === 'auto' ? detectedMeal : selectedMeal

  // 1. Fetch live entries & head counts
  const loadKioskData = useCallback(async () => {
    try {
      const [entriesRes, statusRes] = await Promise.all([
        nourishApi.getEntries().catch(() => ({ data: null })),
        nourishApi.getStatus().catch(() => ({ data: null })),
      ])

      if (statusRes.data?.current_meal) {
        setDetectedMeal(statusRes.data.current_meal)
      }

      if (entriesRes.data?.success) {
        const bm = entriesRes.data.by_meal || {}
        const bCount = bm.breakfast?.count ?? bm.breakfast?.total ?? 0
        const lCount = bm.lunch?.count ?? bm.lunch?.total ?? 0
        const dCount = bm.dinner?.count ?? bm.dinner?.total ?? 0

        setHeadCounts({
          breakfast: bCount,
          lunch: lCount,
          dinner: dCount,
          total: bCount + lCount + dCount,
        })
      }

      // Load recent scans for active meal
      const meal = selectedMeal === 'auto' ? (statusRes.data?.current_meal || 'lunch') : selectedMeal
      const listRes = await nourishApi.getMealEntries(meal, null, 25, 0).catch(() => ({ data: null }))
      if (listRes.data?.success) {
        setRecentEntries(listRes.data.entries || [])
      }
    } catch (err) {
      console.error('Error loading mess kiosk data:', err)
    } finally {
      setLoadingEntries(false)
    }
  }, [selectedMeal])

  useEffect(() => {
    loadKioskData()
    const interval = setInterval(loadKioskData, 10000)
    return () => clearInterval(interval)
  }, [loadKioskData])

  // Load students for manual fallback
  useEffect(() => {
    async function fetchStudents() {
      try {
        const res = await wardenApi.getApprovedStudents().catch(() => ({ data: null }))
        if (res.data?.students) {
          setStudentsList(res.data.students)
        }
      } catch (err) {
        console.error('Error loading students list for fallback:', err)
      }
    }
    fetchStudents()
  }, [])

  // 2. Camera Start / Stop Lifecycle
  const startCamera = useCallback(async () => {
    setCameraError(null)
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
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
      }
      setCameraActive(true)
    } catch (err) {
      console.error('Camera access failed:', err)
      setCameraError(err.message || 'Could not start webcam. Please grant camera permission.')
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

  // 3. Process Face Recognition & Mess Check-in
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

      // Prepare payload for IRIS
      const formData = new FormData()
      formData.append('location', 'mess')
      formData.append('mode', 'upload')
      formData.append('image', blob, 'mess_kiosk_scan.jpg')

      // 1. Call IRIS /iris/recognize
      const recognizeRes = await irisApi.recognizeFace(formData)
      const irisEvent = recognizeRes.data

      if (!irisEvent || !irisEvent.recognized) {
        if (soundEnabled) playChime('error')
        // Log unrecognised event to NOURISH
        await nourishApi.sendMessEvent({
          recognized: false,
          location: 'mess',
          meal_type: currentMealType,
        }).catch(() => {})

        setLastScanResult({
          recognized: false,
          allowed: false,
          error: irisEvent?.error || 'Face not recognized. Student not enrolled or invalid face angle.',
          timestamp: new Date().toLocaleTimeString(),
        })
        loadKioskData()
        return
      }

      // 2. Student recognized! Forward identity event to NOURISH
      const messPayload = {
        ...irisEvent,
        location: 'mess',
        meal_type: currentMealType,
      }
      const messRes = await nourishApi.sendMessEvent(messPayload)
      const nourishResult = messRes.data

      if (nourishResult?.allowed) {
        if (soundEnabled) playChime('success')
      } else if (nourishResult?.already_entered) {
        if (soundEnabled) playChime('warning')
      } else {
        if (soundEnabled) playChime('error')
      }

      setLastScanResult({
        recognized: true,
        allowed: Boolean(nourishResult?.allowed),
        already_entered: Boolean(nourishResult?.already_entered),
        student_id: irisEvent.student_id,
        name: irisEvent.student_name,
        roll_no: irisEvent.roll_no,
        room_no: irisEvent.room_no,
        confidence: irisEvent.confidence,
        meal_type: nourishResult?.meal_type || currentMealType,
        message: nourishResult?.reason || 'Meal check-in processed.',
        timestamp: new Date().toLocaleTimeString(),
      })

      // Refresh today's logs & head counts immediately
      loadKioskData()
    } catch (err) {
      console.error('Mess scan error:', err)
      if (soundEnabled) playChime('error')
      setLastScanResult({
        recognized: false,
        allowed: false,
        error: err?.response?.data?.detail || err?.detail || err?.message || 'Biometric scan error occurred.',
        timestamp: new Date().toLocaleTimeString(),
      })
    } finally {
      setScanning(false)
    }
  }, [cameraActive, scanning, soundEnabled, currentMealType, loadKioskData])

  // Spacebar hotkey to scan
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.code === 'Space' && activeTab === 'kiosk' && !scanning) {
        e.preventDefault()
        performScan()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [performScan, activeTab, scanning])

  // Auto-scan timer loop
  useEffect(() => {
    if (autoScan && cameraActive && !scanning) {
      autoScanTimerRef.current = setTimeout(() => {
        performScan()
      }, 3500)
    }
    return () => clearTimeout(autoScanTimerRef.current)
  }, [autoScan, cameraActive, scanning, performScan, lastScanResult])

  // Manual Check-in Handler
  const handleManualCheckin = async (student) => {
    setManualSubmitting((prev) => ({ ...prev, [student.id]: true }))
    try {
      const payload = {
        recognized: true,
        student_id: student.id,
        student_name: student.name,
        roll_no: student.roll_no,
        room_no: student.room_no,
        location: 'mess',
        meal_type: currentMealType,
      }
      const res = await nourishApi.sendMessEvent(payload)
      const data = res.data

      if (data?.allowed) {
        if (soundEnabled) playChime('success')
      } else if (data?.already_entered) {
        if (soundEnabled) playChime('warning')
      } else {
        if (soundEnabled) playChime('error')
      }

      setLastScanResult({
        recognized: true,
        allowed: Boolean(data?.allowed),
        already_entered: Boolean(data?.already_entered),
        student_id: student.id,
        name: student.name,
        roll_no: student.roll_no,
        room_no: student.room_no,
        meal_type: data?.meal_type || currentMealType,
        message: data?.reason || 'Manual entry processed.',
        timestamp: new Date().toLocaleTimeString(),
      })

      loadKioskData()
    } catch (err) {
      console.error('Manual checkin error:', err)
      if (soundEnabled) playChime('error')
      setLastScanResult({
        recognized: false,
        allowed: false,
        error: err?.response?.data?.detail || 'Manual check-in failed.',
        timestamp: new Date().toLocaleTimeString(),
      })
    } finally {
      setManualSubmitting((prev) => ({ ...prev, [student.id]: false }))
    }
  }

  // Filtered manual students list
  const filteredStudents = studentsList.filter((s) => {
    const q = manualSearch.toLowerCase().trim()
    if (!q) return true
    return (
      s.name?.toLowerCase().includes(q) ||
      s.roll_no?.toLowerCase().includes(q) ||
      s.room_no?.toLowerCase().includes(q)
    )
  })

  return (
    <div className={`space-y-6 animate-fade-in ${isFullscreen ? 'fixed inset-0 z-50 bg-slate-950 p-6 overflow-y-auto' : ''}`}>
      {/* ── Header & Head Count Summary Bar ────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-white/[0.06]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="badge badge-amber text-xs font-semibold">
              <Utensils className="w-3.5 h-3.5" />
              NOURISH Dining Hall Entry Kiosk
            </span>
            <span className="badge badge-emerald text-[11px] animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              Live Biometrics
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-100 flex items-center gap-2">
            Dining Gate Attendance & Head Count
          </h1>
          <p className="text-xs sm:text-sm text-slate-400">
            Real-time face verification • Double-dip prevention • Automated head-count tally
          </p>
        </div>

        {/* Live Head Count Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
          <div className={`p-2.5 rounded-xl border transition-all ${currentMealType === 'breakfast' ? 'bg-amber-500/15 border-amber-500/40 shadow-glow-amber' : 'bg-slate-900/60 border-white/[0.06]'}`}>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium">
              <Sun className="w-3.5 h-3.5 text-amber-400" />
              Breakfast
            </div>
            <p className="text-lg font-bold text-slate-100 font-mono mt-0.5">{headCounts.breakfast}</p>
          </div>

          <div className={`p-2.5 rounded-xl border transition-all ${currentMealType === 'lunch' ? 'bg-amber-500/15 border-amber-500/40 shadow-glow-amber' : 'bg-slate-900/60 border-white/[0.06]'}`}>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium">
              <Flame className="w-3.5 h-3.5 text-orange-400" />
              Lunch
            </div>
            <p className="text-lg font-bold text-slate-100 font-mono mt-0.5">{headCounts.lunch}</p>
          </div>

          <div className={`p-2.5 rounded-xl border transition-all ${currentMealType === 'dinner' ? 'bg-amber-500/15 border-amber-500/40 shadow-glow-amber' : 'bg-slate-900/60 border-white/[0.06]'}`}>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium">
              <Moon className="w-3.5 h-3.5 text-indigo-400" />
              Dinner
            </div>
            <p className="text-lg font-bold text-slate-100 font-mono mt-0.5">{headCounts.dinner}</p>
          </div>

          <div className="p-2.5 rounded-xl border bg-emerald-500/10 border-emerald-500/25">
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium">
              <Users className="w-3.5 h-3.5" />
              Total Today
            </div>
            <p className="text-lg font-bold text-emerald-300 font-mono mt-0.5">{headCounts.total}</p>
          </div>
        </div>
      </div>

      {/* ── Active Session Selector & View Controls ───────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-slate-900/40 border border-white/[0.06]">
        {/* Meal Session Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-medium">Active Session:</span>
          <div className="flex rounded-lg bg-slate-950/80 p-1 border border-white/[0.06] text-xs">
            <button
              onClick={() => setSelectedMeal('auto')}
              className={`px-3 py-1 rounded-md transition-all font-medium ${selectedMeal === 'auto' ? 'bg-amber-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Auto ({detectedMeal})
            </button>
            <button
              onClick={() => setSelectedMeal('breakfast')}
              className={`px-3 py-1 rounded-md transition-all font-medium ${selectedMeal === 'breakfast' ? 'bg-amber-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Breakfast
            </button>
            <button
              onClick={() => setSelectedMeal('lunch')}
              className={`px-3 py-1 rounded-md transition-all font-medium ${selectedMeal === 'lunch' ? 'bg-amber-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Lunch
            </button>
            <button
              onClick={() => setSelectedMeal('dinner')}
              className={`px-3 py-1 rounded-md transition-all font-medium ${selectedMeal === 'dinner' ? 'bg-amber-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Dinner
            </button>
          </div>
        </div>

        {/* Tab switch & Kiosk Tools */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('kiosk')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${activeTab === 'kiosk' ? 'bg-white/10 text-slate-100 border border-white/20' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <Camera className="w-3.5 h-3.5 text-amber-400" />
            Biometric Scanner
          </button>
          <button
            onClick={() => setActiveTab('manual')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${activeTab === 'manual' ? 'bg-white/10 text-slate-100 border border-white/20' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <Search className="w-3.5 h-3.5 text-blue-400" />
            Manual Fallback
          </button>

          <div className="h-4 w-px bg-white/10 mx-1"></div>

          <button
            onClick={() => setSoundEnabled((v) => !v)}
            title={soundEnabled ? 'Mute audio chimes' : 'Enable audio chimes'}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 bg-white/5 border border-white/10 text-xs"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
          </button>

          <button
            onClick={() => setIsFullscreen((v) => !v)}
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Kiosk Mode'}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 bg-white/5 border border-white/10 text-xs"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* ── Main Layout: Scanner vs Manual Check-in ───────────────────── */}
      {activeTab === 'kiosk' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Webcam Viewport & Controls (7 Cols) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="card p-4 relative overflow-hidden bg-slate-950/80 border border-white/[0.08] shadow-2xl rounded-2xl">
              {/* Flash feedback animation */}
              {flashActive && (
                <div className="absolute inset-0 bg-white/40 z-30 pointer-events-none transition-opacity duration-200 animate-pulse"></div>
              )}

              {/* Viewport Frame */}
              <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-slate-900 border border-white/10 flex items-center justify-center">
                {cameraActive ? (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover transform -scale-x-100"
                  />
                ) : (
                  <div className="text-center p-6 space-y-3">
                    <Camera className="w-12 h-12 text-slate-600 mx-auto" />
                    <p className="text-sm text-slate-400 font-medium">Camera offline or permission needed</p>
                    <button
                      onClick={startCamera}
                      className="btn-primary py-2 px-4 text-xs bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold"
                    >
                      Start Camera
                    </button>
                  </div>
                )}

                {/* Animated Biometric Reticle Overlay */}
                {cameraActive && (
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    {/* Corner Reticle Brackets */}
                    <div className="w-64 h-64 relative border border-amber-500/20 rounded-3xl">
                      <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-amber-400 rounded-tl-xl"></div>
                      <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-amber-400 rounded-tr-xl"></div>
                      <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-amber-400 rounded-bl-xl"></div>
                      <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-amber-400 rounded-br-xl"></div>

                      {/* Continuous laser scanline when scanning */}
                      {scanning && (
                        <div className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-amber-400 to-transparent shadow-[0_0_15px_#f59e0b] animate-[bounce_1.5s_infinite]"></div>
                      )}
                    </div>
                  </div>
                )}

                {/* Top Badge: Target Session */}
                <div className="absolute top-3 left-3 bg-slate-950/80 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 flex items-center gap-2 text-xs font-mono text-slate-200">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
                  SESSION: <span className="uppercase text-amber-400 font-bold">{currentMealType}</span>
                </div>

                {/* Auto Scan Indicator */}
                {autoScan && (
                  <div className="absolute top-3 right-3 bg-emerald-500/20 backdrop-blur-md border border-emerald-500/40 text-emerald-300 px-2.5 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    Auto-Scanning Active
                  </div>
                )}
              </div>

              {/* Error banner */}
              {cameraError && (
                <div className="p-3 mt-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                  {cameraError}
                </div>
              )}

              {/* Action Buttons Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
                <div className="flex items-center gap-2">
                  <button
                    onClick={performScan}
                    disabled={!cameraActive || scanning}
                    className="btn-primary py-2.5 px-6 text-sm flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-glow-amber disabled:opacity-50"
                  >
                    {scanning ? <LoadingSpinner size="sm" /> : <Eye className="w-4 h-4" />}
                    {scanning ? 'Verifying Face…' : 'Scan Face (Space)'}
                  </button>

                  <button
                    onClick={() => setAutoScan((v) => !v)}
                    disabled={!cameraActive}
                    className={`py-2 px-3.5 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 ${autoScan ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'}`}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${autoScan ? 'animate-spin' : ''}`} />
                    {autoScan ? 'Stop Auto-Scan' : 'Enable Auto-Scan'}
                  </button>
                </div>

                <span className="text-[11px] text-slate-500 font-mono">
                  Press Spacebar or look at camera
                </span>
              </div>
            </div>

            {/* ── Real-Time Scan Result Hero Card ────────────────────────── */}
            {lastScanResult && (
              <div
                className={`p-5 rounded-2xl border transition-all animate-slide-up ${
                  lastScanResult.allowed
                    ? 'bg-emerald-500/10 border-emerald-500/40 shadow-glow-emerald'
                    : lastScanResult.already_entered
                    ? 'bg-amber-500/10 border-amber-500/40 shadow-glow-amber'
                    : 'bg-rose-500/10 border-rose-500/40'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <div
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border ${
                        lastScanResult.allowed
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                          : lastScanResult.already_entered
                          ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                          : 'bg-rose-500/20 border-rose-500/40 text-rose-400'
                      }`}
                    >
                      {lastScanResult.allowed ? (
                        <CheckCircle2 className="w-7 h-7" />
                      ) : lastScanResult.already_entered ? (
                        <AlertTriangle className="w-7 h-7" />
                      ) : (
                        <ShieldAlert className="w-7 h-7" />
                      )}
                    </div>

                    <div>
                      {lastScanResult.recognized ? (
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-base font-bold text-slate-100">
                              {lastScanResult.name}
                            </h3>
                            <span
                              className={`badge text-[11px] font-bold ${
                                lastScanResult.allowed
                                  ? 'badge-emerald'
                                  : lastScanResult.already_entered
                                  ? 'badge-amber'
                                  : 'badge-rose'
                              }`}
                            >
                              {lastScanResult.allowed
                                ? 'ENTRY GRANTED'
                                : lastScanResult.already_entered
                                ? 'ALREADY ENTERED'
                                : 'DENIED'}
                            </span>
                          </div>

                          <p className="text-xs text-slate-400 font-mono mt-0.5">
                            Roll: <span className="text-slate-200">{lastScanResult.roll_no}</span> • Room: <span className="text-slate-200">{lastScanResult.room_no}</span>
                            {lastScanResult.confidence && ` • Conf: ${(lastScanResult.confidence * 100).toFixed(1)}%`}
                          </p>

                          <p
                            className={`text-xs mt-2 font-medium ${
                              lastScanResult.allowed
                                ? 'text-emerald-300'
                                : lastScanResult.already_entered
                                ? 'text-amber-300'
                                : 'text-rose-300'
                            }`}
                          >
                            {lastScanResult.message}
                          </p>
                        </div>
                      ) : (
                        <div>
                          <h3 className="text-base font-bold text-rose-300">
                            Face Not Recognized
                          </h3>
                          <p className="text-xs text-rose-400/80 mt-1">
                            {lastScanResult.error}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  <span className="text-[11px] font-mono text-slate-500 shrink-0">
                    {lastScanResult.timestamp}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* ── Today's Check-in Feed Table (5 Cols) ───────────────────── */}
          <div className="lg:col-span-5 space-y-4">
            <div className="card p-4 space-y-3 bg-slate-950/80 border border-white/[0.08] rounded-2xl h-[560px] flex flex-col">
              <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                <div>
                  <h3 className="text-sm font-bold text-slate-200 flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-amber-400" />
                    Live Dining Log ({currentMealType})
                  </h3>
                  <span className="text-xs text-slate-500 font-mono">
                    {recentEntries.length} record(s) logged
                  </span>
                </div>

                <button
                  onClick={loadKioskData}
                  className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-slate-200 text-xs"
                  title="Refresh activity logs"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Feed items list */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                {loadingEntries ? (
                  <div className="py-12 flex justify-center">
                    <LoadingSpinner size="md" />
                  </div>
                ) : recentEntries.length === 0 ? (
                  <div className="py-16 text-center text-slate-500 space-y-2">
                    <Utensils className="w-8 h-8 mx-auto opacity-30" />
                    <p className="text-xs">No check-ins recorded for this session yet.</p>
                  </div>
                ) : (
                  recentEntries.map((item) => (
                    <div
                      key={item.id}
                      className="p-2.5 rounded-xl bg-slate-900/60 border border-white/[0.04] flex items-center justify-between gap-3 text-xs hover:border-white/10 transition-all"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 font-bold text-[11px] ${
                            item.is_recognized
                              ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                              : 'bg-rose-500/15 border border-rose-500/30 text-rose-400'
                          }`}
                        >
                          {item.students?.name ? item.students.name[0] : '?'}
                        </div>

                        <div className="min-w-0">
                          <p className="font-semibold text-slate-200 truncate">
                            {item.students?.name || (item.is_recognized ? 'Verified Resident' : 'Unknown Person')}
                          </p>
                          <p className="text-[10px] text-slate-400 font-mono">
                            {item.students?.roll_no ? `${item.students.roll_no} • Room ${item.students.room_no}` : 'No enrollment record'}
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span
                          className={`badge text-[10px] py-0.5 px-2 ${
                            item.is_recognized ? 'badge-emerald' : 'badge-rose'
                          }`}
                        >
                          {item.is_recognized ? 'Allowed' : 'Denied'}
                        </span>
                        <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                          {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ── Manual Fallback Search & Check-in ───────────────────────── */
        <div className="card p-6 space-y-5 bg-slate-950/80 border border-white/[0.08] rounded-2xl animate-fade-in">
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Search className="w-4 h-4 text-amber-400" />
              Manual Dining Entry Fallback
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              If a student is having trouble with camera scan or biometric angle, look them up and grant manual meal access.
            </p>
          </div>

          <div className="relative max-w-md">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search by student name, roll number, or room..."
              value={manualSearch}
              onChange={(e) => setManualSearch(e.target.value)}
              className="input-field pl-10 text-xs w-full"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-white/[0.02] border-b border-white/[0.06] text-slate-400 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-2.5 px-4">Student</th>
                  <th className="py-2.5 px-4">Roll Number</th>
                  <th className="py-2.5 px-4">Room</th>
                  <th className="py-2.5 px-4">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="py-8 text-center text-slate-500">
                      No matching student found.
                    </td>
                  </tr>
                ) : (
                  filteredStudents.slice(0, 15).map((student) => (
                    <tr key={student.id} className="hover:bg-white/[0.02]">
                      <td className="py-3 px-4 font-semibold text-slate-100">
                        {student.name}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-300">
                        {student.roll_no}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-400">
                        {student.room_no}
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => handleManualCheckin(student)}
                          disabled={manualSubmitting[student.id]}
                          className="btn-primary py-1.5 px-3.5 text-xs bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold disabled:opacity-50"
                        >
                          {manualSubmitting[student.id] ? (
                            <LoadingSpinner size="sm" />
                          ) : (
                            `Allow Entry (${currentMealType})`
                          )}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

