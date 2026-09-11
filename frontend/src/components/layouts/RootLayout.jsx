/**
 * RootLayout.jsx
 * Base layout that wraps all authenticated pages.
 * Includes the global Navbar above the page content.
 */
import { Outlet } from 'react-router-dom'
import Navbar from '../common/Navbar'

export default function RootLayout() {
  return (
    <div className="bg-hostel min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 w-full">
        <Outlet />
      </main>
    </div>
  )
}
