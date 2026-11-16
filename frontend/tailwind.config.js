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
        sans: ['Space Grotesk', 'Plus Jakarta Sans', 'Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'IBM Plex Mono', 'monospace'],
        display: ['Space Grotesk', 'sans-serif'],
      },
      colors: {
        // High contrast monochrome neutrals
        mono: {
          950: '#000000', // Pure pitch black
          900: '#0a0a0a', // Deepest charcoal
          850: '#121212', // Dark card surface
          800: '#181818', // Container panel
          750: '#222222', // Hover charcoal
          700: '#2a2a2a', // Subtle boundary
          600: '#3e3e3e', // Strong border
          500: '#666666', // Mid grey
          400: '#8c8c8c', // Muted slate text
          300: '#b4b4b4', // Secondary text
          200: '#d8d8d8', // Light grey text
          100: '#ececec', // Off-white highlight
          50:  '#f8f8f8', // Bright off-white
          white: '#ffffff', // Pure white
        },
        // Controlled precision accent: Electric Silver / Ice White with subtle minimal amber for warnings
        accent: {
          DEFAULT: '#ffffff',
          charcoal: '#161616',
          border: 'rgba(255, 255, 255, 0.15)',
          muted: 'rgba(255, 255, 255, 0.05)',
        },
      },
      boxShadow: {
        'brutalist': '3px 3px 0px 0px rgba(255, 255, 255, 0.9)',
        'brutalist-dark': '3px 3px 0px 0px rgba(0, 0, 0, 1)',
        'brutalist-grey': '3px 3px 0px 0px rgba(140, 140, 140, 0.6)',
        'hud': '0 0 0 1px rgba(255, 255, 255, 0.12)',
      },
      borderRadius: {
        'none': '0px',
        'xs': '2px',
        'sm': '3px',
        'md': '4px',
      },
    },
  },
  plugins: [],
}
