"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
exports.requireAdmin = requireAdmin;
const supabase_1 = require("../lib/supabase");
/** Validates the Supabase JWT from Authorization header */
async function requireAuth(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    const { data: { user }, error } = await supabase_1.supabase.auth.getUser(token);
    if (error || !user) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
    // Fetch role from users table
    const { data: profile } = await supabase_1.supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();
    req.userId = user.id;
    req.userRole = profile?.role ?? 'user';
    // Log request to audit_logs
    await supabase_1.supabase.from('audit_logs').insert({
        user_id: user.id,
        action: `${req.method} ${req.path}`,
        metadata: JSON.stringify({ body: sanitiseBody(req.body) }),
        ip_address: req.ip,
    }).then(() => { }); // Fire and forget
    next();
}
/** Only allows users with role = 'admin' */
function requireAdmin(req, res, next) {
    if (req.userRole !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
}
/** Remove sensitive fields before logging */
function sanitiseBody(body) {
    const { password, confirmPassword, token, ...safe } = body ?? {};
    return safe;
}
