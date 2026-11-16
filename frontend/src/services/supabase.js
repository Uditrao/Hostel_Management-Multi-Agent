/**
 * Supabase JS client — singleton initialization
 * Uses VITE_ env vars baked in at build time.
 * Falls back safely if .env is missing or invalid so the app never crashes.
 */
import { createClient } from '@supabase/supabase-js'

const rawUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim()
const rawKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()

// Validate URL format before initializing createClient
function isValidUrl(str) {
  try {
    const url = new URL(str)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

const isValidConfig = isValidUrl(rawUrl) && rawKey.length > 0
const supabaseUrl = isValidConfig ? rawUrl : 'https://placeholder-project.supabase.co'
const supabaseKey = isValidConfig ? rawKey : 'placeholder-anon-key'

if (!isValidConfig) {
  console.warn(
    '[Supabase] Missing or invalid VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in frontend/.env.\n' +
    'The app is running in offline/demo interface mode.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession:     true,
    autoRefreshToken:   true,
    detectSessionInUrl: true,
    storageKey:         'hostel-auth-session',
  },
})
