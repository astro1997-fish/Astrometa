/**
 * Authenticated axios instance.
 * Automatically attaches the Supabase access token to every request
 * so every backend route protected by `requireAuth` works without
 * manually threading the token through each call site.
 */
import axios from 'axios'
import { supabase } from './supabase'

const api = axios.create()

api.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`
  }
  return config
})

export default api
