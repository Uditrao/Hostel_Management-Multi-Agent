/**
 * Supabase JS client — singleton initialization
 * Uses VITE_ env vars baked in at build time.
 */
import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL  || ''
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

if (!supabaseUrl || !supabaseKey) {
  console.warn(
    '[Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env. ' +
    'Auth features will not work until these are set.'
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
