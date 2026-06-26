import type { Request, Response, NextFunction } from 'express'

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  console.error('[ERROR]', err)

  const status  = err.statusCode ?? err.status ?? 500
  const message = process.env.NODE_ENV === 'production'
    ? (status < 500 ? err.message : 'Internal server error')
    : err.message

  res.status(status).json({ error: message })
}

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: 'Route not found' })
}
