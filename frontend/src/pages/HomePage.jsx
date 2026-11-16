/**
 * HomePage.jsx
 * ============
 * Distinctive Architectural / Monochromatic Landing Interface.
 * Enhanced with 3D Perspective Undulating Mesh Canvas & Autonomous Agent Network.
 */
import { Link, Navigate } from 'react-router-dom'
import {
  ArrowRight, Shield, Eye, Activity, Utensils, Wrench, Cpu,
  Check, ChevronRight, CornerDownRight, Binary, Orbit, ActivitySquare
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import LoadingSpinner from '../components/common/LoadingSpinner'
import BrandLogo from '../components/common/BrandLogo'
import MeshBackground from '../components/common/MeshBackground'

const AGENTS = [
  {
    code: 'AGT-01',
    id: 'IRIS',
    title: 'VISION / FACIAL RECOGNITION',
    desc: 'MobileFaceNet 512-d neural embeddings with ArcFace loss for high-accuracy biometric authentication at perimeter gates and dining terminals.',
    latency: '< 180ms',
    runtime: 'Local Inference / OpenCV',
  },
  {
    code: 'AGT-02',
    id: 'SENTINEL',
    title: 'CURFEW & GATE INTELLIGENCE',
    desc: 'Autonomous policy enforcement engine tracking access timestamps, boundary windows, and nightly defaulter lists without manual intervention.',
    latency: 'Realtime',
    runtime: 'APScheduler / PostgreSQL Vector',
  },
  {
    code: 'AGT-03',
    id: 'NOURISH',
    title: 'DINING LOGISTICS & PARSING',
    desc: 'Multimodal vision parser for mess menus combined with recipe-driven stock depletion and natural language inventory management.',
    latency: 'Adaptive',
    runtime: 'Google Gemini 1.5 Flash + Groq',
  },
  {
    code: 'AGT-04',
    id: 'FIXR',
    title: 'FACILITY MAINTENANCE DISPATCH',
    desc: 'Automated problem triage extracting categories, urgency weighting, and actionable service tickets directly from resident reports.',
    latency: 'Sub-second',
    runtime: 'Groq LLaMA-3 Structured JSON',
  },
  {
    code: 'AGT-05',
    id: 'HERALD',
    title: 'CROSS-AGENT ANOMALY ORCHESTRATOR',
    desc: 'Cross-correlates multi-agent telemetry (missed meals, gate absences, unresolved tickets) to generate actionable executive warden briefs.',
    latency: 'Batch',
    runtime: 'Heuristic Multi-Agent Sweep',
  },
]

const MODULES = [
  {
    role: 'student',
    path: '/student/dashboard',
    index: '01',
    title: 'RESIDENT PORTAL',
    desc: 'Biometric capture, gate access history, curfew countdown, and facility service desk.',
  },
  {
    role: 'mess_staff',
    path: '/mess/dashboard',
    index: '02',
    title: 'DINING OPERATIONS',
    desc: 'Contactless head count verification, ingredient stock audits, and menu ingestion.',
  },
  {
    role: 'warden',
    path: '/warden/dashboard',
    index: '03',
    title: 'WARDEN COMMAND',
    desc: 'Perimeter kiosk control, resident registration queue, and HERALD anomaly logs.',
  },
]

export default function HomePage() {
  const { isAuthenticated, loading, role, getRoleHome } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#080808]">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (isAuthenticated && role) {
    return <Navigate to={getRoleHome()} replace />
  }

  return (
    <div className="bg-[#080808] text-[#e0e0e0] min-h-screen flex flex-col font-sans relative selection:bg-white selection:text-black">
      {/* ── Top Header ──────────────────────────────────────────────────────── */}
      <header className="border-b border-[#222222] bg-[#0c0c0c]/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BrandLogo size={28} />
            <div className="flex items-baseline gap-2">
              <span className="font-bold text-white text-base tracking-widest font-mono uppercase">
                KINESIS<span className="text-[#888888]">/OS</span>
              </span>
              <span className="hidden sm:inline-block text-[11px] font-mono text-[#666666]">
                // FACILITY OPERATING ARCHITECTURE
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/login"
              id="home-login-btn"
              className="btn-primary text-xs"
            >
              Sign In <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero Section with 3D Canvas Background ─────────────────────────── */}
      <section className="relative px-4 sm:px-6 pt-16 sm:pt-24 pb-20 border-b border-[#222222] overflow-hidden min-h-[580px] flex items-center">
        {/* Interactive 3D Undulating Mesh & Agent Constellation Canvas */}
        <MeshBackground className="opacity-95" />

        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-center relative z-10 w-full">
          
          <div className="lg:col-span-8 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#141414]/90 backdrop-blur border border-[#333333] text-[11px] font-mono text-[#cccccc] uppercase tracking-wider">
              <span className="w-2 h-2 bg-white inline-block animate-pulse" />
              Autonomous Multi-Agent Architecture
            </div>

            <h1 className="text-3xl sm:text-6xl font-bold text-white tracking-tight leading-[1.08] uppercase drop-shadow-sm">
              Precision Facility Control & Perimeter Biometrics
            </h1>

            <p className="text-base sm:text-lg text-[#a8a8a8] max-w-2xl leading-relaxed font-light backdrop-blur-xs">
              An enterprise management platform powered by coordinated AI agents. Replaces disparate campus systems with unified facial recognition, automated curfew governance, dining logistics, and heuristic anomaly detection.
            </p>

            <div className="pt-2 flex flex-wrap items-center gap-3">
              <Link
                to="/login"
                className="btn-primary text-xs px-6 py-3 shadow-brutalist hover:shadow-none"
              >
                Access Command Console <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/signup"
                id="home-signup-btn"
                className="btn-secondary text-xs px-6 py-3 backdrop-blur-md"
              >
                Resident Registration
              </Link>
            </div>
          </div>

          {/* Technical Telemetry HUD box */}
          <div className="lg:col-span-4 bg-[#0e0e0e]/95 backdrop-blur-md border border-[#2b2b2b] p-5 space-y-4 font-mono text-xs shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#222222]">
              <span className="text-[#888888] tracking-widest uppercase text-[10px]">Active Infrastructure</span>
              <span className="text-white bg-[#1a1a1a] px-2 py-0.5 border border-[#333333] text-[10px]">STATUS: OK</span>
            </div>

            <div className="space-y-2 text-[11px]">
              <div className="flex justify-between py-1 border-b border-[#181818]">
                <span className="text-[#666666]">CORE ENGINE</span>
                <span className="text-white">FastAPI + Async Python</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#181818]">
                <span className="text-[#666666]">VECTOR DB</span>
                <span className="text-white">PostgreSQL pgvector (512-d)</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#181818]">
                <span className="text-[#666666]">VISION ENGINE</span>
                <span className="text-white">MobileFaceNet / ArcFace</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#181818]">
                <span className="text-[#666666]">ORCHESTRATION</span>
                <span className="text-white">HERALD Multi-Agent Sweeper</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-[#666666]">ACTIVE CLUSTERS</span>
                <span className="text-white">5 Micro-Agents Armed</span>
              </div>
            </div>

            <div className="pt-3 border-t border-[#222222] flex items-center justify-between text-[10px] text-[#777777]">
              <span>NODE-ID: KNX-0824</span>
              <span>UPTIME: 99.98%</span>
            </div>
          </div>

        </div>
      </section>

      {/* ── Operational Modules (Grid) ───────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-14 w-full relative z-10">
        <div className="mb-8 flex items-baseline justify-between border-b border-[#222222] pb-3">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-widest text-[#777777]">Direct Routing</span>
            <h2 className="text-lg font-bold text-white tracking-tight uppercase mt-0.5">Facility Operating Modules</h2>
          </div>
          <span className="text-xs font-mono text-[#666666] hidden sm:inline">[SELECT USER CLEARANCE]</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {MODULES.map(({ path, title, desc, index, role: mRole }) => (
            <Link
              key={path}
              to="/login"
              state={{ redirect: path }}
              className="bg-[#0e0e0e] border border-[#242424] hover:border-[#666666] p-6 transition-all group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="font-mono text-xs font-semibold text-[#666666] group-hover:text-white transition-colors">
                    [{index}]
                  </span>
                  <span className="font-mono text-[10px] uppercase px-2 py-0.5 bg-[#171717] border border-[#2b2b2b] text-[#aaaaaa]">
                    /{mRole}
                  </span>
                </div>

                <h3 className="text-base font-bold text-white tracking-tight uppercase group-hover:underline">
                  {title}
                </h3>
                <p className="text-xs text-[#8c8c8c] mt-2 leading-relaxed">
                  {desc}
                </p>
              </div>

              <div className="mt-8 pt-4 border-t border-[#1c1c1c] flex items-center justify-between text-xs font-mono text-[#777777] group-hover:text-white transition-colors">
                <span>ENTER CLEARANCE</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Multi-Agent Architecture Matrix ─────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-20 w-full relative z-10">
        <div className="mb-8 flex items-baseline justify-between border-b border-[#222222] pb-3">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-widest text-[#777777]">Telemetry & Fleet</span>
            <h2 className="text-lg font-bold text-white tracking-tight uppercase mt-0.5">Autonomous Agent Specifications</h2>
          </div>
          <span className="text-xs font-mono text-[#999999]">5/5 REPORTEES ARMED</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {AGENTS.map(({ code, id, title, desc, latency, runtime }) => (
            <div
              key={id}
              className="bg-[#0e0e0e] border border-[#242424] p-5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-[#1c1c1c] mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-white inline-block" />
                    <span className="font-mono font-bold text-sm text-white tracking-wider">{id}</span>
                  </div>
                  <span className="font-mono text-[10px] text-[#777777]">{code}</span>
                </div>

                <h4 className="text-[11px] font-mono font-semibold text-[#aaaaaa] uppercase tracking-wider mb-2">
                  {title}
                </h4>
                <p className="text-xs text-[#888888] leading-relaxed">
                  {desc}
                </p>
              </div>

              <div className="mt-6 pt-3 border-t border-[#1a1a1a] space-y-1 font-mono text-[10px]">
                <div className="flex justify-between text-[#666666]">
                  <span>RESPONSE LATENCY</span>
                  <span className="text-[#cccccc]">{latency}</span>
                </div>
                <div className="flex justify-between text-[#666666]">
                  <span>SUB-SYSTEM</span>
                  <span className="text-[#999999] truncate max-w-[150px]">{runtime}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Monochromatic Architectural Footer ───────────────────────────────── */}
      <footer className="mt-auto border-t border-[#222222] bg-[#0a0a0a] py-8 text-xs font-mono text-[#666666] relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <BrandLogo size={20} />
            <span>KINESIS / HOSTELOS ENTERPRISE PLATFORM // {new Date().getFullYear()}</span>
          </div>
          <div className="flex items-center gap-4 text-[#888888]">
            <span>FACILITY OPS</span>
            <span>•</span>
            <span>BIOMETRICS</span>
            <span>•</span>
            <span>GOVERNANCE</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
