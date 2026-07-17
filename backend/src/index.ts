// Load .env file only in local development (Railway injects env vars directly)
if (process.env.NODE_ENV !== 'production') {
  require('dotenv/config')
}
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import xssClean from 'xss-clean'
import path from 'path'
import fs from 'fs'

import { startBlockchainListener, getListenerStatus, getEthPriceStatus } from './services/blockchainListener'
import { startBtcMonitor }         from './services/btcMonitor'
import authRoutes     from './routes/auth'
import paymentRoutes  from './routes/payments'
import webhookRoutes  from './routes/webhooks'
import portfolioRoutes from './routes/portfolio'
import supportRoutes  from './routes/support'
import adminRoutes    from './routes/admin'
import pushRoutes     from './routes/push'
import { errorHandler } from './middleware/errorHandler'

const app  = express()
const PORT = process.env.PORT ?? 8000

// ── Trust proxy (required for rate-limit + HTTPS redirect behind Replit) ──
app.set('trust proxy', 1)

// ── Security headers ────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:    ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc:     ["'self'", 'data:', 'https:'],
      connectSrc: [
        "'self'",
        'https://api.coingecko.com',
        'https://*.supabase.co',
        'wss://*.supabase.co',
      ],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
}))

// ── CORS ────────────────────────────────────────────────────────────
// In production the frontend is served from the same origin as the API, so
// same-origin requests never hit CORS. Cross-origin callers (webhooks, a
// separate mobile app) still need the header. We use an explicit allowlist
// rather than origin:true to avoid reflecting arbitrary origins with
// credentials, which opens credentialed cross-origin reads for attackers.
const isProd = process.env.NODE_ENV === 'production'

const allowedOrigins = new Set<string>([
  'http://localhost:5000',
  'http://localhost:8000',
  ...(process.env.FRONTEND_URL   ? [process.env.FRONTEND_URL]   : []),
  ...(process.env.PRODUCTION_URL ? [process.env.PRODUCTION_URL] : []),
])

// Replit URLs are dynamic — allow all *.replit.dev (dev previews) and *.replit.app (production)
const REPLIT_URL_RE  = /^https:\/\/.+\.replit\.(dev|app)$/
// Cloudflare Pages preview + production URLs
const CF_PAGES_RE    = /^https:\/\/.+\.pages\.dev$/

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no Origin header (server-to-server, curl, Stripe webhooks)
    if (!origin) return cb(null, true)
    if (allowedOrigins.has(origin)) return cb(null, true)
    if (REPLIT_URL_RE.test(origin))  return cb(null, true)
    if (CF_PAGES_RE.test(origin))    return cb(null, true)
    cb(new Error(`CORS: origin "${origin}" not allowed`))
  },
  credentials: true,
  methods:     ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token'],
}))

// ── Stripe webhooks need raw body ───────────────────────────────────
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }))

// ── Body parsing ────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }))
app.use(express.urlencoded({ extended: true, limit: '10kb' }))

// ── XSS sanitisation ────────────────────────────────────────────────
app.use(xssClean())

// ── Global rate limit ───────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      100,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Too many requests. Please try again later.' },
})
app.use(globalLimiter)

// ── Health check ────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  const listener  = getListenerStatus()
  const ethPrice  = getEthPriceStatus()
  const status    = listener.active && !listener.healthy ? 'degraded' : 'ok'
  res.status(status === 'ok' ? 200 : 503).json({
    status,
    ts:       new Date().toISOString(),
    listener,
    ethPrice,
  })
})

// ── HTTPS redirect in production ────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      return res.redirect(301, `https://${req.header('host')}${req.url}`)
    }
    next()
  })
}

// ── Routes ──────────────────────────────────────────────────────────
app.use('/api/auth',      authRoutes)
app.use('/api/payments',  paymentRoutes)
app.use('/api/webhooks',  webhookRoutes)
app.use('/api/portfolio', portfolioRoutes)
app.use('/api/support',   supportRoutes)
app.use('/api/admin',     adminRoutes)
app.use('/api/push',      pushRoutes)

// ── Static frontend (production only) ───────────────────────────────
// Must come BEFORE errorHandler so errors from static/sendFile are caught.
// The SPA fallback is scoped to non-/api paths so unknown API routes
// return JSON 404 from the error handler, not index.html.
if (isProd) {
  const distDir = path.resolve(__dirname, '../../frontend/dist')
  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir))
    // SPA fallback — only for non-API GET requests
    app.get(/^(?!\/api).*$/, (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'))
    })
    console.log(`[Static] Serving frontend from ${distDir}`)
  } else {
    console.warn('[Static] frontend/dist not found — run "npm run build" in frontend/')
  }
}

// ── Error handler (must be last) ────────────────────────────────────
app.use(errorHandler)

// ── Blockchain listeners ────────────────────────────────────────────
// startBlockchainListener is async (seeds ETH price cache from DB first).
// We intentionally do not await it here so the HTTP server starts immediately;
// the listener and retry loop attach themselves once the seed completes.
startBlockchainListener().catch((err) =>
  console.error('[Blockchain] Failed to start listener:', err),
)
startBtcMonitor()

// Listen on 0.0.0.0 so Replit deployment (and Docker) can reach the port
app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`✅  ASTRO META-TRADE API running on port ${PORT} [${process.env.NODE_ENV ?? 'development'}]`)
})

export default app
