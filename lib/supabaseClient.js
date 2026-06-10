import { createClient } from '@supabase/supabase-js'

const rawUrl = import.meta.env.VITE_SUPABASE_URL || ''
const rawAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

const supabaseUrl = rawUrl.trim().replace(/\/+$/, '')
const supabaseAnonKey = rawAnonKey.trim()

if (!supabaseUrl) {
  alert('Missing VITE_SUPABASE_URL. Check GitHub Secrets and redeploy.')
}

if (!supabaseAnonKey) {
  alert('Missing VITE_SUPABASE_ANON_KEY. Check GitHub Secrets and redeploy.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
