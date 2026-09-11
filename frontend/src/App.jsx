/**
 * App.jsx
 * =======
 * Main Application Routing and Context Container for Phase 7A.
 * Provides:
 *   - Supabase AuthProvider
 *   - React Router BrowserRouter
 *   - Public Landing, Login, Signup, and 403 pages
 *   - Protected layouts for Student, Mess Staff, and Warden portals
 *   - Placeholder views for sub-routes awaiting Phase 7B/7C/7D implementation
 */
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import {
  Camera,
  CalendarCheck,
  Wrench,
  Package,
  BookOpen,
  Terminal,
  Users,
  AlertTriangle,
  UserCheck
} from 'lucide-react'

import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/common/ProtectedRoute'
import RootLayout from './components/layouts/RootLayout'
import StudentLayout from './components/layouts/StudentLayout'
import MessLayout from './components/layouts/MessLayout'
import WardenLayout from './components/layouts/WardenLayout'
import PlaceholderView from './components/common/PlaceholderView'

// Pages
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import UnauthorizedPage from './pages/UnauthorizedPage'
import StudentDashboard from './pages/student/StudentDashboard'
import MessDashboard from './pages/mess/MessDashboard'
import WardenDashboard from './pages/warden/WardenDashboard'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />

          {/* Authenticated Root (Wraps global Navbar) */}
          <Route element={<RootLayout />}>
            {/* Student Portal */}
            <Route
              path="/student"
              element={<ProtectedRoute allowedRoles={['student']} />}
            >
              <Route element={<StudentLayout />}>
                <Route index element={<Navigate to="dashboard" replace />} />
                <Route path="dashboard" element={<StudentDashboard />} />
                <Route
                  path="enroll"
                  element={
                    <PlaceholderView
                      title="Face Biometric Enrollment"
                      subtitle="Capture webcam frames to train your MobileFaceNet embedding vector"
                      agentName="IRIS"
                      phase="Phase 7B"
                      icon={Camera}
                      accentColor="cyan"
                    />
                  }
                />
                <Route
                  path="attendance"
                  element={
                    <PlaceholderView
                      title="Personal Attendance History"
                      subtitle="View your daily gate scans, entry timestamps, and curfew compliance"
                      agentName="SENTINEL"
                      phase="Phase 7B"
                      icon={CalendarCheck}
                      accentColor="cyan"
                    />
                  }
                />
                <Route
                  path="complaints"
                  element={
                    <PlaceholderView
                      title="Submit & Track Complaints"
                      subtitle="Report hostel issues automatically classified & triaged by Groq LLM"
                      agentName="FIXR"
                      phase="Phase 7B"
                      icon={Wrench}
                      accentColor="rose"
                    />
                  }
                />
              </Route>
            </Route>

            {/* Mess Staff Portal */}
            <Route
              path="/mess"
              element={<ProtectedRoute allowedRoles={['mess_staff']} />}
            >
              <Route element={<MessLayout />}>
                <Route index element={<Navigate to="dashboard" replace />} />
                <Route path="dashboard" element={<MessDashboard />} />
                <Route
                  path="inventory"
                  element={
                    <PlaceholderView
                      title="Mess Stock & Inventory"
                      subtitle="Live ingredients inventory, stock status, and low-level alerts"
                      agentName="NOURISH"
                      phase="Phase 7C"
                      icon={Package}
                      accentColor="amber"
                    />
                  }
                />
                <Route
                  path="menu"
                  element={
                    <PlaceholderView
                      title="Weekly Mess Menu Upload"
                      subtitle="Upload menu PDF for automated Gemini multimodal parsing"
                      agentName="NOURISH"
                      phase="Phase 7C"
                      icon={BookOpen}
                      accentColor="amber"
                    />
                  }
                />
                <Route
                  path="command"
                  element={
                    <PlaceholderView
                      title="NLP Inventory Command Bar"
                      subtitle="Natural language voice and text input parsed into SQL stock actions"
                      agentName="NOURISH"
                      phase="Phase 7C"
                      icon={Terminal}
                      accentColor="amber"
                    />
                  }
                />
              </Route>
            </Route>

            {/* Warden / Admin Portal */}
            <Route
              path="/warden"
              element={<ProtectedRoute allowedRoles={['warden']} />}
            >
              <Route element={<WardenLayout />}>
                <Route index element={<Navigate to="dashboard" replace />} />
                <Route path="dashboard" element={<WardenDashboard />} />
                <Route
                  path="defaulters"
                  element={
                    <PlaceholderView
                      title="Hostel Defaulters Roster"
                      subtitle="Students who missed gate curfew or failed attendance windows"
                      agentName="SENTINEL"
                      phase="Phase 7D"
                      icon={Users}
                      accentColor="amber"
                    />
                  }
                />
                <Route
                  path="complaints"
                  element={
                    <PlaceholderView
                      title="Maintenance Ticket Management"
                      subtitle="Review, triage, and resolve student complaints prioritized by FIXR"
                      agentName="FIXR"
                      phase="Phase 7D"
                      icon={Wrench}
                      accentColor="rose"
                    />
                  }
                />
                <Route
                  path="anomalies"
                  element={
                    <PlaceholderView
                      title="HERALD Cross-Agent Anomaly Stream"
                      subtitle="Autonomous anomaly correlation for student well-being and security"
                      agentName="HERALD"
                      phase="Phase 7D"
                      icon={AlertTriangle}
                      accentColor="violet"
                    />
                  }
                />
                <Route
                  path="approvals"
                  element={
                    <PlaceholderView
                      title="Student Registration Approvals"
                      subtitle="Approve student accounts, assign roll numbers, and assign room slots"
                      agentName="ADMIN"
                      phase="Phase 7D"
                      icon={UserCheck}
                      accentColor="cyan"
                    />
                  }
                />
              </Route>
            </Route>
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
