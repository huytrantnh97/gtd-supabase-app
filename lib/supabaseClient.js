import { createClient } from '@supabase/supabase-js'

const rawUrl = import.meta.env.VITE_SUPABASE_URL || ''
const rawAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

const supabaseUrl = rawUrl.trim().replace(/\/+$/, '')
const supabaseAnonKey = rawAnonKey.trim()

const isValidSupabaseUrl =
  /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(supabaseUrl)

if (!supabaseUrl) {
  alert('Missing VITE_SUPABASE_URL. Check GitHub Secrets and redeploy.')
}

if (!supabaseAnonKey) {
  alert('Missing VITE_SUPABASE_ANON_KEY. Check GitHub Secrets and redeploy.')
}

if (supabaseUrl && !isValidSupabaseUrl) {
  alert(
    `Invalid VITE_SUPABASE_URL:\n\n${supabaseUrl}\n\nIt must look like:\nhttps://your-project-ref.supabase.co`
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
