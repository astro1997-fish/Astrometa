import { createClient } from '@supabase/supabase-js'

const supabaseUrl     = process.env.SUPABASE_URL!
const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseService) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars')
}

// Service-role client — bypasses RLS, only use server-side
export const supabase = createClient(supabaseUrl, supabaseService, {
  auth: { autoRefreshToken: false, persistSession: false },
})
