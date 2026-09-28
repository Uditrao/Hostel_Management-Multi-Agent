/**
 * App.jsx
 * =======
 * Main Application Routing — Phase 7D Complete.
 * All role portals (Student, Mess, Warden) are fully wired to live backend agents.
 */
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'

import ProtectedRoute from './components/common/ProtectedRoute'
import RootLayout from './components/layouts/RootLayout'
import StudentLayout from './components/layouts/StudentLayout'
import MessLayout from './components/layouts/MessLayout'
import WardenLayout from './components/layouts/WardenLayout'

// Pages
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import UnauthorizedPage from './pages/UnauthorizedPage'
import StudentDashboard from './pages/student/StudentDashboard'
import FaceEnrollmentPage from './pages/student/FaceEnrollmentPage'
import AttendancePage from './pages/student/AttendancePage'
import ComplaintsPage from './pages/student/ComplaintsPage'
import MessDashboard from './pages/mess/MessDashboard'
import InventoryPage from './pages/mess/InventoryPage'
import MenuUploadPage from './pages/mess/MenuUploadPage'
import NlpCommandPage from './pages/mess/NlpCommandPage'
import WardenDashboard        from './pages/warden/WardenDashboard'
import GateKioskPage          from './pages/warden/GateKioskPage'
import ApprovalsPage         from './pages/warden/ApprovalsPage'
import DefaultersPage        from './pages/warden/DefaultersPage'
import WardenComplaintsPage  from './pages/warden/WardenComplaintsPage'
import AnomaliesPage         from './pages/warden/AnomaliesPage'

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
                <Route path="enroll" element={<FaceEnrollmentPage />} />
                <Route path="attendance" element={<AttendancePage />} />
                <Route path="complaints" element={<ComplaintsPage />} />
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
                <Route path="inventory" element={<InventoryPage />} />
                <Route path="menu" element={<MenuUploadPage />} />
                <Route path="command" element={<NlpCommandPage />} />
              </Route>
            </Route>

            {/* Warden / Admin Portal */}
            <Route
              path="/warden"
              element={<ProtectedRoute allowedRoles={['warden']} />}
            >
              <Route element={<WardenLayout />}>
                <Route index element={<Navigate to="dashboard" replace />} />
                <Route path="dashboard"  element={<WardenDashboard />} />
                <Route path="kiosk"      element={<GateKioskPage />} />
                <Route path="approvals"  element={<ApprovalsPage />} />
                <Route path="defaulters" element={<DefaultersPage />} />
                <Route path="complaints" element={<WardenComplaintsPage />} />
                <Route path="anomalies"  element={<AnomaliesPage />} />
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
