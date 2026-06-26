import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

const supabaseUrl     = process.env.SUPABASE_URL ?? ''
const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

if (!supabaseUrl || !supabaseService) {
  console.warn('⚠️  SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — Supabase client will not function until configured.')
}

export const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseService || 'placeholder', {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: ws } as any,
})
