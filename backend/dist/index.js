"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = __importDefault(require("cors"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const xss_clean_1 = __importDefault(require("xss-clean"));
const auth_1 = __importDefault(require("./routes/auth"));
const payments_1 = __importDefault(require("./routes/payments"));
const webhooks_1 = __importDefault(require("./routes/webhooks"));
const portfolio_1 = __importDefault(require("./routes/portfolio"));
const support_1 = __importDefault(require("./routes/support"));
const admin_1 = __importDefault(require("./routes/admin"));
const errorHandler_1 = require("./middleware/errorHandler");
const app = (0, express_1.default)();
const PORT = process.env.PORT ?? 8000;
// ── Security headers ────────────────────────────────────────────────
app.use((0, helmet_1.default)({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'", 'https://api.coingecko.com'],
        },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
}));
// ── CORS ────────────────────────────────────────────────────────────
app.use((0, cors_1.default)({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5000',
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
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));
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
// ── Error handler ───────────────────────────────────────────────────
app.use(errorHandler_1.errorHandler);
app.listen(Number(PORT), 'localhost', () => {
    console.log(`✅  ASTRO META-TRADE API running on port ${PORT} [${process.env.NODE_ENV ?? 'development'}]`);
});
exports.default = app;
