"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
exports.notFound = notFound;
function errorHandler(err, _req, res, _next) {
    console.error('[ERROR]', err);
    const status = err.statusCode ?? err.status ?? 500;
    const message = process.env.NODE_ENV === 'production'
        ? (status < 500 ? err.message : 'Internal server error')
        : err.message;
    res.status(status).json({ error: message });
}
function notFound(_req, res) {
    res.status(404).json({ error: 'Route not found' });
}
