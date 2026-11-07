import { createClient } from '@supabase/supabase-js';
import { config, requireConfig } from '../config/env.js';

/** Client acting as the signed-in user: Row Level Security applies to every query. */
export function userClient(accessToken) {
  requireConfig('supabaseUrl', 'supabaseAnonKey');
  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
