/**
 * Authenticated axios instance.
 * Automatically attaches the Supabase access token to every request
 * so every backend route protected by `requireAuth` works without
 * manually threading the token through each call site.
 */
import axios from 'axios'
import { supabase } from './supabase'

// In development Vite proxies /api → localhost:8000 so no base URL is needed.
// In production (Netlify frontend + Railway backend) set VITE_API_URL to the
// Railway service URL, e.g. https://astrometa-api-production.up.railway.app
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '',
})

api.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`
  }
  return config
})

export default api
