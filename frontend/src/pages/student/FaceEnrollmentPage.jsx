/**
 * FaceEnrollmentPage.jsx
 * =======================
 * State-of-the-art Biometric Face Enrollment page for students.
 * Integrates directly with the IRIS Vision Agent (POST /iris/enroll).
 *
 * Features:
 *   - Live webcam video stream via WebRTC MediaDevices API
 *   - Futuristic biometric HUD / scanning reticle with animated laser sweep
 *   - 3-second countdown shutter with screen flash effect
 *   - Canvas snapshot extraction & Blob compression
 *   - Drag & drop passport photo upload fallback
 *   - Real-time feedback & validation from IRIS agent
 *   - Direct refresh of student's face enrollment profile
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Camera,
  Upload,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ShieldCheck,
  Eye,
  Info,
  Sun,
  Smile,
  Glasses
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { irisApi } from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'

export default function FaceEnrollmentPage() {
  const { user, studentProfile, refreshProfile } = useAuth()

  // Tab: 'webcam' | 'upload'
  const [activeTab, setActiveTab] = useState('webcam')

  // Webcam states
  const [streamActive, setStreamActive] = useState(false)
  const [cameraError, setCameraError] = useState(null)
  const [capturedBlob, setCapturedBlob] = useState(null)
  const [capturedPreview, setCapturedPreview] = useState(null)
  const [countdown, setCountdown] = useState(null)
  const [flashActive, setFlashActive] = useState(false)

  // Upload states
  const [uploadedFile, setUploadedFile] = useState(null)
  const [uploadedPreview, setUploadedPreview] = useState(null)

  // Submission / IRIS states
  const [submitting, setSubmitting] = useState(false)
  const [enrollResult, setEnrollResult] = useState(null)
  const [irisOnline, setIrisOnline] = useState(true)

  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const fileInputRef = useRef(null)

  // Check IRIS agent status
  useEffect(() => {
    irisApi
      .getStatus()
      .then(() => setIrisOnline(true))
      .catch(() => setIrisOnline(false))
  }, [])

  // Start webcam
  const startCamera = useCallback(async () => {
    setCameraError(null)
    setCapturedBlob(null)
    setCapturedPreview(null)
    setEnrollResult(null)

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access is not supported by your browser.')
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
      setStreamActive(true)
    } catch (err) {
      console.error('Camera access error:', err)
      setCameraError(
        err.name === 'NotAllowedError'
          ? 'Camera permission denied. Please allow camera access in browser settings.'
          : err.message || 'Could not initialize camera.'
      )
      setStreamActive(false)
    }
  }, [])

  // Stop webcam
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setStreamActive(false)
  }, [])

  // Handle active tab changes
  useEffect(() => {
    if (activeTab === 'webcam') {
      startCamera()
    } else {
      stopCamera()
    }
    return () => {
      stopCamera()
    }
  }, [activeTab, startCamera, stopCamera])

  // Trigger shutter capture with 3-second countdown
  const triggerCapture = () => {
    if (!videoRef.current || countdown !== null) return
    setCountdown(3)

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          performCanvasCapture()
          return null
        }
        return prev - 1
      })
    }, 900)
  }

  // Draw frame to canvas and export Blob
  const performCanvasCapture = () => {
    const video = videoRef.current
    if (!video) return

    // Flash effect
    setFlashActive(true)
    setTimeout(() => setFlashActive(false), 300)

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    const ctx = canvas.getContext('2d')

    // Horizontal mirror for natural front camera look
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    canvas.toBlob(
      (blob) => {
        if (blob) {
          setCapturedBlob(blob)
          const previewUrl = URL.createObjectURL(blob)
          setCapturedPreview(previewUrl)
        }
      },
      'image/jpeg',
      0.95
    )
  }

  // File upload change
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setEnrollResult({
        success: false,
        message: 'Please upload a JPEG, PNG, or WEBP image.',
      })
      return
    }

    setUploadedFile(file)
    setUploadedPreview(URL.createObjectURL(file))
    setEnrollResult(null)
  }

  // Submit enrollment to IRIS backend
  const handleEnrollSubmit = async () => {
    const studentId = user?.id
    if (!studentId) {
      setEnrollResult({
        success: false,
        message: 'Authentication error: student ID not found.',
      })
      return
    }

    const fileToUpload = activeTab === 'webcam' ? capturedBlob : uploadedFile
    if (!fileToUpload) {
      setEnrollResult({
        success: false,
        message: 'Please capture a frame or upload a photo first.',
      })
      return
    }

    setSubmitting(true)
    setEnrollResult(null)

    try {
      const formData = new FormData()
      formData.append('student_id', studentId)
      formData.append('mode', 'upload')
      formData.append(
        'image',
        fileToUpload,
        activeTab === 'webcam' ? 'face_capture.jpg' : uploadedFile.name
      )

      const response = await irisApi.enroll(formData)
      const data = response.data

      setEnrollResult({
        success: true,
        message: data.message || 'Face biometrics successfully enrolled and active!',
      })

      // Refresh student context
      if (refreshProfile) {
        await refreshProfile()
      }
    } catch (err) {
      console.error('Enrollment error:', err)
      setEnrollResult({
        success: false,
        message:
          err.detail ||
          err.response?.data?.detail ||
          'Face enrollment failed. Please ensure your face is well-lit and unobstructed.',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const isEnrolled = studentProfile?.is_face_enrolled

  return (
    <div className="animate-fade-in max-w-5xl mx-auto space-y-8 pb-12">
      {/* Flash overlay for shutter */}
      {flashActive && (
        <div className="fixed inset-0 z-50 bg-white pointer-events-none transition-opacity duration-300 opacity-90" />
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-widest text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-0.5 rounded-full">
              IRIS Vision Biometrics
            </span>
            <span
              className={`badge ${
                irisOnline ? 'badge-emerald' : 'badge-rose'
              } text-[11px]`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  irisOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
                }`}
              />
              {irisOnline ? 'Engine Online' : 'Engine Offline'}
            </span>
          </div>
          <h1 className="page-header">Biometric Face Enrollment</h1>
          <p className="page-subheader">
            Register your facial vector with IRIS for contactless gate curfew & mess entry verification.
          </p>
        </div>

        {/* Current Enrollment Status Pill */}
        <div
          className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl border ${
            isEnrolled
              ? 'bg-emerald-500/10 border-emerald-500/30'
              : 'bg-amber-500/10 border-amber-500/30'
          }`}
        >
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center ${
              isEnrolled
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'bg-amber-500/20 text-amber-400'
            }`}
          >
            {isEnrolled ? (
              <ShieldCheck className="w-5 h-5" />
            ) : (
              <AlertCircle className="w-5 h-5" />
            )}
          </div>
          <div>
            <p className="text-xs text-slate-400">Biometric Status</p>
            <p
              className={`text-sm font-semibold ${
                isEnrolled ? 'text-emerald-300' : 'text-amber-300'
              }`}
            >
              {isEnrolled ? 'Enrolled & Verified' : 'Action Required: Pending'}
            </p>
          </div>
        </div>
      </div>

      {/* Main interactive enrollment grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left column: Camera / Upload viewport (8 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Mode Switcher */}
          <div className="flex rounded-xl bg-slate-900/60 p-1 border border-white/[0.06]">
            <button
              onClick={() => setActiveTab('webcam')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'webcam'
                  ? 'bg-cyan-500 text-slate-950 shadow-glow-cyan'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Camera className="w-4 h-4" />
              Live Webcam Capture
            </button>
            <button
              onClick={() => setActiveTab('upload')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'upload'
                  ? 'bg-cyan-500 text-slate-950 shadow-glow-cyan'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Upload className="w-4 h-4" />
              Upload Passport Photo
            </button>
          </div>

          {/* Viewport Box */}
          <div className="relative rounded-3xl overflow-hidden glass border border-white/10 aspect-[4/3] bg-slate-950 flex items-center justify-center shadow-2xl">
            {activeTab === 'webcam' ? (
              <>
                {/* Countdown display */}
                {countdown !== null && (
                  <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 backdrop-blur-xs">
                    <span className="text-7xl font-black text-cyan-400 animate-ping-once drop-shadow-[0_0_25px_rgba(6,182,212,0.8)]">
                      {countdown}
                    </span>
                  </div>
                )}

                {/* Freeze frame preview if captured */}
                {capturedPreview ? (
                  <div className="relative w-full h-full">
                    <img
                      src={capturedPreview}
                      alt="Captured snapshot"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-4 left-4 z-20 badge badge-cyan">
                      Snapshot Frozen
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Live Video */}
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className={`w-full h-full object-cover transform -scale-x-100 ${
                        streamActive ? 'opacity-100' : 'opacity-0'
                      }`}
                    />

                    {/* Camera error message */}
                    {cameraError && (
                      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-6 text-center bg-slate-950/90">
                        <AlertCircle className="w-10 h-10 text-rose-400 mb-2" />
                        <p className="text-sm text-slate-300 font-medium max-w-sm mb-4">
                          {cameraError}
                        </p>
                        <button
                          onClick={startCamera}
                          className="btn-secondary text-xs px-4 py-2"
                        >
                          Retry Camera
                        </button>
                      </div>
                    )}

                    {/* Biometric HUD Overlay Reticle */}
                    {streamActive && !cameraError && (
                      <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center">
                        {/* Corner Reticles */}
                        <div className="relative w-64 h-72 rounded-3xl border border-cyan-400/40">
                          {/* Laser Sweep Animation */}
                          <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent animate-pulse-slow shadow-[0_0_12px_#22d3ee]" />

                          {/* Corner Markers */}
                          <span className="absolute -top-1 -left-1 w-6 h-6 border-t-2 border-l-2 border-cyan-400 rounded-tl-xl" />
                          <span className="absolute -top-1 -right-1 w-6 h-6 border-t-2 border-r-2 border-cyan-400 rounded-tr-xl" />
                          <span className="absolute -bottom-1 -left-1 w-6 h-6 border-b-2 border-l-2 border-cyan-400 rounded-bl-xl" />
                          <span className="absolute -bottom-1 -right-1 w-6 h-6 border-b-2 border-r-2 border-cyan-400 rounded-br-xl" />

                          {/* Center Target */}
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-16 h-16 rounded-full border border-cyan-500/30 flex items-center justify-center">
                              <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                            </div>
                          </div>
                        </div>

                        {/* Top Live Scan Tag */}
                        <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-[11px] text-cyan-300">
                          <Eye className="w-3.5 h-3.5 animate-pulse" />
                          IRIS Face Tracker Active
                        </div>

                        {/* Bottom Instruction */}
                        <div className="absolute bottom-4 inset-x-0 flex justify-center">
                          <div className="px-3.5 py-1.5 rounded-full bg-black/70 backdrop-blur-md border border-white/10 text-xs text-slate-300">
                            Position face inside reticle & look directly forward
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            ) : (
              /* Upload Tab Content */
              <div
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-full flex flex-col items-center justify-center p-8 text-center cursor-pointer hover:bg-white/[0.02] transition-all"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                />
                {uploadedPreview ? (
                  <div className="relative w-full h-full flex items-center justify-center">
                    <img
                      src={uploadedPreview}
                      alt="Upload preview"
                      className="max-h-full max-w-full rounded-2xl object-contain shadow-lg"
                    />
                    <div className="absolute bottom-3 right-3 badge badge-slate">
                      Click to replace
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center">
                    <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center mb-4">
                      <Upload className="w-7 h-7" />
                    </div>
                    <p className="text-sm font-semibold text-slate-200 mb-1">
                      Click to choose an image or drag & drop
                    </p>
                    <p className="text-xs text-slate-500 max-w-xs">
                      High-resolution JPG or PNG passport-style portrait.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action Bar Below Viewport */}
          <div className="flex items-center justify-between gap-3">
            {activeTab === 'webcam' ? (
              capturedPreview ? (
                <>
                  <button
                    onClick={() => {
                      setCapturedPreview(null)
                      setCapturedBlob(null)
                      setEnrollResult(null)
                    }}
                    className="btn-secondary flex-1 py-3 text-sm flex items-center justify-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Retake Photo
                  </button>
                  <button
                    onClick={handleEnrollSubmit}
                    disabled={submitting}
                    className="btn-primary flex-1 py-3 text-sm flex items-center justify-center gap-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold shadow-glow-cyan"
                  >
                    {submitting ? (
                      <LoadingSpinner size="sm" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    {submitting ? 'Extracting Embedding…' : 'Confirm & Enroll Face'}
                  </button>
                </>
              ) : (
                <button
                  onClick={triggerCapture}
                  disabled={!streamActive || countdown !== null}
                  className="btn-primary w-full py-3.5 text-sm flex items-center justify-center gap-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold shadow-glow-cyan disabled:opacity-50"
                >
                  <Camera className="w-4 h-4" />
                  Capture Snapshot (3s Countdown)
                </button>
              )
            ) : (
              <button
                onClick={handleEnrollSubmit}
                disabled={!uploadedFile || submitting}
                className="btn-primary w-full py-3.5 text-sm flex items-center justify-center gap-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold shadow-glow-cyan disabled:opacity-50"
              >
                {submitting ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  <ShieldCheck className="w-4 h-4" />
                )}
                {submitting ? 'Processing Face Embedding…' : 'Enroll Uploaded Photo'}
              </button>
            )}
          </div>

          {/* Result Alert Box */}
          {enrollResult && (
            <div
              className={`p-4 rounded-2xl border animate-slide-up flex items-start gap-3 ${
                enrollResult.success
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              {enrollResult.success ? (
                <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 shrink-0 text-rose-400 mt-0.5" />
              )}
              <div className="flex-1 text-xs">
                <p className="font-semibold text-sm mb-0.5">
                  {enrollResult.success
                    ? 'Biometrics Verified & Saved'
                    : 'Enrollment Error'}
                </p>
                <p>{enrollResult.message}</p>
              </div>
            </div>
          )}
        </div>

        {/* Right column: Enrollment specs & photo guidelines (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Identity Card */}
          <div className="card border border-cyan-500/20 p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 font-bold text-sm">
                  {studentProfile?.roll_no ? studentProfile.roll_no.slice(-2) : 'ST'}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-200">
                    {user?.user_metadata?.full_name || user?.email?.split('@')[0]}
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    Roll: {studentProfile?.roll_no || 'Pending Approval'} • Room: {studentProfile?.room_no || '—'}
                  </p>
                </div>
              </div>
              <span className="badge badge-cyan text-[10px]">Student</span>
            </div>

            <div className="space-y-2 text-xs text-slate-400">
              <div className="flex justify-between py-1 border-b border-white/[0.04]">
                <span>Vector Dimension</span>
                <span className="font-mono text-slate-300">512-d Float32</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/[0.04]">
                <span>Matching Engine</span>
                <span className="font-mono text-slate-300">MobileFaceNet ONNX</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/[0.04]">
                <span>Cosine Threshold</span>
                <span className="font-mono text-slate-300">0.55 similarity</span>
              </div>
              <div className="flex justify-between py-1">
                <span>Enrolled At</span>
                <span className="font-mono text-slate-300">
                  {studentProfile?.enrolled_at
                    ? new Date(studentProfile.enrolled_at).toLocaleDateString()
                    : 'Not yet'}
                </span>
              </div>
            </div>
          </div>

          {/* Golden Rules for Accurate Recognition */}
          <div className="card p-5 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Info className="w-4 h-4 text-cyan-400" />
              Guidelines for 99.8% Accuracy
            </h3>

            <div className="space-y-3">
              <div className="flex items-start gap-3 p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <Sun className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-slate-200">Bright, Even Lighting</p>
                  <p className="text-[11px] text-slate-500">
                    Avoid strong backlighting or glare. Face light sources directly.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <Smile className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-slate-200">Neutral Head Angle</p>
                  <p className="text-[11px] text-slate-500">
                    Look straight at the camera. Keep your head level without tilting.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <Glasses className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-slate-200">Unobstructed Face</p>
                  <p className="text-[11px] text-slate-500">
                    Remove sunglasses, caps, masks, or heavy scarves covering cheekbones.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
