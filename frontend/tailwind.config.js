/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        // Base surfaces
        surface: {
          DEFAULT: 'rgba(15, 23, 42, 0.85)',
          card:    'rgba(30, 41, 59, 0.70)',
          hover:   'rgba(30, 41, 59, 0.90)',
          border:  'rgba(255, 255, 255, 0.08)',
        },
        // Accent — Warden / Primary
        violet: {
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
        },
        // NOURISH accent — Emerald
        emerald: {
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
        },
        // SENTINEL / IRIS accent — Cyan
        cyan: {
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
        },
        // FIXR accent — Rose
        rose: {
          400: '#fb7185',
          500: '#f43f5e',
          600: '#e11d48',
        },
        // Amber — Mess Staff
        amber: {
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'grid-pattern': "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%236366f1' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
      },
      boxShadow: {
        'glow-violet': '0 0 20px rgba(139, 92, 246, 0.35)',
        'glow-cyan':   '0 0 20px rgba(6, 182, 212, 0.35)',
        'glow-emerald':'0 0 20px rgba(16, 185, 129, 0.35)',
        'glow-rose':   '0 0 20px rgba(244, 63, 94, 0.35)',
        'glow-amber':  '0 0 20px rgba(245, 158, 11, 0.35)',
        'glass': '0 8px 32px rgba(0, 0, 0, 0.40)',
      },
      animation: {
        'pulse-slow':   'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow':    'spin 2s linear infinite',
        'fade-in':      'fadeIn 0.4s ease-out',
        'slide-up':     'slideUp 0.4s ease-out',
        'ping-once':    'ping 0.6s cubic-bezier(0, 0, 0.2, 1) 1',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%':   { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
    },
  },
  plugins: [],
}
