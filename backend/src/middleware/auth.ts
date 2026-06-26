import type { Request, Response, NextFunction } from 'express'
import { supabase } from '../lib/supabase'

export interface AuthRequest extends Request {
  userId?:  string
  userRole?: string
}

/** Validates the Supabase JWT from Authorization header */
export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' })
  }

  const { data: { user }, error } = await supabase.auth.getUser(token)

  if (error || !user) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  // Fetch role from users table
  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  req.userId   = user.id
  req.userRole = profile?.role ?? 'user'

  // Log request to audit_logs
  await supabase.from('audit_logs').insert({
    user_id:    user.id,
    action:     `${req.method} ${req.path}`,
    metadata:   JSON.stringify({ body: sanitiseBody(req.body) }),
    ip_address: req.ip,
  }).then(() => {}) // Fire and forget

  next()
}

/** Only allows users with role = 'admin' */
export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' })
  }
  next()
}

/** Remove sensitive fields before logging */
function sanitiseBody(body: Record<string, unknown>) {
  const { password, confirmPassword, token, ...safe } = body ?? {}
  return safe
}
