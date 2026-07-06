import 'dotenv/config'
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import xssClean from 'xss-clean'

import { startBlockchainListener } from './services/blockchainListener'
import authRoutes     from './routes/auth'
import paymentRoutes  from './routes/payments'
import webhookRoutes  from './routes/webhooks'
import portfolioRoutes from './routes/portfolio'
import supportRoutes  from './routes/support'
import adminRoutes    from './routes/admin'
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
      styleSrc:   ["'self'", "'unsafe-inline'"],
      imgSrc:     ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://api.coingecko.com'],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
}))

// ── CORS ────────────────────────────────────────────────────────────
app.use(cors({
  origin:      process.env.FRONTEND_URL ?? 'http://localhost:5000',
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
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }))

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

// ── Error handler ───────────────────────────────────────────────────
app.use(errorHandler)

// ── Blockchain listener ─────────────────────────────────────────────
startBlockchainListener()

app.listen(Number(PORT), 'localhost', () => {
  console.log(`✅  ASTRO META-TRADE API running on port ${PORT} [${process.env.NODE_ENV ?? 'development'}]`)
})

export default app
