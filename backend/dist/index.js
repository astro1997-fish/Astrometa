"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Load .env file only in local development (Railway injects env vars directly)
if (process.env.NODE_ENV !== 'production') {
    require('dotenv/config');
}
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = __importDefault(require("cors"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const xss_clean_1 = __importDefault(require("xss-clean"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const blockchainListener_1 = require("./services/blockchainListener");
const btcMonitor_1 = require("./services/btcMonitor");
const auth_1 = __importDefault(require("./routes/auth"));
const payments_1 = __importDefault(require("./routes/payments"));
const webhooks_1 = __importDefault(require("./routes/webhooks"));
const portfolio_1 = __importDefault(require("./routes/portfolio"));
const support_1 = __importDefault(require("./routes/support"));
const admin_1 = __importDefault(require("./routes/admin"));
const push_1 = __importDefault(require("./routes/push"));
const errorHandler_1 = require("./middleware/errorHandler");
const app = (0, express_1.default)();
const PORT = process.env.PORT ?? 8000;
// ── Trust proxy (required for rate-limit + HTTPS redirect behind Replit) ──
app.set('trust proxy', 1);
// ── Security headers ────────────────────────────────────────────────
app.use((0, helmet_1.default)({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: [
                "'self'",
                'https://api.coingecko.com',
                'https://*.supabase.co',
                'wss://*.supabase.co',
            ],
        },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
}));
// ── CORS ────────────────────────────────────────────────────────────
// In production the frontend is served from the same origin as the API, so
// same-origin requests never hit CORS. Cross-origin callers (webhooks, a
// separate mobile app) still need the header. We use an explicit allowlist
// rather than origin:true to avoid reflecting arbitrary origins with
// credentials, which opens credentialed cross-origin reads for attackers.
const isProd = process.env.NODE_ENV === 'production';
const allowedOrigins = new Set([
    'http://localhost:5000',
    'http://localhost:8000',
    ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
    ...(process.env.PRODUCTION_URL ? [process.env.PRODUCTION_URL] : []),
]);
// Replit URLs are dynamic — allow all *.replit.dev (dev previews) and *.replit.app (production)
const REPLIT_URL_RE = /^https:\/\/.+\.replit\.(dev|app)$/;
// Cloudflare Pages preview + production URLs
const CF_PAGES_RE = /^https:\/\/.+\.pages\.dev$/;
app.use((0, cors_1.default)({
    origin: (origin, cb) => {
        // Allow requests with no Origin header (server-to-server, curl, Stripe webhooks)
        if (!origin)
            return cb(null, true);
        if (allowedOrigins.has(origin))
            return cb(null, true);
        if (REPLIT_URL_RE.test(origin))
            return cb(null, true);
        if (CF_PAGES_RE.test(origin))
            return cb(null, true);
        cb(new Error(`CORS: origin "${origin}" not allowed`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token'],
}));
// ── Stripe webhooks need raw body ───────────────────────────────────
app.use('/api/webhooks/stripe', express_1.default.raw({ type: 'application/json' }));
// ── Body parsing ────────────────────────────────────────────────────
app.use(express_1.default.json({ limit: '10kb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10kb' }));
// ── XSS sanitisation ────────────────────────────────────────────────
app.use((0, xss_clean_1.default)());
// ── Global rate limit ───────────────────────────────────────────────
const globalLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again later.' },
});
app.use(globalLimiter);
// ── Health check ────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
    const listener = (0, blockchainListener_1.getListenerStatus)();
    const ethPrice = (0, blockchainListener_1.getEthPriceStatus)();
    const status = listener.active && !listener.healthy ? 'degraded' : 'ok';
    res.status(status === 'ok' ? 200 : 503).json({
        status,
        ts: new Date().toISOString(),
        listener,
        ethPrice,
    });
});
// ── HTTPS redirect in production ────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
    app.use((req, res, next) => {
        if (req.header('x-forwarded-proto') !== 'https') {
            return res.redirect(301, `https://${req.header('host')}${req.url}`);
        }
        next();
    });
}
// ── Routes ──────────────────────────────────────────────────────────
app.use('/api/auth', auth_1.default);
app.use('/api/payments', payments_1.default);
app.use('/api/webhooks', webhooks_1.default);
app.use('/api/portfolio', portfolio_1.default);
app.use('/api/support', support_1.default);
app.use('/api/admin', admin_1.default);
app.use('/api/push', push_1.default);
// ── Static frontend (production only) ───────────────────────────────
// Must come BEFORE errorHandler so errors from static/sendFile are caught.
// The SPA fallback is scoped to non-/api paths so unknown API routes
// return JSON 404 from the error handler, not index.html.
if (isProd) {
    const distDir = path_1.default.resolve(__dirname, '../../frontend/dist');
    if (fs_1.default.existsSync(distDir)) {
        app.use(express_1.default.static(distDir));
        // SPA fallback — only for non-API GET requests
        app.get(/^(?!\/api).*$/, (_req, res) => {
            res.sendFile(path_1.default.join(distDir, 'index.html'));
        });
        console.log(`[Static] Serving frontend from ${distDir}`);
    }
    else {
        console.warn('[Static] frontend/dist not found — run "npm run build" in frontend/');
    }
}
// ── Error handler (must be last) ────────────────────────────────────
app.use(errorHandler_1.errorHandler);
// ── Blockchain listeners ────────────────────────────────────────────
// startBlockchainListener is async (seeds ETH price cache from DB first).
// We intentionally do not await it here so the HTTP server starts immediately;
// the listener and retry loop attach themselves once the seed completes.
(0, blockchainListener_1.startBlockchainListener)().catch((err) => console.error('[Blockchain] Failed to start listener:', err));
(0, btcMonitor_1.startBtcMonitor)();
// Listen on 0.0.0.0 so Replit deployment (and Docker) can reach the port
app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`✅  ASTRO META-TRADE API running on port ${PORT} [${process.env.NODE_ENV ?? 'development'}]`);
});
exports.default = app;
